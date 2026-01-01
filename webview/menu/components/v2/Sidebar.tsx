/**
 * Sidebar Component
 *
 * Resizable sidebar container with:
 * - Three width states: collapsed (icons only), default, expanded
 * - Drag handle for resize
 * - Collapse/expand button
 * - Projects list section
 * - Prompt Lab mode for saved prompts
 */

import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ChevronLeft, ChevronRight, Folder, FlaskConical, X, Code2 } from 'lucide-react';
import { useSidebarResize } from './hooks/useSidebarResize';
import { SidebarResizeHandle } from './SidebarResizeHandle';
import { ActiveSessionSwitcher } from './ActiveSessionSwitcher';
import { SIDEBAR_WIDTH, type Project, type SidebarMode, type SavedPrompt } from '../../state/types-v2';

interface SidebarProps {
  projects?: Project[];
  activeSessionId?: string;
  onSessionSelect?: (sessionId: string) => void;
  onSessionRename?: (sessionId: string, customName: string) => void;
  onSessionDelete?: (sessionId: string) => void;
  onProjectToggle?: (projectId: string) => void;
  // Sidebar mode toggle (Projects vs Prompt Lab)
  sidebarMode?: SidebarMode;
  onSidebarModeChange?: (mode: SidebarMode) => void;
  // Saved prompts for Prompt Lab mode
  savedPrompts?: SavedPrompt[];
  onSavedPromptSelect?: (prompt: SavedPrompt) => void;
  onSavedPromptDelete?: (promptId: string) => void;
  onSavedPromptRename?: (promptId: string, newName: string) => void;
  // Auto-analyze toggles
  autoAnalyzeEnabled?: boolean;
  responseAnalysisEnabled?: boolean;
  analyzedToday?: number;
  onToggleAutoAnalyze?: () => void;
  onToggleResponseAnalysis?: () => void;
}

export function Sidebar({
  projects = [],
  activeSessionId,
  onSessionSelect,
  sidebarMode = 'projects',
  onSidebarModeChange,
  savedPrompts = [],
  onSavedPromptSelect,
  onSavedPromptDelete,
  onSavedPromptRename,
  autoAnalyzeEnabled = true,
  responseAnalysisEnabled = true,
  onToggleAutoAnalyze,
  onToggleResponseAnalysis,
}: SidebarProps) {
  const {
    width,
    isCollapsed,
    isDragging,
    handleMouseDown,
    handleDoubleClick,
    toggleCollapse,
  } = useSidebarResize();

  // Determine if we should show text labels (not collapsed)
  const showLabels = !isCollapsed && width > SIDEBAR_WIDTH.MIN + 20;

  return (
    <div
      className={`vl-sidebar ${isCollapsed ? 'collapsed' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ width: `${width}px` }}
    >
      {/* Collapse/Expand Button */}
      <button
        className="vl-sidebar-toggle"
        onClick={toggleCollapse}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Sidebar Content */}
      <div className="vl-sidebar-content">
        {/* Mode Toggle Header */}
        <div className="vl-sidebar-mode-header">
          <button
            className={`vl-sidebar-mode-btn ${sidebarMode === 'projects' ? 'active' : ''}`}
            onClick={() => onSidebarModeChange?.('projects')}
            title="Projects"
          >
            <Folder size={14} />
            {showLabels && <span>PROJECTS</span>}
          </button>
          <button
            className={`vl-sidebar-mode-btn ${sidebarMode === 'prompt-lab' ? 'active' : ''}`}
            onClick={() => onSidebarModeChange?.('prompt-lab')}
            title="Prompt Lab"
          >
            <FlaskConical size={14} />
            {showLabels && <span>PROMPT LAB</span>}
          </button>
        </div>

        {/* Auto-analyze Toggles */}
        {showLabels && (
          <div className="vl-sidebar-auto-analyze-group">
            {/* Auto-analyze Prompt Toggle */}
            <div className="vl-sidebar-auto-analyze">
              <div className="vl-auto-analyze-content">
                <span className="vl-auto-analyze-title">Auto-analyze prompt</span>
                <span className="vl-auto-analyze-desc">Scores prompts you send</span>
              </div>
              <button
                className={`vl-toggle ${autoAnalyzeEnabled ? 'active' : ''}`}
                onClick={onToggleAutoAnalyze}
                title={autoAnalyzeEnabled ? 'Prompt analysis enabled' : 'Prompt analysis disabled'}
              >
                <div className="vl-toggle-knob" />
              </button>
            </div>

            {/* Auto-analyze Response Toggle */}
            <div className="vl-sidebar-auto-analyze">
              <div className="vl-auto-analyze-content">
                <span className="vl-auto-analyze-title">Auto-analyze response</span>
                <span className="vl-auto-analyze-desc">Coaching after AI responds</span>
              </div>
              <button
                className={`vl-toggle ${responseAnalysisEnabled ? 'active' : ''}`}
                onClick={onToggleResponseAnalysis}
                title={responseAnalysisEnabled ? 'Response analysis enabled' : 'Response analysis disabled'}
              >
                <div className="vl-toggle-knob" />
              </button>
            </div>
          </div>
        )}

        {/* Projects Mode Content */}
        {sidebarMode === 'projects' && (
          <>
            {/* Active Sessions Switcher (replaces full project tree) */}
            {showLabels && (
              <div className="vl-sidebar-section">
                <ActiveSessionSwitcher
                  projects={projects}
                  activeSessionId={activeSessionId}
                  onSessionSelect={(sessionId) => onSessionSelect?.(sessionId)}
                />
              </div>
            )}

            {/* Collapsed view - just show icon */}
            {isCollapsed && (
              <div className="vl-sidebar-icons-only">
                <div className="vl-project-icon-item" title="Active Sessions">
                  <Code2 size={16} />
                </div>
              </div>
            )}
          </>
        )}

        {/* Prompt Lab Mode Content */}
        {sidebarMode === 'prompt-lab' && (
          <div className="vl-sidebar-section vl-sidebar-section-grow">
            <div className="vl-sidebar-section-header">
              {showLabels && <span>SAVED PROMPTS</span>}
            </div>

            {showLabels && savedPrompts.length > 0 ? (
              <div className="vl-saved-prompts-list">
                {savedPrompts.map((prompt) => (
                  <SavedPromptItem
                    key={prompt.id}
                    prompt={prompt}
                    onSelect={() => onSavedPromptSelect?.(prompt)}
                    onDelete={() => onSavedPromptDelete?.(prompt.id)}
                    onRename={(newName) => onSavedPromptRename?.(prompt.id, newName)}
                  />
                ))}
              </div>
            ) : showLabels ? (
              <div className="vl-sidebar-empty">
                <span>No saved prompts yet</span>
                <span className="vl-sidebar-empty-hint">
                  Save prompts from the Prompt Lab
                </span>
              </div>
            ) : (
              <div className="vl-sidebar-icons-only">
                <FlaskConical size={16} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resize Handle */}
      <SidebarResizeHandle
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        isDragging={isDragging}
        isCollapsed={isCollapsed}
      />
    </div>
  );
}

// Saved Prompt Item Component (for Prompt Lab mode)
interface SavedPromptItemProps {
  prompt: SavedPrompt;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
}

function SavedPromptItem({ prompt, onSelect, onDelete, onRename }: SavedPromptItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(prompt.name || '');

  const handleDoubleClick = () => {
    setEditName(prompt.name || prompt.text.substring(0, 50));
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editName.trim()) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditName(prompt.name || '');
    }
  };

  const displayName = prompt.name || prompt.text.substring(0, 50);
  const truncatedText = prompt.text.length > 80 ? prompt.text.substring(0, 80) + '...' : prompt.text;

  const handleDelete = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <div
      className="vl-saved-prompt-item"
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <input
          type="text"
          className="vl-inline-edit-input"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <div className="vl-saved-prompt-header">
            <div className="vl-saved-prompt-name">{displayName}</div>
            <button
              className="vl-saved-prompt-delete"
              onClick={handleDelete}
              title="Delete prompt"
            >
              <X size={12} />
            </button>
          </div>
          <div className="vl-saved-prompt-preview">{truncatedText}</div>
          {prompt.tags.length > 0 && (
            <div className="vl-saved-prompt-tags">
              {prompt.tags.map((tag) => (
                <span key={tag} className="vl-saved-prompt-tag">#{tag}</span>
              ))}
            </div>
          )}
          {prompt.lastScore !== undefined && (
            <div className="vl-saved-prompt-score">
              Score: {prompt.lastScore.toFixed(1)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Sidebar;
