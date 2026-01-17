import { describe, it, expect } from 'vitest';
import { appReducer } from './app-reducer';
import { initialState } from './initial-state';
import type { AppStateV2 } from './types-v2';

describe('appReducer', () => {
  describe('SET_TAB', () => {
    it('should change current tab', () => {
      const result = appReducer(initialState, {
        type: 'SET_TAB',
        payload: 'reports',
      });
      expect(result.currentTab).toBe('reports');
    });

    it('should preserve other state', () => {
      const result = appReducer(initialState, {
        type: 'SET_TAB',
        payload: 'account',
      });
      expect(result.currentView).toBe(initialState.currentView);
      expect(result.providers).toBe(initialState.providers);
    });
  });

  describe('SCORE_RECEIVED', () => {
    it('should update currentAnalysis with score and stop analyzing', () => {
      const stateWithPrompt: AppStateV2 = {
        ...initialState,
        currentPrompt: 'Help me write a test',
        isAnalyzing: true,
        isEnhancing: true,
      };

      const result = appReducer(stateWithPrompt, {
        type: 'SCORE_RECEIVED',
        payload: {
          score: 85,
          categoryScores: { specificity: 8, context: 9 },
          breakdown: { specificity: { score: 8, weight: 0.2 } },
          explanation: 'Good prompt',
        },
      });

      expect(result.isAnalyzing).toBe(false);
      expect(result.isEnhancing).toBe(true); // Still enhancing
      expect(result.currentAnalysis?.score).toBe(85);
      expect(result.currentAnalysis?.text).toBe('Help me write a test');
    });

    it('should truncate long prompts in truncatedText', () => {
      const longPrompt = 'A'.repeat(100);
      const stateWithLongPrompt: AppStateV2 = {
        ...initialState,
        currentPrompt: longPrompt,
        isAnalyzing: true,
      };

      const result = appReducer(stateWithLongPrompt, {
        type: 'SCORE_RECEIVED',
        payload: { score: 70 },
      });

      expect(result.currentAnalysis?.truncatedText).toBe('A'.repeat(50) + '...');
    });

    it('should preserve source in currentAnalysis', () => {
      const stateWithPrompt: AppStateV2 = {
        ...initialState,
        currentPrompt: 'Test prompt',
        isAnalyzing: true,
      };

      const result = appReducer(stateWithPrompt, {
        type: 'SCORE_RECEIVED',
        payload: { score: 85, source: 'claude_code' },
      });

      expect(result.currentAnalysis?.source).toBe('claude_code');
    });
  });

  describe('ANALYSIS_COMPLETE', () => {
    it('should add to recentPrompts and cap at 20', () => {
      const stateWith20Prompts: AppStateV2 = {
        ...initialState,
        recentPrompts: Array(20).fill(null).map((_, i) => ({
          id: `old-${i}`,
          text: `old prompt ${i}`,
          truncatedText: `old prompt ${i}`,
          score: 50,
          timestamp: new Date(),
        })),
      };

      const newPrompt = {
        id: 'new',
        text: 'new prompt',
        truncatedText: 'new prompt',
        score: 90,
        timestamp: new Date(),
      };

      const result = appReducer(stateWith20Prompts, {
        type: 'ANALYSIS_COMPLETE',
        payload: newPrompt,
      });

      expect(result.recentPrompts).toHaveLength(20);
      expect(result.recentPrompts[0].id).toBe('new'); // Most recent first
      expect(result.recentPrompts[19].id).toBe('old-18'); // Oldest dropped
    });

    it('should increment analyzedToday', () => {
      const result = appReducer(initialState, {
        type: 'ANALYSIS_COMPLETE',
        payload: {
          id: 'test',
          text: 'test',
          truncatedText: 'test',
          score: 80,
          timestamp: new Date(),
        },
      });

      expect(result.analyzedToday).toBe(1);
    });

    it('should reset all loading flags', () => {
      const loadingState: AppStateV2 = {
        ...initialState,
        isAnalyzing: true,
        isEnhancing: true,
        isScoringEnhanced: true,
        isInferringGoal: true,
      };

      const result = appReducer(loadingState, {
        type: 'ANALYSIS_COMPLETE',
        payload: {
          id: 'test',
          text: 'test',
          truncatedText: 'test',
          score: 80,
          timestamp: new Date(),
        },
      });

      expect(result.isAnalyzing).toBe(false);
      expect(result.isEnhancing).toBe(false);
      expect(result.isScoringEnhanced).toBe(false);
      expect(result.isInferringGoal).toBe(false);
    });
  });

  describe('CANCEL_LOADING_SUMMARY', () => {
    it('should preserve currentTab when cancelling', () => {
      const stateOnReports: AppStateV2 = {
        ...initialState,
        currentTab: 'reports',
        isLoadingSummary: true,
        loadingProgress: 50,
      };

      const result = appReducer(stateOnReports, {
        type: 'CANCEL_LOADING_SUMMARY',
      });

      expect(result.currentTab).toBe('reports');
      expect(result.isLoadingSummary).toBe(false);
      expect(result.summaryLoadingCancelled).toBe(true);
      expect(result.loadingProgress).toBe(0);
    });
  });

  describe('DELETE_SESSION', () => {
    it('should clear activeSessionId if deleted session was active', () => {
      const stateWithSession: AppStateV2 = {
        ...initialState,
        activeSessionId: 'session-to-delete',
        projects: [
          {
            id: 'proj-1',
            name: 'Project 1',
            path: '/path',
            isExpanded: true,
            sessions: [
              { id: 'session-to-delete', startTime: new Date(), lastActivityTime: new Date() },
              { id: 'other-session', startTime: new Date(), lastActivityTime: new Date() },
            ],
          },
        ],
      };

      const result = appReducer(stateWithSession, {
        type: 'DELETE_SESSION',
        payload: { sessionId: 'session-to-delete' },
      });

      expect(result.activeSessionId).toBeNull();
      expect(result.projects[0].sessions).toHaveLength(1);
      expect(result.projects[0].sessions[0].id).toBe('other-session');
    });

    it('should preserve activeSessionId if different session was deleted', () => {
      const stateWithSession: AppStateV2 = {
        ...initialState,
        activeSessionId: 'active-session',
        projects: [
          {
            id: 'proj-1',
            name: 'Project 1',
            path: '/path',
            isExpanded: true,
            sessions: [
              { id: 'active-session', startTime: new Date(), lastActivityTime: new Date() },
              { id: 'other-session', startTime: new Date(), lastActivityTime: new Date() },
            ],
          },
        ],
      };

      const result = appReducer(stateWithSession, {
        type: 'DELETE_SESSION',
        payload: { sessionId: 'other-session' },
      });

      expect(result.activeSessionId).toBe('active-session');
    });
  });

  describe('LOAD_SAVED_PROMPT', () => {
    it('should restore analysis from saved prompt with score', () => {
      const savedPrompt = {
        id: 'saved-1',
        text: 'My saved prompt text',
        name: 'Saved Prompt',
        lastScore: 85,
        improvedVersion: 'Improved version',
        improvedScore: 92,
        lastAnalyzedAt: new Date('2024-01-15'),
      };

      const result = appReducer(initialState, {
        type: 'LOAD_SAVED_PROMPT',
        payload: savedPrompt,
      });

      expect(result.promptLab.currentPrompt).toBe('My saved prompt text');
      expect(result.promptLab.currentAnalysis).not.toBeNull();
      expect(result.promptLab.currentAnalysis?.score).toBe(85);
      expect(result.promptLab.currentAnalysis?.improvedVersion).toBe('Improved version');
      expect(result.promptLab.currentAnalysis?.improvedScore).toBe(92);
    });

    it('should set null analysis when no previous analysis exists', () => {
      const savedPromptNoAnalysis = {
        id: 'saved-2',
        text: 'Prompt without analysis',
        name: 'New Prompt',
      };

      const result = appReducer(initialState, {
        type: 'LOAD_SAVED_PROMPT',
        payload: savedPromptNoAnalysis,
      });

      expect(result.promptLab.currentPrompt).toBe('Prompt without analysis');
      expect(result.promptLab.currentAnalysis).toBeNull();
    });

    it('should reset loading states when loading saved prompt', () => {
      const loadingState: AppStateV2 = {
        ...initialState,
        promptLab: {
          ...initialState.promptLab,
          isAnalyzing: true,
          isEnhancing: true,
          isScoringEnhanced: true,
        },
      };

      const result = appReducer(loadingState, {
        type: 'LOAD_SAVED_PROMPT',
        payload: { id: 'x', text: 'test', name: 'test' },
      });

      expect(result.promptLab.isAnalyzing).toBe(false);
      expect(result.promptLab.isEnhancing).toBe(false);
      expect(result.promptLab.isScoringEnhanced).toBe(false);
    });
  });

  describe('RENAME_SESSION', () => {
    it('should update session customName in correct project', () => {
      const stateWithProjects: AppStateV2 = {
        ...initialState,
        projects: [
          {
            id: 'proj-1',
            name: 'Project 1',
            path: '/path1',
            isExpanded: true,
            sessions: [
              { id: 'sess-1', customName: undefined, startTime: new Date(), lastActivityTime: new Date() },
              { id: 'sess-2', customName: undefined, startTime: new Date(), lastActivityTime: new Date() },
            ],
          },
          {
            id: 'proj-2',
            name: 'Project 2',
            path: '/path2',
            isExpanded: false,
            sessions: [
              { id: 'sess-3', customName: undefined, startTime: new Date(), lastActivityTime: new Date() },
            ],
          },
        ],
      };

      const result = appReducer(stateWithProjects, {
        type: 'RENAME_SESSION',
        payload: { sessionId: 'sess-1', customName: 'My Feature Work' },
      });

      expect(result.projects[0].sessions[0].customName).toBe('My Feature Work');
      expect(result.projects[0].sessions[1].customName).toBeUndefined();
      expect(result.projects[1].sessions[0].customName).toBeUndefined();
    });
  });

  describe('ENHANCED_PROMPT_READY', () => {
    it('should not update if currentAnalysis is null', () => {
      const result = appReducer(initialState, {
        type: 'ENHANCED_PROMPT_READY',
        payload: { improvedVersion: 'Better prompt' },
      });

      expect(result.currentAnalysis).toBeNull();
    });

    it('should add improvedVersion to existing analysis', () => {
      const stateWithAnalysis: AppStateV2 = {
        ...initialState,
        currentAnalysis: {
          id: 'test',
          text: 'original',
          truncatedText: 'original',
          score: 70,
          timestamp: new Date(),
        },
        isEnhancing: true,
      };

      const result = appReducer(stateWithAnalysis, {
        type: 'ENHANCED_PROMPT_READY',
        payload: { improvedVersion: 'Better version of the prompt' },
      });

      expect(result.currentAnalysis?.improvedVersion).toBe('Better version of the prompt');
      expect(result.isEnhancing).toBe(false);
    });
  });

  describe('INCREMENT_ANALYZED_TODAY', () => {
    it('should increment by 1 when no payload', () => {
      const stateWith5: AppStateV2 = {
        ...initialState,
        analyzedToday: 5,
      };

      const result = appReducer(stateWith5, {
        type: 'INCREMENT_ANALYZED_TODAY',
      });

      expect(result.analyzedToday).toBe(6);
    });

    it('should set to payload value when provided', () => {
      const result = appReducer(initialState, {
        type: 'INCREMENT_ANALYZED_TODAY',
        payload: 42,
      });

      expect(result.analyzedToday).toBe(42);
    });
  });

  describe('SET_CLOUD_STATE', () => {
    it('should set isLoading to false when cloud status is received', () => {
      const loadingState: AppStateV2 = {
        ...initialState,
        cloud: { ...initialState.cloud, isLoading: true },
      };

      const result = appReducer(loadingState, {
        type: 'SET_CLOUD_STATE',
        payload: { isConnected: true, username: 'testuser' },
      });

      expect(result.cloud.isLoading).toBe(false);
      expect(result.cloud.isConnected).toBe(true);
      expect(result.cloud.username).toBe('testuser');
    });

    it('should preserve other cloud state when updating', () => {
      const stateWithSyncEnabled: AppStateV2 = {
        ...initialState,
        cloud: { isConnected: false, autoSyncEnabled: true, isLoading: true },
      };

      const result = appReducer(stateWithSyncEnabled, {
        type: 'SET_CLOUD_STATE',
        payload: { isConnected: true },
      });

      expect(result.cloud.autoSyncEnabled).toBe(true);
      expect(result.cloud.isLoading).toBe(false);
    });
  });
});
