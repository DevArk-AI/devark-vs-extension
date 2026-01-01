/**
 * StatsHandler - Handles statistics and prompt analysis messages
 *
 * Responsibilities:
 * - Analyze prompts with full scoring (v2AnalyzePromptV2)
 * - Get weekly trend data
 * - Get streak data
 * - Get personal comparison stats
 */

import { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
import { SharedContext } from './shared-context';
import { ExtensionState } from '../../extension-state';
import { PromptScorer } from '../../copilot/prompt-scorer';
import type { WebviewMessageData } from '../../shared/webview-protocol';

export class StatsHandler extends BaseMessageHandler {
  private sharedContext: SharedContext;

  constructor(
    messageSender: MessageSender,
    handlerContext: HandlerContext,
    sharedContext: SharedContext
  ) {
    super(messageSender, handlerContext);
    this.sharedContext = sharedContext;
  }

  getHandledMessageTypes(): string[] {
    return [
      'v2AnalyzePromptV2',
      'v2GetWeeklyTrend',
      'v2GetStreak',
      'v2GetPersonalComparison',
    ];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    switch (type) {
      case 'v2AnalyzePromptV2': {
        const d = data as WebviewMessageData<'v2AnalyzePromptV2'>;
        await this.handleV2AnalyzePrompt(d.prompt);
        return true;
      }
      case 'v2GetWeeklyTrend':
        await this.handleV2GetWeeklyTrend();
        return true;
      case 'v2GetStreak':
        await this.handleV2GetStreak();
        return true;
      case 'v2GetPersonalComparison':
        await this.handleV2GetPersonalComparison();
        return true;
      default:
        return false;
    }
  }

  private async handleV2AnalyzePrompt(promptText: string): Promise<void> {
    if (!promptText) {
      this.send('v2AnalysisResult', { error: 'No prompt provided' });
      return;
    }

    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager) {
      this.send('v2AnalysisResult', { error: 'No LLM provider available' });
      return;
    }

    const scorerProvider = llmManager.getProviderForFeature('scoring') || llmManager.getActiveProvider();
    if (!scorerProvider) {
      this.send('v2AnalysisResult', { error: 'No LLM provider available' });
      return;
    }

    const scorer = new PromptScorer(scorerProvider);
    const result = await scorer.scorePromptV2(promptText, (progress) => {
      this.send('v2AnalysisProgress', { progress });
    });

    const sessionManagerService = this.sharedContext.sessionManagerService;
    if (!sessionManagerService) {
      this.send('v2AnalysisResult', { error: 'Session service not initialized' });
      return;
    }

    const promptRecord = await sessionManagerService.addPrompt(
      promptText,
      result.breakdown.total,
      {
        specificity: { score: result.breakdown.specificity.score, weight: result.breakdown.specificity.weight },
        context: { score: result.breakdown.context.score, weight: result.breakdown.context.weight },
        intent: { score: result.breakdown.intent.score, weight: result.breakdown.intent.weight },
        actionability: { score: result.breakdown.actionability.score, weight: result.breakdown.actionability.weight },
        constraints: { score: result.breakdown.constraints.score, weight: result.breakdown.constraints.weight },
        total: result.breakdown.total,
      }
    );

    const dailyStatsService = this.sharedContext.dailyStatsService;
    if (dailyStatsService) {
      await dailyStatsService.recordScore(result.breakdown.total);
    }

    const suggestionEngine = this.sharedContext.suggestionEngine;
    const suggestion = suggestionEngine?.analyzePrompt(promptRecord) ?? null;

    this.send('v2AnalysisResult', {
      promptRecord,
      breakdown: result.breakdown,
      explanation: result.explanation,
      suggestion,
    });
  }

  private async handleV2GetWeeklyTrend(): Promise<void> {
    const dailyStatsService = this.sharedContext.dailyStatsService;
    if (!dailyStatsService) {
      this.send('v2WeeklyTrend', { trend: [] });
      return;
    }

    const trend = dailyStatsService.getWeeklyTrend();
    this.send('v2WeeklyTrend', { trend });
  }

  private async handleV2GetStreak(): Promise<void> {
    const dailyStatsService = this.sharedContext.dailyStatsService;
    if (!dailyStatsService) {
      this.send('v2Streak', { currentStreak: 0, longestStreak: 0 });
      return;
    }

    const streak = dailyStatsService.getStreak();
    this.send('v2Streak', streak);
  }

  private async handleV2GetPersonalComparison(): Promise<void> {
    const dailyStatsService = this.sharedContext.dailyStatsService;
    if (!dailyStatsService) {
      this.send('v2PersonalComparison', { comparison: null, error: 'Stats service not initialized' });
      return;
    }

    const stats = dailyStatsService.getDailyStats();
    const monthlyStats = dailyStatsService.getMonthlyStats();
    const streak = dailyStatsService.getStreak();

    const personalComparison = {
      todayScore: stats.averageScore,
      historicalAverage: stats.historicalAverage,
      deltaVsTypical: stats.deltaVsTypical,
      isAboveAverage: stats.deltaVsTypical > 0,
      percentageChange: stats.historicalAverage > 0
        ? Math.round((stats.deltaVsTypical / stats.historicalAverage) * 100)
        : 0,
      monthlyStats: {
        totalPrompts: monthlyStats.totalPrompts,
        averageScore: monthlyStats.averageScore,
        activeDays: monthlyStats.activeDays,
        bestDay: monthlyStats.bestDay,
        bestDayScore: monthlyStats.bestDayScore,
      },
      streak,
    };

    this.send('v2PersonalComparison', { comparison: personalComparison });
  }
}
