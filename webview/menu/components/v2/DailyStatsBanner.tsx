/**
 * DailyStatsBanner Component (A4.1)
 *
 * Displays daily statistics in a compact banner:
 * - Prompt count today
 * - Average score
 * - Delta vs usual (up/down arrow)
 * - Percentile rank (TOP X%)
 */

import { TrendingUp, TrendingDown, Minus, Award } from 'lucide-react';
import type { DailyStatsData } from '../../state/types-v2';

interface DailyStatsBannerProps {
  stats: DailyStatsData;
  onViewDetails?: () => void;
  compact?: boolean;
}

// Format delta with sign
function formatDelta(delta: number): string {
  if (delta === 0) return '0';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}`;
}

// Get delta class for styling
function getDeltaClass(delta: number): string {
  if (delta > 0) return 'positive';
  if (delta < 0) return 'negative';
  return 'neutral';
}

export function DailyStatsBanner({
  stats,
  onViewDetails,
  compact = false,
}: DailyStatsBannerProps) {
  const deltaClass = getDeltaClass(stats.deltaVsUsual);
  const isTopPercentile = stats.percentileRank <= 25;

  if (compact) {
    return (
      <div className="vl-daily-stats-compact" onClick={onViewDetails}>
        <span className="vl-daily-stats-prompts">{stats.promptCount} prompts</span>
        <span className="vl-daily-stats-separator">-</span>
        <span className="vl-daily-stats-avg">avg {stats.averageScore.toFixed(1)}</span>
        {stats.deltaVsUsual !== 0 && (
          <>
            <span className="vl-daily-stats-separator">-</span>
            <span className={`vl-daily-stats-delta ${deltaClass}`}>
              {stats.deltaVsUsual > 0 ? '↑' : '↓'}
              {Math.abs(stats.deltaVsUsual).toFixed(1)}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="vl-daily-stats-banner" onClick={onViewDetails}>
      <div className="vl-daily-stats-header">
        <span className="vl-daily-stats-icon">📈</span>
        <span className="vl-daily-stats-title">TODAY</span>
      </div>

      <div className="vl-daily-stats-content">
        {/* Prompt Count */}
        <div className="vl-daily-stats-item">
          <span className="vl-daily-stats-value">{stats.promptCount}</span>
          <span className="vl-daily-stats-label">prompts</span>
        </div>

        <span className="vl-daily-stats-dot">-</span>

        {/* Average Score */}
        <div className="vl-daily-stats-item">
          <span className="vl-daily-stats-value">avg {stats.averageScore.toFixed(1)}</span>
        </div>

        <span className="vl-daily-stats-dot">-</span>

        {/* Delta vs Usual */}
        <div className={`vl-daily-stats-item vl-daily-stats-delta ${deltaClass}`}>
          {stats.deltaVsUsual > 0 ? (
            <TrendingUp size={14} />
          ) : stats.deltaVsUsual < 0 ? (
            <TrendingDown size={14} />
          ) : (
            <Minus size={14} />
          )}
          <span className="vl-daily-stats-value">
            {formatDelta(stats.deltaVsUsual)} vs usual
          </span>
        </div>

        <span className="vl-daily-stats-dot">-</span>

        {/* Percentile Rank */}
        <div className={`vl-daily-stats-item vl-daily-stats-percentile ${isTopPercentile ? 'top' : ''}`}>
          {isTopPercentile && <Award size={14} />}
          <span className="vl-daily-stats-value">
            TOP {stats.percentileRank}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default DailyStatsBanner;
