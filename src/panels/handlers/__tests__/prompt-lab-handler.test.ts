import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptLabHandler } from '../prompt-lab-handler';
import { SharedContext } from '../shared-context';
import type { MessageSender } from '../base-handler';
import type * as vscode from 'vscode';

const mockUri = { fsPath: '/test/path' } as vscode.Uri;

// Mock ExtensionState
vi.mock('../../../extension-state', () => ({
  ExtensionState: {
    getLLMManager: vi.fn(),
  },
}));

// Mock vscode
vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  },
}));

// Mock context-utils
vi.mock('../../../services/context-utils', () => ({
  gatherPromptContext: vi.fn().mockResolvedValue({
    techStack: ['TypeScript', 'React'],
    goal: 'Testing',
    codeSnippets: [],
    recentTopics: [],
  }),
}));

describe('PromptLabHandler', () => {
  let handler: PromptLabHandler;
  let mockSender: MessageSender;
  let sharedContext: SharedContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSender = { sendMessage: vi.fn() };
    sharedContext = new SharedContext();

    // Mock saved prompts store
    sharedContext.savedPromptsStore = {
      getAll: vi.fn().mockReturnValue([
        { id: '1', text: 'Test prompt 1', tags: ['test'], createdAt: new Date(), lastModifiedAt: new Date() },
        { id: '2', text: 'Test prompt 2', tags: ['demo'], createdAt: new Date(), lastModifiedAt: new Date() },
      ]),
      getAllTags: vi.fn().mockReturnValue(['test', 'demo']),
      getAllFolders: vi.fn().mockReturnValue(['folder1']),
      savePrompt: vi.fn(),
      deletePrompt: vi.fn(),
      updatePrompt: vi.fn(),
    } as any;

    handler = new PromptLabHandler(
      mockSender,
      { extensionUri: mockUri, context: {} as vscode.ExtensionContext },
      sharedContext
    );
  });

  describe('getHandledMessageTypes', () => {
    it('should return correct message types', () => {
      const types = handler.getHandledMessageTypes();
      expect(types).toContain('analyzePromptLabPrompt');
      expect(types).toContain('savePromptToLibrary');
      expect(types).toContain('getSavedPrompts');
      expect(types).toContain('deleteSavedPrompt');
      expect(types).toContain('renamePrompt');
      expect(types).toHaveLength(5);
    });
  });

  describe('handleMessage', () => {
    it('should handle getSavedPrompts message', async () => {
      const result = await handler.handleMessage('getSavedPrompts', {});

      expect(result).toBe(true);
      expect(sharedContext.savedPromptsStore!.getAll).toHaveBeenCalled();
      expect(sharedContext.savedPromptsStore!.getAllTags).toHaveBeenCalled();
      expect(sharedContext.savedPromptsStore!.getAllFolders).toHaveBeenCalled();
      expect(mockSender.sendMessage).toHaveBeenCalledWith('savedPromptsLoaded', {
        prompts: expect.arrayContaining([
          expect.objectContaining({ id: '1', text: 'Test prompt 1' }),
          expect.objectContaining({ id: '2', text: 'Test prompt 2' }),
        ]),
        tags: ['test', 'demo'],
        folders: ['folder1'],
      });
    });

    it('should return false for unknown messages', async () => {
      const result = await handler.handleMessage('unknownMessage', {});
      expect(result).toBe(false);
      expect(mockSender.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle deleteSavedPrompt message', async () => {
      const result = await handler.handleMessage('deleteSavedPrompt', { id: 'test-id' });

      expect(result).toBe(true);
      expect(sharedContext.savedPromptsStore!.deletePrompt).toHaveBeenCalledWith('test-id');
      // Should also refresh the list
      expect(mockSender.sendMessage).toHaveBeenCalledWith('savedPromptsLoaded', expect.any(Object));
    });

    it('should handle renamePrompt message', async () => {
      const result = await handler.handleMessage('renamePrompt', {
        id: 'test-id',
        name: 'New Name'
      });

      expect(result).toBe(true);
      expect(sharedContext.savedPromptsStore!.updatePrompt).toHaveBeenCalledWith('test-id', { name: 'New Name' });
      // Should also refresh the list
      expect(mockSender.sendMessage).toHaveBeenCalledWith('savedPromptsLoaded', expect.any(Object));
    });

    it('should handle savePromptToLibrary message', async () => {
      const result = await handler.handleMessage('savePromptToLibrary', {
        text: 'New prompt text',
        name: 'My Prompt',
        tags: ['important'],
      });

      expect(result).toBe(true);
      expect(sharedContext.savedPromptsStore!.savePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'New prompt text',
          name: 'My Prompt',
          tags: ['important'],
        })
      );
    });

    it('should skip save if no text provided', async () => {
      const result = await handler.handleMessage('savePromptToLibrary', { name: 'No text' });

      expect(result).toBe(true);
      expect(sharedContext.savedPromptsStore!.savePrompt).not.toHaveBeenCalled();
    });

    it('should skip delete if no id provided', async () => {
      const result = await handler.handleMessage('deleteSavedPrompt', {});

      expect(result).toBe(true);
      expect(sharedContext.savedPromptsStore!.deletePrompt).not.toHaveBeenCalled();
    });

    it('should skip rename if id or name missing', async () => {
      let result = await handler.handleMessage('renamePrompt', { id: 'test' });
      expect(result).toBe(true);
      expect(sharedContext.savedPromptsStore!.updatePrompt).not.toHaveBeenCalled();

      result = await handler.handleMessage('renamePrompt', { name: 'test' });
      expect(result).toBe(true);
      expect(sharedContext.savedPromptsStore!.updatePrompt).not.toHaveBeenCalled();
    });
  });

  describe('when savedPromptsStore not available', () => {
    beforeEach(() => {
      sharedContext.savedPromptsStore = undefined;
    });

    it('should handle getSavedPrompts gracefully', async () => {
      const result = await handler.handleMessage('getSavedPrompts', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle savePromptToLibrary gracefully', async () => {
      const result = await handler.handleMessage('savePromptToLibrary', { text: 'test' });
      expect(result).toBe(true);
    });

    it('should handle deleteSavedPrompt gracefully', async () => {
      const result = await handler.handleMessage('deleteSavedPrompt', { id: 'test' });
      expect(result).toBe(true);
    });

    it('should handle renamePrompt gracefully', async () => {
      const result = await handler.handleMessage('renamePrompt', { id: 'test', name: 'new' });
      expect(result).toBe(true);
    });
  });
});
