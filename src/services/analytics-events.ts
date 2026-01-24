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
  IMPROVED_PROMPT_USED: 'vs-extension-improved-prompt-used',
  IMPROVED_PROMPT_COPIED: 'vs-extension-improved-prompt-copied',
  PROMPT_REGENERATED: 'vs-extension-prompt-regenerated',
  SESSION_SUMMARIZED: 'vs-extension-session-summarized',
  LLM_CONNECTION_TESTED: 'vs-extension-llm-connection-tested',

  // Goals
  GOAL_SET: 'vs-extension-goal-set',
  GOAL_INFERENCE_MAYBE_LATER: 'vs-extension-goal-inference-maybe-later',
  GOAL_INFERENCE_DONT_ASK: 'vs-extension-goal-inference-dont-ask',

  // Configuration
  LLM_SELECTOR_OPENED_FOOTER: 'vs-extension-llm-selector-opened-footer',
  LLM_SELECTOR_OPENED_SETTINGS: 'vs-extension-llm-selector-opened-settings',
  PROVIDER_SELECTED: 'vs-extension-provider-selected',
  MODEL_SELECTED: 'vs-extension-model-selected',
  AUTO_ANALYZE_PROMPT_TOGGLED: 'vs-extension-auto-analyze-prompt-toggled',
  AUTO_ANALYZE_RESPONSE_TOGGLED: 'vs-extension-auto-analyze-response-toggled',
  HOOKS_INSTALLED: 'vs-extension-hooks-installed',

  // Local Reports
  REPORT_GENERATED: 'vs-extension-report-generated',
  REPORT_COPIED: 'vs-extension-report-copied',
  REPORT_DOWNLOADED: 'vs-extension-report-downloaded',

  // Session Sync
  SYNC_STARTED: 'vs-extension-sync-started',
  SESSIONS_SYNCED: 'vs-extension-sessions-synced',
  BATCH_UPLOADED: 'vs-extension-batch-uploaded',

  // Feedback
  FEEDBACK_SUBMITTED: 'vs-extension-feedback-submitted',
} as const;

export type AnalyticsEvent = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];
