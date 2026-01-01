import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderHandler } from '../provider-handler';
import { SharedContext } from '../shared-context';
import type { MessageSender } from '../base-handler';
import type * as vscode from 'vscode';
import { ExtensionState } from '../../../extension-state';

const mockUri = { fsPath: '/test/path' } as vscode.Uri;

// Shared mock holder that can be accessed from the mock factory
const mockHolder = {
  setApiKey: vi.fn().mockResolvedValue(undefined),
  getApiKey: vi.fn().mockResolvedValue('test-api-key'),
  deleteApiKey: vi.fn().mockResolvedValue(undefined),
};

// Mock ExtensionState.getLLMManager and getUnifiedSettingsService
vi.mock('../../../extension-state', async () => {
  return {
    ExtensionState: {
      getLLMManager: vi.fn().mockReturnValue(null),
      getUnifiedSettingsService: vi.fn().mockReturnValue({
        get: vi.fn(),
        getWithDefault: vi.fn().mockReturnValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        setMultiple: vi.fn().mockResolvedValue(undefined),
        onChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        onAnyChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        hasCustomValue: vi.fn().mockReturnValue(false),
        reset: vi.fn().mockResolvedValue(undefined),
        resetAll: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
      }),
      getSecureConfigStore: vi.fn().mockImplementation(() => mockHolder),
      reset: vi.fn(),
    },
  };
});

describe('ProviderHandler', () => {
  let handler: ProviderHandler;
  let mockSender: MessageSender;
  let sharedContext: SharedContext;
  let mockLLMManager: any;

  beforeEach(() => {
    // Clear shared mocks
    mockHolder.setApiKey.mockClear();
    mockHolder.getApiKey.mockClear();
    mockHolder.deleteApiKey.mockClear();

    mockSender = { sendMessage: vi.fn() };
    sharedContext = new SharedContext();

    // Mock LLM Manager
    mockLLMManager = {
      reinitialize: vi.fn().mockResolvedValue(undefined),
      testAllProviders: vi.fn().mockResolvedValue({
        ollama: { success: true }
      }),
    };

    // Setup ExtensionState mock to return our mock LLM Manager
    vi.mocked(ExtensionState.getLLMManager).mockReturnValue(mockLLMManager);

    // Mock provider detection service
    sharedContext.providerDetectionService = {
      detectAll: vi.fn().mockResolvedValue([
        { id: 'ollama', name: 'Ollama', status: 'connected' }
      ]),
      getActiveProviderId: vi.fn().mockReturnValue('ollama'),
      clearCache: vi.fn(),
    } as any;

    handler = new ProviderHandler(
      mockSender,
      { extensionUri: mockUri, context: {} as vscode.ExtensionContext },
      sharedContext
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle getProviders message', async () => {
    const result = await handler.handleMessage('getProviders', {});
    expect(result).toBe(true);
    expect(mockSender.sendMessage).toHaveBeenCalledWith('providersUpdate', expect.any(Object));
  });

  it('should return correct message types', () => {
    const types = handler.getHandledMessageTypes();
    expect(types).toContain('getProviders');
    expect(types).toContain('switchProvider');
    expect(types).toContain('detectProviders');
    expect(types).toContain('detectProvider');
    expect(types).toContain('verifyApiKey');
    expect(types).toContain('setOllamaModel');
    expect(types).toContain('setOpenRouterModel');
  });

  it('should return false for unknown messages', async () => {
    const result = await handler.handleMessage('unknownMessage', {});
    expect(result).toBe(false);
  });

  it('should send empty providers when service not available', async () => {
    sharedContext.providerDetectionService = undefined;

    await handler.handleMessage('getProviders', {});

    expect(mockSender.sendMessage).toHaveBeenCalledWith('providersUpdate', {
      providers: [],
      active: null,
    });
  });

  it('should handle detectProvider with valid providerId', async () => {
    const result = await handler.handleMessage('detectProvider', { providerId: 'ollama' });
    expect(result).toBe(true);
  });

  it('should handle verifyApiKey with missing apiKey', async () => {
    await handler.handleMessage('verifyApiKey', { providerId: 'openrouter', apiKey: '' });

    expect(mockSender.sendMessage).toHaveBeenCalledWith('verifyApiKeyResult', {
      providerId: 'openrouter',
      success: false,
      error: 'API key is required',
    });
  });

  it('should handle setOllamaModel', async () => {
    const result = await handler.handleMessage('setOllamaModel', { model: 'llama2' });
    expect(result).toBe(true);
  });

  it('should handle setOpenRouterModel', async () => {
    const result = await handler.handleMessage('setOpenRouterModel', { model: 'anthropic/claude-3.5-sonnet' });
    expect(result).toBe(true);
  });

  it('should not proceed with empty model for setOpenRouterModel', async () => {
    await handler.handleMessage('setOpenRouterModel', { model: '' });
    // Should not throw, just return early
    expect(mockSender.sendMessage).not.toHaveBeenCalled();
  });

  describe('verifyApiKey for OpenRouter', () => {
    it('should save model when verifying OpenRouter API key successfully', async () => {
      // Setup mock settingsService
      const mockSettingsService = {
        get: vi.fn(),
        getWithDefault: vi.fn().mockReturnValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        setMultiple: vi.fn().mockResolvedValue(undefined),
        onChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        onAnyChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        hasCustomValue: vi.fn().mockReturnValue(false),
        reset: vi.fn().mockResolvedValue(undefined),
        resetAll: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
      };

      // Mock the OpenRouterProvider using doMock with proper class syntax
      vi.doMock('../../../llm/providers/openrouter-provider', () => {
        return {
          OpenRouterProvider: class {
            testConnection() {
              return Promise.resolve({ success: true });
            }
          },
        };
      });

      // Mock ExtensionState for fresh handler
      vi.doMock('../../../extension-state', () => ({
        ExtensionState: {
          getLLMManager: vi.fn().mockReturnValue(null),
          getUnifiedSettingsService: vi.fn().mockReturnValue(mockSettingsService),
          getSecureConfigStore: vi.fn().mockReturnValue({
            setApiKey: vi.fn().mockResolvedValue(undefined),
            getApiKey: vi.fn().mockResolvedValue('test-api-key'),
            deleteApiKey: vi.fn().mockResolvedValue(undefined),
          }),
          reset: vi.fn(),
        },
      }));

      // Clear module cache and re-import
      vi.resetModules();
      const { ProviderHandler: FreshProviderHandler } = await import('../provider-handler');

      const testHandler = new FreshProviderHandler(
        mockSender,
        { extensionUri: mockUri, context: {} as any },
        sharedContext
      );

      await testHandler.handleMessage('verifyApiKey', {
        providerId: 'openrouter',
        apiKey: 'test-api-key-12345',
        model: 'meta-llama/llama-guard-4-12b:free',
      });

      // Verify model was saved to settings
      // Note: API key is saved to SecureConfigStore (via mockHolder.setApiKey),
      // but testing that across module resets is complex. The key point is that
      // apiKey is NOT saved to settings.json.
      expect(mockSettingsService.set).toHaveBeenCalledWith(
        'llm.providers',
        expect.objectContaining({
          openrouter: expect.objectContaining({
            model: 'meta-llama/llama-guard-4-12b:free',
          }),
        })
      );

      // Verify apiKey is NOT in the settings update
      const setCall = mockSettingsService.set.mock.calls.find(
        (call: unknown[]) => call[0] === 'llm.providers'
      );
      expect(setCall).toBeDefined();
      const savedProviders = setCall?.[1] as Record<string, any>;
      expect(savedProviders.openrouter.apiKey).toBeUndefined();
    });
  });

  describe('switchProvider mutual exclusivity', () => {
    it('should disable other providers when switching to a new provider', async () => {
      // Setup: Multiple providers enabled (reproduces the bug)
      const mockProviders = {
        ollama: { enabled: true, endpoint: 'http://localhost:11434' },
        'claude-agent-sdk': { enabled: true },
        openrouter: { enabled: true, apiKey: 'test-key' }
      };

      const mockSettingsService = {
        get: vi.fn(),
        getWithDefault: vi.fn().mockReturnValue({ ...mockProviders }),
        set: vi.fn().mockResolvedValue(undefined),
        setMultiple: vi.fn().mockResolvedValue(undefined),
        onChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        onAnyChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        hasCustomValue: vi.fn().mockReturnValue(false),
        reset: vi.fn().mockResolvedValue(undefined),
        resetAll: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
      };
      vi.mocked(ExtensionState.getUnifiedSettingsService).mockReturnValue(mockSettingsService as any);

      // Act: Switch to Ollama
      await handler.handleMessage('switchProvider', {
        providerId: 'ollama',
        model: undefined
      });

      // Assert: settingsService.set was called with providers update
      expect(mockSettingsService.set).toHaveBeenCalledWith(
        'llm.providers',
        expect.objectContaining({
          ollama: expect.objectContaining({ enabled: true }),
          'claude-agent-sdk': expect.objectContaining({ enabled: false }),
          openrouter: expect.objectContaining({ enabled: false }),
          'cursor-cli': expect.objectContaining({ enabled: false })
        })
      );

      // Assert: activeProvider was also set
      expect(mockSettingsService.set).toHaveBeenCalledWith('llm.activeProvider', 'ollama');

      // Verify reinitialize was called (to reload providers)
      expect(mockLLMManager.reinitialize).toHaveBeenCalled();
    });

    it('should preserve existing provider config when disabling', async () => {
      // Setup: OpenRouter with API key enabled, switching to Ollama
      const mockProviders = {
        ollama: { enabled: false, endpoint: 'http://localhost:11434' },
        openrouter: { enabled: true, apiKey: 'preserved-key', model: 'claude-3.5-sonnet' }
      };

      const mockSettingsService = {
        get: vi.fn(),
        getWithDefault: vi.fn().mockReturnValue({ ...mockProviders }),
        set: vi.fn().mockResolvedValue(undefined),
        setMultiple: vi.fn().mockResolvedValue(undefined),
        onChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        onAnyChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        hasCustomValue: vi.fn().mockReturnValue(false),
        reset: vi.fn().mockResolvedValue(undefined),
        resetAll: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
      };
      vi.mocked(ExtensionState.getUnifiedSettingsService).mockReturnValue(mockSettingsService as any);

      // Act: Switch to Ollama
      await handler.handleMessage('switchProvider', {
        providerId: 'ollama',
        model: undefined
      });

      // Assert: OpenRouter config preserved, just disabled
      expect(mockSettingsService.set).toHaveBeenCalledWith(
        'llm.providers',
        expect.objectContaining({
          ollama: expect.objectContaining({ enabled: true }),
          openrouter: expect.objectContaining({
            enabled: false,
            apiKey: 'preserved-key',
            model: 'claude-3.5-sonnet'
          })
        })
      );
    });

    it('should NOT auto-enable provider when verifying API key', async () => {
      // Setup: Ollama currently enabled, verifying OpenRouter key
      const mockProviders = {
        ollama: { enabled: true, endpoint: 'http://localhost:11434' },
        openrouter: { enabled: false }
      };

      const mockSettingsService = {
        get: vi.fn(),
        getWithDefault: vi.fn().mockReturnValue({ ...mockProviders }),
        set: vi.fn().mockResolvedValue(undefined),
        setMultiple: vi.fn().mockResolvedValue(undefined),
        onChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        onAnyChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        hasCustomValue: vi.fn().mockReturnValue(false),
        reset: vi.fn().mockResolvedValue(undefined),
        resetAll: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
      };

      // Mock OpenRouterProvider for this test
      vi.doMock('../../../llm/providers/openrouter-provider', () => ({
        OpenRouterProvider: class MockOpenRouterProvider {
          constructor(public config: any) {}
          async testConnection() {
            return { success: true, details: { message: 'Connected' } };
          }
        },
      }));

      // Mock ExtensionState with getSecureConfigStore
      vi.doMock('../../../extension-state', () => ({
        ExtensionState: {
          getLLMManager: vi.fn().mockReturnValue(null),
          getUnifiedSettingsService: vi.fn().mockReturnValue(mockSettingsService),
          getSecureConfigStore: vi.fn().mockReturnValue({
            setApiKey: vi.fn().mockResolvedValue(undefined),
            getApiKey: vi.fn().mockResolvedValue('test-api-key'),
            deleteApiKey: vi.fn().mockResolvedValue(undefined),
          }),
          reset: vi.fn(),
        },
      }));

      vi.resetModules();
      const { ProviderHandler: FreshProviderHandler } = await import('../provider-handler');

      const testHandler = new FreshProviderHandler(
        mockSender,
        { extensionUri: mockUri, context: {} as any },
        sharedContext
      );

      // Act: Verify OpenRouter API key
      await testHandler.handleMessage('verifyApiKey', {
        providerId: 'openrouter',
        apiKey: 'test-key',
        model: 'claude-3.5-sonnet'
      });

      // Assert: Model saved to settings, but openrouter NOT auto-enabled
      // Note: API key is saved to SecureConfigStore, not settings.json
      const setCall = mockSettingsService.set.mock.calls.find(
        (call: unknown[]) => call[0] === 'llm.providers'
      );
      expect(setCall).toBeDefined();
      const updatedProviders = setCall?.[1] as Record<string, { enabled?: boolean; model?: string; apiKey?: string }>;
      expect(updatedProviders.openrouter.model).toBe('claude-3.5-sonnet');
      // Verify apiKey is NOT saved to settings
      expect(updatedProviders.openrouter.apiKey).toBeUndefined();
      // openrouter should NOT be auto-enabled - verifying key doesn't switch providers
      expect(updatedProviders.openrouter.enabled).not.toBe(true);
    });
  });
});
