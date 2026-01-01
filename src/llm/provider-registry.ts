/**
 * Provider Registry
 *
 * Dynamic registry for LLM providers that enables extensibility through
 * registration pattern. Providers can self-register via decorators, eliminating
 * the need for hardcoded provider initialization.
 */

import { LLMProvider } from './types';
import type { SecureConfigStore } from './config/secure-config-store';

/**
 * Schema definition for provider configuration fields
 */
export interface ProviderConfigSchema {
  [key: string]: {
    /** Data type of the field */
    type: 'string' | 'number' | 'boolean';
    /** Whether this field is required */
    required: boolean;
    /** Default value if not provided */
    default?: any;
    /** Whether this field contains sensitive data (e.g., API keys) */
    secret?: boolean;
    /** Human-readable description of this field */
    description?: string;
  };
}

/**
 * Metadata describing a provider's capabilities and requirements
 */
export interface ProviderMetadata {
  /** Unique identifier for the provider (e.g., 'ollama', 'openrouter') */
  id: string;
  /** Display name shown in UI (e.g., 'Ollama', 'OpenRouter') */
  displayName: string;
  /** Brief description of the provider */
  description: string;
  /** Whether this provider requires authentication */
  requiresAuth: boolean;
  /** Whether this provider supports streaming completions */
  supportsStreaming: boolean;
  /** Whether this provider tracks and reports costs */
  supportsCostTracking: boolean;
  /** Configuration schema defining required/optional fields */
  configSchema: ProviderConfigSchema;
}

/**
 * Base interface for provider configuration
 */
export interface ProviderConfig {
  /** Model identifier to use */
  model: string;
  [key: string]: any;
}

/**
 * Factory function that creates a provider instance from configuration
 */
export type ProviderFactory<T extends ProviderConfig> = (config: T) => LLMProvider;

/**
 * Internal registration data for a provider
 */
interface ProviderRegistration {
  /** Provider metadata */
  metadata: ProviderMetadata;
  /** Factory function to create instances */
  factory: ProviderFactory<any>;
}

/**
 * Central registry for LLM providers
 *
 * Manages provider registration, instantiation, and metadata queries.
 * Providers register themselves via the @RegisterProvider decorator.
 */
export class ProviderRegistry {
  private providers: Map<string, ProviderRegistration> = new Map();
  private secureConfigStore: SecureConfigStore | null = null;

  /**
   * Set the secure config store for API key injection
   */
  public setSecureConfigStore(store: SecureConfigStore): void {
    this.secureConfigStore = store;
  }

  /**
   * Register a new provider with the registry
   *
   * @param metadata - Provider metadata describing capabilities
   * @param factory - Factory function to create provider instances
   * @throws Error if provider ID is already registered
   */
  public register<T extends ProviderConfig>(
    metadata: ProviderMetadata,
    factory: ProviderFactory<T>
  ): void {
    if (this.providers.has(metadata.id)) {
      throw new Error(
        `Provider '${metadata.id}' is already registered. ` +
        `Each provider must have a unique ID.`
      );
    }

    this.providers.set(metadata.id, { metadata, factory });
  }

  /**
   * Create a provider instance by ID
   *
   * @param id - Provider identifier (e.g., 'ollama', 'openrouter')
   * @param config - Configuration object for the provider
   * @returns Instantiated provider
   * @throws Error if provider ID is not registered
   */
  public async getProvider(id: string, config: ProviderConfig): Promise<LLMProvider> {
    const registration = this.providers.get(id);

    if (!registration) {
      const availableProviders = Array.from(this.providers.keys()).join(', ');
      throw new Error(
        `Unknown provider: '${id}'. ` +
        `Available providers: ${availableProviders || 'none'}`
      );
    }

    // Inject API key from secure storage for providers that require auth
    let finalConfig = config;
    if (registration.metadata.requiresAuth) {
      if (!this.secureConfigStore) {
        throw new Error(`Provider '${id}' requires auth but SecureConfigStore is not configured`);
      }
      const apiKey = await this.secureConfigStore.getApiKey(id);
      if (!apiKey) {
        throw new Error(`Provider '${id}' requires an API key. Please configure it in settings.`);
      }
      finalConfig = { ...config, apiKey };
    }

    try {
      return registration.factory(finalConfig);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to instantiate provider '${id}': ${errorMessage}`
      );
    }
  }

  /**
   * Get metadata for a specific provider
   *
   * @param id - Provider identifier
   * @returns Provider metadata or null if not found
   */
  public getMetadata(id: string): ProviderMetadata | null {
    const registration = this.providers.get(id);
    return registration ? registration.metadata : null;
  }

  /**
   * List all available providers
   *
   * @returns Array of provider metadata for all registered providers
   */
  public listAvailable(): ProviderMetadata[] {
    return Array.from(this.providers.values()).map(r => r.metadata);
  }

  /**
   * Check if a provider is registered
   *
   * @param id - Provider identifier
   * @returns true if provider is registered
   */
  public hasProvider(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * Get count of registered providers
   *
   * @returns Number of registered providers
   */
  public getProviderCount(): number {
    return this.providers.size;
  }

  /**
   * Validate provider configuration against schema
   *
   * @param id - Provider identifier
   * @param config - Configuration to validate
   * @returns Validation result with errors
   */
  public validateConfig(
    id: string,
    config: ProviderConfig
  ): { valid: boolean; errors: string[] } {
    const metadata = this.getMetadata(id);

    if (!metadata) {
      return {
        valid: false,
        errors: [`Unknown provider: '${id}'`],
      };
    }

    const errors: string[] = [];
    const schema = metadata.configSchema;

    // Check required fields
    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
      const value = config[fieldName];

      if (fieldSchema.required && (value === undefined || value === null || value === '')) {
        errors.push(`Required field '${fieldName}' is missing`);
        continue;
      }

      // Type validation (only if value is provided)
      if (value !== undefined && value !== null && value !== '') {
        const actualType = typeof value;
        if (actualType !== fieldSchema.type) {
          errors.push(
            `Field '${fieldName}' must be of type '${fieldSchema.type}', ` +
            `got '${actualType}'`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clear all registered providers (useful for testing)
   */
  public clear(): void {
    this.providers.clear();
  }
}
