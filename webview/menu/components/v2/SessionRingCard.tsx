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
 * Format session duration for display
 */
function formatDuration(startTime: Date, lastActivityTime: Date): string {
  const diffMs = lastActivityTime.getTime() - startTime.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return '<1m';
  if (diffMins < 60) return `${diffMins}m`;

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;

  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Get display name for session
 * Priority: customName > goal (truncated) > platform label
 */
function getSessionDisplayName(session: Session): string {
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

  // Activity ring: Based on promptCount and isActive status
  // Active sessions get a boost, more prompts = more filled
  // Normalize: ~20 prompts = full ring
  const promptFactor = Math.min(session.promptCount / 20, 1);
  const activityBoost = session.isActive ? 0.3 : 0;
  const activity = Math.min(promptFactor + activityBoost, 1);

  // Context ring: Uses real token usage if available, shows 0 if not calculated
  // contextUtilization is 0-1 scale representing how much of the context window is used
  const context = session.tokenUsage?.contextUtilization ?? 0;

  return { goal, context, activity };
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
  // Format percentages for display
  const goalPercent = Math.round(ringData.goal * 100);
  const contextPercent = Math.round(ringData.context * 100);
  const activityPercent = Math.round(ringData.activity * 100);
  const isPending = isGoalProgressPending(session, coaching);

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
            {isPending ? '—' : `${goalPercent}%`} — Goal completion
          </span>
        </div>
        <div className="vl-ring-tooltip__ring-row">
          <span className="vl-ring-tooltip__ring-color vl-ring-tooltip__ring-color--context" />
          <span className="vl-ring-tooltip__ring-value">
            {contextPercent}% — Context used
          </span>
        </div>
        <div className="vl-ring-tooltip__ring-row">
          <span className="vl-ring-tooltip__ring-color vl-ring-tooltip__ring-color--activity" />
          <span className="vl-ring-tooltip__ring-value">
            {activityPercent}% — Session activity
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

  const displayName = getSessionDisplayName(session);
  const duration = formatDuration(session.startTime, session.lastActivityTime);
  const platformConfig = PLATFORM_CONFIG[session.platform];

  return (
    <button
      className={`vl-session-ring-card ${isSelected ? 'selected' : ''} ${session.isActive ? 'active' : ''}`}
      onClick={onClick}
      aria-label={`${displayName} - ${duration} - ${session.promptCount} prompts`}
    >
      <div className="vl-session-ring-card__rings">
        <ActivityRings rings={ringData} size={ringSize} theme={theme} />
        {session.isActive && <span className="vl-session-ring-card__pulse" />}
      </div>

      <div className="vl-session-ring-card__info">
        <span className="vl-session-ring-card__name">{displayName}</span>
        <span className="vl-session-ring-card__duration">
          {session.isActive ? (
            <>
              <span className="vl-session-ring-card__status-dot" />
              {duration}
            </>
          ) : (
            duration
          )}
        </span>
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
