/**
 * LLM Module Entry Point
 *
 * Exports all public interfaces, types, and classes for the LLM provider system.
 */

// Core types
export type {
  LLMProviderType,
  CompletionOptions,
  CompletionResponse,
  StreamChunk,
  ModelInfo,
  ConnectionTestResult,
  LLMProvider,
  OllamaConfig,
  OpenRouterConfig,
  LLMProviderConfig,
  ConfigValidationResult,
  ProviderCapabilities,
} from './types';

// Provider registry system
export {
  ProviderRegistry,
  type ProviderMetadata,
  type ProviderConfigSchema,
  type ProviderConfig,
  type ProviderFactory,
} from './provider-registry';

export {
  RegisterProvider,
  defaultProviderRegistry,
  getProviderRegistry,
  resetProviderRegistry,
} from './decorators';

// Providers (importing triggers decorator registration)
export { OllamaProvider } from './providers/ollama-provider';
export { OpenRouterProvider } from './providers/openrouter-provider';

// Manager classes
export { LLMManager } from './llm-manager';
export type { ProviderTestResults } from './llm-manager';
export { SettingsManager } from './settings-manager';
