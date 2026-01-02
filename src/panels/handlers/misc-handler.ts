/**
 * MiscHandler - Handles miscellaneous and legacy messages
 *
 * This is a catch-all handler for:
 * - Feature model settings
 * - Config and onboarding
 * - Data clearing
 * - Tab visibility
 * - Editor detection
 * - Legacy messages (deprecated)
 * - Suggestion handlers
 * - Context handlers
 */

import * as vscode from 'vscode';
import { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
import { SharedContext } from './shared-context';
import { ExtensionState, isCursorIDE, getEditorName } from '../../extension-state';
import type { FeatureType } from '../../llm/types';
import type { WebviewMessageData } from '../../shared/webview-protocol';
import type { IUnifiedSettingsService } from '../../services/UnifiedSettingsService';

// Enable for verbose logging
const DEBUG_MISC_HANDLER = false;

export class MiscHandler extends BaseMessageHandler {
  private sharedContext: SharedContext;
  private _settingsService: IUnifiedSettingsService | null = null;

  constructor(
    messageSender: MessageSender,
    handlerContext: HandlerContext,
    sharedContext: SharedContext
  ) {
    super(messageSender, handlerContext);
    this.sharedContext = sharedContext;
  }

  private get settingsService(): IUnifiedSettingsService {
    if (!this._settingsService) {
      this._settingsService = ExtensionState.getUnifiedSettingsService();
    }
    return this._settingsService;
  }

  getHandledMessageTypes(): string[] {
    return [
      // Feature model settings
      'getFeatureModels',
      'setFeatureModel',
      'setFeatureModelsEnabled',
      'resetFeatureModels',
      'getAvailableModelsForFeature',
      // Config
      'getConfig',
      'completeOnboarding',
      'clearLocalData',
      'clearPromptHistory',
      'getPromptHistory',
      'openExternal',
      'showAllPrompts',
      'cancelLoading',
      // Tab/Editor
      'tabChanged',
      'getEditorInfo',
      'openDashboard',
      'uploadCurrentSession',
      'uploadRecentSessions',
      // Test/Legacy
      'test',
      'testCLI',
      'checkAuthStatus',
      'uploadClaudeSessions',
      'getClaudeHooksStatus',
      'installClaudeHooks',
      // V2 Suggestions
      'v2DismissSuggestion',
      'v2NotNowSuggestion',
      'v2ApplySuggestion',
      'v2CheckSuggestions',
      // V2 Context
      'v2GetSessionContext',
      'v2GetContextSummary',
    ];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    switch (type) {
      // Feature models
      case 'getFeatureModels':
        await this.handleGetFeatureModels();
        return true;
      case 'setFeatureModel': {
        const d = data as WebviewMessageData<'setFeatureModel'>;
        await this.handleSetFeatureModel(d.feature, d.model);
        return true;
      }
      case 'setFeatureModelsEnabled': {
        const d = data as WebviewMessageData<'setFeatureModelsEnabled'>;
        await this.handleSetFeatureModelsEnabled(d.enabled);
        return true;
      }
      case 'resetFeatureModels':
        await this.handleResetFeatureModels();
        return true;
      case 'getAvailableModelsForFeature':
        await this.handleGetAvailableModelsForFeature();
        return true;

      // Config
      case 'getConfig':
        await this.handleGetConfig();
        return true;
      case 'completeOnboarding': {
        const d = data as WebviewMessageData<'completeOnboarding'>;
        await this.handleCompleteOnboarding(d);
        return true;
      }
      case 'clearLocalData':
        await this.handleClearLocalData();
        return true;
      case 'clearPromptHistory':
        await this.handleClearPromptHistory();
        return true;
      case 'getPromptHistory':
        this.sendPromptHistoryToWebview();
        return true;
      case 'openExternal': {
        const d = data as WebviewMessageData<'openExternal'>;
        await this.handleOpenExternal(d.url);
        return true;
      }
      case 'showAllPrompts':
        await this.handleShowAllPrompts();
        return true;
      case 'cancelLoading':
        this.send('loadingProgress', { progress: 0, message: '' });
        return true;

      // Tab/Editor
      case 'tabChanged':
        // Tab changes don't need special handling
        return true;
      case 'getEditorInfo':
        this.handleGetEditorInfo();
        return true;
      case 'openDashboard':
        await this.handleOpenDashboard();
        return true;
      case 'uploadCurrentSession':
      case 'uploadRecentSessions':
        // Delegate to CloudAuthHandler - return false so router tries next handler
        return false;

      // Test/Legacy
      case 'test':
        this.send('testResponse', { received: data });
        return true;
      case 'testCLI':
        await this.handleTestCLI();
        return true;
      case 'checkAuthStatus':
        await this.handleCheckAuthStatus();
        return true;
      case 'uploadClaudeSessions':
        await this.handleUploadClaudeSessions();
        return true;
      case 'getClaudeHooksStatus':
        await this.handleGetClaudeHooksStatus();
        return true;
      case 'installClaudeHooks':
        await this.handleInstallClaudeHooks();
        return true;

      // V2 Suggestions
      case 'v2DismissSuggestion': {
        const d = data as WebviewMessageData<'v2DismissSuggestion'>;
        await this.handleV2DismissSuggestion(d.type);
        return true;
      }
      case 'v2NotNowSuggestion': {
        const d = data as WebviewMessageData<'v2NotNowSuggestion'>;
        await this.handleV2NotNowSuggestion(d.type);
        return true;
      }
      case 'v2ApplySuggestion': {
        const d = data as WebviewMessageData<'v2ApplySuggestion'>;
        await this.handleV2ApplySuggestion(d.id);
        return true;
      }
      case 'v2CheckSuggestions':
        await this.handleV2CheckSuggestions();
        return true;

      // V2 Context
      case 'v2GetSessionContext':
        await this.handleV2GetSessionContext();
        return true;
      case 'v2GetContextSummary':
        await this.handleV2GetContextSummary();
        return true;

      default:
        return false;
    }
  }

  // ============ FEATURE MODELS ============

  /**
   * Get current feature model configuration
   */
  private async handleGetFeatureModels(): Promise<void> {
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager) {
      this.send('featureModelsUpdate', { config: null });
      return;
    }

    const settingsManager = llmManager.getSettingsManager();
    const config = settingsManager.getFeatureModelsConfig();

    this.send('featureModelsUpdate', { config });
  }

  /**
   * Set model override for a specific feature
   */
  private async handleSetFeatureModel(feature?: string, model?: string): Promise<void> {
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager || !feature) return;

    const settingsManager = llmManager.getSettingsManager();
    await settingsManager.setFeatureModel(feature as FeatureType, model || '');

    // Send updated config back
    await this.handleGetFeatureModels();
  }

  /**
   * Enable or disable advanced feature models
   */
  private async handleSetFeatureModelsEnabled(enabled?: boolean): Promise<void> {
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager || enabled === undefined) return;

    const settingsManager = llmManager.getSettingsManager();
    await settingsManager.setFeatureModelsEnabled(enabled);

    await this.handleGetFeatureModels();
  }

  /**
   * Reset all feature models to defaults
   */
  private async handleResetFeatureModels(): Promise<void> {
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager) return;

    const settingsManager = llmManager.getSettingsManager();
    await settingsManager.resetFeatureModels();

    await this.handleGetFeatureModels();
    vscode.window.showInformationMessage('Feature models reset to defaults');
  }

  /**
   * Get available models from all configured providers
   */
  private async handleGetAvailableModelsForFeature(): Promise<void> {
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager) {
      this.send('availableModelsForFeature', { models: [] });
      return;
    }

    const models: { providerId: string; model: string; displayName: string }[] = [];

    for (const providerId of llmManager.getConfiguredProviders()) {
      const provider = llmManager.getProvider(providerId);
      if (provider) {
        try {
          const providerModels = await provider.listModels();
          for (const m of providerModels) {
            models.push({
              providerId,
              model: `${providerId}:${m.id}`,
              displayName: `${providerId} - ${m.name || m.id}`,
            });
          }
        } catch (error) {
          // Silently skip providers that aren't available (e.g., Ollama not running)
          if (DEBUG_MISC_HANDLER) {
            console.warn(`[MiscHandler] Provider ${providerId} unavailable:`, error instanceof Error ? error.message : error);
          }
        }
      }
    }

    this.send('availableModelsForFeature', { models });
  }

  // ============ CONFIG ============

  private async handleGetConfig(): Promise<void> {
    const onboardingCompleted = this.settingsService.getWithDefault('onboarding.completed', false);
    const isFirstRun = !onboardingCompleted;

    this.send('configLoaded', { isFirstRun });
  }

  private async handleCompleteOnboarding(data: WebviewMessageData<'completeOnboarding'>): Promise<void> {
    await this.settingsService.set('onboarding.completed', true);

    if (data?.provider) {
      await this.settingsService.set('llm.provider', data.provider);
    }

    if (data?.autoAnalyze !== undefined) {
      await this.settingsService.set('autoAnalyze.enabled', data.autoAnalyze);
    }

    // Send confirmation to webview - this triggers the view change after data is ready
    this.send('onboardingComplete', { success: true });
  }

  private async handleClearLocalData(): Promise<void> {
    // Clear prompt history store
    if (this.sharedContext.promptHistoryStore) {
      await this.sharedContext.promptHistoryStore.clearAll();
    }

    // Clear copilot storage (sessions, settings, cleanup state)
    await this.extensionContext.globalState.update('copilot.sessions', []);
    await this.extensionContext.globalState.update('copilot.settings', undefined);
    await this.extensionContext.globalState.update('copilot.lastCleanup', undefined);

    // Clear session manager storage (v2 state and sidebar width)
    await this.extensionContext.globalState.update('copilot.v2.sessionState', undefined);
    await this.extensionContext.globalState.update('copilot.v2.sidebarWidth', undefined);

    // Reset status bar
    this.sharedContext.statusBarManager?.resetDailyStats();

    vscode.window.showInformationMessage('Local data cleared');

    // Notify webview
    this.send('promptHistoryLoaded', {
      history: [],
      analyzedToday: 0,
      avgScore: 0,
    });
  }

  private async handleClearPromptHistory(): Promise<void> {
    if (this.sharedContext.promptHistoryStore) {
      await this.sharedContext.promptHistoryStore.clearAll();
    }
    vscode.window.showInformationMessage('Prompt history cleared');

    // Notify webview
    this.send('promptHistoryLoaded', {
      history: [],
      analyzedToday: 0,
      avgScore: 0,
    });
  }

  private async handleOpenExternal(url: string): Promise<void> {
    vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private async handleShowAllPrompts(): Promise<void> {
    // TODO: Show all prompts in a webview or quick pick
    vscode.window.showInformationMessage('View all prompts feature coming soon!');
  }

  // ============ TAB/EDITOR ============

  /**
   * Send editor info to webview (Cursor vs VS Code)
   * Used to show appropriate UI messages
   */
  private handleGetEditorInfo(): void {
    const isCursor = isCursorIDE();
    const editorName = getEditorName();

    if (DEBUG_MISC_HANDLER) {
      console.log(`[MiscHandler] Editor detected: ${editorName} (isCursor: ${isCursor})`);
    }

    this.send('editorInfo', {
      isCursor,
      editorName,
      autoDetectSupported: true, // Auto-detect works for both Cursor (DB polling/hooks) and Claude Code (UserPromptSubmit hooks)
    });
  }

  private async handleOpenDashboard(): Promise<void> {
    try {
      const dashboardUrl = 'https://app.devark.ai';
      await vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
    } catch (error) {
      console.error('[MiscHandler] Failed to open dashboard:', error);
      vscode.window.showErrorMessage('Failed to open dashboard');
    }
  }

  // ============ LEGACY ============

  private async handleTestCLI(): Promise<void> {
    try {
      const authService = ExtensionState.getAuthService();
      const isAuth = await authService.isAuthenticated();
      this.send('testCLIResponse', {
        success: true,
        healthCheck: { authenticated: isAuth },
      });
    } catch (error) {
      console.error('[MiscHandler] Health check failed:', error);
      this.send('error', {
        message: 'Health check failed',
        error: error instanceof Error ? { name: error.name, message: error.message } : undefined,
      });
    }
  }

  private async handleCheckAuthStatus(): Promise<void> {
    try {
      const authService = ExtensionState.getAuthService();
      const isAuthenticated = await authService.isAuthenticated();
      this.send('authStatusResult', { authenticated: isAuthenticated });
    } catch (error) {
      console.error('[MiscHandler] Failed to check auth status:', error);
      this.send('error', {
        message: 'Failed to check authentication status',
        error: error instanceof Error ? { name: error.name, message: error.message } : undefined,
      });
    }
  }

  private async handleUploadClaudeSessions(): Promise<void> {
    try {
      const syncService = ExtensionState.getSyncService();
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Uploading sessions',
          cancellable: false,
        },
        async (progress) => {
          return await syncService.sync({
            onProgress: (current, total) => {
              progress.report({
                message: `${current}/${total} sessions`,
                increment: total > 0 ? 100 / total : 0,
              });
            },
          });
        }
      );

      if (result.success) {
        vscode.window.showInformationMessage(
          `Successfully uploaded ${result.sessionsUploaded} sessions!`
        );
      }

      this.send('uploadClaudeSessionsComplete', result);
    } catch (error) {
      console.error('[MiscHandler] Failed to upload sessions:', error);
      this.send('error', {
        message: 'Failed to upload sessions',
        error: error instanceof Error ? { name: error.name, message: error.message } : undefined,
      });
    }
  }

  private async handleGetClaudeHooksStatus(): Promise<void> {
    try {
      const claudeInstaller = ExtensionState.getClaudeHookInstaller();
      const status = await claudeInstaller.getStatus();
      this.send('claudeHooksStatusResult', status);
    } catch (error) {
      console.error('[MiscHandler] Failed to get Claude hooks status:', error);
      this.send('error', {
        message: 'Failed to get Claude hooks status',
        error: error instanceof Error ? { name: error.name, message: error.message } : undefined,
      });
    }
  }

  private async handleInstallClaudeHooks(): Promise<void> {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Installing Claude hooks',
          cancellable: false,
        },
        async () => {
          const claudeInstaller = ExtensionState.getClaudeHookInstaller();
          await claudeInstaller.install({
            hooks: ['UserPromptSubmit', 'Stop'],
            mode: 'all',
          });
        }
      );
      vscode.window.showInformationMessage('Claude hooks installed successfully!');
      this.send('installClaudeHooksComplete', { success: true });
    } catch (error) {
      console.error('[MiscHandler] Failed to install Claude hooks:', error);
      this.send('error', {
        message: 'Failed to install Claude hooks',
        error: error instanceof Error ? { name: error.name, message: error.message } : undefined,
      });
    }
  }

  // ============ SUGGESTIONS ============

  private async handleV2DismissSuggestion(type: string): Promise<void> {
    try {
      this.sharedContext.suggestionEngine?.handleDismiss(type as Parameters<typeof this.sharedContext.suggestionEngine.handleDismiss>[0]);
      this.send('v2SuggestionDismissed', { type });
    } catch (error) {
      console.error('[MiscHandler] Failed to dismiss suggestion:', error);
    }
  }

  private async handleV2NotNowSuggestion(type: string): Promise<void> {
    try {
      this.sharedContext.suggestionEngine?.handleNotNow(type as Parameters<typeof this.sharedContext.suggestionEngine.handleNotNow>[0]);
      this.send('v2SuggestionNotNow', { type });
    } catch (error) {
      console.error('[MiscHandler] Failed to handle not now:', error);
    }
  }

  /**
   * Handle "Apply" action for a suggestion
   * Marks the suggestion as applied and dismisses it from the UI
   */
  private async handleV2ApplySuggestion(id: string): Promise<void> {
    try {
      // Applied suggestions are effectively dismissed - acknowledge the action
      // The frontend handles the actual "apply" logic (e.g., opening goal editor)
      this.send('v2SuggestionApplied', { id, success: true });
    } catch (error) {
      console.error('[MiscHandler] Failed to apply suggestion:', error);
      this.send('v2SuggestionApplied', { id, success: false, error: 'Failed to apply suggestion' });
    }
  }

  private async handleV2CheckSuggestions(): Promise<void> {
    try {
      const suggestion = this.sharedContext.suggestionEngine?.checkSessionSuggestions();
      if (suggestion) {
        this.send('v2Suggestion', { suggestion });
      }
    } catch (error) {
      console.error('[MiscHandler] Failed to check suggestions:', error);
    }
  }

  // ============ CONTEXT ============

  private async handleV2GetSessionContext(): Promise<void> {
    try {
      const context = this.sharedContext.contextExtractor?.extractSessionContext();
      this.send('v2SessionContext', { context });
    } catch (error) {
      console.error('[MiscHandler] Failed to get session context:', error);
      this.send('v2SessionContext', { context: null });
    }
  }

  private async handleV2GetContextSummary(): Promise<void> {
    try {
      const summary = this.sharedContext.contextExtractor?.getContextSummary();
      this.send('v2ContextSummary', { summary });
    } catch (error) {
      console.error('[MiscHandler] Failed to get context summary:', error);
      this.send('v2ContextSummary', { summary: null });
    }
  }

  // ============ HELPER ============

  public sendPromptHistoryToWebview(): void {
    const promptHistoryStore = this.sharedContext.promptHistoryStore;
    if (!promptHistoryStore) return;

    const history = promptHistoryStore.getAll();
    const stats = promptHistoryStore.getDailyStats();

    this.send('promptHistoryLoaded', {
      history,
      analyzedToday: stats.analyzedToday,
      avgScore: stats.avgScore,
    });
  }
}
