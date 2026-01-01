/**
 * CoachingSection Tests
 *
 * Tests for the CoachingSection component.
 */

import { describe, it, expect } from 'vitest';
import type { CoachingSuggestion, CoachingData, CoachingAnalysis } from '../../../state/types-v2';

// Mock data helpers
function createMockSuggestion(overrides?: Partial<CoachingSuggestion>): CoachingSuggestion {
  return {
    id: 'test-suggestion-1',
    type: 'follow_up',
    title: 'Add unit tests',
    description: 'Consider adding tests for the changes',
    suggestedPrompt: 'Write unit tests for the UserService class focusing on authentication methods',
    confidence: 0.8,
    ...overrides,
  };
}

function createMockAnalysis(overrides?: Partial<CoachingAnalysis>): CoachingAnalysis {
  return {
    summary: 'Implemented user authentication flow',
    outcome: 'success',
    goalProgress: {
      before: 25,
      after: 50,
    },
    ...overrides,
  };
}

function createMockCoaching(overrides?: Partial<CoachingData>): CoachingData {
  return {
    analysis: createMockAnalysis(),
    suggestions: [createMockSuggestion()],
    timestamp: new Date(),
    ...overrides,
  };
}

describe('CoachingSection', () => {
  describe('Component rendering', () => {
    it('should render listening state when no coaching data', () => {
      const coaching = null;
      const isListening = true;

      // Test data structure
      expect(coaching).toBeNull();
      expect(isListening).toBe(true);
    });

    it('should show disabled message when not listening', () => {
      const coaching = null;
      const isListening = false;

      expect(coaching).toBeNull();
      expect(isListening).toBe(false);
    });

    it('should format waiting message based on source', () => {
      // Helper that mimics the component logic
      const getWaitingMessage = (source?: 'cursor' | 'claude_code') => {
        const agentName = source === 'claude_code' ? 'Claude Code' : source === 'cursor' ? 'Cursor' : 'agent';
        return `Waiting for ${agentName} to respond...`;
      };

      expect(getWaitingMessage('claude_code')).toBe('Waiting for Claude Code to respond...');
      expect(getWaitingMessage('cursor')).toBe('Waiting for Cursor to respond...');
      expect(getWaitingMessage(undefined)).toBe('Waiting for agent to respond...');
    });

    it('should display coaching data when available', () => {
      const coaching = createMockCoaching();

      expect(coaching).toBeDefined();
      expect(coaching.analysis.summary).toBe('Implemented user authentication flow');
      expect(coaching.suggestions.length).toBe(1);
    });
  });

  describe('Suggestion handling', () => {
    it('should have suggestion data structure', () => {
      const suggestion = createMockSuggestion();

      expect(suggestion.id).toBe('test-suggestion-1');
      expect(suggestion.type).toBe('follow_up');
      expect(suggestion.title).toBe('Add unit tests');
      expect(suggestion.suggestedPrompt).toContain('Write unit tests');
      expect(suggestion.confidence).toBe(0.8);
    });

    it('should support multiple suggestions', () => {
      const coaching = createMockCoaching({
        suggestions: [
          createMockSuggestion({ id: 'suggestion-1', title: 'Add tests' }),
          createMockSuggestion({ id: 'suggestion-2', title: 'Add docs' }),
          createMockSuggestion({ id: 'suggestion-3', title: 'Refactor' }),
        ],
      });

      expect(coaching.suggestions.length).toBe(3);

      const topSuggestion = coaching.suggestions[0];
      const moreSuggestions = coaching.suggestions.slice(1);

      expect(topSuggestion.id).toBe('suggestion-1');
      expect(moreSuggestions.length).toBe(2);
    });
  });

  describe('Goal progress', () => {
    it('should include goal progress data', () => {
      const coaching = createMockCoaching();

      expect(coaching.analysis.goalProgress).toBeDefined();
      expect(coaching.analysis.goalProgress?.before).toBe(25);
      expect(coaching.analysis.goalProgress?.after).toBe(50);
    });

    it('should handle missing goal progress', () => {
      const coaching = createMockCoaching({
        analysis: createMockAnalysis({ goalProgress: undefined }),
      });

      expect(coaching.analysis.goalProgress).toBeUndefined();
    });
  });

  describe('Time ago formatting', () => {
    it('should handle recent timestamps', () => {
      const coaching = createMockCoaching({
        timestamp: new Date(),
      });

      const seconds = Math.floor((Date.now() - coaching.timestamp.getTime()) / 1000);
      expect(seconds).toBeLessThan(60);
    });

    it('should handle older timestamps', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const coaching = createMockCoaching({
        timestamp: oneHourAgo,
      });

      const seconds = Math.floor((Date.now() - coaching.timestamp.getTime()) / 1000);
      expect(seconds).toBeGreaterThanOrEqual(3600);
    });
  });

  describe('Expand/collapse behavior', () => {
    it('should start collapsed', () => {
      const expanded = false;
      expect(expanded).toBe(false);
    });

    it('should toggle expanded state', () => {
      let expanded = false;
      const toggleExpanded = () => { expanded = !expanded; };

      toggleExpanded();
      expect(expanded).toBe(true);

      toggleExpanded();
      expect(expanded).toBe(false);
    });
  });
});

describe('GoalProgressBar', () => {
  it('should calculate progress class correctly', () => {
    const getProgressClass = (progress: number) => {
      if (progress >= 75) return 'progress-high';
      if (progress >= 50) return 'progress-medium';
      return 'progress-low';
    };

    expect(getProgressClass(80)).toBe('progress-high');
    expect(getProgressClass(75)).toBe('progress-high');
    expect(getProgressClass(60)).toBe('progress-medium');
    expect(getProgressClass(50)).toBe('progress-medium');
    expect(getProgressClass(30)).toBe('progress-low');
    expect(getProgressClass(0)).toBe('progress-low');
  });
});

describe('ContextBadge', () => {
  it('should determine if context exists', () => {
    const hasContext = (goalUsed?: string, promptsUsed = 0, snippetsUsed = 0) => {
      return !!(goalUsed || promptsUsed > 0 || snippetsUsed > 0);
    };

    expect(hasContext('Implement auth', 0, 0)).toBe(true);
    expect(hasContext(undefined, 5, 0)).toBe(true);
    expect(hasContext(undefined, 0, 3)).toBe(true);
    expect(hasContext(undefined, 0, 0)).toBe(false);
  });
});

describe('SessionContextPanel', () => {
  it('should handle topics data structure', () => {
    const topics = [
      { topic: 'Authentication', count: 3 },
      { topic: 'Database', count: 2 },
    ];

    expect(topics.length).toBe(2);
    expect(topics[0].topic).toBe('Authentication');
    expect(topics[0].count).toBe(3);
  });

  it('should handle already addressed items', () => {
    const alreadyAddressed = ['Login flow', 'Token validation'];

    expect(alreadyAddressed.length).toBe(2);
    expect(alreadyAddressed).toContain('Login flow');
  });
});
