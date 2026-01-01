/**
 * PromptLabView - Prompt Lab Main Content
 *
 * Shows:
 * - Cloud status badge
 * - Prompt input textarea
 * - "Analyze and Improve" button
 * - Progressive analysis results
 * - Save button for prompts
 *
 * Isolated from auto-detected prompts (uses state.promptLab)
 */

import { useState, useEffect } from 'react';
import { FlaskConical, Copy, Save, RefreshCw, Sparkles } from 'lucide-react';
import { useAppV2, getScoreClass } from '../../AppV2';
import { send } from '../../utils/vscode';
import { PromptScore } from './PromptScore';

export function PromptLabView() {
  const { state, dispatch } = useAppV2();
  const [copied, setCopied] = useState(false);
  const [editedImprovedPrompt, setEditedImprovedPrompt] = useState('');

  const { promptLab } = state;

  // Debug logging to diagnose display issues
  useEffect(() => {
    console.log('[PromptLabView] State update:', {
      hasCurrentAnalysis: !!promptLab.currentAnalysis,
      isAnalyzing: promptLab.isAnalyzing,
      isEnhancing: promptLab.isEnhancing,
      currentPrompt: promptLab.currentPrompt.substring(0, 50),
      score: promptLab.currentAnalysis?.score,
    });
  }, [promptLab]);

  // Sync editedImprovedPrompt when improved version arrives
  useEffect(() => {
    if (promptLab.currentAnalysis?.improvedVersion) {
      setEditedImprovedPrompt(promptLab.currentAnalysis.improvedVersion);
    }
  }, [promptLab.currentAnalysis?.improvedVersion]);

  const handleAnalyze = () => {
    if (!promptLab.currentPrompt.trim()) return;

    dispatch({ type: 'START_PROMPT_LAB_ANALYSIS' });
    send('analyzePromptLabPrompt', { prompt: promptLab.currentPrompt });
  };

  const handleCopyImproved = async () => {
    const promptToCopy = editedImprovedPrompt || promptLab.currentAnalysis?.improvedVersion;
    if (promptToCopy) {
      try {
        await navigator.clipboard.writeText(promptToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
      }
    }
  };

  const handleSavePrompt = () => {
    if (!promptLab.currentPrompt.trim()) return;

    send('savePromptToLibrary', {
      text: promptLab.currentPrompt,
      name: promptLab.currentPrompt.substring(0, 50),
      tags: [],
      lastScore: promptLab.currentAnalysis?.score,
      improvedVersion: promptLab.currentAnalysis?.improvedVersion,
      improvedScore: promptLab.currentAnalysis?.improvedScore,
      lastAnalyzedAt: promptLab.currentAnalysis?.timestamp ?? new Date(),
    });
  };

  const handleTryAnother = () => {
    if (promptLab.currentPrompt.trim()) {
      dispatch({ type: 'START_PROMPT_LAB_ANALYSIS' });
      send('analyzePromptLabPrompt', {
        prompt: promptLab.currentPrompt,
        regenerate: true,
      });
    }
  };

  const handleClear = () => {
    dispatch({ type: 'CLEAR_PROMPT_LAB' });
    setEditedImprovedPrompt('');
  };

  const isAnalyzingAny = promptLab.isAnalyzing || promptLab.isEnhancing || promptLab.isScoringEnhanced;

  return (
    <div className="vl-prompt-lab-view">
      {/* Header */}
      <div className="vl-prompt-lab-header">
        <div className="vl-prompt-lab-title">
          <FlaskConical size={18} />
          <span>Prompt Lab</span>
        </div>
        <p className="vl-prompt-lab-subtitle">
          Test and improve your prompts in isolation
        </p>
      </div>

      {/* Prompt Input - Always visible */}
      <div className="vl-prompt-lab-input-section">
        <textarea
          className="vl-prompt-lab-input"
          placeholder="Enter a prompt to test and improve..."
          value={promptLab.currentPrompt}
          onChange={(e) =>
            dispatch({ type: 'SET_PROMPT_LAB_PROMPT', payload: e.target.value })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              handleAnalyze();
            }
          }}
          disabled={isAnalyzingAny}
        />
        <div className="vl-prompt-lab-input-hint">
          Press Ctrl+Enter to analyze
        </div>
      </div>

      {/* Analyze Button */}
      <button
        className="vl-prompt-lab-analyze-btn"
        onClick={handleAnalyze}
        disabled={!promptLab.currentPrompt.trim() || isAnalyzingAny}
      >
        {isAnalyzingAny ? (
          <>
            <div className="spinner-small" />
            Analyzing...
          </>
        ) : (
          <>
            <Sparkles size={16} />
            Analyze and Improve
          </>
        )}
      </button>

      {/* Progressive Analysis Status */}
      {isAnalyzingAny && (
        <div className="vl-analyzing-status vl-analyzing-status-progressive">
          <div className="vl-analysis-tasks">
            {/* Scoring task */}
            <div className={`vl-task-status ${promptLab.isAnalyzing ? 'loading' : 'complete'}`}>
              {promptLab.isAnalyzing ? (
                <div className="spinner-small" />
              ) : (
                <span className="checkmark">✓</span>
              )}
              <span>{promptLab.isAnalyzing ? 'Scoring...' : 'Scored'}</span>
            </div>
            {/* Enhancing task */}
            <div className={`vl-task-status ${promptLab.isEnhancing ? 'loading' : promptLab.currentAnalysis?.improvedVersion ? 'complete' : 'pending'}`}>
              {promptLab.isEnhancing ? (
                <div className="spinner-small" />
              ) : promptLab.currentAnalysis?.improvedVersion ? (
                <span className="checkmark">✓</span>
              ) : (
                <span className="pending-dot">○</span>
              )}
              <span>{promptLab.isEnhancing ? 'Improving...' : promptLab.currentAnalysis?.improvedVersion ? 'Improved' : 'Improve'}</span>
            </div>
            {/* Scoring enhanced task */}
            <div className={`vl-task-status ${promptLab.isScoringEnhanced ? 'loading' : promptLab.currentAnalysis?.improvedScore ? 'complete' : 'pending'}`}>
              {promptLab.isScoringEnhanced ? (
                <div className="spinner-small" />
              ) : promptLab.currentAnalysis?.improvedScore ? (
                <span className="checkmark">✓</span>
              ) : (
                <span className="pending-dot">○</span>
              )}
              <span>{promptLab.isScoringEnhanced ? 'Scoring improved...' : promptLab.currentAnalysis?.improvedScore ? 'Scored improved' : 'Score improved'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {promptLab.currentAnalysis && !isAnalyzingAny && (
        <div className="vl-prompt-lab-results">
          {/* Original Score - Removed duplicate "Your Prompt" heading and text preview */}
          <div className="vl-results-section">
            <PromptScore
              score={promptLab.currentAnalysis.score}
              breakdown={promptLab.currentAnalysis.breakdown}
              explanation={promptLab.currentAnalysis.explanation}
            />
          </div>

          {/* Improved Version */}
          {promptLab.currentAnalysis.improvedVersion && (
            <div className="vl-results-section vl-improved-section">
              <div className="vl-improved-header">
                <h4>Improved Version</h4>
                {promptLab.currentAnalysis.improvedScore && (
                  <span className={`vl-improved-score ${getScoreClass(promptLab.currentAnalysis.improvedScore)}`}>
                    {promptLab.currentAnalysis.improvedScore.toFixed(1)}/10
                  </span>
                )}
              </div>
              <textarea
                className="vl-improved-prompt-textarea"
                style={{ minHeight: '200px' }}
                value={editedImprovedPrompt}
                onChange={(e) => setEditedImprovedPrompt(e.target.value)}
              />
              <div className="vl-improved-actions">
                <button
                  className="vl-action-btn vl-action-btn-primary"
                  onClick={handleCopyImproved}
                >
                  {copied ? (
                    <>✓ Copied</>
                  ) : (
                    <>
                      <Copy size={14} />
                      Copy
                    </>
                  )}
                </button>
                <button
                  className="vl-action-btn vl-action-btn-secondary"
                  onClick={handleSavePrompt}
                >
                  <Save size={14} />
                  Save
                </button>
                <button
                  className="vl-action-btn vl-action-btn-secondary"
                  onClick={handleTryAnother}
                >
                  <RefreshCw size={14} />
                  Try Another
                </button>
              </div>
            </div>
          )}

          {/* Clear button */}
          <button
            className="vl-action-btn vl-action-btn-text"
            onClick={handleClear}
          >
            Clear and start over
          </button>
        </div>
      )}
    </div>
  );
}
