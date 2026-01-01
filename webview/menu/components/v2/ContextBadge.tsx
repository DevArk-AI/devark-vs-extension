/**
 * ContextBadge - Context-aware badge component
 *
 * Shows what context was used to generate suggestions/improvements.
 * Expandable to show full details.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, FileCode, Target, History } from 'lucide-react';

interface ContextBadgeProps {
  goalUsed?: string;
  promptsUsed: number;
  snippetsUsed: number;
  onExpand?: () => void;
}

export function ContextBadge({
  goalUsed,
  promptsUsed,
  snippetsUsed,
  onExpand
}: ContextBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  const hasContext = goalUsed || promptsUsed > 0 || snippetsUsed > 0;

  if (!hasContext) {
    return null;
  }

  const handleClick = () => {
    setExpanded(!expanded);
    onExpand?.();
  };

  return (
    <div className="vl-context-badge" onClick={handleClick}>
      <div className="vl-context-badge-summary">
        <span className="vl-context-label">Context-aware</span>
        <span className="vl-context-details">
          {goalUsed && <><Target size={10} /> goal</>}
          {promptsUsed > 0 && <><History size={10} /> {promptsUsed} prompts</>}
          {snippetsUsed > 0 && <><FileCode size={10} /> {snippetsUsed} files</>}
        </span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </div>

      {expanded && (
        <div className="vl-context-badge-expanded">
          {goalUsed && (
            <div className="vl-context-item">
              <Target size={12} />
              <span>Based on goal: &quot;{goalUsed}&quot;</span>
            </div>
          )}
          {promptsUsed > 0 && (
            <div className="vl-context-item">
              <History size={12} />
              <span>Building on {promptsUsed} previous prompts</span>
            </div>
          )}
          {snippetsUsed > 0 && (
            <div className="vl-context-item">
              <FileCode size={12} />
              <span>Using {snippetsUsed} code snippets</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
