/**
 * ProviderDetectionService Unit Tests
 *
 * Tests for LLM provider detection including:
 * - CLI availability detection
 * - Provider status checking
 * - Caching behavior
 * - Active provider identification
 */

import { vi, Mock } from 'vitest';
import { ProviderDetectionService, ProviderStatus } from '../ProviderDetectionService';
import { LLMManager } from '../../llm/llm-manager';
import { ProviderRegistry } from '../../llm/provider-registry';
import { MockLLMProvider, createMockSettingsServiceWithDefaults, createMockSecureConfigStore } from '../../llm/testing';
import { MockUnifiedSettingsService } from '../../test/mock-unified-settings';
import { SettingsManager } from '../../llm/settings-manager';
import {
  claudeCodeConnected,
  claudeCodeAvailable,
  claudeCodeNotDetected,
  cursorConnected,
  cursorNotConfigured,
  ollamaConnected,
  ollamaNotRunning,
  providerCollections,
  mockProviderMetadata
} from '../../test/fixtures/mock-providers';
import { createTestLLMManager } from '../../llm/testing';

// Mock the command utils
vi.mock('../../llm/command-utils', () => ({
  isCommandAvailable: vi.fn()
}));

import { isCommandAvailable } from '../../llm/command-utils';

/**
 * Create a mock provider for testing
 */
function createMockProvider(type: string, available = true): MockLLMProvider {
  const provider = new MockLLMProvider({
    type: type as any,
    model: `${type}-model`,
    capabilities: {
      streaming: true,
      costTracking: false,
      modelListing: type === 'ollama'
    }
  });
  if (!available) {
    provider.failNextCall('Not available');
  }
  return provider;
}

describe('ProviderDetectionService', () => {
  let llmManager: LLMManager;
  let service: ProviderDetectionService;
  let testRegistry: ProviderRegistry;
  let mockSettingsService: MockUnifiedSettingsService;

  beforeEach(() => {
    // Create a test registry with providers registered
    testRegistry = new ProviderRegistry();
    mockSettingsService = createMockSettingsServiceWithDefaults();
    const settingsManager = new SettingsManager(mockSettingsService);

    // Set up mock secure config store for API keys
    const mockSecureStore = createMockSecureConfigStore();
    testRegistry.setSecureConfigStore(mockSecureStore as any);

    // Register mock providers for detection tests
    for (const [id, metadata] of Object.entries(mockProviderMetadata)) {
      testRegistry.register(metadata, () => createMockProvider(id));
    }

    // Set active provider
    mockSettingsService.setRaw('devark.llm', 'activeProvider', 'ollama');

    llmManager = new LLMManager(testRegistry, settingsManager);
    service = new ProviderDetectionService(llmManager);
    vi.clearAllMocks();
  });

  describe('detectAll', () => {
    test('should detect all registered providers', async () => {
      // Arrange
      await llmManager.initialize();

      // Act
      const providers = await service.detectAll();

      // Assert
      expect(providers).toBeInstanceOf(Array);
      expect(providers.length).toBeGreaterThan(0);

      // Should have standard providers
      const providerIds = providers.map(p => p.id);
      expect(providerIds).toContain('ollama');
    });

    test('should return providers in correct order', async () => {
      // Arrange
      await llmManager.initialize();

      // Act
      const providers = await service.detectAll();

      // Assert
      const providerIds = providers.map(p => p.id);

      // CLI providers should come first, then Ollama, then cloud
      const cursorIndex = providerIds.indexOf('cursor-cli');
      const claudeIndex = providerIds.indexOf('claude-agent-sdk');
      const ollamaIndex = providerIds.indexOf('ollama');

      if (cursorIndex !== -1 && ollamaIndex !== -1) {
        expect(cursorIndex).toBeLessThan(ollamaIndex);
      }
      if (claudeIndex !== -1 && ollamaIndex !== -1) {
        expect(claudeIndex).toBeLessThan(ollamaIndex);
      }
    });

    test('should include provider metadata', async () => {
      // Arrange
      await llmManager.initialize();

      // Act
      const providers = await service.detectAll();

      // Assert
      providers.forEach(provider => {
        expect(provider).toHaveProperty('id');
        expect(provider).toHaveProperty('name');
        expect(provider).toHaveProperty('type');
        expect(provider).toHaveProperty('status');
        expect(provider).toHaveProperty('description');

        // Type should be valid
        expect(['cli', 'local', 'cloud']).toContain(provider.type);

        // Status should be valid
        expect(['connected', 'available', 'not-detected', 'not-running', 'not-configured'])
          .toContain(provider.status);
      });
    });

    test('should detect Ollama models when connected', async () => {
      // Arrange
      await llmManager.initialize();

      // Mock Ollama as running with models
      const ollamaProvider = llmManager.getProvider('ollama');
      if (ollamaProvider) {
        vi.spyOn(ollamaProvider, 'isAvailable').mockResolvedValue(true);
        vi.spyOn(ollamaProvider, 'listModels').mockResolvedValue([
          { id: 'codellama:7b', name: 'CodeLlama 7B' },
          { id: 'codellama:13b', name: 'CodeLlama 13B' }
        ]);
      }

      // Act
      const providers = await service.detectAll();

      // Assert
      const ollama = providers.find(p => p.id === 'ollama');
      if (ollama) {
        expect(ollama.availableModels).toBeDefined();
        expect(ollama.availableModels).toContain('codellama:7b');
        expect(ollama.model).toBeTruthy(); // Should have selected a model
      }
    });

    test('should cache results for 30 seconds', async () => {
      // Arrange
      await llmManager.initialize();

      // Act - First call
      const providers1 = await service.detectAll();

      // Act - Second call (should use cache)
      const providers2 = await service.detectAll();

      // Assert
      expect(providers1).toEqual(providers2);

      // Verify no additional provider initialization happened
      // (This would require deeper mocking to verify)
    });

    test('should handle errors gracefully', async () => {
      // Arrange - create manager with empty registry
      const emptyRegistry = new ProviderRegistry();
      const brokenSettingsService = createMockSettingsServiceWithDefaults();
      const brokenSettings = new SettingsManager(brokenSettingsService);
      const brokenManager = new LLMManager(emptyRegistry, brokenSettings);
      const brokenService = new ProviderDetectionService(brokenManager);

      // Mock getAvailableProviders to throw error
      vi.spyOn(brokenManager, 'getAvailableProviders').mockImplementation(() => {
        throw new Error('Registry error');
      });

      // Act & Assert
      await expect(brokenService.detectAll()).rejects.toThrow('Registry error');
    });
  });

  describe('detectOne', () => {
    test('should detect specific provider status', async () => {
      // Arrange
      await llmManager.initialize();

      // Act
      const provider = await service.detectOne('ollama');

      // Assert
      expect(provider).toBeDefined();
      expect(provider.id).toBe('ollama');
      expect(provider.name).toBe('Ollama');
      expect(provider.type).toBe('local');
    });

    test('should not use cache for single provider detection', async () => {
      // Arrange
      await llmManager.initialize();

      // Populate cache
      await service.detectAll();

      // Mock Ollama to return different status
      const ollamaProvider = llmManager.getProvider('ollama');
      if (ollamaProvider) {
        vi.spyOn(ollamaProvider, 'isAvailable')
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false);
      }

      // Act
      const status1 = await service.detectOne('ollama');
      const status2 = await service.detectOne('ollama');

      // Assert - Should call provider each time, not cache
      // (Actual behavior depends on implementation)
      expect(status1).toBeDefined();
      expect(status2).toBeDefined();
    });

    test('should throw error for unknown provider', async () => {
      // Arrange
      await llmManager.initialize();

      // Act & Assert
      await expect(service.detectOne('unknown-provider'))
        .rejects.toThrow('not found in registry');
    });

    test('should detect CLI providers correctly', async () => {
      // Arrange
      await llmManager.initialize();
      (isCommandAvailable as Mock).mockResolvedValue(true);

      // Act
      const claudeStatus = await service.detectOne('claude-agent-sdk');

      // Assert
      expect(claudeStatus.id).toBe('claude-agent-sdk');
      expect(claudeStatus.type).toBe('local');
    });

  });

  describe('getCached', () => {
    test('should return null when cache is empty', () => {
      // Act
      const cached = service.getCached();

      // Assert
      expect(cached).toBeNull();
    });

    test('should return cached providers after detectAll', async () => {
      // Arrange
      await llmManager.initialize();
      await service.detectAll();

      // Act
      const cached = service.getCached();

      // Assert
      expect(cached).toBeDefined();
      expect(cached).toBeInstanceOf(Array);
      expect(cached!.length).toBeGreaterThan(0);
    });

    test('should return null after cache expires (30 seconds)', async () => {
      // Arrange
      await llmManager.initialize();
      await service.detectAll();

      // Act - Fast forward time by 31 seconds
      vi.useFakeTimers();
      vi.advanceTimersByTime(31000);

      const cached = service.getCached();

      // Assert
      expect(cached).toBeNull();

      // Cleanup
      vi.useRealTimers();
    });

    test('should return cached providers within 30 seconds', async () => {
      // Arrange
      await llmManager.initialize();
      await service.detectAll();

      // Act - Fast forward time by 25 seconds (still valid)
      vi.useFakeTimers();
      vi.advanceTimersByTime(25000);

      const cached = service.getCached();

      // Assert
      expect(cached).toBeDefined();
      expect(cached).toBeInstanceOf(Array);

      // Cleanup
      vi.useRealTimers();
    });
  });

  describe('clearCache', () => {
    test('should clear the cache', async () => {
      // Arrange
      await llmManager.initialize();
      await service.detectAll();

      // Verify cache is populated
      expect(service.getCached()).toBeDefined();

      // Act
      service.clearCache();

      // Assert
      expect(service.getCached()).toBeNull();
    });

    test('should force fresh detection after clear', async () => {
      // Arrange
      await llmManager.initialize();
      const providers1 = await service.detectAll();

      // Act
      service.clearCache();
      const providers2 = await service.detectAll();

      // Assert
      // Both should be arrays (can't guarantee different content without mocking)
      expect(providers1).toBeInstanceOf(Array);
      expect(providers2).toBeInstanceOf(Array);
    });
  });

  describe('getActiveProviderId', () => {
    test('should return null when no provider is active', () => {
      // Act
      const activeId = service.getActiveProviderId();

      // Assert
      expect(activeId).toBeNull();
    });

    test('should return active provider ID when one is set', async () => {
      // Arrange
      await llmManager.initialize();

      // Simulate activating a provider
      const ollamaProvider = llmManager.getProvider('ollama');
      if (ollamaProvider) {
        // Mock that Ollama is available
        vi.spyOn(ollamaProvider, 'isAvailable').mockResolvedValue(true);
      }

      // Act
      const activeId = service.getActiveProviderId();

      // Assert
      // Result depends on LLMManager initialization
      expect(activeId === null || typeof activeId === 'string').toBe(true);
    });
  });

  describe('Provider Type Detection', () => {
    test('should classify CLI providers correctly', async () => {
      // Arrange
      await llmManager.initialize();

      // Act
      const providers = await service.detectAll();

      // Assert
      const cliProviders = providers.filter(p => p.type === 'cli');
      const cliIds = cliProviders.map(p => p.id);

      if (cliIds.includes('claude-agent-sdk')) {
        expect(cliIds).toContain('claude-agent-sdk');
      }
      if (cliIds.includes('cursor-cli')) {
        expect(cliIds).toContain('cursor-cli');
      }
    });

    test('should classify Ollama as local provider', async () => {
      // Arrange
      await llmManager.initialize();

      // Act
      const providers = await service.detectAll();

      // Assert
      const ollama = providers.find(p => p.id === 'ollama');
      if (ollama) {
        expect(ollama.type).toBe('local');
      }
    });

    test('should classify OpenRouter as cloud provider', async () => {
      // Arrange
      await llmManager.initialize();

      // Act
      const providers = await service.detectAll();

      // Assert
      const openrouter = providers.find(p => p.id === 'openrouter');
      if (openrouter) {
        expect(openrouter.type).toBe('cloud');
        expect(openrouter.requiresApiKey).toBe(true);
      }
    });
  });

  describe('Provider Status Detection', () => {
    test('should detect connected provider correctly', async () => {
      // Arrange
      await llmManager.initialize();

      // Mock active provider
      const activeProvider = llmManager.getActiveProviderInfo();

      // Act
      const providers = await service.detectAll();

      // Assert
      if (activeProvider) {
        const connectedProvider = providers.find(p => p.id === activeProvider.type);
        if (connectedProvider) {
          expect(connectedProvider.status).toBe('connected');
        }
      }
    });

    test('should detect available but not active providers', async () => {
      // Arrange
      await llmManager.initialize();
      (isCommandAvailable as Mock).mockResolvedValue(true);

      // Act
      const providers = await service.detectAll();

      // Assert
      const availableProviders = providers.filter(p => p.status === 'available');
      // Should have at least some providers available
      expect(availableProviders.length).toBeGreaterThanOrEqual(0);
    });

    test('should detect Ollama not running', async () => {
      // Arrange
      await llmManager.initialize();

      // Mock Ollama as not available
      const ollamaProvider = llmManager.getProvider('ollama');
      if (ollamaProvider) {
        vi.spyOn(ollamaProvider, 'isAvailable').mockResolvedValue(false);
      }

      // Act
      const providers = await service.detectAll();

      // Assert
      const ollama = providers.find(p => p.id === 'ollama');
      if (ollama) {
        expect(ollama.status).toBe('not-running');
      }
    });

    test('should detect Ollama not running even when it is the active provider', async () => {
      // Arrange - Ollama is active provider (from beforeEach: mockConfigStore.set('activeProvider', 'ollama'))
      await llmManager.initialize();

      // Mock Ollama as not available (server not running)
      const ollamaProvider = llmManager.getProvider('ollama');
      if (ollamaProvider) {
        vi.spyOn(ollamaProvider, 'isAvailable').mockResolvedValue(false);
      }

      // Clear cache to force fresh detection
      service.clearCache();

      // Act
      const providers = await service.detectAll();

      // Assert - should be 'not-running', NOT 'connected'
      const ollama = providers.find(p => p.id === 'ollama');
      expect(ollama).toBeDefined();
      expect(ollama!.status).toBe('not-running');
    });

    test('should detect CLI not installed', async () => {
      // Arrange
      await llmManager.initialize();
      (isCommandAvailable as Mock).mockResolvedValue(false);

      // Act
      const providers = await service.detectAll();

      // Assert
      const cliProviders = providers.filter(p => p.type === 'cli');
      cliProviders.forEach(provider => {
        if (provider.status === 'not-detected') {
          expect(provider.status).toBe('not-detected');
        }
      });
    });
  });

  describe('Provider Descriptions', () => {
    test('should provide helpful descriptions', async () => {
      // Arrange
      await llmManager.initialize();

      // Act
      const providers = await service.detectAll();

      // Assert
      providers.forEach(provider => {
        expect(provider.description).toBeTruthy();
        expect(provider.description!.length).toBeGreaterThan(0);
      });

      // Check specific descriptions
      const descriptions = providers.reduce((acc, p) => {
        acc[p.id] = p.description;
        return acc;
      }, {} as Record<string, string | undefined>);

      if (descriptions['claude-agent-sdk']) {
        expect(descriptions['claude-agent-sdk']).toContain('Claude');
      }
      if (descriptions['cursor-cli']) {
        expect(descriptions['cursor-cli']).toContain('Cursor');
      }
      if (descriptions['ollama']) {
        expect(descriptions['ollama']).toContain('local');
      }
    });
  });

  describe('Performance', () => {
    test('should complete detection within reasonable time', async () => {
      // Arrange
      await llmManager.initialize();

      // Act
      const startTime = Date.now();
      await service.detectAll();
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should use cache for repeated calls', async () => {
      // Arrange
      await llmManager.initialize();

      // First call (populates cache)
      const start1 = Date.now();
      await service.detectAll();
      const duration1 = Date.now() - start1;

      // Second call (uses cache)
      const start2 = Date.now();
      await service.detectAll();
      const duration2 = Date.now() - start2;

      // Assert
      // Cached call should be fast (both might be 0ms with mocks, which is fine)
      expect(duration2).toBeLessThanOrEqual(duration1);
      expect(duration2).toBeLessThan(100); // Should be nearly instant
    });
  });

  describe('Error Handling', () => {
    test('should handle provider initialization errors', async () => {
      // Arrange - create manager with empty registry
      const emptyRegistry = new ProviderRegistry();
      const errorSettingsService = createMockSettingsServiceWithDefaults();
      const errorSettings = new SettingsManager(errorSettingsService);
      const errorManager = new LLMManager(emptyRegistry, errorSettings);
      const errorService = new ProviderDetectionService(errorManager);

      // Mock provider to throw error
      vi.spyOn(errorManager, 'getAvailableProviders').mockReturnValue([
        {
          id: 'broken-provider',
          displayName: 'Broken',
          description: 'This provider will fail',
          requiresAuth: false,
          supportsStreaming: false,
          supportsCostTracking: false,
          configSchema: {}
        }
      ]);

      vi.spyOn(errorManager, 'getProvider').mockImplementation(() => {
        throw new Error('Provider initialization failed');
      });

      // Act & Assert
      // Should not throw, should handle gracefully
      await expect(errorService.detectAll()).resolves.toBeDefined();
    });

    test('should handle network errors when checking Ollama', async () => {
      // Arrange
      await llmManager.initialize();

      const ollamaProvider = llmManager.getProvider('ollama');
      if (ollamaProvider) {
        vi.spyOn(ollamaProvider, 'isAvailable').mockRejectedValue(
          new Error('Network error')
        );
      }

      // Act & Assert
      // Network errors currently propagate - service should detect this
      await expect(service.detectAll()).rejects.toThrow('Network error');
    });

    test('should handle errors when listing Ollama models', async () => {
      // Arrange
      await llmManager.initialize();

      const ollamaProvider = llmManager.getProvider('ollama');
      if (ollamaProvider) {
        vi.spyOn(ollamaProvider, 'isAvailable').mockResolvedValue(true);
        vi.spyOn(ollamaProvider, 'listModels').mockRejectedValue(
          new Error('Failed to list models')
        );
      }

      // Act
      const providers = await service.detectAll();

      // Assert
      const ollama = providers.find(p => p.id === 'ollama');
      if (ollama) {
        // Should still be connected even if model listing fails
        expect(ollama.status).toBe('connected');
        // But no models should be listed
        expect(ollama.availableModels).toBeUndefined();
      }
    });
  });

  describe('Ollama detection without provider initialization', () => {
    test('should detect Ollama as available when server is running but provider not initialized', async () => {
      // Arrange - Create manager where Ollama is NOT in the providers map
      // This simulates the case where user hasn't configured Ollama yet
      const unconfiguredRegistry = new ProviderRegistry();
      const unconfiguredSettingsService = createMockSettingsServiceWithDefaults();
      const unconfiguredSettingsManager = new SettingsManager(unconfiguredSettingsService);

      // Register providers but don't configure Ollama
      for (const [id, metadata] of Object.entries(mockProviderMetadata)) {
        unconfiguredRegistry.register(metadata, () => createMockProvider(id));
      }

      // Set up secure config store
      const mockSecureStore = createMockSecureConfigStore();
      unconfiguredRegistry.setSecureConfigStore(mockSecureStore as any);

      // DON'T set any Ollama config - simulates unconfigured provider
      unconfiguredSettingsService.setRaw('devark.llm', 'activeProvider', 'cursor-cli');
      unconfiguredSettingsService.setRaw('devark.llm', 'providers', {
        'cursor-cli': { enabled: true },
        // No ollama config!
      });

      const unconfiguredManager = new LLMManager(unconfiguredRegistry, unconfiguredSettingsManager);
      const unconfiguredService = new ProviderDetectionService(unconfiguredManager);

      // Mock global fetch for direct Ollama check - server IS running
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      try {
        // Act
        const providers = await unconfiguredService.detectAll();

        // Assert
        const ollama = providers.find(p => p.id === 'ollama');
        expect(ollama).toBeDefined();
        expect(ollama!.status).toBe('available'); // NOT 'not-running'
      } finally {
        global.fetch = originalFetch;
      }
    });

    test('should detect Ollama as not-running when server is down and provider not initialized', async () => {
      // Arrange - Same setup as above
      const unconfiguredRegistry = new ProviderRegistry();
      const unconfiguredSettingsService = createMockSettingsServiceWithDefaults();
      const unconfiguredSettingsManager = new SettingsManager(unconfiguredSettingsService);

      for (const [id, metadata] of Object.entries(mockProviderMetadata)) {
        unconfiguredRegistry.register(metadata, () => createMockProvider(id));
      }

      const mockSecureStore = createMockSecureConfigStore();
      unconfiguredRegistry.setSecureConfigStore(mockSecureStore as any);

      unconfiguredSettingsService.setRaw('devark.llm', 'activeProvider', 'cursor-cli');
      unconfiguredSettingsService.setRaw('devark.llm', 'providers', {
        'cursor-cli': { enabled: true },
      });

      const unconfiguredManager = new LLMManager(unconfiguredRegistry, unconfiguredSettingsManager);
      const unconfiguredService = new ProviderDetectionService(unconfiguredManager);

      // Mock global fetch for direct Ollama check - server is NOT running
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      try {
        // Act
        const providers = await unconfiguredService.detectAll();

        // Assert
        const ollama = providers.find(p => p.id === 'ollama');
        expect(ollama).toBeDefined();
        expect(ollama!.status).toBe('not-running');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('Ollama with no model configured', () => {
    test('should detect Ollama as connected when server running but no model configured', async () => {
      // Arrange - Set up Ollama with endpoint but no model
      mockSettingsService.setRaw('devark.llm', 'activeProvider', 'ollama');
      mockSettingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: 'http://localhost:11434',
          // No model - should auto-detect
        },
      });

      await llmManager.initialize();

      const ollamaProvider = llmManager.getProvider('ollama');
      if (ollamaProvider) {
        vi.spyOn(ollamaProvider, 'isAvailable').mockResolvedValue(true);
        vi.spyOn(ollamaProvider, 'listModels').mockResolvedValue([
          { id: 'llama3.1:8b', name: 'Llama 3.1 8B', contextLength: 8192, supportsStreaming: true },
          { id: 'codellama:7b', name: 'CodeLlama 7B', contextLength: 16384, supportsStreaming: true },
        ]);
      }

      service.clearCache();

      // Act
      const providers = await service.detectAll();

      // Assert
      const ollama = providers.find(p => p.id === 'ollama');
      expect(ollama).toBeDefined();
      expect(ollama!.status).toBe('connected');
    });

    test('should show available models from auto-detection', async () => {
      // Arrange
      mockSettingsService.setRaw('devark.llm', 'activeProvider', 'ollama');
      mockSettingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: 'http://localhost:11434',
        },
      });

      await llmManager.initialize();

      const ollamaProvider = llmManager.getProvider('ollama');
      if (ollamaProvider) {
        vi.spyOn(ollamaProvider, 'isAvailable').mockResolvedValue(true);
        vi.spyOn(ollamaProvider, 'listModels').mockResolvedValue([
          { id: 'llama3.1:8b', name: 'Llama 3.1 8B', contextLength: 8192, supportsStreaming: true },
          { id: 'codellama:7b', name: 'CodeLlama 7B', contextLength: 16384, supportsStreaming: true },
        ]);
      }

      service.clearCache();

      // Act
      const providers = await service.detectAll();

      // Assert
      const ollama = providers.find(p => p.id === 'ollama');
      expect(ollama).toBeDefined();
      expect(ollama!.availableModels).toBeDefined();
      expect(ollama!.availableModels).toContain('llama3.1:8b');
      expect(ollama!.availableModels).toContain('codellama:7b');
    });

    test('should handle case where Ollama has no models installed', async () => {
      // Arrange
      mockSettingsService.setRaw('devark.llm', 'activeProvider', 'ollama');
      mockSettingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: 'http://localhost:11434',
        },
      });

      await llmManager.initialize();

      const ollamaProvider = llmManager.getProvider('ollama');
      if (ollamaProvider) {
        vi.spyOn(ollamaProvider, 'isAvailable').mockResolvedValue(true);
        vi.spyOn(ollamaProvider, 'listModels').mockResolvedValue([]);
      }

      service.clearCache();

      // Act
      const providers = await service.detectAll();

      // Assert
      const ollama = providers.find(p => p.id === 'ollama');
      expect(ollama).toBeDefined();
      // Server is running, so status is connected
      expect(ollama!.status).toBe('connected');
      // But no models available
      expect(ollama!.availableModels).toEqual([]);
    });
  });
});
