/**
 * Provider Registration Decorators
 *
 * Provides decorators for automatic provider registration with the global registry.
 * Providers use @RegisterProvider to self-register at module load time.
 */

import {
  ProviderRegistry,
  ProviderMetadata,
  ProviderConfig,
} from './provider-registry';
import { LLMProvider } from './types';
import type { SecureConfigStore } from './config/secure-config-store';

/**
 * Global provider registry instance
 *
 * Shared across the entire application. Providers register themselves
 * with this instance using the @RegisterProvider decorator.
 */
export const defaultProviderRegistry = new ProviderRegistry();

/**
 * Class decorator for automatic provider registration
 *
 * Registers a provider class with the global registry at module load time.
 * The provider becomes available for instantiation via the registry.
 *
 * @example
 * ```typescript
 * @RegisterProvider({
 *   id: 'ollama',
 *   displayName: 'Ollama',
 *   description: 'Local LLM provider via Ollama',
 *   requiresAuth: false,
 *   supportsStreaming: true,
 *   supportsCostTracking: false,
 *   configSchema: {
 *     endpoint: { type: 'string', required: true, default: 'http://localhost:11434' },
 *     model: { type: 'string', required: true, default: 'codellama:7b' }
 *   }
 * })
 * export class OllamaProvider implements LLMProvider {
 *   // ... implementation
 * }
 * ```
 *
 * @param metadata - Provider metadata describing capabilities and configuration
 * @returns Class decorator function
 */
export function RegisterProvider(metadata: ProviderMetadata) {
  return function <T extends { new(config: any): LLMProvider }>(
    constructor: T
  ): T {
    // Register the provider with the global registry
    defaultProviderRegistry.register(
      metadata,
      (config: ProviderConfig) => new constructor(config)
    );

    // Return the original constructor (decorator doesn't modify the class)
    return constructor;
  };
}

/**
 * Get the global provider registry
 *
 * @returns The global registry instance
 */
export function getProviderRegistry(): ProviderRegistry {
  return defaultProviderRegistry;
}

/**
 * Reset the global provider registry (useful for testing)
 *
 * Clears all registered providers. Should only be used in test environments.
 */
export function resetProviderRegistry(): void {
  defaultProviderRegistry.clear();
}

/**
 * Configure secure storage for API keys on the global registry
 *
 * Must be called during extension activation, after services are created.
 * This enables the registry to inject API keys from SecretStorage.
 */
export function configureSecureStorage(store: SecureConfigStore): void {
  defaultProviderRegistry.setSecureConfigStore(store);
}
