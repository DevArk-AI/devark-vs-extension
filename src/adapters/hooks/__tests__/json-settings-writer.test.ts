/**
 * JsonSettingsWriter Tests
 *
 * TDD: Write failing tests first, then implement.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockFileSystem } from '../../../../test/mocks/mock-file-system';
import { JsonSettingsWriter } from '../json-settings-writer';

describe('JsonSettingsWriter', () => {
  let mockFs: MockFileSystem;
  let writer: JsonSettingsWriter;

  beforeEach(() => {
    mockFs = new MockFileSystem();
    writer = new JsonSettingsWriter(mockFs);
  });

  describe('read()', () => {
    it('reads and parses JSON file', async () => {
      mockFs.addFile('/home/user/.config/settings.json', '{"key": "value", "count": 42}');

      const result = await writer.read('/home/user/.config/settings.json');

      expect(result).toEqual({ key: 'value', count: 42 });
    });

    it('returns empty object for missing file', async () => {
      const result = await writer.read('/home/user/.config/nonexistent.json');

      expect(result).toEqual({});
    });

    it('throws error for invalid JSON', async () => {
      mockFs.addFile('/home/user/.config/invalid.json', 'not valid json');

      await expect(writer.read('/home/user/.config/invalid.json')).rejects.toThrow();
    });

    it('handles empty file as empty object', async () => {
      mockFs.addFile('/home/user/.config/empty.json', '{}');

      const result = await writer.read('/home/user/.config/empty.json');

      expect(result).toEqual({});
    });

    it('handles nested objects', async () => {
      const content = JSON.stringify({
        hooks: {
          SessionStart: [{ matcher: 'startup', hooks: [] }],
        },
      });
      mockFs.addFile('/home/user/.config/nested.json', content);

      const result = await writer.read('/home/user/.config/nested.json');

      expect(result).toEqual({
        hooks: {
          SessionStart: [{ matcher: 'startup', hooks: [] }],
        },
      });
    });
  });

  describe('write()', () => {
    it('writes settings to file with pretty JSON', async () => {
      await writer.write('/home/user/.config/settings.json', { key: 'value' });

      const files = mockFs.getFiles();
      const content = files.get('/home/user/.config/settings.json');
      expect(content).toBe('{\n  "key": "value"\n}');
    });

    it('creates parent directories if they do not exist', async () => {
      await writer.write('/home/user/.new/deep/settings.json', { test: true });

      const files = mockFs.getFiles();
      expect(files.has('/home/user/.new/deep/settings.json')).toBe(true);
    });

    it('overwrites existing file', async () => {
      mockFs.addFile('/home/user/.config/settings.json', '{"old": "data"}');

      await writer.write('/home/user/.config/settings.json', { new: 'data' });

      const files = mockFs.getFiles();
      const content = files.get('/home/user/.config/settings.json');
      expect(content).toBe('{\n  "new": "data"\n}');
    });

    it('handles complex nested objects', async () => {
      const settings = {
        hooks: {
          SessionStart: [
            {
              matcher: 'startup|clear',
              hooks: [{ type: 'command', command: '/path/to/cli send' }],
            },
          ],
        },
      };

      await writer.write('/home/user/.config/complex.json', settings);

      const files = mockFs.getFiles();
      const content = files.get('/home/user/.config/complex.json');
      expect(JSON.parse(content!)).toEqual(settings);
    });
  });

  describe('exists()', () => {
    it('returns true if file exists', async () => {
      mockFs.addFile('/home/user/.config/settings.json', '{}');

      const result = await writer.exists('/home/user/.config/settings.json');

      expect(result).toBe(true);
    });

    it('returns false if file does not exist', async () => {
      const result = await writer.exists('/home/user/.config/nonexistent.json');

      expect(result).toBe(false);
    });
  });

  describe('create()', () => {
    it('creates new file with initial settings', async () => {
      await writer.create('/home/user/.config/new.json', { initial: 'settings' });

      const files = mockFs.getFiles();
      expect(files.has('/home/user/.config/new.json')).toBe(true);

      const content = files.get('/home/user/.config/new.json');
      expect(JSON.parse(content!)).toEqual({ initial: 'settings' });
    });

    it('throws error if file already exists', async () => {
      mockFs.addFile('/home/user/.config/existing.json', '{}');

      await expect(
        writer.create('/home/user/.config/existing.json', { new: 'data' })
      ).rejects.toThrow('File already exists');
    });

    it('creates parent directories', async () => {
      await writer.create('/home/user/.new/path/settings.json', { test: true });

      const files = mockFs.getFiles();
      expect(files.has('/home/user/.new/path/settings.json')).toBe(true);
    });
  });

  describe('merge()', () => {
    it('merges new settings into existing file', async () => {
      mockFs.addFile('/home/user/.config/settings.json', '{"existing": "value"}');

      await writer.merge('/home/user/.config/settings.json', { new: 'data' });

      const files = mockFs.getFiles();
      const content = files.get('/home/user/.config/settings.json');
      expect(JSON.parse(content!)).toEqual({
        existing: 'value',
        new: 'data',
      });
    });

    it('creates file if it does not exist', async () => {
      await writer.merge('/home/user/.config/new.json', { initial: 'data' });

      const files = mockFs.getFiles();
      expect(files.has('/home/user/.config/new.json')).toBe(true);
      const content = files.get('/home/user/.config/new.json');
      expect(JSON.parse(content!)).toEqual({ initial: 'data' });
    });

    it('deep merges nested objects', async () => {
      const existing = {
        hooks: {
          SessionStart: [{ matcher: 'startup' }],
        },
        other: 'setting',
      };
      mockFs.addFile('/home/user/.config/settings.json', JSON.stringify(existing));

      await writer.merge('/home/user/.config/settings.json', {
        hooks: {
          PreCompact: [{ matcher: 'auto' }],
        },
      });

      const files = mockFs.getFiles();
      const content = files.get('/home/user/.config/settings.json');
      expect(JSON.parse(content!)).toEqual({
        hooks: {
          SessionStart: [{ matcher: 'startup' }],
          PreCompact: [{ matcher: 'auto' }],
        },
        other: 'setting',
      });
    });

    it('overwrites primitive values during merge', async () => {
      mockFs.addFile('/home/user/.config/settings.json', '{"count": 1, "name": "old"}');

      await writer.merge('/home/user/.config/settings.json', { count: 2 });

      const files = mockFs.getFiles();
      const content = files.get('/home/user/.config/settings.json');
      expect(JSON.parse(content!)).toEqual({ count: 2, name: 'old' });
    });

    it('replaces arrays rather than merging them', async () => {
      // Arrays should be replaced, not merged (this is standard deep merge behavior)
      mockFs.addFile(
        '/home/user/.config/settings.json',
        '{"list": [1, 2, 3]}'
      );

      await writer.merge('/home/user/.config/settings.json', { list: [4, 5] });

      const files = mockFs.getFiles();
      const content = files.get('/home/user/.config/settings.json');
      expect(JSON.parse(content!)).toEqual({ list: [4, 5] });
    });
  });
});
