/**
 * AutoAnalyzeService - Automatic Prompt Detection & Analysis
 *
 * Integrates CursorSessionReader with V2MessageHandler to:
 * 1. Watch Cursor's SQLite database for changes
 * 2. Detect new prompts in real-time
 * 3. Automatically queue prompts for analysis
 * 4. Send updates to the webview UI
 *
 * Architecture:
 * - Uses CursorSessionReader for DB access
 * - Uses SessionTracker for in-memory state
 * - Integrates with V2MessageHandler for UI updates
 * - Handles edge cases (Cursor not installed, DB locked, multiple instances)
 */

import * as vscode from 'vscode';
import type { CursorSessionReader } from '../cursor-integration/session-reader';
import { SessionTracker } from '../cursor-integration/session-tracker';
import { ContextManager } from '../cursor-integration/context-manager';
import { ExtensionState } from '../extension-state';
import { getSessionManager } from './index';
import { gatherPromptContext } from './context-utils';
import type { PromptData, MessageData } from '../cursor-integration/types';
import type { ChatContext } from '../cursor-integration/context-manager';
import { getNotificationService } from './NotificationService';

export interface AutoAnalyzeConfig {
  enabled: boolean;
  pollInterval: number; // ms between checks (default: 5000)
  maxRetries: number; // max retries for failed analyses (default: 3)
  batchSize: number; // max prompts to analyze at once (default: 5)
}

const DEFAULT_CONFIG: AutoAnalyzeConfig = {
  enabled: true,
  pollInterval: 2000, // Reduced from 5000ms for faster detection
  maxRetries: 3,
  batchSize: 5,
};

/**
 * Whether auto-detection should only run when co-pilot tab is active
 * This saves compute power and keeps logs cleaner
 */
const TAB_BASED_DETECTION = true;

export class AutoAnalyzeService {
  private reader: CursorSessionReader;
  private tracker: SessionTracker;
  private contextManager: ContextManager;
  private config: AutoAnalyzeConfig;

  // File watcher for database changes
  private dbWatcher: { dispose(): void } | null = null;

  // Polling timer for fallback (if file watcher fails)
  private pollTimer: NodeJS.Timeout | null = null;

  // Track last seen state to detect new prompts
  // Changed from counts to message IDs for accurate tracking
  private lastSeenMessageIds: Map<string, Set<string>> = new Map();

  // Service state
  private isInitialized = false;
  private isWatching = false;
  private isAnalyzing = false;

  // Message handler reference
  private messageHandler: any | null = null; // Will be set by V2MessageHandler

  // Context change subscription
  private contextSubscription: vscode.Disposable | null = null;

  // Tab visibility state - controls whether detection is active
  private isCoPilotTabActive = false;
  private isPaused = false;

  constructor(config: Partial<AutoAnalyzeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reader = ExtensionState.getCursorSessionReader();
    this.tracker = new SessionTracker();
    this.contextManager = new ContextManager(this.reader);

    console.log('[AutoAnalyze] Service created with config:', this.config);
  }

  /**
   * Initialize the service
   * Sets up database connection and verifies Cursor is installed
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      console.log('[AutoAnalyze] Already initialized');
      return true;
    }

    console.log('[AutoAnalyze] Initializing...');

    try {
      // Initialize the session reader (connects to Cursor DB)
      const success = await this.reader.initialize();

      if (!success) {
        console.warn('[AutoAnalyze] Failed to initialize: Cursor database not found');
        this.handleCursorNotInstalled();
        return false;
      }

      // Load initial sessions
      await this.syncSessions();

      // Initialize context manager for active composer tracking
      await this.contextManager.initialize();

      // Subscribe to context changes to update UI
      this.contextSubscription = this.contextManager.onContextChanged((context) => {
        this.handleContextChange(context);
      });

      this.isInitialized = true;
      console.log('[AutoAnalyze] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[AutoAnalyze] Initialization failed:', error);
      this.handleInitializationError(error);
      return false;
    }
  }

  /**
   * Start watching for database changes
   * With TAB_BASED_DETECTION, starts in paused state until co-pilot tab is active
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      const success = await this.initialize();
      if (!success) {
        throw new Error('Failed to initialize AutoAnalyzeService');
      }
    }

    if (this.isWatching) {
      console.log('[AutoAnalyze] Already watching');
      return;
    }

    console.log('[AutoAnalyze] Starting auto-analyze...');

    // Start file watcher (always active for detecting changes)
    this.startDatabaseWatcher();

    // With tab-based detection, start in paused state
    // Polling will only start when co-pilot tab becomes active
    if (TAB_BASED_DETECTION && !this.isCoPilotTabActive) {
      this.isPaused = true;
      console.log('[AutoAnalyze] Started in paused state (waiting for co-pilot tab)');
      this.notifyWebview('autoAnalyzeStatus', {
        enabled: true,
        status: 'paused',
        message: 'Open Co-Pilot tab to start analyzing prompts'
      });
    } else {
      // Start polling as fallback (in case file watcher misses changes)
      this.startPolling();
      this.notifyWebview('autoAnalyzeStatus', { enabled: true, status: 'watching' });
    }

    this.isWatching = true;
    console.log('[AutoAnalyze] Auto-analyze started');
  }

  /**
   * Stop watching for database changes
   */
  stop(): void {
    if (!this.isWatching) {
      console.log('[AutoAnalyze] Not watching, nothing to stop');
      return;
    }

    console.log('[AutoAnalyze] Stopping auto-analyze...');

    // Stop file watcher
    if (this.dbWatcher) {
      this.dbWatcher.dispose();
      this.dbWatcher = null;
    }

    // Stop polling
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.isWatching = false;
    this.notifyWebview('autoAnalyzeStatus', { enabled: false, status: 'stopped' });

    console.log('[AutoAnalyze] Auto-analyze stopped');
  }

  /**
   * Set the message handler for UI updates
   */
  setMessageHandler(handler: any): void {
    this.messageHandler = handler;
    console.log('[AutoAnalyze] Message handler registered');
  }

  /**
   * Get service status
   */
  getStatus(): {
    isInitialized: boolean;
    isWatching: boolean;
    isAnalyzing: boolean;
    queueSize: number;
    totalSessions: number;
    activeSessions: number;
    totalPrompts: number;
    activeComposer: string | null;
  } {
    const stats = this.tracker.getStats();
    const context = this.contextManager.getCurrentContext();
    return {
      isInitialized: this.isInitialized,
      isWatching: this.isWatching,
      isAnalyzing: this.isAnalyzing,
      queueSize: stats.queueSize,
      totalSessions: stats.totalSessions,
      activeSessions: stats.activeSessions,
      totalPrompts: stats.totalPrompts,
      activeComposer: context?.workspaceName || null,
    };
  }

  /**
   * Get current chat context for co-pilot
   */
  getCurrentContext(): ChatContext | null {
    return this.contextManager.getCurrentContext();
  }

  /**
   * Get context formatted for prompt enhancement
   */
  getContextForPrompt(): string {
    return this.contextManager.getContextForPrompt();
  }

  /**
   * Get the context manager for external access
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * Dispose of the service
   */
  dispose(): void {
    console.log('[AutoAnalyze] Disposing service...');
    this.stop();

    // Dispose context subscription
    if (this.contextSubscription) {
      this.contextSubscription.dispose();
      this.contextSubscription = null;
    }

    // Dispose context manager
    this.contextManager.dispose();

    this.reader.dispose();
    this.tracker.clear();
    this.lastSeenMessageIds.clear();
    this.isInitialized = false;
  }

  // ========================================
  // TAB VISIBILITY CONTROL
  // ========================================

  /**
   * Called when the co-pilot tab becomes active
   * Resumes detection and starts analyzing prompts (latest to oldest)
   */
  async onCoPilotTabActive(): Promise<void> {
    this.isCoPilotTabActive = true;
    console.log('[AutoAnalyze] Co-pilot tab is now active');

    if (!TAB_BASED_DETECTION) {
      return;
    }

    // Resume detection if it was paused and service is ready
    if (this.isPaused && this.isWatching) {
      this.isPaused = false;
      console.log('[AutoAnalyze] Resuming detection - co-pilot tab is active');

      // Start polling again (if not already running)
      if (!this.pollTimer) {
        this.startPolling();
      }

      // Immediately check for new prompts and analyze (latest to oldest)
      await this.handleDatabaseChange();

      this.notifyWebview('autoAnalyzeStatus', {
        enabled: true,
        status: 'watching',
        message: 'Detection resumed - analyzing prompts'
      });
    } else if (!this.isWatching && this.isInitialized) {
      // Service initialized but not watching yet - start it now
      console.log('[AutoAnalyze] Starting detection now - co-pilot tab is active');
      this.isPaused = false;
      this.startPolling();
      this.isWatching = true;

      await this.handleDatabaseChange();

      this.notifyWebview('autoAnalyzeStatus', {
        enabled: true,
        status: 'watching',
        message: 'Detection started - analyzing prompts'
      });
    } else {
      console.log(`[AutoAnalyze] Tab active but not resuming: isPaused=${this.isPaused}, isWatching=${this.isWatching}, isInitialized=${this.isInitialized}`);
    }
  }

  /**
   * Called when the co-pilot tab becomes inactive (user switches to another tab)
   * Pauses detection to save compute power
   */
  onCoPilotTabInactive(): void {
    this.isCoPilotTabActive = false;
    console.log('[AutoAnalyze] Co-pilot tab is now inactive');

    if (!TAB_BASED_DETECTION) {
      return;
    }

    // Pause detection but keep state
    if (this.isWatching && !this.isPaused) {
      this.isPaused = true;
      console.log('[AutoAnalyze] Pausing detection - co-pilot tab is inactive');

      // Stop polling to save compute
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }

      this.notifyWebview('autoAnalyzeStatus', {
        enabled: true,
        status: 'paused',
        message: 'Detection paused - switch to Co-Pilot tab to resume'
      });
    }
  }

  /**
   * Check if co-pilot tab is currently active
   */
  isCoPilotActive(): boolean {
    return this.isCoPilotTabActive;
  }

  // ========================================
  // PRIVATE METHODS
  // ========================================

  /**
   * Start watching the database file for changes
   */
  private startDatabaseWatcher(): void {
    try {
      this.dbWatcher = this.reader.watchForChanges(() => {
        if (TAB_BASED_DETECTION && this.isPaused) {
          // Don't log to keep console clean when paused
          return;
        }
        console.log('[AutoAnalyze] Database changed, checking for new prompts...');
        this.handleDatabaseChange();
      });

      if (this.dbWatcher) {
        console.log('[AutoAnalyze] File watcher active');
      } else {
        console.warn('[AutoAnalyze] File watcher creation failed, using polling only');
      }
    } catch (error) {
      console.error('[AutoAnalyze] Failed to create file watcher:', error);
      // Polling will still work as fallback
    }
  }

  /**
   * Start polling as a fallback mechanism
   */
  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      this.handleDatabaseChange();
    }, this.config.pollInterval);

    console.log(`[AutoAnalyze] Polling started (interval: ${this.config.pollInterval}ms)`);
  }

  /**
   * Handle database change event
   * Detects new prompts and queues them for analysis
   */
  private async handleDatabaseChange(): Promise<void> {
    // Skip if paused (tab-based detection)
    if (TAB_BASED_DETECTION && this.isPaused) {
      return; // Silently skip - no logging to keep logs clean
    }

    if (this.isAnalyzing) {
      console.log('[AutoAnalyze] Already analyzing, skipping this check');
      return;
    }

    try {
      this.isAnalyzing = true;
      console.log('[AutoAnalyze] Checking for new messages...');

      // Sync sessions from database
      await this.syncSessions();

      const sessions = this.tracker.getActiveSessions();
      console.log(`[AutoAnalyze] Found ${sessions.length} active session(s)`);

      // Log session details for debugging
      for (const session of sessions) {
        const messages = this.reader.getAllMessagesForSession(session.sessionId);
        const seenIds = this.lastSeenMessageIds.get(session.sessionId);
        console.log(`[AutoAnalyze] Session ${session.sessionId.substring(0, 8)}...: ${messages.length} total messages, ${seenIds?.size || 0} seen`);
      }

      // Detect new prompts
      const newPrompts = this.detectNewPrompts();

      if (newPrompts.length > 0) {
        console.log(`[AutoAnalyze] Detected ${newPrompts.length} new prompt(s)`);
        await this.processNewPrompts(newPrompts);
      } else {
        console.log('[AutoAnalyze] No new prompts detected');
      }
    } catch (error) {
      console.error('[AutoAnalyze] Error handling database change:', error);
      this.handleDatabaseError(error);
    } finally {
      this.isAnalyzing = false;
    }
  }

  /**
   * Sync sessions from database to in-memory tracker
   */
  private async syncSessions(): Promise<void> {
    try {
      const sessions = this.reader.getActiveSessions();
      this.tracker.syncWithDatabaseSessions(sessions);
    } catch (error) {
      console.error('[AutoAnalyze] Failed to sync sessions:', error);
      throw error;
    }
  }

  /**
   * Detect new prompts by extracting real messages from Cursor DB
   * Uses message IDs for accurate tracking (not just counts)
   */
  private detectNewPrompts(): PromptData[] {
    const newPrompts: PromptData[] = [];
    const sessions = this.tracker.getActiveSessions();

    for (const session of sessions) {
      // Get all messages for this session
      const messages = this.reader.getAllMessagesForSession(session.sessionId);

      // Filter to only user prompts
      const userMessages = messages.filter((m: MessageData) => m.role === 'user');

      // Get previously seen message IDs for this session
      let seenIds = this.lastSeenMessageIds.get(session.sessionId);
      if (!seenIds) {
        seenIds = new Set<string>();
        this.lastSeenMessageIds.set(session.sessionId, seenIds);
      }

      // Find new messages (not in seen set)
      const newMessages = userMessages.filter((m: MessageData) => !seenIds!.has(m.id));

      if (newMessages.length > 0) {
        console.log(
          `[AutoAnalyze] Session ${session.sessionId}: ${newMessages.length} new prompt(s) detected`
        );

        for (const msg of newMessages) {
          // Create PromptData from real message content
          const prompt: PromptData = {
            id: `${session.sessionId}-${msg.id}-${Date.now()}`,
            sessionId: session.sessionId,
            timestamp: new Date(msg.timestamp),
            userPrompt: msg.content,
            status: 'pending',
          };

          newPrompts.push(prompt);
          this.tracker.addPrompt(session.sessionId, prompt);

          // Mark this message as seen
          seenIds!.add(msg.id);
        }

        console.log(
          `[AutoAnalyze] Extracted ${newMessages.length} real prompt(s) from session ${session.sessionId}`
        );
      }
    }

    // Sort prompts by timestamp - latest first (newest to oldest)
    // This ensures the most recent prompts are analyzed first
    newPrompts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return newPrompts;
  }

  /**
   * Process new prompts (queue for analysis)
   */
  private async processNewPrompts(prompts: PromptData[]): Promise<void> {
    console.log(`[AutoAnalyze] Processing ${prompts.length} new prompt(s)...`);

    // Sync each prompt with SessionManagerService (Stream A/B integration)
    try {
      const sessionManager = getSessionManager();
      for (const prompt of prompts) {
        await sessionManager.onCursorPromptDetected({
          text: prompt.userPrompt,
          timestamp: prompt.timestamp,
          sessionId: prompt.sessionId,
        });
      }
    } catch (error) {
      console.warn('[AutoAnalyze] Failed to sync prompts with SessionManager:', error);
    }

    // Notify webview about new prompts
    this.notifyWebview('newPromptsDetected', {
      count: prompts.length,
      prompts: prompts.map((p) => ({
        id: p.id,
        sessionId: p.sessionId,
        text: p.userPrompt,
        timestamp: p.timestamp,
      })),
    });

    // Queue prompts for analysis (respecting batch size)
    const batch = prompts.slice(0, this.config.batchSize);

    for (const prompt of batch) {
      await this.analyzePrompt(prompt);
    }

    // If there are more prompts, queue them with lower priority
    if (prompts.length > this.config.batchSize) {
      for (let i = this.config.batchSize; i < prompts.length; i++) {
        this.tracker.queueForAnalysis(prompts[i].id, 3); // Lower priority
      }
    }
  }

  /**
   * Analyze a single prompt
   */
  private async analyzePrompt(prompt: PromptData): Promise<void> {
    console.log(`[AutoAnalyze] Analyzing prompt ${prompt.id}...`);

    // Update prompt status
    this.tracker.updatePromptStatus(prompt.id, 'analyzing');

    this.notifyWebview('promptAnalyzing', {
      promptId: prompt.id,
      text: prompt.userPrompt,
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

      // Gather context for more targeted scoring (includes session correspondence)
      const context = await gatherPromptContext(prompt.userPrompt, '[AutoAnalyze]');

      // Run scoring and enhancement in PARALLEL for faster response
      // Use scorePromptV2 for full 5-dimension breakdown
      console.log(`[AutoAnalyze] Starting parallel scoring and enhancement for ${prompt.id}...`);
      const scorePromise = scorer.scorePromptV2(prompt.userPrompt, undefined, context);
      const enhancePromise = enhancer.enhancePrompt(prompt.userPrompt, 'medium', undefined, context);

      // Wait for score first and send it immediately to UI
      const score = await scorePromise;

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
      });

      // Now wait for enhancement (it's been running in parallel)
      const enhanced = await enhancePromise;

      // Score the enhanced prompt
      const enhancedScore = await scorer.scorePrompt(enhanced.enhanced);

      // Create analysis result with V2 breakdown and explanation
      const analysis = {
        id: `analysis-${prompt.id}`,
        promptId: prompt.id,
        score: score.overall / 10, // Convert to 0-10 scale
        categoryScores: {
          clarity: score.clarity,
          specificity: score.specificity,
          context: score.context,
          actionability: score.actionability,
        },
        suggestions: score.suggestions.slice(0, 3),
        enhancedPrompt: enhanced.enhanced,
        enhancedScore: enhancedScore.overall / 10,
        // V2 additions for full 5-dimension scoring display
        breakdown: score.breakdown,
        explanation: score.explanation,
      };

      // Update prompt status
      this.tracker.updatePromptStatus(prompt.id, 'completed', analysis.id);

      // Notify webview
      this.notifyWebview('analysisComplete', {
        promptId: prompt.id,
        analysis,
      });

      // Update status bar
      const statusBarManager = ExtensionState.getStatusBarManager();
      if (statusBarManager) {
        statusBarManager.addPromptScore(analysis.score);
      }

      console.log(`[AutoAnalyze] Analysis complete for prompt ${prompt.id} (score: ${analysis.score})`);
    } catch (error) {
      console.error(`[AutoAnalyze] Analysis failed for prompt ${prompt.id}:`, error);

      // Update prompt status
      this.tracker.updatePromptStatus(prompt.id, 'failed');

      // Retry if within retry limit
      const queueItem = this.tracker['analysisQueue'].find((item: any) => item.promptId === prompt.id);
      if (queueItem && queueItem.retryCount < this.config.maxRetries) {
        console.log(`[AutoAnalyze] Requeuing prompt ${prompt.id} (retry ${queueItem.retryCount + 1})`);
        this.tracker.requeueForAnalysis(prompt.id);
      } else {
        // Max retries reached, notify webview
        this.notifyWebview('analysisFailed', {
          promptId: prompt.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Send message to webview via message handler
   */
  private notifyWebview(type: string, data: any): void {
    if (this.messageHandler && typeof this.messageHandler.sendMessage === 'function') {
      this.messageHandler.sendMessage(type, data);
    } else {
      console.log(`[AutoAnalyze] No message handler, would send: ${type}`, data);
    }
  }

  /**
   * Handle Cursor not installed scenario
   */
  private handleCursorNotInstalled(): void {
    console.warn('[AutoAnalyze] Cursor not installed or database not accessible');
    this.notifyWebview('autoAnalyzeError', {
      error: 'cursor-not-installed',
      message: 'Cursor is not installed or the database is not accessible',
    });

    // Removed popup notification - silently handle the case
    // Auto-analyze will simply not work if Cursor is not installed
  }

  /**
   * Handle initialization errors
   */
  private handleInitializationError(error: any): void {
    console.error('[AutoAnalyze] Initialization error:', error);
    this.notifyWebview('autoAnalyzeError', {
      error: 'initialization-failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    getNotificationService().error(
      `Auto-analyze initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  /**
   * Handle database errors (e.g., locked, corrupted)
   */
  private handleDatabaseError(error: any): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check if database is locked
    if (errorMessage.includes('SQLITE_BUSY') || errorMessage.includes('database is locked')) {
      console.warn('[AutoAnalyze] Database is locked (Cursor is using it)');
      // This is normal, just skip this check
      return;
    }

    // Other errors
    console.error('[AutoAnalyze] Database error:', error);
    this.notifyWebview('autoAnalyzeError', {
      error: 'database-error',
      message: errorMessage,
    });
  }

  /**
   * Handle context changes (active composer changed)
   */
  private handleContextChange(context: ChatContext | null): void {
    if (context) {
      console.log(`[AutoAnalyze] Context changed: ${context.workspaceName} (${context.recentMessages.length} messages)`);

      // Sync with SessionManagerService (Stream A/B integration)
      try {
        const sessionManager = getSessionManager();
        sessionManager.syncFromCursorSession({
          composerId: context.composerId,
          workspaceName: context.workspaceName || null,
          workspacePath: context.workspacePath || null,
          messageCount: context.recentMessages.length,
          files: context.files,
        });
      } catch (error) {
        console.warn('[AutoAnalyze] Failed to sync with SessionManager:', error);
      }

      // Notify webview about active chat
      this.notifyWebview('activeComposerChanged', {
        composerId: context.composerId,
        workspaceName: context.workspaceName,
        workspacePath: context.workspacePath,
        messageCount: context.recentMessages.length,
        files: context.files,
        lastUpdated: context.lastUpdated.toISOString(),
      });
    } else {
      console.log('[AutoAnalyze] Context cleared: no active composer');

      this.notifyWebview('activeComposerChanged', {
        composerId: null,
        workspaceName: null,
        workspacePath: null,
        messageCount: 0,
        files: [],
        lastUpdated: null,
      });
    }
  }
}
