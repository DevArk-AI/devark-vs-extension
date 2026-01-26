/**
 * RingsHeader Component
 *
 * Fixed header showing top 3 most recent active sessions as activity rings.
 * Part of the cockpit-style UI redesign - rings are always visible at the top.
 *
 * Layout:
 * ┌─────────────────────────────────────────┐
 * │   ◐◑◐      ◐○◑      ○○○                 │
 * │  session1  session2  empty              │
 * │    26m       3m      idle               │
 * └─────────────────────────────────────────┘
 */

import { useMemo } from 'react';
import { SessionRingCard } from './SessionRingCard';
import type { Session, Project, CoachingData } from '../../state/types-v2';
import { ActivityRings } from './ActivityRings';

export interface RingsHeaderProps {
  /** All projects with sessions */
  projects: Project[];
  /** Currently selected session ID */
  activeSessionId?: string | null;
  /** Current coaching data (for goal progress on active session) */
  coaching?: CoachingData | null;
  /** Cached coaching data by session ID */
  coachingBySession?: Record<string, CoachingData>;
  /** Theme for styling */
  theme?: 'light' | 'dark' | 'high-contrast';
  /** Callback when a session ring is clicked */
  onSessionSelect?: (sessionId: string) => void;
  /** Callback to switch to copilot tab */
  onNavigateToCopilot?: () => void;
}

/**
 * Get the top 3 most recent sessions across all projects
 * Sorted by lastActivityTime (most recent first) - same logic as SessionsSidebar
 */
function getTopSessions(projects: Project[], limit = 3): Session[] {
  // Flatten all sessions from all projects
  const allSessions = projects.flatMap((p) => p.sessions);

  // Sort by lastActivityTime descending (most recent first)
  const sorted = [...allSessions].sort(
    (a, b) => b.lastActivityTime.getTime() - a.lastActivityTime.getTime()
  );

  return sorted.slice(0, limit);
}

/**
 * Empty ring placeholder - shown when fewer than 3 sessions
 */
function EmptyRingSlot({ theme = 'dark' }: { theme?: 'light' | 'dark' | 'high-contrast' }) {
  return (
    <div className="vl-rings-header__empty-slot">
      <ActivityRings
        rings={{ goal: 0, quality: 0 }}
        size={64}
        theme={theme}
      />
      <div className="vl-rings-header__empty-info">
        <span className="vl-rings-header__empty-label">No session</span>
        <span className="vl-rings-header__empty-status">idle</span>
      </div>
    </div>
  );
}

/**
 * RingsHeader - Always-visible session rings at top of the cockpit
 */
export function RingsHeader({
  projects,
  activeSessionId,
  coaching,
  coachingBySession = {},
  theme = 'dark',
  onSessionSelect,
  onNavigateToCopilot,
}: RingsHeaderProps) {
  // Get top 3 sessions
  const topSessions = useMemo(() => getTopSessions(projects, 3), [projects]);

  // Handle click on a session ring
  const handleSessionClick = (sessionId: string) => {
    onSessionSelect?.(sessionId);
    onNavigateToCopilot?.();
  };

  // Empty state - no sessions at all
  if (topSessions.length === 0) {
    return (
      <div className="vl-rings-header vl-rings-header--empty">
        <div className="vl-rings-header__slots">
          <EmptyRingSlot theme={theme} />
          <EmptyRingSlot theme={theme} />
          <EmptyRingSlot theme={theme} />
        </div>
        <p className="vl-rings-header__empty-message">
          Start a coding session to see your progress here
        </p>
      </div>
    );
  }

  // Calculate how many empty slots we need
  const emptySlots = 3 - topSessions.length;

  return (
    <div className="vl-rings-header">
      <div className="vl-rings-header__slots">
        {topSessions.map((session) => (
          <SessionRingCard
            key={session.id}
            session={session}
            coaching={coachingBySession[session.id] ?? (session.id === activeSessionId ? coaching : undefined)}
            theme={theme}
            ringSize={64}
            onClick={() => handleSessionClick(session.id)}
            isSelected={session.id === activeSessionId}
          />
        ))}
        {/* Fill remaining slots with empty placeholders */}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <EmptyRingSlot key={`empty-${i}`} theme={theme} />
        ))}
      </div>
    </div>
  );
}

export default RingsHeader;
