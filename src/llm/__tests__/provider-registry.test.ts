/**
 * Provider Registry Tests
 *
 * Demonstrates and verifies the registry-based provider system.
 */

import { ProviderRegistry, ProviderMetadata } from '../provider-registry';
import { LLMProvider, ProviderCapabilities } from '../types';

/**
 * Mock provider for testing
 */
class MockProvider implements LLMProvider {
  public readonly type = 'mock';
  public readonly model: string;
  public readonly capabilities: ProviderCapabilities = {
    streaming: true,
    costTracking: false,
    modelListing: true,
    customEndpoints: false,
    requiresAuth: false,
  };

  constructor(config: { model: string }) {
    this.model = config.model;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async testConnection() {
    return { success: true };
  }

  async listModels() {
    return [{ id: this.model, name: this.model }];
  }

  async generateCompletion() {
    return {
      text: 'Mock response',
      model: this.model,
      provider: this.type,
      timestamp: new Date(),
    };
  }

  async *streamCompletion() {
    yield {
      text: 'Mock',
      isComplete: false,
      model: this.model,
      provider: this.type,
    };
    yield {
      text: ' response',
      isComplete: true,
      model: this.model,
      provider: this.type,
    };
  }
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  describe('register', () => {
    test('should register a provider', () => {
      const metadata: ProviderMetadata = {
        id: 'mock',
        displayName: 'Mock Provider',
        description: 'A mock provider for testing',
        requiresAuth: false,
        supportsStreaming: true,
        supportsCostTracking: false,
        configSchema: {
          model: { type: 'string', required: true },
        },
      };

      registry.register(metadata, (config) => new MockProvider(config));

      expect(registry.hasProvider('mock')).toBe(true);
      expect(registry.getProviderCount()).toBe(1);
    });

    test('should throw when registering duplicate provider', () => {
      const metadata: ProviderMetadata = {
        id: 'mock',
        displayName: 'Mock Provider',
        description: 'A mock provider',
        requiresAuth: false,
        supportsStreaming: true,
        supportsCostTracking: false,
        configSchema: {},
      };

      registry.register(metadata, (config) => new MockProvider(config));

      expect(() => {
        registry.register(metadata, (config) => new MockProvider(config));
      }).toThrow(/already registered/);
    });
  });

  describe('getProvider', () => {
    beforeEach(() => {
      const metadata: ProviderMetadata = {
        id: 'mock',
        displayName: 'Mock Provider',
        description: 'A mock provider',
        requiresAuth: false,
        supportsStreaming: true,
        supportsCostTracking: false,
        configSchema: {
          model: { type: 'string', required: true },
        },
      };

      registry.register(metadata, (config) => new MockProvider(config));
    });

    test('should instantiate a provider', async () => {
      const provider = await registry.getProvider('mock', { model: 'test-model' });

      expect(provider).toBeInstanceOf(MockProvider);
      expect(provider.model).toBe('test-model');
      expect(provider.type).toBe('mock');
    });

    test('should throw for unknown provider', async () => {
      await expect(
        registry.getProvider('unknown', { model: 'test' })
      ).rejects.toThrow(/Unknown provider/);
    });
  });

  describe('listAvailable', () => {
    test('should list all registered providers', () => {
      const metadata1: ProviderMetadata = {
        id: 'mock1',
        displayName: 'Mock 1',
        description: 'First mock',
        requiresAuth: false,
        supportsStreaming: true,
        supportsCostTracking: false,
        configSchema: {},
      };

      const metadata2: ProviderMetadata = {
        id: 'mock2',
        displayName: 'Mock 2',
        description: 'Second mock',
        requiresAuth: true,
        supportsStreaming: false,
        supportsCostTracking: true,
        configSchema: {},
      };

      registry.register(metadata1, (config) => new MockProvider(config));
      registry.register(metadata2, (config) => new MockProvider(config));

      const available = registry.listAvailable();

      expect(available).toHaveLength(2);
      expect(available.map((p) => p.id)).toEqual(['mock1', 'mock2']);
    });

    test('should return empty array when no providers registered', () => {
      expect(registry.listAvailable()).toEqual([]);
    });
  });

  describe('validateConfig', () => {
    beforeEach(() => {
      const metadata: ProviderMetadata = {
        id: 'mock',
        displayName: 'Mock Provider',
        description: 'A mock provider',
        requiresAuth: false,
        supportsStreaming: true,
        supportsCostTracking: false,
        configSchema: {
          model: { type: 'string', required: true },
          temperature: { type: 'number', required: false, default: 0.7 },
        },
      };

      registry.register(metadata, (config) => new MockProvider(config));
    });

    test('should validate valid configuration', () => {
      const result = registry.validateConfig('mock', {
        model: 'test-model',
        temperature: 0.5,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should detect missing required fields', () => {
      const result = registry.validateConfig('mock', {
        temperature: 0.5,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Required field 'model' is missing");
    });

    test('should detect type mismatches', () => {
      const result = registry.validateConfig('mock', {
        model: 'test-model',
        temperature: 'hot', // Should be number
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('type'))).toBe(true);
    });

    test('should return error for unknown provider', () => {
      const result = registry.validateConfig('unknown', { model: 'test' });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Unknown provider: 'unknown'");
    });
  });

  describe('getMetadata', () => {
    test('should return provider metadata', () => {
      const metadata: ProviderMetadata = {
        id: 'mock',
        displayName: 'Mock Provider',
        description: 'A mock provider',
        requiresAuth: false,
        supportsStreaming: true,
        supportsCostTracking: false,
        configSchema: {},
      };

      registry.register(metadata, (config) => new MockProvider(config));

      const retrieved = registry.getMetadata('mock');

      expect(retrieved).toEqual(metadata);
    });

    test('should return null for unknown provider', () => {
      expect(registry.getMetadata('unknown')).toBeNull();
    });
  });

  describe('clear', () => {
    test('should clear all providers', () => {
      const metadata: ProviderMetadata = {
        id: 'mock',
        displayName: 'Mock Provider',
        description: 'A mock provider',
        requiresAuth: false,
        supportsStreaming: true,
        supportsCostTracking: false,
        configSchema: {},
      };

      registry.register(metadata, (config) => new MockProvider(config));
      expect(registry.getProviderCount()).toBe(1);

      registry.clear();
      expect(registry.getProviderCount()).toBe(0);
      expect(registry.hasProvider('mock')).toBe(false);
    });
  });
});

describe('Integration Test: Real Providers', () => {
  // Skip: Runtime require() for decorator registration doesn't work in vitest ESM mode
  // This test validates runtime behavior which requires different testing approach
  test.skip('should have registered Ollama and OpenRouter', async () => {
    // Import the global registry (this triggers decorator registration)
    const { defaultProviderRegistry } = await import('../decorators');

    // Force module loading
    await import('../providers/ollama-provider');
    await import('../providers/openrouter-provider');

    const providers = defaultProviderRegistry.listAvailable();

    expect(providers.length).toBeGreaterThanOrEqual(2);

    const providerIds = providers.map((p) => p.id);
    expect(providerIds).toContain('ollama');
    expect(providerIds).toContain('openrouter');

    // Verify Ollama metadata
    const ollamaMetadata = defaultProviderRegistry.getMetadata('ollama');
    expect(ollamaMetadata).not.toBeNull();
    expect(ollamaMetadata?.displayName).toBe('Ollama');
    expect(ollamaMetadata?.requiresAuth).toBe(false);
    expect(ollamaMetadata?.supportsStreaming).toBe(true);

    // Verify OpenRouter metadata
    const openrouterMetadata = defaultProviderRegistry.getMetadata('openrouter');
    expect(openrouterMetadata).not.toBeNull();
    expect(openrouterMetadata?.displayName).toBe('OpenRouter');
    expect(openrouterMetadata?.requiresAuth).toBe(true);
    expect(openrouterMetadata?.supportsCostTracking).toBe(true);
  });
});
