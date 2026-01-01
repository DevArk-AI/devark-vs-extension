/**
 * Sync constants - single source of truth for sync-related configuration
 */

export const SYNC_CONSTANTS = {
  /** Minimum session duration in seconds to be eligible for sync (4 minutes) */
  MIN_DURATION_SECONDS: 240,
  /** Minimum session duration in minutes */
  MIN_DURATION_MINUTES: 4,
} as const;
