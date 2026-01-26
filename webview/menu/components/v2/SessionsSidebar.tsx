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

import { useMemo, useState } from 'react';
import { ActivityRings } from './ActivityRings';
import type { Session, Project, CoachingData } from '../../state/types-v2';
import { PLATFORM_CONFIG } from '../../state/types-v2';
import {
  formatSessionDuration,
  getSessionDisplayName,
  isGoalProgressPending,
  computeRingData,
} from '../../utils/session-utils';

/** Session limits per group before "Load more" is shown */
const SESSION_LIMITS = {
  today: 10,
  yesterday: 5,
  earlier: 5,
};

interface SessionsSidebarProps {
  projects: Project[];
  activeSessionId?: string | null;
  coaching?: CoachingData | null;
  coachingBySession?: Record<string, CoachingData>; // Cached coaching per session
  theme?: 'light' | 'dark' | 'high-contrast';
  onSessionSelect: (sessionId: string) => void;
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
  const duration = formatSessionDuration(session.startTime, session.lastActivityTime);
  const platformConfig = PLATFORM_CONFIG[session.platform];

  // Check if goal progress is pending (not yet analyzed)
  const isPending = isGoalProgressPending(session, coaching);

  // Format values for display
  const goalPercent = Math.round(ringData.goal * 100);
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
  // Track which groups are expanded (for showing more sessions)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Track if Earlier group is collapsed (collapsed by default)
  const [earlierCollapsed, setEarlierCollapsed] = useState(true);

  // Flatten all sessions from all projects and sort by lastActivityTime
  const allSessions = useMemo(() => {
    const sessions = projects.flatMap((p) => p.sessions);
    return [...sessions].sort(
      (a, b) => b.lastActivityTime.getTime() - a.lastActivityTime.getTime()
    );
  }, [projects]);

  // Group sessions by time period
  const groupedSessions = useMemo(() => groupSessionsByTime(allSessions), [allSessions]);

  // Helper to toggle expanded state for a group
  const toggleExpanded = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  // Get visible sessions for a group (respects limits)
  const getVisibleSessions = (sessions: Session[], group: keyof typeof SESSION_LIMITS) => {
    const limit = SESSION_LIMITS[group];
    const isExpanded = expandedGroups.has(group);
    return isExpanded ? sessions : sessions.slice(0, limit);
  };

  // Check if a group has more sessions than the limit
  const hasMore = (sessions: Session[], group: keyof typeof SESSION_LIMITS) => {
    return sessions.length > SESSION_LIMITS[group] && !expandedGroups.has(group);
  };

  // Render session items for a group
  const renderSessionItems = (sessions: Session[]) => {
    return sessions.map((session) => (
      <SessionListItem
        key={session.id}
        session={session}
        coaching={coachingBySession[session.id] ?? (session.id === activeSessionId ? coaching : undefined)}
        isSelected={session.id === activeSessionId}
        theme={theme}
        onClick={() => onSessionSelect(session.id)}
      />
    ));
  };

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
            {renderSessionItems(getVisibleSessions(groupedSessions.today, 'today'))}
            {hasMore(groupedSessions.today, 'today') && (
              <button
                className="vl-sessions-sidebar__load-more"
                onClick={() => toggleExpanded('today')}
              >
                Load more ({groupedSessions.today.length - SESSION_LIMITS.today} more)
              </button>
            )}
          </div>
        )}

        {groupedSessions.yesterday.length > 0 && (
          <div className="vl-sessions-sidebar__group">
            <div className="vl-sessions-sidebar__group-header">Yesterday</div>
            {renderSessionItems(getVisibleSessions(groupedSessions.yesterday, 'yesterday'))}
            {hasMore(groupedSessions.yesterday, 'yesterday') && (
              <button
                className="vl-sessions-sidebar__load-more"
                onClick={() => toggleExpanded('yesterday')}
              >
                Load more ({groupedSessions.yesterday.length - SESSION_LIMITS.yesterday} more)
              </button>
            )}
          </div>
        )}

        {groupedSessions.earlier.length > 0 && (
          <div className="vl-sessions-sidebar__group">
            <button
              className="vl-sessions-sidebar__group-header vl-sessions-sidebar__group-header--collapsible"
              onClick={() => setEarlierCollapsed(!earlierCollapsed)}
              aria-expanded={!earlierCollapsed}
            >
              <span className={`vl-sessions-sidebar__collapse-icon ${earlierCollapsed ? '' : 'expanded'}`}>
                {/* Chevron icon */}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </span>
              <span>Earlier</span>
              <span className="vl-sessions-sidebar__group-count">{groupedSessions.earlier.length}</span>
            </button>
            {!earlierCollapsed && (
              <>
                {renderSessionItems(getVisibleSessions(groupedSessions.earlier, 'earlier'))}
                {hasMore(groupedSessions.earlier, 'earlier') && (
                  <button
                    className="vl-sessions-sidebar__load-more"
                    onClick={() => toggleExpanded('earlier')}
                  >
                    Load more ({groupedSessions.earlier.length - SESSION_LIMITS.earlier} more)
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SessionsSidebar;
