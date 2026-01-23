/**
 * SessionCard Component (A2.2)
 *
 * Displays a single session with:
 * - Platform icon + time + prompt count
 * - ACTIVE indicator for current session
 * - Click to switch session context
 * - Hover state and selection feedback
 */

import type { Session } from '../../state/types-v2';
import { PLATFORM_CONFIG } from '../../state/types-v2';
import { formatSessionDuration } from '../../utils/session-utils';

interface SessionCardProps {
  session: Session;
  isActive: boolean;
  onSelect: () => void;
  compact?: boolean;
}

export function SessionCard({
  session,
  isActive,
  onSelect,
  compact = false,
}: SessionCardProps) {
  const platformConfig = PLATFORM_CONFIG[session.platform];
  const duration = formatSessionDuration(session.startTime, session.lastActivityTime);

  if (compact) {
    return (
      <button
        className={`vl-session-card-compact ${isActive ? 'selected' : ''} ${session.isActive ? 'active' : ''}`}
        onClick={onSelect}
        title={`${platformConfig.label} - ${session.promptCount} prompts`}
      >
        {platformConfig.faviconUrl ? (
          <img
            src={platformConfig.faviconUrl}
            alt={`${platformConfig.label} icon`}
            className="vl-session-platform-favicon"
            width="14"
            height="14"
            onError={(e) => {
              // Hide broken image and show fallback
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) (fallback as HTMLElement).style.display = 'inline';
            }}
          />
        ) : null}
        <span className="vl-session-platform-icon" style={{ display: platformConfig.faviconUrl ? 'none' : 'inline' }}>
          {platformConfig.icon}
        </span>
        <span className="vl-session-count">{session.promptCount}</span>
        {session.isActive && <span className="vl-session-active-indicator" />}
      </button>
    );
  }

  return (
    <button
      className={`vl-session-card ${isActive ? 'selected' : ''} ${session.isActive ? 'active' : ''}`}
      onClick={onSelect}
      aria-label={`${platformConfig.label} session with ${session.promptCount} prompts`}
    >
      <div className="vl-session-card-header">
        {platformConfig.faviconUrl ? (
          <img
            src={platformConfig.faviconUrl}
            alt={`${platformConfig.label} icon`}
            className="vl-session-platform-favicon"
            width="16"
            height="16"
            title={platformConfig.label}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) (fallback as HTMLElement).style.display = 'inline';
            }}
          />
        ) : null}
        <span className="vl-session-platform-icon" title={platformConfig.label} style={{ display: platformConfig.faviconUrl ? 'none' : 'inline' }}>
          {platformConfig.icon}
        </span>
        <span className="vl-session-prompt-count">
          {session.promptCount}
        </span>
      </div>

      <div className="vl-session-card-meta">
        <span className="vl-session-duration">{duration}</span>
        {session.goal && (
          <span className="vl-session-goal-indicator" title={session.goal}>
            🎯
          </span>
        )}
      </div>
    </button>
  );
}

export default SessionCard;
