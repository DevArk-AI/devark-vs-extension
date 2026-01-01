/**
 * LLMManager Unit Tests
 *
 * Tests for LLM manager initialization and provider management,
 * specifically covering Ollama auto-detection behavior.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { LLMManager } from '../llm-manager';
import { ProviderRegistry } from '../provider-registry';
import { SettingsManager } from '../settings-manager';
import { MockUnifiedSettingsService } from '../../test/mock-unified-settings';
import { OllamaProvider } from '../providers/ollama-provider';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LLMManager', () => {
  let registry: ProviderRegistry;
  let settingsService: MockUnifiedSettingsService;
  let settingsManager: SettingsManager;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ProviderRegistry();
    settingsService = new MockUnifiedSettingsService();
    settingsManager = new SettingsManager(settingsService);

    // Register Ollama provider
    registry.register(
      {
        id: 'ollama',
        displayName: 'Ollama',
        description: 'Local LLM provider',
        requiresAuth: false,
        supportsStreaming: true,
        supportsCostTracking: false,
        configSchema: {},
      },
      (config) => new OllamaProvider(config)
    );
  });

  describe('initialization with Ollama', () => {
    test('should initialize OllamaProvider without model in config', async () => {
      // Setup: Ollama with endpoint but no model
      settingsService.setRaw('devark.llm', 'activeProvider', 'ollama');
      settingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: 'http://localhost:11434',
          // No model - should allow initialization
        },
      });

      const llmManager = new LLMManager(registry, settingsManager);

      // Act - should not throw
      await llmManager.initialize();

      // Assert
      expect(llmManager.isInitialized()).toBe(true);
      expect(llmManager.getActiveProviderInfo()).toBeDefined();
      expect(llmManager.getActiveProviderInfo()?.type).toBe('ollama');
    });

    test('should be usable after initialization with auto-detected model', async () => {
      // Setup: Ollama with no model configured
      settingsService.setRaw('devark.llm', 'activeProvider', 'ollama');
      settingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: 'http://localhost:11434',
        },
      });

      const llmManager = new LLMManager(registry, settingsManager);
      await llmManager.initialize();

      // Mock fetch for auto-detection + completion
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            models: [{ name: 'llama3.1:8b', details: {} }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            response: 'Test response',
            done: true,
            prompt_eval_count: 10,
            eval_count: 5,
          }),
        });

      // Act
      const result = await llmManager.generateCompletion({ prompt: 'Hello' });

      // Assert
      expect(result.text).toBe('Test response');
      expect(result.model).toBe('llama3.1:8b');
    });

    test('should use default endpoint when empty string provided', async () => {
      // Note: getOllamaConfig() falls back to default endpoint when empty
      settingsService.setRaw('devark.llm', 'activeProvider', 'ollama');
      settingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: '',
        },
      });

      const llmManager = new LLMManager(registry, settingsManager);

      // Should not throw - falls back to default endpoint
      await llmManager.initialize();

      expect(llmManager.isInitialized()).toBe(true);
    });
  });

  describe('getActiveProviderInfo', () => {
    test('should return empty model string before auto-detection', async () => {
      settingsService.setRaw('devark.llm', 'activeProvider', 'ollama');
      settingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: 'http://localhost:11434',
          // No model
        },
      });

      const llmManager = new LLMManager(registry, settingsManager);
      await llmManager.initialize();

      const info = llmManager.getActiveProviderInfo();

      expect(info?.type).toBe('ollama');
      expect(info?.model).toBe(''); // Empty before auto-detection
    });

    test('should return configured model when set', async () => {
      settingsService.setRaw('devark.llm', 'activeProvider', 'ollama');
      settingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: 'http://localhost:11434',
          model: 'configured-model',
        },
      });

      const llmManager = new LLMManager(registry, settingsManager);
      await llmManager.initialize();

      const info = llmManager.getActiveProviderInfo();

      expect(info?.type).toBe('ollama');
      expect(info?.model).toBe('configured-model');
    });
  });

  describe('provider management', () => {
    test('should get provider by id', async () => {
      settingsService.setRaw('devark.llm', 'activeProvider', 'ollama');
      settingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: 'http://localhost:11434',
        },
      });

      const llmManager = new LLMManager(registry, settingsManager);
      await llmManager.initialize();

      const provider = llmManager.getProvider('ollama');

      expect(provider).toBeDefined();
      expect(provider?.type).toBe('ollama');
    });

    test('should return null for unregistered provider', async () => {
      settingsService.setRaw('devark.llm', 'activeProvider', 'ollama');
      settingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: 'http://localhost:11434',
        },
      });

      const llmManager = new LLMManager(registry, settingsManager);
      await llmManager.initialize();

      const provider = llmManager.getProvider('nonexistent' as any);

      expect(provider).toBeNull();
    });
  });
});
