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
import { ActivityRings, type RingData } from './ActivityRings';
import type { Session, CoachingData } from '../../state/types-v2';
import { PLATFORM_CONFIG } from '../../state/types-v2';

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

/**
 * Get display name for session
 * Priority: customName > goal (truncated) > "Analyzing..." (if pending) > platform label
 */
function getSessionDisplayName(
  session: Session,
  coaching?: CoachingData | null
): string {
  if (session.customName) {
    return session.customName.length > 12
      ? session.customName.slice(0, 12) + '…'
      : session.customName;
  }
  if (session.goal) {
    return session.goal.length > 12
      ? session.goal.slice(0, 12) + '…'
      : session.goal;
  }
  // Show "Analyzing..." if session has prompts but no title yet
  if (session.promptCount >= 1 && isGoalProgressPending(session, coaching)) {
    return 'Analyzing…';
  }
  return PLATFORM_CONFIG[session.platform].label;
}

/**
 * Check if goal progress is in a "pending" state (not yet analyzed)
 * Pending means: no coaching progress AND no session progress (undefined, not 0)
 */
function isGoalProgressPending(
  session: Session,
  coaching?: CoachingData | null
): boolean {
  const coachingProgress = coaching?.analysis?.goalProgress?.after;
  const sessionProgress = session.goalProgress;
  // Pending if both are undefined (not 0, which is a valid analyzed value)
  return coachingProgress === undefined && sessionProgress === undefined;
}

/**
 * Check if session is currently being analyzed (has prompts but no title/goal yet)
 * Returns true if the session appears to be waiting for analysis results
 */
function isSessionAnalyzing(
  session: Session,
  coaching?: CoachingData | null
): boolean {
  // Session needs prompts to be worth analyzing
  if (session.promptCount < 1) return false;

  // If we have a custom name or goal, analysis is complete
  if (session.customName || session.goal) return false;

  // If we have goal progress data, analysis is complete (even if 0)
  if (!isGoalProgressPending(session, coaching)) return false;

  return true;
}

/**
 * Map session data to ring fill values (0-1)
 */
function computeRingData(
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

  // Context ring: Uses real token usage if available, shows 0 if not calculated
  // contextUtilization is 0-1 scale representing how much of the context window is used
  const context = session.tokenUsage?.contextUtilization ?? 0;

  // Quality ring: Based on averageScore (0-10 scale)
  const quality = session.averageScore !== undefined
    ? session.averageScore / 10
    : 0;

  return { goal, context, quality };
}

/**
 * Get tooltip title from session
 * Priority: customName > goal > platform label + "Session"
 */
function getTooltipTitle(session: Session, platformLabel: string): string {
  if (session.customName) {
    return session.customName;
  }
  if (session.goal) {
    return session.goal;
  }
  return `${platformLabel} Session`;
}

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

  const title = getTooltipTitle(session, platformLabel);
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

  const displayName = getSessionDisplayName(session, coaching);
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
