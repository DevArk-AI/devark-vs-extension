/**
 * Testing Utilities for LLM System
 *
 * Provides mocks and helpers for unit testing LLM-dependent services.
 */

export * from './mock-provider';
export * from './mock-config-store';

import { MockLLMProvider, createMockProviderWithDefaults } from './mock-provider';
import { MockConfigStore, createMockConfigStoreWithDefaults } from './mock-config-store';
import { MockUnifiedSettingsService } from '../../test/mock-unified-settings';
import { SettingsManager } from '../settings-manager';
import { LLMManager } from '../llm-manager';
import { ProviderRegistry } from '../provider-registry';
import { ILogger } from '../interfaces';

/**
 * Create a MockUnifiedSettingsService with LLM defaults for testing
 */
export function createMockSettingsServiceWithDefaults(): MockUnifiedSettingsService {
  const service = new MockUnifiedSettingsService({
    'llm.provider': 'ollama',
    'llm.activeProvider': 'ollama',
  });

  // Set raw settings for SettingsManager
  service.setRaw('devark.llm', 'activeProvider', 'ollama');
  service.setRaw('devark.llm', 'providers', {
    ollama: {
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:latest',
    },
    openrouter: {
      apiKey: '',
      model: 'test/mock-model',
    },
  });

  return service;
}

/**
 * Mock Logger that captures log messages for testing
 */
export class MockLogger implements ILogger {
  private logs: Array<{ level: string; message: string; error?: Error }> = [];

  info(message: string): void {
    this.logs.push({ level: 'info', message });
  }

  warn(message: string): void {
    this.logs.push({ level: 'warn', message });
  }

  error(message: string, error?: Error): void {
    this.logs.push({ level: 'error', message, error });
  }

  /**
   * Get all captured logs
   */
  getLogs(): Array<{ level: string; message: string; error?: Error }> {
    return [...this.logs];
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: string): Array<{ level: string; message: string; error?: Error }> {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Check if a message was logged
   */
  hasMessage(messageSubstring: string): boolean {
    return this.logs.some(log => log.message.includes(messageSubstring));
  }

  /**
   * Get the last log entry
   */
  getLastLog(): { level: string; message: string; error?: Error } | undefined {
    return this.logs[this.logs.length - 1];
  }
}

/**
 * Test fixtures for LLM Manager
 */
export interface TestLLMManagerFixture {
  llmManager: LLMManager;
  mockProvider: MockLLMProvider;
  mockSettingsService: MockUnifiedSettingsService;
  mockLogger: MockLogger;
  /** @deprecated Use mockSettingsService instead */
  mockConfigStore: MockConfigStore;
}

/**
 * Create a fully configured test LLM Manager
 *
 * This helper sets up:
 * - A mock LLM provider with sensible defaults
 * - A mock config store with test settings
 * - A provider registry with the mock provider registered
 * - A settings manager connected to the mock store
 * - An initialized LLM manager ready to use
 *
 * @example
 * ```ts
 * const { llmManager, mockProvider } = createTestLLMManager();
 *
 * // Configure specific responses
 * mockProvider.setResponse('test prompt', {
 *   text: 'test response',
 *   model: 'mock-model',
 *   usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 }
 * });
 *
 * // Use in service
 * const service = new MyService(llmManager);
 * const result = await service.process('test prompt');
 * ```
 */
export async function createTestLLMManager(): Promise<TestLLMManagerFixture> {
  const mockProvider = createMockProviderWithDefaults();
  const mockSettingsService = createMockSettingsServiceWithDefaults();
  const mockConfigStore = createMockConfigStoreWithDefaults(); // For backwards compatibility
  const mockLogger = new MockLogger();
  const registry = new ProviderRegistry();

  // Register the mock provider
  registry.register(
    {
      id: 'mock',
      displayName: 'Mock Provider',
      description: 'For testing purposes',
      requiresAuth: false,
      supportsStreaming: true,
      supportsCostTracking: false,
      configSchema: {}
    },
    () => mockProvider
  );

  // Also register mock as 'ollama' since SettingsManager.getConfig() is hardcoded
  // to return specific providers. The mock will masquerade as ollama for config purposes.
  registry.register(
    {
      id: 'ollama',
      displayName: 'Ollama (Mock)',
      description: 'Mock Ollama for testing',
      requiresAuth: false,
      supportsStreaming: true,
      supportsCostTracking: false,
      configSchema: {}
    },
    () => mockProvider
  );

  // Create settings manager with mock settings service
  const settingsManager = new SettingsManager(mockSettingsService);

  // Create LLM manager
  const llmManager = new LLMManager(registry, settingsManager);

  // Initialize the LLM manager to set up activeProvider
  await llmManager.initialize();

  return {
    llmManager,
    mockProvider,
    mockSettingsService,
    mockConfigStore, // For backwards compatibility
    mockLogger
  };
}

/**
 * Helper to create a test fixture with specific responses configured
 *
 * @param responses - Map of prompt to response
 * @example
 * ```ts
 * const fixture = createTestLLMManagerWithResponses({
 *   'summarize this': { text: 'Summary here', model: 'mock-model' },
 *   'score this prompt': { text: '{"score": 85}', model: 'mock-model' }
 * });
 * ```
 */
export async function createTestLLMManagerWithResponses(
  responses: Record<string, { text: string; model: string; error?: string }>
): Promise<TestLLMManagerFixture> {
  const fixture = await createTestLLMManager();

  // Configure responses
  for (const [prompt, response] of Object.entries(responses)) {
    fixture.mockProvider.setResponse(prompt, {
      text: response.text,
      model: response.model,
      provider: 'mock',
      timestamp: new Date(),
      error: response.error,
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
    });
  }

  return fixture;
}

/**
 * Create an LLMManager with no providers registered
 *
 * Use this for tests that need to verify fallback behavior when no LLM provider is available.
 * The returned LLMManager will fail to initialize because no providers are registered.
 *
 * @example
 * ```ts
 * const llmManager = createTestLLMManagerWithNoProvider();
 * const service = new SummaryService(llmManager);
 * const result = await service.generateDailySummary(context);
 * expect(result.source).toBe('fallback');
 * ```
 */
export function createTestLLMManagerWithNoProvider(): LLMManager {
  const emptyRegistry = new ProviderRegistry();
  const mockSettingsService = createMockSettingsServiceWithDefaults();
  const settingsManager = new SettingsManager(mockSettingsService);
  return new LLMManager(emptyRegistry, settingsManager);
}

/**
 * Wait for a condition to be true
 *
 * Useful for testing async operations
 */
export async function waitFor(
  condition: () => boolean,
  timeoutMs: number = 1000
): Promise<void> {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

/**
 * Helper to test if a service logs expected messages
 */
export function expectLogs(
  logger: MockLogger,
  expectations: Array<{ level?: string; message: string }>
): void {
  const logs = logger.getLogs();

  for (const expectation of expectations) {
    const found = logs.some(log => {
      const levelMatches = !expectation.level || log.level === expectation.level;
      const messageMatches = log.message.includes(expectation.message);
      return levelMatches && messageMatches;
    });

    if (!found) {
      throw new Error(
        `Expected log not found: ${expectation.level || 'any'} - "${expectation.message}"\n` +
        `Actual logs:\n${logs.map(l => `  ${l.level}: ${l.message}`).join('\n')}`
      );
    }
  }
}
