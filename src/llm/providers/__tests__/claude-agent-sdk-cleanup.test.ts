/**
 * Claude Agent SDK Cleanup Tests
 *
 * Tests for cleanupClaudeProjectFolder function:
 * - Path sanitization matching Claude Code's format
 * - Symlink resolution for macOS /var -> /private/var
 * - Cross-platform support (Windows, macOS, Linux)
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cleanupClaudeProjectFolder } from '../claude-agent-sdk-provider';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  rmSync: vi.fn(),
  realpathSync: vi.fn(),
}));

// Mock os module
vi.mock('os', () => ({
  homedir: vi.fn(() => '/Users/testuser'),
}));

describe('cleanupClaudeProjectFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: realpathSync returns the input (no symlink)
    vi.mocked(fs.realpathSync).mockImplementation((p) => p.toString());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('path sanitization', () => {
    test('should sanitize Unix path with leading dash preserved', () => {
      // Unix paths start with / which becomes - after sanitization
      // Claude Code keeps this leading dash
      vi.mocked(fs.existsSync).mockReturnValue(true);

      cleanupClaudeProjectFolder('/private/var/folders/xyz/devark-test');

      // Verify rmSync was called with correct sanitized path
      expect(fs.rmSync).toHaveBeenCalledWith(
        '/Users/testuser/.claude/projects/-private-var-folders-xyz-devark-test',
        { recursive: true, force: true }
      );
    });

    test('should sanitize Windows path without leading dash', () => {
      // Windows paths like C:\Users\foo don't start with separator
      // So they shouldn't have a leading dash
      // Note: C:\ becomes C-- because both : and \ are replaced with -
      vi.mocked(fs.existsSync).mockReturnValue(true);

      cleanupClaudeProjectFolder('C:\\Users\\foo\\temp');

      expect(fs.rmSync).toHaveBeenCalledWith(
        '/Users/testuser/.claude/projects/C--Users-foo-temp',
        { recursive: true, force: true }
      );
    });

    test('should handle Linux paths correctly', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      cleanupClaudeProjectFolder('/tmp/devark-analysis/query-abc123');

      expect(fs.rmSync).toHaveBeenCalledWith(
        '/Users/testuser/.claude/projects/-tmp-devark-analysis-query-abc123',
        { recursive: true, force: true }
      );
    });
  });

  describe('macOS symlink resolution', () => {
    test('should resolve /var symlink to /private/var on macOS', () => {
      // macOS: /var is a symlink to /private/var
      // os.tmpdir() returns /var/folders/... but real path is /private/var/folders/...
      vi.mocked(fs.realpathSync).mockReturnValue(
        '/private/var/folders/dz/xyz/T/devark-analysis/query-abc'
      );
      vi.mocked(fs.existsSync).mockReturnValue(true);

      cleanupClaudeProjectFolder('/var/folders/dz/xyz/T/devark-analysis/query-abc');

      // Should use the resolved path (with /private prefix)
      expect(fs.rmSync).toHaveBeenCalledWith(
        '/Users/testuser/.claude/projects/-private-var-folders-dz-xyz-T-devark-analysis-query-abc',
        { recursive: true, force: true }
      );
    });

    test('should handle parent dir resolution when path does not exist', () => {
      // When the temp dir itself doesn't exist yet, try resolving parent
      vi.mocked(fs.realpathSync)
        .mockImplementationOnce(() => {
          throw new Error('ENOENT');
        })
        .mockImplementationOnce(() => '/private/var/folders/dz/xyz/T/devark-analysis');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      cleanupClaudeProjectFolder('/var/folders/dz/xyz/T/devark-analysis/query-new');

      // Should resolve parent and reconstruct path
      expect(fs.rmSync).toHaveBeenCalledWith(
        '/Users/testuser/.claude/projects/-private-var-folders-dz-xyz-T-devark-analysis-query-new',
        { recursive: true, force: true }
      );
    });

    test('should fallback to original path if symlink resolution fails completely', () => {
      // Both realpathSync calls fail
      vi.mocked(fs.realpathSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);

      cleanupClaudeProjectFolder('/var/folders/xyz/test');

      // Should use original path with leading dash preserved
      expect(fs.rmSync).toHaveBeenCalledWith(
        '/Users/testuser/.claude/projects/-var-folders-xyz-test',
        { recursive: true, force: true }
      );
    });
  });

  describe('cleanup behavior', () => {
    test('should remove Claude project folder when it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      cleanupClaudeProjectFolder('/tmp/test-dir');

      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('/.claude/projects/'),
        { recursive: true, force: true }
      );
    });

    test('should not throw when path does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Should not throw
      expect(() => cleanupClaudeProjectFolder('/nonexistent/path')).not.toThrow();

      // rmSync should not be called if folder doesn't exist
      expect(fs.rmSync).not.toHaveBeenCalled();
    });

    test('should silently handle cleanup errors', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.rmSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Should not throw even if rmSync fails
      expect(() => cleanupClaudeProjectFolder('/tmp/test')).not.toThrow();
    });
  });

  describe('real-world scenarios', () => {
    test('should match Claude Code folder format for macOS temp dir', () => {
      // This is the exact scenario that was failing:
      // os.tmpdir() returns /var/folders/...
      // Claude Code sees /private/var/folders/... (resolved symlink)
      vi.mocked(fs.realpathSync).mockReturnValue(
        '/private/var/folders/dz/5tdtgykn677gyrkzrwbfmsw00000gn/T/devark-analysis/query-m123abc'
      );
      vi.mocked(fs.existsSync).mockReturnValue(true);

      cleanupClaudeProjectFolder(
        '/var/folders/dz/5tdtgykn677gyrkzrwbfmsw00000gn/T/devark-analysis/query-m123abc'
      );

      // This is the folder Claude Code actually creates
      expect(fs.rmSync).toHaveBeenCalledWith(
        '/Users/testuser/.claude/projects/-private-var-folders-dz-5tdtgykn677gyrkzrwbfmsw00000gn-T-devark-analysis-query-m123abc',
        { recursive: true, force: true }
      );
    });
  });
});
