import type { AppStateV2, ActionV2 } from './types-v2';

export function appReducer(state: AppStateV2, action: ActionV2): AppStateV2 {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, currentTab: action.payload };

    case 'SET_VIEW':
      return { ...state, currentView: action.payload };

    case 'SET_SUMMARY_PERIOD':
      return { ...state, summaryPeriod: action.payload };

    case 'SET_CUSTOM_DATE_RANGE':
      // Clear existing custom summary when date range changes to force re-analysis
      return { ...state, customDateRange: action.payload, customSummary: null };

    case 'SET_CLOUD_STATE':
      return { ...state, cloud: { ...state.cloud, ...action.payload, isLoading: false } };

    case 'SET_PROVIDERS':
      return { ...state, providers: action.payload };

    case 'SET_ACTIVE_PROVIDER':
      return { ...state, activeProvider: action.payload };

    // Feature model actions
    case 'SET_FEATURE_MODELS':
      return { ...state, featureModels: action.payload };

    case 'SET_AVAILABLE_FEATURE_MODELS':
      return { ...state, availableFeatureModels: action.payload };

    case 'UPDATE_FEATURE_MODEL': {
      if (!state.featureModels) return state;
      const { feature, model } = action.payload;
      const key = feature === 'scoring' ? 'promptScoring'
                : feature === 'improvement' ? 'promptImprovement'
                : feature;
      return {
        ...state,
        featureModels: {
          ...state.featureModels,
          [key]: model,
        },
      };
    }

    case 'TOGGLE_AUTO_ANALYZE':
      return { ...state, autoAnalyzeEnabled: !state.autoAnalyzeEnabled };

    case 'TOGGLE_RESPONSE_ANALYSIS':
      return { ...state, responseAnalysisEnabled: !state.responseAnalysisEnabled };

    case 'SET_RESPONSE_ANALYSIS_ENABLED':
      return { ...state, responseAnalysisEnabled: action.payload };

    case 'SET_CURRENT_PROMPT':
      return { ...state, currentPrompt: action.payload };

    case 'SET_CURRENT_ANALYSIS':
      return { ...state, currentAnalysis: action.payload };

    case 'START_ANALYSIS':
      return {
        ...state,
        isAnalyzing: true,
        isEnhancing: true,
        isScoringEnhanced: true,
        isInferringGoal: true,
        currentAnalysis: null,
        currentCoaching: null,
        inferredGoal: null,
      };

    case 'SCORE_RECEIVED':
      // Show score immediately, before enhancement is done
      return {
        ...state,
        currentAnalysis: {
          id: Date.now().toString(),
          text: state.currentPrompt,
          truncatedText: state.currentPrompt.length > 50
            ? state.currentPrompt.substring(0, 50) + '...'
            : state.currentPrompt,
          score: action.payload.score,
          timestamp: new Date(),
          categoryScores: action.payload.categoryScores,
          breakdown: action.payload.breakdown,
          explanation: action.payload.explanation,
          source: action.payload.source,
          // improvedVersion and improvedScore will come later
        },
        isAnalyzing: false, // Score is done
        isEnhancing: true,  // But enhancement is still running
      };

    case 'ENHANCED_PROMPT_READY':
      // Enhanced prompt arrived - update currentAnalysis with improvedVersion
      // Score will come separately via ENHANCED_SCORE_READY
      if (!state.currentAnalysis) return state;
      return {
        ...state,
        currentAnalysis: {
          ...state.currentAnalysis,
          improvedVersion: action.payload.improvedVersion,
        },
        isEnhancing: false, // Enhancement text is now done
      };

    case 'ENHANCED_SCORE_READY':
      // Enhanced prompt score arrived
      if (!state.currentAnalysis) return state;
      return {
        ...state,
        currentAnalysis: {
          ...state.currentAnalysis,
          improvedScore: action.payload.improvedScore,
        },
        isScoringEnhanced: false, // Enhanced scoring is done
      };

    case 'GOAL_INFERENCE_READY':
      // Goal inference completed
      return {
        ...state,
        inferredGoal: action.payload,
        isInferringGoal: false,
      };

    case 'ANALYSIS_COMPLETE':
      return {
        ...state,
        isAnalyzing: false,
        isEnhancing: false,
        isScoringEnhanced: false,
        isInferringGoal: false,
        currentAnalysis: action.payload,
        recentPrompts: [action.payload, ...state.recentPrompts].slice(0, 20),
        analyzedToday: state.analyzedToday + 1,
      };

    case 'ADD_RECENT_PROMPT':
      return {
        ...state,
        recentPrompts: [action.payload, ...state.recentPrompts].slice(0, 20),
      };

    case 'SET_RECENT_PROMPTS':
      return {
        ...state,
        recentPrompts: action.payload,
      };

    case 'SELECT_PROMPT_FROM_HISTORY':
      return {
        ...state,
        currentPrompt: action.payload.text,
        currentAnalysis: action.payload,
        isAnalyzing: false,
        isEnhancing: false,
        isScoringEnhanced: false,
        isInferringGoal: false,
      };

    case 'SET_TODAY_SUMMARY':
      return { ...state, todaySummary: action.payload };

    case 'SET_YESTERDAY_SUMMARY':
      return { ...state, yesterdaySummary: action.payload };

    case 'SET_WEEKEND_RECAP':
      return { ...state, weekendRecap: action.payload };

    case 'SET_WEEKLY_SUMMARY':
      return { ...state, weeklySummary: action.payload };

    case 'SET_MONTHLY_SUMMARY':
      return { ...state, monthlySummary: action.payload };

    case 'SET_CUSTOM_SUMMARY':
      return { ...state, customSummary: action.payload };

    case 'SET_STANDUP_SUMMARY':
      return { ...state, standupSummary: action.payload };

    case 'START_LOADING_SUMMARY':
      return {
        ...state,
        isLoadingSummary: true,
        loadingProgress: 0,
        loadingMessage: action.payload,
        summaryLoadingCancelled: false,
      };

    case 'UPDATE_LOADING_PROGRESS':
      return {
        ...state,
        loadingProgress: action.payload.progress,
        loadingMessage: action.payload.message,
      };

    case 'FINISH_LOADING_SUMMARY':
      return { ...state, isLoadingSummary: false };

    case 'CANCEL_LOADING_SUMMARY':
      return {
        ...state,
        isLoadingSummary: false,
        summaryLoadingCancelled: true,
        loadingProgress: 0,
        loadingMessage: '',
        // Preserve current tab when cancelling
        currentTab: state.currentTab,
      };

    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };

    case 'SET_FIRST_RUN': {
      // Set isFirstRun and switch from loading to appropriate view
      // - If first run: show onboarding
      // - If not first run: show main (handles both loading → main and onboarding → main)
      const nextView = action.payload
        ? 'onboarding'
        : (state.currentView === 'loading' || state.currentView === 'onboarding')
          ? 'main'
          : state.currentView;
      return {
        ...state,
        isFirstRun: action.payload,
        currentView: nextView,
      };
    }

    case 'COMPLETE_ONBOARDING':
      return { ...state, isFirstRun: false, currentView: 'main' };

    case 'SET_THEME':
      return { ...state, theme: action.payload };

    case 'INCREMENT_ANALYZED_TODAY':
      // If payload is provided, set to that value; otherwise increment by 1
      return {
        ...state,
        analyzedToday: action.payload !== undefined ? action.payload : state.analyzedToday + 1,
      };

    case 'SET_UPLOAD_HISTORY':
      return { ...state, uploadHistory: action.payload };

    case 'SET_SYNC_STATUS':
      return { ...state, syncStatus: action.payload };

    case 'UPLOAD_PROGRESS':
      // Handle upload progress (could be used for UI feedback)
      return state;

    case 'SET_EDITOR_INFO':
      return { ...state, editorInfo: action.payload };

    // Projects & Sessions (sidebar)
    case 'SET_PROJECTS':
      return { ...state, projects: action.payload };

    case 'UPDATE_SESSION_GOAL_PROGRESS': {
      const { sessionId, progress, customName } = action.payload;
      return {
        ...state,
        projects: state.projects.map(project => ({
          ...project,
          sessions: project.sessions.map(session =>
            session.id === sessionId
              ? { ...session, goalProgress: progress, ...(customName && { customName }) }
              : session
          )
        }))
      };
    }

    case 'TOGGLE_PROJECT':
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload ? { ...p, isExpanded: !p.isExpanded } : p
        ),
      };

    case 'SET_ACTIVE_SESSION':
      return { ...state, activeSessionId: action.payload };

    case 'SET_ACTIVE_SESSION_DETAILS':
      return {
        ...state,
        activeSession: action.payload.session,
        activeProject: action.payload.project,
      };

    case 'SET_CURRENT_WORKSPACE_SESSION':
      return { ...state, currentWorkspaceSessionId: action.payload };

    case 'SET_CURRENT_GOAL':
      return { ...state, currentGoal: action.payload };

    // Coaching state (Workstream D)
    case 'SET_COACHING': {
      // Store coaching per session to preserve ring values when switching sessions
      const coaching = action.payload;
      const sessionId = coaching?.sessionId || state.activeSessionId;
      const updatedCoachingBySession = sessionId && coaching
        ? { ...state.coachingBySession, [sessionId]: coaching }
        : state.coachingBySession;
      return {
        ...state,
        currentCoaching: coaching,
        coachingBySession: updatedCoachingBySession,
      };
    }

    case 'SET_COACHING_PHASE':
      return { ...state, coachingPhase: action.payload };

    case 'SET_CONTEXT_USED':
      return { ...state, contextUsed: action.payload };

    case 'SET_SESSION_CONTEXT':
      return { ...state, sessionContext: action.payload };

    case 'DISMISS_COACHING_SUGGESTION':
      if (!state.currentCoaching) return state;
      return {
        ...state,
        currentCoaching: {
          ...state.currentCoaching,
          suggestions: state.currentCoaching.suggestions.filter(
            (s) => s.id !== action.payload
          ),
        },
      };

    // Sidebar mode toggle
    case 'SET_SIDEBAR_MODE':
      return { ...state, sidebarMode: action.payload };

    // Prompt Lab actions (isolated from CoPilot)
    case 'SET_PROMPT_LAB_PROMPT':
      return {
        ...state,
        promptLab: { ...state.promptLab, currentPrompt: action.payload },
      };

    case 'START_PROMPT_LAB_ANALYSIS':
      console.log('[PromptLab] Starting analysis for prompt:', state.promptLab.currentPrompt);
      return {
        ...state,
        promptLab: {
          ...state.promptLab,
          isAnalyzing: true,
          isEnhancing: true,
          isScoringEnhanced: true,
          currentAnalysis: null,
          lastContextUsed: undefined,
        },
      };

    case 'PROMPT_LAB_SCORE_RECEIVED':
      // Score received - show immediately (same structure as auto-capture)
      console.log('[PromptLab] Score received:', action.payload);
      return {
        ...state,
        promptLab: {
          ...state.promptLab,
          isAnalyzing: false,
          currentAnalysis: {
            id: action.payload.promptId || Date.now().toString(),
            text: state.promptLab.currentPrompt,
            truncatedText: state.promptLab.currentPrompt.length > 50
              ? state.promptLab.currentPrompt.substring(0, 50) + '...'
              : state.promptLab.currentPrompt,
            score: action.payload.score,
            timestamp: new Date(),
            categoryScores: action.payload.categoryScores,
            breakdown: action.payload.breakdown,
            explanation: action.payload.explanation,
            // improvedVersion and improvedScore will come later
          },
        },
      };

    case 'PROMPT_LAB_CONTEXT_USED':
      // Context gathered - store for UI transparency
      return {
        ...state,
        promptLab: {
          ...state.promptLab,
          lastContextUsed: action.payload,
        },
      };

    case 'PROMPT_LAB_ENHANCED_READY':
      // Enhanced prompt arrived - update currentAnalysis
      console.log('[PromptLab] Enhanced version received:', action.payload);
      if (!state.promptLab.currentAnalysis) {
        console.warn('[PromptLab] Cannot add enhanced version - no current analysis!');
        return state;
      }
      return {
        ...state,
        promptLab: {
          ...state.promptLab,
          isEnhancing: false,
          currentAnalysis: {
            ...state.promptLab.currentAnalysis,
            improvedVersion: action.payload.improvedVersion,
          },
        },
      };

    case 'PROMPT_LAB_ENHANCED_SCORE_READY':
      // Enhanced score arrived
      if (!state.promptLab.currentAnalysis) return state;
      return {
        ...state,
        promptLab: {
          ...state.promptLab,
          isScoringEnhanced: false,
          currentAnalysis: {
            ...state.promptLab.currentAnalysis,
            improvedScore: action.payload.improvedScore,
          },
        },
      };

    case 'PROMPT_LAB_ANALYSIS_COMPLETE': {
      // Final analysis - handle both old format (direct) and new format (wrapped in prompt)
      const payload = action.payload;
      const analysisData = 'prompt' in payload ? payload.prompt : payload;
      return {
        ...state,
        promptLab: {
          ...state.promptLab,
          isAnalyzing: false,
          isEnhancing: false,
          isScoringEnhanced: false,
          currentAnalysis: {
            ...analysisData,
            timestamp: new Date(analysisData.timestamp),
          },
        },
      };
    }

    case 'CLEAR_PROMPT_LAB':
      return {
        ...state,
        promptLab: {
          ...state.promptLab,
          currentPrompt: '',
          isAnalyzing: false,
          isEnhancing: false,
          isScoringEnhanced: false,
          currentAnalysis: null,
          lastContextUsed: undefined,
        },
      };

    // Saved prompts library
    case 'SET_SAVED_PROMPTS':
      return {
        ...state,
        promptLab: { ...state.promptLab, savedPrompts: action.payload },
      };

    case 'ADD_SAVED_PROMPT':
      return {
        ...state,
        promptLab: {
          ...state.promptLab,
          savedPrompts: [action.payload, ...state.promptLab.savedPrompts],
        },
      };

    case 'UPDATE_SAVED_PROMPT': {
      const updatedPrompts = state.promptLab.savedPrompts.map((p) =>
        p.id === action.payload.id ? { ...p, ...action.payload.updates } : p
      );
      return {
        ...state,
        promptLab: { ...state.promptLab, savedPrompts: updatedPrompts },
      };
    }

    case 'DELETE_SAVED_PROMPT':
      return {
        ...state,
        promptLab: {
          ...state.promptLab,
          savedPrompts: state.promptLab.savedPrompts.filter(
            (p) => p.id !== action.payload
          ),
        },
      };

    case 'LOAD_SAVED_PROMPT': {
      // Prefill prompt lab with saved prompt and any stored analysis
      // so users immediately see the last score/improved version.
      const savedPrompt = action.payload;
      const truncated = savedPrompt.text.length > 50
        ? savedPrompt.text.substring(0, 50) + '...'
        : savedPrompt.text;
      const hasAnalysis =
        savedPrompt.lastScore !== undefined ||
        savedPrompt.improvedVersion !== undefined ||
        savedPrompt.improvedScore !== undefined;
      const lastTimestamp =
        savedPrompt.lastAnalyzedAt
          ? new Date(savedPrompt.lastAnalyzedAt)
          : savedPrompt.lastModifiedAt
            ? new Date(savedPrompt.lastModifiedAt)
            : new Date();

      return {
        ...state,
        promptLab: {
          ...state.promptLab,
          currentPrompt: savedPrompt.text,
          currentAnalysis: hasAnalysis
            ? {
                id: savedPrompt.id,
                text: savedPrompt.text,
                truncatedText: truncated,
                score: savedPrompt.lastScore ?? savedPrompt.improvedScore ?? 0,
                timestamp: lastTimestamp,
                improvedVersion: savedPrompt.improvedVersion,
                improvedScore: savedPrompt.improvedScore,
              }
            : null,
          isAnalyzing: false,
          isEnhancing: false,
          isScoringEnhanced: false,
        },
      };
    }

    // Session management
    case 'RENAME_SESSION': {
      const updatedProjects = state.projects.map((project) => ({
        ...project,
        sessions: project.sessions.map((session) =>
          session.id === action.payload.sessionId
            ? { ...session, customName: action.payload.customName }
            : session
        ),
      }));
      return { ...state, projects: updatedProjects };
    }

    case 'DELETE_SESSION': {
      const projectsAfterDelete = state.projects.map((project) => ({
        ...project,
        sessions: project.sessions.filter(
          (session) => session.id !== action.payload.sessionId
        ),
      }));
      // Clear active session if it was deleted
      const newActiveSessionId =
        state.activeSessionId === action.payload.sessionId
          ? null
          : state.activeSessionId;
      return {
        ...state,
        projects: projectsAfterDelete,
        activeSessionId: newActiveSessionId,
      };
    }

    default:
      return state;
  }
}
