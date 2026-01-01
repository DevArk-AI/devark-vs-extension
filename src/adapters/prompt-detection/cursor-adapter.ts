/**
 * CursorAdapter - Prompt detection for Cursor IDE
 *
 * Detects prompts by polling Cursor's SQLite database (state.vscdb).
 * Tracks new messages by comparing message IDs.
 */

import * as vscode from 'vscode';
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
import type { CursorSessionReader } from '../../cursor-integration/session-reader';
import type { MessageData, CursorSession } from '../../cursor-integration/types';
import { ExtensionState } from '../../extension-state';
import { HookFileProcessor } from '../hooks';
import { NodeSyncFileSystem } from '../readers';
import { shouldIgnorePath } from './ignore-paths';


/**
 * Default polling interval (ms)
 */
const DEFAULT_POLL_INTERVAL = 2000;

interface CursorHookData {
  id?: string;
  prompt?: string;
  timestamp?: string;
  workspaceRoots?: string[];
  conversationId?: string;
  attachments?: Array<{ type: string; filePath: string }>;
  model?: string;
  cursorVersion?: string;
}

export class CursorAdapter implements PromptSourceAdapter {
  readonly source: PromptSource = KNOWN_SOURCES.cursor;

  private reader: CursorSessionReader;
  private pollTimer: NodeJS.Timeout | null = null;
  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private hookDir: string;
  private hookProcessor: HookFileProcessor<CursorHookData>;

  // Track seen message IDs per session to detect new prompts (for DB polling)
  private seenMessageIds: Map<string, Set<string>> = new Map();

  private promptsDetectedCount = 0;
  private isInitialized = false;
  private isWatchingActive = false;
  private lastError?: string;

  private promptCallback?: PromptDetectedCallback;
  private statusCallback?: AdapterStatusCallback;

  private pollIntervalMs = DEFAULT_POLL_INTERVAL;

  constructor(pollIntervalMs?: number) {
    this.reader = ExtensionState.getCursorSessionReader();
    this.hookDir = path.join(os.tmpdir(), 'devark-hooks');
    this.hookProcessor = new HookFileProcessor(new NodeSyncFileSystem(), {
      hookDir: this.hookDir,
      filePrefix: 'prompt-',
      fileSuffix: '.json',
      skipFiles: ['latest-prompt.json'],
      logContext: 'CursorAdapter',
    });
    if (pollIntervalMs) {
      this.pollIntervalMs = pollIntervalMs;
    }
  }

  async initialize(): Promise<boolean> {
    try {
      const success = await this.reader.initialize();
      if (!success) {
        this.lastError = 'Cursor database not found';
        console.warn('[CursorAdapter] Failed to initialize: Cursor database not found');
        return false;
      }

      this.hookProcessor.ensureHookDir();

      this.isInitialized = true;
      console.log('[CursorAdapter] Initialized successfully');
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      console.error('[CursorAdapter] Initialization failed:', error);
      return false;
    }
  }

  async start(): Promise<void> {
    if (!this.isInitialized) {
      const success = await this.initialize();
      if (!success) {
        throw new Error('Failed to initialize CursorAdapter');
      }
    }

    if (this.isWatchingActive) {
      console.log('[CursorAdapter] Already watching');
      return;
    }

    console.log('[CursorAdapter] Starting prompt detection...');

    // Initialize seen message IDs from current state
    await this.initializeSeenMessages();

    // Start database polling
    this.pollTimer = setInterval(() => {
      this.pollDatabaseForNewPrompts();
    }, this.pollIntervalMs);

    // Also watch for hook-based Cursor prompts (prompt-*.json files)
    try {
      const watchPattern = new vscode.RelativePattern(
        vscode.Uri.file(this.hookDir),
        'prompt-*.json'
      );

      this.fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);
      this.fileWatcher.onDidCreate((uri) => {
        this.handleHookFile(uri.fsPath);
      });

      console.log('[CursorAdapter] Hook file watcher active');
    } catch (error) {
      console.warn('[CursorAdapter] Hook file watcher failed:', error);
    }

    this.isWatchingActive = true;
    console.log(`[CursorAdapter] Started - polling every ${this.pollIntervalMs}ms`);
    this.notifyStatusChange();
  }

  stop(): void {
    if (!this.isWatchingActive) {
      return;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = null;
    }

    this.isWatchingActive = false;
    console.log('[CursorAdapter] Stopped');
    this.notifyStatusChange();
  }

  async isAvailable(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }
    // Try to initialize to check availability
    return this.initialize();
  }

  getStatus(): AdapterStatus {
    return {
      isReady: this.isInitialized,
      isAvailable: this.isInitialized && !this.lastError,
      isWatching: this.isWatchingActive,
      promptsDetected: this.promptsDetectedCount,
      lastError: this.lastError,
      info: this.isWatchingActive ? 'Polling Cursor database' : undefined,
    };
  }

  dispose(): void {
    this.stop();
    this.reader.dispose();
    this.seenMessageIds.clear();
    this.hookProcessor.clearProcessedIds();
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
   * Initialize seen message IDs from current database state
   * This prevents detecting old prompts as new on startup
   */
  private async initializeSeenMessages(): Promise<void> {
    try {
      const sessions = this.reader.getActiveSessions();

      for (const session of sessions) {
        const messages = this.reader.getAllMessagesForSession(session.sessionId);
        const userMessages = messages.filter((m) => m.role === 'user');

        const messageIds = new Set(userMessages.map((m) => m.id));
        this.seenMessageIds.set(session.sessionId, messageIds);
      }

      console.log(`[CursorAdapter] Initialized with ${this.seenMessageIds.size} sessions`);
    } catch (error) {
      console.error('[CursorAdapter] Failed to initialize seen messages:', error);
    }
  }

  /**
   * Poll database for new prompts
   */
  private async pollDatabaseForNewPrompts(): Promise<void> {
    try {
      const sessions = this.reader.getActiveSessions();

      for (const session of sessions) {
        const newPrompts = this.detectNewPromptsInSession(session);

        for (const prompt of newPrompts) {
          this.promptsDetectedCount++;

          if (this.promptCallback) {
            this.promptCallback(prompt);
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      // Handle database lock errors gracefully
      if (errorMsg.includes('SQLITE_BUSY') || errorMsg.includes('database is locked')) {
        // This is normal during Cursor operations - silently skip
        return;
      }

      console.error('[CursorAdapter] Polling error:', error);
      this.lastError = errorMsg;
    }
  }

  /**
   * Detect new prompts in a session by comparing message IDs
   */
  private detectNewPromptsInSession(session: CursorSession): DetectedPrompt[] {
    const newPrompts: DetectedPrompt[] = [];

    const messages = this.reader.getAllMessagesForSession(session.sessionId);
    const userMessages = messages.filter((m: MessageData) => m.role === 'user');

    // Get or create seen set for this session
    let seenIds = this.seenMessageIds.get(session.sessionId);
    if (!seenIds) {
      seenIds = new Set<string>();
      this.seenMessageIds.set(session.sessionId, seenIds);
    }

    // Find new messages
    const newMessages = userMessages.filter((m: MessageData) => !seenIds!.has(m.id));

    for (const msg of newMessages) {
      // Check if project should be ignored
      if (session.workspacePath && shouldIgnorePath(session.workspacePath)) {
        console.log('[CursorAdapter] Ignoring prompt from temp/internal folder:', session.workspacePath);
        continue;
      }

      const prompt = this.convertToDetectedPrompt(msg, session);
      newPrompts.push(prompt);

      // Mark as seen
      seenIds!.add(msg.id);
    }

    return newPrompts;
  }

  private async handleHookFile(filePath: string): Promise<void> {
    const filename = this.hookProcessor.getBasename(filePath);

    if (this.hookProcessor.shouldSkip(filename)) {
      return;
    }

    if (this.hookProcessor.wasProcessed(filename)) {
      return;
    }
    this.hookProcessor.markProcessed(filename);

    const content = this.hookProcessor.readFile(filePath);
    if (!content) {
      return;
    }

    const hookData = this.hookProcessor.parseData(content, filename, ['prompt']);
    if (!hookData) {
      this.hookProcessor.deleteFile(filePath);
      return;
    }

    this.hookProcessor.deleteFile(filePath);

    const projectPath = hookData.workspaceRoots?.[0];
    if (projectPath && shouldIgnorePath(projectPath)) {
      console.log('[CursorAdapter] Ignoring hook prompt from temp/internal folder:', projectPath);
      return;
    }

    const prompt: DetectedPrompt = {
      id: hookData.id || generatePromptId('cursor'),
      text: hookData.prompt || '',
      timestamp: new Date(hookData.timestamp || Date.now()),
      source: this.source,
      context: {
        projectPath,
        projectName: projectPath ? path.basename(projectPath) : undefined,
        sourceSessionId: hookData.conversationId,
        files: hookData.attachments
          ?.filter((a: { type: string }) => a.type === 'file')
          .map((a: { filePath: string }) => a.filePath),
        metadata: {
          model: hookData.model,
          cursorVersion: hookData.cursorVersion,
        },
      },
    };

    this.promptsDetectedCount++;

    if (this.promptCallback) {
      this.promptCallback(prompt);
    }

    this.notifyStatusChange();
  }

  /**
   * Convert message data to DetectedPrompt
   */
  private convertToDetectedPrompt(
    msg: MessageData,
    session: CursorSession
  ): DetectedPrompt {
    return {
      id: generatePromptId('cursor'),
      text: msg.content,
      timestamp: new Date(msg.timestamp),
      source: this.source,
      context: {
        projectPath: session.workspacePath,
        projectName: session.workspaceName,
        sourceSessionId: session.sessionId,
        files: session.fileContext,
        metadata: {
          messageId: msg.id,
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
