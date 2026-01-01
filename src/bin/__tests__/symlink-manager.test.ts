/**
 * Symlink Manager Tests - TDD
 *
 * Tests for creating and managing the devark-sync symlink.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SymlinkManager } from '../symlink-manager';
import { MockFileSystem } from '../../../test/mocks/mock-file-system';

describe('SymlinkManager', () => {
  let fs: MockFileSystem;
  let manager: SymlinkManager;

  const EXTENSION_SCRIPT_PATH = '/extensions/vibe-log/dist/bin/devark-sync.js';
  const SYMLINK_PATH = '/home/user/.devark/devark-sync';

  beforeEach(() => {
    fs = new MockFileSystem();
    manager = new SymlinkManager(fs, EXTENSION_SCRIPT_PATH);
  });

  describe('getSymlinkPath()', () => {
    it('returns path in ~/.devark/', () => {
      const path = manager.getSymlinkPath();
      expect(path).toBe(SYMLINK_PATH);
    });
  });

  describe('getScriptPath()', () => {
    it('returns the extension script path', () => {
      const path = manager.getScriptPath();
      expect(path).toBe(EXTENSION_SCRIPT_PATH);
    });
  });

  describe('ensureSymlink()', () => {
    it('creates ~/.devark directory if missing', async () => {
      fs.addFile(EXTENSION_SCRIPT_PATH, '#!/usr/bin/env node');

      await manager.ensureSymlink();

      expect(await fs.exists('/home/user/.devark')).toBe(true);
    });

    it('creates symlink to extension script', async () => {
      fs.addFile(EXTENSION_SCRIPT_PATH, '#!/usr/bin/env node');

      await manager.ensureSymlink();

      expect(await fs.exists(SYMLINK_PATH)).toBe(true);
      const target = await fs.readlink(SYMLINK_PATH);
      expect(target).toBe(EXTENSION_SCRIPT_PATH);
    });

    it('removes existing symlink before creating new one', async () => {
      fs.addDirectory('/home/user/.devark');
      fs.addSymlink(SYMLINK_PATH, '/old/path/devark-sync.js');
      fs.addFile(EXTENSION_SCRIPT_PATH, '#!/usr/bin/env node');

      await manager.ensureSymlink();

      const target = await fs.readlink(SYMLINK_PATH);
      expect(target).toBe(EXTENSION_SCRIPT_PATH);
    });

    it('throws if extension script does not exist', async () => {
      await expect(manager.ensureSymlink()).rejects.toThrow('Script not found');
    });

    it('returns the symlink path on success', async () => {
      fs.addFile(EXTENSION_SCRIPT_PATH, '#!/usr/bin/env node');

      const result = await manager.ensureSymlink();

      expect(result).toBe(SYMLINK_PATH);
    });

    it('sets execute permissions on the script', async () => {
      fs.addFile(EXTENSION_SCRIPT_PATH, '#!/usr/bin/env node');

      await manager.ensureSymlink();

      expect(fs.getPermissions(EXTENSION_SCRIPT_PATH)).toBe(0o755);
    });
  });

  describe('isSymlinkValid()', () => {
    it('returns false if symlink does not exist', async () => {
      const valid = await manager.isSymlinkValid();
      expect(valid).toBe(false);
    });

    it('returns false if symlink points to non-existent file', async () => {
      fs.addDirectory('/home/user/.devark');
      fs.addSymlink(SYMLINK_PATH, '/non/existent/script.js');

      const valid = await manager.isSymlinkValid();
      expect(valid).toBe(false);
    });

    it('returns true if symlink points to existing script', async () => {
      fs.addDirectory('/home/user/.devark');
      fs.addFile(EXTENSION_SCRIPT_PATH, '#!/usr/bin/env node');
      fs.addSymlink(SYMLINK_PATH, EXTENSION_SCRIPT_PATH);

      const valid = await manager.isSymlinkValid();
      expect(valid).toBe(true);
    });

    it('returns false if symlink points to different script', async () => {
      fs.addDirectory('/home/user/.devark');
      fs.addFile('/other/script.js', '#!/usr/bin/env node');
      fs.addSymlink(SYMLINK_PATH, '/other/script.js');

      const valid = await manager.isSymlinkValid();
      expect(valid).toBe(false);
    });
  });

  describe('removeSymlink()', () => {
    it('removes existing symlink', async () => {
      fs.addDirectory('/home/user/.devark');
      fs.addSymlink(SYMLINK_PATH, EXTENSION_SCRIPT_PATH);

      await manager.removeSymlink();

      expect(await fs.exists(SYMLINK_PATH)).toBe(false);
    });

    it('does not throw if symlink does not exist', async () => {
      await expect(manager.removeSymlink()).resolves.not.toThrow();
    });
  });
});
