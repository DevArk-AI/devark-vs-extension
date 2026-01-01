/**
 * LLM Provider Type Definitions
 *
 * This module defines the core interfaces and types for the LLM provider system.
 * It supports multiple providers (Ollama, OpenRouter) with a unified interface.
 */

/**
 * Supported LLM provider types
 *
 * Changed from union type to string to allow dynamic provider registration.
 * Providers are no longer hardcoded at compile time.
 */
export type LLMProviderType = string;

/**
 * Feature types for per-feature model configuration
 */
export type FeatureType = 'summaries' | 'scoring' | 'improvement';

/**
 * Configuration for feature-specific models
 */
export interface FeatureModelConfig {
  /** Whether feature-specific models are enabled */
  enabled: boolean;

  /** Model override for summaries (format: provider:model) */
  summaries: string;

  /** Model override for prompt scoring (format: provider:model) */
  promptScoring: string;

  /** Model override for prompt improvement (format: provider:model) */
  promptImprovement: string;
}

/**
 * Options for generating completions
 */
export interface CompletionOptions {
  /** The prompt/messages to send to the LLM */
  prompt: string;

  /** Optional system prompt for context */
  systemPrompt?: string;

  /** Temperature for randomness (0.0 - 1.0) */
  temperature?: number;

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Whether to stream the response */
  stream?: boolean;

  /** Stop sequences */
  stop?: string[];

  /** Optional model override (for feature-specific models) */
  model?: string;
}

/**
 * Response from a completion request
 */
export interface CompletionResponse {
  /** The generated text */
  text: string;

  /** Model that generated the response */
  model: string;

  /** Provider that handled the request */
  provider: LLMProviderType;

  /** Timestamp of completion */
  timestamp: Date;

  /** Usage statistics (if available) */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };

  /** Cost information (if available) */
  cost?: {
    amount: number;
    currency: string;
  };

  /** Error information (if request failed) */
  error?: string;
}

/**
 * A chunk from a streaming completion
 */
export interface StreamChunk {
  /** The text delta for this chunk */
  text: string;

  /** Whether this is the final chunk */
  isComplete: boolean;

  /** Model generating the stream */
  model: string;

  /** Provider handling the stream */
  provider: LLMProviderType;

  /** Usage stats (only present in final chunk) */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };

  /** Cost information (only present in final chunk) */
  cost?: {
    amount: number;
    currency: string;
  };

  /** Error information (if stream failed) */
  error?: string;
}

/**
 * Model information
 */
export interface ModelInfo {
  /** Model identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Model description */
  description?: string;

  /** Context window size */
  contextLength?: number;

  /** Whether model supports streaming */
  supportsStreaming?: boolean;
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  /** Whether connection was successful */
  success: boolean;

  /** Error message if connection failed */
  error?: string;

  /** Additional details about the connection */
  details?: {
    version?: string;
    modelsAvailable?: number;
    endpoint?: string;
  };
}

/**
 * Provider capabilities metadata
 *
 * Describes what features a provider supports. Used by the UI to enable/disable
 * features and by the registry system for provider discovery.
 */
export interface ProviderCapabilities {
  /** Whether the provider supports streaming completions */
  streaming: boolean;

  /** Whether the provider tracks and reports usage costs */
  costTracking: boolean;

  /** Whether the provider can list available models */
  modelListing: boolean;

  /** Whether the provider supports custom endpoint configuration */
  customEndpoints: boolean;

  /** Whether the provider requires authentication (API key, tokens, etc.) */
  requiresAuth: boolean;
}

/**
 * Base interface that all LLM providers must implement
 */
export interface LLMProvider {
  /**
   * Get the provider type
   */
  readonly type: LLMProviderType;

  /**
   * Get the currently configured model
   */
  readonly model: string;

  /**
   * Get the provider's capabilities
   *
   * Describes what features this provider supports. Used by the UI to
   * enable/disable features and by the system for capability checks.
   */
  readonly capabilities: ProviderCapabilities;

  /**
   * Check if the provider is available (installed/configured)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Test connection to the provider
   */
  testConnection(): Promise<ConnectionTestResult>;

  /**
   * List available models
   */
  listModels(): Promise<ModelInfo[]>;

  /**
   * Generate a completion (non-streaming)
   */
  generateCompletion(options: CompletionOptions): Promise<CompletionResponse>;

  /**
   * Stream a completion
   */
  streamCompletion(options: CompletionOptions): AsyncGenerator<StreamChunk>;
}

/**
 * Base configuration interface that all providers extend
 */
export interface BaseProviderConfig {
  /** Whether the provider is enabled */
  enabled: boolean;

  /** Model to use */
  model?: string;

  /** Temperature for completions (0.0 - 1.0) */
  temperature?: number;

  /** Maximum tokens for completions */
  maxTokens?: number;
}

/**
 * Configuration for Ollama provider
 */
export interface OllamaConfig extends BaseProviderConfig {
  /** Ollama API endpoint */
  endpoint: string;
}

/**
 * Configuration for OpenRouter provider
 */
export interface OpenRouterConfig extends BaseProviderConfig {
  /** OpenRouter API key */
  apiKey: string;

  /** Optional site URL for ranking */
  siteUrl?: string;

  /** Optional site name for ranking */
  siteName?: string;
}


/**
 * Configuration for Cursor CLI provider
 */
export interface CursorCLIConfig extends BaseProviderConfig {
  /** Path to Cursor CLI executable */
  cliPath: string;
}

/**
 * Configuration for AWS Bedrock provider
 */
export interface AWSBedrockConfig extends BaseProviderConfig {
  /** AWS region */
  region: string;

  /** AWS access key ID */
  accessKeyId: string;

  /** AWS secret access key */
  secretAccessKey: string;

  /** Model ID in Bedrock */
  modelId: string;
}

/**
 * Configuration for Claude Agent SDK provider
 * No API key needed - uses local Claude Code authentication
 */
export interface ClaudeAgentSDKConfig extends BaseProviderConfig {
  // No additional fields - uses local Claude Code login
}

/**
 * Union type for all provider configurations (for type safety)
 */
export type ProviderConfig =
  | OllamaConfig
  | OpenRouterConfig
  | CursorCLIConfig
  | AWSBedrockConfig
  | ClaudeAgentSDKConfig;

/**
 * Unified configuration for the LLM system
 *
 * BEFORE: Separate field per provider (inflexible)
 * AFTER: Generic provider map (extensible)
 */
export interface LLMProviderConfig {
  /** Currently active provider ID */
  activeProvider: string;

  /** Configuration for all providers */
  providers: {
    [providerId: string]: ProviderConfig;
  };
}

/**
 * Legacy configuration interface (for backward compatibility during migration)
 * @deprecated Use LLMProviderConfig instead
 */
export interface LegacyLLMProviderConfig {
  /** Active provider type */
  provider: LLMProviderType;

  /** Ollama configuration */
  ollama?: OllamaConfig;

  /** OpenRouter configuration */
  openrouter?: OpenRouterConfig;
}

/**
 * Validation result for configuration
 */
export interface ConfigValidationResult {
  /** Whether configuration is valid */
  valid: boolean;

  /** List of validation errors */
  errors: string[];

  /** List of warnings (non-blocking) */
  warnings?: string[];
}
