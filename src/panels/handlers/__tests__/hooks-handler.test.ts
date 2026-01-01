import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HooksHandler } from '../hooks-handler';
import { SharedContext } from '../shared-context';
import type { MessageSender } from '../base-handler';
import type * as vscode from 'vscode';
import fs from 'fs';
import type { Stats } from 'fs';

const mockUri = { fsPath: '/test/path' } as vscode.Uri;

// Mock ExtensionState
vi.mock('../../../extension-state', () => ({
  ExtensionState: {
    getClaudeHookInstaller: vi.fn().mockReturnValue({
      install: vi.fn().mockResolvedValue({ success: true, hooksInstalled: [], errors: [] }),
      uninstallHook: vi.fn().mockResolvedValue({ success: true }),
      getStatus: vi.fn().mockResolvedValue({ installed: true, hooks: [] }),
    }),
    getCursorHookInstaller: vi.fn().mockReturnValue({
      install: vi.fn().mockResolvedValue({ success: true, hooksInstalled: [], errors: [] }),
      uninstall: vi.fn().mockResolvedValue({ success: true, errors: [] }),
      getStatus: vi.fn().mockResolvedValue({ installed: true, hooks: [] }),
    }),
  },
  isCursorIDE: vi.fn().mockReturnValue(true),
}));

// Mock vscode
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [
      { uri: { fsPath: '/project/foo' }, name: 'foo' },
      { uri: { fsPath: '/project/bar' }, name: 'bar' },
    ],
  },
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showOpenDialog: vi.fn().mockResolvedValue([{ fsPath: '/selected/folder' }]),
  },
}));

// Mock fs for detectClaudeCode filesystem checks
vi.mock('fs', () => {
  const mockStat = vi.fn();
  return {
    default: { promises: { stat: mockStat } },
    promises: { stat: mockStat },
  };
});

// Mock child_process for CLI detection
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Mock os.homedir to return consistent test path
vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}));

describe('HooksHandler', () => {
  let handler: HooksHandler;
  let mockSender: MessageSender;
  let sharedContext: SharedContext;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: Claude Code detected via ~/.claude directory
    vi.mocked(fs.promises.stat).mockResolvedValue({
      isDirectory: () => true,
    } as Stats);

    mockSender = { sendMessage: vi.fn() };
    sharedContext = new SharedContext();

    // Mock promptDetectionService
    sharedContext.promptDetectionService = {
      start: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockReturnValue({ activeAdapters: 2, enabled: true }),
    } as any;

    handler = new HooksHandler(
      mockSender,
      { extensionUri: mockUri, context: {} as vscode.ExtensionContext },
      sharedContext
    );
  });

  describe('getHandledMessageTypes', () => {
    it('should return correct message types', () => {
      const types = handler.getHandledMessageTypes();
      expect(types).toContain('getDetectedTools');
      expect(types).toContain('getRecentProjects');
      expect(types).toContain('selectProjectFolder');
      expect(types).toContain('installHooks');
      expect(types).toContain('installCursorHooks');
      expect(types).toContain('getHooksStatus'); // Fixed: was 'getHookStatus' - webview sends plural
      expect(types).toContain('uninstallHooks');
      expect(types).toHaveLength(7);
    });
  });

  describe('handleMessage', () => {
    it('should handle getDetectedTools', async () => {
      const result = await handler.handleMessage('getDetectedTools', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('detectedTools', {
        tools: [
          { id: 'cursor', name: 'Cursor', detected: true },
          { id: 'claude-code', name: 'Claude Code', detected: true },
        ],
      });
    });

    it('should handle getRecentProjects', async () => {
      const result = await handler.handleMessage('getRecentProjects', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('recentProjects', {
        projects: [
          { path: '/project/foo', name: 'foo' },
          { path: '/project/bar', name: 'bar' },
        ],
      });
    });

    it('should handle selectProjectFolder', async () => {
      const result = await handler.handleMessage('selectProjectFolder', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('projectFolderSelected', {
        path: '/selected/folder',
        name: 'folder',
      });
    });

    it('should handle getHooksStatus', async () => {
      const result = await handler.handleMessage('getHooksStatus', {}); // Fixed: was 'getHookStatus'
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('hooksStatus', expect.objectContaining({
        installed: true,
        watching: true,
      }));
    });

    it('should return false for unknown message types', async () => {
      const result = await handler.handleMessage('unknownType', {});
      expect(result).toBe(false);
    });
  });

  describe('installHooks', () => {
    it('should install hooks for claude-code', async () => {
      const { ExtensionState } = await import('../../../extension-state');
      await handler.handleMessage('installHooks', { tools: ['claude-code'], projects: 'all' });

      expect(ExtensionState.getClaudeHookInstaller().install).toHaveBeenCalledWith({
        hooks: ['UserPromptSubmit', 'Stop'],
        mode: 'all',
      });
    });

    it('should install hooks for cursor', async () => {
      const { ExtensionState } = await import('../../../extension-state');
      await handler.handleMessage('installHooks', { tools: ['cursor'], projects: 'all' });

      expect(ExtensionState.getCursorHookInstaller().install).toHaveBeenCalledWith({
        hooks: ['UserPromptSubmit', 'Stop'],
        mode: 'all',
      });
    });
  });

  describe('installCursorHooks', () => {
    it('should start prompt detection on success', async () => {
      await handler.handleMessage('installCursorHooks', { scope: 'global' });

      expect(sharedContext.promptDetectionService!.start).toHaveBeenCalled();
    });
  });
});
