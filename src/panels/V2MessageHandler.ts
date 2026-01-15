/**
 * V2MessageHandler - Bridge between WebView and Extension Infrastructure
 *
 * Handles all postMessage communication from the redesigned UI
 * and connects to existing services:
 * - LLM Manager (prompt analysis)
 * - CLI Wrapper (cloud sync, hooks)
 * - Status Bar Manager
 */

// Set to true to enable verbose logging for debugging
const DEBUG_V2_MESSAGE_HANDLER = false;

import * as vscode from 'vscode';
import { ExtensionState, isCursorIDE, getEditorName } from '../extension-state';
import type { StatusBarManager } from '../status-bar/StatusBarManager';
import { PromptHistoryStore } from '../storage/PromptHistoryStore';
import { SavedPromptsStore } from '../storage/SavedPromptsStore';
import { ProviderDetectionService } from '../services/ProviderDetectionService';
import { SummaryService } from '../services/SummaryService';
import { UnifiedSessionService } from '../services/UnifiedSessionService';
import type { CursorSessionReader } from '../cursor-integration/session-reader';
import { ChatInjector } from '../cursor-integration/chat-injector';

// Unified Prompt Detection (New Architecture)
import {
  getUnifiedPromptDetectionService,
  UnifiedPromptDetectionService,
} from '../services/UnifiedPromptDetectionService';
import { CursorAdapter, ClaudeCodeAdapter } from '../adapters/prompt-detection';
import type { IUnifiedSettingsService } from '../services/UnifiedSettingsService';

// Co-Pilot V2 Coordinator (centralized service management)
import { CoPilotCoordinator } from './CoPilotCoordinator';
import { getHookBasedPromptService } from '../services/HookBasedPromptService';

// Handler infrastructure
import { CloudAuthHandler } from './handlers/cloud-auth-handler';
import { ProviderHandler } from './handlers/provider-handler';
import { GoalsHandler } from './handlers/goals-handler';
import { HooksHandler } from './handlers/hooks-handler';
import { SessionHandler } from './handlers/session-handler';
import { SummaryHandler } from './handlers/summary-handler';
import { PromptAnalysisHandler } from './handlers/prompt-analysis-handler';
import { CoachingHandler } from './handlers/coaching-handler';
import { PromptLabHandler } from './handlers/prompt-lab-handler';
import { ReportHandler } from './handlers/report-handler';
import { StatsHandler } from './handlers/stats-handler';
import { SuggestionHandler } from './handlers/suggestion-handler';
import { ConfigHandler } from './handlers/config-handler';
import { SharedContext } from './handlers/shared-context';
import type { BaseMessageHandler } from './handlers/base-handler';
import type { WebviewMessageType, WebviewMessageData } from '../shared/webview-protocol';

export interface V2Message {
  type: WebviewMessageType;
  data?: unknown;
}

export class V2MessageHandler {
  private statusBarManager?: StatusBarManager;
  private promptHistoryStore?: PromptHistoryStore;
  private savedPromptsStore?: SavedPromptsStore;
  private providerDetectionService?: ProviderDetectionService;
  private summaryService?: SummaryService;
  private sessionReader: CursorSessionReader;
  private unifiedSessionService: UnifiedSessionService;

  // Unified Prompt Detection Service (replaces AutoAnalyzeService + HookBasedPromptService)
  private promptDetectionService: UnifiedPromptDetectionService;

  // Co-Pilot V2 Coordinator (manages all Co-Pilot services)
  private coPilotCoordinator: CoPilotCoordinator;

  // Chat Injector for "Use this" button
  private chatInjector: ChatInjector;

  // Handler infrastructure - delegate to modular handlers
  private handlers: BaseMessageHandler[] = [];
  private sharedContext!: SharedContext; // Initialized in initialize()

  // Track disposal state to prevent sending messages to disposed webview
  private isDisposed = false;

  // Track initialization state to queue messages that arrive before init completes
  private initialized = false;
  private pendingMessages: V2Message[] = [];

  // Lazy-loaded settings service
  private _settingsService: IUnifiedSettingsService | null = null;

  // Sync status cache managed by SharedContext via CloudAuthHandler

  constructor(
    private panel: vscode.WebviewPanel | vscode.WebviewView,
    private extensionUri: vscode.Uri,
    private context: vscode.ExtensionContext
  ) {
    // Initialize Unified Prompt Detection Service (new architecture)
    this.promptDetectionService = getUnifiedPromptDetectionService();
    this.promptDetectionService.setMessageHandler(this);

    // Register adapters for each AI coding tool
    this.promptDetectionService.registerAdapter(new CursorAdapter());
    this.promptDetectionService.registerAdapter(new ClaudeCodeAdapter());

    // Get CursorSessionReader from DI (for Account tab, not prompt detection)
    this.sessionReader = ExtensionState.getCursorSessionReader();

    // Initialize UnifiedSessionService (aggregates Cursor + Claude Code sessions)
    this.unifiedSessionService = new UnifiedSessionService();

    // Initialize Co-Pilot V2 Coordinator (manages all Co-Pilot services)
    this.coPilotCoordinator = new CoPilotCoordinator();

    // Initialize ChatInjector
    this.chatInjector = new ChatInjector();
  }

  private get settingsService(): IUnifiedSettingsService {
    if (!this._settingsService) {
      this._settingsService = ExtensionState.getUnifiedSettingsService();
    }
    return this._settingsService;
  }

  /**
   * Get extension URI (for loading extension resources)
   */
  public getExtensionUri(): vscode.Uri {
    return this.extensionUri;
  }

  /**
   * Initialize the handler with dependencies
   */
  public async initialize(): Promise<void> {
    // Initialize prompt history store
    this.promptHistoryStore = new PromptHistoryStore(this.context);
    await this.promptHistoryStore.initialize();

    // Initialize saved prompts store (Prompt Lab)
    this.savedPromptsStore = new SavedPromptsStore(this.context);
    await this.savedPromptsStore.initialize();

    // Send initial history to webview
    this.sendPromptHistoryToWebview();

    // Initialize provider detection service and summary service
    const llmManager = ExtensionState.getLLMManager();
    if (llmManager) {
      this.providerDetectionService = new ProviderDetectionService(llmManager);
      this.summaryService = new SummaryService(llmManager);
    }

    // Initialize CursorSessionReader for ACCOUNT tab
    try {
      await this.sessionReader.initialize();
      console.log('[V2MessageHandler] CursorSessionReader initialized successfully');
    } catch (error) {
      console.warn('[V2MessageHandler] CursorSessionReader initialization failed (Cursor DB not found?):', error);
    }

    // Initialize UnifiedSessionService with Cursor reader (Claude reader created internally)
    try {
      this.unifiedSessionService.initialize(this.sessionReader);
      console.log('[V2MessageHandler] UnifiedSessionService initialized - ready for multi-source session fetching');

      // Pre-cache sync status in the background so Account tab loads instantly
      this.preCacheSyncStatus();
    } catch (error) {
      console.warn('[V2MessageHandler] UnifiedSessionService initialization failed:', error);
    }

    // Initialize modular handlers (delegate cloud/auth to CloudAuthHandler)
    this.sharedContext = new SharedContext();
    this.sharedContext.unifiedSessionService = this.unifiedSessionService;
    this.sharedContext.providerDetectionService = this.providerDetectionService;
    this.sharedContext.summaryService = this.summaryService;
    this.sharedContext.statusBarManager = this.statusBarManager;
    this.sharedContext.promptDetectionService = this.promptDetectionService;
    this.sharedContext.sessionReader = this.sessionReader;
    this.sharedContext.promptHistoryStore = this.promptHistoryStore;
    this.sharedContext.savedPromptsStore = this.savedPromptsStore;
    this.sharedContext.chatInjector = this.chatInjector;
    // Note: goalService, sessionManagerService, dailyStatsService are set by CoPilotCoordinator

    const messageSender = { sendMessage: this.sendMessage.bind(this) };
    const handlerContext = { extensionUri: this.extensionUri, context: this.context };

    this.handlers = [
      new CloudAuthHandler(messageSender, handlerContext, this.sharedContext),
      new ProviderHandler(messageSender, handlerContext, this.sharedContext),
      new GoalsHandler(messageSender, handlerContext, this.sharedContext),
      new HooksHandler(messageSender, handlerContext, this.sharedContext),
      new SessionHandler(messageSender, handlerContext, this.sharedContext),
      new SummaryHandler(messageSender, handlerContext, this.sharedContext),
      new PromptAnalysisHandler(messageSender, handlerContext, this.sharedContext),
      new CoachingHandler(messageSender, handlerContext, this.sharedContext),
      new PromptLabHandler(messageSender, handlerContext, this.sharedContext),
      new ReportHandler(messageSender, handlerContext, this.sharedContext),
      new StatsHandler(messageSender, handlerContext, this.sharedContext),
      new SuggestionHandler(messageSender, handlerContext, this.sharedContext),
      new ConfigHandler(messageSender, handlerContext, this.sharedContext),
    ];
    console.log('[V2MessageHandler] Handlers initialized - 13 handlers registered');

    // Initialize Co-Pilot V2 Coordinator (manages all Co-Pilot services, storage, and subscriptions)
    const handlerFinder = {
      getGoalsHandler: () => this.getGoalsHandler(),
      getSessionHandler: () => this.getSessionHandler(),
    };
    await this.coPilotCoordinator.initialize(this.context, messageSender, handlerFinder, this.sharedContext);

    // Set message handler for HookBasedPromptService UI updates
    const hookService = getHookBasedPromptService();
    hookService.setMessageHandler(this);
    console.log('[V2MessageHandler] HookBasedPromptService message handler set');

    // Initialize unified prompt detection service
    const autoAnalyzeEnabled = this.settingsService.getWithDefault('autoAnalyze.enabled', false);

    console.log('[V2MessageHandler] Prompt detection config:', {
      autoAnalyzeEnabled,
    });

    // Initialize and start the unified detection service
    try {
      await this.promptDetectionService.initialize();

      // Update config based on settings
      this.promptDetectionService.updateConfig({
        enabled: autoAnalyzeEnabled,
        autoAnalyze: autoAnalyzeEnabled,
      });

      if (autoAnalyzeEnabled) {
        await this.promptDetectionService.start();
        const status = this.promptDetectionService.getStatus();
        console.log(`[V2MessageHandler] Unified prompt detection started - ${status.activeAdapters} adapters active`);
      } else {
        console.log('[V2MessageHandler] AutoAnalyze is disabled in settings. Enable devark.autoAnalyze to activate.');
      }
    } catch (error) {
      console.error('[V2MessageHandler] Failed to initialize prompt detection:', error);
    }

    // Mark initialization as complete
    this.initialized = true;
    console.log('[V2MessageHandler] Initialization complete');

    // Process any messages that were queued during initialization
    if (this.pendingMessages.length > 0) {
      console.log(`[V2MessageHandler] Processing ${this.pendingMessages.length} queued messages`);
      const messages = [...this.pendingMessages];
      this.pendingMessages = [];
      for (const msg of messages) {
        await this.handleMessage(msg);
      }
    }

    // Proactively push initial session data to webview via CoPilotCoordinator
    this.coPilotCoordinator.pushInitialData();

    // Proactively push providers update (webview may have requested before handlers were ready)
    const providerHandler = this.getProviderHandler();
    if (providerHandler) {
      console.log('[V2MessageHandler] Pushing initial providers data to webview');
      await providerHandler.handleMessage('getProviders', undefined);
    }

    // Proactively push cloud status to webview (message may have been dropped during init)
    const cloudAuthHandler = this.handlers.find((h): h is CloudAuthHandler => h instanceof CloudAuthHandler);
    if (cloudAuthHandler) {
      await cloudAuthHandler.pushInitialCloudStatus();
    }
  }

  private getGoalsHandler(): GoalsHandler | undefined {
    return this.handlers.find((h): h is GoalsHandler => h instanceof GoalsHandler);
  }

  private getSessionHandler(): SessionHandler | undefined {
    return this.handlers.find((h): h is SessionHandler => h instanceof SessionHandler);
  }

  private getProviderHandler(): ProviderHandler | undefined {
    return this.handlers.find((h): h is ProviderHandler => h instanceof ProviderHandler);
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    // Mark as disposed FIRST to prevent sendMessage calls during cleanup
    this.isDisposed = true;

    // Dispose unified prompt detection service
    if (this.promptDetectionService) {
      this.promptDetectionService.dispose();
    }

    // Dispose Co-Pilot V2 Coordinator (cleans up all subscriptions)
    this.coPilotCoordinator.dispose();
  }

  /**
   * Set status bar manager for integration
   */
  public setStatusBarManager(manager: StatusBarManager): void {
    this.statusBarManager = manager;
  }

  /**
   * Send full prompt history to webview
   */
  private sendPromptHistoryToWebview(): void {
    if (!this.promptHistoryStore) {
      return;
    }

    const history = this.promptHistoryStore.getAll();
    const stats = this.promptHistoryStore.getDailyStats();

    this.sendMessage('promptHistoryLoaded', {
      history,
      analyzedToday: stats.analyzedToday,
      avgScore: stats.avgScore,
    });
  }

  /**
   * Handle incoming message from webview
   */
  public async handleMessage(message: V2Message): Promise<void> {
    const { type, data } = message;

    if (DEBUG_V2_MESSAGE_HANDLER) console.log(`[V2MessageHandler] Received: ${type}`, data);

    // Queue messages that depend on handlers being initialized (race condition fix)
    // These messages require handlers to be set up before they can be processed
    const handlerDependentMessages = [
      // Session-related messages depend on SessionManagerService
      'v2GetActiveSession',
      'v2GetSessionList',
      'v2GetDailyStats',
      'v2GetGoalStatus',
      'v2GetPrompts',
      // Config messages depend on ConfigHandler
      'getConfig',
      'completeOnboarding',
    ];
    if (!this.initialized && handlerDependentMessages.includes(type)) {
      console.log(`[V2MessageHandler] Queueing ${type} until initialization completes`);
      this.pendingMessages.push(message);
      return;
    }

    // Try modular handlers first (CloudAuthHandler, etc.)
    for (const handler of this.handlers) {
      if (handler.getHandledMessageTypes().includes(type)) {
        const handled = await handler.handleMessage(type, data);
        if (handled) {
          if (DEBUG_V2_MESSAGE_HANDLER) console.log(`[V2MessageHandler] Handled by ${handler.constructor.name}`);
          return;
        }
      }
    }

    switch (type) {
      // PROVIDER MANAGEMENT - Delegated to ProviderHandler
      // FEATURE MODELS - Delegated to ConfigHandler
      // PROMPT ANALYSIS - Delegated to PromptAnalysisHandler
      // CLOUD & AUTH - Delegated to CloudAuthHandler
      // HOOKS - Delegated to HooksHandler
      // SUMMARIES - Delegated to SummaryHandler
      // CONFIG & DATA - Delegated to ConfigHandler

      // ========================================
      // UI & NAVIGATION
      // ========================================
      case 'openExternal': {
        const d = data as WebviewMessageData<'openExternal'>;
        await this.handleOpenExternal(d?.url);
        break;
      }

      case 'showAllPrompts':
        await this.handleShowAllPrompts();
        break;

      case 'cancelLoading':
        // Just acknowledge, UI handles the state change
        break;

      // ========================================
      // TAB VISIBILITY & EDITOR DETECTION
      // ========================================
      case 'tabChanged': {
        const d = data as WebviewMessageData<'tabChanged'>;
        await this.handleTabChanged(d?.tab);
        break;
      }

      case 'getEditorInfo':
        this.handleGetEditorInfo();
        break;

      // ========================================
      // ACCOUNT TAB
      // ========================================
      case 'openDashboard':
        await this.handleOpenDashboard();
        break;

      case 'uploadCurrentSession':
        await this.handleUploadCurrentSession();
        break;

      case 'uploadRecentSessions':
        await this.handleUploadRecentSessions();
        break;

      // CO-PILOT V2: SESSION & PROMPT MANAGEMENT - handled by SessionHandler
      // CO-PILOT V2: DAILY STATS & PERSONAL COMPARISON - handled by StatsHandler
      // CO-PILOT V2: GOALS - handled by GoalsHandler
      // CO-PILOT V2: SUGGESTIONS - handled by SuggestionHandler

      // ========================================
      // CO-PILOT V2: CONTEXT
      // ========================================
      case 'v2GetSessionContext':
        await this.handleV2GetSessionContext();
        break;

      case 'v2GetContextSummary':
        await this.handleV2GetContextSummary();
        break;

      // ========================================
      // LEGACY MESSAGES (consolidated from MenuSidebarView)
      // ========================================
      case 'test':
        this.sendMessage('testResponse', { received: data });
        break;

      case 'testCLI':
        await this.handleTestCLI();
        break;

      // 'authenticate' is now handled by CloudAuthHandler

      case 'checkAuthStatus':
        await this.handleCheckAuthStatus();
        break;

      case 'uploadClaudeSessions':
        await this.handleUploadClaudeSessions();
        break;

      case 'getClaudeHooksStatus':
        await this.handleGetClaudeHooksStatus();
        break;

      case 'installClaudeHooks':
        await this.handleInstallClaudeHooks();
        break;

      // 'generateReport' - handled by ReportHandler

      // GOAL EDITING - handled by GoalsHandler

      // COACHING - handled by CoachingHandler

      // PROMPT LAB - handled by PromptLabHandler

      // renameSession, deleteSession - handled by SessionHandler

      default:
        console.warn(`[V2MessageHandler] Unknown message type: ${type}`);
    }
  }

  // Handlers delegated to modular handlers:
  // - Provider Management: ProviderHandler
  // - Feature Models: ConfigHandler
  // - Prompt Analysis: PromptAnalysisHandler
  // - Cloud & Auth: CloudAuthHandler
  // - Hooks: HooksHandler
  // - Summaries: SummaryHandler
  // - Config & Data: ConfigHandler

  // ========================================
  // UI HANDLERS
  // ========================================

  private async handleOpenExternal(url: string): Promise<void> {
    if (url) {
      vscode.env.openExternal(vscode.Uri.parse(url));
    }
  }

  private async handleShowAllPrompts(): Promise<void> {
    // TODO: Show all prompts in a webview or quick pick
    vscode.window.showInformationMessage('View all prompts feature coming soon!');
  }

  // ========================================
  // ACCOUNT TAB HANDLERS
  // ========================================

  private async handleOpenDashboard(): Promise<void> {
    try {
      const apiClient = ExtensionState.getApiClient();
      const dashboardUrl = apiClient.getBaseUrl();
      await vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
    } catch (error) {
      console.error('[V2MessageHandler] Failed to open dashboard:', error);
      vscode.window.showErrorMessage('Failed to open dashboard');
    }
  }

  private async handleUploadCurrentSession(): Promise<void> {
    // Delegate to CloudAuthHandler's syncNow
    await this.handleMessage({ type: 'syncNow' });
  }

  private async handleUploadRecentSessions(): Promise<void> {
    // Delegate to CloudAuthHandler's syncNow
    await this.handleMessage({ type: 'syncNow' });
  }

  // SYNC STATUS HANDLERS - Delegated to CloudAuthHandler
  // (handleGetSyncStatus, invalidateSyncStatusCache, preCacheSyncStatus)
  // Cache is managed via SharedContext

  /**
   * Pre-cache sync status in the background (called on extension init)
   * Delegates to CloudAuthHandler via SharedContext
   */
  private preCacheSyncStatus(): void {
    // Find CloudAuthHandler and call its preCacheSyncStatus
    const cloudHandler = this.handlers.find(h => h instanceof CloudAuthHandler) as CloudAuthHandler | undefined;
    if (cloudHandler) {
      cloudHandler.preCacheSyncStatus();
    }
  }

  // ========================================
  // TAB VISIBILITY & EDITOR DETECTION HANDLERS
  // ========================================

  /**
   * Handle tab change events from the webview
   * Controls auto-detection based on whether co-pilot tab is active
   */
  private async handleTabChanged(tab: string): Promise<void> {
    if (DEBUG_V2_MESSAGE_HANDLER) console.log(`[V2MessageHandler] Tab changed to: ${tab}`);

    // Unified detection service runs continuously regardless of tab
    // We could pause/resume here if needed for performance, but for now
    // we let detection run in the background to ensure no prompts are missed
    if (tab === 'copilot') {
      // Co-pilot tab became active - ensure detection is running
      const status = this.promptDetectionService.getStatus();
      if (!status.enabled) {
        await this.promptDetectionService.start();
      }
    }
  }

  /**
   * Send editor info to webview (Cursor vs VS Code)
   * Used to show appropriate UI messages
   */
  private handleGetEditorInfo(): void {
    const isCursor = isCursorIDE();
    const editorName = getEditorName();

    if (DEBUG_V2_MESSAGE_HANDLER) console.log(`[V2MessageHandler] Editor detected: ${editorName} (isCursor: ${isCursor})`);

    this.sendMessage('editorInfo', {
      isCursor,
      editorName,
      autoDetectSupported: true, // Auto-detect works for both Cursor (DB polling/hooks) and Claude Code (UserPromptSubmit hooks)
    });
  }

  // CO-PILOT V2: SESSION & PROMPT HANDLERS - Delegated to SessionHandler
  // CO-PILOT V2: DAILY STATS & PERSONAL COMPARISON - Delegated to StatsHandler
  // CO-PILOT V2: GOAL HANDLERS - handled by GoalsHandler
  // CO-PILOT V2: SUGGESTION HANDLERS - Delegated to SuggestionHandler

  // ========================================
  // CO-PILOT V2: CONTEXT HANDLERS
  // ========================================

  private async handleV2GetSessionContext(): Promise<void> {
    this.coPilotCoordinator.handleGetSessionContext();
  }

  private async handleV2GetContextSummary(): Promise<void> {
    this.coPilotCoordinator.handleGetContextSummary();
  }

  // ========================================
  // LEGACY HANDLERS (consolidated from MenuSidebarView)
  // ========================================

  private async handleTestCLI(): Promise<void> {
    try {
      const authService = ExtensionState.getAuthService();
      const isAuth = await authService.isAuthenticated();
      this.sendMessage('testCLIResponse', {
        success: true,
        healthCheck: { authenticated: isAuth },
      });
    } catch (error) {
      console.error('[V2MessageHandler] Health check failed:', error);
      this.sendMessage('error', {
        message: 'Health check failed',
        error: error instanceof Error ? { name: error.name, message: error.message } : undefined,
      });
    }
  }

  private async handleCheckAuthStatus(): Promise<void> {
    try {
      const authService = ExtensionState.getAuthService();
      const isAuthenticated = await authService.isAuthenticated();
      this.sendMessage('authStatusResult', { authenticated: isAuthenticated });
    } catch (error) {
      console.error('[V2MessageHandler] Failed to check auth status:', error);
      this.sendMessage('error', {
        message: 'Failed to check authentication status',
        error: error instanceof Error ? { name: error.name, message: error.message } : undefined,
      });
    }
  }

  private async handleUploadClaudeSessions(): Promise<void> {
    try {
      const syncService = ExtensionState.getSyncService();
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Uploading sessions',
          cancellable: false,
        },
        async (progress) => {
          return await syncService.sync({
            onProgress: (current, total) => {
              progress.report({
                message: `${current}/${total} sessions`,
                increment: total > 0 ? 100 / total : 0,
              });
            },
          });
        }
      );

      if (result.success) {
        vscode.window.showInformationMessage(
          `Successfully uploaded ${result.sessionsUploaded} sessions!`
        );
      }

      this.sendMessage('uploadClaudeSessionsComplete', result);
    } catch (error) {
      console.error('[V2MessageHandler] Failed to upload sessions:', error);
      this.sendMessage('error', {
        message: 'Failed to upload sessions',
        error: error instanceof Error ? { name: error.name, message: error.message } : undefined,
      });
    }
  }

  private async handleGetClaudeHooksStatus(): Promise<void> {
    try {
      const claudeHookInstaller = ExtensionState.getClaudeHookInstaller();
      const status = await claudeHookInstaller.getStatus();
      this.sendMessage('claudeHooksStatusResult', status);
    } catch (error) {
      console.error('[V2MessageHandler] Failed to get Claude hooks status:', error);
      this.sendMessage('error', {
        message: 'Failed to get Claude hooks status',
        error: error instanceof Error ? { name: error.name, message: error.message } : undefined,
      });
    }
  }

  private async handleInstallClaudeHooks(): Promise<void> {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Installing Claude hooks',
          cancellable: false,
        },
        async () => {
          const claudeHookInstaller = ExtensionState.getClaudeHookInstaller();
          await claudeHookInstaller.install({
            hooks: ['SessionStart', 'PreCompact', 'SessionEnd'],
            mode: 'all',
          });
        }
      );
      vscode.window.showInformationMessage('Claude hooks installed successfully!');
      this.sendMessage('installClaudeHooksComplete', { success: true });
    } catch (error) {
      console.error('[V2MessageHandler] Failed to install Claude hooks:', error);
      this.sendMessage('error', {
        message: 'Failed to install Claude hooks',
        error: error instanceof Error ? { name: error.name, message: error.message } : undefined,
      });
    }
  }

  // COACHING HANDLERS - Delegated to CoachingHandler

  // PROMPT LAB HANDLERS - Delegated to PromptLabHandler

  // renameSession, deleteSession - handled by SessionHandler

  // ========================================
  // HELPER METHODS
  // ========================================

  public sendMessage(type: string, data: unknown): void {
    // Early exit if handler is disposed (prevents errors during cleanup)
    if (this.isDisposed) {
      return;
    }

    try {
      // Check if panel is still valid before posting message
      if (this.panel && this.panel.webview) {
        console.log(`[V2MessageHandler] Sending: ${type}`, data ? 'with data' : 'no data');
        this.panel.webview.postMessage({ type, data });
      } else {
        console.warn(`[V2MessageHandler] Cannot send message '${type}': panel is disposed`);
      }
    } catch (error) {
      // Handle cases where panel is disposed during message send
      console.warn(`[V2MessageHandler] Failed to send message '${type}':`, error);
    }
  }
}
