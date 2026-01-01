import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatsHandler } from '../stats-handler';
import { SharedContext } from '../shared-context';
import type { MessageSender } from '../base-handler';
import type * as vscode from 'vscode';

const mockUri = { fsPath: '/test/path' } as vscode.Uri;

vi.mock('../../../extension-state', () => ({
  ExtensionState: {
    getLLMManager: vi.fn().mockReturnValue({
      getProviderForFeature: vi.fn().mockReturnValue(null),
      getActiveProvider: vi.fn().mockReturnValue({
        id: 'mock-provider',
        generateCompletion: vi.fn(),
      }),
    }),
  },
}));

vi.mock('../../../copilot/prompt-scorer', () => ({
  PromptScorer: vi.fn().mockImplementation(() => ({
    scorePromptV2: vi.fn().mockResolvedValue({
      overall: 75,
      breakdown: {
        specificity: { score: 7, weight: 0.2 },
        context: { score: 8, weight: 0.25 },
        intent: { score: 7, weight: 0.25 },
        actionability: { score: 8, weight: 0.15 },
        constraints: { score: 7, weight: 0.15 },
        total: 75,
      },
      explanation: {},
    }),
  })),
}));

describe('StatsHandler', () => {
  let handler: StatsHandler;
  let mockSender: MessageSender;
  let sharedContext: SharedContext;

  beforeEach(() => {
    mockSender = { sendMessage: vi.fn() };
    sharedContext = new SharedContext();

    sharedContext.sessionManagerService = {
      addPrompt: vi.fn().mockResolvedValue({ id: 'prompt-1', text: 'test', score: 75 }),
    } as unknown as SharedContext['sessionManagerService'];

    sharedContext.dailyStatsService = {
      getDailyStats: vi.fn().mockReturnValue({
        averageScore: 7.5,
        totalPrompts: 10,
        historicalAverage: 7.0,
        deltaVsTypical: 0.5,
      }),
      getWeeklyTrend: vi.fn().mockReturnValue([
        { date: '2024-01-15', averageScore: 7.5, promptCount: 5 },
        { date: '2024-01-16', averageScore: 8.0, promptCount: 3 },
      ]),
      getStreak: vi.fn().mockReturnValue({ currentStreak: 3, longestStreak: 7 }),
      getMonthlyStats: vi.fn().mockReturnValue({
        totalPrompts: 100,
        averageScore: 7.2,
        activeDays: 20,
        bestDay: '2024-01-15',
        bestDayScore: 8.5,
      }),
      recordScore: vi.fn().mockResolvedValue(undefined),
    } as unknown as SharedContext['dailyStatsService'];

    sharedContext.suggestionEngine = {
      analyzePrompt: vi.fn().mockReturnValue(null),
    } as unknown as SharedContext['suggestionEngine'];

    handler = new StatsHandler(
      mockSender,
      { extensionUri: mockUri, context: {} as vscode.ExtensionContext },
      sharedContext
    );
  });

  describe('getHandledMessageTypes', () => {
    it('should return correct message types', () => {
      const types = handler.getHandledMessageTypes();
      expect(types).toContain('v2AnalyzePromptV2');
      expect(types).toContain('v2GetWeeklyTrend');
      expect(types).toContain('v2GetStreak');
      expect(types).toContain('v2GetPersonalComparison');
      expect(types).toHaveLength(4);
    });
  });

  describe('handleMessage', () => {
    it('should handle v2GetWeeklyTrend', async () => {
      const result = await handler.handleMessage('v2GetWeeklyTrend', {});
      expect(result).toBe(true);
      expect(sharedContext.dailyStatsService!.getWeeklyTrend).toHaveBeenCalled();
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2WeeklyTrend', {
        trend: expect.any(Array),
      });
    });

    it('should handle v2GetStreak', async () => {
      const result = await handler.handleMessage('v2GetStreak', {});
      expect(result).toBe(true);
      expect(sharedContext.dailyStatsService!.getStreak).toHaveBeenCalled();
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2Streak', {
        currentStreak: 3,
        longestStreak: 7,
      });
    });

    it('should handle v2GetPersonalComparison', async () => {
      const result = await handler.handleMessage('v2GetPersonalComparison', {});
      expect(result).toBe(true);
      expect(sharedContext.dailyStatsService!.getDailyStats).toHaveBeenCalled();
      expect(sharedContext.dailyStatsService!.getMonthlyStats).toHaveBeenCalled();
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2PersonalComparison', {
        comparison: expect.objectContaining({
          todayScore: 7.5,
          historicalAverage: 7.0,
          isAboveAverage: true,
        }),
      });
    });

    it('should handle v2AnalyzePromptV2 without prompt gracefully', async () => {
      const result = await handler.handleMessage('v2AnalyzePromptV2', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2AnalysisResult', {
        error: 'No prompt provided',
      });
    });

    it('should return false for unhandled message types', async () => {
      const result = await handler.handleMessage('unknownType', {});
      expect(result).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle missing dailyStatsService in v2GetWeeklyTrend', async () => {
      sharedContext.dailyStatsService = undefined;
      const result = await handler.handleMessage('v2GetWeeklyTrend', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2WeeklyTrend', { trend: [] });
    });

    it('should handle missing dailyStatsService in v2GetStreak', async () => {
      sharedContext.dailyStatsService = undefined;
      const result = await handler.handleMessage('v2GetStreak', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2Streak', {
        currentStreak: 0,
        longestStreak: 0,
      });
    });

    it('should handle missing dailyStatsService in v2GetPersonalComparison', async () => {
      sharedContext.dailyStatsService = undefined;
      const result = await handler.handleMessage('v2GetPersonalComparison', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2PersonalComparison', {
        comparison: null,
        error: 'Stats service not initialized',
      });
    });
  });
});
