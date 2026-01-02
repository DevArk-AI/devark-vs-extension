/**
 * Provider Detection Service
 *
 * Centralized service for detecting and checking LLM provider status.
 * Handles CLI availability checks, connection testing, and status caching.
 *
 * Extracted from V2MessageHandler to promote reusability and testability.
 */

import { LLMManager } from '../llm/llm-manager';
import { isCommandAvailable } from '../llm/command-utils';
import { isCursorIDE } from '../extension-state';
import type { ProviderMetadata } from '../llm/provider-registry';

/**
 * Provider status information
 */
export interface ProviderStatus {
  id: string;
  name: string;
  type: 'cli' | 'local' | 'cloud';
  status: 'connected' | 'available' | 'not-detected' | 'not-running' | 'not-configured';
  model?: string;
  availableModels?: string[];
  description?: string;
  requiresApiKey?: boolean;
}

/**
 * Cache entry for provider detection results
 */
interface CacheEntry {
  providers: ProviderStatus[];
  timestamp: number;
}

/**
 * Service for detecting LLM provider status
 *
 * Features:
 * - Detects all available providers
 * - Checks CLI availability
 * - Tests provider connections
 * - 30-second caching to avoid repeated CLI calls
 */
export class ProviderDetectionService {
  private cache: CacheEntry | null = null;
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds

  /**
   * Create a new provider detection service
   * @param llmManager - LLM Manager instance to use for detection
   */
  constructor(private llmManager: LLMManager) {}

  /**
   * Detect all available providers with their current status
   *
   * Results are cached for 30 seconds to avoid repeated CLI calls.
   * Use clearCache() to force a fresh detection.
   *
   * @returns Promise resolving to array of provider status information
   */
  public async detectAll(): Promise<ProviderStatus[]> {
    // Check cache first
    if (this.cache && this.isCacheValid()) {
      return this.cache.providers;
    }

    const providers = this.llmManager.getAvailableProviders();

    // Build providers list with async status checks
    const formattedProviders = await Promise.all(
      providers.map(async (p) => {
        const status = await this.getProviderStatus(p);
        let model: string | undefined;
        let availableModels: string[] | undefined;

        // For Ollama, fetch actual available models if connected
        if (p.id === 'ollama') {
          const provider = this.llmManager.getProvider(p.id);
          if (provider && status === 'connected') {
            try {
              const models = await provider.listModels();
              availableModels = models.map((m) => m.id);
              // Use the configured model or the first available model
              const configuredModel = provider.model;
              model = availableModels.includes(configuredModel)
                ? configuredModel
                : availableModels[0];
            } catch (error) {
              console.error(
                '[ProviderDetectionService] Failed to fetch Ollama models:',
                error
              );
              // Keep model undefined if we can't fetch models
            }
          }
        }

        // For OpenRouter, get the configured model from provider
        if (p.id === 'openrouter') {
          const provider = this.llmManager.getProvider(p.id);
          if (provider) {
            model = provider.model;  // No fallback - use whatever provider has
          }
        }

        return {
          id: p.id,
          name: p.displayName,
          type: this.getProviderType(p.id),
          status,
          description: this.getProviderDescription(p.id),
          model,
          availableModels,
          requiresApiKey: ['openrouter'].includes(p.id),
        };
      })
    );

    // Sort providers based on platform:
    // - Cursor IDE: cursor-cli first
    // - VS Code: claude-agent-sdk first
    const providerOrder = isCursorIDE()
      ? ['cursor-cli', 'claude-agent-sdk', 'ollama', 'openrouter']
      : ['claude-agent-sdk', 'cursor-cli', 'ollama', 'openrouter'];
    const sortedProviders = formattedProviders.sort((a, b) => {
      const aIndex = providerOrder.indexOf(a.id);
      const bIndex = providerOrder.indexOf(b.id);
      // If provider not in order list, put it at the end
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    // Update cache
    this.cache = {
      providers: sortedProviders,
      timestamp: Date.now(),
    };

    return sortedProviders;
  }

  /**
   * Detect status of a specific provider
   *
   * This does NOT use the cache - it always performs a fresh check.
   * Use this when you need the most up-to-date status for a single provider.
   *
   * @param providerId - ID of the provider to detect
   * @returns Promise resolving to provider status
   */
  public async detectOne(providerId: string): Promise<ProviderStatus> {
    const providers = this.llmManager.getAvailableProviders();
    const providerMeta = providers.find((p) => p.id === providerId);

    if (!providerMeta) {
      throw new Error(`Provider '${providerId}' not found in registry`);
    }

    const status = await this.getProviderStatus(providerMeta);
    let model: string | undefined;
    let availableModels: string[] | undefined;

    // For Ollama, fetch actual available models if connected
    if (providerId === 'ollama') {
      const provider = this.llmManager.getProvider(providerId);
      if (provider && status === 'connected') {
        try {
          const models = await provider.listModels();
          availableModels = models.map((m) => m.id);
          const configuredModel = provider.model;
          model = availableModels.includes(configuredModel)
            ? configuredModel
            : availableModels[0];
        } catch (error) {
          console.error(
            '[ProviderDetectionService] Failed to fetch Ollama models:',
            error
          );
        }
      }
    }

    // For OpenRouter, get the configured model from provider
    if (providerId === 'openrouter') {
      const provider = this.llmManager.getProvider(providerId);
      if (provider) {
        model = provider.model;  // No fallback - use whatever provider has
      }
    }

    return {
      id: providerMeta.id,
      name: providerMeta.displayName,
      type: this.getProviderType(providerMeta.id),
      status,
      description: this.getProviderDescription(providerMeta.id),
      model,
      availableModels,
      requiresApiKey: ['openrouter'].includes(providerMeta.id),
    };
  }

  /**
   * Get cached provider status if available
   *
   * @returns Cached providers or null if cache is empty/expired
   */
  public getCached(): ProviderStatus[] | null {
    if (this.cache && this.isCacheValid()) {
      return this.cache.providers;
    }
    return null;
  }

  /**
   * Clear the detection cache
   *
   * Forces the next detectAll() call to perform fresh detection.
   */
  public clearCache(): void {
    this.cache = null;
  }

  /**
   * Get the ID of the currently active provider
   *
   * @returns Active provider ID or null if no provider is active
   */
  public getActiveProviderId(): string | null {
    const activeProvider = this.llmManager.getActiveProviderInfo();
    return activeProvider?.type || null;
  }

  /**
   * Check if the cache is still valid
   */
  private isCacheValid(): boolean {
    if (!this.cache) {
      return false;
    }
    const age = Date.now() - this.cache.timestamp;
    return age < this.CACHE_TTL_MS;
  }

  /**
   * Get the type of a provider based on its ID
   */
  private getProviderType(providerId: string): 'cli' | 'local' | 'cloud' {
    if (['cursor-cli', 'ollama', 'claude-agent-sdk'].includes(providerId)) return 'local';
    return 'cloud';
  }

  /**
   * Get the status of a provider
   *
   * Checks:
   * - Whether the provider is the active one
   * - For CLI providers: whether the CLI is installed and accessible
   * - For Ollama: whether the server is running
   * - For API providers: whether they need configuration
   */
  private async getProviderStatus(
    provider: ProviderMetadata
  ): Promise<'connected' | 'available' | 'not-detected' | 'not-running' | 'not-configured'> {
    const activeProvider = this.llmManager.getActiveProviderInfo();

    // If this provider is active and initialized successfully, it's connected
    // activeProvider.type contains the provider ID (e.g., 'cursor-cli', 'claude-agent-sdk')
    // provider.id is the ID from ProviderMetadata
    if (activeProvider && activeProvider.type === provider.id) {
      // For Ollama, still verify it's actually running even if it's the active provider
      if (provider.id === 'ollama') {
        const providerInstance = this.llmManager.getProvider(provider.id);
        if (providerInstance) {
          const isAvailable = await providerInstance.isAvailable();
          if (!isAvailable) {
            return 'not-running';
          }
        }
      }
      return 'connected';
    }

    // For Claude Agent SDK, check if npm package is installed
    if (provider.id === 'claude-agent-sdk') {
      const isInitialized = this.llmManager.hasProvider(provider.id);

      if (!isInitialized) {
        // Check if SDK package is installed
        const sdkInstalled = this.isSDKPackageInstalled();
        if (!sdkInstalled) {
          return 'not-detected'; // SDK npm package not installed
        }
        return 'available'; // SDK is installed and ready to enable
      }
    }

    // For Cursor CLI, test if the command is actually available
    if (provider.id === 'cursor-cli') {
      const isInitialized = this.llmManager.hasProvider(provider.id);

      if (!isInitialized) {
        const commandExists = await isCommandAvailable('cursor-agent');
        if (!commandExists) {
          return 'not-detected'; // CLI is not installed or not in PATH
        }
        return 'available'; // CLI is installed and ready to enable
      }
    }

    // For Ollama, check if server is running
    if (provider.id === 'ollama') {
      const providerInstance = this.llmManager.getProvider(provider.id);
      console.log('[ProviderDetectionService] Ollama check - providerInstance exists:', !!providerInstance);

      if (providerInstance) {
        const isAvailable = await providerInstance.isAvailable();
        console.log('[ProviderDetectionService] Ollama isAvailable:', isAvailable);
        if (!isAvailable) {
          return 'not-running'; // Ollama server is not running
        }
        return 'connected'; // Ollama is running and accessible
      }

      // Provider not initialized - still check if Ollama server is running directly
      console.log('[ProviderDetectionService] Ollama provider not initialized, checking directly...');
      const isRunning = await this.checkOllamaServerDirectly();
      console.log('[ProviderDetectionService] Ollama direct check result:', isRunning);
      return isRunning ? 'available' : 'not-running';
    }

    // For other providers (API-based), check if they need configuration
    if (provider.requiresAuth) {
      return 'not-configured';
    }

    // Default: available but not active
    return 'available';
  }

  /**
   * Check if Claude Agent SDK npm package is installed
   */
  private isSDKPackageInstalled(): boolean {
    try {
      require.resolve('@anthropic-ai/claude-agent-sdk');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a human-readable description of a provider
   */
  private getProviderDescription(providerId: string): string {
    const descriptions: Record<string, string> = {
      'cursor-cli': 'Your Cursor subscription',
      'claude-agent-sdk': 'Your Claude subscription',
      ollama: 'Free, local, private',
      openrouter: 'Needs API key',
    };
    return descriptions[providerId] || 'LLM provider';
  }

  /**
   * Check if Ollama server is running by making a direct HTTP request.
   * Used when the Ollama provider isn't initialized yet.
   */
  private async checkOllamaServerDirectly(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:11434/api/version', {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
