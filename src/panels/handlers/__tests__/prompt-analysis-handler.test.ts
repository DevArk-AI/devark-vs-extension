import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptAnalysisHandler } from '../prompt-analysis-handler';
import { SharedContext } from '../shared-context';
import type { MessageSender } from '../base-handler';
import type * as vscode from 'vscode';

const mockUri = { fsPath: '/test/path' } as vscode.Uri;

// Mock ExtensionState
vi.mock('../../../extension-state', () => ({
  ExtensionState: {
    getLLMManager: vi.fn(),
    getClaudeHookInstaller: vi.fn().mockReturnValue({
      install: vi.fn().mockResolvedValue({ success: true, hooksInstalled: [], errors: [] }),
      uninstallHook: vi.fn().mockResolvedValue({ success: true }),
      getStatus: vi.fn().mockResolvedValue({ installed: false, hooks: [] }),
    }),
    getCursorHookInstaller: vi.fn().mockReturnValue({
      install: vi.fn().mockResolvedValue({ success: true, hooksInstalled: [], errors: [] }),
      uninstall: vi.fn().mockResolvedValue({ success: true, errors: [] }),
      getStatus: vi.fn().mockResolvedValue({ installed: false, hooks: [] }),
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
    getAnalyticsService: vi.fn().mockReturnValue({
      track: vi.fn(),
      isEnabled: vi.fn().mockReturnValue(false),
    }),
  },
  isCursorIDE: vi.fn().mockReturnValue(false),
}));

// Mock vscode
vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
  },
  env: {
    clipboard: {
      writeText: vi.fn(),
    },
  },
  workspace: {
    getConfiguration: vi.fn().mockReturnValue({
      update: vi.fn(),
    }),
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
  },
  ConfigurationTarget: {
    Global: 1,
  },
}));

describe('PromptAnalysisHandler', () => {
  let handler: PromptAnalysisHandler;
  let mockSender: MessageSender;
  let sharedContext: SharedContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSender = { sendMessage: vi.fn() };
    sharedContext = new SharedContext();

    // Mock services
    sharedContext.promptHistoryStore = {
      addPrompt: vi.fn(),
      getDailyStats: vi.fn().mockReturnValue({ analyzedToday: 5, avgScore: 7.5 }),
    } as any;

    sharedContext.statusBarManager = {
      addPromptScore: vi.fn(),
    } as any;

    sharedContext.promptDetectionService = {
      getStatus: vi.fn().mockReturnValue({
        enabled: true,
        activeAdapters: 2,
        totalPromptsDetected: 10,
        adapters: [{ name: 'claude', enabled: true }, { name: 'cursor', enabled: true }],
      }),
      initialize: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      updateConfig: vi.fn(),
    } as any;

    sharedContext.chatInjector = {
      injectIntoCursor: vi.fn().mockResolvedValue(true),
      injectIntoClaudeCode: vi.fn(),
    } as any;

    sharedContext.goalService = {
      inferGoalWithLLM: vi.fn().mockResolvedValue({
        suggestedGoal: 'Test goal',
        confidence: 0.8,
        detectedTheme: 'testing',
      }),
    } as any;

    handler = new PromptAnalysisHandler(
      mockSender,
      { extensionUri: mockUri, context: {} as vscode.ExtensionContext },
      sharedContext
    );
  });

  describe('getHandledMessageTypes', () => {
    it('should return correct message types', () => {
      const types = handler.getHandledMessageTypes();
      expect(types).toContain('analyzePrompt');
      expect(types).toContain('useImprovedPrompt');
      expect(types).toContain('trackImprovedPromptCopied');
      expect(types).toContain('toggleAutoAnalyze');
      expect(types).toContain('getAutoAnalyzeStatus');
      expect(types).toContain('toggleResponseAnalysis');
      expect(types).toContain('getResponseAnalysisStatus');
      expect(types).toHaveLength(7);
    });
  });

  describe('handleMessage', () => {
    it('should return false for unknown messages', async () => {
      const result = await handler.handleMessage('unknownMessage', {});
      expect(result).toBe(false);
      expect(mockSender.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle useImprovedPrompt with cursor source', async () => {
      const result = await handler.handleMessage('useImprovedPrompt', {
        prompt: 'test prompt',
        source: 'cursor',
      });

      expect(result).toBe(true);
      expect(sharedContext.chatInjector!.injectIntoCursor).toHaveBeenCalledWith('test prompt');
    });

    it('should fallback to clipboard when chatInjector not available', async () => {
      sharedContext.chatInjector = undefined;
      const vscode = await import('vscode');

      const result = await handler.handleMessage('useImprovedPrompt', {
        prompt: 'test prompt',
        source: 'cursor',
      });

      expect(result).toBe(true);
      expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('test prompt');
    });

    it('should skip empty prompts', async () => {
      const result = await handler.handleMessage('useImprovedPrompt', {
        prompt: '',
        source: 'cursor',
      });

      expect(result).toBe(true);
      expect(sharedContext.chatInjector!.injectIntoCursor).not.toHaveBeenCalled();
    });
  });

  // Note: getAutoAnalyzeStatus tests removed as the handler was removed as dead code

  describe('toggleAutoAnalyze', () => {
    it('should start prompt detection when enabled', async () => {
      const result = await handler.handleMessage('toggleAutoAnalyze', { enabled: true });

      expect(result).toBe(true);
      expect(sharedContext.promptDetectionService!.initialize).toHaveBeenCalled();
      expect(sharedContext.promptDetectionService!.start).toHaveBeenCalled();
      expect(sharedContext.promptDetectionService!.updateConfig).toHaveBeenCalledWith({
        enabled: true,
        autoAnalyze: true
      });
    });

    it('should stop prompt detection when disabled', async () => {
      const result = await handler.handleMessage('toggleAutoAnalyze', { enabled: false });

      expect(result).toBe(true);
      expect(sharedContext.promptDetectionService!.stop).toHaveBeenCalled();
      expect(sharedContext.promptDetectionService!.updateConfig).toHaveBeenCalledWith({
        enabled: false
      });
    });
  });

  describe('toggleResponseAnalysis', () => {
    it('should save setting and send status when enabled', async () => {
      const { ExtensionState } = await import('../../../extension-state');
      const settingsService = ExtensionState.getUnifiedSettingsService();

      const result = await handler.handleMessage('toggleResponseAnalysis', { enabled: true });

      expect(result).toBe(true);
      expect(settingsService.set).toHaveBeenCalledWith('responseAnalysis.enabled', true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('responseAnalysisStatus', { enabled: true });
    });

    it('should save setting and send status when disabled', async () => {
      const { ExtensionState } = await import('../../../extension-state');
      const settingsService = ExtensionState.getUnifiedSettingsService();

      const result = await handler.handleMessage('toggleResponseAnalysis', { enabled: false });

      expect(result).toBe(true);
      expect(settingsService.set).toHaveBeenCalledWith('responseAnalysis.enabled', false);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('responseAnalysisStatus', { enabled: false });
    });
  });

  describe('getResponseAnalysisStatus', () => {
    it('should return current response analysis status', async () => {
      const { ExtensionState } = await import('../../../extension-state');
      const settingsService = ExtensionState.getUnifiedSettingsService();
      (settingsService.getWithDefault as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const result = await handler.handleMessage('getResponseAnalysisStatus', {});

      expect(result).toBe(true);
      expect(settingsService.getWithDefault).toHaveBeenCalledWith('responseAnalysis.enabled', true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('responseAnalysisStatus', { enabled: true });
    });
  });
});
