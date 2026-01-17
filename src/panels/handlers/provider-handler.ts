/**
 * ProviderHandler - Handles LLM provider management messages
 *
 * Responsibilities:
 * - List available providers
 * - Detect provider availability
 * - Switch active provider
 * - Verify API keys
 * - Configure provider-specific models
 */

import { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
import { SharedContext } from './shared-context';
import { ExtensionState } from '../../extension-state';
import { SummaryService } from '../../services/SummaryService';
import type { WebviewMessageData } from '../../shared/webview-protocol';
import type { IUnifiedSettingsService } from '../../services/UnifiedSettingsService';
import type { ProvidersConfigMap } from '../../services/settings-types';
import { AnalyticsEvents } from '../../services/analytics-events';
import { getNotificationService } from '../../services/NotificationService';

export class ProviderHandler extends BaseMessageHandler {
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
      'getProviders',
      'detectProviders',
      'detectProvider',
      'switchProvider',
      'verifyApiKey',
      'setOllamaModel',
      'setOpenRouterModel',
      'testProviders',
      'trackLlmSelectorOpenedFooter',
      'trackLlmSelectorOpenedSettings',
    ];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    switch (type) {
      case 'getProviders':
        await this.handleGetProviders();
        return true;
      case 'detectProviders':
        await this.handleDetectProviders();
        return true;
      case 'detectProvider': {
        const d = data as WebviewMessageData<'detectProvider'>;
        await this.handleDetectProvider(d.providerId);
        return true;
      }
      case 'switchProvider': {
        const d = data as WebviewMessageData<'switchProvider'>;
        await this.handleSwitchProvider(d.providerId, d.model);
        return true;
      }
      case 'verifyApiKey': {
        const d = data as WebviewMessageData<'verifyApiKey'>;
        await this.handleVerifyApiKey(d.providerId, d.apiKey, d.model);
        return true;
      }
      case 'setOllamaModel': {
        const d = data as WebviewMessageData<'setOllamaModel'>;
        await this.handleSetOllamaModel(d.model);
        return true;
      }
      case 'setOpenRouterModel': {
        const d = data as WebviewMessageData<'setOpenRouterModel'>;
        await this.handleSetOpenRouterModel(d.model);
        return true;
      }
      case 'testProviders':
        await this.handleTestProviders();
        return true;
      case 'trackLlmSelectorOpenedFooter':
        ExtensionState.getAnalyticsService().track(AnalyticsEvents.LLM_SELECTOR_OPENED_FOOTER);
        return true;
      case 'trackLlmSelectorOpenedSettings':
        ExtensionState.getAnalyticsService().track(AnalyticsEvents.LLM_SELECTOR_OPENED_SETTINGS);
        return true;
      default:
        return false;
    }
  }

  private async handleGetProviders(): Promise<void> {
    const providerDetectionService = this.sharedContext.providerDetectionService;
    if (!providerDetectionService) {
      this.send('providersUpdate', { providers: [], active: null });
      return;
    }

    // Always clear cache to ensure fresh detection when dialog opens
    providerDetectionService.clearCache();
    console.log('[ProviderHandler] Cache cleared, doing fresh provider detection');

    const providers = await providerDetectionService.detectAll();
    const active = providerDetectionService.getActiveProviderId();

    this.send('providersUpdate', {
      providers,
      active,
    });
  }

  private async handleDetectProviders(): Promise<void> {
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager) return;

    // Re-initialize to detect providers
    await llmManager.reinitialize();

    // Clear cache to force fresh detection
    const providerDetectionService = this.sharedContext.providerDetectionService;
    if (providerDetectionService) {
      providerDetectionService.clearCache();
    }

    await this.handleGetProviders();
  }

  private async handleDetectProvider(providerId: string): Promise<void> {
    console.log('[ProviderHandler] handleDetectProvider called for:', providerId);
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager) {
      console.log('[ProviderHandler] No LLM Manager available');
      return;
    }

    // Test specific provider
    console.log('[ProviderHandler] Testing all providers...');
    const results = await llmManager.testAllProviders();
    const result = results[providerId];
    console.log('[ProviderHandler] Test result for', providerId, ':', result);

    if (result?.success) {
      getNotificationService().info(`${providerId} is now connected!`);
    } else {
      getNotificationService().warn(`${providerId} detection: ${result?.error || 'Not available'}`);
    }

    await this.handleGetProviders();
  }

  private async handleSwitchProvider(providerId: string, model?: string): Promise<void> {
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager) return;

    // Get previous provider BEFORE making changes
    const previousProvider = this.settingsService.getWithDefault('llm.activeProvider', 'none');

    try {
      // Get current providers configuration
      const currentProviders = this.settingsService.getWithDefault('llm.providers', {} as ProvidersConfigMap);

      // Disable ALL providers first to ensure mutual exclusivity
      const allProviderIds = ['ollama', 'openrouter', 'cursor-cli', 'claude-agent-sdk'];
      for (const id of allProviderIds) {
        if (!currentProviders[id]) {
          currentProviders[id] = {};
        }
        currentProviders[id].enabled = false;
      }

      // Enable ONLY the target provider
      if (!currentProviders[providerId]) {
        currentProviders[providerId] = {};
      }
      currentProviders[providerId].enabled = true;

      // If model is provided, set it (for OpenRouter, etc.)
      if (model) {
        currentProviders[providerId].model = model;
      }

      // Update the entire providers object
      await this.settingsService.set('llm.providers', currentProviders);

      // Set as active provider
      await this.settingsService.set('llm.activeProvider', providerId);

      // Reinitialize LLM Manager to load the newly enabled provider
      await llmManager.reinitialize();

      // Recreate SummaryService with updated LLM Manager
      this.sharedContext.summaryService = new SummaryService(llmManager);
      console.log('[ProviderHandler] SummaryService recreated with new provider:', providerId);

      // Update status bar
      this.sharedContext.statusBarManager?.updateProvider(providerId, true);

      // Clear cache to force fresh detection
      const providerDetectionService = this.sharedContext.providerDetectionService;
      if (providerDetectionService) {
        providerDetectionService.clearCache();
      }

      await this.handleGetProviders();

      // Track provider selection
      ExtensionState.getAnalyticsService().track(AnalyticsEvents.PROVIDER_SELECTED, {
        provider: providerId,
        previous_provider: previousProvider,
      });

      getNotificationService().info(`Switched to ${providerId} provider`);
    } catch (error) {
      console.error('[ProviderHandler] Failed to switch provider:', error);
      getNotificationService().error(
        `Failed to switch to ${providerId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleVerifyApiKey(providerId: string, apiKey: string, model?: string): Promise<void> {
    if (!apiKey) {
      this.send('verifyApiKeyResult', {
        providerId,
        success: false,
        error: 'API key is required',
      });
      return;
    }

    try {
      if (providerId === 'openrouter') {
        // Model is required for OpenRouter verification
        if (!model) {
          this.send('verifyApiKeyResult', {
            providerId,
            success: false,
            error: 'Model is required for OpenRouter verification',
          });
          return;
        }

        // Dynamically import to avoid circular dependencies
        const { OpenRouterProvider } = await import('../../llm/providers/openrouter-provider');

        // Create a temporary provider instance to test the API key with user's model
        const testProvider = new OpenRouterProvider({
          enabled: true,
          apiKey,
          model,
        });

        const result = await testProvider.testConnection();

        if (result.success) {
          // Save the API key to secure storage (NOT settings.json)
          const secureStore = ExtensionState.getSecureConfigStore();
          await secureStore.setApiKey(providerId, apiKey);

          // Save only the model to settings.json (NOT the apiKey)
          const currentProviders = this.settingsService.getWithDefault('llm.providers', {} as ProvidersConfigMap);
          if (!currentProviders.openrouter) {
            currentProviders.openrouter = {};
          }
          currentProviders.openrouter.model = model;
          await this.settingsService.set('llm.providers', currentProviders);

          getNotificationService().info('OpenRouter API key verified and saved securely!');

          this.send('verifyApiKeyResult', {
            providerId,
            success: true,
            message: 'API key verified successfully',
            details: result.details,
          });

          // Refresh providers list
          await this.handleGetProviders();
        } else {
          this.send('verifyApiKeyResult', {
            providerId,
            success: false,
            error: result.error || 'API key verification failed',
          });
        }
      } else {
        // Unsupported provider
        this.send('verifyApiKeyResult', {
          providerId,
          success: false,
          error: `API key verification not implemented for ${providerId}`,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ProviderHandler] Failed to verify API key:', error);

      this.send('verifyApiKeyResult', {
        providerId,
        success: false,
        error: errorMessage,
      });
    }
  }

  private async handleSetOllamaModel(model: string): Promise<void> {
    const currentProviders = this.settingsService.getWithDefault('llm.providers', {} as ProvidersConfigMap);

    // Update Ollama model
    if (!currentProviders.ollama) {
      currentProviders.ollama = {};
    }
    currentProviders.ollama.model = model;

    // Update the entire providers object
    await this.settingsService.set('llm.providers', currentProviders);

    // Track model selection
    ExtensionState.getAnalyticsService().track(AnalyticsEvents.MODEL_SELECTED, {
      provider: 'ollama',
      model,
    });

    // Refresh providers to show the updated model
    await this.handleGetProviders();
  }

  private async handleSetOpenRouterModel(model: string): Promise<void> {
    if (!model) return;

    const currentProviders = this.settingsService.getWithDefault('llm.providers', {} as ProvidersConfigMap);

    // Update OpenRouter model
    if (!currentProviders.openrouter) {
      currentProviders.openrouter = {};
    }
    currentProviders.openrouter.model = model;

    // Update the entire providers object
    await this.settingsService.set('llm.providers', currentProviders);

    // Track model selection
    ExtensionState.getAnalyticsService().track(AnalyticsEvents.MODEL_SELECTED, {
      provider: 'openrouter',
      model,
    });

    // Reinitialize LLM Manager to pick up the new model config
    const llmManager = ExtensionState.getLLMManager();
    if (llmManager) {
      await llmManager.reinitialize();
    }

    // Clear cache to force fresh detection with new model
    const providerDetectionService = this.sharedContext.providerDetectionService;
    if (providerDetectionService) {
      providerDetectionService.clearCache();
    }

    // Refresh providers to show the updated model
    await this.handleGetProviders();
  }

  private async handleTestProviders(): Promise<void> {
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager) {
      this.send('testProvidersResult', { results: {}, error: 'LLM Manager not available' });
      return;
    }

    try {
      const results = await llmManager.testAllProviders();

      // Track connection tests for each provider
      for (const [providerId, result] of Object.entries(results)) {
        ExtensionState.getAnalyticsService().track(AnalyticsEvents.LLM_CONNECTION_TESTED, {
          provider: providerId,
          success: result.success,
        });
      }

      this.send('testProvidersResult', { results });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.send('testProvidersResult', { results: {}, error: errorMessage });
    }
  }
}
