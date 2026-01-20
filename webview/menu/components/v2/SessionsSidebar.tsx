/**
 * SessionsSidebar Component
 *
 * Sidebar for the Sessions tab showing all sessions with:
 * - Session title (customName > goal > platform label)
 * - Message count
 * - Duration
 * - Ring progress indicators
 * - Active/idle status
 */

import { useMemo } from 'react';
import { ActivityRings, type RingData } from './ActivityRings';
import type { Session, Project, CoachingData } from '../../state/types-v2';
import { PLATFORM_CONFIG } from '../../state/types-v2';

interface SessionsSidebarProps {
  projects: Project[];
  activeSessionId?: string | null;
  coaching?: CoachingData | null;
  coachingBySession?: Record<string, CoachingData>; // Cached coaching per session
  theme?: 'light' | 'dark' | 'high-contrast';
  onSessionSelect: (sessionId: string) => void;
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
 * Get display name for session (longer version for sidebar)
 */
function getSessionDisplayName(session: Session, coaching?: CoachingData | null): string {
  if (session.customName) {
    return session.customName;
  }
  if (session.goal) {
    return session.goal;
  }
  // Show "Analyzing…" if session has prompts but no title yet
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
 * Map session data to ring fill values (0-1)
 */
function computeRingData(session: Session, coaching?: CoachingData | null): RingData {
  const coachingProgress = coaching?.analysis?.goalProgress?.after;
  const sessionProgress = session.goalProgress;
  const goalProgress = coachingProgress ?? sessionProgress ?? 0;
  const goal = goalProgress / 100;

  const context = session.tokenUsage?.contextUtilization ?? 0;

  // Quality ring: Based on averageScore (0-10 scale)
  const quality = session.averageScore !== undefined
    ? session.averageScore / 10
    : 0;

  return { goal, context, quality };
}

/**
 * Session list item component
 */
function SessionListItem({
  session,
  coaching,
  isSelected,
  theme,
  onClick,
}: {
  session: Session;
  coaching?: CoachingData | null;
  isSelected: boolean;
  theme: 'light' | 'dark' | 'high-contrast';
  onClick: () => void;
}) {
  const ringData = useMemo(
    () => computeRingData(session, coaching),
    [session, coaching]
  );

  const displayName = getSessionDisplayName(session, coaching);
  const duration = formatDuration(session.startTime, session.lastActivityTime);
  const platformConfig = PLATFORM_CONFIG[session.platform];

  // Check if goal progress is pending (not yet analyzed)
  const isPending = isGoalProgressPending(session, coaching);

  // Format values for display
  const goalPercent = Math.round(ringData.goal * 100);
  const contextPercent = Math.round(ringData.context * 100);
  // Quality: show as X.X/10 format, or "--" when no score
  const qualityDisplay = session.averageScore !== undefined
    ? `${session.averageScore.toFixed(1)}/10`
    : '--';

  return (
    <button
      className={`vl-session-list-item ${isSelected ? 'selected' : ''} ${session.isActive ? 'active' : ''}`}
      onClick={onClick}
      aria-label={`${displayName} - ${session.promptCount} messages`}
    >
      <div className="vl-session-list-item__main">
        <div className="vl-session-list-item__rings">
          <ActivityRings rings={ringData} size={40} theme={theme} />
          {session.isActive && <span className="vl-session-list-item__pulse" />}
        </div>
        <div className="vl-session-list-item__content">
          <div className="vl-session-list-item__header">
            <span className="vl-session-list-item__title" title={displayName}>
              {displayName.length > 25 ? displayName.slice(0, 25) + '…' : displayName}
            </span>
            {session.isActive && <span className="vl-session-list-item__badge">ACTIVE</span>}
          </div>
          <div className="vl-session-list-item__meta">
            {platformConfig.faviconUrl ? (
              <img
                src={platformConfig.faviconUrl}
                alt={platformConfig.label}
                className="vl-session-list-item__platform-icon"
                width="12"
                height="12"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <span className="vl-session-list-item__platform-dot" style={{ color: platformConfig.colorVar }} />
            )}
            <span className="vl-session-list-item__messages">{session.promptCount} messages</span>
            <span className="vl-session-list-item__separator">·</span>
            <span className="vl-session-list-item__duration">{duration}</span>
          </div>
          <div className="vl-session-list-item__progress">
            <span className="vl-session-list-item__progress-item" title={isPending ? "Goal progress pending" : "Goal Progress"}>
              <span className="vl-progress-dot vl-progress-dot--goal" />
              {isPending ? '—' : `${goalPercent}%`}
            </span>
            <span className="vl-session-list-item__progress-item" title="Context Usage">
              <span className="vl-progress-dot vl-progress-dot--context" />
              {contextPercent}%
            </span>
            <span className="vl-session-list-item__progress-item" title="Prompt quality">
              <span className="vl-progress-dot vl-progress-dot--quality" />
              {qualityDisplay}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

/**
 * Group sessions by time period
 */
function groupSessionsByTime(sessions: Session[]): { today: Session[]; yesterday: Session[]; earlier: Session[] } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

  const today: Session[] = [];
  const yesterday: Session[] = [];
  const earlier: Session[] = [];

  sessions.forEach((session) => {
    const sessionTime = session.lastActivityTime.getTime();
    if (sessionTime >= todayStart.getTime()) {
      today.push(session);
    } else if (sessionTime >= yesterdayStart.getTime()) {
      yesterday.push(session);
    } else {
      earlier.push(session);
    }
  });

  return { today, yesterday, earlier };
}

/**
 * SessionsSidebar - List of all sessions with details
 */
export function SessionsSidebar({
  projects,
  activeSessionId,
  coaching,
  coachingBySession = {},
  theme = 'dark',
  onSessionSelect,
}: SessionsSidebarProps) {
  // Flatten all sessions from all projects and sort by lastActivityTime
  const allSessions = useMemo(() => {
    const sessions = projects.flatMap((p) => p.sessions);
    return [...sessions].sort(
      (a, b) => b.lastActivityTime.getTime() - a.lastActivityTime.getTime()
    );
  }, [projects]);

  // Group sessions by time period
  const groupedSessions = useMemo(() => groupSessionsByTime(allSessions), [allSessions]);

  if (allSessions.length === 0) {
    return (
      <div className="vl-sessions-sidebar vl-sessions-sidebar--empty">
        <div className="vl-sessions-sidebar__empty">
          <span className="vl-sessions-sidebar__empty-text">No sessions yet</span>
          <span className="vl-sessions-sidebar__empty-hint">
            Start coding with Cursor or Claude Code to see your sessions here
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="vl-sessions-sidebar">
      <div className="vl-sessions-sidebar__header">
        <span className="vl-sessions-sidebar__title">Sessions</span>
        <span className="vl-sessions-sidebar__count">{allSessions.length}</span>
      </div>

      <div className="vl-sessions-sidebar__list">
        {groupedSessions.today.length > 0 && (
          <div className="vl-sessions-sidebar__group">
            <div className="vl-sessions-sidebar__group-header">Today</div>
            {groupedSessions.today.map((session) => (
              <SessionListItem
                key={session.id}
                session={session}
                coaching={coachingBySession[session.id] ?? (session.id === activeSessionId ? coaching : undefined)}
                isSelected={session.id === activeSessionId}
                theme={theme}
                onClick={() => onSessionSelect(session.id)}
              />
            ))}
          </div>
        )}

        {groupedSessions.yesterday.length > 0 && (
          <div className="vl-sessions-sidebar__group">
            <div className="vl-sessions-sidebar__group-header">Yesterday</div>
            {groupedSessions.yesterday.map((session) => (
              <SessionListItem
                key={session.id}
                session={session}
                coaching={coachingBySession[session.id] ?? (session.id === activeSessionId ? coaching : undefined)}
                isSelected={session.id === activeSessionId}
                theme={theme}
                onClick={() => onSessionSelect(session.id)}
              />
            ))}
          </div>
        )}

        {groupedSessions.earlier.length > 0 && (
          <div className="vl-sessions-sidebar__group">
            <div className="vl-sessions-sidebar__group-header">Earlier</div>
            {groupedSessions.earlier.map((session) => (
              <SessionListItem
                key={session.id}
                session={session}
                coaching={coachingBySession[session.id] ?? (session.id === activeSessionId ? coaching : undefined)}
                isSelected={session.id === activeSessionId}
                theme={theme}
                onClick={() => onSessionSelect(session.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SessionsSidebar;
