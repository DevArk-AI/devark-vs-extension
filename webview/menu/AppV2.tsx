/**
 * App V2 - Redesigned Main Application
 *
 * New tab-based layout with CO-PILOT and SUMMARIES views
 * FOCUS. DISCOVER. GROW. SHIP.
 */

import React, { useReducer, useEffect, createContext, useContext, useState, useMemo } from 'react';
import { Settings, ChevronUp } from 'lucide-react';
import { getScoreClass, formatTimeAgo, formatDuration } from './state/types-v2';
import type { AppStateV2, ActionV2, Project, Session } from './state/types-v2';
import { initialState } from './state/initial-state';
import { appReducer } from './state/app-reducer';
import { CoPilotView } from './components/v2/CoPilotView';
import { SummariesView } from './components/v2/SummariesView';
import { AccountView } from './components/v2/AccountView';
import { OnboardingView } from './components/v2/OnboardingView';
import { SettingsView } from './components/v2/SettingsView';
import { ProviderSelectView } from './components/v2/ProviderSelectView';
import { HookSetupView } from './components/v2/HookSetupView';
import { LLMDropup } from './components/v2/LLMDropup';
import { LoadingOverlay } from './components/v2/LoadingOverlay';
import { SessionsSidebar } from './components/v2/SessionsSidebar';
import { PromptLabSidebar } from './components/v2/PromptLabSidebar';
import { CoPilotSuggestion } from './components/v2/CoPilotSuggestion';
import { HowScoresWorkModal } from './components/v2/HowScoresWorkModal';
import { PromptLabView } from './components/v2/PromptLabView';
import { CloudStatusBar, type CloudStatus } from './components/v2/CloudStatusBar';
import { NotificationToast, useNotifications } from './components/v2/NotificationToast';
import { RingsHeader } from './components/v2/RingsHeader';
import type { CoPilotSuggestionData } from './state/types-v2';
import { shouldDisplayCoaching } from './utils/coaching-validation';

// Import styles
import './styles/redesign.css';

// Re-export utilities for components that import from AppV2
export { getScoreClass, formatTimeAgo, formatDuration };

// Context
interface AppContextV2 {
  state: AppStateV2;
  dispatch: React.Dispatch<ActionV2>;
  openHowScoresWork?: () => void;
}

const AppContextV2 = createContext<AppContextV2 | undefined>(undefined);

export function useAppV2() {
  const context = useContext(AppContextV2);
  if (!context) {
    throw new Error('useAppV2 must be used within AppProviderV2');
  }
  return context;
}

// VSCode messaging
declare global {
  interface Window {
    vscode: any;
    DEVARK_LOGO_URI?: string;
    DEVARK_LOGO_WHITE_URI?: string;
    DEVARK_INITIAL_THEME?: 'light' | 'dark';
  }
}

/**
 * Get theme-aware logo URI (VIB-65)
 * Returns white logo for dark themes, regular logo for light themes
 */
function getThemeLogoUri(theme: 'light' | 'dark' | 'high-contrast'): string | undefined {
  const isLight = theme === 'light';
  return isLight
    ? window.DEVARK_LOGO_URI
    : window.DEVARK_LOGO_WHITE_URI || window.DEVARK_LOGO_URI;
}

function postMessage(type: string, data?: any) {
  if (window.vscode) {
    window.vscode.postMessage({ type, data });
  }
}

// Main App Component
export function AppV2() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [llmDropupOpen, setLlmDropupOpen] = useState(false);

  // Modal states
  const [currentSuggestion, setCurrentSuggestion] = useState<CoPilotSuggestionData | null>(null);
  const [howScoresWorkOpen, setHowScoresWorkOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);

  // Notification state (VIB-74)
  const { notifications, addNotification, dismissNotification } = useNotifications();

  // Get active provider info
  const activeProvider = state.providers.find((p) => p.id === state.activeProvider);

  // Get cloud status for footer status bar
  const getCloudStatus = (): CloudStatus => {
    if (state.cloud.isLoading) return 'loading';
    if (syncError) return 'error';
    if (isSyncing) return 'syncing';
    if (state.cloud.isConnected) return 'connected';
    return 'disconnected';
  };

  // Cloud status bar handlers
  const handleCloudConnect = () => {
    dispatch({ type: 'SET_TAB', payload: 'account' });
    postMessage('tabChanged', { tab: 'account' });
  };

  const handleOpenDashboard = () => {
    postMessage('openDashboard');
  };

  const handleSyncRetry = () => {
    setSyncError(false);
    setIsSyncing(true);
    postMessage('syncNow');
  };

  // Set initial theme from extension-injected value on mount (VIB-65)
  useEffect(() => {
    if (window.DEVARK_INITIAL_THEME) {
      dispatch({ type: 'SET_THEME', payload: window.DEVARK_INITIAL_THEME });
    }
  }, []);

  // Re-request coaching when switching back to sessions tab
  useEffect(() => {
    if (state.currentTab === 'sessions' && state.currentAnalysis?.id) {
      dispatch({ type: 'SET_COACHING_PHASE', payload: 'generating_coaching' });
      dispatch({ type: 'SET_COACHING', payload: null });
      postMessage('getCoachingForPrompt', { promptId: state.currentAnalysis.id });
    }
  }, [state.currentTab]);

  // Listen for messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      console.log('[AppV2] Received message:', message.type, message.data);

      switch (message.type) {
        case 'providersUpdate':
          dispatch({ type: 'SET_PROVIDERS', payload: message.data.providers });
          if (message.data.active) {
            dispatch({ type: 'SET_ACTIVE_PROVIDER', payload: message.data.active });
          }
          break;

        case 'featureModelsUpdate':
          dispatch({ type: 'SET_FEATURE_MODELS', payload: message.data?.config || null });
          break;

        case 'availableModelsForFeature':
          dispatch({ type: 'SET_AVAILABLE_FEATURE_MODELS', payload: message.data?.models || [] });
          break;

        case 'promptHistoryLoaded':
          // Load persisted history on init
          if (message.data.history && Array.isArray(message.data.history)) {
            message.data.history.forEach((prompt: any) => {
              dispatch({
                type: 'ADD_RECENT_PROMPT',
                payload: {
                  ...prompt,
                  timestamp: new Date(prompt.timestamp),
                },
              });
            });
          }
          // Update today's stats
          if (message.data.analyzedToday !== undefined) {
            dispatch({
              type: 'INCREMENT_ANALYZED_TODAY',
              payload: message.data.analyzedToday,
            });
          }
          break;

        case 'scoreReceived':
          // Score arrived - show it immediately (enhancement still running)
          dispatch({
            type: 'SCORE_RECEIVED',
            payload: message.data,
          });
          break;

        case 'analysisComplete':
          // Handle both old and new message format
          const promptData = message.data.prompt || message.data;
          dispatch({
            type: 'ANALYSIS_COMPLETE',
            payload: {
              ...promptData,
              timestamp: new Date(promptData.timestamp),
            },
          });
          // Coaching will be pushed by CoPilotCoordinator when Stop hook fires
          break;

        case 'enhancedPromptReady':
          // Enhanced prompt text arrived (score comes separately)
          console.log('[AppV2] Enhanced prompt ready:', message.data);
          dispatch({
            type: 'ENHANCED_PROMPT_READY',
            payload: {
              promptId: message.data.promptId,
              improvedVersion: message.data.improvedVersion,
            },
          });
          break;

        case 'enhancedScoreReady':
          // Enhanced prompt score arrived
          console.log('[AppV2] Enhanced score ready:', message.data);
          dispatch({
            type: 'ENHANCED_SCORE_READY',
            payload: {
              promptId: message.data.promptId,
              improvedScore: message.data.improvedScore,
            },
          });
          break;

        case 'cloudStatus':
          dispatch({ type: 'SET_CLOUD_STATE', payload: message.data });
          // View switch handled by separate useEffect to avoid stale closure
          break;

        case 'summaryData':
          // Don't update if loading was cancelled
          if (!state.summaryLoadingCancelled) {
            if (message.data.type === 'standup') {
              dispatch({ type: 'SET_STANDUP_SUMMARY', payload: message.data.summary });
            } else if (message.data.type === 'today') {
              dispatch({ type: 'SET_TODAY_SUMMARY', payload: message.data.summary });
            } else if (message.data.type === 'yesterday') {
              dispatch({ type: 'SET_YESTERDAY_SUMMARY', payload: message.data.summary });
            } else if (message.data.type === 'weekend') {
              dispatch({ type: 'SET_WEEKEND_RECAP', payload: message.data.summaries });
            } else if (message.data.type === 'week') {
              dispatch({ type: 'SET_WEEKLY_SUMMARY', payload: message.data.summary });
            } else if (message.data.type === 'month') {
              dispatch({ type: 'SET_MONTHLY_SUMMARY', payload: message.data.summary });
            } else if (message.data.type === 'custom') {
              dispatch({ type: 'SET_CUSTOM_SUMMARY', payload: message.data.summary });
            }
            dispatch({ type: 'FINISH_LOADING_SUMMARY' });
          }
          break;

        case 'loadingProgress':
          dispatch({
            type: 'UPDATE_LOADING_PROGRESS',
            payload: { progress: message.data.progress, message: message.data.message },
          });
          break;

        case 'configLoaded':
          console.log('[AppV2] configLoaded - isFirstRun:', message.data.isFirstRun);
          // Always set isFirstRun state and let reducer handle view
          dispatch({ type: 'SET_FIRST_RUN', payload: message.data.isFirstRun });
          break;

        case 'onboardingComplete':
          // Extension confirmed onboarding is complete - switch to main view
          dispatch({ type: 'COMPLETE_ONBOARDING' });
          break;

        case 'themeChanged':
          dispatch({ type: 'SET_THEME', payload: message.data.theme });
          break;

        case 'uploadHistory':
          dispatch({ type: 'SET_UPLOAD_HISTORY', payload: message.data });
          break;

        case 'syncStatus':
          dispatch({ type: 'SET_SYNC_STATUS', payload: message.data });
          break;

        case 'syncStart':
          setIsSyncing(true);
          setSyncError(false);
          break;

        case 'syncComplete':
          setIsSyncing(false);
          setSyncError(false);
          break;

        case 'syncError':
          setIsSyncing(false);
          setSyncError(true);
          break;

        case 'uploadProgress':
          dispatch({ type: 'UPLOAD_PROGRESS', payload: message.data });
          break;

        case 'editorInfo':
          dispatch({ type: 'SET_EDITOR_INFO', payload: message.data });
          break;

        // V2 Message handlers (Stream A/B integration)
        case 'v2ActiveSession':
          // Active session info from SessionManagerService
          if (message.data.sessionId) {
            dispatch({ type: 'SET_ACTIVE_SESSION', payload: message.data.sessionId });
            // Also set as the workspace session (always shown in ActiveSessionSwitcher)
            dispatch({ type: 'SET_CURRENT_WORKSPACE_SESSION', payload: message.data.sessionId });
          }
          // Store full session and project objects for detail display
          dispatch({
            type: 'SET_ACTIVE_SESSION_DETAILS',
            payload: {
              session: message.data.session ? {
                ...message.data.session,
                startTime: new Date(message.data.session.startTime),
                lastActivityTime: new Date(message.data.session.lastActivityTime),
              } : null,
              project: message.data.project || null,
            },
          });
          // Always update goal (clear if new session has no goal)
          dispatch({ type: 'SET_CURRENT_GOAL', payload: message.data.goal || null });
          break;

        case 'v2SessionList':
          // Session list from SessionManagerService - transform to projects
          // Message data arrives with ISO date strings that need conversion to Date objects
          if (message.data.projects && Array.isArray(message.data.projects)) {
            interface SerializedSession extends Omit<Session, 'startTime' | 'lastActivityTime'> {
              startTime: string;
              lastActivityTime: string;
            }
            interface SerializedProject extends Omit<Project, 'sessions'> {
              sessions: SerializedSession[];
            }
            const projects: Project[] = (message.data.projects as SerializedProject[]).map((p) => ({
              ...p,
              sessions: p.sessions?.map((s) => ({
                ...s,
                startTime: new Date(s.startTime),
                lastActivityTime: new Date(s.lastActivityTime),
              })) || []
            }));
            dispatch({ type: 'SET_PROJECTS', payload: projects });
          }
          break;

        case 'v2GoalProgressAnalysis':
          if (message.data.success && message.data.sessionId) {
            dispatch({
              type: 'UPDATE_SESSION_GOAL_PROGRESS',
              payload: {
                sessionId: message.data.sessionId,
                progress: message.data.progress ?? 0,
                customName: message.data.sessionTitle
              }
            });
            // Auto-update goal in UI if inferred (goal is auto-set by GoalService)
            if (message.data.inferredGoal) {
              dispatch({ type: 'SET_CURRENT_GOAL', payload: message.data.inferredGoal });
            }
          }
          break;

        case 'v2DailyStats':
          // Daily stats update from DailyStatsService
          if (message.data) {
            // Update analyzedToday from stats
            if (message.data.promptCount !== undefined) {
              dispatch({ type: 'INCREMENT_ANALYZED_TODAY', payload: message.data.promptCount });
            }
          }
          break;

        case 'v2GoalStatus':
          // Goal status from GoalService
          if (message.data.goal !== undefined) {
            dispatch({ type: 'SET_CURRENT_GOAL', payload: message.data.goal });
          }
          break;

        case 'v2Suggestion':
          // Co-pilot suggestion from SuggestionEngine
          console.log('[AppV2] Suggestion:', message.data);
          if (message.data) {
            setCurrentSuggestion({
              id: message.data.id || `suggestion-${Date.now()}`,
              type: message.data.type,
              title: message.data.title || 'Co-Pilot Suggestion',
              content: message.data.content || message.data.message,
              actionLabel: message.data.actionLabel || 'Apply',
              dismissible: message.data.dismissible !== false,
              timestamp: new Date(),
            });
          }
          break;

        case 'v2Prompts':
          // Prompts from session (replaces list when switching sessions)
          if (message.data.prompts && Array.isArray(message.data.prompts)) {
            const prompts = message.data.prompts.map((prompt: any) => ({
              ...prompt,
              timestamp: new Date(prompt.timestamp),
            }));
            dispatch({ type: 'SET_RECENT_PROMPTS', payload: prompts });
          }
          break;

        case 'v2PromptAutoSelected':
          // Auto-select prompt when switching sessions (displays in main view)
          if (message.data.prompt) {
            dispatch({
              type: 'SELECT_PROMPT_FROM_HISTORY',
              payload: {
                ...message.data.prompt,
                timestamp: new Date(message.data.prompt.timestamp),
              },
            });
            // Request coaching for the auto-selected prompt
            // (extension also sends coaching, but this ensures consistency)
            dispatch({ type: 'SET_COACHING_PHASE', payload: 'generating_coaching' });
            dispatch({ type: 'SET_COACHING', payload: null });
            postMessage('getCoachingForPrompt', { promptId: message.data.prompt.id });
          } else {
            // No prompts in session - clear the main view
            dispatch({ type: 'SET_CURRENT_PROMPT', payload: '' });
            dispatch({ type: 'SET_CURRENT_ANALYSIS', payload: null });
            dispatch({ type: 'SET_COACHING', payload: null });
          }
          break;

        case 'v2PromptHistory':
          // Prompt history from session (legacy - appends to list)
          if (message.data.prompts && Array.isArray(message.data.prompts)) {
            message.data.prompts.forEach((prompt: any) => {
              dispatch({
                type: 'ADD_RECENT_PROMPT',
                payload: {
                  ...prompt,
                  timestamp: new Date(prompt.timestamp),
                },
              });
            });
          }
          break;

        // Hook-based prompt capture messages
        case 'newPromptsDetected':
          // A new prompt was captured from Cursor via hooks
          if (message.data.prompts && message.data.prompts.length > 0) {
            const capturedPrompt = message.data.prompts[0]; // Take the first (most recent)
            console.log('[AppV2] Captured prompt from Cursor:', capturedPrompt.text?.substring(0, 50) + '...');

            // Set the captured prompt in the input field and start analysis
            dispatch({ type: 'SET_CURRENT_PROMPT', payload: capturedPrompt.text });
            dispatch({ type: 'START_ANALYSIS' });

            // The extension will send analysisComplete when done
          }
          break;

        case 'promptAnalyzing':
          // A prompt is being analyzed (update UI state)
          if (message.data.text) {
            dispatch({ type: 'SET_CURRENT_PROMPT', payload: message.data.text });
            dispatch({ type: 'START_ANALYSIS' });
          }
          break;

        case 'analysisFailed':
          // Analysis failed - stop analyzing state but keep the prompt
          console.log('[AppV2] Analysis failed:', message.data.error);
          // Reset analyzing state without clearing the prompt
          dispatch({
            type: 'ANALYSIS_COMPLETE',
            payload: {
              id: `failed-${Date.now()}`,
              text: state.currentPrompt,
              truncatedText: state.currentPrompt.substring(0, 100),
              score: 0,
              timestamp: new Date(),
              quickWins: ['Analysis failed - try again'],
            },
          });
          break;

        // Coaching handlers (Workstream D: Response Capture & Coaching)
        case 'coachingUpdated':
          console.log('[AppV2] coachingUpdated received:', {
            hasData: !!message.data,
            hasCoaching: !!message.data?.coaching,
            suggestions: message.data?.coaching?.suggestions?.length ?? 0,
            coachingPromptId: message.data?.coaching?.promptId,
            activeSessionId: state.activeSession?.id,
          });
          if (message.data?.coaching) {
            // Validate coaching belongs to the active session (VIB-35)
            if (shouldDisplayCoaching(message.data.coaching, state.activeSession)) {
              console.log('[AppV2] Dispatching SET_COACHING with', message.data.coaching.suggestions?.length, 'suggestions');
              dispatch({
                type: 'SET_COACHING',
                payload: {
                  ...message.data.coaching,
                  timestamp: new Date(message.data.coaching.timestamp),
                },
              });
            } else {
              console.log('[AppV2] Coaching from different session, ignoring. CoachingPromptId:',
                message.data.coaching.promptId, 'ActiveSession:', state.activeSession?.id);
            }
          } else {
            console.log('[AppV2] No coaching data, clearing coaching state');
            dispatch({ type: 'SET_COACHING', payload: null });
          }
          dispatch({ type: 'SET_COACHING_PHASE', payload: 'idle' });
          break;

        case 'coachingStatus':
          console.log('[AppV2] Coaching status:', message.data);
          if (message.data?.coaching) {
            dispatch({
              type: 'SET_COACHING',
              payload: {
                ...message.data.coaching,
                timestamp: new Date(message.data.coaching.timestamp),
              },
            });
          }
          break;

        case 'finalResponseDetected':
          // Stop hook fired and we have the final response metadata; show intermediate state
          dispatch({ type: 'SET_COACHING_PHASE', payload: 'analyzing_response' });
          dispatch({ type: 'SET_COACHING', payload: null });
          break;

        case 'responseDetected':
          console.log('[AppV2] Response detected:', message.data);
          // Optional: Could show toast or update UI
          break;

        case 'responseAnalysisStatus':
          dispatch({ type: 'SET_RESPONSE_ANALYSIS_ENABLED', payload: message.data.enabled });
          break;

        // ========================================
        // PROMPT LAB MESSAGE HANDLERS
        // ========================================
        case 'promptLabScoreReceived':
          dispatch({
            type: 'PROMPT_LAB_SCORE_RECEIVED',
            payload: message.data,
          });
          break;

        case 'promptLabContextUsed':
          dispatch({
            type: 'PROMPT_LAB_CONTEXT_USED',
            payload: message.data,
          });
          break;

        case 'promptLabEnhancedReady':
          dispatch({
            type: 'PROMPT_LAB_ENHANCED_READY',
            payload: message.data,
          });
          break;

        case 'promptLabEnhancedScoreReady':
          dispatch({
            type: 'PROMPT_LAB_ENHANCED_SCORE_READY',
            payload: message.data,
          });
          break;

        case 'promptLabAnalysisComplete':
          dispatch({
            type: 'PROMPT_LAB_ANALYSIS_COMPLETE',
            payload: message.data,
          });
          break;

        case 'savedPromptsLoaded':
          dispatch({
            type: 'SET_SAVED_PROMPTS',
            payload: message.data.prompts || [],
          });
          break;

        case 'sessionRenamed':
          dispatch({
            type: 'RENAME_SESSION',
            payload: message.data,
          });
          break;

        case 'sessionDeleted':
          dispatch({
            type: 'DELETE_SESSION',
            payload: message.data,
          });
          break;

        // ========================================
        // NOTIFICATION HANDLERS (VIB-74)
        // ========================================
        case 'notification':
          if (message.data?.message) {
            addNotification(
              message.data.level || 'info',
              message.data.message,
              message.data.action
            );
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // Request initial data
    postMessage('getProviders');
    postMessage('getFeatureModels'); // Get feature-specific model settings
    postMessage('getAvailableModelsForFeature'); // Get available models for dropdowns
    postMessage('getCloudStatus');
    postMessage('getConfig');
    postMessage('getEditorInfo'); // Get editor info (Cursor vs VS Code)
    postMessage('tabChanged', { tab: 'reports' }); // Notify initial tab (reports is default)

    // Request V2 data (Stream A/B integration)
    postMessage('v2GetActiveSession'); // Get active session info
    postMessage('v2GetSessionList', { limit: 20 }); // Get recent sessions
    postMessage('v2GetDailyStats'); // Get today's stats
    postMessage('v2GetGoalStatus'); // Get current goal

    // Request coaching status (Workstream D)
    postMessage('getCoachingStatus'); // Get current coaching if any
    postMessage('getResponseAnalysisStatus'); // Get response analysis toggle status

    // Request Prompt Lab data
    postMessage('getSavedPrompts'); // Load saved prompts for Prompt Lab

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Render current view
  const renderView = () => {
    // Only show loading overlay when on reports tab
    if (state.isLoadingSummary && state.currentTab === 'reports') {
      return (
        <LoadingOverlay
          progress={state.loadingProgress}
          message={state.loadingMessage}
          theme={state.theme}
          onCancel={() => {
            dispatch({ type: 'CANCEL_LOADING_SUMMARY' });
            postMessage('cancelLoading');
          }}
        />
      );
    }

    switch (state.currentView) {
      case 'loading': {
        // Show minimal loading state while waiting for config
        // Use initial theme from injection since state.theme may not be set yet (VIB-65)
        const loadingTheme = state.theme || window.DEVARK_INITIAL_THEME || 'dark';
        const loadingLogoUri = getThemeLogoUri(loadingTheme);
        return (
          <div className="vl-loading-overlay">
            <div className="vl-heartbeat-logo">
              {loadingLogoUri ? (
                <img
                  src={loadingLogoUri}
                  alt="Loading"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <div
                  className="vl-logo-fallback"
                  style={{ width: '100%', height: '100%', fontSize: '20px', borderRadius: '16px' }}
                >
                  VL
                </div>
              )}
            </div>
          </div>
        );
      }
      case 'onboarding':
        return <OnboardingView />;
      case 'settings':
        return <SettingsView onClose={() => dispatch({ type: 'SET_VIEW', payload: 'main' })} />;
      case 'provider-select':
        return (
          <ProviderSelectView onClose={() => dispatch({ type: 'SET_VIEW', payload: 'main' })} />
        );
      case 'hook-setup':
        return <HookSetupView onClose={() => dispatch({ type: 'SET_VIEW', payload: 'main' })} />;
      default:
        // Render tab content based on currentTab
        switch (state.currentTab) {
          case 'sessions':
            // Show PromptLabView when sidebar is in prompt-lab mode
            return state.sidebarMode === 'prompt-lab' ? <PromptLabView /> : <CoPilotView />;
          case 'reports':
            return <SummariesView />;
          case 'prompts':
            return <PromptLabView />;
          case 'account':
            return <AccountView />;
          default:
            return <CoPilotView />;
        }
    }
  };

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    state,
    dispatch,
    openHowScoresWork: () => setHowScoresWorkOpen(true),
  }), [state, dispatch]);

  return (
    <AppContextV2.Provider value={contextValue}>
      <div className="vl-app">
        {/* Header - always visible except onboarding */}
        {state.currentView !== 'onboarding' && (
          <header className="vl-header">
            <div className="vl-logo-container">
              {getThemeLogoUri(state.theme) ? (
                <img src={getThemeLogoUri(state.theme)} alt="DevArk" className="vl-logo" />
              ) : (
                <div className="vl-logo-fallback">VL</div>
              )}
              <span className="vl-header-title">DEVARK</span>
            </div>
            <button
              className="vl-settings-btn"
              onClick={() => dispatch({ type: 'SET_VIEW', payload: 'settings' })}
              aria-label="Settings"
            >
              <Settings size={16} />
            </button>
          </header>
        )}

        {/* Rings Header - cockpit style session rings (Phase 2) */}
        {state.currentView === 'main' && (
          <RingsHeader
            projects={state.projects}
            activeSessionId={state.activeSessionId}
            coaching={state.currentCoaching}
            coachingBySession={state.coachingBySession}
            theme={state.theme}
            onSessionSelect={(sessionId) => {
              dispatch({ type: 'SET_ACTIVE_SESSION', payload: sessionId });
              postMessage('markSessionAsRead', { sessionId });
              postMessage('switchSession', { sessionId });
            }}
            onNavigateToCopilot={() => {
              dispatch({ type: 'SET_TAB', payload: 'sessions' });
              postMessage('tabChanged', { tab: 'sessions' });
            }}
          />
        )}

        {/* Tabs - only on main view */}
        {state.currentView === 'main' && (
          <nav className="vl-tabs">
            <button
              className={`vl-tab ${state.currentTab === 'sessions' ? 'active' : ''}`}
              onClick={() => {
                dispatch({ type: 'SET_TAB', payload: 'sessions' });
                postMessage('tabChanged', { tab: 'sessions' });
              }}
            >
              Sessions
            </button>
            <button
              className={`vl-tab ${state.currentTab === 'reports' ? 'active' : ''}`}
              onClick={() => {
                dispatch({ type: 'SET_TAB', payload: 'reports' });
                postMessage('tabChanged', { tab: 'reports' });
              }}
            >
              Reports
            </button>
            <button
              className={`vl-tab ${state.currentTab === 'prompts' ? 'active' : ''}`}
              onClick={() => {
                dispatch({ type: 'SET_TAB', payload: 'prompts' });
                postMessage('tabChanged', { tab: 'prompts' });
              }}
            >
              Prompts
            </button>
            <button
              className={`vl-tab ${state.currentTab === 'account' ? 'active' : ''}`}
              onClick={() => {
                dispatch({ type: 'SET_TAB', payload: 'account' });
                postMessage('tabChanged', { tab: 'account' });
              }}
            >
              Account
            </button>

            {/* Today summary - right side of tabs */}
            {state.todaySummary && (
              <div className="vl-today-summary">
                <span className="vl-today-summary-text">
                  Today: {formatDuration(state.todaySummary.timeCoding)}, avg {state.todaySummary.avgScore.toFixed(1)}/10
                </span>
                <span
                  className="vl-today-summary-link"
                  onClick={() => {
                    dispatch({ type: 'SET_SUMMARY_PERIOD', payload: 'today' });
                    dispatch({ type: 'SET_TAB', payload: 'reports' });
                    postMessage('tabChanged', { tab: 'reports' });
                  }}
                >
                  View
                </span>
              </div>
            )}
          </nav>
        )}

        {/* Main Content - with sidebar for sessions and prompts tabs */}
        {state.currentView === 'main' && state.currentTab === 'sessions' ? (
          <div className="vl-sessions-layout">
            <div className="vl-sessions-layout__sidebar">
              <SessionsSidebar
                projects={state.projects}
                activeSessionId={state.activeSessionId}
                coaching={state.currentCoaching}
                coachingBySession={state.coachingBySession}
                theme={state.theme}
                onSessionSelect={(sessionId) => {
                  dispatch({ type: 'SET_ACTIVE_SESSION', payload: sessionId });
                  postMessage('markSessionAsRead', { sessionId });
                  postMessage('switchSession', { sessionId });
                }}
              />
            </div>
            <div className="vl-sessions-layout__content">
              <main className="vl-content">{renderView()}</main>
            </div>
          </div>
        ) : state.currentView === 'main' && state.currentTab === 'prompts' ? (
          <div className="vl-sessions-layout">
            <div className="vl-sessions-layout__sidebar">
              <PromptLabSidebar
                savedPrompts={state.promptLab.savedPrompts}
                onSavedPromptSelect={(prompt) => {
                  dispatch({ type: 'LOAD_SAVED_PROMPT', payload: prompt });
                }}
                onSavedPromptDelete={(promptId) => {
                  dispatch({ type: 'DELETE_SAVED_PROMPT', payload: promptId });
                  postMessage('deletePromptFromLibrary', { promptId });
                }}
                onSavedPromptRename={(promptId, newName) => {
                  dispatch({ type: 'UPDATE_SAVED_PROMPT', payload: { id: promptId, updates: { name: newName } } });
                  postMessage('updatePromptInLibrary', { promptId, updates: { name: newName } });
                }}
              />
            </div>
            <div className="vl-sessions-layout__content">
              <main className="vl-content">{renderView()}</main>
            </div>
          </div>
        ) : (
          <main className="vl-content">{renderView()}</main>
        )}

        {/* Footer with LLM Selector - only on main view */}
        {state.currentView === 'main' && (
          <footer className="vl-footer">
            <div className="vl-llm-selector">
              <button
                className="vl-llm-trigger"
                onClick={() => {
                  if (!llmDropupOpen) {
                    postMessage('trackLlmSelectorOpenedFooter');
                  }
                  setLlmDropupOpen(!llmDropupOpen);
                }}
              >
                <span
                  className={`vl-llm-status ${activeProvider?.status === 'connected' ? '' : 'disconnected'}`}
                >
                  {activeProvider?.status === 'connected' ? '✓' : '✕'}
                </span>
                <span className="vl-llm-label">LLM:</span>
                <span className="vl-llm-name">{activeProvider?.name || 'Not configured'}</span>
                <ChevronUp size={12} style={{ transform: llmDropupOpen ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
              </button>

              {llmDropupOpen && (
                <LLMDropup
                  providers={state.providers}
                  activeProvider={state.activeProvider}
                  onSelect={(id) => {
                    dispatch({ type: 'SET_ACTIVE_PROVIDER', payload: id });
                    postMessage('switchProvider', { providerId: id });
                    setLlmDropupOpen(false);
                  }}
                  onConfigure={() => {
                    dispatch({ type: 'SET_VIEW', payload: 'provider-select' });
                    setLlmDropupOpen(false);
                  }}
                  onClose={() => setLlmDropupOpen(false)}
                />
              )}
            </div>

            {/* Cloud Status - visible across all tabs */}
            <CloudStatusBar
              status={getCloudStatus()}
              username={state.cloud.username}
              onConnect={handleCloudConnect}
              onOpenDashboard={handleOpenDashboard}
              onRetry={handleSyncRetry}
            />
          </footer>
        )}

        {/* Co-Pilot Suggestion (floating) */}
        {currentSuggestion && (
          <div className="vl-suggestion-container">
            <CoPilotSuggestion
              suggestion={currentSuggestion}
              onAddToPrompt={() => {
                postMessage('v2ApplySuggestion', { id: currentSuggestion.id });
                setCurrentSuggestion(null);
              }}
              onNotNow={() => {
                postMessage('v2NotNowSuggestion', { id: currentSuggestion.id });
                setCurrentSuggestion(null);
              }}
              onDismiss={() => {
                postMessage('v2DismissSuggestion', { id: currentSuggestion.id });
                setCurrentSuggestion(null);
              }}
            />
          </div>
        )}

        {/* How Scores Work Modal */}
        <HowScoresWorkModal
          isOpen={howScoresWorkOpen}
          onClose={() => setHowScoresWorkOpen(false)}
        />

        {/* Notification Toast (VIB-74) */}
        <NotificationToast
          notifications={notifications}
          onDismiss={dismissNotification}
          onAction={(command) => postMessage('openExternal', { url: command })}
        />
      </div>
    </AppContextV2.Provider>
  );
}

export default AppV2;
