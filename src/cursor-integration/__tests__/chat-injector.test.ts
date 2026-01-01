import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ChatInjector } from '../chat-injector';

// Mock vscode module
const mockClipboardReadText = vi.fn().mockResolvedValue('');
const mockClipboardWriteText = vi.fn().mockResolvedValue(undefined);
const mockExecuteCommand = vi.fn().mockResolvedValue(undefined);
const mockShowInformationMessage = vi.fn();
const mockShowWarningMessage = vi.fn();
const mockGetExtension = vi.fn();

vi.mock('vscode', () => ({
  env: {
    clipboard: {
      readText: () => mockClipboardReadText(),
      writeText: (text: string) => mockClipboardWriteText(text),
    },
  },
  commands: {
    executeCommand: (command: string) => mockExecuteCommand(command),
  },
  window: {
    showInformationMessage: (msg: string) => mockShowInformationMessage(msg),
    showWarningMessage: (msg: string) => mockShowWarningMessage(msg),
  },
  extensions: {
    getExtension: (id: string) => mockGetExtension(id),
  },
}));

describe('ChatInjector', () => {
  let injector: ChatInjector;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    injector = new ChatInjector();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('injectIntoCursor', () => {
    it('should return false for empty prompt', async () => {
      const result = await injector.injectIntoCursor('');
      expect(result).toBe(false);
      expect(mockClipboardWriteText).not.toHaveBeenCalled();
    });

    it('should try aichat.newchataction first', async () => {
      mockExecuteCommand.mockResolvedValue(undefined);

      const promise = injector.injectIntoCursor('test prompt');
      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result).toBe(true);
      expect(mockExecuteCommand).toHaveBeenCalledWith('aichat.newchataction');
    });

    it('should fallback to composer.newAgentChat when first command fails', async () => {
      mockExecuteCommand
        .mockRejectedValueOnce(new Error('Command not found'))
        .mockResolvedValueOnce(undefined);

      const promise = injector.injectIntoCursor('test prompt');
      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result).toBe(true);
      expect(mockExecuteCommand).toHaveBeenCalledWith('aichat.newchataction');
      expect(mockExecuteCommand).toHaveBeenCalledWith('composer.newAgentChat');
    });

    it('should return false when both commands fail', async () => {
      mockExecuteCommand.mockRejectedValue(new Error('Command not found'));

      const result = await injector.injectIntoCursor('test prompt');

      expect(result).toBe(false);
    });

    it('should save and restore clipboard', async () => {
      mockClipboardReadText.mockResolvedValue('original clipboard');
      mockExecuteCommand.mockResolvedValue(undefined);

      const promise = injector.injectIntoCursor('test prompt');
      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(mockClipboardWriteText).toHaveBeenCalledWith('test prompt');

      // Advance time for async clipboard restore
      await vi.advanceTimersByTimeAsync(600);
      expect(mockClipboardWriteText).toHaveBeenCalledWith('original clipboard');
    });
  });

  describe('injectIntoClaudeCode', () => {
    it('should return false for empty prompt', async () => {
      const result = await injector.injectIntoClaudeCode('');
      expect(result).toBe(false);
    });

    it('should copy to clipboard and show warning when extension not found', async () => {
      mockGetExtension.mockReturnValue(null);

      const result = await injector.injectIntoClaudeCode('test prompt');

      expect(result).toBe(true);
      expect(mockClipboardWriteText).toHaveBeenCalledWith('test prompt');
      expect(mockShowWarningMessage).toHaveBeenCalledWith(
        'Claude Code extension not installed - prompt copied to clipboard'
      );
    });

    it('should try claude-vscode.focus first when extension exists', async () => {
      mockGetExtension.mockReturnValue({ id: 'anthropic.claude-code' });
      mockExecuteCommand.mockResolvedValue(undefined);

      const promise = injector.injectIntoClaudeCode('test prompt');
      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result).toBe(true);
      expect(mockExecuteCommand).toHaveBeenCalledWith('claude-vscode.focus');
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'Prompt sent to Claude Code in this window'
      );
    });

    it('should fallback to claude-vscode.newConversation when focus fails', async () => {
      mockGetExtension.mockReturnValue({ id: 'anthropic.claude-code' });
      mockExecuteCommand
        .mockRejectedValueOnce(new Error('No active conversation'))
        .mockResolvedValueOnce(undefined);

      const promise = injector.injectIntoClaudeCode('test prompt');
      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result).toBe(true);
      expect(mockExecuteCommand).toHaveBeenCalledWith('claude-vscode.focus');
      expect(mockExecuteCommand).toHaveBeenCalledWith('claude-vscode.newConversation');
    });

    it('should show warning and copy to clipboard when injection fails', async () => {
      mockGetExtension.mockReturnValue({ id: 'anthropic.claude-code' });
      mockExecuteCommand.mockRejectedValue(new Error('Command failed'));

      const result = await injector.injectIntoClaudeCode('test prompt');

      expect(result).toBe(false);
      expect(mockClipboardWriteText).toHaveBeenCalledWith('test prompt');
      expect(mockShowWarningMessage).toHaveBeenCalledWith(
        'Claude Code not active in this window - prompt copied to clipboard'
      );
    });

    it('should save and restore clipboard on success', async () => {
      mockGetExtension.mockReturnValue({ id: 'anthropic.claude-code' });
      mockClipboardReadText.mockResolvedValue('original clipboard');
      mockExecuteCommand.mockResolvedValue(undefined);

      const promise = injector.injectIntoClaudeCode('test prompt');
      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(mockClipboardWriteText).toHaveBeenCalledWith('test prompt');

      // Advance time for async clipboard restore
      await vi.advanceTimersByTimeAsync(600);
      expect(mockClipboardWriteText).toHaveBeenCalledWith('original clipboard');
    });
  });
});
