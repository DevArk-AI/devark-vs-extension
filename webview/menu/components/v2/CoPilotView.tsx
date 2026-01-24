/**
 * CoPilotView - Main Co-Pilot Tab (V2 Redesign)
 *
 * Redesigned layout with clear visual hierarchy:
 * 1. Goal Banner (top) - Session context
 * 2. Auto-analyze Toggle - Settings
 * 3. Coach Section - Primary focus (LAST RESPONSE + NEXT STEP)
 * 4. Prompt Feedback Section - Collapsible learning section
 *
 * Key Changes:
 * - Cloud status moved to global footer (visible across all tabs)
 * - Goal banner at top for context
 * - Prompt feedback is collapsible by default
 * - Coach section has clear structure (past -> future)
 */

import { useState, useEffect } from 'react';
import { useAppV2 } from '../../AppV2';
import { send } from '../../utils/vscode';
import { CoachingSection } from './CoachingSection';
import { PromptFeedbackSection } from './PromptFeedbackSection';
import { GoalBanner } from './GoalBanner';
import { SessionContextPanel } from './SessionContextPanel';
import { SessionInfoHeader } from './SessionInfoHeader';
import type { CoachingSuggestion } from '../../state/types-v2';

export function CoPilotView() {
  const { state, dispatch, openHowScoresWork } = useAppV2();
  const [copied, setCopied] = useState(false);
  const [editedImprovedPrompt, setEditedImprovedPrompt] = useState('');

  // Sync editedImprovedPrompt when improved version arrives
  useEffect(() => {
    if (state.currentAnalysis?.improvedVersion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync derived state
      setEditedImprovedPrompt(state.currentAnalysis.improvedVersion);
    }
  }, [state.currentAnalysis?.improvedVersion]);

  const handleCopyImproved = () => {
    const promptToCopy = editedImprovedPrompt || state.currentAnalysis?.improvedVersion;
    if (promptToCopy) {
      navigator.clipboard.writeText(promptToCopy);
      send('trackImprovedPromptCopied');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleUseThis = () => {
    const promptToUse = editedImprovedPrompt || state.currentAnalysis?.improvedVersion;
    if (promptToUse) {
      send('useImprovedPrompt', {
        prompt: promptToUse,
        source: state.currentAnalysis?.source,
        sessionId: state.currentAnalysis?.sessionId
      });
      dispatch({ type: 'SET_CURRENT_PROMPT', payload: promptToUse });
    }
  };

  const handleTryAnother = () => {
    if (state.currentPrompt.trim()) {
      send('analyzePrompt', { prompt: state.currentPrompt, regenerate: true });
    }
  };

  const handleUseSuggestion = (suggestion: CoachingSuggestion) => {
    send('useCoachingSuggestion', { suggestion });
  };

  const handleDismissSuggestion = (id: string) => {
    send('dismissCoachingSuggestion', { id });
    dispatch({ type: 'DISMISS_COACHING_SUGGESTION', payload: id });
  };

  const handleGoalEdit = (newGoal: string) => {
    dispatch({ type: 'SET_CURRENT_GOAL', payload: newGoal });
    send('v2SetGoal', { goalText: newGoal });
  };

  return (
    <div className="vl-copilot-view vl-copilot-view-v2">
      {/* Scrollable content area */}
      <div className="vl-copilot-scrollable">
        {/* Level 1: Goal Banner (Context) */}
        <GoalBanner
          goal={state.currentGoal}
          onEditGoal={handleGoalEdit}
        />

        {/* Level 2: Session Info Header */}
        <SessionInfoHeader
          session={state.activeSession}
          project={state.activeProject}
        />

        {/* Progressive Analysis Status - compact inline display */}
        {(state.isAnalyzing || state.isEnhancing || state.isScoringEnhanced || state.isInferringGoal) && (
          <div className="vl-analyzing-status vl-analyzing-status-progressive">
            <div className="vl-analysis-tasks">
              <div className={`vl-task-status ${state.isAnalyzing ? 'loading' : 'complete'}`}>
                {state.isAnalyzing ? (
                  <div className="spinner-small" />
                ) : (
                  <span className="checkmark">&#10003;</span>
                )}
                <span>{state.isAnalyzing ? 'Scoring...' : 'Scored'}</span>
              </div>
              <div className={`vl-task-status ${state.isEnhancing ? 'loading' : state.currentAnalysis?.improvedVersion ? 'complete' : 'pending'}`}>
                {state.isEnhancing ? (
                  <div className="spinner-small" />
                ) : state.currentAnalysis?.improvedVersion ? (
                  <span className="checkmark">&#10003;</span>
                ) : (
                  <span className="pending-dot">&#9675;</span>
                )}
                <span>{state.isEnhancing ? 'Enhancing...' : state.currentAnalysis?.improvedVersion ? 'Enhanced' : 'Enhancing'}</span>
              </div>
              <div className={`vl-task-status ${state.isScoringEnhanced ? 'loading' : state.currentAnalysis?.improvedScore ? 'complete' : 'pending'}`}>
                {state.isScoringEnhanced ? (
                  <div className="spinner-small" />
                ) : state.currentAnalysis?.improvedScore ? (
                  <span className="checkmark">&#10003;</span>
                ) : (
                  <span className="pending-dot">&#9675;</span>
                )}
                <span>{state.isScoringEnhanced ? 'Scoring improved...' : state.currentAnalysis?.improvedScore ? 'Score ready' : 'Scoring improved'}</span>
              </div>
              {state.isInferringGoal && !state.currentGoal && (
                <div className="vl-task-status loading">
                  <div className="spinner-small" />
                  <span>Detecting goal...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Level 3: PROMPT FEEDBACK Section (Collapsible) */}
        <PromptFeedbackSection
          analysis={state.currentAnalysis}
          isAnalyzing={state.isAnalyzing}
          isEnhancing={state.isEnhancing}
          isScoringEnhanced={state.isScoringEnhanced}
          editedImprovedPrompt={editedImprovedPrompt}
          onEditImprovedPrompt={setEditedImprovedPrompt}
          onUsePrompt={handleUseThis}
          onCopy={handleCopyImproved}
          onTryAnother={handleTryAnother}
          onHowItWorks={openHowScoresWork}
          copied={copied}
        />

        {/* Session Context Panel (collapsible) - Optional */}
        {state.sessionContext && (
          <SessionContextPanel
            goal={state.currentGoal ?? undefined}
            recentTopics={state.sessionContext.topics}
            alreadyAddressed={state.sessionContext.alreadyAddressed}
            promptCount={state.sessionContext.promptCount}
          />
        )}

        {/* Level 4: COACH Section (flows with content) */}
        <div className="vl-copilot-coach-section">
          <CoachingSection
            coaching={state.currentCoaching}
            isListening={state.autoAnalyzeEnabled}
            source={state.currentAnalysis?.source}
            onUseSuggestion={handleUseSuggestion}
            onDismissSuggestion={handleDismissSuggestion}
          />
        </div>
      </div>
    </div>
  );
}
