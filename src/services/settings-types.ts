/**
 * Type-safe settings definitions for the vibe-log extension
 * Provides compile-time safety for configuration keys and values
 */

/**
 * All available setting keys (compile-time safety)
 * Organized by namespace:
 * - llm.*: LLM provider configuration (managed by SettingsManager)
 * - onboarding.*: First-run setup state
 * - autoAnalyze.*: Prompt analysis settings
 * - detection.*: Hook-based detection settings
 */
/**
 * Provider configuration stored in VS Code settings
 */
export interface ProviderConfig {
  enabled?: boolean;
  apiKey?: string;
  model?: string;
  endpoint?: string;
  [key: string]: unknown;
}

/**
 * Map of provider IDs to their configurations
 */
export type ProvidersConfigMap = Record<string, ProviderConfig>;

export type SettingKey =
  // LLM Provider Settings
  | 'llm.providers'
  | 'llm.activeProvider'
  | 'llm.timeout'
  | 'llm.featureModels.enabled'
  | 'llm.featureModels.summaries'
  | 'llm.featureModels.promptScoring'
  | 'llm.featureModels.promptImprovement'
  // Onboarding
  | 'onboarding.completed'
  // Auto-Analysis
  | 'autoAnalyze.enabled'
  // Response Analysis (Coaching)
  | 'responseAnalysis.enabled'
  // Hook Detection
  | 'detection.useHooks'

/**
 * Type mapping for type-safe value retrieval
 * Maps each setting key to its value type
 */
export const SettingValueType = {
  'llm.providers': 'object',
  'llm.activeProvider': 'string',
  'llm.timeout': 'number',
  'llm.featureModels.enabled': 'boolean',
  'llm.featureModels.summaries': 'string',
  'llm.featureModels.promptScoring': 'string',
  'llm.featureModels.promptImprovement': 'string',
  'onboarding.completed': 'boolean',
  'autoAnalyze.enabled': 'boolean',
  'responseAnalysis.enabled': 'boolean',
  'detection.useHooks': 'boolean',
} as const

/**
 * Maps internal setting keys to VS Code configuration keys.
 * Only settings that need transformation are included.
 * LLM settings pass through as-is (handled by section prefix).
 */
export const SETTING_KEY_TO_CONFIG_KEY = {
  'onboarding.completed': 'onboardingCompleted',
  'autoAnalyze.enabled': 'autoAnalyze',
  'responseAnalysis.enabled': 'responseAnalysis',
  'detection.useHooks': 'useHookBasedDetection',
} as const satisfies Partial<Record<SettingKey, string>>;

/** Type for keys that have config key mappings */
export type MappedSettingKey = keyof typeof SETTING_KEY_TO_CONFIG_KEY;

/**
 * Discriminated union for compile-time type safety
 * When you call get<'llm.activeProvider'>(), TypeScript knows the return type is string
 */
export type SettingValue<T extends SettingKey> = T extends 'llm.providers'
    ? ProvidersConfigMap
    : T extends 'llm.activeProvider'
      ? string
      : T extends 'llm.timeout'
        ? number
        : T extends 'onboarding.completed'
          ? boolean
          : T extends 'autoAnalyze.enabled'
            ? boolean
            : T extends 'responseAnalysis.enabled'
              ? boolean
              : T extends 'detection.useHooks'
                ? boolean
              : T extends 'llm.featureModels.enabled'
                ? boolean
                : T extends 'llm.featureModels.summaries'
                  ? string
                  : T extends 'llm.featureModels.promptScoring'
                    ? string
                    : T extends 'llm.featureModels.promptImprovement'
                      ? string
                      : never

/**
 * Change event for settings
 */
export interface SettingChangeEvent<T extends SettingKey = SettingKey> {
  key: T
  oldValue: SettingValue<T> | undefined
  newValue: SettingValue<T> | undefined
}
