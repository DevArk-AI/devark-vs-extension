/**
 * PromptHistoryList Component (A2.3)
 *
 * Displays the prompt history with:
 * - Last 10 prompts with scores
 * - "Load more" button (loads 10 more)
 * - Truncated prompt text with tooltip
 * - Score color coding
 * - Click to select prompt
 */

import { useState, useMemo } from 'react';
import { ChevronDown, MessageSquare } from 'lucide-react';
import { formatTimeAgo, getScoreClass } from '../../state/types-v2';
import type { PromptRecord } from '../../state/types-v2';

const PROMPTS_PER_PAGE = 10;

interface PromptHistoryListProps {
  prompts: PromptRecord[];
  onPromptSelect?: (prompt: PromptRecord) => void;
  onLoadMore?: () => void;
  maxPrompts?: number;
  isLoading?: boolean;
  hasMore?: boolean;
}

// Truncate text with ellipsis
function truncateText(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

export function PromptHistoryList({
  prompts,
  onPromptSelect,
  onLoadMore,
  maxPrompts,
  isLoading = false,
  hasMore = true,
}: PromptHistoryListProps) {
  const [visibleCount, setVisibleCount] = useState(PROMPTS_PER_PAGE);

  // Calculate visible prompts
  const visiblePrompts = useMemo(() => {
    const limit = maxPrompts || visibleCount;
    return prompts.slice(0, limit);
  }, [prompts, maxPrompts, visibleCount]);

  // Check if there are more prompts to show
  const canLoadMore = hasMore || visibleCount < prompts.length;

  const handleLoadMore = () => {
    if (onLoadMore) {
      onLoadMore();
    } else {
      setVisibleCount((prev) => prev + PROMPTS_PER_PAGE);
    }
  };

  if (prompts.length === 0) {
    return (
      <div className="vl-prompt-history-empty">
        <MessageSquare size={24} className="vl-prompt-history-empty-icon" />
        <p className="vl-prompt-history-empty-text">
          No prompts yet. Start coding to see your prompt history here.
        </p>
      </div>
    );
  }

  return (
    <div className="vl-prompt-history">
      <div className="vl-prompt-history-list">
        {visiblePrompts.map((prompt) => (
          <PromptHistoryItem
            key={prompt.id}
            prompt={prompt}
            onSelect={() => onPromptSelect?.(prompt)}
          />
        ))}
      </div>

      {/* Load More Button */}
      {canLoadMore && (
        <button
          className="vl-prompt-history-load-more"
          onClick={handleLoadMore}
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="vl-loading-dots">Loading...</span>
          ) : (
            <>
              <ChevronDown size={14} />
              <span>Load more</span>
            </>
          )}
        </button>
      )}

      {/* Summary */}
      <div className="vl-prompt-history-summary">
        <span>{prompts.length} prompts total</span>
        {prompts.length > 0 && (
          <span className="vl-prompt-history-avg">
            avg {(prompts.reduce((sum, p) => sum + p.score, 0) / prompts.length).toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}

interface PromptHistoryItemProps {
  prompt: PromptRecord;
  onSelect: () => void;
}

function PromptHistoryItem({ prompt, onSelect }: PromptHistoryItemProps) {
  const scoreClass = getScoreClass(prompt.score);
  const timeAgo = formatTimeAgo(new Date(prompt.timestamp));
  const truncatedText = prompt.truncatedText || truncateText(prompt.text);

  return (
    <button
      className="vl-prompt-history-item"
      onClick={onSelect}
      title={prompt.text}
    >
      <div className="vl-prompt-history-item-content">
        <span className="vl-prompt-history-text">&quot;{truncatedText}&quot;</span>
      </div>
      <div className="vl-prompt-history-item-meta">
        <span className={`vl-prompt-history-score ${scoreClass}`}>
          {prompt.score.toFixed(1)}
        </span>
        <span className="vl-prompt-history-time">{timeAgo}</span>
      </div>
    </button>
  );
}

export default PromptHistoryList;
