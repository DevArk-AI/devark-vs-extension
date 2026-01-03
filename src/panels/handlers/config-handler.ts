/**
 * ConfigHandler - Handles configuration and data management messages
 *
 * Responsibilities:
 * - Onboarding status (getConfig, completeOnboarding)
 * - Feature model configuration (getFeatureModels, setFeatureModel, etc.)
 * - Data management (clearLocalData, clearPromptHistory, getPromptHistory)
 */

import * as vscode from 'vscode';
import { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
import { SharedContext } from './shared-context';
import { ExtensionState } from '../../extension-state';
import type { FeatureType } from '../../llm/types';
import type { WebviewMessageData } from '../../shared/webview-protocol';
import type { IUnifiedSettingsService } from '../../services/UnifiedSettingsService';
import { AnalyticsEvents } from '../../services/analytics-events';

export class ConfigHandler extends BaseMessageHandler {
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
      'getConfig',
      'completeOnboarding',
      'getFeatureModels',
      'setFeatureModel',
      'setFeatureModelsEnabled',
      'resetFeatureModels',
      'getAvailableModelsForFeature',
      'clearLocalData',
      'clearPromptHistory',
      'getPromptHistory',
    ];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    switch (type) {
      case 'getConfig':
        await this.handleGetConfig();
        return true;
      case 'completeOnboarding': {
        const d = data as WebviewMessageData<'completeOnboarding'>;
        await this.handleCompleteOnboarding(d);
        return true;
      }
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
      case 'clearLocalData':
        await this.handleClearLocalData();
        return true;
      case 'clearPromptHistory':
        await this.handleClearPromptHistory();
        return true;
      case 'getPromptHistory':
        this.sendPromptHistoryToWebview();
        return true;
      default:
        return false;
    }
  }

  private async handleGetConfig(): Promise<void> {
    const onboardingCompleted = this.settingsService.getWithDefault('onboarding.completed', false);
    const isFirstRun = !onboardingCompleted;
    console.log('[ConfigHandler] getConfig - onboardingCompleted:', onboardingCompleted, 'isFirstRun:', isFirstRun);
    this.send('configLoaded', { isFirstRun });
  }

  private async handleCompleteOnboarding(data: WebviewMessageData<'completeOnboarding'>): Promise<void> {
    await this.settingsService.set('onboarding.completed', true);

    // Track onboarding completion
    ExtensionState.getAnalyticsService().track(AnalyticsEvents.ONBOARDING_COMPLETED);

    if (data?.provider) {
      await this.settingsService.set('llm.activeProvider', data.provider);

      const llmManager = ExtensionState.getLLMManager();
      if (llmManager) {
        await llmManager.reinitialize();
      }
    }

    if (data?.autoAnalyze !== undefined) {
      await this.settingsService.set('autoAnalyze.enabled', data.autoAnalyze);
    }

    this.sendPromptHistoryToWebview();
    this.send('onboardingComplete', { success: true });
  }

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

  private async handleSetFeatureModel(feature: string, model: string): Promise<void> {
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager || !feature) return;

    const settingsManager = llmManager.getSettingsManager();
    await settingsManager.setFeatureModel(feature as FeatureType, model || '');
    await this.handleGetFeatureModels();
  }

  private async handleSetFeatureModelsEnabled(enabled: boolean): Promise<void> {
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager) return;

    const settingsManager = llmManager.getSettingsManager();
    await settingsManager.setFeatureModelsEnabled(enabled);
    await this.handleGetFeatureModels();
  }

  private async handleResetFeatureModels(): Promise<void> {
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager) return;

    const settingsManager = llmManager.getSettingsManager();
    await settingsManager.resetFeatureModels();
    await this.handleGetFeatureModels();
    vscode.window.showInformationMessage('Feature models reset to defaults');
  }

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
        } catch {
          // Silently skip providers that aren't available
        }
      }
    }

    this.send('availableModelsForFeature', { models });
  }

  private async handleClearLocalData(): Promise<void> {
    const promptHistoryStore = this.sharedContext.promptHistoryStore;
    if (promptHistoryStore) {
      await promptHistoryStore.clearAll();
    }

    await this.extensionContext.globalState.update('copilot.sessions', []);
    await this.extensionContext.globalState.update('copilot.settings', undefined);
    await this.extensionContext.globalState.update('copilot.lastCleanup', undefined);
    await this.extensionContext.globalState.update('copilot.v2.sessionState', undefined);
    await this.extensionContext.globalState.update('copilot.v2.sidebarWidth', undefined);

    this.sharedContext.statusBarManager?.resetDailyStats();
    vscode.window.showInformationMessage('Local data cleared');

    this.send('promptHistoryLoaded', {
      history: [],
      analyzedToday: 0,
      avgScore: 0,
    });
  }

  private async handleClearPromptHistory(): Promise<void> {
    const promptHistoryStore = this.sharedContext.promptHistoryStore;
    if (promptHistoryStore) {
      await promptHistoryStore.clearAll();
    }
    vscode.window.showInformationMessage('Prompt history cleared');

    this.send('promptHistoryLoaded', {
      history: [],
      analyzedToday: 0,
      avgScore: 0,
    });
  }

  private sendPromptHistoryToWebview(): void {
    const promptHistoryStore = this.sharedContext.promptHistoryStore;
    if (!promptHistoryStore) {
      return;
    }

    const history = promptHistoryStore.getAll();
    const stats = promptHistoryStore.getDailyStats();

    this.send('promptHistoryLoaded', {
      history,
      analyzedToday: stats.analyzedToday,
      avgScore: stats.avgScore,
    });
  }
}
