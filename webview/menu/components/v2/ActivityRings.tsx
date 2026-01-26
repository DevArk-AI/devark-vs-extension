/**
 * ActivityRings Component
 *
 * Apple Health-style activity rings for session visualization.
 * Custom SVG implementation for reliable rendering in VS Code webview.
 *
 * Ring meanings:
 * - Outer (red): Goal progress - how close to completing the task
 * - Inner (blue): Prompt quality - average score 0-10
 */

export interface RingData {
  /** Goal progress (0-1), maps to outer red ring */
  goal: number;
  /** Prompt quality (0-1), maps to inner blue ring */
  quality: number;
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
 * Activity ring colors - muted professional tones that work well in VS Code
 */
const RING_COLORS = {
  // Goal ring - using a warm coral/red
  goal: {
    color: '#e06c75', // Muted red
    background: 'rgba(224, 108, 117, 0.2)',
  },
  // Quality ring - using a calm blue
  quality: {
    color: '#61afef', // Muted blue
    background: 'rgba(97, 175, 239, 0.2)',
  },
} as const;

interface RingConfig {
  percentage: number;
  color: string;
  backgroundColor: string;
  radius: number;
  strokeWidth: number;
}

/**
 * Single ring SVG element
 */
function Ring({ percentage, color, backgroundColor, radius, strokeWidth }: RingConfig) {
  const circumference = 2 * Math.PI * radius;
  const clampedPercentage = Math.max(0, Math.min(1, percentage));
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference * (1 - clampedPercentage);

  return (
    <g>
      {/* Background ring */}
      <circle
        cx="50%"
        cy="50%"
        r={radius}
        fill="none"
        stroke={backgroundColor}
        strokeWidth={strokeWidth}
      />
      {/* Progress ring */}
      <circle
        cx="50%"
        cy="50%"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={strokeDasharray}
        strokeDashoffset={strokeDashoffset}
        style={{
          transform: 'rotate(-90deg)',
          transformOrigin: '50% 50%',
          transition: 'stroke-dashoffset 0.5s ease-out',
        }}
      />
    </g>
  );
}

/**
 * ActivityRings - Apple Health style concentric rings
 *
 * Visualizes 2 metrics as concentric animated rings:
 * - Outer: Goal progress (red)
 * - Inner: Prompt quality (blue)
 */
export function ActivityRings({
  rings,
  size = 80,
  theme = 'dark',
}: ActivityRingsProps) {
  // Ring dimensions - build from inside out
  const strokeWidth = 8;
  const padding = 2;
  const innerRadius = size * 0.22; // Quality (innermost) - slightly larger now with 2 rings
  const outerRadius = innerRadius + strokeWidth + padding; // Goal (outermost)

  // ViewBox needs to accommodate all rings
  const viewBoxSize = (outerRadius + strokeWidth / 2) * 2;

  const ringConfigs: RingConfig[] = [
    // Inner ring - Quality (blue)
    {
      percentage: rings.quality,
      color: RING_COLORS.quality.color,
      backgroundColor: theme === 'high-contrast' ? 'transparent' : RING_COLORS.quality.background,
      radius: innerRadius,
      strokeWidth,
    },
    // Outer ring - Goal (red)
    {
      percentage: rings.goal,
      color: RING_COLORS.goal.color,
      backgroundColor: theme === 'high-contrast' ? 'transparent' : RING_COLORS.goal.background,
      radius: outerRadius,
      strokeWidth,
    },
  ];

  return (
    <div
      className="vl-activity-rings"
      style={{ '--ring-size-prop': `${size}px` } as React.CSSProperties}
    >
      <svg
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      >
        {ringConfigs.map((config, index) => (
          <Ring key={index} {...config} />
        ))}
      </svg>
    </div>
  );
}

export default ActivityRings;
