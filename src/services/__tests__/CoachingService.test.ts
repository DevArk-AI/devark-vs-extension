/**
 * CoachingService Tests
 *
 * Tests for Workstream C: Coaching Service & Response Analysis
 * - Response analysis outcomes
 * - Suggestion generation with mock LLM
 * - Fallback suggestions
 * - Throttling behavior
 * - Cooldown after "Not Now"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CapturedResponse } from '../types/response-types';
import type {
  ResponseAnalysis,
  CoachingSuggestion,
  CoachingData,
  ResponseOutcome,
} from '../types/coaching-types';

// Mock vscode module
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
  },
  commands: {
    executeCommand: vi.fn().mockResolvedValue(undefined),
  },
  env: {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

// Mock ExtensionState
vi.mock('../../extension-state', () => ({
  ExtensionState: {
    getLLMManager: vi.fn().mockReturnValue(null),
  },
}));

// Mock GoalService
vi.mock('../GoalService', () => ({
  getGoalService: vi.fn().mockReturnValue({
    getGoalStatus: vi.fn().mockReturnValue({
      hasGoal: false,
      goalText: '',
      promptsSinceGoalSet: 0,
    }),
  }),
}));

// Mock ContextExtractor
vi.mock('../ContextExtractor', () => ({
  getContextExtractor: vi.fn().mockReturnValue({
    extractSessionContext: vi.fn().mockReturnValue({
      techStack: ['TypeScript', 'React'],
      topics: ['testing', 'refactoring'],
    }),
  }),
}));

describe('ResponseAnalyzer', () => {
  let ResponseAnalyzer: typeof import('../ResponseAnalyzer').ResponseAnalyzer;
  let getResponseAnalyzer: typeof import('../ResponseAnalyzer').getResponseAnalyzer;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset module cache to get fresh singleton
    vi.resetModules();
    const module = await import('../ResponseAnalyzer');
    ResponseAnalyzer = module.ResponseAnalyzer;
    getResponseAnalyzer = module.getResponseAnalyzer;
  });

  describe('analyzeResponse', () => {
    it('should return success outcome for successful Cursor response', async () => {
      const analyzer = getResponseAnalyzer();
      const response: CapturedResponse = {
        id: 'cursor-response-123',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Fixed the bug in UserService.ts by adding a null check.',
        success: true,
        filesModified: ['src/UserService.ts'],
      };

      const analysis = await analyzer.analyzeResponse(response);

      expect(analysis.outcome).toBe('success');
      expect(analysis.summary).toBeTruthy();
      expect(analysis.entitiesModified).toContain('src/UserService.ts');
    });

    it('should return error outcome for failed response', async () => {
      const analyzer = getResponseAnalyzer();
      const response: CapturedResponse = {
        id: 'cursor-response-456',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Error: Could not read file',
        success: false,
      };

      const analysis = await analyzer.analyzeResponse(response);

      expect(analysis.outcome).toBe('error');
    });

    it('should return partial outcome for cancelled Claude Code response', async () => {
      const analyzer = getResponseAnalyzer();
      const response: CapturedResponse = {
        id: 'claude-response-789',
        timestamp: new Date().toISOString(),
        source: 'claude_code',
        response: 'Partially completed...',
        success: false,
        reason: 'cancelled',
        sessionId: 'session-123',
      };

      const analysis = await analyzer.analyzeResponse(response);

      expect(analysis.outcome).toBe('partial');
    });

    it('should extract topics from response text', async () => {
      const analyzer = getResponseAnalyzer();
      const response: CapturedResponse = {
        id: 'cursor-response-topics',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Added unit tests for the authentication module and fixed a bug in the login flow.',
        success: true,
      };

      const analysis = await analyzer.analyzeResponse(response);

      expect(analysis.topicsAddressed).toContain('Testing');
      expect(analysis.topicsAddressed).toContain('Bug Fix');
      expect(analysis.topicsAddressed).toContain('Authentication');
    });

    it('should extract entities from filesModified', async () => {
      const analyzer = getResponseAnalyzer();
      const response: CapturedResponse = {
        id: 'cursor-response-entities',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Updated multiple files.',
        success: true,
        filesModified: [
          'src/services/AuthService.ts',
          'src/components/LoginForm.tsx',
          'src/utils/validation.ts',
        ],
      };

      const analysis = await analyzer.analyzeResponse(response);

      expect(analysis.entitiesModified.length).toBe(3);
      expect(analysis.entitiesModified).toContain('src/services/AuthService.ts');
    });

    it('should extract entities from toolCalls', async () => {
      const analyzer = getResponseAnalyzer();
      const response: CapturedResponse = {
        id: 'cursor-response-tools',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Edited files using tools.',
        success: true,
        toolCalls: [
          { name: 'edit_file', arguments: { path: 'src/index.ts' } },
          { name: 'read_file', arguments: { file: 'src/config.ts' } },
        ],
      };

      const analysis = await analyzer.analyzeResponse(response);

      expect(analysis.entitiesModified).toContain('src/index.ts');
      expect(analysis.entitiesModified).toContain('src/config.ts');
    });

    it('should generate meaningful summary', async () => {
      const analyzer = getResponseAnalyzer();
      const response: CapturedResponse = {
        id: 'cursor-response-summary',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Successfully implemented the new feature with proper error handling and documentation.',
        success: true,
        filesModified: ['src/feature.ts'],
      };

      const analysis = await analyzer.analyzeResponse(response);

      expect(analysis.summary.length).toBeGreaterThan(10);
      // No maximum length constraint - full summaries should be displayed
    });
  });
});

describe('CoachingService', () => {
  let CoachingService: typeof import('../CoachingService').CoachingService;
  let getCoachingService: typeof import('../CoachingService').getCoachingService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset module cache to get fresh singleton
    vi.resetModules();
    const module = await import('../CoachingService');
    CoachingService = module.CoachingService;
    getCoachingService = module.getCoachingService;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('processResponse', () => {
    it('should generate fallback suggestions when no LLM available', async () => {
      const service = getCoachingService();
      const response: CapturedResponse = {
        id: 'test-response-1',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Fixed the type error in the component.',
        success: true,
        filesModified: ['src/Component.tsx'],
      };

      const result = await service.processResponse(response, { force: true });

      expect(result.generated).toBe(true);
      expect(result.coaching?.suggestions.length).toBeGreaterThan(0);
    });

    it('should not generate coaching for error responses', async () => {
      const service = getCoachingService();
      const response: CapturedResponse = {
        id: 'test-error-response',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Error: Something went wrong',
        success: false,
      };

      const result = await service.processResponse(response, { force: true });

      expect(result.generated).toBe(false);
      expect(result.reason).toBe('error_response');
    });

    it('should include test suggestion when files are modified', async () => {
      const service = getCoachingService();
      const response: CapturedResponse = {
        id: 'test-response-files',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Updated the service.',
        success: true,
        filesModified: ['src/UserService.ts'],
      };

      const result = await service.processResponse(response, { force: true });

      expect(result.generated).toBe(true);
      const testSuggestion = result.coaching?.suggestions.find(s => s.type === 'test');
      expect(testSuggestion).toBeDefined();
      expect(testSuggestion?.suggestedPrompt).toContain('UserService.ts');
    });

    it('should include follow-up suggestion for bug fixes', async () => {
      const service = getCoachingService();
      const response: CapturedResponse = {
        id: 'test-bugfix-response',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Fixed the bug in the login flow.',
        success: true,
        filesModified: ['src/auth/login.ts'],
      };

      const result = await service.processResponse(response, { force: true });

      expect(result.generated).toBe(true);
      const followUpSuggestion = result.coaching?.suggestions.find(s => s.type === 'follow_up');
      expect(followUpSuggestion).toBeDefined();
    });
  });

  describe('throttling', () => {
    it('should throttle coaching within minInterval', async () => {
      const service = getCoachingService();
      const response: CapturedResponse = {
        id: 'test-throttle-1',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'First response.',
        success: true,
        filesModified: ['src/file1.ts'],
      };

      // First call should succeed
      const result1 = await service.processResponse(response, { force: true });
      expect(result1.generated).toBe(true);

      // Second call within minInterval should be throttled
      const response2: CapturedResponse = {
        ...response,
        id: 'test-throttle-2',
      };
      const result2 = await service.processResponse(response2);
      expect(result2.generated).toBe(false);
      expect(result2.reason).toBe('throttled');
    });

    it('should allow coaching after minInterval passes', async () => {
      const service = getCoachingService();
      const response: CapturedResponse = {
        id: 'test-interval-1',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Response after interval.',
        success: true,
        filesModified: ['src/file.ts'],
      };

      // First call
      await service.processResponse(response, { force: true });

      // Advance time past minInterval (3 minutes + 1 second)
      vi.advanceTimersByTime(3 * 60 * 1000 + 1000);

      // Second call should succeed
      const response2: CapturedResponse = {
        ...response,
        id: 'test-interval-2',
      };
      const result = await service.processResponse(response2);
      expect(result.generated).toBe(true);
    });

    it('should bypass throttling with force option', async () => {
      const service = getCoachingService();
      const response: CapturedResponse = {
        id: 'test-force-1',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Forced response.',
        success: true,
        filesModified: ['src/file.ts'],
      };

      // First call
      await service.processResponse(response, undefined, { force: true });

      // Second call with force should succeed immediately
      const response2: CapturedResponse = {
        ...response,
        id: 'test-force-2',
      };
      const result = await service.processResponse(response2, undefined, { force: true });
      expect(result.generated).toBe(true);
    });
  });

  describe('cooldown', () => {
    it('should track cooldown state', async () => {
      const service = getCoachingService();

      // Initially not on cooldown
      const state1 = service.getState();
      expect(state1.onCooldown).toBe(false);
    });

    it('should allow reset of cooldown', async () => {
      const service = getCoachingService();

      // Reset cooldown
      service.resetCooldown();

      const state = service.getState();
      expect(state.onCooldown).toBe(false);
    });
  });

  describe('subscription', () => {
    it('should notify listeners when coaching is generated', async () => {
      const service = getCoachingService();
      const listener = vi.fn();

      service.subscribe(listener);

      const response: CapturedResponse = {
        id: 'test-subscribe-1',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Updated the component.',
        success: true,
        filesModified: ['src/Component.tsx'],
      };

      await service.processResponse(response, { force: true });

      expect(listener).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        analysis: expect.any(Object),
        suggestions: expect.any(Array),
      }));
    });

    it('should allow unsubscription', async () => {
      const service = getCoachingService();
      const listener = vi.fn();

      const unsubscribe = service.subscribe(listener);
      unsubscribe();

      const response: CapturedResponse = {
        id: 'test-unsubscribe-1',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Updated.',
        success: true,
        filesModified: ['src/file.ts'],
      };

      await service.processResponse(response, { force: true });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('suggestion management', () => {
    it('should dismiss specific suggestion', async () => {
      const service = getCoachingService();
      const response: CapturedResponse = {
        id: 'test-dismiss-1',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Multiple suggestions expected.',
        success: true,
        filesModified: ['src/file.ts'],
      };

      await service.processResponse(response, { force: true });

      const coaching = service.getCurrentCoaching();
      expect(coaching?.suggestions.length).toBeGreaterThan(0);

      const firstSuggestionId = coaching!.suggestions[0].id;
      service.dismissSuggestion(firstSuggestionId);

      const updatedCoaching = service.getCurrentCoaching();
      const dismissed = updatedCoaching?.suggestions.find(s => s.id === firstSuggestionId);
      expect(dismissed).toBeUndefined();
    });

    it('should dismiss all coaching', async () => {
      const service = getCoachingService();
      const response: CapturedResponse = {
        id: 'test-dismiss-all',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Dismiss all test.',
        success: true,
        filesModified: ['src/file.ts'],
      };

      await service.processResponse(response, { force: true });
      expect(service.getCurrentCoaching()).not.toBeNull();

      service.dismissAll();
      expect(service.getCurrentCoaching()).toBeNull();
    });
  });

  describe('configuration', () => {
    it('should respect enabled setting', async () => {
      const service = getCoachingService();
      service.setEnabled(false);

      const response: CapturedResponse = {
        id: 'test-disabled',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Should not generate.',
        success: true,
        filesModified: ['src/file.ts'],
      };

      const result = await service.processResponse(response);
      expect(result.generated).toBe(false);
      expect(result.reason).toBe('throttled');

      // Re-enable for other tests
      service.setEnabled(true);
    });

    it('should update configuration', () => {
      const service = getCoachingService();

      service.updateConfig({
        minInterval: 5 * 60 * 1000, // 5 minutes
        showToasts: false,
      });

      // Config is internal, but we can verify behavior changes
      const state = service.getState();
      expect(state.isListening).toBe(true);
    });
  });
});

describe('Coaching Types', () => {
  it('should have valid default config', async () => {
    const { DEFAULT_COACHING_CONFIG } = await import('../types/coaching-types');

    expect(DEFAULT_COACHING_CONFIG.minInterval).toBe(3 * 60 * 1000);
    expect(DEFAULT_COACHING_CONFIG.cooldownDuration).toBe(10 * 60 * 1000);
    expect(DEFAULT_COACHING_CONFIG.enabled).toBe(true);
    expect(DEFAULT_COACHING_CONFIG.showToasts).toBe(true);
  });

  it('should have icons for all suggestion types', async () => {
    const { SUGGESTION_TYPE_ICONS } = await import('../types/coaching-types');

    expect(SUGGESTION_TYPE_ICONS.follow_up).toBeDefined();
    expect(SUGGESTION_TYPE_ICONS.test).toBeDefined();
    expect(SUGGESTION_TYPE_ICONS.error_prevention).toBeDefined();
    expect(SUGGESTION_TYPE_ICONS.documentation).toBeDefined();
    expect(SUGGESTION_TYPE_ICONS.refactor).toBeDefined();
    expect(SUGGESTION_TYPE_ICONS.goal_alignment).toBeDefined();
    expect(SUGGESTION_TYPE_ICONS.celebration).toBeDefined();
  });

  it('should have names for all suggestion types', async () => {
    const { SUGGESTION_TYPE_NAMES } = await import('../types/coaching-types');

    expect(SUGGESTION_TYPE_NAMES.follow_up).toBe('Next Step');
    expect(SUGGESTION_TYPE_NAMES.test).toBe('Add Tests');
    expect(SUGGESTION_TYPE_NAMES.error_prevention).toBe('Prevent Issues');
    expect(SUGGESTION_TYPE_NAMES.documentation).toBe('Document');
    expect(SUGGESTION_TYPE_NAMES.refactor).toBe('Refactor');
    expect(SUGGESTION_TYPE_NAMES.goal_alignment).toBe('Goal Focus');
    expect(SUGGESTION_TYPE_NAMES.celebration).toBe('Achievement');
  });
});
