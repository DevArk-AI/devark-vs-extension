import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiscHandler } from '../misc-handler';
import { SharedContext } from '../shared-context';
import type { MessageSender } from '../base-handler';
import type * as vscode from 'vscode';

const mockUri = { fsPath: '/test/path' } as vscode.Uri;

// Mock ExtensionState
vi.mock('../../../extension-state', () => ({
  ExtensionState: {
    getLLMManager: vi.fn().mockReturnValue({
      getSettingsManager: vi.fn().mockReturnValue({
        getFeatureModelsConfig: vi.fn().mockReturnValue({ enabled: true, models: {} }),
        setFeatureModel: vi.fn().mockResolvedValue(undefined),
        setFeatureModelsEnabled: vi.fn().mockResolvedValue(undefined),
        resetFeatureModels: vi.fn().mockResolvedValue(undefined),
      }),
      getConfiguredProviders: vi.fn().mockReturnValue(['ollama']),
      getProvider: vi.fn().mockReturnValue({
        listModels: vi.fn().mockResolvedValue([{ id: 'llama2', name: 'Llama 2' }]),
      }),
    }),
    getAuthService: vi.fn().mockReturnValue({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }),
    getHookService: vi.fn().mockReturnValue({
      getStatus: vi.fn().mockResolvedValue({ installed: true }),
      install: vi.fn().mockResolvedValue({ success: true }),
    }),
    getSyncService: vi.fn().mockReturnValue({
      sync: vi.fn().mockResolvedValue({ success: true, sessionsUploaded: 5 }),
    }),
    getUnifiedSettingsService: vi.fn().mockReturnValue({
      get: vi.fn(),
      getWithDefault: vi.fn().mockReturnValue(false),
      set: vi.fn().mockResolvedValue(undefined),
      setMultiple: vi.fn().mockResolvedValue(undefined),
      onChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      onAnyChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      hasCustomValue: vi.fn().mockReturnValue(false),
      reset: vi.fn().mockResolvedValue(undefined),
      resetAll: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    }),
  },
  isCursorIDE: vi.fn().mockReturnValue(false),
  getEditorName: vi.fn().mockReturnValue('VS Code'),
}));

// Mock vscode
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue(true),
      update: vi.fn().mockResolvedValue(undefined),
    }),
  },
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    withProgress: vi.fn().mockImplementation(async (_options, task) => task({ report: vi.fn() })),
  },
  env: {
    openExternal: vi.fn(),
  },
  Uri: {
    parse: vi.fn((url: string) => ({ toString: () => url })),
  },
  ConfigurationTarget: {
    Global: 1,
  },
  ProgressLocation: {
    Notification: 15,
  },
}));

describe('MiscHandler', () => {
  let handler: MiscHandler;
  let mockSender: MessageSender;
  let sharedContext: SharedContext;
  let mockGlobalState: Map<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSender = { sendMessage: vi.fn() };
    sharedContext = new SharedContext();
    mockGlobalState = new Map();

    // Mock promptHistoryStore
    sharedContext.promptHistoryStore = {
      getAll: vi.fn().mockReturnValue([{ id: '1', prompt: 'test' }]),
      getDailyStats: vi.fn().mockReturnValue({ analyzedToday: 5, avgScore: 7.5 }),
      clearAll: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Mock statusBarManager
    sharedContext.statusBarManager = {
      resetDailyStats: vi.fn(),
    } as any;

    // Mock suggestionEngine
    sharedContext.suggestionEngine = {
      handleDismiss: vi.fn(),
      handleNotNow: vi.fn(),
      checkSessionSuggestions: vi.fn().mockReturnValue({ type: 'break', message: 'Take a break' }),
    } as any;

    // Mock contextExtractor
    sharedContext.contextExtractor = {
      extractSessionContext: vi.fn().mockReturnValue({ files: [], languages: [] }),
      getContextSummary: vi.fn().mockReturnValue({ totalFiles: 0 }),
    } as any;

    const mockContext = {
      globalState: {
        update: vi.fn().mockImplementation((key, value) => {
          mockGlobalState.set(key, value);
          return Promise.resolve();
        }),
        get: vi.fn().mockImplementation((key) => mockGlobalState.get(key)),
      },
    } as unknown as vscode.ExtensionContext;

    handler = new MiscHandler(
      mockSender,
      { extensionUri: mockUri, context: mockContext },
      sharedContext
    );
  });

  describe('getHandledMessageTypes', () => {
    it('should return many message types', () => {
      const types = handler.getHandledMessageTypes();
      expect(types.length).toBeGreaterThan(20);
      expect(types).toContain('getFeatureModels');
      expect(types).toContain('getConfig');
      expect(types).toContain('getEditorInfo');
      expect(types).toContain('test');
      expect(types).toContain('v2GetSessionContext');
    });
  });

  describe('handleMessage', () => {
    it('should handle getEditorInfo', async () => {
      const result = await handler.handleMessage('getEditorInfo', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('editorInfo', expect.objectContaining({
        isCursor: false,
        editorName: 'VS Code',
        autoDetectSupported: true,
      }));
    });

    it('should handle test message', async () => {
      const result = await handler.handleMessage('test', { foo: 'bar' });
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('testResponse', {
        received: { foo: 'bar' },
      });
    });

    it('should handle getPromptHistory', async () => {
      const result = await handler.handleMessage('getPromptHistory', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('promptHistoryLoaded', {
        history: [{ id: '1', prompt: 'test' }],
        analyzedToday: 5,
        avgScore: 7.5,
      });
    });

    it('should handle v2GetSessionContext', async () => {
      const result = await handler.handleMessage('v2GetSessionContext', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SessionContext', {
        context: { files: [], languages: [] },
      });
    });

    it('should handle v2CheckSuggestions', async () => {
      const result = await handler.handleMessage('v2CheckSuggestions', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2Suggestion', {
        suggestion: { type: 'break', message: 'Take a break' },
      });
    });

    it('should return false for uploadCurrentSession (delegated)', async () => {
      const result = await handler.handleMessage('uploadCurrentSession', {});
      expect(result).toBe(false);
    });

    it('should return false for uploadRecentSessions (delegated)', async () => {
      const result = await handler.handleMessage('uploadRecentSessions', {});
      expect(result).toBe(false);
    });

    it('should return false for unknown message types', async () => {
      const result = await handler.handleMessage('unknownType', {});
      expect(result).toBe(false);
    });
  });

  describe('feature models', () => {
    it('should handle getFeatureModels', async () => {
      const result = await handler.handleMessage('getFeatureModels', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('featureModelsUpdate', {
        config: { enabled: true, models: {} },
      });
    });

    it('should handle getAvailableModelsForFeature', async () => {
      const result = await handler.handleMessage('getAvailableModelsForFeature', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('availableModelsForFeature', {
        models: [{ providerId: 'ollama', model: 'ollama:llama2', displayName: 'ollama - Llama 2' }],
      });
    });
  });

  describe('config', () => {
    it('should handle getConfig', async () => {
      const result = await handler.handleMessage('getConfig', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('configLoaded', expect.any(Object));
    });

    it('should handle clearPromptHistory', async () => {
      const result = await handler.handleMessage('clearPromptHistory', {});
      expect(result).toBe(true);
      expect(sharedContext.promptHistoryStore!.clearAll).toHaveBeenCalled();
      expect(mockSender.sendMessage).toHaveBeenCalledWith('promptHistoryLoaded', {
        history: [],
        analyzedToday: 0,
        avgScore: 0,
      });
    });
  });

  describe('suggestions', () => {
    it('should handle v2DismissSuggestion', async () => {
      const result = await handler.handleMessage('v2DismissSuggestion', { type: 'break' });
      expect(result).toBe(true);
      expect(sharedContext.suggestionEngine!.handleDismiss).toHaveBeenCalledWith('break');
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SuggestionDismissed', { type: 'break' });
    });

    it('should handle v2NotNowSuggestion', async () => {
      const result = await handler.handleMessage('v2NotNowSuggestion', { type: 'break' });
      expect(result).toBe(true);
      expect(sharedContext.suggestionEngine!.handleNotNow).toHaveBeenCalledWith('break');
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SuggestionNotNow', { type: 'break' });
    });
  });
});
