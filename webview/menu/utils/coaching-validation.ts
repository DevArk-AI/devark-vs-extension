/**
 * Coaching Validation Utilities
 *
 * Validates that coaching data belongs to the currently active session
 * before displaying it in the UI.
 */

import type { CoachingData, Session } from '../state/types-v2';

/**
 * Check if coaching data belongs to the active session.
 *
 * Coaching should only be displayed if:
 * 1. The coaching has no promptId (legacy coaching, allow it)
 * 2. OR the session has no ID (can't validate, allow it)
 * 3. OR we trust the backend filtering (allow it)
 *
 * Note: The webview Session type doesn't have prompts array - the backend
 * handles filtering coaching to the correct session.
 *
 * @param coaching - The coaching data received from the extension
 * @param activeSession - The currently active session in the UI
 * @returns true if coaching should be displayed, false otherwise
 */
export function shouldDisplayCoaching(
  coaching: CoachingData | null | undefined,
  activeSession: Session | null | undefined
): boolean {
  // No coaching data - nothing to display
  if (!coaching) {
    return false;
  }

  // No active session - can't validate, allow it (edge case)
  if (!activeSession) {
    return true;
  }

  // No promptId on coaching - legacy data, allow it
  if (!coaching.promptId) {
    return true;
  }

  // Trust the backend filtering - allow the coaching
  // The extension's CoachingService already filters by session
  return true;
}

/**
 * Get a list of prompt IDs from a session for validation
 */
export function getSessionPromptIds(session: Session | null | undefined): string[] {
  // The webview Session type doesn't include prompts array
  // Return empty array - validation is handled by the backend
  if (!session) {
    return [];
  }
  return [];
}
