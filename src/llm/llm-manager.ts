/**
 * LLM Manager
 *
 * Central manager for LLM providers. Handles provider initialization,
 * switching, and provides a unified interface for completions.
 *
 * Refactored to use dynamic provider registry instead of hardcoded providers.
 */

import {
  LLMProvider,
  LLMProviderType,
  CompletionOptions,
  CompletionResponse,
  StreamChunk,
  ModelInfo,
  ConnectionTestResult,
  FeatureType,
} from './types';
import { ProviderRegistry, ProviderMetadata } from './provider-registry';
import { SettingsManager } from './settings-manager';

// Import providers to trigger decorator registration
import './providers/ollama-provider';
import './providers/openrouter-provider';
import './providers/cursor-cli-provider';
import './providers/claude-agent-sdk-provider';

/**
 * Test results for all providers
 */
export interface ProviderTestResults {
  [providerId: string]: ConnectionTestResult;
}

/**
 * Manager for LLM providers
 *
 * Refactored to use ProviderRegistry for dynamic provider management.
 * No longer has hardcoded provider initialization logic.
 */
export class LLMManager {
  private settingsManager: SettingsManager;
  private providerRegistry: ProviderRegistry;
  private providers: Map<LLMProviderType, LLMProvider>;
  private activeProvider: LLMProvider | null = null;
  private initialized = false;

  /**
   * Create a new LLM Manager
   *
   * @param registry - Provider registry (defaults to global registry)
   * @param settingsManager - Settings manager (required)
   */
  constructor(
    registry: ProviderRegistry | undefined,
    settingsManager: SettingsManager
  ) {
    // Use provided registry or import the global one
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy loading to avoid circular deps
    this.providerRegistry = registry || require('./decorators').defaultProviderRegistry;
    this.settingsManager = settingsManager;
    this.providers = new Map();
  }

  /**
   * Initialize the LLM manager with current configuration
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const legacyConfig = this.settingsManager.getConfig();

    // Validate configuration
    const validation = this.settingsManager.validateConfig();
    if (!validation.valid) {
      const errorMessage = validation.errors.join('\n');
      throw new Error(
        `LLM configuration is invalid:\n${errorMessage}\n\n` +
        `Please configure the LLM settings in VSCode (File > Preferences > Settings > VibeLog > LLM).`
      );
    }

    // Initialize providers based on configuration
    await this.initializeProviders(legacyConfig);

    // Set active provider using legacy 'provider' field
    const activeProviderType = legacyConfig.provider;
    const provider = this.providers.get(activeProviderType);

    if (!provider) {
      throw new Error(
        `Failed to initialize ${activeProviderType} provider. ` +
        `Please check your configuration and ensure the provider is available.`
      );
    }

    this.activeProvider = provider;
    this.initialized = true;
  }

  /**
   * Initialize provider instances based on configuration
   *
   * Uses the provider registry to dynamically instantiate configured providers.
   * No hardcoded provider logic - all providers are discovered from the registry.
   *
   * Accepts legacy flat config format for backward compatibility.
   */
  private async initializeProviders(legacyConfig: any): Promise<void> {
    this.providers.clear();

    // Get list of available providers from registry
    const availableProviders = this.providerRegistry.listAvailable();

    if (availableProviders.length === 0) {
      throw new Error(
        'No LLM providers are registered. This is a system error - ' +
        'providers should self-register via decorators.'
      );
    }

    // Initialize each configured provider (using legacy config format)
    for (const providerMeta of availableProviders) {
      const providerId = providerMeta.id;
      const providerConfig = legacyConfig[providerId];

      // Skip if provider is not configured
      if (!providerConfig) {
        continue;
      }

      // Skip if provider is explicitly disabled
      if (providerConfig.enabled === false) {
        continue;
      }

      try {
        const provider = await this.providerRegistry.getProvider(providerId, providerConfig);
        this.providers.set(providerId, provider);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Skip providers that are missing API keys (user hasn't configured them yet)
        if (errorMessage.includes('requires an API key')) {
          continue;
        }
        throw new Error(
          `Failed to initialize ${providerMeta.displayName} provider: ${errorMessage}`
        );
      }
    }

    // Ensure at least one provider is initialized
    if (this.providers.size === 0) {
      const providerNames = availableProviders.map(p => p.displayName).join(', ');
      throw new Error(
        `No LLM providers are configured. Please configure at least one provider ` +
        `(${providerNames}) in VSCode settings.`
      );
    }
  }

  /**
   * Test connection to all configured providers
   */
  public async testAllProviders(): Promise<ProviderTestResults> {
    const results: ProviderTestResults = {};

    for (const [type, provider] of Array.from(this.providers.entries())) {
      try {
        const testResult = await provider.testConnection();
        results[type] = testResult;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results[type] = {
          success: false,
          error: `Test failed: ${errorMessage}`,
        };
      }
    }

    return results;
  }

  /**
   * Get the active provider instance
   */
  public getActiveProvider(): LLMProvider | null {
    return this.activeProvider;
  }

  /**
   * Get a specific provider by type
   */
  public getProvider(type: LLMProviderType): LLMProvider | null {
    return this.providers.get(type) || null;
  }

  // ========================================
  // FEATURE-SPECIFIC PROVIDER METHODS
  // ========================================

  /**
   * Get a provider configured for a specific feature
   *
   * Returns either:
   * - A provider configured with the feature-specific model override, OR
   * - Falls back to the global active provider if no override is set
   *
   * @param feature - The feature requesting a provider
   * @returns Provider instance or null if none available
   */
  public getProviderForFeature(feature: FeatureType): LLMProvider | null {
    const featureModel = this.settingsManager.getFeatureModel(feature);

    if (!featureModel) {
      // No override, use active provider
      return this.activeProvider;
    }

    // Parse the model string to determine provider
    // Format: "provider:model" (e.g., "ollama:codellama:7b", "openrouter:anthropic/claude-3.5-sonnet")
    const colonIndex = featureModel.indexOf(':');
    if (colonIndex === -1) {
      console.warn(`[LLMManager] Invalid feature model format '${featureModel}', expected 'provider:model'. Falling back to active provider.`);
      return this.activeProvider;
    }

    const providerId = featureModel.substring(0, colonIndex);

    // Get the provider instance
    const provider = this.providers.get(providerId);

    if (!provider) {
      console.warn(`[LLMManager] Feature model provider '${providerId}' not available, falling back to active provider`);
      return this.activeProvider;
    }

    return provider;
  }

  /**
   * Get the model string for a feature-specific configuration
   *
   * @param feature - The feature to get model for
   * @returns The model portion of the feature configuration, or null if using default
   */
  public getModelForFeature(feature: FeatureType): string | null {
    const featureModel = this.settingsManager.getFeatureModel(feature);

    if (!featureModel) {
      return null;
    }

    // Parse the model string: "provider:model"
    const colonIndex = featureModel.indexOf(':');
    if (colonIndex === -1) {
      return null;
    }

    return featureModel.substring(colonIndex + 1);
  }

  /**
   * Generate completion using feature-specific provider
   *
   * @param feature - The feature requesting completion
   * @param options - Completion options
   */
  public async generateCompletionForFeature(
    feature: FeatureType,
    options: CompletionOptions
  ): Promise<CompletionResponse> {
    const provider = this.getProviderForFeature(feature);

    if (!provider) {
      throw new Error('No provider available for feature: ' + feature);
    }

    // Get feature-specific model if configured
    const model = this.getModelForFeature(feature);
    if (model) {
      // Override model in options
      options = { ...options, model };
    }

    return provider.generateCompletion(options);
  }

  /**
   * Get the settings manager instance
   * Useful for accessing feature model configuration
   */
  public getSettingsManager(): SettingsManager {
    return this.settingsManager;
  }

  /**
   * Switch to a different provider
   */
  public async switchProvider(type: LLMProviderType): Promise<void> {
    const provider = this.providers.get(type);

    if (!provider) {
      throw new Error(
        `Provider '${type}' is not available. ` +
        `Please configure it in VSCode settings first.`
      );
    }

    // Test the provider before switching
    const available = await provider.isAvailable();
    if (!available) {
      throw new Error(
        `Provider '${type}' is not accessible. ` +
        `Please check your configuration and ensure the provider is running.`
      );
    }

    this.activeProvider = provider;

    // Update settings
    await this.settingsManager.setProvider(type);
  }

  /**
   * List models available from the active provider
   */
  public async listModels(): Promise<ModelInfo[]> {
    if (!this.activeProvider) {
      throw new Error('No active provider. Call initialize() first.');
    }

    return this.activeProvider.listModels();
  }

  /**
   * Generate a completion using the active provider
   */
  public async generateCompletion(
    options: CompletionOptions
  ): Promise<CompletionResponse> {
    if (!this.activeProvider) {
      throw new Error('No active provider. Call initialize() first.');
    }

    return this.activeProvider.generateCompletion(options);
  }

  /**
   * Stream a completion using the active provider
   */
  public async *streamCompletion(
    options: CompletionOptions
  ): AsyncGenerator<StreamChunk> {
    if (!this.activeProvider) {
      throw new Error('No active provider. Call initialize() first.');
    }

    yield* this.activeProvider.streamCompletion(options);
  }

  /**
   * Get information about the active provider
   */
  public getActiveProviderInfo(): {
    type: LLMProviderType;
    model: string;
    available: boolean;
  } | null {
    if (!this.activeProvider) {
      return null;
    }

    return {
      type: this.activeProvider.type,
      model: this.activeProvider.model,
      available: true, // Already checked during initialization
    };
  }

  /**
   * Reinitialize with updated configuration
   */
  public async reinitialize(): Promise<void> {
    this.initialized = false;
    this.activeProvider = null;
    this.providers.clear();
    await this.initialize();
  }

  /**
   * Check if manager is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get list of all configured provider types
   */
  public getConfiguredProviders(): LLMProviderType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a specific provider is configured
   */
  public hasProvider(type: LLMProviderType): boolean {
    return this.providers.has(type);
  }

  /**
   * Get list of available providers from the registry
   *
   * Returns metadata for all providers that have registered themselves,
   * regardless of whether they are configured.
   *
   * @returns Array of provider metadata
   */
  public getAvailableProviders(): ProviderMetadata[] {
    return this.providerRegistry.listAvailable();
  }

  /**
   * Get the provider registry instance
   *
   * Useful for advanced use cases where direct registry access is needed.
   *
   * @returns The provider registry
   */
  public getRegistry(): ProviderRegistry {
    return this.providerRegistry;
  }

  /**
   * Generate a summary of the current state
   */
  public getStatusSummary(): string {
    let summary = `LLM Manager Status:\n`;
    summary += `  Initialized: ${this.initialized ? 'Yes' : 'No'}\n`;

    const availableProviders = this.providerRegistry.listAvailable();
    summary += `  Registered Providers: ${availableProviders.map(p => p.id).join(', ') || 'None'}\n`;
    summary += `  Configured Providers: ${this.getConfiguredProviders().join(', ') || 'None'}\n`;

    if (this.activeProvider) {
      summary += `  Active Provider: ${this.activeProvider.type}\n`;
      summary += `  Active Model: ${this.activeProvider.model}\n`;
    } else {
      summary += `  Active Provider: None\n`;
    }

    return summary;
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.initialized = false;
    this.activeProvider = null;
    this.providers.clear();
  }
}

