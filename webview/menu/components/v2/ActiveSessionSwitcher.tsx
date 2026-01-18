/**
 * ActiveSessionSwitcher Component
 *
 * Shows recent sessions across all projects
 * for quick switching between coding sessions.
 * Groups sessions by platform (Claude Code, Cursor, VS Code).
 */

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Platform, Project, Session } from '../../state/types-v2';
import { PLATFORM_CONFIG } from '../../state/types-v2';

const MAX_SESSIONS = 10;

interface ActiveSession extends Session {
  projectName: string;
}

interface SessionGroup {
  platform: Platform;
  sessions: ActiveSession[];
}

interface ActiveSessionSwitcherProps {
  projects: Project[];
  activeSessionId?: string;
  onSessionSelect: (sessionId: string) => void;
}

/**
 * Format duration between two dates
 */
function formatDuration(startTime: Date, endTime: Date): string {
  const diffMs = new Date(endTime).getTime() - new Date(startTime).getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return '<1m';
  if (diffMins < 60) return `${diffMins}m`;

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;

  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Get the most recent sessions across all projects
 * Note: Empty sessions (0 prompts) are filtered on the backend
 */
function getActiveSessions(projects: Project[]): ActiveSession[] {
  const allSessions: ActiveSession[] = [];

  for (const project of projects) {
    for (const session of project.sessions) {
      allSessions.push({
        ...session,
        projectName: project.name,
      });
    }
  }

  // Sort by last activity time (most recent first) and take top N
  return allSessions
    .sort((a, b) => new Date(b.lastActivityTime).getTime() - new Date(a.lastActivityTime).getTime())
    .slice(0, MAX_SESSIONS);
}

/**
 * Group sessions by platform
 */
function groupSessionsByPlatform(sessions: ActiveSession[]): SessionGroup[] {
  const groups = new Map<Platform, ActiveSession[]>();

  for (const session of sessions) {
    const existing = groups.get(session.platform) || [];
    existing.push(session);
    groups.set(session.platform, existing);
  }

  // Convert to array and sort each group by lastActivityTime
  return Array.from(groups.entries()).map(([platform, platformSessions]) => ({
    platform,
    sessions: platformSessions.sort(
      (a, b) => new Date(b.lastActivityTime).getTime() - new Date(a.lastActivityTime).getTime()
    ),
  }));
}

/**
 * Get the display name for a session
 * Priority: 1) customName, 2) goal, 3) projectName
 * Format: "Name (project-name)" or just "project-name" if no name/goal
 */
function getSessionDisplayName(session: ActiveSession): string {
  const name = session.customName || session.goal;

  if (name) {
    // Truncate long names and add project in parenthesis
    const truncated = name.length > 30 ? name.substring(0, 27) + '...' : name;
    return `${truncated} (${session.projectName})`;
  }

  // No customName or goal - just show project name
  return session.projectName;
}

export function ActiveSessionSwitcher({
  projects,
  activeSessionId,
  onSessionSelect,
}: ActiveSessionSwitcherProps) {
  const recentSessions = getActiveSessions(projects);
  const groups = groupSessionsByPlatform(recentSessions);

  // Track which platform groups are expanded (new platforms expand by default)
  const [expandedGroups, setExpandedGroups] = useState<Set<Platform>>(() => new Set());

  // Expand new platforms when they appear
  useEffect(() => {
    const currentPlatforms = new Set(groups.map((g) => g.platform));
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      for (const platform of currentPlatforms) {
        if (!prev.has(platform)) {
          next.add(platform);
        }
      }
      return next.size !== prev.size ? next : prev;
    });
  }, [groups.length]);

  const toggleGroup = (platform: Platform) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  };

  if (recentSessions.length === 0) {
    return (
      <div className="vl-active-sessions-empty">
        <span className="vl-active-sessions-empty-text">No sessions yet</span>
        <span className="vl-active-sessions-empty-hint">
          Start coding to see sessions here
        </span>
      </div>
    );
  }

  return (
    <div className="vl-active-sessions">
      <div className="vl-active-sessions-header">
        <span className="vl-active-sessions-title">RECENT SESSIONS</span>
        <span className="vl-active-sessions-count">({recentSessions.length})</span>
      </div>

      <div className="vl-active-sessions-list">
        {groups.map((group) => {
          const platformConfig = PLATFORM_CONFIG[group.platform];
          const isExpanded = expandedGroups.has(group.platform);

          return (
            <div key={group.platform} className="vl-session-group">
              {/* Group header - clickable to collapse/expand */}
              <button
                className="vl-session-group-header"
                onClick={() => toggleGroup(group.platform)}
                aria-expanded={isExpanded}
              >
                {isExpanded ? (
                  <ChevronDown size={14} className="vl-session-group-chevron" />
                ) : (
                  <ChevronRight size={14} className="vl-session-group-chevron" />
                )}
                {platformConfig.faviconUrl ? (
                  <img
                    src={platformConfig.faviconUrl}
                    alt={platformConfig.label}
                    className="vl-session-group-favicon"
                    width="14"
                    height="14"
                  />
                ) : (
                  <span
                    className="vl-session-group-dot"
                    style={{ backgroundColor: platformConfig.colorVar }}
                  />
                )}
                <span className="vl-session-group-label">{platformConfig.label}</span>
                <span className="vl-session-group-count">({group.sessions.length})</span>
              </button>

              {/* Sessions list - shown when expanded */}
              {isExpanded && (
                <div className="vl-session-group-items">
                  {group.sessions.map((session) => {
                    const isSelected = session.id === activeSessionId;
                    const displayName = getSessionDisplayName(session);
                    const duration = formatDuration(session.startTime, session.lastActivityTime);

                    return (
                      <button
                        key={session.id}
                        className={`vl-active-session-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => onSessionSelect(session.id)}
                        title={`${displayName}\nDuration: ${duration} • ${session.promptCount} messages`}
                      >
                        <span className={`vl-active-session-indicator ${isSelected ? 'selected' : ''}`}>
                          {isSelected ? '●' : '○'}
                        </span>

                        <div className="vl-active-session-info">
                          <span className="vl-active-session-name">{displayName}</span>
                          <div className="vl-active-session-details">
                            <span className="vl-active-session-duration">{duration} dur</span>
                            <span className="vl-active-session-separator">•</span>
                            <span className="vl-active-session-messages">{session.promptCount} msgs</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ActiveSessionSwitcher;
