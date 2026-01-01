/**
 * ScoreBreakdown Component (A3.2)
 *
 * Displays the 5-dimension scoring breakdown:
 * - Specificity (20%)
 * - Context (25%)
 * - Intent (25%)
 * - Actionability (15%)
 * - Constraints (15%)
 *
 * Each dimension shows a bar and score value with brief explanation.
 */

import { Info } from 'lucide-react';
import { ScoreBar } from './ScoreBar';
import type { ScoreBreakdown as ScoreBreakdownType } from '../../state/types-v2';

interface ScoreBreakdownProps {
  breakdown: ScoreBreakdownType;
  onHowItWorks?: () => void;
  showWeights?: boolean;
  compact?: boolean;
}

// Dimension metadata
const DIMENSION_INFO = {
  specificity: {
    label: 'Specificity',
    icon: '🎯',
    description: 'How concrete and precise is the request?',
    weight: '20%',
  },
  context: {
    label: 'Context',
    icon: '📚',
    description: 'Does the AI have enough background?',
    weight: '25%',
  },
  intent: {
    label: 'Intent',
    icon: '🎪',
    description: 'Is the goal clear and unambiguous?',
    weight: '25%',
  },
  actionability: {
    label: 'Actionability',
    icon: '⚡',
    description: 'Can the AI act on this directly?',
    weight: '15%',
  },
  constraints: {
    label: 'Constraints',
    icon: '🚧',
    description: 'Are boundaries and requirements defined?',
    weight: '15%',
  },
};

type DimensionKey = keyof typeof DIMENSION_INFO;

export function ScoreBreakdown({
  breakdown,
  onHowItWorks,
  showWeights = false,
  compact = false,
}: ScoreBreakdownProps) {
  const dimensions: DimensionKey[] = [
    'specificity',
    'context',
    'intent',
    'actionability',
    'constraints',
  ];

  return (
    <div className={`vl-score-breakdown ${compact ? 'compact' : ''}`}>
      <div className="vl-score-breakdown-header">
        <span className="vl-score-breakdown-title">BREAKDOWN</span>
        {onHowItWorks && (
          <button
            className="vl-score-breakdown-help"
            onClick={onHowItWorks}
            title="How does scoring work?"
          >
            <Info size={14} />
            <span>How does scoring work?</span>
          </button>
        )}
      </div>

      <div className="vl-score-breakdown-list">
        {dimensions.map((dimension) => {
          const info = DIMENSION_INFO[dimension];
          const dimensionData = breakdown[dimension];
          const score = typeof dimensionData === 'object' ? dimensionData.score : 0;

          return (
            <div
              key={dimension}
              className="vl-score-breakdown-item"
              title={info.description}
            >
              <div className="vl-score-breakdown-item-header">
                {!compact && (
                  <span className="vl-score-breakdown-icon">{info.icon}</span>
                )}
                <span className="vl-score-breakdown-label">{info.label}</span>
                {showWeights && (
                  <span className="vl-score-breakdown-weight">{info.weight}</span>
                )}
              </div>
              <div className="vl-score-breakdown-bar-row">
                <ScoreBar
                  score={score}
                  maxScore={10}
                  showValue={false}
                  size={compact ? 'sm' : 'md'}
                  animated
                />
                <span className="vl-score-breakdown-value">
                  {score.toFixed(1)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ScoreBreakdown;
