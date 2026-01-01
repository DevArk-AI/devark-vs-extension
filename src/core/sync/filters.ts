/**
 * Sync filters - shared logic for filtering sessions by sync eligibility
 */

import { SYNC_CONSTANTS } from './constants';

/**
 * Check if a session is eligible for sync based on duration
 */
export function isEligibleForSync(session: { duration: number }): boolean {
  return session.duration >= SYNC_CONSTANTS.MIN_DURATION_SECONDS;
}

/**
 * Filter sessions to only those eligible for sync
 */
export function filterEligibleSessions<T extends { duration: number }>(
  sessions: T[]
): T[] {
  return sessions.filter((s) => s.duration >= SYNC_CONSTANTS.MIN_DURATION_SECONDS);
}
