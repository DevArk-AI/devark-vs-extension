/**
 * PromptAnalysisHandler - Handles prompt scoring and enhancement messages
 *
 * Responsibilities:
 * - Analyze prompts with parallel LLM calls
 * - Score prompts using V2 multi-dimension scoring
 * - Enhance prompts with improvement suggestions
 * - Handle "Use this" button for prompt injection
 * - Toggle auto-analyze feature
 */

import * as vscode from 'vscode';
import { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
import { SharedContext } from './shared-context';
import { ExtensionState, isCursorIDE } from '../../extension-state';
import type { AnalyzedPrompt } from '../../storage/PromptHistoryStore';
import type { WebviewMessageData } from '../../shared/webview-protocol';
import type { IUnifiedSettingsService } from '../../services/UnifiedSettingsService';
import type { SessionSource } from '../../services/UnifiedSessionService';
import { gatherPromptContext } from '../../services/context-utils';
import { AnalyticsEvents } from '../../services/analytics-events';
import { getNotificationService } from '../../services/NotificationService';

export class PromptAnalysisHandler extends BaseMessageHandler {
  private sharedContext: SharedContext;
  private _settingsService: IUnifiedSettingsService | null = null;

  constructor(
    messageSender: MessageSender,
    handlerContext: HandlerContext,
    sharedContext: SharedContext
  ) {
    super(messageSender, handlerContext);
    this.sharedContext = sharedContext;
  }

  private get settingsService(): IUnifiedSettingsService {
    if (!this._settingsService) {
      this._settingsService = ExtensionState.getUnifiedSettingsService();
    }
    return this._settingsService;
  }

  getHandledMessageTypes(): string[] {
    return [
      'analyzePrompt',
      'useImprovedPrompt',
      'toggleAutoAnalyze',
      'getAutoAnalyzeStatus',
      'toggleResponseAnalysis',
      'getResponseAnalysisStatus',
    ];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    switch (type) {
      case 'analyzePrompt': {
        const d = data as WebviewMessageData<'analyzePrompt'>;
        await this.handleAnalyzePrompt(d.prompt, d.regenerate);
        return true;
      }
      case 'useImprovedPrompt': {
        const d = data as WebviewMessageData<'useImprovedPrompt'>;
        await this.handleUseImprovedPrompt(d.prompt, d.source, d.sessionId);
        return true;
      }
      case 'toggleAutoAnalyze': {
        const d = data as WebviewMessageData<'toggleAutoAnalyze'>;
        await this.handleToggleAutoAnalyze(d.enabled);
        return true;
      }
      case 'getAutoAnalyzeStatus':
        await this.handleGetAutoAnalyzeStatus();
        return true;
      case 'toggleResponseAnalysis': {
        const d = data as WebviewMessageData<'toggleResponseAnalysis'>;
        await this.handleToggleResponseAnalysis(d.enabled);
        return true;
      }
      case 'getResponseAnalysisStatus':
        await this.handleGetResponseAnalysisStatus();
        return true;
      default:
        return false;
    }
  }

  /**
   * Analyze a prompt with parallel LLM calls
   * Fires score, enhance, and goal inference in parallel, streaming results as they arrive
   */
  private async handleAnalyzePrompt(prompt: string, _regenerate: boolean = false): Promise<void> {
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager) {
      getNotificationService().error('No LLM provider configured');
      return;
    }

    const activeProvider = llmManager.getActiveProvider();
    if (!activeProvider) {
      getNotificationService().error('No active LLM provider');
      return;
    }

    try {
      const { PromptScorer } = await import('../../copilot/prompt-scorer');
      const { PromptEnhancer } = await import('../../copilot/prompt-enhancer');

      const scorer = new PromptScorer(llmManager);
      const enhancer = new PromptEnhancer(llmManager);
      const promptId = Date.now().toString();

      // Gather context for more targeted scoring (includes session correspondence)
      const context = await gatherPromptContext(prompt, '[PromptAnalysisHandler]');

      // FIRE ALL 3 LLM CALLS IN PARALLEL - Stream results as they arrive

      // 1. FIRE: Score prompt (stream result when ready)
      const scorePromise = scorer.scorePromptV2(prompt, undefined, context).then((result) => {
        console.log(`[PromptAnalysisHandler] Score ready: ${result.overall / 10} - streaming to UI`);

        // Track prompt scoring
        ExtensionState.getAnalyticsService().track(AnalyticsEvents.PROMPT_SCORED, {
          score: result.overall / 10,
          provider: llmManager.getActiveProviderInfo()?.type || 'unknown',
        });

        this.send('scoreReceived', {
          score: result.overall / 10,
          categoryScores: {
            clarity: result.clarity,
            specificity: result.specificity,
            context: result.context,
            actionability: result.actionability,
          },
          breakdown: result.breakdown,
          explanation: result.explanation,
        });
        return result;
      });

      // 2. FIRE: Enhance prompt (stream result when ready, then score enhanced)
      const enhancePromise = enhancer.enhancePrompt(prompt, 'medium', undefined, context).then(async (result) => {
        console.log(`[PromptAnalysisHandler] Enhancement ready - streaming to UI`);

        // Track prompt enhancement
        ExtensionState.getAnalyticsService().track(AnalyticsEvents.PROMPT_ENHANCED, {
          level: 'medium',
          provider: llmManager.getActiveProviderInfo()?.type || 'unknown',
        });

        this.send('enhancedPromptReady', {
          promptId,
          improvedVersion: result.enhanced,
        });

        const enhScore = await scorer.scorePrompt(result.enhanced);
        console.log(`[PromptAnalysisHandler] Enhanced score ready: ${enhScore.overall / 10}`);

        this.send('enhancedScoreReady', {
          promptId,
          improvedScore: enhScore.overall / 10,
        });
        return { enhanced: result, enhancedScore: enhScore };
      });

      // 3. FIRE: Infer goal (stream result when ready)
      const goalService = this.sharedContext.goalService;
      const goalPromise = goalService?.inferGoalWithLLM().then((inference) => {
        if (inference && inference.suggestedGoal) {
          console.log(`[PromptAnalysisHandler] Goal inference ready: ${inference.suggestedGoal}`);
          this.send('v2GoalInference', {
            suggestedGoal: inference.suggestedGoal,
            confidence: inference.confidence,
            detectedTheme: inference.detectedTheme,
          });
        }
        return inference;
      }).catch((error) => {
        console.warn('[PromptAnalysisHandler] Goal inference failed (non-blocking):', error);
        return null;
      }) ?? Promise.resolve(null);

      // Wait for all to complete
      const [scoreResult, enhanceResult] = await Promise.all([
        scorePromise.catch(() => null),
        enhancePromise.catch(() => null),
        goalPromise,
      ]);

      if (!scoreResult) {
        console.error('[PromptAnalysisHandler] Scoring failed - cannot complete analysis');
        getNotificationService().error('Analysis failed: Scoring did not complete');
        return;
      }

      // Create analyzed prompt object with V2 breakdown and explanation
      const analyzedPrompt: AnalyzedPrompt = {
        id: promptId,
        text: prompt,
        truncatedText: prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt,
        score: scoreResult.overall / 10,
        timestamp: new Date(),
        categoryScores: {
          clarity: scoreResult.clarity,
          specificity: scoreResult.specificity,
          context: scoreResult.context,
          actionability: scoreResult.actionability,
        },
        quickWins: scoreResult.suggestions.slice(0, 3).map((s: string) => s.split(' ').slice(0, 3).join(' ')),
        improvedVersion: enhanceResult?.enhanced?.enhanced,
        improvedScore: enhanceResult?.enhancedScore ? enhanceResult.enhancedScore.overall / 10 : undefined,
        breakdown: scoreResult.breakdown,
        explanation: scoreResult.explanation,
      };

      // Save to persistent storage
      const promptHistoryStore = this.sharedContext.promptHistoryStore;
      if (promptHistoryStore) {
        await promptHistoryStore.addPrompt(analyzedPrompt);
      }

      // Update status bar
      this.sharedContext.statusBarManager?.addPromptScore(analyzedPrompt.score);

      // Send final result to webview
      const stats = promptHistoryStore?.getDailyStats() || { analyzedToday: 0, avgScore: 0 };
      this.send('analysisComplete', {
        prompt: analyzedPrompt,
        analyzedToday: stats.analyzedToday,
        avgScore: stats.avgScore,
      });
    } catch (error) {
      console.error('[PromptAnalysisHandler] Analysis failed:', error);
      getNotificationService().error(
        `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle "Use this prompt" button - inject improved prompt into Cursor/Claude Code
   *
   * Uses ChatInjector to programmatically inject the improved prompt directly
   * into the chat input, auto-detecting the source tool (Cursor or Claude Code).
   *
   * Fallback strategy:
   * 1. If source is 'cursor' or running in Cursor IDE -> inject into Cursor composer
   * 2. If source is 'claude_code' -> copy to clipboard with notification
   * 3. Unknown source -> copy to clipboard with generic message
   */
  private async handleUseImprovedPrompt(
    prompt: string,
    source: SessionSource | undefined,
    sessionId?: string
  ): Promise<void> {
    if (!prompt) {
      console.warn('[PromptAnalysisHandler] Cannot inject empty prompt');
      return;
    }

    console.log(`[PromptAnalysisHandler] Use improved prompt - source: ${source}, sessionId: ${sessionId}`);
    const chatInjector = this.sharedContext.chatInjector;

    if (source === 'cursor' || isCursorIDE()) {
      if (chatInjector) {
        const success = await chatInjector.injectIntoCursor(prompt);
        if (success) {
          getNotificationService().info('Prompt injected into Cursor chat');
        } else {
          await vscode.env.clipboard.writeText(prompt);
          getNotificationService().warn('Could not inject - prompt copied to clipboard');
        }
      } else {
        await vscode.env.clipboard.writeText(prompt);
        getNotificationService().info('Prompt copied to clipboard');
      }
    } else if (source === 'claude_code') {
      if (chatInjector) {
        await chatInjector.injectIntoClaudeCode(prompt);
      } else {
        await vscode.env.clipboard.writeText(prompt);
        getNotificationService().info('Prompt copied to clipboard');
      }
    } else {
      await vscode.env.clipboard.writeText(prompt);
      getNotificationService().info('Prompt copied to clipboard');
    }
  }

  /**
   * Toggle auto-analyze feature - manages hooks for both Claude Code and Cursor
   */
  private async handleToggleAutoAnalyze(enabled: boolean): Promise<void> {
    await this.settingsService.set('autoAnalyze.enabled', enabled);

    // Track auto-analyze prompt toggle
    ExtensionState.getAnalyticsService().track(AnalyticsEvents.AUTO_ANALYZE_PROMPT_TOGGLED, {
      enabled,
    });

    const claudeInstaller = ExtensionState.getClaudeHookInstaller();
    const cursorInstaller = ExtensionState.getCursorHookInstaller();
    const isCursor = isCursorIDE();

    // Manage Claude Code hooks
    try {
      if (enabled) {
        console.log('[PromptAnalysisHandler] Installing Claude Code hooks (UserPromptSubmit + Stop)...');
        await claudeInstaller.install({
          hooks: ['UserPromptSubmit', 'Stop'],
          mode: 'all',
        });
      } else {
        console.log('[PromptAnalysisHandler] Uninstalling Claude Code hooks...');
        await claudeInstaller.uninstallHook('UserPromptSubmit');
        await claudeInstaller.uninstallHook('Stop');
      }
    } catch (error) {
      console.error('[PromptAnalysisHandler] Failed to manage Claude Code hooks:', error);
    }

    // Manage Cursor hooks (if running in Cursor)
    if (isCursor) {
      try {
        if (enabled) {
          console.log('[PromptAnalysisHandler] Installing Cursor hooks (beforeSubmitPrompt + stop)...');
          await cursorInstaller.install({
            hooks: ['UserPromptSubmit', 'Stop'],
            mode: 'all',
          });
        } else {
          console.log('[PromptAnalysisHandler] Uninstalling Cursor hooks...');
          await cursorInstaller.uninstall();
        }
      } catch (error) {
        console.error('[PromptAnalysisHandler] Failed to manage Cursor hooks:', error);
      }
    }

    // Start or stop unified prompt detection service
    const promptDetectionService = this.sharedContext.promptDetectionService;
    if (promptDetectionService) {
      try {
        if (enabled) {
          console.log('[PromptAnalysisHandler] Starting prompt detection...');
          await promptDetectionService.initialize();
          promptDetectionService.updateConfig({ enabled: true, autoAnalyze: true });
          await promptDetectionService.start();
          const status = promptDetectionService.getStatus();
          getNotificationService().info(`Auto-analyze enabled! ${status.activeAdapters} adapters active.`);
        } else {
          console.log('[PromptAnalysisHandler] Stopping prompt detection...');
          promptDetectionService.updateConfig({ enabled: false });
          promptDetectionService.stop();
          getNotificationService().info('Auto-analyze disabled.');
        }
      } catch (error) {
        console.error('[PromptAnalysisHandler] Failed to toggle prompt detection:', error);
        getNotificationService().error(
          `Failed to ${enabled ? 'enable' : 'disable'} auto-analyze: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }
  }

  /**
   * Get current auto-analyze status
   */
  private async handleGetAutoAnalyzeStatus(): Promise<void> {
    const promptDetectionService = this.sharedContext.promptDetectionService;
    const enabled = promptDetectionService?.getStatus().enabled ?? false;
    this.send('autoAnalyzeStatus', {
      enabled,
      useHookBased: true,
    });
  }

  /**
   * Toggle response analysis (coaching) enabled state
   */
  private async handleToggleResponseAnalysis(enabled: boolean): Promise<void> {
    await this.settingsService.set('responseAnalysis.enabled', enabled);

    // Track auto-analyze response toggle
    ExtensionState.getAnalyticsService().track(AnalyticsEvents.AUTO_ANALYZE_RESPONSE_TOGGLED, {
      enabled,
    });

    this.send('responseAnalysisStatus', { enabled });
    getNotificationService().info(
      enabled ? 'Response analysis enabled.' : 'Response analysis disabled.'
    );
  }

  /**
   * Get current response analysis status
   */
  private async handleGetResponseAnalysisStatus(): Promise<void> {
    const enabled = this.settingsService.getWithDefault('responseAnalysis.enabled', true);
    this.send('responseAnalysisStatus', { enabled });
  }
}
