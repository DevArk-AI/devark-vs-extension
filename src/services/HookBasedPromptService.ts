/**
 * HookBasedPromptService - Detects prompts via Cursor Hooks
 *
 * This service watches for prompts captured by the beforeSubmitPrompt hook.
 * The hook writes prompt data to temp files, which this service picks up
 * and triggers analysis.
 *
 * This approach is more reliable than database polling because:
 * 1. Real-time detection - hook executes exactly when prompt is submitted
 * 2. Access to full prompt context before it's processed
 * 3. No SQLite database locking issues
 * 4. Works regardless of Cursor's internal state
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ExtensionState } from '../extension-state';
import type { CapturedResponse, ConversationState } from './types/response-types';
import { isLatestResponseFile, getSourceFromFilename } from './types/response-types';
import { getSessionManager } from './SessionManagerService';
import { gatherPromptContext } from './context-utils';
import type { KnownSourceId } from '../adapters/prompt-detection/types';
import { safeJSONParse } from '../core/utils/safe-json';
import { HookFileProcessor } from '../adapters/hooks';
import { NodeSyncFileSystem } from '../adapters/readers';
import type { SessionSource } from './UnifiedSessionService';
import { getNotificationService } from './NotificationService';

export interface CapturedPrompt {
  id: string;
  timestamp: string;
  prompt: string;
  source?: SessionSource;
  attachments: Array<{
    type: 'file' | 'rule';
    filePath: string;
  }>;
  conversationId?: string;
  generationId?: string;
  model?: string;
  cursorVersion?: string;
  workspaceRoots?: string[];
  userEmail?: string;
  // Claude Code specific fields
  sessionId?: string;
  transcriptPath?: string;
  cwd?: string;
}

export interface HookPromptServiceConfig {
  enabled: boolean;
  watchInterval: number; // ms between checks for new prompts
  autoAnalyze: boolean; // automatically analyze detected prompts
}

const DEFAULT_CONFIG: HookPromptServiceConfig = {
  enabled: true,
  watchInterval: 5000, // Fallback polling every 5s (hooks notify via command for instant detection)
  autoAnalyze: true,
};

// Enable debug logging (set to true for verbose logs)
const DEBUG_HOOK_SERVICE = false;

/**
 * Event types emitted by HookBasedPromptService
 */
export type HookServiceEvent = 'responseDetected' | 'finalResponseDetected' | 'newPromptsDetected' | 'promptAnalyzing' | 'analysisComplete' | 'analysisFailed';

/**
 * Event listener callback type
 */
export type HookServiceEventListener<T = unknown> = (data: T) => void;

export class HookBasedPromptService {
  private config: HookPromptServiceConfig;
  private watchTimer: NodeJS.Timeout | null = null;
  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private responseWatcher: vscode.FileSystemWatcher | null = null;
  private isWatching = false;
  private promptProcessor: HookFileProcessor<CapturedPrompt>;
  private responseProcessor: HookFileProcessor<CapturedResponse>;
  private messageHandler: any | null = null;
  private eventListeners: Map<HookServiceEvent, Set<HookServiceEventListener>> = new Map();

  // Prompt tracking for response linking (Workstream D: Coaching)
  private lastPromptMap = new Map<string, CapturedPrompt>();
  private readonly PROMPT_MAP_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Track conversation state for aggregating final coaching data
   * Key: 'cursor:{conversationId}' or 'claude:{sessionId}'
   */
  private conversationStateMap: Map<string, {
    prompts: CapturedPrompt[];
    responses: CapturedResponse[];
    startTime?: Date;
  }> = new Map();

  /** TTL for conversation state (30 minutes) */
  private readonly CONVERSATION_STATE_TTL = 30 * 60 * 1000;

  private readonly hookDir: string;

  constructor(config: Partial<HookPromptServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.hookDir = path.join(os.tmpdir(), 'devark-hooks');

    const syncFs = new NodeSyncFileSystem();
    this.promptProcessor = new HookFileProcessor(syncFs, {
      hookDir: this.hookDir,
      filePrefix: 'prompt-',
      fileSuffix: '.json',
      additionalPrefixes: ['claude-prompt-'],
      skipFiles: ['latest-prompt.json', 'latest-claude-prompt.json'],
      logContext: 'HookPromptService:prompt',
    });
    this.responseProcessor = new HookFileProcessor(syncFs, {
      hookDir: this.hookDir,
      filePrefix: 'cursor-response-',
      fileSuffix: '.json',
      additionalPrefixes: ['claude-response-'],
      skipFiles: ['latest-response.json'],
      logContext: 'HookPromptService:response',
    });

    if (DEBUG_HOOK_SERVICE) {
      console.log('[HookBasedPromptService] Service created');
      console.log('[HookBasedPromptService] Hook directory:', this.hookDir);
    }
  }

  /**
   * Set the message handler for sending updates to webview
   */
  setMessageHandler(handler: any): void {
    this.messageHandler = handler;
    console.log('[HookBasedPromptService] Message handler registered');
  }

  /**
   * Add event listener for service events
   */
  on<T = unknown>(event: HookServiceEvent, listener: HookServiceEventListener<T>): this {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener as HookServiceEventListener);
    return this;
  }

  /**
   * Remove event listener
   */
  off(event: HookServiceEvent, listener: HookServiceEventListener): this {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
    return this;
  }

  /**
   * Emit event to all listeners
   */
  private emit<T>(event: HookServiceEvent, data: T): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch (error) {
          console.error(`[HookBasedPromptService] Error in ${event} listener:`, error);
        }
      }
    }
  }

  // ========================================
  // Prompt-Response Linking (Workstream D)
  // ========================================

  /**
   * Get the linking key for a prompt (used to match with responses)
   * Cursor: use conversationId (generationId changes per response)
   * Claude Code: use sessionId
   */
  private getPromptLinkKey(prompt: CapturedPrompt): string | null {
    if (prompt.source === 'cursor') {
      return prompt.conversationId ? `cursor:${prompt.conversationId}` : null;
    } else {
      return prompt.sessionId ? `claude:${prompt.sessionId}` : null;
    }
  }

  /**
   * Get the linking key for a response (used to find matching prompt)
   */
  private getResponseLinkKey(response: CapturedResponse): string | null {
    if (response.source === 'cursor') {
      return response.conversationId ? `cursor:${response.conversationId}` : null;
    } else {
      return response.sessionId ? `claude:${response.sessionId}` : null;
    }
  }

  /**
   * Clean up old entries from the prompt map (older than TTL)
   */
  private cleanupPromptMap(): void {
    const now = Date.now();
    for (const [key, prompt] of this.lastPromptMap.entries()) {
      const promptTime = new Date(prompt.timestamp).getTime();
      if (now - promptTime > this.PROMPT_MAP_TTL) {
        this.lastPromptMap.delete(key);
      }
    }
  }

  /**
   * Clean up old conversation state entries (> 30 minutes)
   */
  private cleanupConversationStateMap(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, state] of this.conversationStateMap.entries()) {
      if (state.startTime && now - state.startTime.getTime() > this.CONVERSATION_STATE_TTL) {
        toDelete.push(key);
      }
    }

    toDelete.forEach(key => this.conversationStateMap.delete(key));

    if (toDelete.length > 0) {
      console.log(`[HookBasedPromptService] Cleaned up ${toDelete.length} old conversation states`);
    }
  }

  /**
   * Build aggregated conversation state from tracked prompts/responses
   * Called when stop hook fires
   */
  private buildConversationState(finalResponse: CapturedResponse): ConversationState | null {
    const conversationId = finalResponse.conversationId;
    if (!conversationId) {
      return null;
    }

    const linkKey = `cursor:${conversationId}`;
    const state = this.conversationStateMap.get(linkKey);

    if (!state) {
      console.log(`[HookBasedPromptService] No conversation state found for: ${conversationId}`);
      // Return minimal state from just the final response
      return {
        conversationId,
        endTime: finalResponse.timestamp,
        totalPrompts: 0,
        totalResponses: 0,
        stopReason: finalResponse.stopReason || 'completed',
        loopCount: finalResponse.loopCount || 0,
        filesModified: [],
        toolsUsed: [],
      };
    }

    const endTime = new Date(finalResponse.timestamp);
    const durationMs = state.startTime
      ? endTime.getTime() - state.startTime.getTime()
      : undefined;

    // Aggregate files modified across all responses
    const filesModified = new Set<string>();
    state.responses.forEach(r => {
      r.filesModified?.forEach(f => filesModified.add(f));
    });

    // Aggregate tools used across all responses
    const toolsUsed = new Set<string>();
    state.responses.forEach(r => {
      r.toolCalls?.forEach(tc => toolsUsed.add(tc.name));
    });

    return {
      conversationId,
      startTime: state.startTime?.toISOString(),
      endTime: endTime.toISOString(),
      durationMs,
      totalPrompts: state.prompts.length,
      totalResponses: state.responses.length,
      stopReason: finalResponse.stopReason || 'completed',
      loopCount: finalResponse.loopCount || 0,
      filesModified: Array.from(filesModified),
      toolsUsed: Array.from(toolsUsed),
    };
  }

  async initialize(): Promise<boolean> {
    try {
      this.promptProcessor.ensureHookDir();

      const hooksInstalled = await this.checkHooksInstalled();
      if (!hooksInstalled) {
        console.log('[HookBasedPromptService] Cursor hooks not installed. Use "Install Cursor Hooks" command.');
        this.notifyWebview('hookStatus', {
          installed: false,
          message: 'Cursor hooks not installed. Click to install.',
        });
      } else {
        console.log('[HookBasedPromptService] Cursor hooks are installed');
        this.notifyWebview('hookStatus', {
          installed: true,
          message: 'Ready to capture prompts',
        });
      }

      return true;
    } catch (error) {
      console.error('[HookBasedPromptService] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Start watching for prompts and responses from hooks
   */
  async start(): Promise<void> {
    if (this.isWatching) {
      console.log('[HookBasedPromptService] Already watching');
      return;
    }

    console.log('[HookBasedPromptService] Starting hook-based prompt and response detection...');
    console.log('[HookBasedPromptService] Hook directory:', this.hookDir);
    console.log('[HookBasedPromptService] Hook directory exists:', fs.existsSync(this.hookDir));

    // List existing files in hook directory for debugging
    if (fs.existsSync(this.hookDir)) {
      try {
        const files = fs.readdirSync(this.hookDir);
        console.log('[HookBasedPromptService] Existing files in hook dir:', files.length > 0 ? files.join(', ') : 'none');
      } catch (e) {
        console.log('[HookBasedPromptService] Could not list hook dir:', e);
      }
    }

    // Set up file watcher for prompt files
    // Watch for both Cursor prompts (prompt-*.json) and Claude Code prompts (claude-prompt-*.json)
    try {
      const promptPattern = new vscode.RelativePattern(
        vscode.Uri.file(this.hookDir),
        '{prompt-*.json,claude-prompt-*.json}'
      );

      console.log('[HookBasedPromptService] Creating prompt file watcher for pattern:', promptPattern.pattern);
      this.fileWatcher = vscode.workspace.createFileSystemWatcher(promptPattern);

      this.fileWatcher.onDidCreate((uri) => {
        console.log('[HookBasedPromptService] FILE WATCHER: New prompt file detected:', uri.fsPath);
        this.handleNewPromptFile(uri.fsPath);
      });

      // Note: We intentionally don't handle onDidChange because:
      // 1. onDidCreate already handles new files
      // 2. After processing, we delete the file, which can trigger spurious change events
      // 3. Handling change events causes ENOENT errors when file is already deleted

      console.log('[HookBasedPromptService] Prompt file watcher active for:', this.hookDir);
    } catch (error) {
      console.warn('[HookBasedPromptService] Prompt file watcher failed, using polling:', error);
    }

    // Set up file watcher for response files
    // Watch for both Cursor responses (cursor-response-*.json, cursor-response-final-*.json) and Claude Code responses (claude-response-*.json)
    try {
      const responsePattern = new vscode.RelativePattern(
        vscode.Uri.file(this.hookDir),
        '{cursor-response-*.json,cursor-response-final-*.json,claude-response-*.json}'
      );

      console.log('[HookBasedPromptService] Creating response file watcher for pattern:', responsePattern.pattern);
      this.responseWatcher = vscode.workspace.createFileSystemWatcher(responsePattern);

      this.responseWatcher.onDidCreate((uri) => {
        console.log('[HookBasedPromptService] FILE WATCHER: New response file detected:', uri.fsPath);
        this.handleNewResponseFile(uri.fsPath);
      });

      console.log('[HookBasedPromptService] Response file watcher active for:', this.hookDir);
    } catch (error) {
      console.warn('[HookBasedPromptService] Response file watcher failed, using polling:', error);
    }

    // Also use polling as backup (file watcher may not work on all systems)
    let pollCount = 0;
    this.watchTimer = setInterval(() => {
      pollCount++;
      // Log every 50th poll only in debug mode
      if (DEBUG_HOOK_SERVICE && pollCount % 50 === 0) {
        console.log(`[HookBasedPromptService] Polling check #${pollCount}...`);
      }
      this.checkForNewPrompts();
      this.checkForNewResponses();
    }, this.config.watchInterval);

    this.isWatching = true;
    console.log('[HookBasedPromptService] Started - watching for hook-captured prompts and responses');
    console.log('[HookBasedPromptService] Polling interval:', this.config.watchInterval, 'ms');

    this.notifyWebview('autoAnalyzeStatus', {
      enabled: true,
      status: 'watching',
      message: 'Watching for prompts and responses via hooks',
    });
  }

  /**
   * Stop watching for prompts and responses
   */
  stop(): void {
    if (!this.isWatching) {
      return;
    }

    if (this.watchTimer) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
    }

    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = null;
    }

    if (this.responseWatcher) {
      this.responseWatcher.dispose();
      this.responseWatcher = null;
    }

    this.isWatching = false;
    console.log('[HookBasedPromptService] Stopped');

    this.notifyWebview('autoAnalyzeStatus', {
      enabled: false,
      status: 'stopped',
      message: 'Hook-based detection stopped',
    });
  }

  private checkForNewPrompts(): void {
    const files = this.promptProcessor.listMatchingFiles();
    if (files.length > 0 && DEBUG_HOOK_SERVICE) {
      console.log(`[HookBasedPromptService] POLLING: Found ${files.length} prompt files`);
    }
    for (const filePath of files) {
      this.handleNewPromptFile(filePath);
    }
  }

  private async handleNewPromptFile(filePath: string): Promise<void> {
    const filename = this.promptProcessor.getBasename(filePath);

    if (this.promptProcessor.shouldSkip(filename)) {
      return;
    }

    if (this.promptProcessor.wasProcessed(filename)) {
      return;
    }
    this.promptProcessor.markProcessed(filename);

    const content = this.promptProcessor.readFile(filePath);
    if (!content) {
      return;
    }

    const prompt = this.promptProcessor.parseData(content, filename, ['id', 'prompt']);
    if (!prompt) {
      return;
    }

    // Detect source from filename if not in data
    if (!prompt.source) {
      prompt.source = filename.startsWith('claude-prompt-') ? 'claude_code' : 'cursor';
    }

    this.promptProcessor.deleteFile(filePath);

    console.log(`[HookBasedPromptService] New ${prompt.source} prompt captured:`, prompt.id);
    console.log('[HookBasedPromptService] Prompt text:', prompt.prompt.substring(0, 100) + '...');

    if (this.shouldIgnoreProject(prompt)) {
      console.log('[HookBasedPromptService] Ignoring prompt from ignored project:', prompt.cwd);
      return;
    }

    this.promptProcessor.markProcessed(prompt.id);

    // Store prompt for response linking (Workstream D: Coaching)
    const linkKey = this.getPromptLinkKey(prompt);
    console.log(`[HookBasedPromptService] Prompt link key: ${linkKey}, sessionId: ${prompt.sessionId}`);
    if (linkKey) {
      this.lastPromptMap.set(linkKey, prompt);
      this.cleanupPromptMap();
      console.log(`[HookBasedPromptService] Stored prompt for linking: ${linkKey}, id: ${prompt.id}`);

      // Track prompt in conversation state for later aggregation (stop hook)
      let state = this.conversationStateMap.get(linkKey);
      if (!state) {
        state = {
          prompts: [],
          responses: [],
          startTime: new Date(prompt.timestamp)
        };
        this.conversationStateMap.set(linkKey, state);
      }
      state.prompts.push(prompt);
      this.cleanupConversationStateMap();
    }

    // CRITICAL: Save prompt to SessionManagerService for sidebar display
    // This was the missing link - prompts were analyzed but never persisted to sessions
    await this.savePromptToSessionManager(prompt);

    // Notify webview about the new prompt
    this.notifyWebview('newPromptsDetected', {
      count: 1,
      prompts: [
        {
          id: prompt.id,
          text: prompt.prompt,
          timestamp: prompt.timestamp,
          model: prompt.model,
          workspaceRoots: prompt.workspaceRoots,
          source: prompt.source,
        },
      ],
    });

    // Auto-analyze if enabled
    if (this.config.autoAnalyze) {
      try {
        await this.analyzePrompt(prompt);
      } catch (error) {
        console.error('[HookBasedPromptService] Error analyzing prompt:', error);
      }
    }
  }

  /**
   * Analyze a captured prompt
   */
  private async analyzePrompt(prompt: CapturedPrompt): Promise<void> {
    console.log('[HookBasedPromptService] Analyzing prompt:', prompt.id);

    this.notifyWebview('promptAnalyzing', {
      promptId: prompt.id,
      text: prompt.prompt,
    });

    try {
      const llmManager = ExtensionState.getLLMManager();
      if (!llmManager) {
        throw new Error('No LLM provider configured');
      }

      // Import the analysis tools
      const { PromptScorer } = await import('../copilot/prompt-scorer');
      const { PromptEnhancer } = await import('../copilot/prompt-enhancer');

      const scorer = new PromptScorer(llmManager);
      const enhancer = new PromptEnhancer(llmManager);

      // Gather context for more targeted analysis
      const context = await gatherPromptContext(prompt.prompt, '[HookBasedPromptService]');

      // Run scoring and enhancement in PARALLEL for faster response
      // Use scorePromptV2 for full 5-dimension breakdown
      console.log('[HookBasedPromptService] Starting parallel scoring and enhancement...');
      const scorePromise = scorer.scorePromptV2(prompt.prompt, undefined, context);
      const enhancePromise = enhancer.enhancePrompt(prompt.prompt, 'medium', undefined, context);

      // Wait for score first and send it immediately to UI
      const score = await scorePromise;
      console.log('[HookBasedPromptService] Score received:', score.overall);

      // Send score to UI immediately with full breakdown - don't wait for enhancement
      this.notifyWebview('scoreReceived', {
        score: score.overall / 10, // Convert to 0-10 scale
        categoryScores: {
          clarity: score.clarity,
          specificity: score.specificity,
          context: score.context,
          actionability: score.actionability,
        },
        // V2 additions: include breakdown and explanation for immediate display
        breakdown: score.breakdown,
        explanation: score.explanation,
        // Source for "Waiting for X to respond" display
        source: prompt.source,
      });

      // Now wait for enhancement (it's been running in parallel)
      const enhanced = await enhancePromise;
      console.log('[HookBasedPromptService] Enhancement received');

      // Score the enhanced prompt
      const enhancedScore = await scorer.scorePrompt(enhanced.enhanced);

      // Create analyzed prompt object matching the format expected by CoPilotView
      // This must match the AnalyzedPrompt interface used in V2MessageHandler
      const analyzedPrompt = {
        id: prompt.id,
        text: prompt.prompt,
        truncatedText: prompt.prompt.length > 50 ? prompt.prompt.substring(0, 50) + '...' : prompt.prompt,
        score: score.overall / 10, // Convert to 0-10 scale
        timestamp: new Date(prompt.timestamp),
        categoryScores: {
          clarity: score.clarity,
          specificity: score.specificity,
          context: score.context,
          actionability: score.actionability,
        },
        quickWins: score.suggestions.slice(0, 3).map((s: string) => s.split(' ').slice(0, 3).join(' ')),
        improvedVersion: enhanced.enhanced,
        improvedScore: enhancedScore.overall / 10,
        // V2 additions for full 5-dimension scoring display
        breakdown: score.breakdown,
        explanation: score.explanation,
        // Source and sessionId for "Use this prompt" injection
        source: prompt.source, // 'cursor' or 'claude_code'
        sessionId: prompt.sessionId, // For context
      };

      // Notify webview with analysis results in the same format as V2MessageHandler
      this.notifyWebview('analysisComplete', {
        prompt: analyzedPrompt,
        analyzedToday: 0, // Will be updated from prompt history if available
      });

      // Update status bar
      const statusBarManager = ExtensionState.getStatusBarManager();
      if (statusBarManager) {
        statusBarManager.addPromptScore(analyzedPrompt.score);
      }

      // VIB-23/VIB-44: Sync score and enhanced prompt to SessionManager
      // This ensures persistence across session switches
      try {
        const sessionManager = getSessionManager();
        await sessionManager.updatePromptScore(
          prompt.id,
          score.overall / 10,
          score.breakdown,
          enhanced.enhanced,
          enhancedScore.overall / 10
        );
        console.log(`[HookBasedPromptService] Synced score to SessionManager for ${prompt.id}`);
      } catch (syncError) {
        console.warn('[HookBasedPromptService] Failed to sync score to SessionManager:', syncError);
        // Non-blocking - analysis results are still shown in UI via notifyWebview
      }

      console.log(`[HookBasedPromptService] Analysis complete for ${prompt.id} (score: ${analyzedPrompt.score})`);
    } catch (error) {
      console.error(`[HookBasedPromptService] Analysis failed for ${prompt.id}:`, error);

      this.notifyWebview('analysisFailed', {
        promptId: prompt.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private checkForNewResponses(): void {
    const files = this.responseProcessor.listMatchingFiles();
    if (files.length > 0 && DEBUG_HOOK_SERVICE) {
      console.log(`[HookBasedPromptService] POLLING: Found ${files.length} response files`);
    }
    for (const filePath of files) {
      this.handleNewResponseFile(filePath);
    }
  }

  private async handleNewResponseFile(filePath: string): Promise<void> {
    this.cleanupConversationStateMap();

    const filename = this.responseProcessor.getBasename(filePath);

    if (isLatestResponseFile(filename)) {
      return;
    }

    if (this.responseProcessor.wasProcessed(filename)) {
      return;
    }
    this.responseProcessor.markProcessed(filename);

    const content = this.responseProcessor.readFile(filePath);
    if (!content) {
      return;
    }

    const response = this.responseProcessor.parseData(content, filename, ['id']);
    if (!response) {
      return;
    }

    if (!response.source) {
      response.source = getSourceFromFilename(filename) || 'cursor';
    }

    this.responseProcessor.deleteFile(filePath);

    console.log(`[HookBasedPromptService] New ${response.source} response captured:`, response.id);
    // DIAGNOSTIC: Log detailed response info to understand multi-response patterns
    console.log('[HookBasedPromptService] Response file details', {
      filename: filename,
      responseId: response.id,
      sessionId: response.sessionId,
      conversationId: response.conversationId,
      source: response.source,
      isFinal: response.isFinal,
      promptId: response.promptId,
      reason: response.reason,
    });
    if (response.response) {
      console.log('[HookBasedPromptService] Response text:', response.response.substring(0, 100) + '...');
    }

    this.responseProcessor.markProcessed(response.id);

    // Link response to its triggering prompt (Workstream D: Coaching)
    const linkKey = this.getResponseLinkKey(response);
    console.log(`[HookBasedPromptService] Response link key: ${linkKey}, sessionId: ${response.sessionId}`);
    console.log(`[HookBasedPromptService] Prompt map size: ${this.lastPromptMap.size}, keys: [${Array.from(this.lastPromptMap.keys()).join(', ')}]`);
    // VIB-35: Log detailed map contents for debugging
    if (this.lastPromptMap.size > 0) {
      console.log('[HookBasedPromptService] Map entries:');
      for (const [key, p] of this.lastPromptMap.entries()) {
        console.log(`  - ${key}: promptId=${p.id}, sessionId=${p.sessionId}`);
      }
    }
    const linkedPrompt = linkKey ? this.lastPromptMap.get(linkKey) : null;

    if (linkedPrompt) {
      response.promptId = linkedPrompt.id;
      response.promptText = linkedPrompt.prompt;
      response.promptTimestamp = linkedPrompt.timestamp;
      console.log(`[HookBasedPromptService] Linked response to prompt: ${linkedPrompt.id}`);
    } else {
      console.log(`[HookBasedPromptService] No linked prompt found for key: ${linkKey}`);
    }

    // Track intermediate responses for conversation state aggregation
    if (linkKey && !response.isFinal) {
      const state = this.conversationStateMap.get(linkKey);
      if (state) {
        state.responses.push(response);
      }
    }

    // Emit the responseDetected event for consumers (e.g., CoachingService)
    // Pass linkedPrompt as second argument for coaching context
    const listenerCount = this.eventListeners.get('responseDetected')?.size || 0;
    console.log(`[HookBasedPromptService] Emitting responseDetected event to ${listenerCount} listeners`);
    this.emit('responseDetected', { response, linkedPrompt });

    // Store response in SessionManagerService for history/coaching context
    try {
      const sessionManager = getSessionManager();
      await sessionManager.addResponse(response, linkedPrompt?.id);
    } catch (error) {
      console.error('[HookBasedPromptService] Failed to store response in session:', error);
    }

    // Notify webview about the new response
    this.notifyWebview('responseDetected', {
      id: response.id,
      source: response.source,
      success: response.success,
      responsePreview: response.response?.substring(0, 100),
      timestamp: response.timestamp,
      toolCalls: response.toolCalls?.length || 0,
      filesModified: response.filesModified?.length || 0,
      reason: response.reason,
    });

    // Handle final response from stop hook
    if (response.isFinal) {
      console.log(`[HookBasedPromptService] Final response detected for conversation: ${response.conversationId}`);

      // Build aggregated conversation state
      const conversationState = this.buildConversationState(response);

      // Emit separate event for final responses
      this.emit('finalResponseDetected', {
        response,
        linkedPrompt,
        conversationState
      });

      // Notify webview
      this.notifyWebview('finalResponseDetected', {
        id: response.id,
        source: response.source,
        conversationId: response.conversationId,
        stopReason: response.stopReason,
        loopCount: response.loopCount,
        success: response.success,
        timestamp: response.timestamp,
        conversationState,
        linkedPromptId: linkedPrompt?.id,
        linkedPromptText: linkedPrompt?.prompt?.substring(0, 200),
      });

      // Clean up conversation state (conversation is complete)
      if (linkKey) {
        this.conversationStateMap.delete(linkKey);
      }
    }

    if (DEBUG_HOOK_SERVICE) {
      console.log(`[HookBasedPromptService] Response ${response.id} emitted to listeners and webview`);
    }
  }

  /**
   * Check if hooks are installed (Cursor or Claude Code)
   */
  private async checkHooksInstalled(): Promise<boolean> {
    const homeDir = os.homedir();
    const isVibeLogClaudeHookCommand = (command?: string): boolean => {
      if (!command) return false;
      const normalized = command.toLowerCase().replace(/\\/g, '/');
      return (
        normalized.includes('devark-sync') ||
        normalized.includes('devark-sync.js') ||
        normalized.includes('claude-hooks/user-prompt-submit.js') ||
        normalized.includes('claude-hooks/stop.js') ||
        normalized.includes('bin/devark-sync.js') ||
        normalized.includes('vibe-log')
      );
    };

    // Check Cursor hooks
    const cursorPaths = [
      path.join(homeDir, '.cursor', 'hooks.json'),
      path.join(homeDir, '.config', 'cursor', 'hooks.json'),
    ];

    // Also check current workspace for Cursor
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        cursorPaths.push(path.join(folder.uri.fsPath, '.cursor', 'hooks.json'));
      }
    }

    for (const hookPath of cursorPaths) {
      if (fs.existsSync(hookPath)) {
        try {
          const content = fs.readFileSync(hookPath, 'utf8');
          // Use safe JSON parsing - config files may be corrupted
          const parseResult = safeJSONParse<{ hooks?: { beforeSubmitPrompt?: Array<{ command?: string }> } }>(
            content,
            { attemptRecovery: true, logErrors: false }
          );

          if (parseResult.success && parseResult.data?.hooks?.beforeSubmitPrompt) {
            // Check if our hook is in the list
            const ourHook = parseResult.data.hooks.beforeSubmitPrompt.find(
              (h: { command?: string }) => h.command && h.command.includes('vibe-log')
            );
            if (ourHook) {
              return true;
            }
          }
        } catch {
          // Error reading file, continue checking other paths
        }
      }
    }

    // Check Claude Code hooks in ~/.claude/settings.json
    const claudeSettingsPath = path.join(homeDir, '.claude', 'settings.json');
    if (fs.existsSync(claudeSettingsPath)) {
      try {
        const content = fs.readFileSync(claudeSettingsPath, 'utf8');
        // Use safe JSON parsing - config files may be corrupted
        const parseResult = safeJSONParse<{
          hooks?: { UserPromptSubmit?: Array<{ hooks?: Array<{ command?: string }> }> }
        }>(content, { attemptRecovery: true, logErrors: false });

        if (parseResult.success && parseResult.data?.hooks?.UserPromptSubmit) {
          // Check if our hook is in the list (no matcher format)
          const ourHook = parseResult.data.hooks.UserPromptSubmit.find(
            (h: { hooks?: Array<{ command?: string }> }) =>
              h.hooks?.some((cmd: { command?: string }) => isVibeLogClaudeHookCommand(cmd.command))
          );
          if (ourHook) {
            return true;
          }
        }
      } catch {
        // Error reading file
      }
    }

    return false;
  }

  /**
   * Install Cursor hooks for the user (global/user-level only)
   *
   * IMPORTANT: Hooks are always installed at ~/.cursor/hooks.json (user level)
   * NOT at project level to prevent hooks from firing twice.
   *
   * @param _scope Deprecated - always installs at global level
   */
  async installHooks(_scope?: 'global' | 'workspace'): Promise<boolean> {
    try {
      const homeDir = os.homedir();

      // Always use global hooks directory to avoid double-firing
      const cursorConfigDir = path.join(homeDir, '.cursor');
      if (!fs.existsSync(cursorConfigDir)) {
        fs.mkdirSync(cursorConfigDir, { recursive: true });
      }
      const hooksPath = path.join(cursorConfigDir, 'hooks.json');

      console.log('[HookBasedPromptService] Installing hooks at user level:', hooksPath);

      // Get the path to our hook scripts
      const extension = vscode.extensions.getExtension('devark.devark-extension');
      if (!extension) {
        throw new Error('Extension not found');
      }

      const promptHookPath = path.join(
        extension.extensionPath,
        'dist',
        'cursor-hooks',
        'before-submit-prompt.js'
      );

      const responseHookPath = path.join(
        extension.extensionPath,
        'dist',
        'cursor-hooks',
        'post-response.js'
      );

      // Load existing config or create new one
      let config: { version?: number; hooks?: Record<string, unknown[]> } = { version: 1, hooks: {} };
      if (fs.existsSync(hooksPath)) {
        const content = fs.readFileSync(hooksPath, 'utf8');
        const parseResult = safeJSONParse<typeof config>(content, {
          attemptRecovery: true,
          logErrors: true,
          context: 'installHooks:hooks.json',
          defaultValue: { version: 1, hooks: {} },
        });
        if (parseResult.success && parseResult.data) {
          config = parseResult.data;
        }
        // If parsing failed, we'll use the default config
      }

      // Add our hooks
      if (!config.hooks) {
        config.hooks = {};
      }

      // Remove any existing vibe-log hooks from beforeSubmitPrompt
      if (!config.hooks.beforeSubmitPrompt) {
        config.hooks.beforeSubmitPrompt = [];
      }
      config.hooks.beforeSubmitPrompt = config.hooks.beforeSubmitPrompt.filter(
        (h: any) => !h.command?.includes('vibe-log')
      );

      // Remove any existing vibe-log hooks from afterAgentResponse
      // afterAgentResponse fires after each agent turn, giving us response content
      if (!config.hooks.afterAgentResponse) {
        config.hooks.afterAgentResponse = [];
      }
      config.hooks.afterAgentResponse = config.hooks.afterAgentResponse.filter(
        (h: any) => !h.command?.includes('vibe-log') && !h.command?.includes('post-response')
      );

      // Remove any existing vibe-log hooks from stop
      // stop fires when agent loop ends, giving us final status and loop count
      if (!config.hooks.stop) {
        config.hooks.stop = [];
      }
      config.hooks.stop = config.hooks.stop.filter(
        (h: any) => !h.command?.includes('vibe-log') && !h.command?.includes('post-response')
      );

      // Add our prompt hook
      config.hooks.beforeSubmitPrompt.push({
        command: `node "${promptHookPath}"`,
      });

      // Add our response hook (afterAgentResponse)
      config.hooks.afterAgentResponse.push({
        command: `node "${responseHookPath}"`,
      });

      // Add our stop hook (same script, detects hook type via hook_event_name)
      config.hooks.stop.push({
        command: `node "${responseHookPath}"`,
      });

      console.log('[HookBasedPromptService] Installed 3 Cursor hooks: beforeSubmitPrompt, afterAgentResponse, stop');

      // Write config
      fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));

      console.log('[HookBasedPromptService] Hooks installed at:', hooksPath);

      this.notifyWebview('hookStatus', {
        installed: true,
        message: 'Cursor hooks installed successfully',
      });

      getNotificationService().info(
        `DevArk hooks installed! Restart Cursor to activate.`
      );

      return true;
    } catch (error) {
      console.error('[HookBasedPromptService] Failed to install hooks:', error);
      getNotificationService().error(
        `Failed to install hooks: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return false;
    }
  }

  /**
   * Check if prompt is from a project that should be ignored
   * Ignores vibe-log temp directories and Cursor installation paths
   */
  private shouldIgnoreProject(prompt: CapturedPrompt): boolean {
    const projectPath = prompt.cwd || prompt.workspaceRoots?.[0] || '';
    if (!projectPath) {
      return false;
    }

    // Normalize path for comparison (handle Windows/Unix)
    const normalizedPath = projectPath.toLowerCase().replace(/\\/g, '/');

    // Patterns to ignore (case-insensitive, normalized to forward slashes)
    const ignoredPatterns = [
      'devark-temp-prompt-analysis',
      'devark-hooks',
      '/programs/cursor',
      '/appdata/local/programs/cursor',
    ];

    return ignoredPatterns.some(pattern => normalizedPath.includes(pattern));
  }

  /**
   * Save prompt to SessionManagerService for persistence and sidebar display
   * This ensures prompts detected via hooks appear in the session list
   */
  private async savePromptToSessionManager(prompt: CapturedPrompt): Promise<void> {
    try {
      const sessionManager = getSessionManager();

      // Get project path - prefer cwd (Claude Code), fallback to workspaceRoots (Cursor)
      const projectPath = prompt.cwd || prompt.workspaceRoots?.[0] || '';
      if (!projectPath) {
        console.warn('[HookBasedPromptService] SKIPPING session sync - no projectPath', {
          promptId: prompt.id,
          source: prompt.source,
          hasCwd: !!prompt.cwd,
          hasWorkspaceRoots: !!(prompt.workspaceRoots?.length),
          promptPreview: prompt.prompt?.substring(0, 50),
        });
        return;
      }

      // Get source session ID - conversationId for Cursor, sessionId for Claude Code
      const sourceSessionId = prompt.conversationId || prompt.sessionId;
      if (!sourceSessionId) {
        console.warn('[HookBasedPromptService] SKIPPING session sync - no sourceSessionId', {
          promptId: prompt.id,
          source: prompt.source,
          hasConversationId: !!prompt.conversationId,
          hasSessionId: !!prompt.sessionId,
          projectPath,
          promptPreview: prompt.prompt?.substring(0, 50),
        });
        return;
      }

      // Map source to KnownSourceId
      const sourceId: KnownSourceId = prompt.source === 'claude_code' ? 'claude_code' : 'cursor';

      // Sync project and session first
      await sessionManager.syncFromSource({
        sourceId,
        projectPath,
        projectName: path.basename(projectPath),
        sourceSessionId,
      });

      // Add prompt to session - this triggers 'prompt_added' event which updates the sidebar
      const promptId = await sessionManager.onPromptDetected({
        id: prompt.id,
        text: prompt.prompt,
        timestamp: new Date(prompt.timestamp),
        sourceId,
        sourceSessionId,
      });

      if (promptId) {
        console.log(`[HookBasedPromptService] Saved prompt ${promptId} to SessionManager`);
      }
    } catch (error) {
      console.error('[HookBasedPromptService] Failed to save prompt to SessionManager:', error);
      // Don't throw - allow analysis to continue even if session save fails
    }
  }

  /**
   * Process hook files immediately (called via command from hook scripts)
   * This allows hooks to notify the extension directly instead of waiting for polling
   */
  processHookFiles(): void {
    if (DEBUG_HOOK_SERVICE) {
      console.log('[HookBasedPromptService] Processing hook files via command notification');
    }
    this.checkForNewPrompts();
    this.checkForNewResponses();
  }

  /**
   * Get service status
   */
  getStatus(): {
    isWatching: boolean;
    hooksInstalled: boolean;
    processedPromptCount: number;
    processedResponseCount: number;
    hookDir: string;
  } {
    return {
      isWatching: this.isWatching,
      hooksInstalled: false, // Will be updated async
      processedPromptCount: this.promptProcessor.getProcessedCount(),
      processedResponseCount: this.responseProcessor.getProcessedCount(),
      hookDir: this.hookDir,
    };
  }

  dispose(): void {
    this.stop();
    this.promptProcessor.clearProcessedIds();
    this.responseProcessor.clearProcessedIds();
    this.eventListeners.clear();
    this.conversationStateMap.clear();
    this.lastPromptMap.clear();
  }

  /**
   * Send message to webview via message handler
   */
  private notifyWebview(type: string, data: any): void {
    if (this.messageHandler && typeof this.messageHandler.sendMessage === 'function') {
      this.messageHandler.sendMessage(type, data);
    } else {
      if (DEBUG_HOOK_SERVICE) {
        console.log(`[HookBasedPromptService] No message handler, would send: ${type}`, data);
      }
    }
  }
}

// Singleton instance
let hookServiceInstance: HookBasedPromptService | null = null;

export function getHookBasedPromptService(): HookBasedPromptService {
  if (!hookServiceInstance) {
    hookServiceInstance = new HookBasedPromptService();
  }
  return hookServiceInstance;
}
