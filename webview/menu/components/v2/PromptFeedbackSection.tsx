/**
 * PromptFeedbackSection - Collapsible Prompt Feedback Component (V2 Redesign)
 *
 * Backward-looking feature for learning prompt improvement:
 * - Collapsed by default showing score + quick tips
 * - Expandable to show full analysis
 *
 * Collapsed Header:
 * - Score display (e.g., 5.5/10)
 * - Visual progress bar
 * - Quick win tags
 *
 * Expanded Content:
 * - Original prompt (single location - no redundancy)
 * - Score breakdown by dimension
 * - Improved prompt version
 * - Action buttons (Use, Copy, Try another)
 */

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Copy, RefreshCw, Send, HelpCircle, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { ScoreBar } from './ScoreBar';
import { ScoreBreakdown } from './ScoreBreakdown';
import { getScoreClass, formatTimeAgo } from '../../state/types-v2';
import type { AnalyzedPrompt } from '../../state/types-v2';

interface PromptFeedbackSectionProps {
  analysis: AnalyzedPrompt | null;
  isAnalyzing: boolean;
  isEnhancing: boolean;
  isScoringEnhanced: boolean;
  editedImprovedPrompt: string;
  onEditImprovedPrompt: (value: string) => void;
  onUsePrompt: () => void;
  onCopy: () => void;
  onTryAnother: () => void;
  onHowItWorks?: () => void;
  copied: boolean;
}

export function PromptFeedbackSection({
  analysis,
  isAnalyzing,
  isEnhancing,
  isScoringEnhanced,
  editedImprovedPrompt,
  onEditImprovedPrompt,
  onUsePrompt,
  onCopy,
  onTryAnother,
  onHowItWorks,
  copied,
}: PromptFeedbackSectionProps) {
  // Persist expand/collapse preference in localStorage
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem('vl-prompt-feedback-expanded');
    return saved === 'true';
  });

  // Save preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('vl-prompt-feedback-expanded', String(isExpanded));
  }, [isExpanded]);

  // Don't render if no analysis and not analyzing
  if (!analysis && !isAnalyzing) {
    return null;
  }

  const score = analysis?.score ?? 0;
  const scoreClass = getScoreClass(score);
  const explanation = analysis?.explanation;

  // Build quick tips from explanation
  const quickTips: { text: string; type: 'good' | 'warning' }[] = [];
  if (explanation) {
    explanation.goodPoints.slice(0, 2).forEach(point => {
      quickTips.push({
        text: typeof point === 'string' ? point : point.label,
        type: 'good'
      });
    });
    explanation.missingElements.slice(0, 1).forEach(point => {
      quickTips.push({
        text: typeof point === 'string' ? point : point.label,
        type: 'warning'
      });
    });
  }

  return (
    <div className={`vl-prompt-feedback-section ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {/* Collapsed/Expandable Header */}
      <button
        className="vl-prompt-feedback-header"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <div className="vl-prompt-feedback-header-left">
          <span className="vl-prompt-feedback-icon">&#128202;</span>
          <span className="vl-prompt-feedback-title">PROMPT FEEDBACK</span>
        </div>

        <div className="vl-prompt-feedback-header-center">
          {isAnalyzing ? (
            <span className="vl-score shimmer">--/10</span>
          ) : (
            <span className={`vl-score ${scoreClass}`}>{score.toFixed(1)}/10</span>
          )}
          <ScoreBar
            score={score}
            maxScore={10}
            showValue={false}
            size="sm"
            animated={!isAnalyzing}
          />
          {analysis?.timestamp && !isAnalyzing && (
            <span className="vl-prompt-feedback-time">
              <Clock size={12} />
              {formatTimeAgo(new Date(analysis.timestamp))}
            </span>
          )}
        </div>

        <div className="vl-prompt-feedback-header-right">
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          <span className="vl-expand-label">{isExpanded ? 'Collapse' : 'Expand'}</span>
        </div>
      </button>

      {/* Quick Tips in Collapsed State */}
      {!isExpanded && quickTips.length > 0 && (
        <div className="vl-prompt-feedback-quick-tips">
          {quickTips.map((tip, index) => (
            <span key={index} className={`vl-quick-tip ${tip.type}`}>
              {tip.type === 'good' ? (
                <CheckCircle size={12} />
              ) : (
                <AlertTriangle size={12} />
              )}
              {tip.text}
            </span>
          ))}
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div className="vl-prompt-feedback-content">
          {/* Original Prompt (single location) */}
          <div className="vl-prompt-feedback-original">
            <div className="vl-prompt-feedback-label">YOUR LAST PROMPT</div>
            <div className={`vl-prompt-box ${isAnalyzing ? 'shimmer' : ''}`}>
              {analysis?.text || 'Analyzing...'}
            </div>
          </div>

          {/* Quick Tips (full list when expanded) */}
          {explanation && (explanation.goodPoints.length > 0 || explanation.missingElements.length > 0) && (
            <div className="vl-prompt-feedback-tips">
              {explanation.goodPoints.map((point, index) => (
                <span key={`good-${index}`} className="vl-quick-tip good">
                  <CheckCircle size={12} />
                  {typeof point === 'string' ? point : point.label}
                </span>
              ))}
              {explanation.missingElements.map((point, index) => (
                <span key={`warning-${index}`} className="vl-quick-tip warning">
                  <AlertTriangle size={12} />
                  {typeof point === 'string' ? point : point.label}
                </span>
              ))}
            </div>
          )}

          {/* Score Breakdown */}
          {analysis?.breakdown && (
            <div className="vl-prompt-feedback-breakdown">
              <div className="vl-prompt-feedback-breakdown-header">
                <span className="vl-prompt-feedback-label">BREAKDOWN</span>
                {onHowItWorks && (
                  <button className="vl-help-link" onClick={onHowItWorks}>
                    <HelpCircle size={12} />
                    How scores work
                  </button>
                )}
              </div>
              <ScoreBreakdown
                breakdown={analysis.breakdown}
                compact
              />
            </div>
          )}

          {/* Improved Version */}
          <div className="vl-prompt-feedback-improved">
            <div className="vl-prompt-feedback-improved-header">
              <span className="vl-prompt-feedback-label">IMPROVED</span>
              {isEnhancing || isScoringEnhanced ? (
                <span className="vl-score shimmer">
                  {isScoringEnhanced && !isEnhancing ? 'Scoring...' : '--/10'}
                </span>
              ) : analysis?.improvedScore ? (
                <span className={`vl-score ${getScoreClass(analysis.improvedScore)}`}>
                  {analysis.improvedScore.toFixed(1)}/10
                </span>
              ) : null}
            </div>
            <div className={`vl-prompt-improved-container ${isEnhancing ? 'analyzing' : ''}`}>
              {isEnhancing ? (
                <div className="vl-prompt-box improved shimmer">
                  Generating improved version...
                </div>
              ) : analysis?.improvedVersion ? (
                <textarea
                  className="vl-prompt-textarea improved"
                  value={editedImprovedPrompt}
                  onChange={(e) => onEditImprovedPrompt(e.target.value)}
                  placeholder="Edit the improved prompt..."
                />
              ) : (
                <div className="vl-prompt-box improved empty">
                  No improvement generated
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="vl-prompt-feedback-actions">
            <button
              className="vl-btn vl-btn-primary"
              onClick={onUsePrompt}
              disabled={isAnalyzing || isEnhancing || isScoringEnhanced || !editedImprovedPrompt}
            >
              <Send size={14} />
              Use this prompt
            </button>
            <button
              className="vl-btn vl-btn-secondary"
              onClick={onCopy}
              disabled={isAnalyzing || isEnhancing || !editedImprovedPrompt}
            >
              <Copy size={14} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              className="vl-btn vl-btn-secondary"
              onClick={onTryAnother}
              disabled={isAnalyzing || isEnhancing || isScoringEnhanced}
            >
              <RefreshCw size={14} />
              Try another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PromptFeedbackSection;
