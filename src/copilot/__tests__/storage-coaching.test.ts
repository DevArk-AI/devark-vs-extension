/**
 * CoPilotStorageManager Coaching Persistence Tests
 *
 * Tests the coaching-specific storage methods:
 * - saveCoaching / loadCoaching
 * - getRecentCoaching
 * - deleteCoaching
 * - cleanup (7-day retention)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CoachingData } from '../../services/types/coaching-types';

// Mock filesystem - normalize paths to forward slashes for cross-platform consistency
const mockFiles = new Map<string, string>();
const mockStats = new Map<string, { mtime: Date }>();

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockImplementation(async (path: string, content: string) => {
    const normalized = normalizePath(path);
    mockFiles.set(normalized, content);
    mockStats.set(normalized, { mtime: new Date() });
  }),
  readFile: vi.fn().mockImplementation(async (path: string) => {
    const normalized = normalizePath(path);
    const content = mockFiles.get(normalized);
    if (!content) throw new Error('ENOENT: no such file');
    return content;
  }),
  readdir: vi.fn().mockImplementation(async (dir: string) => {
    const normalizedDir = normalizePath(dir);
    const files: string[] = [];
    for (const key of mockFiles.keys()) {
      if (key.startsWith(normalizedDir + '/')) {
        const filename = key.slice(normalizedDir.length + 1);
        if (!filename.includes('/')) {
          files.push(filename);
        }
      }
    }
    return files;
  }),
  stat: vi.fn().mockImplementation(async (path: string) => {
    const normalized = normalizePath(path);
    const stats = mockStats.get(normalized);
    if (!stats) throw new Error('ENOENT: no such file');
    return stats;
  }),
  unlink: vi.fn().mockImplementation(async (path: string) => {
    const normalized = normalizePath(path);
    mockFiles.delete(normalized);
    mockStats.delete(normalized);
  }),
}));

// Mock vscode
vi.mock('vscode', () => ({
  ExtensionContext: vi.fn(),
  Uri: {
    file: (path: string) => ({ fsPath: path }),
  },
}));

// Helper to create mock coaching data
function createCoachingData(overrides: Partial<CoachingData> = {}): CoachingData {
  return {
    analysis: {
      summary: 'Test analysis summary',
      outcome: 'success',
      topicsAddressed: ['testing'],
      entitiesModified: ['test.ts'],
    },
    suggestions: [
      {
        id: 'suggestion-1',
        type: 'test',
        title: 'Add tests',
        description: 'Test description',
        suggestedPrompt: 'Write tests for...',
        confidence: 0.8,
        reasoning: 'Because testing is important',
      },
    ],
    timestamp: new Date('2024-01-15T10:30:00Z'),
    promptId: 'prompt-123',
    responseId: 'response-456',
    source: 'cursor',
    ...overrides,
  };
}

// Mock ExtensionContext
function createMockContext() {
  const globalState = new Map<string, any>();
  return {
    globalStorageUri: { fsPath: '/mock/storage' },
    globalState: {
      get: (key: string, defaultValue?: any) => globalState.get(key) ?? defaultValue,
      update: async (key: string, value: any) => { globalState.set(key, value); },
    },
  };
}

// Helper to check if file exists in mock (handles path normalization)
function mockFileExists(path: string): boolean {
  return mockFiles.has(normalizePath(path));
}

// Helper to set mock file (handles path normalization)
function setMockFile(path: string, content: string, mtime: Date = new Date()): void {
  const normalized = normalizePath(path);
  mockFiles.set(normalized, content);
  mockStats.set(normalized, { mtime });
}

describe('CoPilotStorageManager - Coaching Persistence', () => {
  let storageManager: any;
  let mockContext: any;

  beforeEach(async () => {
    // Clear mocks
    mockFiles.clear();
    mockStats.clear();
    vi.clearAllMocks();

    mockContext = createMockContext();

    // Import and create fresh instance
    const { CoPilotStorageManager } = await import('../storage');
    storageManager = new CoPilotStorageManager(mockContext);
    await storageManager.initialize();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('saveCoaching', () => {
    it('should save coaching to filesystem with promptId as filename', async () => {
      const coaching = createCoachingData({ promptId: 'prompt-abc' });

      await storageManager.saveCoaching(coaching);

      expect(mockFileExists('/mock/storage/coaching/prompt-abc.json')).toBe(true);
      const saved = JSON.parse(mockFiles.get(normalizePath('/mock/storage/coaching/prompt-abc.json'))!);
      expect(saved.promptId).toBe('prompt-abc');
    });

    it('should fall back to responseId if no promptId', async () => {
      const coaching = createCoachingData({ promptId: undefined, responseId: 'response-xyz' });

      await storageManager.saveCoaching(coaching);

      expect(mockFileExists('/mock/storage/coaching/response-xyz.json')).toBe(true);
    });

    it('should fall back to timestamp if no promptId or responseId', async () => {
      const coaching = createCoachingData({ promptId: undefined, responseId: undefined });

      await storageManager.saveCoaching(coaching);

      // Find the file with coaching- prefix
      const keys = Array.from(mockFiles.keys());
      const coachingFile = keys.find(k => k.includes('/coaching/coaching-'));
      expect(coachingFile).toBeDefined();
    });

    it('should add coaching to in-memory cache', async () => {
      const coaching = createCoachingData({ promptId: 'cached-prompt' });

      await storageManager.saveCoaching(coaching);

      // Load should return from cache without hitting disk
      const loaded = await storageManager.loadCoaching('cached-prompt');
      expect(loaded).toBeDefined();
      expect(loaded.promptId).toBe('cached-prompt');
    });
  });

  describe('loadCoaching', () => {
    it('should return from cache if present', async () => {
      const coaching = createCoachingData({ promptId: 'cache-hit' });
      await storageManager.saveCoaching(coaching);

      // Clear file to prove cache is used
      mockFiles.clear();
      mockStats.clear();

      const loaded = await storageManager.loadCoaching('cache-hit');
      expect(loaded).toBeDefined();
      expect(loaded.promptId).toBe('cache-hit');
    });

    it('should load from disk if not in cache', async () => {
      const coaching = createCoachingData({ promptId: 'disk-load' });
      setMockFile('/mock/storage/coaching/disk-load.json', JSON.stringify(coaching));

      const loaded = await storageManager.loadCoaching('disk-load');
      expect(loaded).toBeDefined();
      expect(loaded.promptId).toBe('disk-load');
    });

    it('should restore Date objects from JSON', async () => {
      const coaching = createCoachingData({ promptId: 'date-test' });
      setMockFile('/mock/storage/coaching/date-test.json', JSON.stringify(coaching));

      const loaded = await storageManager.loadCoaching('date-test');
      expect(loaded.timestamp).toBeInstanceOf(Date);
    });

    it('should return null if not found', async () => {
      const loaded = await storageManager.loadCoaching('nonexistent');
      expect(loaded).toBeNull();
    });
  });

  describe('getRecentCoaching', () => {
    it('should return recent coaching entries sorted by mtime', async () => {
      // Create coaching entries with different timestamps
      const coaching1 = createCoachingData({ promptId: 'old' });
      const coaching2 = createCoachingData({ promptId: 'new' });

      setMockFile('/mock/storage/coaching/old.json', JSON.stringify(coaching1), new Date('2024-01-01'));
      setMockFile('/mock/storage/coaching/new.json', JSON.stringify(coaching2), new Date('2024-01-15'));

      const recent = await storageManager.getRecentCoaching(10);

      expect(recent.length).toBe(2);
      // Most recent first
      expect(recent[0].promptId).toBe('new');
      expect(recent[1].promptId).toBe('old');
    });

    it('should limit results', async () => {
      for (let i = 0; i < 5; i++) {
        const coaching = createCoachingData({ promptId: `prompt-${i}` });
        setMockFile(`/mock/storage/coaching/prompt-${i}.json`, JSON.stringify(coaching));
      }

      const recent = await storageManager.getRecentCoaching(3);
      expect(recent.length).toBe(3);
    });

    it('should restore Date objects', async () => {
      const coaching = createCoachingData({ promptId: 'date-restore' });
      setMockFile('/mock/storage/coaching/date-restore.json', JSON.stringify(coaching));

      const recent = await storageManager.getRecentCoaching(10);
      expect(recent[0].timestamp).toBeInstanceOf(Date);
    });

    it('should return empty array if no coaching files', async () => {
      const recent = await storageManager.getRecentCoaching(10);
      expect(recent).toEqual([]);
    });
  });

  describe('deleteCoaching', () => {
    it('should delete from filesystem', async () => {
      const coaching = createCoachingData({ promptId: 'to-delete' });
      await storageManager.saveCoaching(coaching);

      expect(mockFileExists('/mock/storage/coaching/to-delete.json')).toBe(true);

      await storageManager.deleteCoaching('to-delete');

      expect(mockFileExists('/mock/storage/coaching/to-delete.json')).toBe(false);
    });

    it('should remove from cache', async () => {
      const coaching = createCoachingData({ promptId: 'cache-delete' });
      await storageManager.saveCoaching(coaching);

      await storageManager.deleteCoaching('cache-delete');

      // Set up disk file again to ensure we're not just missing cache
      setMockFile('/mock/storage/coaching/cache-delete.json', JSON.stringify(coaching));

      // Should load from disk, not cache
      const fs = await import('fs/promises');
      vi.mocked(fs.readFile).mockClear();

      await storageManager.loadCoaching('cache-delete');
      // If it loads from disk, readFile should be called
      expect(fs.readFile).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should delete coaching files older than retention period', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days old

      const coaching = createCoachingData({ promptId: 'old-coaching' });
      setMockFile('/mock/storage/coaching/old-coaching.json', JSON.stringify(coaching), oldDate);

      const newCoaching = createCoachingData({ promptId: 'new-coaching' });
      setMockFile('/mock/storage/coaching/new-coaching.json', JSON.stringify(newCoaching), new Date());

      await storageManager.cleanup(7);

      expect(mockFileExists('/mock/storage/coaching/old-coaching.json')).toBe(false);
      expect(mockFileExists('/mock/storage/coaching/new-coaching.json')).toBe(true);
    });

    it('should keep files newer than retention period', async () => {
      const newDate = new Date();
      newDate.setDate(newDate.getDate() - 3); // 3 days old

      const coaching = createCoachingData({ promptId: 'recent-coaching' });
      setMockFile('/mock/storage/coaching/recent-coaching.json', JSON.stringify(coaching), newDate);

      await storageManager.cleanup(7);

      expect(mockFileExists('/mock/storage/coaching/recent-coaching.json')).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should include coaching statistics', async () => {
      const coaching = createCoachingData({ promptId: 'stats-test' });
      await storageManager.saveCoaching(coaching);

      const stats = await storageManager.getStats();

      expect(stats.totalCoaching).toBeGreaterThanOrEqual(1);
      expect(stats.cachedCoaching).toBeGreaterThanOrEqual(1);
    });
  });
});
