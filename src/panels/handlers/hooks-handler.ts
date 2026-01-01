/**
 * HooksHandler - Handles hook installation and status messages
 *
 * Responsibilities:
 * - Detect available AI tools (Cursor, Claude Code)
 * - Install hooks for prompt/response capture
 * - Get hook status
 * - Project folder selection
 */

import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
import { SharedContext } from './shared-context';
import { ExtensionState, isCursorIDE } from '../../extension-state';
import type { WebviewMessageData } from '../../shared/webview-protocol';

export class HooksHandler extends BaseMessageHandler {
  private sharedContext: SharedContext;

  constructor(
    messageSender: MessageSender,
    handlerContext: HandlerContext,
    sharedContext: SharedContext
  ) {
    super(messageSender, handlerContext);
    this.sharedContext = sharedContext;
  }

  getHandledMessageTypes(): string[] {
    return [
      'getDetectedTools',
      'getRecentProjects',
      'selectProjectFolder',
      'installHooks',
      'uninstallHooks',
      'installCursorHooks',
      'getHooksStatus',
    ];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    switch (type) {
      case 'getDetectedTools':
        await this.handleGetDetectedTools();
        return true;
      case 'getRecentProjects':
        await this.handleGetRecentProjects();
        return true;
      case 'selectProjectFolder':
        await this.handleSelectProjectFolder();
        return true;
      case 'installHooks': {
        const d = data as WebviewMessageData<'installHooks'>;
        await this.handleInstallHooks(d.tools, d.projects);
        return true;
      }
      case 'uninstallHooks': {
        const d = data as WebviewMessageData<'uninstallHooks'>;
        await this.handleUninstallHooks(d.tools);
        return true;
      }
      case 'installCursorHooks': {
        const d = data as WebviewMessageData<'installCursorHooks'>;
        await this.handleInstallCursorHooks(d.scope);
        return true;
      }
      case 'getHooksStatus':
        await this.handleGetHooksStatus();
        return true;
      default:
        return false;
    }
  }

  private async handleGetDetectedTools(): Promise<void> {
    // Check which tools are actually available
    const cursorDetected = await this.detectCursor();
    const claudeCodeDetected = await this.detectClaudeCode();

    const tools = [
      { id: 'cursor' as const, name: 'Cursor', detected: cursorDetected },
      { id: 'claude-code' as const, name: 'Claude Code', detected: claudeCodeDetected },
    ];

    this.send('detectedTools', { tools });
  }

  /**
   * Detect if Cursor IDE is available
   */
  private async detectCursor(): Promise<boolean> {
    // Method 1: Check if currently running in Cursor
    if (isCursorIDE()) {
      return true;
    }

    // Method 2: Check if ~/.cursor directory exists (indicates Cursor was installed)
    const cursorDir = path.join(os.homedir(), '.cursor');
    try {
      const stats = await fs.promises.stat(cursorDir);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Detect if Claude Code CLI is available
   */
  private async detectClaudeCode(): Promise<boolean> {
    // Method 1: Check if ~/.claude directory exists (most reliable indicator)
    const claudeDir = path.join(os.homedir(), '.claude');
    try {
      const stats = await fs.promises.stat(claudeDir);
      if (stats.isDirectory()) {
        return true;
      }
    } catch {
      // Directory doesn't exist, continue checking
    }

    // Method 2: Check if 'claude' command exists in PATH
    const { exec } = require('child_process');
    const command = process.platform === 'win32' ? 'where' : 'which';
    const executable = process.platform === 'win32' ? 'claude.exe' : 'claude';

    try {
      const result = await new Promise<boolean>((resolve) => {
        exec(`${command} ${executable}`, (error: Error | null) => {
          resolve(!error);
        });
      });
      return result;
    } catch {
      return false;
    }
  }

  private async handleGetRecentProjects(): Promise<void> {
    // Get recent projects from VS Code
    const recentFolders = vscode.workspace.workspaceFolders || [];

    const projects = recentFolders.map((folder) => ({
      path: folder.uri.fsPath,
      name: folder.name,
    }));

    this.send('recentProjects', { projects });
  }

  private async handleSelectProjectFolder(): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: 'Select Project Folder',
      openLabel: 'Select',
    });

    if (result && result.length > 0) {
      const folderUri = result[0];
      const folderPath = folderUri.fsPath;
      const folderName = folderPath.split(/[/\\]/).pop() || folderPath;

      this.send('projectFolderSelected', {
        path: folderPath,
        name: folderName,
      });
    }
  }

  private async handleInstallHooks(tools: string[], _projects: string[] | 'all'): Promise<void> {
    try {
      const results: string[] = [];
      const errors: string[] = [];

      for (const tool of tools) {
        if (tool === 'claude-code') {
          const claudeInstaller = ExtensionState.getClaudeHookInstaller();
          const result = await claudeInstaller.install({
            hooks: ['UserPromptSubmit', 'Stop'],
            mode: 'all',
          });
          if (result.success) {
            results.push('Claude Code');
          } else {
            errors.push(`Claude Code: ${result.errors.map(e => e.error).join(', ')}`);
          }
        } else if (tool === 'cursor') {
          const cursorInstaller = ExtensionState.getCursorHookInstaller();
          const result = await cursorInstaller.install({
            hooks: ['UserPromptSubmit', 'Stop'],
            mode: 'all',
          });
          if (result.success) {
            results.push('Cursor');
          } else {
            errors.push(`Cursor: ${result.errors.map(e => e.error).join(', ')}`);
          }
        }
      }

      if (results.length > 0) {
        vscode.window.showInformationMessage(`Hooks installed for: ${results.join(', ')}`);
      }
      if (errors.length > 0) {
        vscode.window.showWarningMessage(`Some hooks failed: ${errors.join('; ')}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Hook installation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleUninstallHooks(tools: string[]): Promise<void> {
    const allErrors: string[] = [];
    const uninstalled: string[] = [];

    for (const tool of tools) {
      if (tool === 'claude-code') {
        const claudeInstaller = ExtensionState.getClaudeHookInstaller();
        const result = await claudeInstaller.uninstall();
        if (result.success) {
          uninstalled.push('Claude Code');
        } else {
          allErrors.push(...result.errors);
        }
      } else if (tool === 'cursor') {
        const cursorInstaller = ExtensionState.getCursorHookInstaller();
        const result = await cursorInstaller.uninstall();
        if (result.success) {
          uninstalled.push('Cursor');
        } else {
          allErrors.push(...result.errors);
        }
      }
    }

    const success = allErrors.length === 0;
    this.send('uninstallHooksComplete', { success, errors: allErrors });

    if (success && uninstalled.length > 0) {
      vscode.window.showInformationMessage(`Hooks uninstalled for: ${uninstalled.join(', ')}`);
    } else if (allErrors.length > 0) {
      vscode.window.showWarningMessage(`Uninstall errors: ${allErrors.join('; ')}`);
    }
  }

  private async handleInstallCursorHooks(scope: 'global' | 'workspace' = 'global'): Promise<void> {
    try {
      const cursorInstaller = ExtensionState.getCursorHookInstaller();
      const result = await cursorInstaller.install({
        hooks: ['UserPromptSubmit', 'Stop'],
        mode: scope === 'global' ? 'all' : 'selected',
      });

      if (result.success) {
        if (this.sharedContext.promptDetectionService) {
          await this.sharedContext.promptDetectionService.start();
        }
        vscode.window.showInformationMessage('Cursor hooks installed successfully!');
      } else {
        const errors = result.errors.map(e => e.error).join(', ');
        vscode.window.showErrorMessage(`Failed to install hooks: ${errors}`);
      }
    } catch (error) {
      console.error('[HooksHandler] Failed to install Cursor hooks:', error);
      vscode.window.showErrorMessage(
        `Failed to install Cursor hooks: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get the current status of installed hooks
   */
  private async handleGetHooksStatus(): Promise<void> {
    const claudeInstaller = ExtensionState.getClaudeHookInstaller();
    const cursorInstaller = ExtensionState.getCursorHookInstaller();

    const claudeStatus = await claudeInstaller.getStatus();
    const cursorStatus = await cursorInstaller.getStatus();
    const detectionStatus = this.sharedContext.promptDetectionService?.getStatus();

    this.send('hooksStatus', {
      installed: claudeStatus.installed || cursorStatus.installed,
      watching: detectionStatus ? detectionStatus.activeAdapters > 0 : false,
      claude: claudeStatus,
      cursor: cursorStatus,
    });
  }
}
