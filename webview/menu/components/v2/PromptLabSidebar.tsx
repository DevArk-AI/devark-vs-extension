/**
 * PromptLabSidebar - Sidebar for Prompt Lab showing saved prompts
 *
 * A simplified sidebar that only displays the saved prompts list
 * with rename, delete, and select functionality.
 */

import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { FlaskConical, X } from 'lucide-react';
import type { SavedPrompt } from '../../state/types-v2';

interface PromptLabSidebarProps {
  savedPrompts: SavedPrompt[];
  onSavedPromptSelect: (prompt: SavedPrompt) => void;
  onSavedPromptDelete: (promptId: string) => void;
  onSavedPromptRename: (promptId: string, newName: string) => void;
}

export function PromptLabSidebar({
  savedPrompts,
  onSavedPromptSelect,
  onSavedPromptDelete,
  onSavedPromptRename,
}: PromptLabSidebarProps) {
  return (
    <div className="vl-prompt-lab-sidebar">
      {/* Header */}
      <div className="vl-prompt-lab-sidebar-header">
        <FlaskConical size={14} />
        <span>SAVED PROMPTS</span>
      </div>

      {/* Saved Prompts List */}
      <div className="vl-prompt-lab-sidebar-content">
        {savedPrompts.length > 0 ? (
          <div className="vl-saved-prompts-list">
            {savedPrompts.map((prompt) => (
              <SavedPromptItem
                key={prompt.id}
                prompt={prompt}
                onSelect={() => onSavedPromptSelect(prompt)}
                onDelete={() => onSavedPromptDelete(prompt.id)}
                onRename={(newName) => onSavedPromptRename(prompt.id, newName)}
              />
            ))}
          </div>
        ) : (
          <div className="vl-sidebar-empty">
            <span>No saved prompts yet</span>
            <span className="vl-sidebar-empty-hint">
              Analyze a prompt and click Save to add it here
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Saved Prompt Item Component
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

export default PromptLabSidebar;
