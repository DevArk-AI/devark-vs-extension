/**
 * ClaudeSettingsWriter Tests
 *
 * TDD: Write failing tests first, then implement.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockFileSystem } from '../../../../test/mocks/mock-file-system';
import { ClaudeSettingsWriter } from '../claude-settings-writer';

describe('ClaudeSettingsWriter', () => {
  let mockFs: MockFileSystem;
  let writer: ClaudeSettingsWriter;

  beforeEach(() => {
    mockFs = new MockFileSystem();
    writer = new ClaudeSettingsWriter(mockFs);
  });

  describe('getGlobalSettingsPath()', () => {
    it('returns path to global settings.json', () => {
      const path = writer.getGlobalSettingsPath();

      expect(path).toBe('/home/user/.claude/settings.json');
    });
  });

  describe('getProjectLocalSettingsPath()', () => {
    it('encodes project path correctly', () => {
      const path = writer.getProjectLocalSettingsPath('/Users/danny/projects/my-app');

      expect(path).toBe(
        '/home/user/.claude/projects/Users-danny-projects-my-app/.claude/settings.local.json'
      );
    });

    it('handles root paths', () => {
      const path = writer.getProjectLocalSettingsPath('/');

      // Leading slash is removed, results in empty string
      // fs.join normalizes away double slashes
      expect(path).toBe('/home/user/.claude/projects/.claude/settings.local.json');
    });

    it('handles paths with multiple slashes', () => {
      const path = writer.getProjectLocalSettingsPath('/a/b/c/d/e');

      expect(path).toBe(
        '/home/user/.claude/projects/a-b-c-d-e/.claude/settings.local.json'
      );
    });

    it('handles home directory paths', () => {
      const path = writer.getProjectLocalSettingsPath('/home/user');

      expect(path).toBe(
        '/home/user/.claude/projects/home-user/.claude/settings.local.json'
      );
    });
  });

  describe('encodeProjectPath()', () => {
    it('replaces slashes with dashes', () => {
      const encoded = ClaudeSettingsWriter.encodeProjectPath('/Users/danny/dev');

      expect(encoded).toBe('Users-danny-dev');
    });

    it('removes leading dash', () => {
      const encoded = ClaudeSettingsWriter.encodeProjectPath('/path/to/project');

      expect(encoded).toBe('path-to-project');
    });

    it('handles single segment paths', () => {
      const encoded = ClaudeSettingsWriter.encodeProjectPath('/project');

      expect(encoded).toBe('project');
    });
  });

  describe('readGlobalSettings()', () => {
    it('reads from global settings path', async () => {
      mockFs.addFile('/home/user/.claude/settings.json', '{"hooks": {}}');

      const settings = await writer.readGlobalSettings();

      expect(settings).toEqual({ hooks: {} });
    });

    it('returns empty object if global settings does not exist', async () => {
      const settings = await writer.readGlobalSettings();

      expect(settings).toEqual({});
    });
  });

  describe('writeGlobalSettings()', () => {
    it('writes to global settings path', async () => {
      await writer.writeGlobalSettings({ hooks: { SessionStart: [] } });

      const files = mockFs.getFiles();
      expect(files.has('/home/user/.claude/settings.json')).toBe(true);

      const content = files.get('/home/user/.claude/settings.json');
      expect(JSON.parse(content!)).toEqual({ hooks: { SessionStart: [] } });
    });

    it('creates .claude directory if needed', async () => {
      await writer.writeGlobalSettings({ test: true });

      const files = mockFs.getFiles();
      expect(files.has('/home/user/.claude/settings.json')).toBe(true);
    });
  });

  describe('readProjectSettings()', () => {
    it('reads from project-local settings path', async () => {
      const projectPath = '/Users/danny/my-project';
      const settingsPath =
        '/home/user/.claude/projects/Users-danny-my-project/.claude/settings.local.json';
      mockFs.addFile(settingsPath, '{"hooks": {"SessionStart": []}}');

      const settings = await writer.readProjectSettings(projectPath);

      expect(settings).toEqual({ hooks: { SessionStart: [] } });
    });

    it('returns empty object if project settings does not exist', async () => {
      const settings = await writer.readProjectSettings('/nonexistent/project');

      expect(settings).toEqual({});
    });
  });

  describe('writeProjectSettings()', () => {
    it('writes to project-local settings path', async () => {
      const projectPath = '/Users/danny/my-project';
      await writer.writeProjectSettings(projectPath, { hooks: {} });

      const settingsPath =
        '/home/user/.claude/projects/Users-danny-my-project/.claude/settings.local.json';
      const files = mockFs.getFiles();
      expect(files.has(settingsPath)).toBe(true);
    });

    it('creates nested directories as needed', async () => {
      const projectPath = '/deep/nested/project';
      await writer.writeProjectSettings(projectPath, { test: true });

      const settingsPath =
        '/home/user/.claude/projects/deep-nested-project/.claude/settings.local.json';
      const files = mockFs.getFiles();
      expect(files.has(settingsPath)).toBe(true);
    });
  });

  describe('mergeGlobalSettings()', () => {
    it('merges into existing global settings', async () => {
      mockFs.addFile(
        '/home/user/.claude/settings.json',
        '{"existing": "value"}'
      );

      await writer.mergeGlobalSettings({ new: 'data' });

      const files = mockFs.getFiles();
      const content = files.get('/home/user/.claude/settings.json');
      expect(JSON.parse(content!)).toEqual({
        existing: 'value',
        new: 'data',
      });
    });
  });

  describe('mergeProjectSettings()', () => {
    it('merges into existing project settings', async () => {
      const projectPath = '/Users/danny/my-project';
      const settingsPath =
        '/home/user/.claude/projects/Users-danny-my-project/.claude/settings.local.json';
      mockFs.addFile(settingsPath, '{"existing": "value"}');

      await writer.mergeProjectSettings(projectPath, { new: 'data' });

      const files = mockFs.getFiles();
      const content = files.get(settingsPath);
      expect(JSON.parse(content!)).toEqual({
        existing: 'value',
        new: 'data',
      });
    });
  });

  describe('globalSettingsExist()', () => {
    it('returns true if global settings exists', async () => {
      mockFs.addFile('/home/user/.claude/settings.json', '{}');

      const exists = await writer.globalSettingsExist();

      expect(exists).toBe(true);
    });

    it('returns false if global settings does not exist', async () => {
      const exists = await writer.globalSettingsExist();

      expect(exists).toBe(false);
    });
  });

  describe('projectSettingsExist()', () => {
    it('returns true if project settings exists', async () => {
      const projectPath = '/Users/danny/my-project';
      const settingsPath =
        '/home/user/.claude/projects/Users-danny-my-project/.claude/settings.local.json';
      mockFs.addFile(settingsPath, '{}');

      const exists = await writer.projectSettingsExist(projectPath);

      expect(exists).toBe(true);
    });

    it('returns false if project settings does not exist', async () => {
      const exists = await writer.projectSettingsExist('/nonexistent');

      expect(exists).toBe(false);
    });
  });
});
