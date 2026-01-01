/**
 * SessionContextPanel - Session context display component
 *
 * Collapsible panel showing current session context:
 * - Session goal
 * - Recent topics discussed
 * - Items already addressed
 * - Total prompt count
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Target, MessageSquare, Check } from 'lucide-react';

interface SessionContextPanelProps {
  goal?: string;
  recentTopics: Array<{ topic: string; count: number }>;
  alreadyAddressed: string[];
  promptCount: number;
}

export function SessionContextPanel({
  goal,
  recentTopics,
  alreadyAddressed,
  promptCount
}: SessionContextPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Collapsed view - just summary
  if (isCollapsed) {
    return (
      <button
        className="vl-session-context-collapsed"
        onClick={() => setIsCollapsed(false)}
      >
        <span className="vl-context-icon">&#128203;</span>
        <span className="vl-context-summary">
          {goal ? `Goal: ${goal}` : 'No goal set'}
          {recentTopics.length > 0 && ` - Topics: ${recentTopics.slice(0, 2).map(t => t.topic).join(', ')}`}
        </span>
        <ChevronDown size={14} />
      </button>
    );
  }

  // Expanded view
  return (
    <div className="vl-session-context-panel">
      <button
        className="vl-session-context-header"
        onClick={() => setIsCollapsed(true)}
      >
        <span className="vl-context-icon">&#128203;</span>
        <span>SESSION CONTEXT</span>
        <ChevronUp size={14} />
      </button>

      <div className="vl-session-context-content">
        {/* Goal */}
        <div className="vl-context-section">
          <Target size={14} />
          <span className="vl-context-label">Goal:</span>
          <span>{goal || 'Not set'}</span>
        </div>

        {/* Recent Topics */}
        {recentTopics.length > 0 && (
          <div className="vl-context-section">
            <MessageSquare size={14} />
            <span className="vl-context-label">Recent Topics:</span>
            <div className="vl-topic-list">
              {recentTopics.map(({ topic, count }) => (
                <span key={topic} className="vl-topic-tag">
                  {topic} ({count}x)
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Already Addressed */}
        {alreadyAddressed.length > 0 && (
          <div className="vl-context-section">
            <Check size={14} />
            <span className="vl-context-label">Already Addressed:</span>
            <div className="vl-addressed-list">
              {alreadyAddressed.map(item => (
                <span key={item} className="vl-addressed-tag">{item}</span>
              ))}
            </div>
          </div>
        )}

        <div className="vl-context-footer">
          Context from {promptCount} prompts
        </div>
      </div>
    </div>
  );
}
