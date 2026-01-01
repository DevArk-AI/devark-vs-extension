import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { CoachingHandler } from '../coaching-handler';
import { SharedContext } from '../shared-context';
import type { MessageSender } from '../base-handler';
import type * as vscode from 'vscode';
import type { CoachingSuggestion, CoachingData } from '../../../services/types/coaching-types';

// Mock vscode module - must be defined inline due to hoisting
vi.mock('vscode', () => ({
  env: {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  },
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
  },
}));

// Import the mocked module to get access to the mock functions
import * as vscodeModule from 'vscode';
const mockClipboardWriteText = vscodeModule.env.clipboard.writeText as Mock;
const mockShowInformationMessage = vscodeModule.window.showInformationMessage as Mock;
const mockShowWarningMessage = vscodeModule.window.showWarningMessage as Mock;

const mockUri = { fsPath: '/test/path' } as vscode.Uri;

// Mock coaching service - define functions first, then use in mock
const mockGetCurrentCoaching = vi.fn().mockReturnValue(null);
const mockDismissSuggestion = vi.fn();
const mockGetState = vi.fn().mockReturnValue({
  isListening: true,
  onCooldown: false,
  currentCoaching: null,
});
const mockSetCurrentPromptId = vi.fn();
const mockGetCoachingForPrompt = vi.fn().mockResolvedValue(null);

vi.mock('../../../services/CoachingService', () => ({
  getCoachingService: () => ({
    getCurrentCoaching: mockGetCurrentCoaching,
    dismissSuggestion: mockDismissSuggestion,
    getState: mockGetState,
    setCurrentPromptId: mockSetCurrentPromptId,
    getCoachingForPrompt: mockGetCoachingForPrompt,
  }),
}));

describe('CoachingHandler', () => {
  let handler: CoachingHandler;
  let mockSender: MessageSender;
  let sharedContext: SharedContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSender = { sendMessage: vi.fn() };
    sharedContext = new SharedContext();

    sharedContext.chatInjector = {
      injectIntoCursor: vi.fn().mockResolvedValue(true),
      injectIntoClaudeCode: vi.fn().mockResolvedValue(true),
    } as unknown as SharedContext['chatInjector'];

    handler = new CoachingHandler(
      mockSender,
      { extensionUri: mockUri, context: {} as vscode.ExtensionContext },
      sharedContext
    );
  });

  describe('getHandledMessageTypes', () => {
    it('should return correct message types', () => {
      const types = handler.getHandledMessageTypes();
      expect(types).toContain('useCoachingSuggestion');
      expect(types).toContain('dismissCoachingSuggestion');
      expect(types).toContain('getCoachingStatus');
      expect(types).toContain('getCoachingForPrompt');
      expect(types).toHaveLength(4);
    });
  });

  describe('handleMessage', () => {
    it('should handle getCoachingStatus', async () => {
      const result = await handler.handleMessage('getCoachingStatus', {});
      expect(result).toBe(true);
      expect(mockGetState).toHaveBeenCalled();
      expect(mockSender.sendMessage).toHaveBeenCalledWith('coachingStatus', {
        coaching: null,
        isListening: true,
        onCooldown: false,
      });
    });

    it('should handle dismissCoachingSuggestion', async () => {
      const result = await handler.handleMessage('dismissCoachingSuggestion', { id: 'suggestion-1' });
      expect(result).toBe(true);
      expect(mockDismissSuggestion).toHaveBeenCalledWith('suggestion-1');
      expect(mockSender.sendMessage).toHaveBeenCalledWith('coachingUpdated', expect.any(Object));
    });

    it('should handle dismissCoachingSuggestion without id gracefully', async () => {
      const result = await handler.handleMessage('dismissCoachingSuggestion', {});
      expect(result).toBe(true);
      expect(mockDismissSuggestion).not.toHaveBeenCalled();
    });

    it('should handle useCoachingSuggestion with cursor source', async () => {
      mockGetCurrentCoaching.mockReturnValue({ source: 'cursor' });
      const suggestion: CoachingSuggestion = {
        id: 'suggestion-1',
        type: 'follow_up',
        title: 'Add tests',
        description: 'Add tests for the new function',
        suggestedPrompt: 'Write unit tests for the UserService.authenticate method',
        confidence: 0.9,
        reasoning: 'New code needs tests',
      };

      const result = await handler.handleMessage('useCoachingSuggestion', { suggestion });
      expect(result).toBe(true);
      expect(sharedContext.chatInjector!.injectIntoCursor).toHaveBeenCalledWith(suggestion.suggestedPrompt);
      expect(mockDismissSuggestion).toHaveBeenCalledWith('suggestion-1');
      expect(mockSender.sendMessage).toHaveBeenCalledWith('coachingUpdated', expect.any(Object));
    });

    it('should handle useCoachingSuggestion without suggestion gracefully', async () => {
      const result = await handler.handleMessage('useCoachingSuggestion', {});
      expect(result).toBe(true);
      expect(sharedContext.chatInjector!.injectIntoCursor).not.toHaveBeenCalled();
    });

    it('should handle useCoachingSuggestion without suggestedPrompt gracefully', async () => {
      const result = await handler.handleMessage('useCoachingSuggestion', {
        suggestion: { id: 'suggestion-1' },
      });
      expect(result).toBe(true);
      expect(sharedContext.chatInjector!.injectIntoCursor).not.toHaveBeenCalled();
    });

    it('should handle getCoachingForPrompt', async () => {
      const mockCoaching: CoachingData = {
        analysis: {
          summary: 'Test summary',
          outcome: 'success',
          topicsAddressed: ['testing'],
          entitiesModified: ['src/test.ts'],
        },
        suggestions: [],
        timestamp: new Date(),
        promptId: 'prompt-1',
      };
      mockGetCoachingForPrompt.mockResolvedValue(mockCoaching);

      const result = await handler.handleMessage('getCoachingForPrompt', { promptId: 'prompt-1' });
      expect(result).toBe(true);
      expect(mockSetCurrentPromptId).toHaveBeenCalledWith('prompt-1');
      expect(mockGetCoachingForPrompt).toHaveBeenCalledWith('prompt-1');
      expect(mockSender.sendMessage).toHaveBeenCalledWith('coachingUpdated', { coaching: mockCoaching });
    });

    it('should handle getCoachingForPrompt without promptId', async () => {
      const result = await handler.handleMessage('getCoachingForPrompt', {});
      expect(result).toBe(true);
      expect(mockSetCurrentPromptId).not.toHaveBeenCalled();
      expect(mockSender.sendMessage).toHaveBeenCalledWith('coachingUpdated', { coaching: null });
    });

    it('should return false for unhandled message types', async () => {
      const result = await handler.handleMessage('unknownType', {});
      expect(result).toBe(false);
    });
  });

  describe('chatInjector integration', () => {
    it('should work without chatInjector configured', async () => {
      sharedContext.chatInjector = undefined;

      const suggestion: CoachingSuggestion = {
        id: 'suggestion-1',
        type: 'follow_up',
        title: 'Test',
        description: 'Test description',
        suggestedPrompt: 'Test prompt',
        confidence: 0.9,
        reasoning: 'Test reasoning',
      };

      const result = await handler.handleMessage('useCoachingSuggestion', { suggestion });
      expect(result).toBe(true);
      // Should still dismiss the suggestion
      expect(mockDismissSuggestion).toHaveBeenCalledWith('suggestion-1');
    });
  });

  describe('useCoachingSuggestion source routing', () => {
    const suggestion: CoachingSuggestion = {
      id: 'suggestion-1',
      type: 'follow_up',
      title: 'Add tests',
      description: 'Add tests for the new function',
      suggestedPrompt: 'Write unit tests',
      confidence: 0.9,
      reasoning: 'New code needs tests',
    };

    it('should call injectIntoCursor when source is cursor', async () => {
      mockGetCurrentCoaching.mockReturnValue({ source: 'cursor' });

      await handler.handleMessage('useCoachingSuggestion', { suggestion });

      expect(sharedContext.chatInjector!.injectIntoCursor).toHaveBeenCalledWith(suggestion.suggestedPrompt);
      expect(sharedContext.chatInjector!.injectIntoClaudeCode).not.toHaveBeenCalled();
    });

    it('should call injectIntoClaudeCode when source is claude_code', async () => {
      mockGetCurrentCoaching.mockReturnValue({ source: 'claude_code' });

      await handler.handleMessage('useCoachingSuggestion', { suggestion });

      expect(sharedContext.chatInjector!.injectIntoClaudeCode).toHaveBeenCalledWith(suggestion.suggestedPrompt);
      expect(sharedContext.chatInjector!.injectIntoCursor).not.toHaveBeenCalled();
    });

    it('should fallback to clipboard when source is undefined', async () => {
      mockGetCurrentCoaching.mockReturnValue({ source: undefined });

      await handler.handleMessage('useCoachingSuggestion', { suggestion });

      expect(mockClipboardWriteText).toHaveBeenCalledWith(suggestion.suggestedPrompt);
      expect(sharedContext.chatInjector!.injectIntoCursor).not.toHaveBeenCalled();
      expect(sharedContext.chatInjector!.injectIntoClaudeCode).not.toHaveBeenCalled();
    });

    it('should fallback to clipboard when injectIntoCursor fails', async () => {
      mockGetCurrentCoaching.mockReturnValue({ source: 'cursor' });
      (sharedContext.chatInjector!.injectIntoCursor as Mock).mockResolvedValue(false);

      await handler.handleMessage('useCoachingSuggestion', { suggestion });

      expect(mockClipboardWriteText).toHaveBeenCalledWith(suggestion.suggestedPrompt);
      expect(mockShowWarningMessage).toHaveBeenCalled();
    });

    it('should fallback to clipboard when coaching has no source', async () => {
      mockGetCurrentCoaching.mockReturnValue(null);

      await handler.handleMessage('useCoachingSuggestion', { suggestion });

      expect(mockClipboardWriteText).toHaveBeenCalledWith(suggestion.suggestedPrompt);
      expect(mockShowInformationMessage).toHaveBeenCalled();
    });
  });
});
