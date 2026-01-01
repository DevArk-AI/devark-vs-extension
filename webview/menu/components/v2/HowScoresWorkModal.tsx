/**
 * HowScoresWorkModal Component (A3.3)
 *
 * Modal explaining the scoring system:
 * - Detailed explanation of each dimension
 * - Good/bad examples for each
 * - Tips for improving scores
 */

import { X } from 'lucide-react';

interface HowScoresWorkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Dimension explanations with examples
const DIMENSIONS = [
  {
    icon: '🎯',
    name: 'SPECIFICITY',
    weight: '20%',
    description: 'How concrete and precise is the request?',
    badExample: '"fix the bug"',
    goodExample: '"fix the null pointer in UserAuth.ts line 42"',
  },
  {
    icon: '📚',
    name: 'CONTEXT',
    weight: '25%',
    description: 'Does the AI have enough background to help?',
    badExample: '"add a feature"',
    goodExample: '"in our React app using Redux, add a logout button"',
  },
  {
    icon: '🎪',
    name: 'INTENT',
    weight: '25%',
    description: 'Is the goal clear and unambiguous?',
    badExample: '"deal with this code"',
    goodExample: '"refactor this function to improve readability"',
  },
  {
    icon: '⚡',
    name: 'ACTIONABILITY',
    weight: '15%',
    description: 'Can the AI act on this directly?',
    badExample: '"thoughts on authentication?"',
    goodExample: '"implement JWT auth with refresh token rotation"',
  },
  {
    icon: '🚧',
    name: 'CONSTRAINTS',
    weight: '15%',
    description: 'Are boundaries and requirements defined?',
    badExample: '"make it better"',
    goodExample: '"optimize for <100ms response, no external deps"',
  },
];

export function HowScoresWorkModal({ isOpen, onClose }: HowScoresWorkModalProps) {
  if (!isOpen) return null;

  return (
    <div className="vl-modal-overlay" onClick={onClose}>
      <div className="vl-modal vl-how-scores-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="vl-modal-header">
          <h3>
            <span>📊</span> HOW PROMPT SCORES WORK
          </h3>
          <button className="vl-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="vl-modal-body">
          <p className="vl-how-scores-intro">
            We analyze prompts across 5 dimensions that research shows lead to better AI responses:
          </p>

          <div className="vl-how-scores-dimensions">
            {DIMENSIONS.map((dim) => (
              <div key={dim.name} className="vl-how-scores-dimension">
                <div className="vl-how-scores-dimension-header">
                  <span className="vl-dimension-icon">{dim.icon}</span>
                  <span className="vl-dimension-name">{dim.name}</span>
                  <span className="vl-dimension-weight">({dim.weight})</span>
                </div>
                <p className="vl-dimension-description">{dim.description}</p>
                <div className="vl-dimension-examples">
                  <div className="vl-dimension-example bad">
                    <span className="vl-example-icon">❌</span>
                    <span className="vl-example-text">{dim.badExample}</span>
                  </div>
                  <div className="vl-dimension-example good">
                    <span className="vl-example-icon">✅</span>
                    <span className="vl-example-text">{dim.goodExample}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="vl-how-scores-tip">
            <span className="vl-tip-icon">💡</span>
            <p>
              Higher scores typically mean fewer back-and-forth cycles and more accurate AI responses on the first try.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="vl-modal-footer">
          <button className="vl-btn vl-btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export default HowScoresWorkModal;
