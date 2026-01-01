/**
 * ScoreBar Component (A3.3)
 *
 * A visual progress bar for displaying scores with:
 * - Colored fill based on score value
 * - Optional label and value display
 * - Animated fill on mount
 * - Configurable size
 */

interface ScoreBarProps {
  score: number;
  maxScore?: number;
  label?: string;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  className?: string;
}

// Get score class for color coding
function getScoreColorClass(score: number, maxScore: number = 10): string {
  const percentage = (score / maxScore) * 100;
  if (percentage >= 80) return 'score-good';
  if (percentage >= 50) return 'score-medium';
  return 'score-low';
}

export function ScoreBar({
  score,
  maxScore = 10,
  label,
  showValue = true,
  size = 'md',
  animated = true,
  className = '',
}: ScoreBarProps) {
  const percentage = Math.min((score / maxScore) * 100, 100);
  const colorClass = getScoreColorClass(score, maxScore);

  return (
    <div className={`vl-score-bar-container ${size} ${className}`}>
      {label && (
        <div className="vl-score-bar-header">
          <span className="vl-score-bar-label">{label}</span>
          {showValue && (
            <span className={`vl-score-bar-value ${colorClass}`}>
              {score.toFixed(1)}
            </span>
          )}
        </div>
      )}
      <div className="vl-score-bar-track">
        <div
          className={`vl-score-bar-fill ${colorClass} ${animated ? 'animated' : ''}`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={maxScore}
        />
      </div>
    </div>
  );
}

export default ScoreBar;
