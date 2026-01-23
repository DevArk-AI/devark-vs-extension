/**
 * SessionRingCard Component
 *
 * Displays session status as activity rings with label, name, and duration.
 * Used in the cockpit header to show top active sessions at a glance.
 *
 * Layout:
 *   [  ◐◑◐  ]    ← Activity rings
 *   auth-feat     ← Session name (goal or custom name)
 *     26m         ← Duration
 */

import { useMemo } from 'react';
import { ActivityRings } from './ActivityRings';
import type { Session, CoachingData } from '../../state/types-v2';
import { PLATFORM_CONFIG } from '../../state/types-v2';
import {
  getSessionDisplayName as getDisplayName,
  isGoalProgressPending,
  isSessionAnalyzing,
  computeRingData,
  getSessionTooltipTitle,
  type RingData,
} from '../../utils/session-utils';

export interface SessionRingCardProps {
  /** Session data */
  session: Session;
  /** Coaching data for goal progress (optional) */
  coaching?: CoachingData | null;
  /** Theme for styling */
  theme?: 'light' | 'dark' | 'high-contrast';
  /** Size of the rings */
  ringSize?: number;
  /** Click handler */
  onClick?: () => void;
  /** Whether this is the currently selected session */
  isSelected?: boolean;
}

/** Maximum display name length for ring card (compact view) */
const RING_CARD_MAX_NAME_LENGTH = 12;

/**
 * Ring tooltip content component
 *
 * Layout:
 * ┌─────────────────────────────┐
 * │ Implement Reports tab...    │  ← Goal as title
 * │ 3 prompts · Active          │
 * ├─────────────────────────────┤
 * │ 🔴 0% — Task completion     │  ← No redundant labels
 * │ 🟢 10% — Context used       │
 * │ 🔵 45% — Session activity   │
 * ├─────────────────────────────┤
 * │ Claude Code                 │  ← Platform at bottom
 * └─────────────────────────────┘
 */
function RingTooltip({
  session,
  ringData,
  platformLabel,
  coaching,
}: {
  session: Session;
  ringData: RingData;
  platformLabel: string;
  coaching?: CoachingData | null;
}) {
  // Format values for display
  const goalPercent = Math.round(ringData.goal * 100);
  const contextPercent = Math.round(ringData.context * 100);
  // VIB-90: Show "--" when tokenUsage is not available (hook sessions without Claude data)
  const hasTokenUsage = session.tokenUsage !== undefined;
  const contextDisplay = hasTokenUsage ? `${contextPercent}%` : '--';
  // Quality: show as X.X/10 format, or "--" when no score
  const qualityDisplay = session.averageScore !== undefined
    ? `${session.averageScore.toFixed(1)}/10`
    : '--';
  const isPending = isGoalProgressPending(session, coaching);
  const isAnalyzing = isSessionAnalyzing(session, coaching);

  const title = getSessionTooltipTitle(session, platformLabel);
  // Show platform at bottom only if we have a goal/customName (otherwise it's already in title)
  const showPlatformFooter = session.customName || session.goal;

  return (
    <div className="vl-ring-tooltip">
      <div className="vl-ring-tooltip__header">
        <div className="vl-ring-tooltip__title" title={title}>
          {title}
        </div>
        <div className="vl-ring-tooltip__subtitle">
          {session.promptCount} prompts · {session.isActive ? 'Active' : 'Idle'}
        </div>
      </div>
      <div className="vl-ring-tooltip__rings">
        <div className="vl-ring-tooltip__ring-row">
          <span className="vl-ring-tooltip__ring-color vl-ring-tooltip__ring-color--goal" />
          <span className="vl-ring-tooltip__ring-value">
            {isAnalyzing ? 'Analyzing...' : isPending ? '—' : `${goalPercent}%`} — Goal completion
          </span>
        </div>
        <div className="vl-ring-tooltip__ring-row">
          <span className="vl-ring-tooltip__ring-color vl-ring-tooltip__ring-color--context" />
          <span className="vl-ring-tooltip__ring-value">
            {contextDisplay} — Context used
          </span>
        </div>
        <div className="vl-ring-tooltip__ring-row">
          <span className="vl-ring-tooltip__ring-color vl-ring-tooltip__ring-color--quality" />
          <span className="vl-ring-tooltip__ring-value">
            {qualityDisplay} — Prompt quality
          </span>
        </div>
      </div>
      {showPlatformFooter && (
        <div className="vl-ring-tooltip__platform">
          {platformLabel}
        </div>
      )}
    </div>
  );
}

/**
 * SessionRingCard - Compact session visualization with rings
 */
/**
 * Small inline spinner for analyzing state
 */
function AnalyzingSpinner() {
  return (
    <svg
      className="vl-session-ring-card__spinner"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="5"
        cy="5"
        r="4"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M5 1a4 4 0 0 1 4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function SessionRingCard({
  session,
  coaching,
  theme = 'dark',
  ringSize = 64,
  onClick,
  isSelected = false,
}: SessionRingCardProps) {
  const ringData = useMemo(
    () => computeRingData(session, coaching),
    [session, coaching]
  );

  const displayName = getDisplayName(session, coaching, { maxLength: RING_CARD_MAX_NAME_LENGTH });
  const platformConfig = PLATFORM_CONFIG[session.platform];
  const analyzing = isSessionAnalyzing(session, coaching);

  return (
    <button
      className={`vl-session-ring-card ${isSelected ? 'selected' : ''} ${session.isActive ? 'active' : ''}`}
      onClick={onClick}
      aria-label={`${displayName} - ${session.promptCount} prompts`}
    >
      <div className="vl-session-ring-card__rings">
        <ActivityRings rings={ringData} size={ringSize} theme={theme} />
        {session.isActive && <span className="vl-session-ring-card__pulse" />}
      </div>

      <div className="vl-session-ring-card__info">
        <span className="vl-session-ring-card__name">
          {analyzing && <AnalyzingSpinner />}
          {displayName}
        </span>
        {session.isActive && (
          <span className="vl-session-ring-card__status">
            <span className="vl-session-ring-card__status-dot" />
          </span>
        )}
      </div>
      <RingTooltip
        session={session}
        ringData={ringData}
        platformLabel={platformConfig.label}
        coaching={coaching}
      />
    </button>
  );
}

export default SessionRingCard;
