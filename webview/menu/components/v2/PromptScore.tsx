/**
 * PromptScore Component (A3.1)
 *
 * Main score display component showing:
 * - Score display (X.X/10) - reduced size
 * - Visual progress bar
 * - Combined "How to Improve" actionable checklist
 * - Breakdown with inline "How does scoring work?" link
 */

import { CheckCircle, AlertTriangle } from 'lucide-react';
import { ScoreBar } from './ScoreBar';
import { ScoreBreakdown } from './ScoreBreakdown';
import type { ScoreBreakdown as ScoreBreakdownType, ScoreExplanationV2 } from '../../state/types-v2';

interface PromptScoreProps {
  score: number;
  breakdown?: ScoreBreakdownType;
  explanation?: ScoreExplanationV2;
  promptText?: string;
  onHowItWorks?: () => void;
  compact?: boolean;
}

// Get score class for color coding
function getScoreClass(score: number): string {
  if (score >= 8) return 'score-good';
  if (score >= 5) return 'score-medium';
  return 'score-low';
}

export function PromptScore({
  score,
  breakdown,
  explanation,
  promptText: _promptText,
  onHowItWorks,
  compact = false,
}: PromptScoreProps) {
  const scoreClass = getScoreClass(score);

  return (
    <div className={`vl-prompt-score ${compact ? 'compact' : ''}`}>
      {/* Main Score Display - Title larger, score smaller */}
      <div className="vl-prompt-score-main">
        <div className="vl-prompt-score-header">
          <span className="vl-prompt-score-icon">📊</span>
          <span className="vl-prompt-score-title">PROMPT SCORE</span>
          <span className={`vl-prompt-score-value-inline ${scoreClass}`}>
            {score.toFixed(1)}/10
          </span>
        </div>

        <ScoreBar
          score={score}
          maxScore={10}
          showValue={false}
          size="lg"
          animated
        />
      </div>

      {/* Combined How to Improve Section - actionable checklist */}
      {explanation && (explanation.goodPoints.length > 0 || explanation.missingElements.length > 0 || (explanation.suggestions && explanation.suggestions.length > 0)) && (
        <div className="vl-prompt-score-improve">
          <div className="vl-prompt-score-improve-header">
            <span>HOW TO IMPROVE</span>
          </div>

          <div className="vl-prompt-score-checklist">
            {/* Good Points - what's already done well */}
            {explanation.goodPoints.map((point, index) => (
              <div key={`good-${index}`} className="vl-prompt-score-checklist-item done">
                <CheckCircle size={14} className="vl-checklist-icon done" />
                <span>{typeof point === 'string' ? point : point.label}</span>
              </div>
            ))}

            {/* Missing Elements - what needs work */}
            {explanation.missingElements.map((point, index) => (
              <div key={`missing-${index}`} className="vl-prompt-score-checklist-item todo">
                <AlertTriangle size={14} className="vl-checklist-icon todo" />
                <span>{typeof point === 'string' ? point : point.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Breakdown with inline How does scoring work link */}
      {breakdown && (
        <div className="vl-prompt-score-breakdown-section">
          <ScoreBreakdown
            breakdown={breakdown}
            onHowItWorks={onHowItWorks}
            compact={compact}
          />
        </div>
      )}
    </div>
  );
}

export default PromptScore;
