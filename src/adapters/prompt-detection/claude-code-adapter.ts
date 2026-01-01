/**
 * ClaudeCodeAdapter - Prompt detection for Claude Code
 *
 * Detects prompts via Claude Code's UserPromptSubmit hook.
 * The hook writes prompt data to temp files which this adapter watches.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  PromptSourceAdapter,
  PromptSource,
  DetectedPrompt,
  AdapterStatus,
  PromptDetectedCallback,
  AdapterStatusCallback,
  KNOWN_SOURCES,
  generatePromptId,
} from './types';
import { safeJSONParse } from '../../core/utils/safe-json';
import { HookFileProcessor } from '../hooks';
import { NodeSyncFileSystem } from '../readers';
import { shouldIgnorePath } from './ignore-paths';

/**
 * Data format written by the Claude Code hook script
 */
interface ClaudeCodeHookData {
  id: string;
  timestamp: string;
  prompt: string;
  source: string;
  sessionId?: string;
  transcriptPath?: string;
  cwd?: string;
  hookEventName?: string;
  workspaceRoots?: string[];
  attachments?: Array<{ type: string; filePath: string }>;
}

export class ClaudeCodeAdapter implements PromptSourceAdapter {
  readonly source: PromptSource = KNOWN_SOURCES.claude_code;

  private hookDir: string;
  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private fileProcessor: HookFileProcessor<ClaudeCodeHookData>;
  private promptsDetectedCount = 0;
  private isInitialized = false;
  private isWatchingActive = false;
  private lastError?: string;

  private promptCallback?: PromptDetectedCallback;
  private statusCallback?: AdapterStatusCallback;

  private readonly pollIntervalMs = 500;

  constructor() {
    this.hookDir = path.join(os.tmpdir(), 'devark-hooks');
    this.fileProcessor = new HookFileProcessor(new NodeSyncFileSystem(), {
      hookDir: this.hookDir,
      filePrefix: 'claude-prompt-',
      fileSuffix: '.json',
      skipFiles: ['latest-claude-prompt.json'],
      logContext: 'ClaudeCodeAdapter',
    });
  }

  async initialize(): Promise<boolean> {
    try {
      this.fileProcessor.ensureHookDir();

      const hooksConfigured = await this.checkHooksConfigured();
      if (!hooksConfigured) {
        console.log('[ClaudeCodeAdapter] Claude Code hooks not configured');
        this.lastError = 'Claude Code hooks not installed';
      }

      this.isInitialized = true;
      console.log('[ClaudeCodeAdapter] Initialized successfully');
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ClaudeCodeAdapter] Initialization failed:', error);
      return false;
    }
  }

  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isWatchingActive) {
      console.log('[ClaudeCodeAdapter] Already watching');
      return;
    }

    console.log('[ClaudeCodeAdapter] Starting prompt detection...');

    // Set up file watcher for new prompt files
    try {
      const watchPattern = new vscode.RelativePattern(
        vscode.Uri.file(this.hookDir),
        'claude-prompt-*.json'
      );

      this.fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);
      this.fileWatcher.onDidCreate((uri) => {
        this.handleNewPromptFile(uri.fsPath);
      });

      console.log('[ClaudeCodeAdapter] File watcher active for:', this.hookDir);
    } catch (error) {
      console.warn('[ClaudeCodeAdapter] File watcher failed, using polling only:', error);
    }

    // Polling as backup (file watcher may not work on all systems)
    this.pollTimer = setInterval(() => {
      this.pollForNewFiles();
    }, this.pollIntervalMs);

    this.isWatchingActive = true;
    this.notifyStatusChange();
  }

  stop(): void {
    if (!this.isWatchingActive) {
      return;
    }

    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.isWatchingActive = false;
    console.log('[ClaudeCodeAdapter] Stopped');
    this.notifyStatusChange();
  }

  async isAvailable(): Promise<boolean> {
    return this.checkHooksConfigured();
  }

  getStatus(): AdapterStatus {
    return {
      isReady: this.isInitialized,
      isAvailable: this.isInitialized && !this.lastError,
      isWatching: this.isWatchingActive,
      promptsDetected: this.promptsDetectedCount,
      lastError: this.lastError,
      info: this.isWatchingActive ? 'Watching for Claude Code prompts' : undefined,
    };
  }

  dispose(): void {
    this.stop();
    this.fileProcessor.clearProcessedIds();
    this.promptCallback = undefined;
    this.statusCallback = undefined;
  }

  onPromptDetected(callback: PromptDetectedCallback): void {
    this.promptCallback = callback;
  }

  onStatusChanged(callback: AdapterStatusCallback): void {
    this.statusCallback = callback;
  }

  /**
   * Check if Claude Code hooks are configured in settings
   */
  private async checkHooksConfigured(): Promise<boolean> {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

    try {
      if (!fs.existsSync(settingsPath)) {
        return false;
      }

      const content = fs.readFileSync(settingsPath, 'utf8');

      // Use safe JSON parsing with recovery for potentially corrupted config
      const parseResult = safeJSONParse<{ hooks?: { UserPromptSubmit?: Array<{ hooks?: Array<{ command?: string }> }> } }>(
        content,
        {
          attemptRecovery: true,
          logErrors: false, // Don't log errors for this check - it's expected to fail sometimes
          context: 'ClaudeCodeAdapter:settings.json',
        }
      );

      if (!parseResult.success || !parseResult.data) {
        return false;
      }

      const config = parseResult.data;

      if (!config.hooks?.UserPromptSubmit) {
        return false;
      }

      // Check if our hook is configured
      const hasVibeLogHook = config.hooks.UserPromptSubmit.some(
        (h: { hooks?: Array<{ command?: string }> }) =>
          h.hooks?.some((cmd) => {
            const command = cmd.command;
            if (!command) return false;
            const normalized = command.toLowerCase().replace(/\\/g, '/');
            return (
              normalized.includes('devark-sync') ||
              normalized.includes('devark-sync.js') ||
              normalized.includes('claude-hooks/user-prompt-submit.js') ||
              normalized.includes('bin/devark-sync.js') ||
              normalized.includes('vibe-log')
            );
          })
      );

      return hasVibeLogHook;
    } catch {
      return false;
    }
  }

  private pollForNewFiles(): void {
    const files = this.fileProcessor.listMatchingFiles();
    for (const filePath of files) {
      this.handleNewPromptFile(filePath);
    }
  }

  private async handleNewPromptFile(filePath: string): Promise<void> {
    const filename = this.fileProcessor.getBasename(filePath);

    if (this.fileProcessor.shouldSkip(filename)) {
      return;
    }

    if (this.fileProcessor.wasProcessed(filename)) {
      return;
    }
    this.fileProcessor.markProcessed(filename);

    const content = this.fileProcessor.readFile(filePath);
    if (!content) {
      return;
    }

    const hookData = this.fileProcessor.parseData(content, filename, ['prompt']);
    if (!hookData) {
      this.fileProcessor.deleteFile(filePath);
      return;
    }

    this.fileProcessor.deleteFile(filePath);

    const projectPath = hookData.cwd || hookData.workspaceRoots?.[0];
    console.log('[ClaudeCodeAdapter] Hook data - cwd:', hookData.cwd, ', workspaceRoots:', hookData.workspaceRoots, ', projectPath:', projectPath);

    if (shouldIgnorePath(projectPath)) {
      console.log('[ClaudeCodeAdapter] Ignoring prompt from temp/internal folder:', projectPath);
      return;
    }

    const prompt = this.convertToDetectedPrompt(hookData);
    console.log(`[ClaudeCodeAdapter] Detected prompt: ${prompt.text.substring(0, 50)}...`);
    this.promptsDetectedCount++;

    this.fileProcessor.markProcessed(prompt.id);

    if (this.promptCallback) {
      this.promptCallback(prompt);
    }

    this.notifyStatusChange();
  }

  /**
   * Convert hook data to DetectedPrompt
   */
  private convertToDetectedPrompt(hookData: ClaudeCodeHookData): DetectedPrompt {
    const projectPath = hookData.cwd || hookData.workspaceRoots?.[0];

    return {
      id: hookData.id || generatePromptId('claude_code'),
      text: hookData.prompt || '',
      timestamp: new Date(hookData.timestamp || Date.now()),
      source: this.source,
      context: {
        projectPath,
        projectName: projectPath ? path.basename(projectPath) : undefined,
        sourceSessionId: hookData.sessionId,
        files: hookData.attachments
          ?.filter((a) => a.type === 'file')
          .map((a) => a.filePath),
        metadata: {
          transcriptPath: hookData.transcriptPath,
          hookEventName: hookData.hookEventName,
        },
      },
    };
  }


  /**
   * Notify status change callback
   */
  private notifyStatusChange(): void {
    if (this.statusCallback) {
      this.statusCallback(this.getStatus());
    }
  }
}
