/**
 * SummaryService Unit Tests
 *
 * Tests for AI-powered session summary generation including:
 * - Prompt building
 * - AI response parsing
 * - Fallback behavior
 * - Error handling
 * - Format conversion
 */

import { SummaryService, SummaryContext, AISummaryResult, DailySummary, WeeklySummary, MonthlySummary } from '../SummaryService';
import { LLMManager } from '../../llm/llm-manager';
import { createTestLLMManager, createTestLLMManagerWithResponses, createTestLLMManagerWithNoProvider } from '../../llm/testing';
import {
  frontendSession,
  backendSession,
  productiveDaySessions,
  emptySessions,
  sessionWithoutFiles,
  createMockSession,
  createMockSessionsInRange
} from '../../test/fixtures/mock-sessions';
import { mockAIResponses } from '../../test/fixtures/mock-sessions';
import { CLIProviderError } from '../../llm/providers/cli-provider-base';

describe('SummaryService', () => {
  describe('generateDailySummary', () => {
    test('should generate AI summary with valid LLM provider', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManagerWithResponses({
        '__default__': {
          text: mockAIResponses.validJSON,
          model: 'mock-model',
          provider: 'mock',
          timestamp: new Date()
        }
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession, backendSession],
        date: new Date('2025-01-15'),
        userInstructions: undefined
      };

      // Act
      const result = await summaryService.generateDailySummary(context);

      // Assert
      expect(result.source).toBe('ai');
      expect(result.model).toBe('mock-model');
      expect(result.provider).toBe('mock');
      expect(result.accomplishments).toHaveLength(3);
      expect(result.accomplishments[0]).toContain('authentication');
      expect(result.suggestedFocus).toHaveLength(3);
      expect(result.suggestedFocus[0]).toContain('test');
      expect(result.insights).toBeTruthy();
      expect(result.insights).toContain('security');

      // Verify LLM was called
      expect(mockProvider.getCallHistory()).toHaveLength(1);
    });

    test('should include custom instructions in prompt', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManagerWithResponses({
        '__default__': {
          text: mockAIResponses.validJSON,
          model: 'mock-model',
          provider: 'mock',
          timestamp: new Date()
        }
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15'),
        userInstructions: 'Focus on testing and code quality'
      };

      // Act
      await summaryService.generateDailySummary(context);

      // Assert
      const callHistory = mockProvider.getCallHistory();
      expect(callHistory).toHaveLength(1);
      expect(callHistory[0].prompt).toContain('Focus on testing and code quality');
      expect(callHistory[0].prompt).toContain('Custom Instructions:');
    });

    test('should fallback when no LLM provider is available', async () => {
      // Arrange
      const llmManager = createTestLLMManagerWithNoProvider();

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: productiveDaySessions,
        date: new Date('2025-01-15')
      };

      // Act
      const result = await summaryService.generateDailySummary(context);

      // Assert
      expect(result.source).toBe('fallback');
      expect(result.model).toBeUndefined();
      expect(result.provider).toBeUndefined();
      expect(result.accomplishments.length).toBeGreaterThan(0);
      expect(result.suggestedFocus.length).toBeGreaterThan(0);
      expect(result.insights).toContain('AI analysis unavailable');
    });

    test('should fallback when LLM returns error', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManager();
      mockProvider.failNextCall('LLM service unavailable');

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
      expect(result.suggestedFocus.length).toBeGreaterThan(0);
    });

    test('should handle empty session list', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: emptySessions,
        date: new Date('2025-01-15')
      };

      // Act
      const result = await summaryService.generateDailySummary(context);

      // Assert
      expect(result.source).toBe('fallback');
      expect(result.accomplishments).toContain('No sessions to summarize');
      expect(result.suggestedFocus.length).toBeGreaterThan(0);
    });
  });

  describe('buildPrompt', () => {
    test('should build prompt with session data', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession, backendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = summaryService.buildPrompt(context);

      // Assert
      expect(prompt).toContain('Total Sessions: 2');
      expect(prompt).toContain('my-react-app');
      expect(prompt).toContain('api-server');
      expect(prompt).toContain('LoginForm.tsx');
      expect(prompt).toContain('oauth.ts');
      expect(prompt).toContain('Total Prompts:');
      expect(prompt).toContain('JSON only, no markdown');
    });

    test('should include custom instructions when provided', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15'),
        userInstructions: 'Focus on performance and optimization'
      };

      // Act
      const prompt = summaryService.buildPrompt(context);

      // Assert
      expect(prompt).toContain('Custom Instructions:');
      expect(prompt).toContain('Focus on performance and optimization');
    });

    test('should not include custom instructions section when undefined', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15'),
        userInstructions: undefined
      };

      // Act
      const prompt = summaryService.buildPrompt(context);

      // Assert
      expect(prompt).not.toContain('Custom Instructions:');
    });

    test('should format date correctly', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = summaryService.buildPrompt(context);

      // Assert
      expect(prompt).toMatch(/Wednesday|Thursday|Friday|Saturday|Sunday|Monday|Tuesday/);
      expect(prompt).toContain('2025');
      expect(prompt).toMatch(/January|February|March|April|May|June|July|August|September|October|November|December/);
    });
  });

  describe('parseAIResponse', () => {
    test('should parse valid JSON response', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      // Act
      const result = summaryService.parseAIResponse(mockAIResponses.validJSON);

      // Assert
      expect(result.accomplishments).toHaveLength(3);
      expect(result.accomplishments[0]).toContain('OAuth');
      expect(result.suggestedFocus).toHaveLength(3);
      expect(result.suggestedFocus[0]).toContain('test');
      expect(result.insights).toBeTruthy();
    });

    test('should parse JSON with snake_case fields', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      // Act
      const result = summaryService.parseAIResponse(mockAIResponses.validJSONSnakeCase);

      // Assert
      expect(result.accomplishments).toHaveLength(2);
      expect(result.suggestedFocus).toHaveLength(2);
      expect(result.insights).toBeTruthy();
    });

    test('should extract JSON from markdown code block', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      // Act
      const result = summaryService.parseAIResponse(mockAIResponses.jsonInMarkdown);

      // Assert
      expect(result.accomplishments).toHaveLength(2);
      expect(result.accomplishments[0]).toContain('authentication');
      expect(result.suggestedFocus).toHaveLength(2);
    });

    test('should extract information from plain text response', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      // Act
      const result = summaryService.parseAIResponse(mockAIResponses.plainText);

      // Assert
      expect(result.accomplishments.length).toBeGreaterThan(0);
      expect(result.suggestedFocus.length).toBeGreaterThan(0);
      // Plain text extraction should find items with "OAuth", "tests", etc.
    });

    test('should handle malformed JSON gracefully', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      // Act
      const result = summaryService.parseAIResponse(mockAIResponses.malformedJSON);

      // Assert
      // Should fall back to plain text extraction
      expect(result.accomplishments.length).toBeGreaterThan(0);
      expect(result.suggestedFocus.length).toBeGreaterThan(0);
    });

    test('should handle empty response', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      // Act
      const result = summaryService.parseAIResponse(mockAIResponses.empty);

      // Assert
      // Should provide default values
      expect(result.accomplishments).toContain('Worked on coding sessions');
      expect(result.suggestedFocus).toContain('Continue current work');
    });

    test('should handle whitespace-only response', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      // Act
      const result = summaryService.parseAIResponse(mockAIResponses.whitespace);

      // Assert
      // Should provide default values
      expect(result.accomplishments.length).toBeGreaterThan(0);
      expect(result.suggestedFocus.length).toBeGreaterThan(0);
    });

    test('should handle special characters in response', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      // Act
      const result = summaryService.parseAIResponse(mockAIResponses.specialChars);

      // Assert
      expect(result.accomplishments[0]).toContain('"authentication"');
      expect(result.accomplishments[1]).toContain('<special>');
      expect(result.accomplishments[2]).toContain('null/undefined');
    });
  });

  describe('convertToDailySummary', () => {
    test('should convert AI result to daily summary format', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const aiResult: AISummaryResult = {
        accomplishments: ['Built auth system', 'Added tests'],
        suggestedFocus: ['Add error handling', 'Deploy to production'],
        insights: 'Good progress',
        source: 'ai',
        model: 'mock-model',
        provider: 'mock'
      };

      const sessions = [frontendSession, backendSession];
      const date = new Date('2025-01-15');

      // Act
      const summary = summaryService.convertToDailySummary(aiResult, sessions, date);

      // Assert
      expect(summary.date).toEqual(date);
      expect(summary.totalMessages).toBe(37); // 15 + 22
      expect(summary.filesWorkedOn).toBeGreaterThan(0);
      expect(summary.sessions).toBe(2);
      expect(summary.workedOn).toEqual(aiResult.accomplishments);
      expect(summary.suggestedFocus).toEqual(aiResult.suggestedFocus);
      expect(summary.insights).toBe(aiResult.insights);
      expect(summary.source).toBe('ai');
      expect(summary.providerInfo).toEqual({
        model: 'mock-model',
        provider: 'mock'
      });
    });

    test('should calculate time coding correctly', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const aiResult: AISummaryResult = {
        accomplishments: ['Work done'],
        suggestedFocus: ['Next steps'],
        source: 'ai',
        model: 'test',
        provider: 'test'
      };

      // Frontend session: 2.5 hours (150 minutes)
      // Backend session: 2.75 hours (165 minutes)
      const sessions = [frontendSession, backendSession];
      const date = new Date('2025-01-15');

      // Act
      const summary = summaryService.convertToDailySummary(aiResult, sessions, date);

      // Assert
      expect(summary.timeCoding).toBe(315); // 150 + 165 = 315 minutes
    });

    test('should count unique files worked on', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const aiResult: AISummaryResult = {
        accomplishments: ['Work done'],
        suggestedFocus: ['Next steps'],
        source: 'ai'
      };

      // Frontend has 5 files, backend has 6 files, no overlap
      const sessions = [frontendSession, backendSession];
      const date = new Date('2025-01-15');

      // Act
      const summary = summaryService.convertToDailySummary(aiResult, sessions, date);

      // Assert
      expect(summary.filesWorkedOn).toBe(11); // 5 + 6 unique files
    });

    test('should handle sessions without file context', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const aiResult: AISummaryResult = {
        accomplishments: ['Work done'],
        suggestedFocus: ['Next steps'],
        source: 'fallback'
      };

      const sessions = [sessionWithoutFiles];
      const date = new Date('2025-01-15');

      // Act
      const summary = summaryService.convertToDailySummary(aiResult, sessions, date);

      // Assert
      expect(summary.filesWorkedOn).toBe(0);
      expect(summary.sessions).toBe(1);
      expect(summary.source).toBe('fallback');
      expect(summary.providerInfo).toBeUndefined();
    });

    test('should not include provider info for fallback summaries', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const aiResult: AISummaryResult = {
        accomplishments: ['Generic work'],
        suggestedFocus: ['Generic suggestion'],
        insights: 'AI analysis unavailable',
        source: 'fallback'
      };

      const sessions = [frontendSession];
      const date = new Date('2025-01-15');

      // Act
      const summary = summaryService.convertToDailySummary(aiResult, sessions, date);

      // Assert
      expect(summary.source).toBe('fallback');
      expect(summary.providerInfo).toBeUndefined();
    });
  });

  describe('generateFallbackSummary (private method - tested via public API)', () => {
    test('should generate fallback summary when LLM fails', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManager();
      mockProvider.failNextCall('Service unavailable');

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: productiveDaySessions,
        date: new Date('2025-01-15')
      };

      // Act
      const result = await summaryService.generateDailySummary(context);

      // Assert
      expect(result.source).toBe('fallback');
      expect(result.accomplishments.length).toBeGreaterThan(0);

      // Should mention project names
      const accomplishmentsText = result.accomplishments.join(' ');
      expect(accomplishmentsText).toContain('project');

      // Should mention number of tasks/sessions
      expect(accomplishmentsText).toMatch(/\d+/); // Contains numbers

      // Should provide generic suggestions
      expect(result.suggestedFocus.length).toBeGreaterThan(0);
      expect(result.suggestedFocus.some(s => s.includes('Continue'))).toBe(true);
    });

    test('should provide helpful fallback for empty sessions', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: emptySessions,
        date: new Date('2025-01-15')
      };

      // Act
      const result = await summaryService.generateDailySummary(context);

      // Assert
      expect(result.source).toBe('fallback');
      expect(result.accomplishments).toContain('No sessions to summarize');
      expect(result.insights).toContain('AI analysis unavailable');
    });

    test('should suggest focus on single project when multiple projects exist', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManager();
      mockProvider.failNextCall('Error');

      const summaryService = new SummaryService(llmManager);

      // Create sessions with different projects
      const multiProjectSessions = [
        createMockSession({ workspaceName: 'project-a' }),
        createMockSession({ workspaceName: 'project-b' }),
        createMockSession({ workspaceName: 'project-c' })
      ];

      const context: SummaryContext = {
        sessions: multiProjectSessions,
        date: new Date('2025-01-15')
      };

      // Act
      const result = await summaryService.generateDailySummary(context);

      // Assert
      const suggestionsText = result.suggestedFocus.join(' ');
      expect(suggestionsText).toContain('focus');
    });
  });

  describe('Edge Cases', () => {
    test('should handle very long session durations', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const aiResult: AISummaryResult = {
        accomplishments: ['Long session work'],
        suggestedFocus: ['Take breaks'],
        source: 'ai'
      };

      // 10 hour session
      const longSession = createMockSession({
        startTime: new Date('2025-01-15T08:00:00Z'),
        lastActivity: new Date('2025-01-15T18:00:00Z')
      });

      // Act
      const summary = summaryService.convertToDailySummary(
        aiResult,
        [longSession],
        new Date('2025-01-15')
      );

      // Assert
      expect(summary.timeCoding).toBe(600); // 10 hours = 600 minutes
    });

    test('should handle sessions with many files', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const aiResult: AISummaryResult = {
        accomplishments: ['Refactored codebase'],
        suggestedFocus: ['Add tests'],
        source: 'ai'
      };

      const manyFilesSession = createMockSession({
        fileContext: Array.from({ length: 100 }, (_, i) => `src/file${i}.ts`)
      });

      // Act
      const summary = summaryService.convertToDailySummary(
        aiResult,
        [manyFilesSession],
        new Date('2025-01-15')
      );

      // Assert
      expect(summary.filesWorkedOn).toBe(100);
    });

    test('should handle sessions with many prompts', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const aiResult: AISummaryResult = {
        accomplishments: ['Intensive coding session'],
        suggestedFocus: ['Review quality'],
        source: 'ai'
      };

      const manyPromptsSession = createMockSession({
        promptCount: 500
      });

      // Act
      const summary = summaryService.convertToDailySummary(
        aiResult,
        [manyPromptsSession],
        new Date('2025-01-15')
      );

      // Assert
      expect(summary.totalMessages).toBe(500);
    });
  });

  describe('Integration with LLMManager', () => {
    test('should respect LLM timeout settings', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManager();

      // Simulate slow response
      mockProvider.setDefaultResponse({
        text: mockAIResponses.validJSON,
        model: 'slow-model',
        provider: 'slow',
        timestamp: new Date()
      });

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const startTime = Date.now();
      const result = await summaryService.generateDailySummary(context);
      const duration = Date.now() - startTime;

      // Assert
      expect(result).toBeTruthy();
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should pass system prompt to LLM', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManagerWithResponses({
        '__default__': {
          text: mockAIResponses.validJSON,
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
      await summaryService.generateDailySummary(context);

      // Assert
      const history = mockProvider.getCallHistory();
      expect(history).toHaveLength(1);
      expect(history[0].options.systemPrompt).toBeTruthy();
      expect(history[0].options.systemPrompt).toContain('software development analyst');
    });

    test('should use appropriate temperature for summaries', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManagerWithResponses({
        '__default__': {
          text: mockAIResponses.validJSON,
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
      await summaryService.generateDailySummary(context);

      // Assert
      const history = mockProvider.getCallHistory();
      expect(history).toHaveLength(1);
      expect(history[0].options.temperature).toBe(0.3); // Lower temperature for factual output
    });
  });

  describe('generateWeeklySummary', () => {
    test('should generate AI-powered weekly summary', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': {
          text: mockAIResponses.validJSON,
          model: 'mock-model',
          provider: 'mock',
          timestamp: new Date()
        }
      });

      const summaryService = new SummaryService(llmManager);

      const startDate = new Date('2025-01-06'); // Monday
      const endDate = new Date('2025-01-12'); // Sunday
      const weeklySessions = createMockSessionsInRange(10, startDate, endDate);

      const context: SummaryContext = {
        sessions: weeklySessions,
        date: new Date('2025-01-12'),
        timeframe: 'weekly',
        dateRange: { start: startDate, end: endDate }
      };

      // Act
      const result = await summaryService.generateWeeklySummary(context);

      // Assert
      expect(result.source).toBe('ai');
      expect(result.startDate).toEqual(startDate);
      expect(result.endDate).toEqual(endDate);
      expect(result.sessions).toBe(10);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.promptsAnalyzed).toBeGreaterThan(0);
      expect(result.dailyBreakdown).toHaveLength(7); // Mon-Sun
      expect(result.topProjects.length).toBeGreaterThan(0);
      expect(result.achievements).toBeDefined();
      expect(result.providerInfo).toBeDefined();
    });

    test('should calculate daily breakdown correctly for weekly summary', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const monday = new Date('2025-01-06T10:00:00Z');
      const tuesday = new Date('2025-01-07T10:00:00Z');
      const wednesday = new Date('2025-01-08T10:00:00Z');

      const sessions = [
        createMockSession({ startTime: monday, lastActivity: new Date(monday.getTime() + 3600000), promptCount: 10 }),
        createMockSession({ startTime: monday, lastActivity: new Date(monday.getTime() + 7200000), promptCount: 15 }),
        createMockSession({ startTime: tuesday, lastActivity: new Date(tuesday.getTime() + 5400000), promptCount: 20 }),
        createMockSession({ startTime: wednesday, lastActivity: new Date(wednesday.getTime() + 3600000), promptCount: 12 })
      ];

      const context: SummaryContext = {
        sessions,
        date: new Date('2025-01-12'),
        timeframe: 'weekly',
        dateRange: { start: new Date('2025-01-06'), end: new Date('2025-01-12') }
      };

      // Act
      const result = await summaryService.generateWeeklySummary(context);

      // Assert
      expect(result.dailyBreakdown).toHaveLength(7);
      expect(result.dailyBreakdown.find(d => d.day === 'Mon')?.prompts).toBe(25); // 10 + 15
      expect(result.dailyBreakdown.find(d => d.day === 'Tue')?.prompts).toBe(20);
      expect(result.dailyBreakdown.find(d => d.day === 'Wed')?.prompts).toBe(12);
      expect(result.dailyBreakdown.find(d => d.day === 'Thu')?.prompts).toBe(0);
    });

    test('should calculate top projects for weekly summary', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const sessions = [
        createMockSession({ workspaceName: 'project-a', promptCount: 50 }),
        createMockSession({ workspaceName: 'project-a', promptCount: 30 }),
        createMockSession({ workspaceName: 'project-b', promptCount: 40 }),
        createMockSession({ workspaceName: 'project-c', promptCount: 20 }),
        createMockSession({ workspaceName: 'project-c', promptCount: 10 })
      ];

      const context: SummaryContext = {
        sessions,
        date: new Date('2025-01-12'),
        timeframe: 'weekly',
        dateRange: { start: new Date('2025-01-06'), end: new Date('2025-01-12') }
      };

      // Act
      const result = await summaryService.generateWeeklySummary(context);

      // Assert - topProjects is sorted by time, not prompts
      // project-a: 2 sessions = 2 hours, project-b: 1 session = 1 hour, project-c: 2 sessions = 2 hours
      expect(result.topProjects).toHaveLength(3);
      expect(result.topProjects[0].name).toBe('project-a'); // 2 hours, most prompts (80)
      expect(result.topProjects[0].prompts).toBe(80); // 50 + 30
      expect(result.topProjects[1].name).toBe('project-c'); // 2 hours (tied with project-a)
      expect(result.topProjects[1].prompts).toBe(30); // 20 + 10
      expect(result.topProjects[2].name).toBe('project-b'); // 1 hour
      expect(result.topProjects[2].prompts).toBe(40);
    });

    test('should handle weekly summary with empty sessions', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
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
      expect(result.promptsAnalyzed).toBe(0);
      expect(result.dailyBreakdown).toHaveLength(7);
      expect(result.dailyBreakdown.every(d => d.time === 0)).toBe(true);
      expect(result.insights).toContain('No coding sessions detected');
    });

    test('should generate fallback weekly summary when AI fails', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManager();
      mockProvider.failNextCall('Service unavailable');

      const summaryService = new SummaryService(llmManager);

      const sessions = createMockSessionsInRange(5, new Date('2025-01-06'), new Date('2025-01-12'));

      const context: SummaryContext = {
        sessions,
        date: new Date('2025-01-12'),
        timeframe: 'weekly',
        dateRange: { start: new Date('2025-01-06'), end: new Date('2025-01-12') }
      };

      // Act
      const result = await summaryService.generateWeeklySummary(context);

      // Assert
      expect(result.source).toBe('fallback');
      expect(result.sessions).toBe(5);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.dailyBreakdown).toHaveLength(7);
      expect(result.topProjects.length).toBeGreaterThan(0);
      expect(result.providerInfo).toBeUndefined();
    });
  });

  describe('generateMonthlySummary', () => {
    test('should generate AI-powered monthly summary', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManagerWithResponses({
        '__default__': {
          text: mockAIResponses.validJSON,
          model: 'mock-model',
          provider: 'mock',
          timestamp: new Date()
        }
      });

      const summaryService = new SummaryService(llmManager);

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');
      const monthlySessions = createMockSessionsInRange(30, startDate, endDate);

      const context: SummaryContext = {
        sessions: monthlySessions,
        date: endDate,
        timeframe: 'monthly',
        dateRange: { start: startDate, end: endDate }
      };

      // Act
      const result = await summaryService.generateMonthlySummary(context);

      // Assert
      expect(result.source).toBe('ai');
      expect(result.month).toBe('January');
      expect(result.year).toBe(2025);
      expect(result.sessions).toBe(30);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.promptsAnalyzed).toBeGreaterThan(0);
      expect(result.weeklyBreakdown.length).toBeGreaterThan(0);
      expect(result.activeDays).toBeGreaterThan(0);
      expect(result.totalDays).toBe(31);
      expect(result.achievements).toBeDefined();
      expect(result.trends).toBeDefined();
      expect(result.providerInfo).toBeDefined();
    });

    test('should calculate weekly breakdown correctly for monthly summary', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      // Create sessions spread across different weeks of January
      const sessions = [
        createMockSession({ startTime: new Date('2025-01-03T10:00:00Z'), promptCount: 10 }), // Week 1
        createMockSession({ startTime: new Date('2025-01-04T10:00:00Z'), promptCount: 15 }), // Week 1
        createMockSession({ startTime: new Date('2025-01-10T10:00:00Z'), promptCount: 20 }), // Week 2
        createMockSession({ startTime: new Date('2025-01-15T10:00:00Z'), promptCount: 25 }), // Week 3
        createMockSession({ startTime: new Date('2025-01-22T10:00:00Z'), promptCount: 30 }), // Week 4
        createMockSession({ startTime: new Date('2025-01-29T10:00:00Z'), promptCount: 35 })  // Week 5
      ];

      const context: SummaryContext = {
        sessions,
        date: new Date('2025-01-31'),
        timeframe: 'monthly',
        dateRange: { start: new Date('2025-01-01'), end: new Date('2025-01-31') }
      };

      // Act
      const result = await summaryService.generateMonthlySummary(context);

      // Assert
      expect(result.weeklyBreakdown.length).toBeGreaterThan(0);
      expect(result.weeklyBreakdown.length).toBeLessThanOrEqual(5); // Max 5 weeks in January
      expect(result.weeklyBreakdown[0].week).toBe(1);
      expect(result.weeklyBreakdown[0].prompts).toBe(25); // 10 + 15
    });

    test('should calculate active days correctly for monthly summary', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      // Create sessions on specific days
      const sessions = [
        createMockSession({ startTime: new Date('2025-01-05T10:00:00Z') }),
        createMockSession({ startTime: new Date('2025-01-05T14:00:00Z') }), // Same day
        createMockSession({ startTime: new Date('2025-01-10T10:00:00Z') }),
        createMockSession({ startTime: new Date('2025-01-15T10:00:00Z') }),
        createMockSession({ startTime: new Date('2025-01-20T10:00:00Z') })
      ];

      const context: SummaryContext = {
        sessions,
        date: new Date('2025-01-31'),
        timeframe: 'monthly',
        dateRange: { start: new Date('2025-01-01'), end: new Date('2025-01-31') }
      };

      // Act
      const result = await summaryService.generateMonthlySummary(context);

      // Assert
      expect(result.activeDays).toBe(4); // 4 unique days: 5th, 10th, 15th, 20th
      expect(result.totalDays).toBe(31); // January has 31 days
    });

    test('should handle monthly summary with empty sessions', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
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
      expect(result.promptsAnalyzed).toBe(0);
      expect(result.activeDays).toBe(0);
      expect(result.totalDays).toBe(31);
      expect(result.weeklyBreakdown).toEqual([]);
      expect(result.insights).toContain('No coding sessions detected');
    });

    test('should generate fallback monthly summary when AI fails', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManager();
      mockProvider.failNextCall('Service unavailable');

      const summaryService = new SummaryService(llmManager);

      const sessions = createMockSessionsInRange(20, new Date('2025-01-01'), new Date('2025-01-31'));

      const context: SummaryContext = {
        sessions,
        date: new Date('2025-01-31'),
        timeframe: 'monthly',
        dateRange: { start: new Date('2025-01-01'), end: new Date('2025-01-31') }
      };

      // Act
      const result = await summaryService.generateMonthlySummary(context);

      // Assert
      expect(result.source).toBe('fallback');
      expect(result.sessions).toBe(20);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.weeklyBreakdown.length).toBeGreaterThan(0);
      expect(result.activeDays).toBeGreaterThan(0);
      expect(result.providerInfo).toBeUndefined();
    });
  });

  describe('convertToWeeklySummary', () => {
    test('should convert AI result to weekly summary format', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const aiResult: AISummaryResult = {
        accomplishments: ['Built feature X', 'Fixed bugs in Y'],
        suggestedFocus: ['Add tests', 'Deploy to production'],
        insights: 'Productive week',
        source: 'ai',
        model: 'mock-model',
        provider: 'mock'
      };

      const sessions = createMockSessionsInRange(10, new Date('2025-01-06'), new Date('2025-01-12'));
      const dateRange = { start: new Date('2025-01-06'), end: new Date('2025-01-12') };

      // Act
      const summary = summaryService.convertToWeeklySummary(aiResult, sessions, dateRange);

      // Assert
      expect(summary.startDate).toEqual(dateRange.start);
      expect(summary.endDate).toEqual(dateRange.end);
      expect(summary.sessions).toBe(10);
      expect(summary.dailyBreakdown).toHaveLength(7);
      expect(summary.topProjects.length).toBeGreaterThan(0);
      expect(summary.achievements).toEqual(aiResult.accomplishments);
      expect(summary.insights).toBe(aiResult.insights);
      expect(summary.source).toBe('ai');
      expect(summary.providerInfo).toBeDefined();
    });

    test('should handle weekly summary without date range', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const aiResult: AISummaryResult = {
        accomplishments: ['Work done'],
        suggestedFocus: ['Next steps'],
        source: 'ai'
      };

      const sessions = createMockSessionsInRange(5, new Date('2025-01-06'), new Date('2025-01-12'));

      // Act
      const summary = summaryService.convertToWeeklySummary(aiResult, sessions);

      // Assert
      expect(summary.startDate).toBeDefined();
      expect(summary.endDate).toBeDefined();
      expect(summary.dailyBreakdown).toHaveLength(7);
    });
  });

  describe('convertToMonthlySummary', () => {
    test('should convert AI result to monthly summary format', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const aiResult: AISummaryResult = {
        accomplishments: ['Major feature completed', 'Team collaboration improved'],
        suggestedFocus: ['Focus on performance', 'Plan next quarter'],
        insights: 'Great progress this month',
        source: 'ai',
        model: 'mock-model',
        provider: 'mock'
      };

      const sessions = createMockSessionsInRange(30, new Date('2025-01-01'), new Date('2025-01-31'));
      const dateRange = { start: new Date('2025-01-01'), end: new Date('2025-01-31') };

      // Act
      const summary = summaryService.convertToMonthlySummary(aiResult, sessions, dateRange);

      // Assert
      expect(summary.month).toBe('January');
      expect(summary.year).toBe(2025);
      expect(summary.sessions).toBe(30);
      expect(summary.weeklyBreakdown.length).toBeGreaterThan(0);
      expect(summary.activeDays).toBeGreaterThan(0);
      expect(summary.totalDays).toBe(31);
      expect(summary.achievements).toEqual(aiResult.accomplishments);
      expect(summary.trends).toEqual(aiResult.suggestedFocus);
      expect(summary.insights).toBe(aiResult.insights);
      expect(summary.source).toBe('ai');
      expect(summary.providerInfo).toBeDefined();
    });

    test('should handle monthly summary for different months', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const aiResult: AISummaryResult = {
        accomplishments: ['Work done'],
        suggestedFocus: ['Next steps'],
        source: 'ai'
      };

      // February 2025 (28 days)
      const sessions = createMockSessionsInRange(20, new Date('2025-02-01'), new Date('2025-02-28'));
      const dateRange = { start: new Date('2025-02-01'), end: new Date('2025-02-28') };

      // Act
      const summary = summaryService.convertToMonthlySummary(aiResult, sessions, dateRange);

      // Assert
      expect(summary.month).toBe('February');
      expect(summary.year).toBe(2025);
      expect(summary.totalDays).toBe(28); // February has 28 days in 2025
    });
  });

  describe('Error Classification', () => {
    test('should include error info when LLM fails with rate_limit error', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManager();

      // Simulate rate limit error from CLI provider
      mockProvider.failNextCallWithError(new CLIProviderError(
        'CLI exited with code 1\nError: ConnectError: [resource_exhausted] Error',
        'rate_limit',
        'Wait a few minutes or switch AI provider in Settings'
      ));

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const result = await summaryService.generateDailySummary(context);

      // Assert
      expect(result.source).toBe('fallback');
      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe('rate_limit');
      expect(result.error?.suggestion).toContain('Wait');
    });

    test('should include error info when LLM fails with auth_failed error', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManager();

      // Simulate auth error from CLI provider
      mockProvider.failNextCallWithError(new CLIProviderError(
        'CLI exited with code 1\nError: Not logged in',
        'auth_failed',
        'Run the CLI login command in your terminal'
      ));

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const result = await summaryService.generateDailySummary(context);

      // Assert
      expect(result.source).toBe('fallback');
      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe('auth_failed');
      expect(result.error?.suggestion).toContain('login');
    });

    test('should not include error info for regular errors', async () => {
      // Arrange
      const { llmManager, mockProvider } = await createTestLLMManager();

      // Simulate regular (non-CLI) error
      mockProvider.failNextCall('Service unavailable');

      const summaryService = new SummaryService(llmManager);

      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const result = await summaryService.generateDailySummary(context);

      // Assert
      expect(result.source).toBe('fallback');
      expect(result.error).toBeUndefined();
    });

    test('should pass error info through convertToDailySummary', async () => {
      // Arrange
      const { llmManager } = await createTestLLMManager();
      const summaryService = new SummaryService(llmManager);

      const aiResult: AISummaryResult = {
        accomplishments: ['Basic summary'],
        suggestedFocus: ['Continue work'],
        insights: 'AI analysis unavailable',
        source: 'fallback',
        error: {
          type: 'rate_limit',
          message: 'CLI rate limit reached',
          suggestion: 'Wait a few minutes'
        }
      };

      const sessions = [frontendSession];
      const date = new Date('2025-01-15');

      // Act
      const summary = summaryService.convertToDailySummary(aiResult, sessions, date);

      // Assert
      expect(summary.source).toBe('fallback');
      expect(summary.error).toBeDefined();
      expect(summary.error?.type).toBe('rate_limit');
      expect(summary.error?.message).toBe('CLI rate limit reached');
      expect(summary.error?.suggestion).toBe('Wait a few minutes');
    });
  });
});
