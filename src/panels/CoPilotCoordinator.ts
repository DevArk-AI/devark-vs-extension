/**
 * CoPilotCoordinator - Centralized Co-Pilot service coordination
 *
 * Manages all Co-Pilot V2 services in one place:
 * - SessionManagerService (session tracking)
 * - DailyStatsService (daily stats)
 * - GoalService (goal tracking)
 * - SuggestionEngine (AI suggestions)
 * - ContextExtractor (tech stack extraction)
 * - CoPilotStorageManager (persistence)
 * - CoachingService (coaching suggestions)
 * - HookBasedPromptService (response detection)
 */

import * as vscode from 'vscode';
import { SessionManagerService, getSessionManager } from '../services/SessionManagerService';
import { DailyStatsService, getDailyStatsService } from '../services/DailyStatsService';
import { GoalService, getGoalService } from '../services/GoalService';
import { SuggestionEngine, getSuggestionEngine, Suggestion } from '../services/SuggestionEngine';
import { ContextExtractor, getContextExtractor } from '../services/ContextExtractor';
import { CoPilotStorageManager } from '../copilot/storage';
import { getCoachingService } from '../services/CoachingService';
import { getHookBasedPromptService, CapturedPrompt } from '../services/HookBasedPromptService';
import type { CapturedResponse, ConversationState } from '../services/types/response-types';
import type { SharedContext } from './handlers/shared-context';
import type { GoalsHandler } from './handlers/goals-handler';
import type { SessionHandler } from './handlers/session-handler';
import { ExtensionState } from '../extension-state';

export interface MessageSender {
  sendMessage(type: string, data: unknown): void;
}

export interface HandlerFinder {
  getGoalsHandler(): GoalsHandler | undefined;
  getSessionHandler(): SessionHandler | undefined;
}

export class CoPilotCoordinator {
  // Co-Pilot V2 Services
  private sessionManagerService: SessionManagerService;
  private dailyStatsService: DailyStatsService;
  private goalService: GoalService;
  private suggestionEngine: SuggestionEngine;
  private contextExtractor: ContextExtractor;
  private storageManager?: CoPilotStorageManager;

  // Subscription handles
  private suggestionUnsubscribe?: () => void;
  private sessionEventUnsubscribe?: () => void;
  private coachingUnsubscribe?: () => void;

  // References for callbacks
  private messageSender?: MessageSender;
  private handlerFinder?: HandlerFinder;

  constructor() {
    // Initialize Co-Pilot V2 Services (singletons)
    this.sessionManagerService = getSessionManager();
    this.dailyStatsService = getDailyStatsService();
    this.goalService = getGoalService();
    this.suggestionEngine = getSuggestionEngine();
    this.contextExtractor = getContextExtractor();
  }

  /**
   * Get singleton services for use by handlers
   */
  public getServices() {
    return {
      sessionManagerService: this.sessionManagerService,
      dailyStatsService: this.dailyStatsService,
      goalService: this.goalService,
      suggestionEngine: this.suggestionEngine,
      contextExtractor: this.contextExtractor,
    };
  }

  /**
   * Initialize Co-Pilot services and set up subscriptions
   */
  public async initialize(
    context: vscode.ExtensionContext,
    messageSender: MessageSender,
    handlerFinder: HandlerFinder,
    sharedContext: SharedContext
  ): Promise<void> {
    this.messageSender = messageSender;
    this.handlerFinder = handlerFinder;

    // Populate SharedContext with Co-Pilot services
    sharedContext.goalService = this.goalService;
    sharedContext.sessionManagerService = this.sessionManagerService;
    sharedContext.dailyStatsService = this.dailyStatsService;

    // Initialize CoPilot Storage Manager for persistent storage
    this.storageManager = new CoPilotStorageManager(context);
    await this.storageManager.initialize();

    // Connect storage manager to CoachingService for disk persistence
    const coachingService = getCoachingService();
    coachingService.setStorageManager(this.storageManager);
    // Reset any stale processing state from previous sessions
    coachingService.resetProcessingState();
    console.log('[CoPilotCoordinator] Storage manager initialized and connected to coaching service');

    // Initialize Co-Pilot V2 Services
    try {
      await this.sessionManagerService.initialize(context);
      await this.dailyStatsService.initialize(context);
      await this.suggestionEngine.initialize(context);

      // Subscribe to suggestions and forward to webview
      this.suggestionUnsubscribe = this.suggestionEngine.subscribe((suggestion: Suggestion) => {
        this.messageSender?.sendMessage('v2Suggestion', { suggestion });
      });

      // Subscribe to session events and forward to webview
      this.sessionEventUnsubscribe = this.sessionManagerService.subscribe((event) => {
        console.log('[CoPilotCoordinator] Session event:', event.type);

        // Push updated data to webview based on event type
        switch (event.type) {
          case 'session_created':
          case 'session_activity':
          case 'project_created':
            // Refresh session list and active session via SessionHandler
            this.handlerFinder?.getSessionHandler()?.handleMessage('v2GetActiveSession', {});
            this.handlerFinder?.getSessionHandler()?.handleMessage('v2GetSessionList', {});
            break;
          case 'session_updated':
            // Refresh session list when sessions are updated (goalProgress, customName, etc.)
            this.handlerFinder?.getSessionHandler()?.handleMessage('v2GetSessionList', {});
            break;
          case 'prompt_added':
            // Refresh prompts and daily stats via SessionHandler
            this.handlerFinder?.getSessionHandler()?.handleMessage('v2GetActiveSession', {});
            this.handlerFinder?.getSessionHandler()?.handleMessage('v2GetSessionList', {});
            this.handlerFinder?.getSessionHandler()?.handleMessage('v2GetDailyStats', {});
            // Trigger goal inference on first prompt if no goal set
            this.handlerFinder?.getGoalsHandler()?.triggerGoalInferenceIfNeeded();
            break;
          case 'goal_set':
          case 'goal_completed':
            // Refresh goal status - send status directly to webview
            this.sendGoalStatusToWebview();
            break;
        }
      });

      // Subscribe to coaching updates and forward to webview
      this.coachingUnsubscribe = coachingService.subscribe((coaching) => {
        console.log('[CoPilotCoordinator] Coaching update:', coaching.suggestions.length, 'suggestions');
        if (this.messageSender) {
          console.log('[CoPilotCoordinator] Forwarding coaching to webview via messageSender');
          this.messageSender.sendMessage('coachingUpdated', { coaching });
        } else {
          console.warn('[CoPilotCoordinator] Cannot forward coaching - messageSender is null');
        }
      });

      // Wire up HookBasedPromptService response events to CoachingService
      const hookService = getHookBasedPromptService();

      hookService.on('responseDetected', async (data: { response: CapturedResponse; linkedPrompt?: CapturedPrompt }) => {
        // Check if response analysis is enabled
        const settingsService = ExtensionState.getUnifiedSettingsService();
        const responseAnalysisEnabled = settingsService.getWithDefault('responseAnalysis.enabled', true);
        if (!responseAnalysisEnabled) {
          console.log('[CoPilotCoordinator] Response analysis disabled, skipping coaching');
          return;
        }

        console.log('[CoPilotCoordinator] Response detected, triggering coaching:', data.response.id);
        try {
          await coachingService.processResponse(data.response, data.linkedPrompt);
        } catch (error) {
          console.error('[CoPilotCoordinator] Coaching processing failed:', error);
        }
      });

      // Listen for final responses (from stop hook)
      hookService.on('finalResponseDetected', async (data: {
        response: CapturedResponse;
        linkedPrompt?: CapturedPrompt;
        conversationState: ConversationState | null;
      }) => {
        console.log('[CoPilotCoordinator] Final response detected:', data.response.id);

        this.messageSender?.sendMessage('finalResponseDetected', {
          id: data.response.id,
          source: data.response.source,
          stopReason: data.response.stopReason,
          loopCount: data.response.loopCount,
          success: data.response.success,
          conversationId: data.response.conversationId,
          timestamp: data.response.timestamp,
          conversationState: data.conversationState,
          linkedPromptId: data.linkedPrompt?.id,
          linkedPromptText: data.linkedPrompt?.prompt?.substring(0, 200),
        });
      });

      // Start the hook service to begin watching for response files
      await hookService.initialize();
      await hookService.start();
      console.log('[CoPilotCoordinator] HookBasedPromptService started for response detection');

      console.log('[CoPilotCoordinator] Co-Pilot V2 services initialized successfully');
    } catch (error) {
      console.error('[CoPilotCoordinator] Failed to initialize Co-Pilot V2 services:', error);
    }
  }

  /**
   * Send current goal status to webview
   */
  public sendGoalStatusToWebview(): void {
    if (!this.messageSender) return;

    try {
      const status = this.goalService.getGoalStatus();
      this.messageSender.sendMessage('v2GoalStatus', {
        goal: status?.goalText || null,
        status,
      });
    } catch (error) {
      console.error('[CoPilotCoordinator] Failed to send goal status:', error);
      this.messageSender.sendMessage('v2GoalStatus', { goal: null, status: null });
    }
  }

  /**
   * Push initial session data to webview
   */
  public pushInitialData(): void {
    try {
      console.log('[CoPilotCoordinator] Pushing initial session data to webview');
      this.handlerFinder?.getSessionHandler()?.handleMessage('v2GetActiveSession', {});
      this.handlerFinder?.getSessionHandler()?.handleMessage('v2GetSessionList', { limit: 20 });
      this.handlerFinder?.getSessionHandler()?.handleMessage('v2GetDailyStats', {});
      this.sendGoalStatusToWebview();

      // Trigger goal progress analysis for top cockpit sessions (non-blocking, runs once on init)
      this.triggerCockpitSessionsAnalysis();
    } catch (error) {
      console.error('[CoPilotCoordinator] Failed to push initial data:', error);
    }
  }

  /**
   * Trigger goal progress analysis for top 3 cockpit sessions
   * Called once during initialization
   */
  private triggerCockpitSessionsAnalysis(): void {
    try {
      const sessions = this.sessionManagerService.getSessions();
      if (sessions.length > 0 && this.goalService) {
        // Fire and forget - don't await
        this.goalService.analyzeTopSessionsOnLoad(sessions).catch((error) => {
          console.warn('[CoPilotCoordinator] Cockpit sessions analysis failed:', error);
        });
      }
    } catch (error) {
      console.warn('[CoPilotCoordinator] Cockpit sessions analysis setup failed:', error);
    }
  }

  /**
   * Handle v2GetSessionContext message
   */
  public handleGetSessionContext(): void {
    if (!this.messageSender) return;

    try {
      const context = this.contextExtractor.extractSessionContext();
      this.messageSender.sendMessage('v2SessionContext', { context });
    } catch (error) {
      console.error('[CoPilotCoordinator] Failed to get session context:', error);
      this.messageSender.sendMessage('v2SessionContext', { context: null });
    }
  }

  /**
   * Handle v2GetContextSummary message
   */
  public handleGetContextSummary(): void {
    if (!this.messageSender) return;

    try {
      const summary = this.contextExtractor.getContextSummary();
      this.messageSender.sendMessage('v2ContextSummary', { summary });
    } catch (error) {
      console.error('[CoPilotCoordinator] Failed to get context summary:', error);
      this.messageSender.sendMessage('v2ContextSummary', { summary: null });
    }
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    // Clean up suggestion subscription
    if (this.suggestionUnsubscribe) {
      this.suggestionUnsubscribe();
      this.suggestionUnsubscribe = undefined;
    }
    // Clean up session event subscription
    if (this.sessionEventUnsubscribe) {
      this.sessionEventUnsubscribe();
      this.sessionEventUnsubscribe = undefined;
    }
    // Clean up coaching subscription
    if (this.coachingUnsubscribe) {
      this.coachingUnsubscribe();
      this.coachingUnsubscribe = undefined;
    }

    this.messageSender = undefined;
    this.handlerFinder = undefined;
  }
}
