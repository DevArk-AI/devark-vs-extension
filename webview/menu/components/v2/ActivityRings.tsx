/**
 * ActivityRings Component
 *
 * Apple Health-style activity rings for session visualization.
 * Uses @jonasdoesthings/react-activity-rings library.
 *
 * Ring meanings:
 * - Outer (red): Goal progress - how close to completing the task
 * - Middle (green): Context remaining - token/context usage (placeholder for now)
 * - Inner (blue): Session activity - based on promptCount and isActive
 */

import { ActivityRings as ActivityRingsLib } from '@jonasdoesthings/react-activity-rings';

export interface RingData {
  /** Goal progress (0-1), maps to outer red ring */
  goal: number;
  /** Context/token usage (0-1), maps to middle green ring. Currently placeholder. */
  context: number;
  /** Activity level (0-1), maps to inner blue ring */
  activity: number;
}

export interface ActivityRingsProps {
  /** Ring fill values (0-1 scale) */
  rings: RingData;
  /** Size of the ring visualization in pixels */
  size?: number;
  /** Theme for color adjustments */
  theme?: 'light' | 'dark' | 'high-contrast';
}

/**
 * Activity ring colors using CSS variables from redesign.css
 * These are muted professional tones that work well in VS Code
 */
const RING_COLORS = {
  // Goal ring - using a warm coral/red
  goal: {
    color: '#e06c75', // Muted red
    background: 'rgba(224, 108, 117, 0.2)',
  },
  // Context ring - using a natural green
  context: {
    color: '#98c379', // Muted green
    background: 'rgba(152, 195, 121, 0.2)',
  },
  // Activity ring - using a calm blue
  activity: {
    color: '#61afef', // Muted blue
    background: 'rgba(97, 175, 239, 0.2)',
  },
} as const;

/**
 * ActivityRings - Apple Health style concentric rings
 *
 * Visualizes 3 metrics as concentric animated rings:
 * - Outer: Goal progress
 * - Middle: Context usage
 * - Inner: Activity level
 */
export function ActivityRings({
  rings,
  size = 80,
  theme = 'dark',
}: ActivityRingsProps) {
  // Clamp values to 0-1 range
  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  // Build ring configuration for the library
  // Library expects rings array from outer to inner
  const ringConfig = [
    {
      filledPercentage: clamp(rings.goal),
      color: RING_COLORS.goal.color,
      backgroundColor: theme === 'high-contrast' ? 'transparent' : RING_COLORS.goal.background,
    },
    {
      filledPercentage: clamp(rings.context),
      color: RING_COLORS.context.color,
      backgroundColor: theme === 'high-contrast' ? 'transparent' : RING_COLORS.context.background,
    },
    {
      filledPercentage: clamp(rings.activity),
      color: RING_COLORS.activity.color,
      backgroundColor: theme === 'high-contrast' ? 'transparent' : RING_COLORS.activity.background,
    },
  ];

  return (
    <div
      className="vl-activity-rings"
      style={{ width: size, height: size }}
    >
      <ActivityRingsLib
        rings={ringConfig}
        options={{
          initialRadius: size * 0.3,
          animationDurationMillis: 800,
          containerHeight: `${size}px`,
        }}
      />
    </div>
  );
}

export default ActivityRings;
