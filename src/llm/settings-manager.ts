/**
 * Settings Manager
 *
 * Manages LLM provider configuration using UnifiedSettingsService.
 * Provides LLM-specific business logic (validation, defaults, provider configs).
 *
 * Architecture:
 * - Uses UnifiedSettingsService.getRaw/setRaw for vscode access
 * - UnifiedSettingsService is the sole gateway to vscode.workspace
 * - This class provides LLM-specific abstractions on top
 */

import type { IUnifiedSettingsService } from '../services/UnifiedSettingsService';
import {
  LLMProviderType,
  LLMProviderConfig,
  OllamaConfig,
  OpenRouterConfig,
  ConfigValidationResult,
  FeatureType,
  FeatureModelConfig,
} from './types';

/**
 * Disposable interface for cleanup
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Default configuration values
 */
const DEFAULTS = {
  activeProvider: 'ollama' as LLMProviderType,
  ollama: {
    endpoint: 'http://localhost:11434',
  },
  openrouter: {
    apiKey: '',
  },
};

/**
 * Interface for settings management.
 *
 * Abstracts configuration access for easier testing and portability.
 */
export interface ISettingsManager {
  getProvider(): LLMProviderType;
  getOllamaConfig(): OllamaConfig;
  getOpenRouterConfig(): OpenRouterConfig;
  getConfig(): LLMProviderConfig;
  setProvider(provider: LLMProviderType): Promise<void>;
  validateConfig(): ConfigValidationResult;
  onConfigChange(callback: (config: LLMProviderConfig) => void): Disposable;
  hasCustomValue(settingKey: string): boolean;
  resetSetting(settingKey: string): Promise<void>;
  resetAll(): Promise<void>;
}

/**
 * Settings manager for LLM configuration.
 *
 * Uses UnifiedSettingsService for all vscode config access.
 */
export class SettingsManager implements ISettingsManager {
  private readonly configSection = 'devark.llm';

  /**
   * Creates a new settings manager.
   *
   * @param settingsService - UnifiedSettingsService instance
   */
  constructor(private settingsService: IUnifiedSettingsService) {}

  /**
   * Get the active provider type
   */
  public getProvider(): LLMProviderType {
    return this.settingsService.getRaw<LLMProviderType>(this.configSection, 'activeProvider', DEFAULTS.activeProvider);
  }

  /**
   * Get Ollama configuration
   */
  public getOllamaConfig(): OllamaConfig {
    const providers = this.settingsService.getRaw<Record<string, any>>(this.configSection, 'providers', {});
    const ollamaConfig = providers.ollama || {};

    return {
      enabled: true,
      endpoint: ollamaConfig.endpoint || DEFAULTS.ollama.endpoint,
      model: ollamaConfig.model,
    };
  }

  /**
   * Get OpenRouter configuration
   *
   * Note: API key is stored in SecureConfigStore, not in settings.json.
   * The ProviderRegistry injects the API key when creating the provider.
   */
  public getOpenRouterConfig(): OpenRouterConfig {
    const providers = this.settingsService.getRaw<Record<string, any>>(this.configSection, 'providers', {});
    const openrouterConfig = providers.openrouter || {};

    const model = openrouterConfig.model;
    const siteUrl = openrouterConfig.siteUrl || '';
    const siteName = openrouterConfig.siteName || '';

    return {
      enabled: openrouterConfig.enabled ?? true,
      apiKey: '', // API key is injected from SecureConfigStore by ProviderRegistry
      model,
      ...(siteUrl && { siteUrl }),
      ...(siteName && { siteName }),
    };
  }

  /**
   * Get Claude Agent SDK configuration
   */
  public getClaudeAgentSdkConfig(): { enabled: boolean; model?: string } {
    const providers = this.settingsService.getRaw<Record<string, any>>(this.configSection, 'providers', {});
    const config = providers['claude-agent-sdk'] || {};
    return {
      enabled: config.enabled || false,
      model: config.model || 'haiku',
    };
  }

  /**
   * Get Cursor CLI configuration
   */
  public getCursorCliConfig(): { enabled: boolean } {
    const providers = this.settingsService.getRaw<Record<string, any>>(this.configSection, 'providers', {});
    const config = providers['cursor-cli'] || {};
    return { enabled: config.enabled || false };
  }

  /**
   * Get complete LLM provider configuration
   *
   * Returns legacy format for backward compatibility.
   * The LLMManager will handle conversion to new format internally.
   */
  public getConfig(): any {
    // Return legacy format for backward compatibility
    return {
      provider: this.getProvider(),
      ollama: this.getOllamaConfig(),
      openrouter: this.getOpenRouterConfig(),
      'cursor-cli': this.getCursorCliConfig(),
      'claude-agent-sdk': this.getClaudeAgentSdkConfig(),
    };
  }

  /**
   * Set the active provider
   */
  public async setProvider(provider: LLMProviderType): Promise<void> {
    await this.settingsService.setRaw(this.configSection, 'activeProvider', provider);
  }

  /**
   * Set Ollama endpoint
   */
  public async setOllamaEndpoint(endpoint: string): Promise<void> {
    const providers = this.settingsService.getRaw<Record<string, any>>(this.configSection, 'providers', {});
    providers.ollama = { ...providers.ollama, endpoint };
    await this.settingsService.setRaw(this.configSection, 'providers', providers);
  }

  /**
   * Set Ollama model
   */
  public async setOllamaModel(model: string): Promise<void> {
    const providers = this.settingsService.getRaw<Record<string, any>>(this.configSection, 'providers', {});
    providers.ollama = { ...providers.ollama, model };
    await this.settingsService.setRaw(this.configSection, 'providers', providers);
  }

  /**
   * Set OpenRouter model
   */
  public async setOpenRouterModel(model: string): Promise<void> {
    const providers = this.settingsService.getRaw<Record<string, any>>(this.configSection, 'providers', {});
    providers.openrouter = { ...providers.openrouter, model };
    await this.settingsService.setRaw(this.configSection, 'providers', providers);
  }

  /**
   * Validate current configuration
   */
  public validateConfig(): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const provider = this.getProvider();

    // Validate provider selection - allow all supported providers
    const validProviders = ['ollama', 'openrouter', 'cursor-cli', 'claude-agent-sdk'];
    if (!validProviders.includes(provider)) {
      errors.push(`Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}.`);
    }

    // Validate Ollama configuration
    if (provider === 'ollama') {
      const ollamaConfig = this.getOllamaConfig();

      if (!ollamaConfig.endpoint) {
        errors.push('Ollama endpoint is required');
      } else {
        // Validate endpoint format
        try {
          const url = new URL(ollamaConfig.endpoint);
          if (!['http:', 'https:'].includes(url.protocol)) {
            errors.push('Ollama endpoint must use http:// or https://');
          }
        } catch {
          errors.push('Ollama endpoint must be a valid URL');
        }
      }

      // Model is optional - OllamaProvider auto-detects from installed models
    }

    // Validate OpenRouter configuration
    // Note: API key is validated by ProviderRegistry when creating the provider
    if (provider === 'openrouter') {
      const openrouterConfig = this.getOpenRouterConfig();

      if (!openrouterConfig.model) {
        errors.push('OpenRouter model is required');
      }
    }

    // Check for unused provider configurations
    if (provider === 'openrouter') {
      const ollamaConfig = this.getOllamaConfig();
      if (ollamaConfig.endpoint !== DEFAULTS.ollama.endpoint) {
        warnings.push('Ollama endpoint is configured but OpenRouter is selected as provider');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Register a callback for configuration changes
   */
  public onConfigChange(
    callback: (config: LLMProviderConfig) => void
  ): Disposable {
    return this.settingsService.onRawChange(this.configSection, () => {
      callback(this.getConfig());
    });
  }

  /**
   * Check if a specific setting has a custom value (not default)
   *
   * Compares current value against defaults to determine if user has customized it.
   */
  public hasCustomValue(settingKey: string): boolean {
    const currentValue = this.settingsService.getRaw(this.configSection, settingKey, undefined);

    // If value is undefined, it's not set
    if (currentValue === undefined) {
      return false;
    }

    // Check against defaults
    const defaultValue = this.getDefaultValue(settingKey);
    return currentValue !== defaultValue;
  }

  /**
   * Get the default value for a setting key
   */
  private getDefaultValue(settingKey: string): unknown {
    const parts = settingKey.split('.');

    if (parts.length === 1) {
      return (DEFAULTS as any)[parts[0]];
    } else if (parts.length === 2) {
      const [provider, field] = parts;
      return (DEFAULTS as any)[provider]?.[field];
    }

    return undefined;
  }

  /**
   * Reset a setting to its default value
   */
  public async resetSetting(settingKey: string): Promise<void> {
    const defaultValue = this.getDefaultValue(settingKey);
    await this.settingsService.setRaw(this.configSection, settingKey, defaultValue);
  }

  /**
   * Reset all LLM settings to defaults
   */
  public async resetAll(): Promise<void> {
    await this.settingsService.setRaw(this.configSection, 'activeProvider', DEFAULTS.activeProvider);
    await this.settingsService.setRaw(this.configSection, 'providers', {
      ollama: {
        endpoint: DEFAULTS.ollama.endpoint,
      },
      openrouter: {},
    });
  }

  /**
   * Get a summary of current configuration for display
   */
  public getConfigSummary(): string {
    const provider = this.getProvider();
    const validation = this.validateConfig();

    let summary = `Active Provider: ${provider}\n\n`;

    if (provider === 'ollama') {
      const config = this.getOllamaConfig();
      summary += `Ollama Configuration:\n`;
      summary += `  Endpoint: ${config.endpoint}\n`;
      summary += `  Model: ${config.model}\n`;
    } else {
      const config = this.getOpenRouterConfig();
      summary += `OpenRouter Configuration:\n`;
      summary += `  API Key: (stored securely)\n`;
      summary += `  Model: ${config.model}\n`;
      if (config.siteUrl) {
        summary += `  Site URL: ${config.siteUrl}\n`;
      }
      if (config.siteName) {
        summary += `  Site Name: ${config.siteName}\n`;
      }
    }

    summary += `\nValidation Status: ${validation.valid ? '✓ Valid' : '✗ Invalid'}\n`;

    if (validation.errors.length > 0) {
      summary += `\nErrors:\n`;
      validation.errors.forEach((error) => {
        summary += `  • ${error}\n`;
      });
    }

    if (validation.warnings && validation.warnings.length > 0) {
      summary += `\nWarnings:\n`;
      validation.warnings.forEach((warning) => {
        summary += `  • ${warning}\n`;
      });
    }

    return summary;
  }

  // ========================================
  // FEATURE-SPECIFIC MODEL CONFIGURATION
  // ========================================

  /**
   * Check if advanced feature models are enabled
   */
  public isFeatureModelsEnabled(): boolean {
    return this.settingsService.getRaw<boolean>(this.configSection, 'featureModels.enabled', false);
  }

  /**
   * Get model override for a specific feature
   * @returns model string (format: provider:model) or null if using default
   */
  public getFeatureModel(feature: FeatureType): string | null {
    if (!this.isFeatureModelsEnabled()) {
      return null;
    }

    const key = feature === 'scoring' ? 'promptScoring'
              : feature === 'improvement' ? 'promptImprovement'
              : feature;

    const model = this.settingsService.getRaw<string>(this.configSection, `featureModels.${key}`, '');
    return model || null;
  }

  /**
   * Set model override for a specific feature
   * @param feature - The feature to configure
   * @param model - Model string (format: provider:model) or empty string to clear
   */
  public async setFeatureModel(feature: FeatureType, model: string): Promise<void> {
    const key = feature === 'scoring' ? 'promptScoring'
              : feature === 'improvement' ? 'promptImprovement'
              : feature;

    await this.settingsService.setRaw(this.configSection, `featureModels.${key}`, model);
  }

  /**
   * Enable or disable advanced feature models
   */
  public async setFeatureModelsEnabled(enabled: boolean): Promise<void> {
    await this.settingsService.setRaw(this.configSection, 'featureModels.enabled', enabled);
  }

  /**
   * Get complete feature models configuration
   */
  public getFeatureModelsConfig(): FeatureModelConfig {
    return {
      enabled: this.settingsService.getRaw<boolean>(this.configSection, 'featureModels.enabled', false),
      summaries: this.settingsService.getRaw<string>(this.configSection, 'featureModels.summaries', ''),
      promptScoring: this.settingsService.getRaw<string>(this.configSection, 'featureModels.promptScoring', ''),
      promptImprovement: this.settingsService.getRaw<string>(this.configSection, 'featureModels.promptImprovement', ''),
    };
  }

  /**
   * Reset all feature models to defaults (use global provider)
   */
  public async resetFeatureModels(): Promise<void> {
    await this.settingsService.setRaw(this.configSection, 'featureModels.enabled', false);
    await this.settingsService.setRaw(this.configSection, 'featureModels.summaries', '');
    await this.settingsService.setRaw(this.configSection, 'featureModels.promptScoring', '');
    await this.settingsService.setRaw(this.configSection, 'featureModels.promptImprovement', '');
  }
}
