/**
 * Example Tests Demonstrating DI Architecture
 *
 * These tests show how to use the dependency injection pattern
 * with mocks for unit testing copilot services.
 */

import { SessionSummarizer } from '../../copilot/session-summarizer';
import { PromptScorer } from '../../copilot/prompt-scorer';
import { PromptEnhancer } from '../../copilot/prompt-enhancer';
import {
  createTestLLMManager,
  MockLogger,
  expectLogs,
  createTestLLMManagerWithResponses
} from './index';

describe('Session Summarizer with DI', () => {
  it('should generate a summary using mock provider', async () => {
    // Arrange
    const { llmManager, mockProvider, mockLogger } = await createTestLLMManager();

    // Configure mock response
    mockProvider.setDefaultResponse({
      text: 'Worked on authentication feature. Added OAuth integration and improved security.',
      model: 'mock-model', provider: 'mock', timestamp: new Date(),
      usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 }
    });

    // Create service with dependencies - use mockProvider directly as ILLMProvider
    const summarizer = new SessionSummarizer(mockProvider, mockLogger);

    // Act
    const summary = await summarizer.summarizeSession({
      duration: 3600,
      filesChanged: ['src/auth.ts', 'src/oauth.ts'],
      commands: ['git commit', 'npm test'],
      projectName: 'my-app',
      tool: 'cursor',
      timestamp: new Date().toISOString()
    });

    // Assert
    expect(summary).toContain('authentication');
    expect(mockProvider.getCallHistory()).toHaveLength(1);
    expect(mockLogger.hasMessage('Generating session summary')).toBe(true);
    expect(mockLogger.hasMessage('successfully')).toBe(true);
  });

  it('should fallback gracefully on error', async () => {
    // Arrange
    const { llmManager, mockProvider, mockLogger } = await createTestLLMManager();

    mockProvider.failNextCall('API error');

    const summarizer = new SessionSummarizer(mockProvider, mockLogger);

    // Act
    const summary = await summarizer.summarizeSession({
      duration: 300,
      filesChanged: ['test.ts'],
      commands: [],
      projectName: 'test-project',
      tool: 'vscode',
      timestamp: new Date().toISOString()
    });

    // Assert
    expect(summary).toContain('test-project');
    expect(summary).toContain('5 minute'); // Fallback uses duration
    expect(mockLogger.hasMessage('failed')).toBe(true);
  });
});

describe('Prompt Scorer with DI', () => {
  it('should score a prompt using mock provider', async () => {
    // Arrange
    const fixture = await createTestLLMManagerWithResponses({
      // The actual prompt will be different, but we can set a default
      '__default__': {
        text: JSON.stringify({
          clarity: 8,
          specificity: 7,
          context: 6,
          actionability: 9,
          suggestions: [
            'Good prompt!',
            'Consider adding more context about the codebase'
          ]
        }),
        model: 'mock-model', provider: 'mock', timestamp: new Date()
      }
    });

    const scorer = new PromptScorer(fixture.mockProvider);

    // Act
    const score = await scorer.scorePrompt(
      'Fix the authentication bug in the login component'
    );

    // Assert
    expect(score.overall).toBeGreaterThan(0);
    expect(score.clarity).toBe(8);
    expect(score.specificity).toBe(7);
    expect(score.suggestions).toHaveLength(2);
  });

  it('should return minimal score for empty prompt', async () => {
    // Arrange
    const { mockProvider } = await createTestLLMManager();
    const scorer = new PromptScorer(mockProvider);

    // Act
    const score = await scorer.scorePrompt('');

    // Assert
    expect(score.overall).toBe(0);
    expect(score.suggestions[0]).toContain('empty');
  });
});

describe('Prompt Enhancer with DI', () => {
  it('should enhance a prompt using mock provider', async () => {
    // Arrange
    const fixture = await createTestLLMManagerWithResponses({
      '__default__': {
        text: JSON.stringify({
          enhanced: 'Fix the authentication bug in the login component by investigating the OAuth token validation logic. Check if tokens are being properly verified against the configured identity provider.',
          improvements: [
            'Added specific technical direction',
            'Clarified what to investigate',
            'Included relevant implementation details'
          ]
        }),
        model: 'mock-model', provider: 'mock', timestamp: new Date()
      }
    });

    const enhancer = new PromptEnhancer(fixture.mockProvider);

    // Act
    const result = await enhancer.enhancePrompt(
      'Fix the auth bug',
      'medium'
    );

    // Assert
    expect(result.original).toBe('Fix the auth bug');
    expect(result.enhanced).toContain('authentication');
    expect(result.enhanced).toContain('OAuth');
    expect(result.improvements.length).toBeGreaterThan(0);
  });

  it('should handle enhancement failure gracefully', async () => {
    // Arrange
    const { mockProvider } = await createTestLLMManager();
    mockProvider.failNextCall('Enhancement service unavailable');

    const enhancer = new PromptEnhancer(mockProvider);

    // Act
    const result = await enhancer.enhancePrompt('test prompt');

    // Assert
    expect(result.original).toBe('test prompt');
    expect(result.enhanced).toBe('test prompt'); // Falls back to original
    expect(result.improvements[0]).toContain('unavailable');
  });
});

describe('Testing Utilities', () => {
  it('should track call history in mock provider', async () => {
    // Arrange
    const { llmManager, mockProvider } = await createTestLLMManager();

    // Act
    await llmManager.generateCompletion({ prompt: 'first' });
    await llmManager.generateCompletion({ prompt: 'second' });
    await llmManager.generateCompletion({ prompt: 'third' });

    // Assert
    const history = mockProvider.getCallHistory();
    expect(history).toHaveLength(3);
    expect(history[0].prompt).toBe('first');
    expect(history[1].prompt).toBe('second');
    expect(history[2].prompt).toBe('third');
  });

  it('should capture logs with mock logger', () => {
    // Arrange
    const logger = new MockLogger();

    // Act
    logger.info('Test info message');
    logger.warn('Test warning');
    logger.error('Test error', new Error('Test error'));

    // Assert
    const logs = logger.getLogs();
    expect(logs).toHaveLength(3);

    const infoLogs = logger.getLogsByLevel('info');
    expect(infoLogs).toHaveLength(1);
    expect(infoLogs[0].message).toBe('Test info message');

    expect(logger.hasMessage('warning')).toBe(true);
    expect(logger.hasMessage('error')).toBe(true);
  });

  it('should support expectLogs helper', () => {
    // Arrange
    const logger = new MockLogger();

    logger.info('Starting process');
    logger.info('Processing item 1');
    logger.info('Processing item 2');
    logger.info('Process complete');

    // Assert
    expectLogs(logger, [
      { level: 'info', message: 'Starting' },
      { level: 'info', message: 'complete' }
    ]);
  });
});

/**
 * Example: Integration Test Pattern
 *
 * Shows how to test a complete workflow with multiple services
 */
describe('Integration: Full Workflow', () => {
  it('should score, enhance, and summarize a coding session', async () => {
    // Arrange
    const { mockProvider, mockLogger } = await createTestLLMManager();

    // Configure responses for each service
    mockProvider.setDefaultResponse({
      text: JSON.stringify({
        // This will be parsed differently by each service
        clarity: 7,
        specificity: 8,
        context: 6,
        actionability: 8,
        suggestions: ['Good work!'],
        enhanced: 'Enhanced version of the prompt',
        improvements: ['Better clarity', 'More specific']
      }),
      model: 'mock-model', provider: 'mock', timestamp: new Date(),
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
    });

    // PromptScorer and PromptEnhancer take ILLMProvider only
    // SessionSummarizer takes (ILLMProvider, ILogger?)
    const scorer = new PromptScorer(mockProvider);
    const enhancer = new PromptEnhancer(mockProvider);
    const summarizer = new SessionSummarizer(mockProvider, mockLogger);

    // Act - Score a prompt
    const score = await scorer.scorePrompt('Add user authentication');
    expect(score.overall).toBeGreaterThan(0);

    // Act - Enhance it
    const enhanced = await enhancer.enhancePrompt('Add user authentication');
    expect(enhanced.enhanced).toBeTruthy();

    // Act - Summarize a session
    const summary = await summarizer.summarizeSession({
      duration: 7200,
      filesChanged: ['auth.ts', 'user.ts'],
      commands: ['npm test', 'git commit'],
      projectName: 'my-app',
      tool: 'cursor',
      timestamp: new Date().toISOString()
    });
    expect(summary).toBeTruthy();

    // Assert - All three services were called
    const history = mockProvider.getCallHistory();
    expect(history.length).toBeGreaterThanOrEqual(3);

    // Verify logging happened (only SessionSummarizer uses the logger)
    expectLogs(mockLogger, [
      { message: 'Generating session summary' }
    ]);
  });
});
