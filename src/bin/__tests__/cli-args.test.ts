/**
 * CLI Argument Parser Tests - TDD
 *
 * Tests written FIRST before implementation (RED phase).
 */

import { describe, it, expect } from 'vitest';
import { parseArgs } from '../cli-args';

describe('parseArgs', () => {
  describe('--hook-trigger', () => {
    it('parses sessionstart trigger', () => {
      const result = parseArgs(['--hook-trigger=sessionstart']);
      expect(result.hookTrigger).toBe('sessionstart');
    });

    it('parses precompact trigger', () => {
      const result = parseArgs(['--hook-trigger=precompact']);
      expect(result.hookTrigger).toBe('precompact');
    });

    it('parses sessionend trigger', () => {
      const result = parseArgs(['--hook-trigger=sessionend']);
      expect(result.hookTrigger).toBe('sessionend');
    });

    it('parses stop trigger', () => {
      const result = parseArgs(['--hook-trigger=stop']);
      expect(result.hookTrigger).toBe('stop');
    });

    it('returns undefined for missing hook-trigger', () => {
      const result = parseArgs([]);
      expect(result.hookTrigger).toBeUndefined();
    });

    it('throws for invalid hook-trigger', () => {
      expect(() => parseArgs(['--hook-trigger=invalid'])).toThrow('Invalid hook trigger');
    });
  });

  describe('--silent', () => {
    it('sets silent to true when present', () => {
      const result = parseArgs(['--silent']);
      expect(result.silent).toBe(true);
    });

    it('sets silent to false when absent', () => {
      const result = parseArgs([]);
      expect(result.silent).toBe(false);
    });
  });

  describe('--debug', () => {
    it('sets debug to true when present', () => {
      const result = parseArgs(['--debug']);
      expect(result.debug).toBe(true);
    });

    it('sets debug to false when absent', () => {
      const result = parseArgs([]);
      expect(result.debug).toBe(false);
    });
  });

  describe('--verbose', () => {
    it('sets debug to true when verbose is present', () => {
      const result = parseArgs(['--verbose']);
      expect(result.debug).toBe(true);
    });
  });

  describe('--force', () => {
    it('sets force to true when present', () => {
      const result = parseArgs(['--force']);
      expect(result.force).toBe(true);
    });

    it('sets force to false when absent', () => {
      const result = parseArgs([]);
      expect(result.force).toBe(false);
    });
  });

  describe('--project', () => {
    it('parses project path', () => {
      const result = parseArgs(['--project=/path/to/project']);
      expect(result.project).toBe('/path/to/project');
    });

    it('returns undefined for missing project', () => {
      const result = parseArgs([]);
      expect(result.project).toBeUndefined();
    });

    it('handles paths with spaces', () => {
      const result = parseArgs(['--project=/path/to/my project']);
      expect(result.project).toBe('/path/to/my project');
    });
  });

  describe('--test', () => {
    it('sets test to true when present', () => {
      const result = parseArgs(['--test']);
      expect(result.test).toBe(true);
    });

    it('sets test to false when absent', () => {
      const result = parseArgs([]);
      expect(result.test).toBe(false);
    });
  });

  describe('--source', () => {
    it('parses claude source', () => {
      const result = parseArgs(['--source=claude']);
      expect(result.source).toBe('claude');
    });

    it('parses cursor source', () => {
      const result = parseArgs(['--source=cursor']);
      expect(result.source).toBe('cursor');
    });

    it('returns undefined for missing source', () => {
      const result = parseArgs([]);
      expect(result.source).toBeUndefined();
    });

    it('throws for invalid source', () => {
      expect(() => parseArgs(['--source=invalid'])).toThrow('Invalid source');
    });

    it('handles case-insensitive source', () => {
      const result = parseArgs(['--source=CLAUDE']);
      expect(result.source).toBe('claude');
    });
  });

  describe('combined arguments', () => {
    it('parses all arguments together', () => {
      const result = parseArgs([
        '--hook-trigger=precompact',
        '--source=claude',
        '--silent',
        '--debug',
        '--force',
        '--project=/my/project',
        '--test',
      ]);

      expect(result).toEqual({
        hookTrigger: 'precompact',
        source: 'claude',
        silent: true,
        debug: true,
        force: true,
        project: '/my/project',
        test: true,
      });
    });

    it('handles arguments in any order', () => {
      const result = parseArgs([
        '--force',
        '--hook-trigger=sessionstart',
        '--project=/app',
        '--silent',
      ]);

      expect(result.hookTrigger).toBe('sessionstart');
      expect(result.force).toBe(true);
      expect(result.project).toBe('/app');
      expect(result.silent).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('ignores unknown arguments', () => {
      const result = parseArgs(['--unknown', '--foo=bar', '--silent']);
      expect(result.silent).toBe(true);
      expect((result as Record<string, unknown>).unknown).toBeUndefined();
    });

    it('handles empty array', () => {
      const result = parseArgs([]);
      expect(result).toEqual({
        silent: false,
        debug: false,
        force: false,
        test: false,
      });
    });

    it('handles case-insensitive hook triggers', () => {
      const result = parseArgs(['--hook-trigger=SessionStart']);
      expect(result.hookTrigger).toBe('sessionstart');
    });
  });
});
