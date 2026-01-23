/**
 * SessionInfoHeader - Displays session metadata at top of CoPilot view
 *
 * Shows:
 * - Project folder path
 * - Session duration
 * - Platform icon (Cursor/Claude Code/VS Code)
 */

import { Folder, Clock } from 'lucide-react';
import type { Session, Project, Platform } from '../../state/types-v2';

interface SessionInfoHeaderProps {
  session: Session | null;
  project: Project | null;
}

// Platform display config
const platformConfig: Record<Platform, { label: string; colorVar: string }> = {
  cursor: { label: 'Cursor', colorVar: 'var(--platform-cursor)' },
  claude_code: { label: 'Claude Code', colorVar: 'var(--platform-claude)' },
  vscode: { label: 'VS Code', colorVar: 'var(--platform-vscode)' },
};

function formatDuration(startTime: Date, lastActivityTime: Date): string {
  const start = new Date(startTime);
  const end = new Date(lastActivityTime);
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return '<1m';
  if (diffMins < 60) return `${diffMins}m`;

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatStartTime(startTime: Date): string {
  const start = new Date(startTime);
  return start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function abbreviatePath(path: string | undefined): string {
  if (!path) return '';

  // Normalize to forward slashes for display
  let normalized = path.replace(/\\/g, '/');

  // Replace home directory with ~ (Unix and Windows)
  const homeDir =
    normalized.match(/^\/Users\/[^/]+/) ||
    normalized.match(/^\/home\/[^/]+/) ||
    normalized.match(/^[A-Za-z]:\/Users\/[^/]+/);
  if (homeDir) {
    normalized = normalized.replace(homeDir[0], '~');
  }

  // If still too long, show last 2-3 segments
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length > 3) {
    return '.../' + segments.slice(-2).join('/');
  }

  return normalized;
}

export function SessionInfoHeader({ session, project }: SessionInfoHeaderProps) {
  if (!session) {
    return null;
  }

  const platform = platformConfig[session.platform];
  const duration = formatDuration(session.startTime, session.lastActivityTime);
  const startTime = formatStartTime(session.startTime);
  const projectPath = project?.path || project?.name || '';
  const displayPath = abbreviatePath(projectPath) || project?.name || 'Unknown Project';

  return (
    <div className="vl-session-info-header">
      <div className="vl-session-info-item vl-session-info-project">
        <Folder size={14} />
        <span className="vl-session-info-value" title={projectPath}>
          {displayPath}
        </span>
      </div>

      <div className="vl-session-info-right">
        <div className="vl-session-info-item">
          <Clock size={14} />
          <span className="vl-session-info-value">{startTime}</span>
          <span className="vl-session-info-separator">•</span>
          <span className="vl-session-info-value">{duration}</span>
        </div>

        <div
          className="vl-session-info-item vl-session-info-platform"
          style={{ color: platform.colorVar }}
        >
          <span
            className="vl-platform-dot"
            style={{ backgroundColor: platform.colorVar }}
          />
          <span className="vl-session-info-value">{platform.label}</span>
        </div>
      </div>
    </div>
  );
}
