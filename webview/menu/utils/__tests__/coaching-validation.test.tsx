/**
 * Coaching Validation Tests
 *
 * Tests for session-aware coaching validation (VIB-35)
 *
 * Note: The webview Session type doesn't have prompts array, so validation
 * trusts the backend filtering. These tests verify the basic coaching
 * display logic.
 */

import { describe, it, expect } from 'vitest';
import { shouldDisplayCoaching, getSessionPromptIds } from '../coaching-validation';
import type { CoachingData, Session } from '../../state/types-v2';

// Helper to create mock session
function createMockSession(): Session {
  return {
    id: 'session-123',
    name: 'Test Session',
    startTime: new Date(),
    lastActivity: new Date(),
    projectPath: '/test/project',
    source: 'claude_code',
    promptCount: 3,
  };
}

// Helper to create mock coaching
function createMockCoaching(promptId?: string): CoachingData {
  return {
    analysis: {
      summary: 'Test summary',
      outcome: 'success',
    },
    suggestions: [{
      id: 'suggestion-1',
      type: 'follow_up',
      title: 'Next step',
      description: 'Do something',
      suggestedPrompt: 'Test prompt',
      confidence: 0.8,
    }],
    timestamp: new Date(),
    promptId,
  };
}

describe('shouldDisplayCoaching', () => {
  describe('when coaching data exists', () => {
    it('should return true when coaching has promptId', () => {
      const session = createMockSession();
      const coaching = createMockCoaching('prompt-1');

      expect(shouldDisplayCoaching(coaching, session)).toBe(true);
    });

    it('should return true when coaching has no promptId (legacy)', () => {
      const session = createMockSession();
      const coaching = createMockCoaching(); // no promptId

      expect(shouldDisplayCoaching(coaching, session)).toBe(true);
    });

    it('should return true when activeSession is null', () => {
      const coaching = createMockCoaching('prompt-1');

      expect(shouldDisplayCoaching(coaching, null)).toBe(true);
    });

    it('should return true when activeSession is undefined', () => {
      const coaching = createMockCoaching('prompt-1');

      expect(shouldDisplayCoaching(coaching, undefined)).toBe(true);
    });
  });

  describe('when coaching data is missing', () => {
    it('should return false when coaching is null', () => {
      const session = createMockSession();

      expect(shouldDisplayCoaching(null, session)).toBe(false);
    });

    it('should return false when coaching is undefined', () => {
      const session = createMockSession();

      expect(shouldDisplayCoaching(undefined, session)).toBe(false);
    });
  });
});

describe('getSessionPromptIds', () => {
  it('should return empty array (validation handled by backend)', () => {
    const session = createMockSession();

    // Backend handles filtering - webview Session doesn't have prompts array
    expect(getSessionPromptIds(session)).toEqual([]);
  });

  it('should return empty array when session is null', () => {
    expect(getSessionPromptIds(null)).toEqual([]);
  });

  it('should return empty array when session is undefined', () => {
    expect(getSessionPromptIds(undefined)).toEqual([]);
  });
});
