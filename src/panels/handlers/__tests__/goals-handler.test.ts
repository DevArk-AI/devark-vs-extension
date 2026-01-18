import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoalsHandler } from '../goals-handler';
import { SharedContext } from '../shared-context';
import type { MessageSender } from '../base-handler';
import type * as vscode from 'vscode';

const mockUri = { fsPath: '/test/path' } as vscode.Uri;

describe('GoalsHandler', () => {
  let handler: GoalsHandler;
  let mockSender: MessageSender;
  let sharedContext: SharedContext;

  beforeEach(() => {
    mockSender = { sendMessage: vi.fn() };
    sharedContext = new SharedContext();

    sharedContext.goalService = {
      getGoalStatus: vi.fn().mockReturnValue({
        hasGoal: true,
        goalText: 'Test goal',
        progress: 50,
      }),
      setGoal: vi.fn().mockResolvedValue(undefined),
      completeGoal: vi.fn().mockResolvedValue(undefined),
      clearGoal: vi.fn().mockResolvedValue(undefined),
      analyzeGoalProgress: vi.fn().mockResolvedValue({
        progress: 50,
        reasoning: 'Test reasoning',
        inferredGoal: 'Implement user authentication',
      }),
      setProgressUpdateCallback: vi.fn(),
    } as unknown as SharedContext['goalService'];

    sharedContext.sessionManagerService = {
      getActiveSession: vi.fn().mockReturnValue({
        id: 'session-1',
        projectId: 'proj-1',
        prompts: [{ id: 'prompt-1', text: 'test' }],
      }),
      getSessions: vi.fn().mockReturnValue([]),
      getAllProjects: vi.fn().mockReturnValue([]),
    } as unknown as SharedContext['sessionManagerService'];

    handler = new GoalsHandler(
      mockSender,
      { extensionUri: mockUri, context: {} as vscode.ExtensionContext },
      sharedContext
    );
  });

  describe('getHandledMessageTypes', () => {
    it('should return correct message types', () => {
      const types = handler.getHandledMessageTypes();
      expect(types).toContain('v2GetGoalStatus');
      expect(types).toContain('v2SetGoal');
      expect(types).toContain('v2CompleteGoal');
      expect(types).toContain('v2ClearGoal');
      expect(types).toContain('v2AnalyzeGoalProgress');
      expect(types).toContain('completeGoal');
      // Removed message types (goals are now auto-set via progress analysis):
      expect(types).not.toContain('v2InferGoal');
      expect(types).not.toContain('v2MaybeLaterGoal');
      expect(types).not.toContain('v2DontAskGoal');
      expect(types).not.toContain('editGoal');
      expect(types).toHaveLength(6);
    });
  });

  describe('handleMessage', () => {
    it('should handle v2GetGoalStatus', async () => {
      const result = await handler.handleMessage('v2GetGoalStatus', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2GoalStatus', expect.objectContaining({
        goal: 'Test goal',
        status: expect.objectContaining({
          hasGoal: true,
        }),
      }));
    });

    it('should handle v2SetGoal', async () => {
      const result = await handler.handleMessage('v2SetGoal', { goalText: 'New goal' });
      expect(result).toBe(true);
      expect(sharedContext.goalService!.setGoal).toHaveBeenCalledWith('New goal');
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2GoalSet', expect.objectContaining({
        success: true,
      }));
    });

    it('should handle v2SetGoal without goal text', async () => {
      const result = await handler.handleMessage('v2SetGoal', {});
      expect(result).toBe(true);
      expect(sharedContext.goalService!.setGoal).not.toHaveBeenCalled();
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2GoalSet', {
        success: false,
        error: 'No goal text provided',
      });
    });

    it('should handle v2CompleteGoal', async () => {
      const result = await handler.handleMessage('v2CompleteGoal', {});
      expect(result).toBe(true);
      expect(sharedContext.goalService!.completeGoal).toHaveBeenCalled();
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2GoalCompleted', expect.objectContaining({
        success: true,
      }));
    });

    it('should handle completeGoal (legacy alias)', async () => {
      const result = await handler.handleMessage('completeGoal', {});
      expect(result).toBe(true);
      expect(sharedContext.goalService!.completeGoal).toHaveBeenCalled();
    });

    it('should handle v2ClearGoal', async () => {
      const result = await handler.handleMessage('v2ClearGoal', {});
      expect(result).toBe(true);
      expect(sharedContext.goalService!.clearGoal).toHaveBeenCalled();
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2GoalCleared', {});
    });

    it('should handle v2AnalyzeGoalProgress', async () => {
      const result = await handler.handleMessage('v2AnalyzeGoalProgress', { sessionId: 'session-1' });
      expect(result).toBe(true);
      expect(sharedContext.goalService!.analyzeGoalProgress).toHaveBeenCalledWith('session-1');
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2GoalProgressAnalysis', expect.objectContaining({
        success: true,
        progress: 50,
        inferredGoal: 'Implement user authentication',
      }));
    });

    it('should return false for unhandled message types', async () => {
      const result = await handler.handleMessage('unknownType', {});
      expect(result).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle errors in v2GetGoalStatus gracefully', async () => {
      sharedContext.goalService!.getGoalStatus = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      const result = await handler.handleMessage('v2GetGoalStatus', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2GoalStatus', {
        goal: null,
        status: null,
      });
    });

    it('should handle errors in v2SetGoal gracefully', async () => {
      sharedContext.goalService!.setGoal = vi.fn().mockRejectedValue(new Error('Test error'));

      const result = await handler.handleMessage('v2SetGoal', { goalText: 'New goal' });
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2GoalSet', {
        success: false,
        error: 'Failed to set goal',
      });
    });

    it('should handle errors in v2AnalyzeGoalProgress gracefully', async () => {
      sharedContext.goalService!.analyzeGoalProgress = vi.fn().mockRejectedValue(new Error('Test error'));

      const result = await handler.handleMessage('v2AnalyzeGoalProgress', { sessionId: 'session-1' });
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2GoalProgressAnalysis', {
        success: false,
        error: 'Analysis failed',
      });
    });
  });
});
