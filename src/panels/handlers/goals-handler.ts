/**
 * GoalsHandler - Handles session goal management messages
 *
 * Responsibilities:
 * - Get/set/clear session goals
 * - Complete goals
 * - Infer goals with LLM
 * - Auto-trigger goal inference on first prompt
 */

import { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
import { SharedContext } from './shared-context';
import type { WebviewMessageData } from '../../shared/webview-protocol';
import { ExtensionState } from '../../extension-state';
import { AnalyticsEvents } from '../../services/analytics-events';

export class GoalsHandler extends BaseMessageHandler {
  private sharedContext: SharedContext;

  constructor(
    messageSender: MessageSender,
    handlerContext: HandlerContext,
    sharedContext: SharedContext
  ) {
    super(messageSender, handlerContext);
    this.sharedContext = sharedContext;

    // Register callback for auto-triggered goal progress updates
    this.registerProgressUpdateCallback();
  }

  /**
   * Register callback so GoalService can push auto-analyzed progress to webview
   */
  private registerProgressUpdateCallback(): void {
    try {
      const goalService = this.sharedContext.goalService;
      if (goalService && typeof goalService.setProgressUpdateCallback === 'function') {
        goalService.setProgressUpdateCallback((sessionId, progress) => {
          console.log('[GoalsHandler] Auto-analyzed goal progress update:', { sessionId, progress: progress.progress });
          this.send('v2GoalProgressAnalysis', {
            success: true,
            sessionId,
            progress: progress.progress,
            reasoning: progress.reasoning,
            inferredGoal: progress.inferredGoal,
            accomplishments: progress.accomplishments,
            remaining: progress.remaining,
            autoTriggered: true, // Flag to indicate this was auto-triggered
          });
          // Note: Don't call refreshSessionList() here - the v2GoalProgressAnalysis message
          // already updates the specific session via UPDATE_SESSION_GOAL_PROGRESS.
          // Calling refreshSessionList() would overwrite the merged session list with only
          // SessionManagerService sessions, losing UnifiedSessionService sessions.
        });
      }
    } catch (error) {
      // Goal service not available - skip registration
      console.warn('[GoalsHandler] Could not register progress update callback:', error);
    }
  }

  getHandledMessageTypes(): string[] {
    return [
      'v2GetGoalStatus',
      'v2SetGoal',
      'v2CompleteGoal',
      'v2ClearGoal',
      'v2InferGoal',
      'v2MaybeLaterGoal',
      'v2DontAskGoal',
      'v2AnalyzeGoalProgress',
      'editGoal',
      'completeGoal',
    ];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    switch (type) {
      case 'v2GetGoalStatus':
        await this.handleV2GetGoalStatus();
        return true;
      case 'v2SetGoal': {
        const d = data as WebviewMessageData<'v2SetGoal'>;
        await this.handleV2SetGoal(d.goalText);
        return true;
      }
      case 'v2CompleteGoal':
      case 'completeGoal':
        await this.handleV2CompleteGoal();
        return true;
      case 'v2ClearGoal':
        await this.handleV2ClearGoal();
        return true;
      case 'v2InferGoal':
        await this.handleV2InferGoal();
        return true;
      case 'v2MaybeLaterGoal':
        await this.handleV2MaybeLaterGoal();
        return true;
      case 'v2DontAskGoal':
        await this.handleV2DontAskGoal();
        return true;
      case 'v2AnalyzeGoalProgress': {
        const d = data as { sessionId?: string };
        await this.handleV2AnalyzeGoalProgress(d.sessionId);
        return true;
      }
      case 'editGoal':
        this.handleEditGoal();
        return true;
      default:
        return false;
    }
  }

  private async handleV2GetGoalStatus(): Promise<void> {
    try {
      const goalService = this.sharedContext.goalService;
      if (!goalService) {
        this.send('v2GoalStatus', { goal: null, status: null });
        return;
      }
      const status = goalService.getGoalStatus();
      this.send('v2GoalStatus', {
        goal: status?.goalText || null,
        status,
      });
    } catch (error) {
      console.error('[GoalsHandler] Failed to get goal status:', error);
      this.send('v2GoalStatus', { goal: null, status: null });
    }
  }

  private async handleV2SetGoal(goalText: string): Promise<void> {
    if (!goalText) {
      this.send('v2GoalSet', { success: false, error: 'No goal text provided' });
      return;
    }

    try {
      const goalService = this.sharedContext.goalService;
      if (!goalService) {
        this.send('v2GoalSet', { success: false, error: 'Goal service not initialized' });
        return;
      }
      await goalService.setGoal(goalText);
      const status = goalService.getGoalStatus();
      this.send('v2GoalSet', { success: true, status });

      // Track goal set
      ExtensionState.getAnalyticsService().track(AnalyticsEvents.GOAL_SET);

      // Refresh session list so sidebar shows goal as session name (VIB-45)
      await this.refreshSessionList();
    } catch (error) {
      console.error('[GoalsHandler] Failed to set goal:', error);
      this.send('v2GoalSet', { success: false, error: 'Failed to set goal' });
    }
  }

  /**
   * Refresh session list to update sidebar with goal changes
   */
  private async refreshSessionList(): Promise<void> {
    try {
      const sessionManagerService = this.sharedContext.sessionManagerService;
      if (!sessionManagerService) return;

      const allSessions = sessionManagerService.getSessions({});
      const sessions = allSessions.filter(s => s.promptCount > 0);
      const allProjects = sessionManagerService.getAllProjects();
      const projects = allProjects.map(p => ({
        ...p,
        sessions: p.sessions.filter(s => s.promptCount > 0)
      }));

      this.send('v2SessionList', { sessions, projects });
    } catch (error) {
      console.error('[GoalsHandler] Failed to refresh session list:', error);
    }
  }

  private async handleV2CompleteGoal(): Promise<void> {
    try {
      const goalService = this.sharedContext.goalService;
      if (!goalService) {
        this.send('v2GoalCompleted', { success: false, error: 'Goal service not initialized' });
        return;
      }
      await goalService.completeGoal();
      const status = goalService.getGoalStatus();
      this.send('v2GoalCompleted', { success: true, status });
    } catch (error) {
      console.error('[GoalsHandler] Failed to complete goal:', error);
      this.send('v2GoalCompleted', { success: false });
    }
  }

  private async handleV2ClearGoal(): Promise<void> {
    try {
      const goalService = this.sharedContext.goalService;
      if (!goalService) {
        this.send('v2GoalCleared', {});
        return;
      }
      await goalService.clearGoal();
      this.send('v2GoalCleared', {});

      // Refresh session list so sidebar falls back to project name (VIB-45)
      await this.refreshSessionList();
    } catch (error) {
      console.error('[GoalsHandler] Failed to clear goal:', error);
      this.send('v2GoalCleared', {});
    }
  }

  private async handleV2InferGoal(): Promise<void> {
    try {
      const goalService = this.sharedContext.goalService;
      if (!goalService) {
        this.send('v2GoalInference', { inference: null, error: 'Goal service not initialized' });
        return;
      }
      console.log('[GoalsHandler] Inferring goal with LLM...');
      const inference = await goalService.inferGoalWithLLM();
      this.send('v2GoalInference', { inference });
    } catch (error) {
      console.error('[GoalsHandler] Failed to infer goal:', error);
      this.send('v2GoalInference', { inference: null });
    }
  }

  /**
   * Analyze goal progress for a session using LLM
   * Updates the session's goalProgress field and returns the analysis
   */
  private async handleV2AnalyzeGoalProgress(sessionId?: string): Promise<void> {
    try {
      const goalService = this.sharedContext.goalService;
      if (!goalService) {
        this.send('v2GoalProgressAnalysis', { success: false, error: 'Goal service not initialized' });
        return;
      }

      console.log('[GoalsHandler] Analyzing goal progress...', { sessionId });
      const result = await goalService.analyzeGoalProgress(sessionId);

      if (result) {
        this.send('v2GoalProgressAnalysis', {
          success: true,
          sessionId, // Include sessionId so webview can dispatch UPDATE_SESSION_GOAL_PROGRESS
          progress: result.progress,
          reasoning: result.reasoning,
          inferredGoal: result.inferredGoal,
          accomplishments: result.accomplishments,
          remaining: result.remaining,
        });
        // Note: Don't call refreshSessionList() here - the v2GoalProgressAnalysis message
        // already updates the specific session via UPDATE_SESSION_GOAL_PROGRESS.
      } else {
        this.send('v2GoalProgressAnalysis', { success: false, error: 'Analysis failed' });
      }
    } catch (error) {
      console.error('[GoalsHandler] Failed to analyze goal progress:', error);
      this.send('v2GoalProgressAnalysis', { success: false, error: 'Analysis failed' });
    }
  }

  /**
   * Handle "Maybe Later" response to goal inference
   * Sets a cooldown period before showing goal inference prompt again
   */
  private async handleV2MaybeLaterGoal(): Promise<void> {
    try {
      const goalService = this.sharedContext.goalService;
      if (goalService) {
        // Increase the delay before next goal suggestion
        goalService.setConfig({ noGoalSuggestionDelayMinutes: 30 });
      }
      this.send('v2GoalInferenceDismissed', { reason: 'maybe_later' });

      // Track "Maybe Later" click
      ExtensionState.getAnalyticsService().track(AnalyticsEvents.GOAL_INFERENCE_MAYBE_LATER);
    } catch (error) {
      console.error('[GoalsHandler] Failed to handle maybe later:', error);
    }
  }

  /**
   * Handle "Don't Ask" response to goal inference
   * Disables automatic goal inference prompts for this session
   */
  private async handleV2DontAskGoal(): Promise<void> {
    try {
      const goalService = this.sharedContext.goalService;
      if (goalService) {
        // Set a very long delay to effectively disable auto-inference for this session
        goalService.setConfig({ noGoalSuggestionDelayMinutes: 999999 });
      }
      this.send('v2GoalInferenceDismissed', { reason: 'dont_ask' });

      // Track "Don't ask again" click
      ExtensionState.getAnalyticsService().track(AnalyticsEvents.GOAL_INFERENCE_DONT_ASK);
    } catch (error) {
      console.error('[GoalsHandler] Failed to handle dont ask:', error);
    }
  }

  private handleEditGoal(): void {
    const goalService = this.sharedContext.goalService;
    if (!goalService) {
      this.send('openGoalEditor', { currentGoal: null });
      return;
    }
    const status = goalService.getGoalStatus();
    this.send('openGoalEditor', { currentGoal: status?.goalText });
  }

  /**
   * Trigger goal inference automatically when:
   * - This is the first prompt in the session
   * - No goal is currently set
   *
   * Public method so it can be called from V2MessageHandler after prompts are analyzed
   */
  public triggerGoalInferenceIfNeeded(): void {
    try {
      const goalService = this.sharedContext.goalService;
      if (!goalService) {
        console.error('[GoalsHandler] Goal service not initialized');
        return;
      }
      const sessionManagerService = this.sharedContext.sessionManagerService;
      const status = goalService.getGoalStatus();

      // Skip if goal already set
      if (status.hasGoal) {
        return;
      }

      // Get session info
      const session = sessionManagerService?.getActiveSession();
      if (!session) {
        return;
      }

      // Only trigger on first prompt
      if (session.prompts.length !== 1) {
        return;
      }

      console.log('[GoalsHandler] First prompt detected, triggering async LLM goal inference');

      // Infer goal from the first prompt (async with LLM - runs in background)
      goalService.inferGoalWithLLM().then((inference) => {
        if (inference && inference.suggestedGoal) {
          console.log('[GoalsHandler] LLM goal inferred:', inference.suggestedGoal);
          this.send('v2GoalInference', {
            suggestedGoal: inference.suggestedGoal,
            confidence: inference.confidence,
            detectedTheme: inference.detectedTheme
          });
        }
      }).catch((error) => {
        console.error('[GoalsHandler] Async goal inference failed:', error);
      });
    } catch (error) {
      console.error('[GoalsHandler] Failed to trigger goal inference:', error);
    }
  }
}
