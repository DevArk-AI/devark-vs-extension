/**
 * SessionGoal Component (A5.1)
 *
 * Displays the current session goal in the sidebar:
 * - Goal text display
 * - Edit button
 * - "Complete" button
 * - Collapsed/expanded states
 */

import React, { useState } from 'react';
import { Target, Edit2, Check, X } from 'lucide-react';

interface SessionGoalProps {
  goal?: string | null;
  onGoalSet: (goal: string) => void;
  onGoalEdit: () => void;
  onGoalComplete: () => void;
  onGoalClear: () => void;
  isCollapsed?: boolean;
}

export function SessionGoal({
  goal,
  onGoalSet,
  onGoalEdit,
  onGoalComplete,
  onGoalClear,
  isCollapsed = false,
}: SessionGoalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(goal || '');

  const handleSubmit = () => {
    if (editValue.trim()) {
      onGoalSet(editValue.trim());
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditValue(goal || '');
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // Collapsed view - just show icon with indicator
  if (isCollapsed) {
    return (
      <div className="vl-session-goal-collapsed">
        <button
          className={`vl-session-goal-icon-btn ${goal ? 'has-goal' : ''}`}
          onClick={onGoalEdit}
          title={goal || 'Set a goal'}
        >
          <Target size={18} />
          {goal && <span className="vl-goal-indicator" />}
        </button>
      </div>
    );
  }

  // Editing state
  if (isEditing) {
    return (
      <div className="vl-session-goal editing">
        <div className="vl-session-goal-header">
          <Target size={14} />
          <span>GOAL</span>
        </div>
        <div className="vl-session-goal-edit">
          <textarea
            className="vl-session-goal-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What are you trying to accomplish?"
            autoFocus
            rows={2}
          />
          <div className="vl-session-goal-edit-actions">
            <button
              className="vl-session-goal-save-btn"
              onClick={handleSubmit}
              disabled={!editValue.trim()}
            >
              <Check size={14} />
              Save
            </button>
            <button className="vl-session-goal-cancel-btn" onClick={handleCancel}>
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No goal set
  if (!goal) {
    return (
      <div className="vl-session-goal empty">
        <div className="vl-session-goal-header">
          <Target size={14} />
          <span>GOAL</span>
        </div>
        <button
          className="vl-session-goal-set-btn"
          onClick={() => setIsEditing(true)}
        >
          Set a goal...
        </button>
      </div>
    );
  }

  // Goal display
  return (
    <div className="vl-session-goal">
      <div className="vl-session-goal-header">
        <Target size={14} />
        <span>GOAL</span>
        <button
          className="vl-session-goal-edit-btn"
          onClick={() => {
            setEditValue(goal);
            setIsEditing(true);
          }}
          title="Edit goal"
        >
          <Edit2 size={12} />
        </button>
      </div>
      <div className="vl-session-goal-content">
        <p className="vl-session-goal-text">{goal}</p>
      </div>
      <div className="vl-session-goal-actions">
        <button
          className="vl-session-goal-complete-btn"
          onClick={onGoalComplete}
        >
          <Check size={14} />
          Complete
        </button>
        <button
          className="vl-session-goal-clear-btn"
          onClick={onGoalClear}
          title="Clear goal"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export default SessionGoal;
