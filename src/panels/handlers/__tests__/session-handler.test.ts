import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionHandler } from '../session-handler';
import { SharedContext } from '../shared-context';
import type { MessageSender } from '../base-handler';
import type * as vscode from 'vscode';

const mockUri = { fsPath: '/test/path' } as vscode.Uri;

// Mock coaching service
vi.mock('../../../services/CoachingService', () => ({
  getCoachingService: vi.fn().mockReturnValue({
    getCurrentCoaching: vi.fn().mockReturnValue(null),
    setCurrentPromptId: vi.fn(),
    getCoachingForPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

// Mock extension state
vi.mock('../../../extension-state', () => ({
  ExtensionState: {
    getLLMManager: vi.fn().mockReturnValue({
      getProviderForFeature: vi.fn().mockReturnValue(null),
      getActiveProvider: vi.fn().mockReturnValue({
        id: 'mock-provider',
        generateCompletion: vi.fn(),
      }),
    }),
  },
}));

// Mock PromptScorer
vi.mock('../../../copilot/prompt-scorer', () => ({
  PromptScorer: vi.fn().mockImplementation(() => ({
    scorePromptV2: vi.fn().mockResolvedValue({
      overall: 75,
      breakdown: {
        specificity: { score: 7, weight: 0.2 },
        context: { score: 8, weight: 0.25 },
        intent: { score: 7, weight: 0.25 },
        actionability: { score: 8, weight: 0.15 },
        constraints: { score: 7, weight: 0.15 },
        total: 75,
      },
      explanation: {},
    }),
  })),
}));

describe('SessionHandler', () => {
  let handler: SessionHandler;
  let mockSender: MessageSender;
  let sharedContext: SharedContext;

  beforeEach(() => {
    mockSender = { sendMessage: vi.fn() };
    sharedContext = new SharedContext();

    sharedContext.sessionManagerService = {
      getActiveSession: vi.fn().mockReturnValue({ id: 'session-1', projectId: 'proj-1', prompts: [] }),
      getProject: vi.fn().mockReturnValue({ id: 'proj-1', name: 'Test Project' }),
      getSessions: vi.fn().mockReturnValue([]),
      getAllProjects: vi.fn().mockReturnValue([]),
      getPrompts: vi.fn().mockReturnValue({ prompts: [], total: 0, hasMore: false }),
      markSessionAsRead: vi.fn(),
      switchSession: vi.fn().mockResolvedValue({ id: 'session-1', projectId: 'proj-1', prompts: [] }),
      addPrompt: vi.fn().mockResolvedValue({ id: 'prompt-1', text: 'test', score: 75 }),
      updateSession: vi.fn().mockResolvedValue(undefined),
      deleteSession: vi.fn().mockResolvedValue(undefined),
    } as unknown as SharedContext['sessionManagerService'];

    sharedContext.dailyStatsService = {
      getDailyStats: vi.fn().mockReturnValue({
        averageScore: 7.5,
        totalPrompts: 10,
        historicalAverage: 7.0,
        deltaVsTypical: 0.5,
      }),
      getWeeklyTrend: vi.fn().mockReturnValue([]),
      getStreak: vi.fn().mockReturnValue({ currentStreak: 3, longestStreak: 7 }),
      getMonthlyStats: vi.fn().mockReturnValue({
        totalPrompts: 100,
        averageScore: 7.2,
        activeDays: 20,
        bestDay: '2024-01-15',
        bestDayScore: 8.5,
      }),
      recordScore: vi.fn().mockResolvedValue(undefined),
    } as unknown as SharedContext['dailyStatsService'];

    sharedContext.suggestionEngine = {
      analyzePrompt: vi.fn().mockReturnValue(null),
    } as unknown as SharedContext['suggestionEngine'];

    handler = new SessionHandler(
      mockSender,
      { extensionUri: mockUri, context: {} as vscode.ExtensionContext },
      sharedContext
    );
  });

  describe('getHandledMessageTypes', () => {
    it('should return correct message types', () => {
      const types = handler.getHandledMessageTypes();
      expect(types).toContain('v2GetActiveSession');
      expect(types).toContain('switchSession');
      expect(types).toContain('v2GetDailyStats');
      expect(types).toContain('v2GetSessionList');
      expect(types).toContain('v2GetPrompts');
      expect(types).toContain('renameSession');
      expect(types).toContain('deleteSession');
      // Note: v2AnalyzePromptV2, v2GetWeeklyTrend, v2GetStreak, v2GetPersonalComparison were removed as dead code
      expect(types).toHaveLength(9);
    });
  });

  describe('handleMessage', () => {
    it('should handle v2GetActiveSession', async () => {
      const result = await handler.handleMessage('v2GetActiveSession', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2ActiveSession', expect.objectContaining({
        sessionId: 'session-1',
      }));
    });

    it('should handle v2GetDailyStats', async () => {
      const result = await handler.handleMessage('v2GetDailyStats', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2DailyStats', expect.objectContaining({
        stats: expect.any(Object),
      }));
    });

    // Note: v2GetWeeklyTrend, v2GetStreak, v2GetPersonalComparison handlers were removed as dead code

    it('should handle v2GetSessionList', async () => {
      const result = await handler.handleMessage('v2GetSessionList', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SessionList', expect.objectContaining({
        sessions: [],
        projects: [],
      }));
    });

    it('should handle v2GetPrompts', async () => {
      const result = await handler.handleMessage('v2GetPrompts', { sessionId: 'session-1' });
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2Prompts', expect.any(Object));
    });

    it('should handle switchSession', async () => {
      const result = await handler.handleMessage('switchSession', { sessionId: 'session-1' });
      expect(result).toBe(true);
      expect(sharedContext.sessionManagerService!.switchSession).toHaveBeenCalledWith('session-1');
    });

    it('should handle switchSession without sessionId gracefully', async () => {
      const result = await handler.handleMessage('switchSession', {});
      expect(result).toBe(true);
      expect(sharedContext.sessionManagerService!.switchSession).not.toHaveBeenCalled();
    });

    it('should handle markSessionAsRead', async () => {
      const result = await handler.handleMessage('markSessionAsRead', { sessionId: 'session-1' });
      expect(result).toBe(true);
      expect(sharedContext.sessionManagerService!.markSessionAsRead).toHaveBeenCalledWith('session-1');
    });

    it('should handle renameSession', async () => {
      const result = await handler.handleMessage('renameSession', { sessionId: 'session-1', name: 'New Name' });
      expect(result).toBe(true);
      expect(sharedContext.sessionManagerService!.updateSession).toHaveBeenCalledWith('session-1', { customName: 'New Name' });
      expect(mockSender.sendMessage).toHaveBeenCalledWith('sessionRenamed', { sessionId: 'session-1', customName: 'New Name' });
    });

    it('should handle deleteSession', async () => {
      const result = await handler.handleMessage('deleteSession', { sessionId: 'session-1' });
      expect(result).toBe(true);
      expect(sharedContext.sessionManagerService!.deleteSession).toHaveBeenCalledWith('session-1');
      expect(mockSender.sendMessage).toHaveBeenCalledWith('sessionDeleted', { sessionId: 'session-1' });
    });

    it('should return false for unhandled message types', async () => {
      const result = await handler.handleMessage('unknownType', {});
      expect(result).toBe(false);
    });
  });

  describe('v2GetSessionList - empty session filtering', () => {
    it('should filter out sessions with 0 prompts from top-level sessions', async () => {
      // Sessions are now derived from projects, so we test with projects containing sessions
      const mockProjects = [
        {
          id: 'proj-1',
          name: 'Project One',
          sessions: [
            { id: 'sess-1', promptCount: 5, platform: 'claude_code' },
            { id: 'sess-2', promptCount: 0, platform: 'claude_code' },
            { id: 'sess-3', promptCount: 3, platform: 'cursor' },
            { id: 'sess-4', promptCount: 0, platform: 'cursor' },
          ],
        },
      ];

      sharedContext.sessionManagerService!.getAllProjects = vi.fn().mockReturnValue(mockProjects);

      await handler.handleMessage('v2GetSessionList', {});

      // Sessions are flattened from filtered projects
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SessionList', {
        sessions: [
          { id: 'sess-1', promptCount: 5, platform: 'claude_code' },
          { id: 'sess-3', promptCount: 3, platform: 'cursor' },
        ],
        projects: [
          {
            id: 'proj-1',
            name: 'Project One',
            sessions: [
              { id: 'sess-1', promptCount: 5, platform: 'claude_code' },
              { id: 'sess-3', promptCount: 3, platform: 'cursor' },
            ],
          },
        ],
      });
    });

    it('should filter out sessions with 0 prompts from within projects', async () => {
      const mockProjects = [
        {
          id: 'proj-1',
          name: 'Project One',
          sessions: [
            { id: 'sess-1', promptCount: 5, platform: 'claude_code' },
            { id: 'sess-2', promptCount: 0, platform: 'claude_code' },
          ],
        },
        {
          id: 'proj-2',
          name: 'Project Two',
          sessions: [
            { id: 'sess-3', promptCount: 0, platform: 'cursor' },
            { id: 'sess-4', promptCount: 2, platform: 'cursor' },
          ],
        },
      ];

      sharedContext.sessionManagerService!.getSessions = vi.fn().mockReturnValue([]);
      sharedContext.sessionManagerService!.getAllProjects = vi.fn().mockReturnValue(mockProjects);

      await handler.handleMessage('v2GetSessionList', {});

      // Sessions are now derived from projects (flattened)
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SessionList', {
        sessions: [
          { id: 'sess-1', promptCount: 5, platform: 'claude_code' },
          { id: 'sess-4', promptCount: 2, platform: 'cursor' },
        ],
        projects: [
          {
            id: 'proj-1',
            name: 'Project One',
            sessions: [{ id: 'sess-1', promptCount: 5, platform: 'claude_code' }],
          },
          {
            id: 'proj-2',
            name: 'Project Two',
            sessions: [{ id: 'sess-4', promptCount: 2, platform: 'cursor' }],
          },
        ],
      });
    });

    it('should filter both sessions and project sessions simultaneously', async () => {
      const mockSessions = [
        { id: 'sess-1', promptCount: 5, platform: 'claude_code' },
        { id: 'sess-2', promptCount: 0, platform: 'claude_code' },
      ];

      const mockProjects = [
        {
          id: 'proj-1',
          name: 'Project One',
          sessions: [
            { id: 'sess-1', promptCount: 5, platform: 'claude_code' },
            { id: 'sess-2', promptCount: 0, platform: 'claude_code' },
          ],
        },
      ];

      sharedContext.sessionManagerService!.getSessions = vi.fn().mockReturnValue(mockSessions);
      sharedContext.sessionManagerService!.getAllProjects = vi.fn().mockReturnValue(mockProjects);

      await handler.handleMessage('v2GetSessionList', {});

      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SessionList', {
        sessions: [{ id: 'sess-1', promptCount: 5, platform: 'claude_code' }],
        projects: [
          {
            id: 'proj-1',
            name: 'Project One',
            sessions: [{ id: 'sess-1', promptCount: 5, platform: 'claude_code' }],
          },
        ],
      });
    });

    it('should return empty sessions when all have 0 prompts', async () => {
      const mockSessions = [
        { id: 'sess-1', promptCount: 0, platform: 'claude_code' },
        { id: 'sess-2', promptCount: 0, platform: 'cursor' },
      ];

      const mockProjects = [
        {
          id: 'proj-1',
          name: 'Project One',
          sessions: [
            { id: 'sess-1', promptCount: 0, platform: 'claude_code' },
            { id: 'sess-2', promptCount: 0, platform: 'cursor' },
          ],
        },
      ];

      sharedContext.sessionManagerService!.getSessions = vi.fn().mockReturnValue(mockSessions);
      sharedContext.sessionManagerService!.getAllProjects = vi.fn().mockReturnValue(mockProjects);

      await handler.handleMessage('v2GetSessionList', {});

      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SessionList', {
        sessions: [],
        projects: [
          {
            id: 'proj-1',
            name: 'Project One',
            sessions: [],
          },
        ],
      });
    });
  });

  describe('error handling', () => {
    it('should handle errors in v2GetActiveSession gracefully', async () => {
      sharedContext.sessionManagerService!.getActiveSession = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      const result = await handler.handleMessage('v2GetActiveSession', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2ActiveSession', {
        sessionId: null,
        session: null,
        project: null,
        goal: null,
      });
    });

    it('should handle errors in v2GetDailyStats gracefully', async () => {
      sharedContext.dailyStatsService!.getDailyStats = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      const result = await handler.handleMessage('v2GetDailyStats', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2DailyStats', {
        stats: null,
        error: 'Failed to load stats',
      });
    });
  });

  describe('goal progress cache', () => {
    it('should preserve goalProgress from hook-captured sessions', async () => {
      const mockProjects = [
        {
          id: 'proj-1',
          name: 'Project One',
          sessions: [
            {
              id: 'sess-1',
              promptCount: 5,
              platform: 'claude_code',
              goalProgress: 65,
              goal: 'Implement feature X',
              customName: 'Feature X Session',
            },
          ],
        },
      ];

      sharedContext.sessionManagerService!.getAllProjects = vi.fn().mockReturnValue(mockProjects);

      await handler.handleMessage('v2GetSessionList', {});

      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SessionList', {
        sessions: expect.arrayContaining([
          expect.objectContaining({
            id: 'sess-1',
            goalProgress: 65,
            goal: 'Implement feature X',
            customName: 'Feature X Session',
          }),
        ]),
        projects: expect.arrayContaining([
          expect.objectContaining({
            sessions: expect.arrayContaining([
              expect.objectContaining({
                goalProgress: 65,
                goal: 'Implement feature X',
                customName: 'Feature X Session',
              }),
            ]),
          }),
        ]),
      });
    });

    it('should cache goalProgress and apply on subsequent calls', async () => {
      // First call: session has goalProgress
      const mockProjectsWithProgress = [
        {
          id: 'proj-1',
          name: 'Project One',
          sessions: [
            {
              id: 'sess-1',
              promptCount: 5,
              platform: 'claude_code',
              goalProgress: 70,
              goal: 'Fix bug Y',
            },
          ],
        },
      ];

      sharedContext.sessionManagerService!.getAllProjects = vi.fn().mockReturnValue(mockProjectsWithProgress);
      await handler.handleMessage('v2GetSessionList', {});

      // Second call: same session but goalProgress is undefined (simulating refresh)
      const mockProjectsWithoutProgress = [
        {
          id: 'proj-1',
          name: 'Project One',
          sessions: [
            {
              id: 'sess-1',
              promptCount: 6,
              platform: 'claude_code',
              goalProgress: undefined, // Simulating data loss
              goal: undefined,
            },
          ],
        },
      ];

      sharedContext.sessionManagerService!.getAllProjects = vi.fn().mockReturnValue(mockProjectsWithoutProgress);
      await handler.handleMessage('v2GetSessionList', {});

      // goalProgress should be preserved from cache
      expect(mockSender.sendMessage).toHaveBeenLastCalledWith('v2SessionList', {
        sessions: expect.arrayContaining([
          expect.objectContaining({
            id: 'sess-1',
            goalProgress: 70,
            goal: 'Fix bug Y',
          }),
        ]),
        projects: expect.any(Array),
      });
    });

    it('should match sessions by sourceSessionId for cross-source caching', async () => {
      // First call: hook-captured session with sourceSessionId
      // Hook sessions store just the UUID in metadata.sourceSessionId
      const sessionUUID = 'f1d6dcd9-df87-4b88-ae37-f4a0515de559';
      const mockHookProjects = [
        {
          id: 'proj-1',
          name: 'Project One',
          sessions: [
            {
              id: 'hook-sess-123',
              promptCount: 5,
              platform: 'claude_code',
              goalProgress: 80,
              goal: 'Refactor module Z',
              customName: 'Refactor Session',
              metadata: {
                sourceSessionId: sessionUUID,
              },
            },
          ],
        },
      ];

      sharedContext.sessionManagerService!.getAllProjects = vi.fn().mockReturnValue(mockHookProjects);
      await handler.handleMessage('v2GetSessionList', {});

      // Second call: UnifiedSessionService session with matching ID
      // Claude session ID format: "claude-projectDir/fileName/sessionUUID"
      // The getSourceSessionId() method extracts just the UUID (last segment) for matching
      const claudeSessionId = `claude-C--DevArk-myproject/session-file.jsonl/${sessionUUID}`;
      const mockUnifiedProjects = [
        {
          id: 'proj-1',
          name: 'Project One',
          sessions: [
            {
              id: claudeSessionId, // Full path format, UUID extracted for matching
              promptCount: 5,
              platform: 'claude_code',
              goalProgress: undefined, // No goalProgress from JSONL
              goal: undefined,
              customName: undefined,
            },
          ],
        },
      ];

      sharedContext.sessionManagerService!.getAllProjects = vi.fn().mockReturnValue(mockUnifiedProjects);
      await handler.handleMessage('v2GetSessionList', {});

      // goalProgress should be applied via sourceSessionId matching (UUID extracted from full path)
      expect(mockSender.sendMessage).toHaveBeenLastCalledWith('v2SessionList', {
        sessions: expect.arrayContaining([
          expect.objectContaining({
            id: claudeSessionId,
            goalProgress: 80,
            goal: 'Refactor module Z',
            customName: 'Refactor Session',
          }),
        ]),
        projects: expect.any(Array),
      });
    });

    it('should extract UUID from Windows-encoded Claude session paths', async () => {
      // Windows paths are encoded with dashes in the projectDir folder name
      // Format: "claude-C--Users-97254-Documents-MyProject/session-2024-01-15.jsonl/UUID"
      const sessionUUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const windowsEncodedPath = 'C--Users-97254-Documents-MyProject';
      const claudeSessionId = `claude-${windowsEncodedPath}/session-2024-01-15.jsonl/${sessionUUID}`;

      // First call: hook session with just the UUID as sourceSessionId
      const mockHookProjects = [
        {
          id: 'proj-1',
          name: 'Project One',
          sessions: [
            {
              id: 'hook-sess-456',
              promptCount: 3,
              platform: 'claude_code',
              goalProgress: 45,
              goal: 'Fix Windows path bug',
              metadata: {
                sourceSessionId: sessionUUID,
              },
            },
          ],
        },
      ];

      sharedContext.sessionManagerService!.getAllProjects = vi.fn().mockReturnValue(mockHookProjects);
      await handler.handleMessage('v2GetSessionList', {});

      // Second call: Claude session with Windows-encoded path
      const mockUnifiedProjects = [
        {
          id: 'proj-1',
          name: 'Project One',
          sessions: [
            {
              id: claudeSessionId,
              promptCount: 3,
              platform: 'claude_code',
              goalProgress: undefined,
              goal: undefined,
            },
          ],
        },
      ];

      sharedContext.sessionManagerService!.getAllProjects = vi.fn().mockReturnValue(mockUnifiedProjects);
      await handler.handleMessage('v2GetSessionList', {});

      // goalProgress should be applied - UUID correctly extracted despite complex path
      expect(mockSender.sendMessage).toHaveBeenLastCalledWith('v2SessionList', {
        sessions: expect.arrayContaining([
          expect.objectContaining({
            id: claudeSessionId,
            goalProgress: 45,
            goal: 'Fix Windows path bug',
          }),
        ]),
        projects: expect.any(Array),
      });
    });

    it('should update goal progress cache via updateGoalProgressCache method', async () => {
      // Update cache directly
      handler.updateGoalProgressCache('sess-direct', 55, 'Direct goal', 'Direct session');

      // Now get session list with a session that matches
      const mockProjects = [
        {
          id: 'proj-1',
          name: 'Project One',
          sessions: [
            {
              id: 'sess-direct',
              promptCount: 3,
              platform: 'claude_code',
              goalProgress: undefined,
              goal: undefined,
              customName: undefined,
            },
          ],
        },
      ];

      sharedContext.sessionManagerService!.getAllProjects = vi.fn().mockReturnValue(mockProjects);
      await handler.handleMessage('v2GetSessionList', {});

      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SessionList', {
        sessions: expect.arrayContaining([
          expect.objectContaining({
            id: 'sess-direct',
            goalProgress: 55,
            goal: 'Direct goal',
            customName: 'Direct session',
          }),
        ]),
        projects: expect.any(Array),
      });
    });

    it('should not overwrite existing goal/customName with undefined from cache', async () => {
      // Cache has partial data (only progress)
      handler.updateGoalProgressCache('sess-partial', 40);

      // Session already has goal and customName
      const mockProjects = [
        {
          id: 'proj-1',
          name: 'Project One',
          sessions: [
            {
              id: 'sess-partial',
              promptCount: 3,
              platform: 'claude_code',
              goalProgress: undefined,
              goal: 'Existing goal',
              customName: 'Existing name',
            },
          ],
        },
      ];

      sharedContext.sessionManagerService!.getAllProjects = vi.fn().mockReturnValue(mockProjects);
      await handler.handleMessage('v2GetSessionList', {});

      // goalProgress should be applied but existing goal/customName preserved
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SessionList', {
        sessions: expect.arrayContaining([
          expect.objectContaining({
            id: 'sess-partial',
            goalProgress: 40,
            goal: 'Existing goal',
            customName: 'Existing name',
          }),
        ]),
        projects: expect.any(Array),
      });
    });
  });
});
