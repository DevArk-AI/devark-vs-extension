/**
 * CursorSettingsWriter Tests
 *
 * TDD: Write failing tests first, then implement.
 *
 * Cursor hooks are project-level, stored in .cursor/hooks.json
 * Format: {"version": 1, "hooks": {"stop": [{"command": "..."}]}}
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockFileSystem } from '../../../../test/mocks/mock-file-system';
import { CursorSettingsWriter } from '../cursor-settings-writer';

describe('CursorSettingsWriter', () => {
  let mockFs: MockFileSystem;
  let writer: CursorSettingsWriter;

  beforeEach(() => {
    mockFs = new MockFileSystem();
    writer = new CursorSettingsWriter(mockFs);
  });

  describe('getProjectHooksPath()', () => {
    it('returns path to project hooks.json', () => {
      const path = writer.getProjectHooksPath('/Users/danny/projects/my-app');

      expect(path).toBe('/Users/danny/projects/my-app/.cursor/hooks.json');
    });

    it('handles paths with trailing slash', () => {
      const path = writer.getProjectHooksPath('/Users/danny/projects/my-app/');

      expect(path).toBe('/Users/danny/projects/my-app/.cursor/hooks.json');
    });
  });

  describe('readProjectHooks()', () => {
    it('reads hooks from project hooks.json', async () => {
      const projectPath = '/Users/danny/my-project';
      const hooksPath = '/Users/danny/my-project/.cursor/hooks.json';
      mockFs.addFile(hooksPath, '{"version": 1, "hooks": {"stop": []}}');

      const settings = await writer.readProjectHooks(projectPath);

      expect(settings).toEqual({ version: 1, hooks: { stop: [] } });
    });

    it('returns empty object if hooks.json does not exist', async () => {
      const settings = await writer.readProjectHooks('/nonexistent/project');

      expect(settings).toEqual({});
    });
  });

  describe('writeProjectHooks()', () => {
    it('writes to project hooks.json', async () => {
      const projectPath = '/Users/danny/my-project';
      const hooksConfig = {
        version: 1,
        hooks: {
          stop: [{ command: 'vibe-log send --silent' }],
        },
      };

      await writer.writeProjectHooks(projectPath, hooksConfig);

      const hooksPath = '/Users/danny/my-project/.cursor/hooks.json';
      const files = mockFs.getFiles();
      expect(files.has(hooksPath)).toBe(true);

      const content = files.get(hooksPath);
      expect(JSON.parse(content!)).toEqual(hooksConfig);
    });

    it('creates .cursor directory if needed', async () => {
      const projectPath = '/Users/danny/new-project';
      await writer.writeProjectHooks(projectPath, { version: 1, hooks: {} });

      const hooksPath = '/Users/danny/new-project/.cursor/hooks.json';
      const files = mockFs.getFiles();
      expect(files.has(hooksPath)).toBe(true);
    });
  });

  describe('mergeProjectHooks()', () => {
    it('merges into existing hooks', async () => {
      const projectPath = '/Users/danny/my-project';
      const hooksPath = '/Users/danny/my-project/.cursor/hooks.json';
      mockFs.addFile(
        hooksPath,
        '{"version": 1, "hooks": {"stop": [{"command": "existing"}]}}'
      );

      await writer.mergeProjectHooks(projectPath, {
        hooks: {
          beforeSubmitPrompt: [{ command: 'new-hook' }],
        },
      });

      const files = mockFs.getFiles();
      const content = files.get(hooksPath);
      const parsed = JSON.parse(content!);

      // Deep merge keeps existing hooks and adds new ones
      expect(parsed.version).toBe(1);
      expect(parsed.hooks.stop).toEqual([{ command: 'existing' }]);
      expect(parsed.hooks.beforeSubmitPrompt).toEqual([{ command: 'new-hook' }]);
    });

    it('creates file if it does not exist', async () => {
      const projectPath = '/Users/danny/new-project';
      await writer.mergeProjectHooks(projectPath, {
        version: 1,
        hooks: { stop: [] },
      });

      const hooksPath = '/Users/danny/new-project/.cursor/hooks.json';
      const files = mockFs.getFiles();
      expect(files.has(hooksPath)).toBe(true);
    });
  });

  describe('projectHooksExist()', () => {
    it('returns true if hooks.json exists', async () => {
      const projectPath = '/Users/danny/my-project';
      mockFs.addFile('/Users/danny/my-project/.cursor/hooks.json', '{}');

      const exists = await writer.projectHooksExist(projectPath);

      expect(exists).toBe(true);
    });

    it('returns false if hooks.json does not exist', async () => {
      const exists = await writer.projectHooksExist('/nonexistent');

      expect(exists).toBe(false);
    });
  });

  describe('Cursor hook types', () => {
    it('supports stop hook', async () => {
      const projectPath = '/Users/danny/my-project';
      await writer.writeProjectHooks(projectPath, {
        version: 1,
        hooks: {
          stop: [{ command: 'vibe-log send --hook-trigger=stop' }],
        },
      });

      const settings = await writer.readProjectHooks(projectPath);
      expect(settings.hooks.stop).toHaveLength(1);
    });

    it('supports beforeSubmitPrompt hook', async () => {
      const projectPath = '/Users/danny/my-project';
      await writer.writeProjectHooks(projectPath, {
        version: 1,
        hooks: {
          beforeSubmitPrompt: [{ command: 'analyze-prompt' }],
        },
      });

      const settings = await writer.readProjectHooks(projectPath);
      expect(settings.hooks.beforeSubmitPrompt).toHaveLength(1);
    });

    it('supports afterFileEdit hook', async () => {
      const projectPath = '/Users/danny/my-project';
      await writer.writeProjectHooks(projectPath, {
        version: 1,
        hooks: {
          afterFileEdit: [{ command: 'track-changes' }],
        },
      });

      const settings = await writer.readProjectHooks(projectPath);
      expect(settings.hooks.afterFileEdit).toHaveLength(1);
    });

    it('supports multiple hooks of the same type', async () => {
      const projectPath = '/Users/danny/my-project';
      await writer.writeProjectHooks(projectPath, {
        version: 1,
        hooks: {
          stop: [
            { command: 'hook1' },
            { command: 'hook2' },
          ],
        },
      });

      const settings = await writer.readProjectHooks(projectPath);
      expect(settings.hooks.stop).toHaveLength(2);
    });
  });
});
