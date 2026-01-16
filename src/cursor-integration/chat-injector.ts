/**
 * ChatInjector - Programmatic prompt injection into Cursor/Claude Code
 *
 * Uses clipboard + command chain technique to inject improved prompts
 * directly into chat inputs without manual copy-paste.
 *
 * Technique discovered from Cursor forum and proven working in production extensions.
 */

import * as vscode from 'vscode';
import { getNotificationService } from '../services/NotificationService';

export class ChatInjector {
  /**
   * Inject prompt into Cursor's chat input with fallback strategy
   *
   * Strategy:
   * 1. Try existing chat (aichat.newchataction) - best effort for session continuity
   * 2. Fall back to new agent chat (composer.newAgentChat) - guaranteed clean slate
   * 3. Final fallback: clipboard copy with notification
   *
   * @param prompt - The prompt text to inject
   * @returns Promise<boolean> - True if successful, false otherwise
   */
  async injectIntoCursor(prompt: string): Promise<boolean> {
    if (!prompt) {
      console.warn('[ChatInjector] Cannot inject empty prompt');
      return false;
    }

    // 1. Save current clipboard
    const previousClipboard = await vscode.env.clipboard.readText();

    try {
      // 2. Write prompt to clipboard
      await vscode.env.clipboard.writeText(prompt);

      // 3. Try existing chat first (best effort for session continuity)
      let success = await this.tryCommand('aichat.newchataction');

      // 4. Fallback to new agent chat if existing chat command fails
      if (!success) {
        console.log('[ChatInjector] Existing chat failed, trying new agent chat');
        success = await this.tryCommand('composer.newAgentChat');
      }

      if (!success) {
        throw new Error('Both chat commands failed');
      }

      // 5. Wait for UI rendering (Cursor needs time to open/focus input)
      await new Promise(resolve => setTimeout(resolve, 150));

      // 6. Paste clipboard into input
      await vscode.commands.executeCommand('editor.action.clipboardPasteAction');

      // 7. Restore clipboard async (don't block)
      this.restoreClipboardAsync(previousClipboard);

      return true;
    } catch (error) {
      console.error('[ChatInjector] Failed to inject:', error);
      // Restore clipboard on failure too
      this.restoreClipboardAsync(previousClipboard);
      return false;
    }
  }

  /**
   * Try to execute a Cursor command
   * @param command - The command to execute
   * @returns Promise<boolean> - True if command succeeded, false otherwise
   */
  private async tryCommand(command: string): Promise<boolean> {
    try {
      await vscode.commands.executeCommand(command);
      return true;
    } catch (error) {
      console.warn(`[ChatInjector] Command ${command} failed:`, error);
      return false;
    }
  }

  /**
   * Restore clipboard content asynchronously after a delay
   * Gives user time to use the pasted content before restoring
   * @param previousClipboard - The clipboard content to restore
   */
  private restoreClipboardAsync(previousClipboard: string): void {
    setTimeout(async () => {
      if (previousClipboard) {
        await vscode.env.clipboard.writeText(previousClipboard);
      }
    }, 500);
  }

  /**
   * For Claude Code - uses focus + paste injection (same as Cursor)
   *
   * Strategy:
   * 1. Check if Claude Code extension is installed
   * 2. Try to focus existing conversation (claude-vscode.focus)
   * 3. Fall back to new conversation (claude-vscode.newConversation)
   * 4. Paste from clipboard
   * 5. Restore clipboard
   *
   * @param prompt - The prompt text to inject
   * @returns Promise<boolean> - True if successful, false otherwise
   */
  async injectIntoClaudeCode(prompt: string): Promise<boolean> {
    if (!prompt) {
      console.warn('[ChatInjector] Cannot inject empty prompt');
      return false;
    }

    // Check if Claude Code extension is installed
    const claudeCodeExt = vscode.extensions.getExtension('anthropic.claude-code');

    if (!claudeCodeExt) {
      console.warn('[ChatInjector] Claude Code extension not found');
      await vscode.env.clipboard.writeText(prompt);
      getNotificationService().warn('Claude Code extension not installed - prompt copied to clipboard');
      return true;
    }

    const previousClipboard = await vscode.env.clipboard.readText();

    try {
      // Write prompt to clipboard
      await vscode.env.clipboard.writeText(prompt);

      // Try to focus existing conversation first
      console.log('[ChatInjector] Attempting to focus Claude Code conversation');
      let success = await this.tryCommand('claude-vscode.focus');

      // Fallback: open new conversation if no active one
      if (!success) {
        console.log('[ChatInjector] No active Claude Code conversation, creating new one');
        success = await this.tryCommand('claude-vscode.newConversation');
      }

      if (!success) {
        throw new Error('Could not focus or create Claude Code conversation');
      }

      // Wait for UI to render
      await new Promise(resolve => setTimeout(resolve, 150));

      // Paste into input
      console.log('[ChatInjector] Pasting into Claude Code input');
      await vscode.commands.executeCommand('editor.action.clipboardPasteAction');

      // Restore clipboard
      this.restoreClipboardAsync(previousClipboard);

      getNotificationService().info('Prompt sent to Claude Code in this window');
      return true;
    } catch (error) {
      console.error('[ChatInjector] Claude Code injection failed:', error);

      // Restore clipboard and fallback to copy-only
      this.restoreClipboardAsync(previousClipboard);
      await vscode.env.clipboard.writeText(prompt);
      getNotificationService().warn('Claude Code not active in this window - prompt copied to clipboard');
      return false;
    }
  }
}
