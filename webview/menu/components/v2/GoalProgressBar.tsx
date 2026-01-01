/**
 * GoalProgressBar - Goal progress visualization component
 *
 * Displays progress towards a session goal with color-coded states.
 */

import { Target } from 'lucide-react';

interface GoalProgressBarProps {
  goal: string;
  progress: number;  // 0-100
  compact?: boolean;
}

export function GoalProgressBar({ goal, progress, compact = false }: GoalProgressBarProps) {
  const progressClass = progress >= 75 ? 'progress-high' :
                        progress >= 50 ? 'progress-medium' : 'progress-low';

  if (compact) {
    return (
      <div className="vl-goal-progress-compact">
        <Target size={12} />
        <span className="vl-goal-text">{goal}</span>
        <span className="vl-goal-percent">{progress}%</span>
      </div>
    );
  }

  return (
    <div className="vl-goal-progress">
      <div className="vl-goal-header">
        <Target size={14} />
        <span className="vl-goal-label">Goal: {goal}</span>
      </div>
      <div className="vl-goal-bar-container">
        <div
          className={`vl-goal-bar-fill ${progressClass}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="vl-goal-percent-label">{progress}%</span>
    </div>
  );
}
