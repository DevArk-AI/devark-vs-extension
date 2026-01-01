/**
 * GoalInferenceModal Component (A5.2)
 *
 * Modal that appears after 3 prompts to suggest a session goal:
 * - "We detected a theme" message
 * - Editable goal text
 * - Set Goal / Maybe Later / Don't ask buttons
 */

import { useState, useEffect } from 'react';
import { X, Target, Edit2 } from 'lucide-react';

interface GoalInferenceModalProps {
  isOpen: boolean;
  suggestedGoal: string;
  promptSummary?: string[];
  onSetGoal: (goal: string) => void;
  onMaybeLater: () => void;
  onDontAsk: () => void;
  onClose: () => void;
}

export function GoalInferenceModal({
  isOpen,
  suggestedGoal,
  promptSummary = [],
  onSetGoal,
  onMaybeLater,
  onDontAsk,
  onClose,
}: GoalInferenceModalProps) {
  const [editedGoal, setEditedGoal] = useState(suggestedGoal);
  const [isEditing, setIsEditing] = useState(false);

  // Sync internal state when suggestedGoal prop changes
  useEffect(() => {
    setEditedGoal(suggestedGoal);
    // Start in editing mode if no suggested goal (user manually opening)
    setIsEditing(!suggestedGoal);
  }, [suggestedGoal, isOpen]);

  if (!isOpen) return null;

  const handleSetGoal = () => {
    onSetGoal(editedGoal);
    onClose();
  };

  const handleMaybeLater = () => {
    onMaybeLater();
    onClose();
  };

  const handleDontAsk = () => {
    onDontAsk();
    onClose();
  };

  return (
    <div className="vl-modal-overlay" onClick={onClose}>
      <div
        className="vl-modal vl-goal-inference-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="vl-modal-header">
          <h3>
            <span className="vl-goal-inference-icon">💡</span>
            CO-PILOT DETECTED A THEME
          </h3>
          <button className="vl-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="vl-modal-body">
          {promptSummary.length > 0 && (
            <p className="vl-goal-inference-intro">
              Your last {promptSummary.length} prompts are about:
            </p>
          )}

          {/* Goal Input */}
          <div className="vl-goal-inference-input-container">
            {isEditing ? (
              <textarea
                className="vl-goal-inference-input"
                value={editedGoal}
                onChange={(e) => setEditedGoal(e.target.value)}
                autoFocus
                rows={2}
              />
            ) : (
              <div
                className="vl-goal-inference-display"
                onClick={() => setIsEditing(true)}
              >
                <span className="vl-goal-inference-text">{editedGoal}</span>
                <button
                  className="vl-goal-inference-edit-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                  }}
                >
                  <Edit2 size={14} />
                  Edit
                </button>
              </div>
            )}
          </div>

          <p className="vl-goal-inference-question">
            Set this as your session goal?
          </p>

          {/* Benefits */}
          <div className="vl-goal-inference-benefits">
            <p className="vl-goal-inference-benefits-title">Why set a goal?</p>
            <ul className="vl-goal-inference-benefits-list">
              <li>Get better context suggestions</li>
              <li>See progress summary at session end</li>
              <li>Help co-pilot understand what you're trying to achieve</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="vl-modal-footer vl-goal-inference-footer">
          <button
            className="vl-btn vl-btn-primary"
            onClick={handleSetGoal}
            disabled={!editedGoal.trim()}
          >
            <Target size={14} />
            Set Goal
          </button>
          <button className="vl-btn vl-btn-secondary" onClick={handleMaybeLater}>
            Maybe Later
          </button>
          <button className="vl-btn vl-btn-link" onClick={handleDontAsk}>
            Don't ask again
          </button>
        </div>
      </div>
    </div>
  );
}

export default GoalInferenceModal;
