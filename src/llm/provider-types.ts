/**
 * Provider Type Definitions
 *
 * Additional type definitions for CLI providers and provider capabilities.
 * Extends the existing types.ts with CLI-specific types.
 */

/**
 * Provider execution type
 */
export enum ProviderType {
  /** HTTP-based providers (OpenRouter, Anthropic) */
  HTTP = 'http',
  /** CLI-based providers (Claude Code, Cursor) */
  CLI = 'cli'
}

/**
 * How to deliver prompt to CLI tool
 */
export enum PromptDeliveryMethod {
  /** Send prompt via stdin (e.g., Claude Code CLI) */
  STDIN = 'stdin',
  /** Pass prompt as command argument (e.g., Cursor CLI) */
  ARGUMENT = 'argument'
}

/**
 * Extended provider capabilities
 *
 * Describes provider characteristics for architecture decisions
 * (rate limiting, API key storage, etc.)
 */
export interface ProviderCapabilities {
  /** Provider execution type */
  type: ProviderType;
  /** Whether provider requires API key */
  requiresApiKey: boolean;
  /** Whether provider needs rate limiting */
  requiresRateLimiting: boolean;
  /** Whether provider runs locally */
  isLocal: boolean;
  /** Whether provider supports streaming */
  supportsStreaming: boolean;
}

/**
 * CLI provider configuration
 *
 * Defines how to execute a CLI-based LLM provider
 */
export interface CLIConfig {
  /** CLI command name (e.g., 'claude', 'cursor-agent') */
  command: string;
  /** CLI arguments before prompt */
  args: string[];
  /** Expected output format from CLI */
  outputFormat: 'stream-json' | 'json' | 'text';
  /** Environment variables to set for CLI execution */
  env?: Record<string, string>;
  /** How to deliver prompt to CLI (default: stdin) */
  promptDelivery?: PromptDeliveryMethod;
}
