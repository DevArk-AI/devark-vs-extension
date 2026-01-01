/**
 * PersonalProgress Component (A4.2)
 *
 * Displays personal progress comparison:
 * - "Today vs Your Average" bar comparison
 * - Improvement/decline indicator
 * - Streak and trend information
 */

import { TrendingUp, TrendingDown, Minus, Calendar, Flame } from 'lucide-react';
import { ScoreBar } from './ScoreBar';

interface PersonalProgressProps {
  todayScore: number;
  yourAverage: number;
  streak?: number;
  bestScore?: number;
  period?: 'today' | 'week' | 'month';
  onViewHistory?: () => void;
}

// Get message based on performance vs personal average
function getProgressMessage(today: number, average: number): { text: string; type: 'up' | 'down' | 'same' } {
  const diff = today - average;
  const percentChange = average > 0 ? (diff / average) * 100 : 0;

  if (Math.abs(diff) < 0.2) {
    return { text: "Consistent with your average", type: 'same' };
  }
  if (diff > 0) {
    if (percentChange > 20) return { text: "Great improvement!", type: 'up' };
    if (percentChange > 10) return { text: "Above your usual", type: 'up' };
    return { text: "Slightly better than average", type: 'up' };
  }
  if (percentChange < -20) return { text: "Room to improve", type: 'down' };
  if (percentChange < -10) return { text: "Below your usual", type: 'down' };
  return { text: "Slightly below average", type: 'down' };
}

export function PersonalProgress({
  todayScore,
  yourAverage,
  streak = 0,
  bestScore,
  period = 'today',
  onViewHistory,
}: PersonalProgressProps) {
  const progress = getProgressMessage(todayScore, yourAverage);
  const diff = todayScore - yourAverage;

  const periodLabel = {
    today: 'Today',
    week: 'This week',
    month: 'This month',
  }[period];

  const avgLabel = {
    today: 'Your avg',
    week: '7-day avg',
    month: '30-day avg',
  }[period];

  return (
    <div className="vl-personal-progress">
      <div className="vl-personal-progress-header">
        <TrendingUp size={16} className="vl-personal-progress-icon" />
        <span className="vl-personal-progress-title">YOUR PROGRESS</span>
      </div>

      <div className="vl-personal-progress-bars">
        {/* Today's Score Bar */}
        <div className="vl-personal-progress-bar-row current">
          <span className="vl-personal-progress-bar-label">{periodLabel}</span>
          <div className="vl-personal-progress-bar-container">
            <ScoreBar
              score={todayScore}
              maxScore={10}
              showValue={false}
              size="md"
              animated
            />
          </div>
          <span className="vl-personal-progress-bar-value">{todayScore.toFixed(1)}</span>
        </div>

        {/* Your Average Bar */}
        <div className="vl-personal-progress-bar-row average">
          <span className="vl-personal-progress-bar-label">{avgLabel}</span>
          <div className="vl-personal-progress-bar-container">
            <ScoreBar
              score={yourAverage}
              maxScore={10}
              showValue={false}
              size="md"
              animated
              className="vl-personal-avg-bar"
            />
          </div>
          <span className="vl-personal-progress-bar-value">{yourAverage.toFixed(1)}</span>
        </div>
      </div>

      {/* Progress Message */}
      <div className={`vl-personal-progress-message ${progress.type}`}>
        {progress.type === 'up' && <TrendingUp size={14} />}
        {progress.type === 'down' && <TrendingDown size={14} />}
        {progress.type === 'same' && <Minus size={14} />}
        <span>{progress.text}</span>
        {Math.abs(diff) >= 0.2 && (
          <span className="vl-personal-progress-diff">
            ({diff > 0 ? '+' : ''}{diff.toFixed(1)})
          </span>
        )}
      </div>

      {/* Stats Row */}
      <div className="vl-personal-progress-stats">
        {streak > 0 && (
          <div className="vl-personal-progress-stat">
            <Flame size={14} className="vl-streak-icon" />
            <span>{streak} day streak</span>
          </div>
        )}
        {bestScore !== undefined && (
          <div className="vl-personal-progress-stat">
            <span className="vl-best-label">Best:</span>
            <span className="vl-best-value">{bestScore.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* View History CTA */}
      {onViewHistory && (
        <button
          className="vl-personal-progress-cta"
          onClick={onViewHistory}
        >
          <Calendar size={14} />
          <span>View your history</span>
          <span className="vl-personal-progress-cta-arrow">→</span>
        </button>
      )}
    </div>
  );
}

export default PersonalProgress;
