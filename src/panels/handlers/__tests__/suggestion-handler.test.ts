import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuggestionHandler } from '../suggestion-handler';
import { SharedContext } from '../shared-context';
import type { MessageSender } from '../base-handler';
import type * as vscode from 'vscode';

const mockUri = { fsPath: '/test/path' } as vscode.Uri;

describe('SuggestionHandler', () => {
  let handler: SuggestionHandler;
  let mockSender: MessageSender;
  let sharedContext: SharedContext;

  beforeEach(() => {
    mockSender = { sendMessage: vi.fn() };
    sharedContext = new SharedContext();

    sharedContext.suggestionEngine = {
      handleDismiss: vi.fn(),
      handleNotNow: vi.fn(),
      checkSessionSuggestions: vi.fn().mockReturnValue(null),
    } as unknown as SharedContext['suggestionEngine'];

    sharedContext.goalService = {
      inferGoal: vi.fn().mockReturnValue({
        suggestedGoal: 'Fix the login bug',
        confidence: 0.8,
      }),
      getGoalStatus: vi.fn().mockReturnValue({
        hasGoal: true,
        goalText: 'Fix the login bug',
      }),
      completeGoal: vi.fn(),
    } as unknown as SharedContext['goalService'];

    handler = new SuggestionHandler(
      mockSender,
      { extensionUri: mockUri, context: {} as vscode.ExtensionContext },
      sharedContext
    );
  });

  describe('getHandledMessageTypes', () => {
    it('should return correct message types', () => {
      const types = handler.getHandledMessageTypes();
      expect(types).toContain('v2DismissSuggestion');
      expect(types).toContain('v2NotNowSuggestion');
      expect(types).toContain('v2ApplySuggestion');
      expect(types).toContain('v2CheckSuggestions');
      expect(types).toHaveLength(4);
    });
  });

  describe('handleMessage', () => {
    describe('v2DismissSuggestion', () => {
      it('should dismiss a suggestion', async () => {
        const result = await handler.handleMessage('v2DismissSuggestion', { type: 'add_context' });
        expect(result).toBe(true);
        expect(sharedContext.suggestionEngine!.handleDismiss).toHaveBeenCalledWith('add_context');
        expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SuggestionDismissed', { type: 'add_context' });
      });

      it('should do nothing if type is missing', async () => {
        const result = await handler.handleMessage('v2DismissSuggestion', {});
        expect(result).toBe(true);
        expect(sharedContext.suggestionEngine!.handleDismiss).not.toHaveBeenCalled();
      });
    });

    describe('v2NotNowSuggestion', () => {
      it('should handle not now action', async () => {
        const result = await handler.handleMessage('v2NotNowSuggestion', { type: 'set_goal' });
        expect(result).toBe(true);
        expect(sharedContext.suggestionEngine!.handleNotNow).toHaveBeenCalledWith('set_goal');
        expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SuggestionNotNow', { type: 'set_goal' });
      });

      it('should do nothing if type is missing', async () => {
        const result = await handler.handleMessage('v2NotNowSuggestion', {});
        expect(result).toBe(true);
        expect(sharedContext.suggestionEngine!.handleNotNow).not.toHaveBeenCalled();
      });
    });

    describe('v2ApplySuggestion', () => {
      it('should apply set_goal suggestion', async () => {
        const result = await handler.handleMessage('v2ApplySuggestion', { id: 'set_goal-1234567890' });
        expect(result).toBe(true);
        expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SuggestionApplied', { id: 'set_goal-1234567890', success: true });
        expect(mockSender.sendMessage).toHaveBeenCalledWith('v2GoalInference', {
          inference: expect.objectContaining({ suggestedGoal: 'Fix the login bug' }),
        });
      });

      it('should apply progress_check suggestion and complete goal', async () => {
        const result = await handler.handleMessage('v2ApplySuggestion', { id: 'progress_check-1234567890' });
        expect(result).toBe(true);
        expect(sharedContext.goalService!.completeGoal).toHaveBeenCalled();
        expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SuggestionApplied', { id: 'progress_check-1234567890', success: true });
      });

      it('should apply informational suggestions (add_context)', async () => {
        const result = await handler.handleMessage('v2ApplySuggestion', { id: 'add_context-1234567890' });
        expect(result).toBe(true);
        expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SuggestionApplied', { id: 'add_context-1234567890', success: true });
      });

      it('should apply informational suggestions (be_specific)', async () => {
        const result = await handler.handleMessage('v2ApplySuggestion', { id: 'be_specific-1234567890' });
        expect(result).toBe(true);
        expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SuggestionApplied', { id: 'be_specific-1234567890', success: true });
      });

      it('should handle missing suggestion ID', async () => {
        const result = await handler.handleMessage('v2ApplySuggestion', {});
        expect(result).toBe(true);
        expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SuggestionApplied', {
          id: '',
          success: false,
          error: 'No suggestion ID provided',
        });
      });

      it('should handle invalid suggestion ID format', async () => {
        const result = await handler.handleMessage('v2ApplySuggestion', { id: 'invalid' });
        expect(result).toBe(true);
        expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SuggestionApplied', {
          id: 'invalid',
          success: false,
          error: 'Invalid suggestion ID format',
        });
      });
    });

    describe('v2CheckSuggestions', () => {
      it('should check for suggestions and send if found', async () => {
        const mockSuggestion = {
          id: 'set_goal-123',
          type: 'set_goal',
          title: 'Set a goal',
          content: 'Would you like to set a goal?',
        };
        (sharedContext.suggestionEngine!.checkSessionSuggestions as ReturnType<typeof vi.fn>).mockReturnValue(mockSuggestion);

        const result = await handler.handleMessage('v2CheckSuggestions', {});
        expect(result).toBe(true);
        expect(sharedContext.suggestionEngine!.checkSessionSuggestions).toHaveBeenCalled();
        expect(mockSender.sendMessage).toHaveBeenCalledWith('v2Suggestion', { suggestion: mockSuggestion });
      });

      it('should not send message if no suggestions found', async () => {
        (sharedContext.suggestionEngine!.checkSessionSuggestions as ReturnType<typeof vi.fn>).mockReturnValue(null);

        const result = await handler.handleMessage('v2CheckSuggestions', {});
        expect(result).toBe(true);
        expect(sharedContext.suggestionEngine!.checkSessionSuggestions).toHaveBeenCalled();
        expect(mockSender.sendMessage).not.toHaveBeenCalled();
      });
    });

    it('should return false for unhandled message types', async () => {
      const result = await handler.handleMessage('unknownType', {});
      expect(result).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle missing suggestionEngine in v2DismissSuggestion', async () => {
      sharedContext.suggestionEngine = undefined;
      const result = await handler.handleMessage('v2DismissSuggestion', { type: 'add_context' });
      expect(result).toBe(true);
      expect(mockSender.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle missing suggestionEngine in v2NotNowSuggestion', async () => {
      sharedContext.suggestionEngine = undefined;
      const result = await handler.handleMessage('v2NotNowSuggestion', { type: 'add_context' });
      expect(result).toBe(true);
      expect(mockSender.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle missing suggestionEngine in v2CheckSuggestions', async () => {
      sharedContext.suggestionEngine = undefined;
      const result = await handler.handleMessage('v2CheckSuggestions', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle missing goalService in v2ApplySuggestion for set_goal', async () => {
      sharedContext.goalService = undefined;
      const result = await handler.handleMessage('v2ApplySuggestion', { id: 'set_goal-1234567890' });
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('v2SuggestionApplied', {
        id: 'set_goal-1234567890',
        success: false,
        error: 'Goal service not available',
      });
    });
  });
});
