/**
 * Language Extractor Tests - TDD
 *
 * These tests are written FIRST, before implementation exists.
 * Tests should FAIL initially (RED phase).
 */

import { describe, it, expect } from 'vitest';
import {
  getLanguageFromExtension,
  getLanguageFromPath,
  extractLanguagesFromPaths,
  getLanguageStatistics,
  LANGUAGE_MAPPINGS,
  IGNORED_EXTENSIONS,
} from '../language-extractor';

describe('LanguageExtractor', () => {
  describe('constants', () => {
    it('LANGUAGE_MAPPINGS contains common extensions', () => {
      expect(LANGUAGE_MAPPINGS).toHaveProperty('ts');
      expect(LANGUAGE_MAPPINGS).toHaveProperty('js');
      expect(LANGUAGE_MAPPINGS).toHaveProperty('py');
    });

    it('IGNORED_EXTENSIONS contains non-code files', () => {
      expect(IGNORED_EXTENSIONS.has('png')).toBe(true);
      expect(IGNORED_EXTENSIONS.has('jpg')).toBe(true);
      expect(IGNORED_EXTENSIONS.has('lock')).toBe(true);
    });
  });

  describe('getLanguageFromExtension()', () => {
    describe('common extensions', () => {
      it('maps ts to TypeScript', () => {
        expect(getLanguageFromExtension('ts')).toBe('TypeScript');
      });

      it('maps tsx to TypeScript', () => {
        expect(getLanguageFromExtension('tsx')).toBe('TypeScript');
      });

      it('maps py to Python', () => {
        expect(getLanguageFromExtension('py')).toBe('Python');
      });

      it('maps js to JavaScript', () => {
        expect(getLanguageFromExtension('js')).toBe('JavaScript');
      });

      it('maps go to Go', () => {
        expect(getLanguageFromExtension('go')).toBe('Go');
      });

      it('maps rs to Rust', () => {
        expect(getLanguageFromExtension('rs')).toBe('Rust');
      });
    });

    describe('case insensitivity', () => {
      it('handles uppercase extension', () => {
        expect(getLanguageFromExtension('TS')).toBe('TypeScript');
      });

      it('handles mixed case extension', () => {
        expect(getLanguageFromExtension('Tsx')).toBe('TypeScript');
      });
    });

    describe('unknown extensions', () => {
      it('returns null for unknown extension', () => {
        expect(getLanguageFromExtension('xyz123')).toBeNull();
      });

      it('returns null for empty string', () => {
        expect(getLanguageFromExtension('')).toBeNull();
      });
    });

    describe('ignored extensions', () => {
      it('returns null for png', () => {
        expect(getLanguageFromExtension('png')).toBeNull();
      });

      it('returns null for jpg', () => {
        expect(getLanguageFromExtension('jpg')).toBeNull();
      });

      it('returns null for lock', () => {
        expect(getLanguageFromExtension('lock')).toBeNull();
      });

      it('returns null for env', () => {
        expect(getLanguageFromExtension('env')).toBeNull();
      });

      it('returns null for gitignore', () => {
        expect(getLanguageFromExtension('gitignore')).toBeNull();
      });
    });

    describe('extension with dot prefix', () => {
      it('handles .ts with dot prefix', () => {
        expect(getLanguageFromExtension('.ts')).toBe('TypeScript');
      });

      it('handles .py with dot prefix', () => {
        expect(getLanguageFromExtension('.py')).toBe('Python');
      });
    });
  });

  describe('getLanguageFromPath()', () => {
    describe('file paths with extensions', () => {
      it('extracts TypeScript from /path/to/file.ts', () => {
        expect(getLanguageFromPath('/path/to/file.ts')).toBe('TypeScript');
      });

      it('extracts Python from /path/to/script.py', () => {
        expect(getLanguageFromPath('/path/to/script.py')).toBe('Python');
      });

      it('extracts JavaScript from src/index.js', () => {
        expect(getLanguageFromPath('src/index.js')).toBe('JavaScript');
      });

      it('handles Windows-style paths', () => {
        expect(getLanguageFromPath('C:\\Users\\dev\\file.ts')).toBe('TypeScript');
      });
    });

    describe('files without extensions', () => {
      it('returns null for file without extension', () => {
        expect(getLanguageFromPath('/path/to/file')).toBeNull();
      });

      it('returns null for directory path', () => {
        expect(getLanguageFromPath('/path/to/folder/')).toBeNull();
      });
    });

    describe('special filenames', () => {
      it('recognizes Dockerfile', () => {
        expect(getLanguageFromPath('/project/Dockerfile')).toBe('Docker');
      });

      it('recognizes Makefile', () => {
        expect(getLanguageFromPath('/project/Makefile')).toBe('Makefile');
      });

      it('recognizes dockerfile (lowercase)', () => {
        expect(getLanguageFromPath('/project/dockerfile')).toBe('Docker');
      });

      it('recognizes makefile (lowercase)', () => {
        expect(getLanguageFromPath('/project/makefile')).toBe('Makefile');
      });
    });

    describe('edge cases', () => {
      it('handles file with multiple dots', () => {
        expect(getLanguageFromPath('/path/to/file.test.ts')).toBe('TypeScript');
      });

      it('handles hidden files with extension', () => {
        expect(getLanguageFromPath('/path/to/.hidden.ts')).toBe('TypeScript');
      });

      it('returns null for empty path', () => {
        expect(getLanguageFromPath('')).toBeNull();
      });
    });
  });

  describe('extractLanguagesFromPaths()', () => {
    it('returns empty array for empty input', () => {
      expect(extractLanguagesFromPaths([])).toEqual([]);
    });

    it('extracts single language', () => {
      const paths = ['/src/index.ts'];
      expect(extractLanguagesFromPaths(paths)).toEqual(['TypeScript']);
    });

    it('extracts multiple different languages', () => {
      const paths = ['/src/index.ts', '/scripts/run.py', '/lib/utils.go'];
      const languages = extractLanguagesFromPaths(paths);
      expect(languages).toContain('TypeScript');
      expect(languages).toContain('Python');
      expect(languages).toContain('Go');
      expect(languages.length).toBe(3);
    });

    it('deduplicates languages from multiple same-type files', () => {
      const paths = ['/src/a.ts', '/src/b.ts', '/src/c.ts'];
      const languages = extractLanguagesFromPaths(paths);
      expect(languages).toEqual(['TypeScript']);
    });

    it('ignores non-code files', () => {
      const paths = ['/src/index.ts', '/assets/image.png', '/data/file.lock'];
      const languages = extractLanguagesFromPaths(paths);
      expect(languages).toEqual(['TypeScript']);
    });

    it('returns sorted array', () => {
      const paths = ['/a.ts', '/b.py', '/c.go', '/d.rs'];
      const languages = extractLanguagesFromPaths(paths);
      expect(languages).toEqual(['Go', 'Python', 'Rust', 'TypeScript']);
    });
  });

  describe('getLanguageStatistics()', () => {
    it('returns empty map for empty input', () => {
      const stats = getLanguageStatistics([]);
      expect(stats.size).toBe(0);
    });

    it('counts single file', () => {
      const stats = getLanguageStatistics(['/src/index.ts']);
      expect(stats.get('TypeScript')).toBe(1);
    });

    it('counts multiple files of same type', () => {
      const paths = ['/a.ts', '/b.ts', '/c.ts'];
      const stats = getLanguageStatistics(paths);
      expect(stats.get('TypeScript')).toBe(3);
    });

    it('counts multiple languages separately', () => {
      const paths = ['/a.ts', '/b.ts', '/c.py', '/d.py', '/e.py', '/f.go'];
      const stats = getLanguageStatistics(paths);
      expect(stats.get('TypeScript')).toBe(2);
      expect(stats.get('Python')).toBe(3);
      expect(stats.get('Go')).toBe(1);
    });

    it('ignores non-code files in statistics', () => {
      const paths = ['/a.ts', '/b.png', '/c.jpg', '/d.lock'];
      const stats = getLanguageStatistics(paths);
      expect(stats.size).toBe(1);
      expect(stats.get('TypeScript')).toBe(1);
    });
  });
});
