/**
 * GoalBanner - Top Goal Display Component (V2 Redesign)
 *
 * Shows the current session goal at the top of Co-Pilot view.
 * Provides context for all coaching suggestions.
 *
 * Features:
 * - Shows current goal with edit button
 * - "Set a goal..." placeholder when no goal
 * - Compact display that doesn't take too much space
 */

import { useState } from 'react';
import { Edit2, Check, X } from 'lucide-react';

interface GoalBannerProps {
  goal: string | null;
  onEditGoal: (newGoal: string) => void;
}

export function GoalBanner({ goal, onEditGoal }: GoalBannerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(goal || '');

  const handleStartEdit = () => {
    setEditValue(goal || '');
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editValue.trim()) {
      onEditGoal(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(goal || '');
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="vl-goal-banner">
      {isEditing ? (
        <div className="vl-goal-banner-edit">
          <input
            type="text"
            className="vl-goal-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What are you working on?"
            autoFocus
          />
          <button className="vl-goal-save-btn" onClick={handleSave} title="Save">
            <Check size={14} />
          </button>
          <button className="vl-goal-cancel-btn" onClick={handleCancel} title="Cancel">
            <X size={14} />
          </button>
        </div>
      ) : goal ? (
        <div className="vl-goal-banner-display">
          <span className="vl-goal-label">Goal:</span>
          <span className="vl-goal-text">"{goal}"</span>
          <button className="vl-goal-edit-btn" onClick={handleStartEdit} title="Edit goal">
            <Edit2 size={12} />
          </button>
        </div>
      ) : (
        <button className="vl-goal-banner-placeholder" onClick={handleStartEdit}>
          <span>Set a goal...</span>
          <Edit2 size={12} />
        </button>
      )}
    </div>
  );
}

export default GoalBanner;
