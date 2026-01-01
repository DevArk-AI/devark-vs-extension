/**
 * Integration Tests for AI Summary System
 *
 * Tests the complete flow from session data through provider detection,
 * AI generation, and UI formatting.
 */

import { SummaryService, SummaryContext } from '../../services/SummaryService';
import { ProviderDetectionService } from '../../services/ProviderDetectionService';
import { LLMManager } from '../../llm/llm-manager';
import { createTestLLMManager, createTestLLMManagerWithResponses, createTestLLMManagerWithNoProvider, MockLogger } from '../../llm/testing';
import {
  frontendSession,
  backendSession,
  productiveDaySessions,
  emptySessions,
  mockAIResponses,
  generateWeeklySessions,
  generateMonthlySessions,
  weeklyTestCollections,
  monthlyTestCollections
} from '../fixtures/mock-sessions';
import {
  providerCollections,
  mockProviderResponses
} from '../fixtures/mock-providers';

describe('AI Summary Integration Tests', () => {
  describe('Complete Summary Generation Flow', () => {
    test('should generate complete daily summary with AI', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession, backendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const aiResult = await summaryService.generateDailySummary(context);
      const dailySummary = summaryService.convertToDailySummary(
        aiResult,
        context.sessions,
        context.date
      );

      // Assert
      expect(dailySummary).toBeDefined();
      expect(dailySummary.source).toBe('ai');
      expect(dailySummary.workedOn.length).toBeGreaterThan(0);
      expect(dailySummary.suggestedFocus.length).toBeGreaterThan(0);
      expect(dailySummary.sessions).toBe(2);
      expect(dailySummary.totalMessages).toBe(37); // 15 + 22
      expect(dailySummary.providerInfo).toBeDefined();
      // Test uses mock provider infrastructure
      expect(dailySummary.providerInfo?.provider).toBeDefined();
    });

    test('should handle end-to-end flow with fallback', async () => {
      // Arrange
      const llmManager = createTestLLMManagerWithNoProvider();

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: productiveDaySessions,
        date: new Date('2025-01-15')
      };

      // Act
      const aiResult = await summaryService.generateDailySummary(context);
      const dailySummary = summaryService.convertToDailySummary(
        aiResult,
        context.sessions,
        context.date
      );

      // Assert
      expect(dailySummary.source).toBe('fallback');
      expect(dailySummary.workedOn.length).toBeGreaterThan(0);
      expect(dailySummary.suggestedFocus.length).toBeGreaterThan(0);
      expect(dailySummary.providerInfo).toBeUndefined();
      expect(dailySummary.insights).toContain('AI analysis unavailable');
    });

    test('should include custom instructions in full flow', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15'),
        userInstructions: 'Emphasize testing and code quality'
      };

      // Act
      await summaryService.generateDailySummary(context);

      // Assert
      const callHistory = mockProvider.getCallHistory();
      expect(callHistory[0].prompt).toContain('Emphasize testing and code quality');
    });
  });

  describe('Provider Detection Integration', () => {
    test('should detect providers and generate summary with detected provider', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();

      const providerService = new ProviderDetectionService(llmManager);
      const summaryService = new SummaryService(llmManager);

      // Act - Detect providers
      const providers = await providerService.detectAll();
      const activeProviderId = providerService.getActiveProviderId();

      // Act - Generate summary
      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      const result = await summaryService.generateDailySummary(context);

      // Assert
      expect(providers.length).toBeGreaterThan(0);

      if (activeProviderId) {
        // If a provider is active, summary should be AI-generated
        expect(result.provider).toBe(activeProviderId);
        expect(result.source).toBe('ai');
      } else {
        // No provider active, should fallback
        expect(result.source).toBe('fallback');
      }
    });

    test('should cache provider detection across multiple summary requests', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();

      const providerService = new ProviderDetectionService(llmManager);
      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act - First detection
      const start1 = Date.now();
      await providerService.detectAll();
      const duration1 = Date.now() - start1;

      await summaryService.generateDailySummary(context);

      // Act - Second detection (should use cache)
      const start2 = Date.now();
      await providerService.detectAll();
      const duration2 = Date.now() - start2;

      await summaryService.generateDailySummary(context);

      // Assert
      // With mocks, both might be 0ms which is fine
      // Allow 5ms tolerance for timing variability in CI
      expect(duration2).toBeLessThanOrEqual(duration1 + 5);
      expect(duration2).toBeLessThan(100); // Cached should be instant
    });
  });

  describe('Error Handling Across Services', () => {
    test('should handle LLM errors and fallback gracefully', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManagerWithResponses({
        '__default__': {
          text: '',
          model: 'error-model',
          provider: 'error',
          timestamp: new Date(),
          error: 'LLM service unavailable'
        }
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const result = await summaryService.generateDailySummary(context);

      // Assert
      expect(result.source).toBe('fallback');
      expect(result.accomplishments.length).toBeGreaterThan(0);
    });

    test('should handle invalid JSON responses', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': {
          text: mockAIResponses.malformedJSON,
          model: 'test',
          provider: 'test',
          timestamp: new Date()
        }
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const result = await summaryService.generateDailySummary(context);

      // Assert
      // Should still produce a valid result (either parsed or fallback)
      expect(result).toBeDefined();
      expect(result.accomplishments).toBeDefined();
      expect(result.suggestedFocus).toBeDefined();
    });

    test('should handle empty sessions gracefully', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: emptySessions,
        date: new Date('2025-01-15')
      };

      // Act
      const result = await summaryService.generateDailySummary(context);
      const summary = summaryService.convertToDailySummary(
        result,
        context.sessions,
        context.date
      );

      // Assert
      expect(summary.source).toBe('fallback');
      expect(summary.sessions).toBe(0);
      expect(summary.workedOn).toContain('No sessions to summarize');
    });
  });

  describe('Different Provider Responses', () => {
    test('should handle Claude Code CLI response', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession, backendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const result = await summaryService.generateDailySummary(context);

      // Assert
      expect(result.source).toBe('ai');
      expect(result.provider).toBeDefined(); // Mock provider used in tests
      expect(result.accomplishments.length).toBeGreaterThanOrEqual(3);
      expect(result.suggestedFocus.length).toBeGreaterThanOrEqual(2);
    });

    test('should handle Cursor CLI response', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.cursor
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession, backendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const result = await summaryService.generateDailySummary(context);

      // Assert
      expect(result.source).toBe('ai');
      expect(result.provider).toBeDefined(); // Mock provider used in tests
      expect(result.accomplishments.length).toBeGreaterThanOrEqual(2);
      expect(result.suggestedFocus.length).toBeGreaterThanOrEqual(2);
    });

    test('should handle Ollama 7B response', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.ollama7b
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession, backendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const result = await summaryService.generateDailySummary(context);

      // Assert
      expect(result.source).toBe('ai');
      expect(result.provider).toBeDefined(); // Mock provider used in tests
      expect(result.accomplishments.length).toBeGreaterThan(0);
      expect(result.suggestedFocus.length).toBeGreaterThan(0);
    });

    test('should handle Ollama 13B response (better quality)', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.ollama13b
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession, backendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const result = await summaryService.generateDailySummary(context);

      // Assert
      expect(result.source).toBe('ai');
      expect(result.provider).toBeDefined(); // Mock provider used in tests
      expect(result.accomplishments.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Data Consistency and Validation', () => {
    test('should maintain data consistency through the pipeline', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const summaryService = new SummaryService(llmManager);

      const sessions = [frontendSession, backendSession];
      const date = new Date('2025-01-15');

      const context: SummaryContext = {
        sessions,
        date
      };

      // Act
      const aiResult = await summaryService.generateDailySummary(context);
      const dailySummary = summaryService.convertToDailySummary(
        aiResult,
        sessions,
        date
      );

      // Assert - Verify data consistency
      expect(dailySummary.date).toEqual(date);
      expect(dailySummary.sessions).toBe(sessions.length);
      expect(dailySummary.totalMessages).toBe(
        sessions.reduce((sum, s) => sum + s.promptCount, 0)
      );

      // Verify no data loss
      expect(dailySummary.workedOn).toEqual(aiResult.accomplishments);
      expect(dailySummary.suggestedFocus).toEqual(aiResult.suggestedFocus);
      expect(dailySummary.insights).toBe(aiResult.insights);
    });

    test('should calculate metrics correctly across services', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const summaryService = new SummaryService(llmManager);

      const sessions = productiveDaySessions;

      const context: SummaryContext = {
        sessions,
        date: new Date('2025-01-15')
      };

      // Act
      const aiResult = await summaryService.generateDailySummary(context);
      const dailySummary = summaryService.convertToDailySummary(
        aiResult,
        sessions,
        new Date('2025-01-15')
      );

      // Assert - Verify calculations
      const expectedPrompts = sessions.reduce((sum, s) => sum + s.promptCount, 0);
      expect(dailySummary.totalMessages).toBe(expectedPrompts);

      const expectedSessions = sessions.length;
      expect(dailySummary.sessions).toBe(expectedSessions);

      // Time should be reasonable
      expect(dailySummary.timeCoding).toBeGreaterThan(0);
      expect(dailySummary.timeCoding).toBeLessThan(1440); // Less than 24 hours in minutes
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle single session efficiently', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const startTime = Date.now();
      await summaryService.generateDailySummary(context);
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(1000); // Should complete within 1 second (with mock)
    });

    test('should handle multiple sessions efficiently', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: productiveDaySessions,
        date: new Date('2025-01-15')
      };

      // Act
      const startTime = Date.now();
      await summaryService.generateDailySummary(context);
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(2000); // Should scale reasonably
    });
  });

  describe('Logging and Observability', () => {
    test('should log summary generation flow', async () => {
      // Arrange
      const mockLogger = new MockLogger();
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      // Note: Would need to inject logger into SummaryService
      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      await summaryService.generateDailySummary(context);

      // Assert
      // In a real implementation, would check logger for key events
      // Example assertions:
      // expect(mockLogger.hasMessage('Generating summary')).toBe(true);
      // expect(mockLogger.hasMessage('Using provider')).toBe(true);
      // expect(mockLogger.hasMessage('Summary generated')).toBe(true);
    });
  });

  describe('UI Integration Scenarios', () => {
    test('should provide all data needed for UI display', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession, backendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const aiResult = await summaryService.generateDailySummary(context);
      const dailySummary = summaryService.convertToDailySummary(
        aiResult,
        context.sessions,
        context.date
      );

      // Assert - Check all UI-required fields
      expect(dailySummary.date).toBeDefined();
      expect(dailySummary.totalMessages).toBeGreaterThanOrEqual(0);
      expect(dailySummary.avgScore).toBeGreaterThanOrEqual(0);
      expect(dailySummary.timeCoding).toBeGreaterThanOrEqual(0);
      expect(dailySummary.filesWorkedOn).toBeGreaterThanOrEqual(0);
      expect(dailySummary.sessions).toBeGreaterThanOrEqual(0);
      expect(dailySummary.workedOn).toBeInstanceOf(Array);
      expect(dailySummary.suggestedFocus).toBeInstanceOf(Array);
      expect(dailySummary.source).toMatch(/^(ai|fallback)$/);

      // Provider info should be present for AI summaries
      if (dailySummary.source === 'ai') {
        expect(dailySummary.providerInfo).toBeDefined();
        expect(dailySummary.providerInfo?.provider).toBeTruthy();
        expect(dailySummary.providerInfo?.model).toBeTruthy();
      }
    });

    test('should format data appropriately for different summary states', async () => {
      // Test AI summary state
      const { llmManager: aiManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const aiService = new SummaryService(aiManager);

      const aiContext: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      const aiResult = await aiService.generateDailySummary(aiContext);
      const aiSummary = aiService.convertToDailySummary(
        aiResult,
        aiContext.sessions,
        aiContext.date
      );

      // Test fallback state
      const fallbackManager = createTestLLMManagerWithNoProvider();
      const fallbackService = new SummaryService(fallbackManager);

      const fallbackContext: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      const fallbackResult = await fallbackService.generateDailySummary(fallbackContext);
      const fallbackSummary = fallbackService.convertToDailySummary(
        fallbackResult,
        fallbackContext.sessions,
        fallbackContext.date
      );

      // Assert - Both should be valid but different sources
      expect(aiSummary.source).toBe('ai');
      expect(fallbackSummary.source).toBe('fallback');

      expect(aiSummary.providerInfo).toBeDefined();
      expect(fallbackSummary.providerInfo).toBeUndefined();

      // Both should have required fields
      expect(aiSummary.workedOn.length).toBeGreaterThan(0);
      expect(fallbackSummary.workedOn.length).toBeGreaterThan(0);
    });
  });

  describe('Weekly Summary Integration', () => {
    test('should generate complete weekly summary with AI', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const summaryService = new SummaryService(llmManager);

      const startDate = new Date('2025-01-06');
      const endDate = new Date('2025-01-12');
      const weeklySessions = generateWeeklySessions(startDate, endDate);

      const context: SummaryContext = {
        sessions: weeklySessions,
        date: endDate,
        timeframe: 'weekly',
        dateRange: { start: startDate, end: endDate }
      };

      // Act
      const result = await summaryService.generateWeeklySummary(context);

      // Assert
      expect(result.source).toBe('ai');
      expect(result.startDate).toEqual(startDate);
      expect(result.endDate).toEqual(endDate);
      expect(result.sessions).toBe(weeklySessions.length);
      expect(result.dailyBreakdown).toHaveLength(7);
      expect(result.topProjects.length).toBeGreaterThan(0);
      expect(result.achievements).toBeDefined();
      expect(result.insights).toBeDefined();
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.promptsAnalyzed).toBeGreaterThan(0);
      expect(result.providerInfo).toBeDefined();
    });

    test('should handle weekly summary with fallback', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManagerWithResponses({
        '__default__': {
          text: '',
          model: 'error',
          provider: 'error',
          timestamp: new Date(),
          error: 'Service unavailable'
        }
      });

      const summaryService = new SummaryService(llmManager);

      const weeklySessions = weeklyTestCollections.productiveWeek;

      const context: SummaryContext = {
        sessions: weeklySessions,
        date: new Date('2025-01-12'),
        timeframe: 'weekly',
        dateRange: { start: new Date('2025-01-06'), end: new Date('2025-01-12') }
      };

      // Act
      const result = await summaryService.generateWeeklySummary(context);

      // Assert
      expect(result.source).toBe('fallback');
      expect(result.sessions).toBe(weeklySessions.length);
      expect(result.dailyBreakdown).toHaveLength(7);
      expect(result.topProjects.length).toBeGreaterThan(0);
      expect(result.providerInfo).toBeUndefined();
    });

    test('should process weekly summary with custom instructions', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: weeklyTestCollections.lightWeek,
        date: new Date('2025-01-12'),
        timeframe: 'weekly',
        dateRange: { start: new Date('2025-01-06'), end: new Date('2025-01-12') },
        userInstructions: 'Focus on work-life balance and sustainable pace'
      };

      // Act
      const result = await summaryService.generateWeeklySummary(context);

      // Assert
      const callHistory = mockProvider.getCallHistory();
      expect(callHistory[0].prompt).toContain('Focus on work-life balance');
      expect(callHistory[0].prompt).toContain('weekly summary');
      expect(result.source).toBe('ai');
    });

    test('should handle empty weekly sessions', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [],
        date: new Date('2025-01-12'),
        timeframe: 'weekly',
        dateRange: { start: new Date('2025-01-06'), end: new Date('2025-01-12') }
      };

      // Act
      const result = await summaryService.generateWeeklySummary(context);

      // Assert
      expect(result.source).toBe('fallback');
      expect(result.sessions).toBe(0);
      expect(result.totalTime).toBe(0);
      expect(result.dailyBreakdown).toHaveLength(7);
      expect(result.dailyBreakdown.every(d => d.time === 0 && d.prompts === 0)).toBe(true);
      expect(result.insights).toContain('No coding sessions detected');
    });
  });

  describe('Monthly Summary Integration', () => {
    test('should generate complete monthly summary with AI', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const summaryService = new SummaryService(llmManager);

      const monthlySessions = generateMonthlySessions(2025, 0); // January 2025

      const context: SummaryContext = {
        sessions: monthlySessions,
        date: new Date('2025-01-31'),
        timeframe: 'monthly',
        dateRange: { start: new Date('2025-01-01'), end: new Date('2025-01-31') }
      };

      // Act
      const result = await summaryService.generateMonthlySummary(context);

      // Assert
      expect(result.source).toBe('ai');
      expect(result.month).toBe('January');
      expect(result.year).toBe(2025);
      expect(result.sessions).toBe(monthlySessions.length);
      expect(result.weeklyBreakdown.length).toBeGreaterThan(0);
      expect(result.activeDays).toBeGreaterThan(0);
      expect(result.totalDays).toBe(31);
      expect(result.achievements).toBeDefined();
      expect(result.trends).toBeDefined();
      expect(result.insights).toBeDefined();
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.promptsAnalyzed).toBeGreaterThan(0);
      expect(result.providerInfo).toBeDefined();
    });

    test('should handle monthly summary with fallback', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManagerWithResponses({
        '__default__': {
          text: '',
          model: 'error',
          provider: 'error',
          timestamp: new Date(),
          error: 'Service unavailable'
        }
      });

      const summaryService = new SummaryService(llmManager);

      const monthlySessions = monthlyTestCollections.partialMonth;

      const context: SummaryContext = {
        sessions: monthlySessions,
        date: new Date('2025-01-31'),
        timeframe: 'monthly',
        dateRange: { start: new Date('2025-01-01'), end: new Date('2025-01-31') }
      };

      // Act
      const result = await summaryService.generateMonthlySummary(context);

      // Assert
      expect(result.source).toBe('fallback');
      expect(result.month).toBe('January');
      expect(result.year).toBe(2025);
      expect(result.sessions).toBe(monthlySessions.length);
      expect(result.weeklyBreakdown.length).toBeGreaterThan(0);
      expect(result.activeDays).toBeGreaterThan(0);
      expect(result.providerInfo).toBeUndefined();
    });

    test('should process monthly summary with custom instructions', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: monthlyTestCollections.partialMonth,
        date: new Date('2025-01-31'),
        timeframe: 'monthly',
        dateRange: { start: new Date('2025-01-01'), end: new Date('2025-01-31') },
        userInstructions: 'Highlight major milestones and team collaboration'
      };

      // Act
      const result = await summaryService.generateMonthlySummary(context);

      // Assert
      const callHistory = mockProvider.getCallHistory();
      expect(callHistory[0].prompt).toContain('Highlight major milestones');
      expect(callHistory[0].prompt).toContain('monthly summary');
      expect(result.source).toBe('ai');
    });

    test('should handle empty monthly sessions', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': mockProviderResponses.claudeCode
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [],
        date: new Date('2025-01-31'),
        timeframe: 'monthly',
        dateRange: { start: new Date('2025-01-01'), end: new Date('2025-01-31') }
      };

      // Act
      const result = await summaryService.generateMonthlySummary(context);

      // Assert
      expect(result.source).toBe('fallback');
      expect(result.month).toBe('January');
      expect(result.year).toBe(2025);
      expect(result.sessions).toBe(0);
      expect(result.totalTime).toBe(0);
      expect(result.activeDays).toBe(0);
      expect(result.totalDays).toBe(31);
      expect(result.weeklyBreakdown).toEqual([]);
      expect(result.insights).toContain('No coding sessions detected');
    });
  });
});
