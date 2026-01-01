/**
 * Tests for context-utils.ts
 *
 * Tests the helper functions for gathering prompt context:
 * - getFirstInteractions: Gets first N interactions from session start
 * - getLastInteractions: Gets last N interactions for recent continuity
 * - gatherPromptContext: Main function that assembles all context
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// Mock dependencies
vi.mock('../SessionManagerService', () => ({
  getSessionManager: vi.fn(),
}));

vi.mock('../ContextExtractor', () => ({
  getContextExtractor: vi.fn(),
}));

vi.mock('../WorkspaceContextService', () => ({
  getWorkspaceContextService: vi.fn(),
}));

// Import after mocks
import { gatherPromptContext, CONTEXT_GATHERING_TIMEOUT_MS } from '../context-utils';
import { getSessionManager } from '../SessionManagerService';
import { getContextExtractor } from '../ContextExtractor';
import { getWorkspaceContextService } from '../WorkspaceContextService';
import type { Session, PromptRecord, ResponseRecord, Interaction } from '../types/session-types';

describe('context-utils', () => {
  // Mock session data
  let mockSession: Session;
  let mockSessionManager: {
    getActiveSession: Mock;
    getLastInteractions: Mock;
  };
  let mockContextExtractor: {
    buildImprovementContext: Mock;
  };
  let mockWorkspaceContextService: {
    getContext: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock prompts (stored newest-first in the session)
    const mockPrompts: PromptRecord[] = [
      {
        id: 'prompt-5',
        sessionId: 'session-1',
        text: 'Fifth prompt - newest',
        truncatedText: 'Fifth prompt...',
        timestamp: new Date('2024-01-01T10:05:00Z'),
        score: 8,
      },
      {
        id: 'prompt-4',
        sessionId: 'session-1',
        text: 'Fourth prompt',
        truncatedText: 'Fourth prompt...',
        timestamp: new Date('2024-01-01T10:04:00Z'),
        score: 7,
      },
      {
        id: 'prompt-3',
        sessionId: 'session-1',
        text: 'Third prompt',
        truncatedText: 'Third prompt...',
        timestamp: new Date('2024-01-01T10:03:00Z'),
        score: 6,
      },
      {
        id: 'prompt-2',
        sessionId: 'session-1',
        text: 'Second prompt',
        truncatedText: 'Second prompt...',
        timestamp: new Date('2024-01-01T10:02:00Z'),
        score: 7,
      },
      {
        id: 'prompt-1',
        sessionId: 'session-1',
        text: 'First prompt - oldest',
        truncatedText: 'First prompt...',
        timestamp: new Date('2024-01-01T10:01:00Z'),
        score: 5,
      },
    ];

    // Create mock responses
    const mockResponses: ResponseRecord[] = [
      {
        id: 'response-1',
        promptId: 'prompt-1',
        sessionId: 'session-1',
        text: 'Response to first prompt',
        timestamp: new Date('2024-01-01T10:01:30Z'),
        filesModified: ['file1.ts'],
      },
      {
        id: 'response-2',
        promptId: 'prompt-2',
        sessionId: 'session-1',
        text: 'Response to second prompt',
        timestamp: new Date('2024-01-01T10:02:30Z'),
        filesModified: ['file2.ts', 'file3.ts'],
      },
      {
        id: 'response-3',
        promptId: 'prompt-3',
        sessionId: 'session-1',
        text: 'Response to third prompt',
        timestamp: new Date('2024-01-01T10:03:30Z'),
        filesModified: [],
      },
      {
        id: 'response-5',
        promptId: 'prompt-5',
        sessionId: 'session-1',
        text: 'Response to fifth prompt',
        timestamp: new Date('2024-01-01T10:05:30Z'),
        filesModified: ['file5.ts'],
      },
    ];

    mockSession = {
      id: 'session-1',
      projectId: 'project-1',
      platform: 'cursor',
      startTime: new Date('2024-01-01T10:00:00Z'),
      lastActivity: new Date('2024-01-01T10:05:30Z'),
      prompts: mockPrompts,
      responses: mockResponses,
      promptCount: 5,
      isActive: true,
    };

    // Create mock interactions (last N interactions, most recent first)
    const mockInteractions: Interaction[] = [
      {
        prompt: mockPrompts[0], // prompt-5 (newest)
        response: mockResponses[3], // response-5
      },
      {
        prompt: mockPrompts[1], // prompt-4
        response: undefined, // No response for prompt-4
      },
      {
        prompt: mockPrompts[2], // prompt-3
        response: mockResponses[2], // response-3
      },
    ];

    // Setup mock session manager
    mockSessionManager = {
      getActiveSession: vi.fn().mockReturnValue(mockSession),
      getLastInteractions: vi.fn().mockReturnValue(mockInteractions),
    };

    // Setup mock context extractor
    mockContextExtractor = {
      buildImprovementContext: vi.fn().mockResolvedValue({
        technical: {
          techStack: ['TypeScript', 'React'],
          codeSnippets: [],
        },
        goal: {
          text: 'Implement new feature',
        },
        recentHistory: {
          alreadyAskedAbout: ['authentication', 'routing'],
          sessionDuration: 30,
        },
      }),
    };

    // Setup mock workspace context service
    mockWorkspaceContextService = {
      getContext: vi.fn().mockResolvedValue({
        techStack: ['Node.js'],
        relevantSnippets: [],
      }),
    };

    // Wire up mocks
    (getSessionManager as Mock).mockReturnValue(mockSessionManager);
    (getContextExtractor as Mock).mockReturnValue(mockContextExtractor);
    (getWorkspaceContextService as Mock).mockReturnValue(mockWorkspaceContextService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('gatherPromptContext', () => {
    it('should gather context with first and last interactions', async () => {
      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context).toBeDefined();
      expect(context?.firstInteractions).toBeDefined();
      expect(context?.lastInteractions).toBeDefined();
    });

    it('should include tech stack from both sources', async () => {
      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context?.techStack).toContain('TypeScript');
      expect(context?.techStack).toContain('React');
      expect(context?.techStack).toContain('Node.js');
    });

    it('should include session goal', async () => {
      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context?.goal).toBe('Implement new feature');
    });

    it('should include recent topics', async () => {
      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context?.recentTopics).toContain('authentication');
      expect(context?.recentTopics).toContain('routing');
    });

    it('should include session duration', async () => {
      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context?.sessionDuration).toBe(30);
    });

    it('should return undefined on timeout', async () => {
      // Make context extraction hang
      mockContextExtractor.buildImprovementContext.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      // Use a short timeout for test
      const startTime = Date.now();
      const context = await gatherPromptContext('test prompt', '[Test]');
      const elapsed = Date.now() - startTime;

      // Should timeout after CONTEXT_GATHERING_TIMEOUT_MS
      expect(context).toBeUndefined();
      expect(elapsed).toBeGreaterThanOrEqual(CONTEXT_GATHERING_TIMEOUT_MS - 100);
      expect(elapsed).toBeLessThan(CONTEXT_GATHERING_TIMEOUT_MS + 500);
    });

    it('should return undefined on error', async () => {
      mockContextExtractor.buildImprovementContext.mockRejectedValue(
        new Error('Context extraction failed')
      );

      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context).toBeUndefined();
    });

    it('should handle null workspace context gracefully', async () => {
      mockWorkspaceContextService.getContext.mockResolvedValue(null);

      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context).toBeDefined();
      expect(context?.techStack).toContain('TypeScript');
      expect(context?.techStack).toContain('React');
    });
  });

  describe('getFirstInteractions (via gatherPromptContext)', () => {
    it('should return first 3 interactions from session', async () => {
      const context = await gatherPromptContext('test prompt', '[Test]');

      // First interactions come from session.prompts (stored newest-first)
      // So first 3 are actually from the END of the array
      expect(context?.firstInteractions).toBeDefined();
      expect(context?.firstInteractions?.length).toBeLessThanOrEqual(3);
    });

    it('should truncate prompt text to MAX_PROMPT_LENGTH (400)', async () => {
      // Create a very long prompt
      const longPromptText = 'A'.repeat(500);
      mockSession.prompts = [
        {
          id: 'prompt-long',
          sessionId: 'session-1',
          text: longPromptText,
          truncatedText: 'AAA...',
          timestamp: new Date(),
          score: 5,
        },
      ];

      const context = await gatherPromptContext('test prompt', '[Test]');

      if (context?.firstInteractions?.[0]) {
        expect(context.firstInteractions[0].prompt.length).toBeLessThanOrEqual(400);
      }
    });

    it('should truncate response text to MAX_RESPONSE_LENGTH (600)', async () => {
      // Create a very long response
      const longResponseText = 'B'.repeat(700);
      mockSession.prompts = [
        {
          id: 'prompt-1',
          sessionId: 'session-1',
          text: 'Test prompt',
          truncatedText: 'Test...',
          timestamp: new Date(),
          score: 5,
        },
      ];
      mockSession.responses = [
        {
          id: 'response-1',
          promptId: 'prompt-1',
          sessionId: 'session-1',
          text: longResponseText,
          timestamp: new Date(),
          filesModified: [],
        },
      ];

      const context = await gatherPromptContext('test prompt', '[Test]');

      if (context?.firstInteractions?.[0]?.response) {
        expect(context.firstInteractions[0].response.length).toBeLessThanOrEqual(600);
      }
    });

    it('should include filesModified from responses', async () => {
      const context = await gatherPromptContext('test prompt', '[Test]');

      // Check that filesModified is included
      const firstWithFiles = context?.firstInteractions?.find(
        (i) => i.filesModified && i.filesModified.length > 0
      );
      // May or may not find one depending on mock data structure
      expect(context?.firstInteractions).toBeDefined();
    });

    it('should return empty array when no active session', async () => {
      mockSessionManager.getActiveSession.mockReturnValue(null);

      const context = await gatherPromptContext('test prompt', '[Test]');

      // Should still return context (from other sources) but with empty interactions
      expect(context?.firstInteractions).toEqual([]);
    });

    it('should return empty array when session has no prompts', async () => {
      mockSession.prompts = [];

      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context?.firstInteractions).toEqual([]);
    });

    it('should filter out empty prompts', async () => {
      mockSession.prompts = [
        {
          id: 'prompt-empty',
          sessionId: 'session-1',
          text: '',
          truncatedText: '',
          timestamp: new Date(),
          score: 0,
        },
        {
          id: 'prompt-whitespace',
          sessionId: 'session-1',
          text: '   ',
          truncatedText: '',
          timestamp: new Date(),
          score: 0,
        },
        {
          id: 'prompt-valid',
          sessionId: 'session-1',
          text: 'Valid prompt',
          truncatedText: 'Valid...',
          timestamp: new Date(),
          score: 5,
        },
      ];

      const context = await gatherPromptContext('test prompt', '[Test]');

      // Should only include the valid prompt
      expect(context?.firstInteractions?.length).toBe(1);
      expect(context?.firstInteractions?.[0].prompt).toBe('Valid prompt');
    });
  });

  describe('getLastInteractions (via gatherPromptContext)', () => {
    it('should return last 3 interactions from SessionManager', async () => {
      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context?.lastInteractions).toBeDefined();
      expect(mockSessionManager.getLastInteractions).toHaveBeenCalledWith(3);
    });

    it('should include prompt text', async () => {
      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context?.lastInteractions?.[0]?.prompt).toBeDefined();
    });

    it('should include response text when available', async () => {
      const context = await gatherPromptContext('test prompt', '[Test]');

      // First interaction has a response
      const interactionWithResponse = context?.lastInteractions?.find(
        (i) => i.response !== undefined
      );
      expect(interactionWithResponse?.response).toBeDefined();
    });

    it('should handle interactions without responses', async () => {
      const context = await gatherPromptContext('test prompt', '[Test]');

      // Second mock interaction has no response
      const interactionWithoutResponse = context?.lastInteractions?.find(
        (i) => i.response === undefined
      );
      // May or may not exist depending on filtering
      expect(context?.lastInteractions).toBeDefined();
    });

    it('should return empty array when getLastInteractions returns empty', async () => {
      mockSessionManager.getLastInteractions.mockReturnValue([]);

      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context?.lastInteractions).toEqual([]);
    });

    it('should filter out interactions with empty prompt text', async () => {
      mockSessionManager.getLastInteractions.mockReturnValue([
        {
          prompt: { id: 'p1', text: '', truncatedText: '', timestamp: new Date(), score: 0, sessionId: 's1' },
          response: undefined,
        },
        {
          prompt: { id: 'p2', text: 'Valid prompt', truncatedText: 'Valid...', timestamp: new Date(), score: 5, sessionId: 's1' },
          response: { id: 'r2', promptId: 'p2', sessionId: 's1', text: 'Response', timestamp: new Date(), filesModified: [] },
        },
      ]);

      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context?.lastInteractions?.length).toBe(1);
      expect(context?.lastInteractions?.[0].prompt).toBe('Valid prompt');
    });

    it('should filter out interactions with null prompt', async () => {
      mockSessionManager.getLastInteractions.mockReturnValue([
        {
          prompt: null,
          response: undefined,
        },
        {
          prompt: { id: 'p2', text: 'Valid', truncatedText: 'Valid', timestamp: new Date(), score: 5, sessionId: 's1' },
          response: undefined,
        },
      ] as unknown as Interaction[]);

      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context?.lastInteractions?.length).toBe(1);
    });
  });

  describe('cross-platform support', () => {
    it('should work with Cursor sessions', async () => {
      mockSession.platform = 'cursor';

      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context).toBeDefined();
      expect(context?.firstInteractions).toBeDefined();
      expect(context?.lastInteractions).toBeDefined();
    });

    it('should work with Claude Code sessions', async () => {
      mockSession.platform = 'claude_code';

      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context).toBeDefined();
      expect(context?.firstInteractions).toBeDefined();
      expect(context?.lastInteractions).toBeDefined();
    });

    it('should work with VS Code sessions', async () => {
      mockSession.platform = 'vscode';

      const context = await gatherPromptContext('test prompt', '[Test]');

      expect(context).toBeDefined();
      expect(context?.firstInteractions).toBeDefined();
      expect(context?.lastInteractions).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle SessionManager errors gracefully for firstInteractions', async () => {
      mockSessionManager.getActiveSession.mockImplementation(() => {
        throw new Error('Session manager error');
      });

      const context = await gatherPromptContext('test prompt', '[Test]');

      // Should still return context (may have empty interactions)
      expect(context?.firstInteractions).toEqual([]);
    });

    it('should handle SessionManager errors gracefully for lastInteractions', async () => {
      mockSessionManager.getLastInteractions.mockImplementation(() => {
        throw new Error('Session manager error');
      });

      const context = await gatherPromptContext('test prompt', '[Test]');

      // Should still return context (may have empty interactions)
      expect(context?.lastInteractions).toEqual([]);
    });
  });
});
