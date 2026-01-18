/**
 * CoPilotSuggestion Component (A5.3)
 *
 * Context-aware suggestion card:
 * - Suggestion content based on session context
 * - "Add to prompt" / "Not now" buttons
 * - Dismissible
 * - Different visual styles based on suggestion type
 */

import React from 'react';
import { X, Lightbulb, Plus, Clock, AlertCircle, MessageSquare } from 'lucide-react';
import type { SuggestionType, CoPilotSuggestionData } from '../../state/types-v2';

interface CoPilotSuggestionProps {
  suggestion: CoPilotSuggestionData;
  onAddToPrompt: () => void;
  onNotNow: () => void;
  onDismiss: () => void;
  compact?: boolean;
}

// Icon mapping for suggestion types
const SUGGESTION_ICONS: Record<SuggestionType, React.ReactNode> = {
  add_context: <MessageSquare size={16} />,
  combine_prompts: <Plus size={16} />,
  progress_check: <Clock size={16} />,
  resume_session: <Clock size={16} />,
  be_specific: <AlertCircle size={16} />,
};

// Color/style mapping for suggestion types
const SUGGESTION_STYLES: Record<SuggestionType, string> = {
  add_context: 'context',
  combine_prompts: 'combine',
  progress_check: 'progress',
  resume_session: 'resume',
  be_specific: 'specific',
};

export function CoPilotSuggestion({
  suggestion,
  onAddToPrompt,
  onNotNow,
  onDismiss,
  compact = false,
}: CoPilotSuggestionProps) {
  const icon = SUGGESTION_ICONS[suggestion.type];
  const styleClass = SUGGESTION_STYLES[suggestion.type];

  if (compact) {
    return (
      <div className={`vl-copilot-suggestion-compact ${styleClass}`}>
        <div className="vl-suggestion-compact-icon">
          <Lightbulb size={14} />
        </div>
        <span className="vl-suggestion-compact-text">{suggestion.title}</span>
        <button
          className="vl-suggestion-compact-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className={`vl-copilot-suggestion ${styleClass}`}>
      {/* Header */}
      <div className="vl-copilot-suggestion-header">
        <div className="vl-copilot-suggestion-header-left">
          <Lightbulb size={16} className="vl-suggestion-lightbulb" />
          <span className="vl-copilot-suggestion-title">CO-PILOT SUGGESTION</span>
        </div>
        {suggestion.dismissible && (
          <button
            className="vl-copilot-suggestion-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss suggestion"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="vl-copilot-suggestion-content">
        <div className="vl-copilot-suggestion-icon">{icon}</div>
        <div className="vl-copilot-suggestion-body">
          <p className="vl-copilot-suggestion-text">{suggestion.content}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="vl-copilot-suggestion-actions">
        <button
          className="vl-copilot-suggestion-action primary"
          onClick={onAddToPrompt}
        >
          {suggestion.actionLabel || 'Add to prompt'}
        </button>
        <button
          className="vl-copilot-suggestion-action secondary"
          onClick={onNotNow}
        >
          Not now
        </button>
      </div>
    </div>
  );
}

export default CoPilotSuggestion;
