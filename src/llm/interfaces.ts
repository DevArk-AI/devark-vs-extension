import { CompletionOptions, CompletionResponse, StreamChunk, LLMProvider } from './types';
import { ProviderMetadata } from './provider-registry';

/**
 * Minimal interface for copilot features that only need completion capabilities.
 * Not all services need the full LLMManager - this keeps dependencies minimal.
 */
export interface ILLMProvider {
  /**
   * Generate a completion for the given options.
   * This is the core method that all providers must implement.
   */
  generateCompletion(options: CompletionOptions): Promise<CompletionResponse>;

  /**
   * Stream a completion for the given options.
   * Optional - not all providers support streaming.
   */
  streamCompletion?(options: CompletionOptions): AsyncGenerator<StreamChunk>;
}

/**
 * Full manager interface for managing multiple providers.
 * Extends ILLMProvider to ensure manager can be used anywhere a provider is needed.
 */
export interface ILLMManager extends ILLMProvider {
  /**
   * Initialize the manager and load provider configurations.
   */
  initialize(): Promise<void>;

  /**
   * Get list of all available providers with their metadata.
   */
  getAvailableProviders(): ProviderMetadata[];

  /**
   * Switch to a different provider by ID.
   */
  switchProvider(providerId: string): Promise<void>;

  /**
   * Get the currently active provider instance.
   */
  getActiveProvider(): LLMProvider | null;
}

/**
 * Optional logging interface for dependency injection.
 * Allows services to log without hard dependency on console.
 */
export interface ILogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: Error): void;
}

/**
 * Default console logger implementation.
 * Used when no custom logger is provided.
 */
export class ConsoleLogger implements ILogger {
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }

  warn(message: string): void {
    console.warn(`[WARN] ${message}`);
  }

  error(message: string, error?: Error): void {
    console.error(`[ERROR] ${message}`, error);
  }
}
