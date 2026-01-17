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
      inferGoalWithLLM: vi.fn().mockResolvedValue({
        suggestedGoal: 'Implement user authentication',
        confidence: 0.85,
        detectedTheme: 'authentication',
      }),
    } as unknown as SharedContext['goalService'];

    sharedContext.sessionManagerService = {
      getActiveSession: vi.fn().mockReturnValue({
        id: 'session-1',
        projectId: 'proj-1',
        prompts: [{ id: 'prompt-1', text: 'test' }],
      }),
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
      expect(types).toContain('v2InferGoal');
      expect(types).toContain('v2MaybeLaterGoal');
      expect(types).toContain('v2DontAskGoal');
      expect(types).toContain('v2AnalyzeGoalProgress');
      expect(types).toContain('editGoal');
      expect(types).toContain('completeGoal');
      expect(types).toContain('v2ClearGoal');
      expect(types).toHaveLength(10);
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

    it('should handle v2MaybeLaterGoal', async () => {
      sharedContext.goalService!.setConfig = vi.fn();
      const result = await handler.handleMessage('v2MaybeLaterGoal', {});
      expect(result).toBe(true);
      expect(sharedContext.goalService!.setConfig).toHaveBeenCalledWith({ noGoalSuggestionDelayMinutes: 30 });
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2GoalInferenceDismissed', { reason: 'maybe_later' });
    });

    it('should handle v2DontAskGoal', async () => {
      sharedContext.goalService!.setConfig = vi.fn();
      const result = await handler.handleMessage('v2DontAskGoal', {});
      expect(result).toBe(true);
      expect(sharedContext.goalService!.setConfig).toHaveBeenCalledWith({ noGoalSuggestionDelayMinutes: 999999 });
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2GoalInferenceDismissed', { reason: 'dont_ask' });
    });

    it('should handle v2InferGoal', async () => {
      const result = await handler.handleMessage('v2InferGoal', {});
      expect(result).toBe(true);
      expect(sharedContext.goalService!.inferGoalWithLLM).toHaveBeenCalled();
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2GoalInference', expect.objectContaining({
        inference: expect.objectContaining({
          suggestedGoal: 'Implement user authentication',
          confidence: 0.85,
        }),
      }));
    });

    it('should handle editGoal', async () => {
      const result = await handler.handleMessage('editGoal', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('openGoalEditor', {
        currentGoal: 'Test goal',
      });
    });

    it('should return false for unhandled message types', async () => {
      const result = await handler.handleMessage('unknownType', {});
      expect(result).toBe(false);
    });
  });

  describe('triggerGoalInferenceIfNeeded', () => {
    it('should trigger inference on first prompt when no goal set', async () => {
      // Configure no goal set
      sharedContext.goalService!.getGoalStatus = vi.fn().mockReturnValue({
        hasGoal: false,
        goalText: null,
      });

      // Only one prompt in session (first prompt)
      sharedContext.sessionManagerService!.getActiveSession = vi.fn().mockReturnValue({
        id: 'session-1',
        prompts: [{ id: 'prompt-1', text: 'test' }],
      });

      handler.triggerGoalInferenceIfNeeded();

      // Wait for async call
      await vi.waitFor(() => {
        expect(sharedContext.goalService!.inferGoalWithLLM).toHaveBeenCalled();
      });
    });

    it('should not trigger inference when goal already set', () => {
      // Goal is already set
      sharedContext.goalService!.getGoalStatus = vi.fn().mockReturnValue({
        hasGoal: true,
        goalText: 'Existing goal',
      });

      handler.triggerGoalInferenceIfNeeded();

      expect(sharedContext.goalService!.inferGoalWithLLM).not.toHaveBeenCalled();
    });

    it('should not trigger inference when not first prompt', () => {
      sharedContext.goalService!.getGoalStatus = vi.fn().mockReturnValue({
        hasGoal: false,
        goalText: null,
      });

      // Multiple prompts in session
      sharedContext.sessionManagerService!.getActiveSession = vi.fn().mockReturnValue({
        id: 'session-1',
        prompts: [{ id: 'prompt-1' }, { id: 'prompt-2' }],
      });

      handler.triggerGoalInferenceIfNeeded();

      expect(sharedContext.goalService!.inferGoalWithLLM).not.toHaveBeenCalled();
    });

    it('should not trigger inference when no active session', () => {
      sharedContext.goalService!.getGoalStatus = vi.fn().mockReturnValue({
        hasGoal: false,
        goalText: null,
      });

      sharedContext.sessionManagerService!.getActiveSession = vi.fn().mockReturnValue(null);

      handler.triggerGoalInferenceIfNeeded();

      expect(sharedContext.goalService!.inferGoalWithLLM).not.toHaveBeenCalled();
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

    it('should handle errors in v2InferGoal gracefully', async () => {
      sharedContext.goalService!.inferGoalWithLLM = vi.fn().mockRejectedValue(new Error('Test error'));

      const result = await handler.handleMessage('v2InferGoal', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2GoalInference', {
        inference: null,
      });
    });
  });
});
