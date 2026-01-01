/**
 * ProjectsList Component (A2.1)
 *
 * Displays a list of projects with:
 * - Collapsible project groups
 * - Platform icons (Cursor, Claude Code, VS Code)
 * - Session count badges
 * - Active session highlighting
 */

import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import type { Project } from '../../state/types-v2';
import { SessionCard } from './SessionCard';

interface ProjectsListProps {
  projects: Project[];
  activeSessionId?: string;
  onProjectToggle: (projectId: string) => void;
  onSessionSelect: (sessionId: string) => void;
  isCollapsed?: boolean;
}

export function ProjectsList({
  projects,
  activeSessionId,
  onProjectToggle,
  onSessionSelect,
  isCollapsed = false,
}: ProjectsListProps) {
  if (projects.length === 0) {
    return (
      <div className="vl-projects-empty">
        <Folder size={24} className="vl-projects-empty-icon" />
        {!isCollapsed && (
          <p className="vl-projects-empty-text">
            No projects yet. Start coding to see your projects here.
          </p>
        )}
      </div>
    );
  }

  // In collapsed mode, just show folder icons
  if (isCollapsed) {
    return (
      <div className="vl-projects-collapsed">
        {projects.map((project) => (
          <button
            key={project.id}
            className="vl-project-icon-btn"
            onClick={() => onProjectToggle(project.id)}
            title={`${project.name} (${project.sessions.length} sessions)`}
          >
            <Folder size={18} />
            {project.sessions.some((s) => s.isActive) && (
              <span className="vl-project-active-dot" />
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="vl-projects-list">
      {projects.map((project) => (
        <ProjectItem
          key={project.id}
          project={project}
          activeSessionId={activeSessionId}
          onToggle={() => onProjectToggle(project.id)}
          onSessionSelect={onSessionSelect}
        />
      ))}
    </div>
  );
}

interface ProjectItemProps {
  project: Project;
  activeSessionId?: string;
  onToggle: () => void;
  onSessionSelect: (sessionId: string) => void;
}

function ProjectItem({
  project,
  activeSessionId,
  onToggle,
  onSessionSelect,
}: ProjectItemProps) {
  // Note: Empty sessions (0 prompts) are filtered on the backend
  const sessions = project.sessions;
  const hasActiveSessions = sessions.some((s) => s.isActive);

  return (
    <div className={`vl-project-item ${hasActiveSessions ? 'has-active' : ''}`}>
      {/* Project Header */}
      <button
        className="vl-project-header"
        onClick={onToggle}
        aria-expanded={project.isExpanded}
        aria-controls={`project-sessions-${project.id}`}
      >
        <span className="vl-project-expand-icon">
          {project.isExpanded ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </span>
        <span className="vl-project-folder-icon">
          {project.isExpanded ? (
            <FolderOpen size={14} />
          ) : (
            <Folder size={14} />
          )}
        </span>
        <span className="vl-project-name" title={project.name}>
          {project.name}
        </span>
        <span className="vl-project-badge">
          {sessions.length}
        </span>
      </button>

      {/* Sessions List */}
      {project.isExpanded && (
        <div
          id={`project-sessions-${project.id}`}
          className="vl-project-sessions"
        >
          {sessions.length > 0 ? (
            sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onSelect={() => onSessionSelect(session.id)}
              />
            ))
          ) : (
            <div className="vl-project-no-sessions">
              No sessions in this project
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ProjectsList;
