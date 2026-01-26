/**
 * Session Utilities
 *
 * Shared utility functions for session display, formatting, and calculations.
 * Extracted to avoid code duplication across components.
 */

import type { Session, CoachingData } from '../state/types-v2';
import { PLATFORM_CONFIG } from '../state/types-v2';

/**
 * Threshold for considering a session "recent" enough to show "Analyzing..." state.
 * Sessions older than this are assumed to have failed analysis and show platform label instead.
 */
export const RECENT_SESSION_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Ring data structure for activity rings visualization
 */
export interface RingData {
  goal: number;    // 0-1 scale
  quality: number; // 0-1 scale
}

/**
 * Format duration between two dates for session display.
 *
 * @param startTime - Session start time
 * @param endTime - Session end/last activity time
 * @returns Formatted duration string (e.g., "<1m", "5m", "2h", "1h 30m")
 */
export function formatSessionDuration(startTime: Date, endTime: Date): string {
  const diffMs = endTime.getTime() - startTime.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return '<1m';
  if (diffMins < 60) return `${diffMins}m`;

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;

  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Check if goal progress is in a "pending" state (not yet analyzed).
 * Pending means: no coaching progress AND no session progress (undefined, not 0).
 *
 * @param session - The session to check
 * @param coaching - Optional coaching data for the session
 * @returns True if goal progress is pending (not yet analyzed)
 */
export function isGoalProgressPending(
  session: Session,
  coaching?: CoachingData | null
): boolean {
  const coachingProgress = coaching?.analysis?.goalProgress?.after;
  const sessionProgress = session.goalProgress;
  // Pending if both are undefined (not 0, which is a valid analyzed value)
  return coachingProgress === undefined && sessionProgress === undefined;
}

/**
 * Check if a session is currently being analyzed.
 * Returns true only for recent sessions that appear to be waiting for analysis results.
 *
 * @param session - The session to check
 * @param coaching - Optional coaching data for the session
 * @returns True if the session is in an "analyzing" state
 */
export function isSessionAnalyzing(
  session: Session,
  coaching?: CoachingData | null
): boolean {
  // Session needs prompts to be worth analyzing
  if (session.promptCount < 1) return false;

  // If we have a custom name or goal, analysis is complete
  if (session.customName || session.goal) return false;

  // If we have goal progress data, analysis is complete (even if 0)
  if (!isGoalProgressPending(session, coaching)) return false;

  // Only consider recent sessions as "analyzing" - old sessions have failed
  const isRecent = session.lastActivityTime.getTime() > (Date.now() - RECENT_SESSION_THRESHOLD_MS);
  if (!isRecent && !session.isActive) return false;

  return true;
}

/**
 * Get display name for a session.
 * Priority: customName > goal > "Analyzing..." (if recent and pending) > platform label
 *
 * @param session - The session
 * @param coaching - Optional coaching data
 * @param options - Display options
 * @returns The display name for the session
 */
export function getSessionDisplayName(
  session: Session,
  coaching?: CoachingData | null,
  options?: {
    /** Maximum length before truncation (0 = no truncation) */
    maxLength?: number;
    /** Include project name in parentheses (requires projectName) */
    includeProject?: boolean;
    /** Project name for display */
    projectName?: string;
  }
): string {
  const maxLength = options?.maxLength ?? 0;

  // Check for custom name first
  if (session.customName) {
    let name = session.customName;
    if (maxLength > 0 && name.length > maxLength) {
      name = name.slice(0, maxLength) + '...';
    }
    if (options?.includeProject && options?.projectName) {
      return `${name} (${options.projectName})`;
    }
    return name;
  }

  // Check for goal
  if (session.goal) {
    let name = session.goal;
    if (maxLength > 0 && name.length > maxLength) {
      name = name.slice(0, maxLength) + '...';
    }
    if (options?.includeProject && options?.projectName) {
      return `${name} (${options.projectName})`;
    }
    return name;
  }

  // Check if session is analyzing (only for recent sessions)
  if (isSessionAnalyzing(session, coaching)) {
    return 'Analyzing...';
  }

  // Fall back to platform label or project name
  if (options?.includeProject && options?.projectName) {
    return options.projectName;
  }

  return PLATFORM_CONFIG[session.platform].label;
}

/**
 * Map session data to ring fill values (0-1 scale).
 *
 * @param session - The session
 * @param coaching - Optional coaching data for goal progress override
 * @returns Ring data with goal and quality values (0-1 scale)
 */
export function computeRingData(
  session: Session,
  coaching?: CoachingData | null
): RingData {
  // Goal ring: Use coaching goalProgress.after if available,
  // otherwise fall back to session.goalProgress (LLM-inferred),
  // otherwise 0
  const coachingProgress = coaching?.analysis?.goalProgress?.after;
  const sessionProgress = session.goalProgress;
  const goalProgress = coachingProgress ?? sessionProgress ?? 0;
  const goal = goalProgress / 100; // Convert 0-100 to 0-1

  // Quality ring: Based on averageScore (0-10 scale)
  const quality = session.averageScore !== undefined
    ? session.averageScore / 10
    : 0;

  return { goal, quality };
}

/**
 * Get tooltip title from session.
 * Priority: customName > goal > platform label + "Session"
 *
 * @param session - The session
 * @param platformLabel - The platform label (e.g., "Claude Code")
 * @returns The tooltip title
 */
export function getSessionTooltipTitle(session: Session, platformLabel: string): string {
  if (session.customName) {
    return session.customName;
  }
  if (session.goal) {
    return session.goal;
  }
  return `${platformLabel} Session`;
}
