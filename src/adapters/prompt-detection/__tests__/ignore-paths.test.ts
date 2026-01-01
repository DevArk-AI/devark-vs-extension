/**
 * Ignore Paths Tests
 *
 * Tests for shouldIgnorePath() cross-platform path filtering
 */

import { describe, it, expect } from 'vitest';
import { shouldIgnorePath, IGNORED_PATHS } from '../ignore-paths';

describe('ignore-paths', () => {
  describe('IGNORED_PATHS configuration', () => {
    it('should contain vibe-log internal paths', () => {
      expect(IGNORED_PATHS).toContain('.devark/temp-prompt-analysis');
      expect(IGNORED_PATHS).toContain('.devark/temp-standup');
      expect(IGNORED_PATHS).toContain('devark-hooks');
      expect(IGNORED_PATHS).toContain('devark-analysis');
    });

    it('should contain Cursor IDE paths', () => {
      expect(IGNORED_PATHS).toContain('programs/cursor');
      expect(IGNORED_PATHS).toContain('.cursor');
    });

    it('should NOT contain leading slashes (cross-platform)', () => {
      const hasLeadingSlash = IGNORED_PATHS.some(p => p.startsWith('/'));
      expect(hasLeadingSlash).toBe(false);
    });
  });

  describe('shouldIgnorePath() - edge cases', () => {
    it('should return false for undefined', () => {
      expect(shouldIgnorePath(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(shouldIgnorePath('')).toBe(false);
    });

    it('should return false for whitespace-only string', () => {
      expect(shouldIgnorePath('   ')).toBe(false);
    });

    it('should handle paths with trailing slashes', () => {
      expect(shouldIgnorePath('/home/user/devark-hooks/')).toBe(true);
      expect(shouldIgnorePath('C:\\temp\\devark-hooks\\')).toBe(true);
    });
  });

  describe('shouldIgnorePath() - vibe-log internal directories', () => {
    it('should ignore .devark/temp-prompt-analysis', () => {
      expect(shouldIgnorePath('/home/user/.devark/temp-prompt-analysis')).toBe(true);
      expect(shouldIgnorePath('C:\\Users\\Name\\.devark\\temp-prompt-analysis')).toBe(true);
      expect(shouldIgnorePath('/project/.devark/temp-prompt-analysis/session-123')).toBe(true);
    });

    it('should ignore .devark/temp-standup', () => {
      expect(shouldIgnorePath('/home/user/.devark/temp-standup')).toBe(true);
      expect(shouldIgnorePath('C:\\Users\\Name\\.devark\\temp-standup')).toBe(true);
    });

    it('should ignore .devark/temp-productivity-report', () => {
      expect(shouldIgnorePath('/home/user/.devark/temp-productivity-report')).toBe(true);
      expect(shouldIgnorePath('C:\\work\\.devark\\temp-productivity-report')).toBe(true);
    });

    it('should ignore devark-hooks', () => {
      expect(shouldIgnorePath('/tmp/devark-hooks')).toBe(true);
      expect(shouldIgnorePath('C:\\temp\\devark-hooks')).toBe(true);
      expect(shouldIgnorePath('/home/user/devark-hooks/prompt-123.json')).toBe(true);
    });

    it('should ignore devark-temp', () => {
      expect(shouldIgnorePath('/tmp/devark-temp')).toBe(true);
      expect(shouldIgnorePath('C:\\Users\\Name\\devark-temp')).toBe(true);
    });

    it('should ignore devark-analysis (Windows AppData temp directory)', () => {
      // This is the exact path that was causing the bug - 80 sessions from temp analysis
      expect(shouldIgnorePath('C:\\Users\\97254\\AppData\\Local\\Temp\\devark-analysis')).toBe(true);
      expect(shouldIgnorePath('/tmp/devark-analysis')).toBe(true);
      expect(shouldIgnorePath('/var/folders/devark-analysis')).toBe(true);
      expect(shouldIgnorePath('C:\\Users\\Name\\AppData\\Local\\Temp\\devark-analysis\\session-123')).toBe(true);
    });
  });

  describe('shouldIgnorePath() - Cursor IDE paths', () => {
    it('should ignore programs/cursor directory (cross-platform)', () => {
      // Windows
      expect(shouldIgnorePath('C:\\Programs\\Cursor')).toBe(true);
      expect(shouldIgnorePath('C:\\Programs\\Cursor\\project')).toBe(true);

      // Unix
      expect(shouldIgnorePath('/usr/local/programs/cursor')).toBe(true);
      expect(shouldIgnorePath('/opt/programs/cursor/resources')).toBe(true);
    });

    it('should ignore appdata/local/programs/cursor (Windows)', () => {
      expect(shouldIgnorePath('C:\\Users\\Name\\AppData\\Local\\Programs\\Cursor')).toBe(true);
      expect(shouldIgnorePath('C:\\Users\\Name\\AppData\\Local\\Programs\\Cursor\\app')).toBe(true);
    });

    it('should ignore .cursor directory', () => {
      expect(shouldIgnorePath('/home/user/.cursor')).toBe(true);
      expect(shouldIgnorePath('C:\\Users\\Name\\.cursor')).toBe(true);
      expect(shouldIgnorePath('/home/user/.cursor/extensions')).toBe(true);
    });
  });

  describe('shouldIgnorePath() - false positives (should NOT match)', () => {
    it('should NOT ignore projects with cursor in name', () => {
      expect(shouldIgnorePath('/home/user/my-cursor-project')).toBe(false);
      expect(shouldIgnorePath('/work/cursor-clone-app')).toBe(false);
      expect(shouldIgnorePath('C:\\projects\\cursor-extension')).toBe(false);
    });

    it('should NOT ignore projects with similar names', () => {
      expect(shouldIgnorePath('/home/user/programs-cursor')).toBe(false);
      expect(shouldIgnorePath('/work/programs/cursors')).toBe(false);
      expect(shouldIgnorePath('/projects/my-programs-cursor-app')).toBe(false);
    });

    it('should NOT ignore .cursorrules or similar files', () => {
      expect(shouldIgnorePath('/home/user/project/.cursorrules')).toBe(false);
      expect(shouldIgnorePath('/work/.cursor-settings')).toBe(false);
    });

    it('should NOT ignore vibe-log projects (only temp directories)', () => {
      expect(shouldIgnorePath('/home/user/vibe-log-dashboard')).toBe(false);
      expect(shouldIgnorePath('/work/vibe-log-api')).toBe(false);
      expect(shouldIgnorePath('/projects/my-vibe-log-clone')).toBe(false);
    });

    it('should NOT ignore legitimate project paths', () => {
      expect(shouldIgnorePath('/home/user/myproject')).toBe(false);
      expect(shouldIgnorePath('C:\\Users\\Name\\Documents\\myapp')).toBe(false);
      expect(shouldIgnorePath('/var/www/website')).toBe(false);
    });
  });

  describe('shouldIgnorePath() - path segment matching', () => {
    it('should match pattern as complete path segment', () => {
      // Complete segment match
      expect(shouldIgnorePath('/home/programs/cursor/app')).toBe(true);

      // Partial segment match should NOT match
      expect(shouldIgnorePath('/home/my-programs/cursor-app')).toBe(false);
    });

    it('should work with nested directories', () => {
      // Should match nested .devark/temp-standup anywhere
      expect(shouldIgnorePath('/home/user/projects/.devark/temp-standup')).toBe(true);
      expect(shouldIgnorePath('/work/client-project/.devark/temp-standup/session')).toBe(true);
    });

    it('should be case-insensitive (cross-platform)', () => {
      // Windows drives are case-insensitive
      expect(shouldIgnorePath('C:\\PROGRAMS\\CURSOR')).toBe(true);
      expect(shouldIgnorePath('c:\\programs\\cursor')).toBe(true);

      // Unix paths can be case-insensitive too
      expect(shouldIgnorePath('/HOME/USER/VIBE-LOG-HOOKS')).toBe(true);
    });
  });

  describe('shouldIgnorePath() - real-world scenarios', () => {
    it('should handle typical Unix development paths', () => {
      // Should ignore
      expect(shouldIgnorePath('/home/developer/.devark/temp-standup')).toBe(true);
      expect(shouldIgnorePath('/tmp/devark-hooks')).toBe(true);

      // Should NOT ignore
      expect(shouldIgnorePath('/home/developer/my-app')).toBe(false);
      expect(shouldIgnorePath('/var/www/production-site')).toBe(false);
    });

    it('should handle typical Windows development paths', () => {
      // Should ignore
      expect(shouldIgnorePath('C:\\Users\\Dev\\.devark\\temp-prompt-analysis')).toBe(true);
      expect(shouldIgnorePath('C:\\Users\\Dev\\AppData\\Local\\Programs\\Cursor')).toBe(true);

      // Should NOT ignore
      expect(shouldIgnorePath('C:\\Users\\Dev\\Documents\\MyProject')).toBe(false);
      expect(shouldIgnorePath('C:\\Projects\\web-app')).toBe(false);
    });

    it('should handle VS Code workspace paths', () => {
      // Real project with .cursor settings
      expect(shouldIgnorePath('/home/user/myproject')).toBe(false);

      // But .cursor directory itself should be ignored
      expect(shouldIgnorePath('/home/user/.cursor')).toBe(true);
    });

    it('should handle macOS paths', () => {
      // Should ignore
      expect(shouldIgnorePath('/Users/name/.devark/temp-standup')).toBe(true);
      expect(shouldIgnorePath('/private/tmp/devark-hooks')).toBe(true);

      // Should NOT ignore
      expect(shouldIgnorePath('/Users/name/Projects/my-app')).toBe(false);
      expect(shouldIgnorePath('/Users/name/Desktop/website')).toBe(false);
    });
  });

  describe('shouldIgnorePath() - performance', () => {
    it('should handle many path checks efficiently', () => {
      const testPaths = [
        '/home/user/project1',
        '/home/user/project2',
        '/home/user/.devark/temp-standup',
        '/home/user/project3',
        'C:\\Projects\\app1',
        'C:\\Projects\\app2',
        'C:\\Users\\Name\\.cursor',
        '/tmp/devark-hooks',
        '/var/www/site1',
        '/var/www/site2',
      ];

      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        testPaths.forEach(path => shouldIgnorePath(path));
      }
      const elapsed = Date.now() - start;

      // 10,000 checks should complete in under 100ms (pre-compiled patterns)
      expect(elapsed).toBeLessThan(100);
    });
  });
});
