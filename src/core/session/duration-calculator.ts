/**
 * Duration Calculator - Pure Functions
 *
 * Calculates active coding duration from timestamped items.
 * Excludes idle gaps (> 15 minutes) and caps at 8 hours maximum.
 *
 * Algorithm:
 * 1. Sum gaps between consecutive timestamps
 * 2. Only count gaps <= 15 minutes as active time
 * 3. Cap total at 8 hours
 */

/**
 * Maximum gap between messages to count as active time (15 minutes in seconds)
 */
export const MAX_IDLE_GAP = 15 * 60;

/**
 * Maximum session duration to return (8 hours in seconds)
 */
export const MAX_SESSION_DURATION = 8 * 60 * 60;

/**
 * Interface for any object that has a timestamp
 */
export interface TimestampedItem {
  timestamp: Date;
}

/**
 * Result of duration calculation with metadata
 */
export interface DurationResult {
  /** Total active time in seconds (capped at MAX_SESSION_DURATION) */
  durationSeconds: number;
  /** Number of gaps counted as active time (<= 15 min) */
  activeGaps: number;
  /** Number of gaps excluded as idle time (> 15 min) */
  idleGaps: number;
}

/**
 * Calculate the active duration from an array of timestamped items.
 *
 * - Sums gaps between consecutive items
 * - Excludes gaps > 15 minutes (considered idle/break time)
 * - Caps result at 8 hours maximum
 *
 * @param items - Array of objects with timestamp property
 * @returns Duration result with seconds and gap counts
 */
export function calculateDuration<T extends TimestampedItem>(
  items: T[]
): DurationResult {
  // Need at least 2 items to calculate duration
  if (items.length < 2) {
    return {
      durationSeconds: 0,
      activeGaps: 0,
      idleGaps: 0,
    };
  }

  let totalActiveTime = 0;
  let activeGaps = 0;
  let idleGaps = 0;

  // Sum gaps between consecutive items
  for (let i = 1; i < items.length; i++) {
    const gapMs = items[i].timestamp.getTime() - items[i - 1].timestamp.getTime();
    const gapSeconds = Math.floor(gapMs / 1000);

    if (gapSeconds <= 0) {
      // Negative or zero gap - ignore (backwards timestamps or identical)
      continue;
    }

    if (gapSeconds <= MAX_IDLE_GAP) {
      // Active gap - count it
      totalActiveTime += gapSeconds;
      activeGaps++;
    } else {
      // Idle gap - exclude it
      idleGaps++;
    }
  }

  // Cap at maximum session duration
  const cappedDuration = Math.min(totalActiveTime, MAX_SESSION_DURATION);

  return {
    durationSeconds: cappedDuration,
    activeGaps,
    idleGaps,
  };
}
