/**
 * Analytics event name constants for Mixpanel
 * All events are prefixed with 'vs-extension-' for easy filtering
 */

export const AnalyticsEvents = {
  // User Acquisition
  ACTIVATED: 'vs-extension-activated',
  ONBOARDING_COMPLETED: 'vs-extension-onboarding-completed',
  CLOUD_CONNECTED: 'vs-extension-cloud-connected',
  CLOUD_DISCONNECTED: 'vs-extension-cloud-disconnected',

  // Core Features
  PROMPT_SCORED: 'vs-extension-prompt-scored',
  PROMPT_ENHANCED: 'vs-extension-prompt-enhanced',
  SESSION_SUMMARIZED: 'vs-extension-session-summarized',
  LLM_CONNECTION_TESTED: 'vs-extension-llm-connection-tested',

  // Configuration
  PROVIDER_SELECTED: 'vs-extension-provider-selected',
  MODEL_SELECTED: 'vs-extension-model-selected',
  AUTO_ANALYZE_TOGGLED: 'vs-extension-auto-analyze-toggled',
  HOOKS_INSTALLED: 'vs-extension-hooks-installed',

  // Session Sync
  SYNC_STARTED: 'vs-extension-sync-started',
  SESSIONS_SYNCED: 'vs-extension-sessions-synced',
} as const;

export type AnalyticsEvent = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];
