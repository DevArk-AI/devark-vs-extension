/**
 * CoachingSection - Main coaching display component (V2 Redesign)
 *
 * Shows at the top of CoPilot view:
 * - LAST RESPONSE: Status line with outcome + files modified
 * - NEXT STEP: Suggested action with ready-to-use prompt
 * - Expand/collapse for additional suggestions
 *
 * Key changes from V1:
 * - Removed "Agent completed: {echo}" - replaced with insightful status line
 * - Added LAST RESPONSE and NEXT STEP subtitles for clear separation
 * - Shows files modified instead of echoing agent response
 */

import { useState, useEffect } from 'react';
import { Clock, Zap, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import type { CoachingSuggestion, CoachingData } from '../../state/types-v2';
import type { SessionSource } from '@shared/webview-protocol';

interface CoachingSectionProps {
  coaching: CoachingData | null;
  isListening: boolean;
  source?: SessionSource;
  onUseSuggestion: (suggestion: CoachingSuggestion) => void;
  onDismissSuggestion: (id: string) => void;
}

// Get outcome icon and text based on outcome type
function getOutcomeDisplay(outcome: string): { icon: typeof CheckCircle; text: string; className: string } {
  switch (outcome) {
    case 'success':
      return { icon: CheckCircle, text: 'Success', className: 'outcome-success' };
    case 'partial':
      return { icon: AlertTriangle, text: 'Partial', className: 'outcome-partial' };
    case 'blocked':
      return { icon: XCircle, text: 'Blocked', className: 'outcome-blocked' };
    case 'error':
      return { icon: XCircle, text: 'Error', className: 'outcome-error' };
    default:
      return { icon: CheckCircle, text: 'Done', className: 'outcome-success' };
  }
}

// Format entities modified for display
function formatEntitiesModified(entities: string[] | undefined): string {
  if (!entities || entities.length === 0) return '';

  // Extract just filenames from paths
  const fileNames = entities.map(e => {
    const parts = e.split(/[/\\]/);
    return parts[parts.length - 1];
  });

  if (fileNames.length <= 2) {
    return fileNames.join(', ');
  }
  return `${fileNames.length} files changed`;
}

export function CoachingSection({
  coaching,
  isListening,
  source,
  onUseSuggestion,
  onDismissSuggestion
}: CoachingSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [timeAgo, setTimeAgo] = useState('');

  // Reset expanded state when coaching data changes (new session or new coaching)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on coaching change
    setExpanded(false);
  }, [coaching?.timestamp]);

  useEffect(() => {
    if (!coaching) return;

    const updateTimeAgo = () => {
      const seconds = Math.floor((Date.now() - new Date(coaching.timestamp).getTime()) / 1000);
      if (seconds < 60) setTimeAgo('just now');
      else if (seconds < 3600) setTimeAgo(`${Math.floor(seconds / 60)}m ago`);
      else setTimeAgo(`${Math.floor(seconds / 3600)}h ago`);
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 60000);
    return () => clearInterval(interval);
  }, [coaching]);

  // No coaching yet - show listening state
  if (!coaching) {
    return (
      <div className="vl-coaching-section vl-coaching-listening">
        <div className="vl-coaching-header">
          <span className="vl-coaching-icon">&#127891;</span>
          <span className="vl-coaching-title">COACH</span>
        </div>
        <div className="vl-coaching-status">
          {isListening ? (
            <>
              <span className="vl-pulse">&#127911;</span>
              <span>Waiting for {source === 'claude_code' ? 'Claude Code' : source === 'cursor' ? 'Cursor' : 'agent'} to respond...</span>
            </>
          ) : (
            <span className="vl-muted">Auto-analyze to enable coaching</span>
          )}
        </div>
      </div>
    );
  }

  const topSuggestion = coaching.suggestions[0];
  const moreSuggestions = coaching.suggestions.slice(1);
  const outcomeDisplay = getOutcomeDisplay(coaching.analysis.outcome);
  const OutcomeIcon = outcomeDisplay.icon;
  const entitiesDisplay = formatEntitiesModified(coaching.analysis.entitiesModified);

  return (
    <div className="vl-coaching-section">
      {/* Header */}
      <div className="vl-coaching-header">
        <div className="vl-coaching-header-left">
          <span className="vl-coaching-icon">&#127891;</span>
          <span className="vl-coaching-title">COACH</span>
        </div>
        <span className="vl-coaching-time">
          <Clock size={12} />
          {timeAgo}
        </span>
      </div>

      {/* LAST RESPONSE - Status Line */}
      <div className="vl-coaching-last-response">
        <div className="vl-coaching-subtitle">LAST RESPONSE</div>
        <div className={`vl-coaching-status-line ${outcomeDisplay.className}`}>
          <OutcomeIcon size={14} className="vl-outcome-icon" />
          <span className="vl-outcome-text">{outcomeDisplay.text}</span>
          {entitiesDisplay && (
            <>
              <span className="vl-status-separator">&#8226;</span>
              <span className="vl-entities-modified">Modified: {entitiesDisplay}</span>
            </>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="vl-coaching-divider" />

      {/* NEXT STEP - Top suggestion */}
      {topSuggestion && (
        <div className="vl-coaching-next-step">
          <div className="vl-coaching-subtitle">
            <Zap size={14} className="vl-next-step-icon" />
            NEXT STEP
          </div>
          <div className="vl-suggestion-title-prominent">{topSuggestion.title}</div>
          <div className="vl-suggestion-prompt-box">
            &ldquo;{topSuggestion.suggestedPrompt.length > 150
              ? topSuggestion.suggestedPrompt.substring(0, 150) + '...'
              : topSuggestion.suggestedPrompt}&rdquo;
          </div>
          <div className="vl-suggestion-actions">
            <button
              className="vl-btn vl-btn-primary"
              onClick={() => onUseSuggestion(topSuggestion)}
            >
              Use this prompt
            </button>
            <button
              className="vl-btn vl-btn-secondary"
              onClick={() => onDismissSuggestion(topSuggestion.id)}
            >
              Not now
            </button>
            {moreSuggestions.length > 0 && (
              <button
                className="vl-coaching-more-inline"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                + {moreSuggestions.length} more
              </button>
            )}
          </div>
        </div>
      )}

      {/* Expanded suggestions */}
      {expanded && moreSuggestions.map(suggestion => (
        <div key={suggestion.id} className="vl-coaching-suggestion-mini">
          <span className="vl-suggestion-title">{suggestion.title}</span>
          <button
            className="vl-btn-link"
            onClick={() => onUseSuggestion(suggestion)}
          >
            Use
          </button>
        </div>
      ))}
    </div>
  );
}

