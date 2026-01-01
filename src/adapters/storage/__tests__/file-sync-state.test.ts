/**
 * FileSyncStateStorage Tests - TDD
 *
 * Tests written FIRST before implementation (RED phase).
 * Sync state storage in ~/.devark/sync-state.json
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FileSyncStateStorage } from '../file-sync-state';
import { MockFileSystem } from '../../../../test/mocks/mock-file-system';

describe('FileSyncStateStorage', () => {
  let fs: MockFileSystem;
  let storage: FileSyncStateStorage;

  const STATE_PATH = '/home/user/.devark/sync-state.json';

  beforeEach(() => {
    fs = new MockFileSystem();
    storage = new FileSyncStateStorage(fs);
  });

  describe('getLastSyncTime()', () => {
    it('returns null when no sync state exists', async () => {
      const result = await storage.getLastSyncTime('/projects/my-app');
      expect(result).toBeNull();
    });

    it('returns null for project that has never synced', async () => {
      // Setup: state file exists but project not in it
      fs.addDirectory('/home/user/.devark');
      fs.addFile(
        STATE_PATH,
        JSON.stringify({
          projects: {
            '/projects/other-app': {
              projectPath: '/projects/other-app',
              lastSyncTime: '2024-01-15T10:00:00.000Z',
              sessionsUploaded: 5,
            },
          },
          totalSessionsUploaded: 5,
        })
      );

      const result = await storage.getLastSyncTime('/projects/my-app');
      expect(result).toBeNull();
    });

    it('returns the last sync time for a synced project', async () => {
      const syncTime = new Date('2024-01-15T10:30:00.000Z');
      fs.addDirectory('/home/user/.devark');
      fs.addFile(
        STATE_PATH,
        JSON.stringify({
          projects: {
            '/projects/my-app': {
              projectPath: '/projects/my-app',
              lastSyncTime: syncTime.toISOString(),
              sessionsUploaded: 10,
            },
          },
          totalSessionsUploaded: 10,
        })
      );

      const result = await storage.getLastSyncTime('/projects/my-app');
      expect(result).toEqual(syncTime);
    });
  });

  describe('setLastSyncTime()', () => {
    it('creates state file if missing', async () => {
      const syncTime = new Date('2024-01-20T14:00:00.000Z');
      await storage.setLastSyncTime('/projects/my-app', syncTime);

      expect(await fs.exists(STATE_PATH)).toBe(true);
    });

    it('creates directory if missing', async () => {
      const syncTime = new Date('2024-01-20T14:00:00.000Z');
      await storage.setLastSyncTime('/projects/my-app', syncTime);

      expect(await fs.exists('/home/user/.devark')).toBe(true);
    });

    it('sets the last sync time for a new project', async () => {
      const syncTime = new Date('2024-01-20T14:00:00.000Z');
      await storage.setLastSyncTime('/projects/my-app', syncTime);

      const result = await storage.getLastSyncTime('/projects/my-app');
      expect(result).toEqual(syncTime);
    });

    it('updates existing project sync time', async () => {
      // Setup: existing state
      fs.addDirectory('/home/user/.devark');
      fs.addFile(
        STATE_PATH,
        JSON.stringify({
          projects: {
            '/projects/my-app': {
              projectPath: '/projects/my-app',
              lastSyncTime: '2024-01-15T10:00:00.000Z',
              sessionsUploaded: 5,
            },
          },
          totalSessionsUploaded: 5,
        })
      );

      const newSyncTime = new Date('2024-01-20T14:00:00.000Z');
      await storage.setLastSyncTime('/projects/my-app', newSyncTime);

      const result = await storage.getLastSyncTime('/projects/my-app');
      expect(result).toEqual(newSyncTime);
    });

    it('preserves other projects when updating', async () => {
      // Setup: existing state with multiple projects
      fs.addDirectory('/home/user/.devark');
      fs.addFile(
        STATE_PATH,
        JSON.stringify({
          projects: {
            '/projects/app-a': {
              projectPath: '/projects/app-a',
              lastSyncTime: '2024-01-10T10:00:00.000Z',
              sessionsUploaded: 3,
            },
            '/projects/app-b': {
              projectPath: '/projects/app-b',
              lastSyncTime: '2024-01-12T10:00:00.000Z',
              sessionsUploaded: 7,
            },
          },
          totalSessionsUploaded: 10,
        })
      );

      const newSyncTime = new Date('2024-01-20T14:00:00.000Z');
      await storage.setLastSyncTime('/projects/app-a', newSyncTime);

      // app-a should be updated
      const resultA = await storage.getLastSyncTime('/projects/app-a');
      expect(resultA).toEqual(newSyncTime);

      // app-b should be unchanged
      const resultB = await storage.getLastSyncTime('/projects/app-b');
      expect(resultB).toEqual(new Date('2024-01-12T10:00:00.000Z'));
    });

    it('updates globalLastSync when setting project time', async () => {
      const syncTime = new Date('2024-01-20T14:00:00.000Z');
      await storage.setLastSyncTime('/projects/my-app', syncTime);

      const globalLast = await storage.getGlobalLastSync();
      expect(globalLast).toEqual(syncTime);
    });
  });

  describe('getGlobalLastSync()', () => {
    it('returns null when no syncs recorded', async () => {
      const result = await storage.getGlobalLastSync();
      expect(result).toBeNull();
    });

    it('returns the global last sync time', async () => {
      const globalTime = new Date('2024-01-20T16:00:00.000Z');
      fs.addDirectory('/home/user/.devark');
      fs.addFile(
        STATE_PATH,
        JSON.stringify({
          globalLastSync: globalTime.toISOString(),
          projects: {},
          totalSessionsUploaded: 0,
        })
      );

      const result = await storage.getGlobalLastSync();
      expect(result).toEqual(globalTime);
    });
  });

  describe('getProjectState()', () => {
    it('returns null for unknown project', async () => {
      const result = await storage.getProjectState('/projects/unknown');
      expect(result).toBeNull();
    });

    it('returns full state for known project', async () => {
      const syncTime = new Date('2024-01-15T10:00:00.000Z');
      fs.addDirectory('/home/user/.devark');
      fs.addFile(
        STATE_PATH,
        JSON.stringify({
          projects: {
            '/projects/my-app': {
              projectPath: '/projects/my-app',
              lastSyncTime: syncTime.toISOString(),
              lastSessionId: 'session-abc-123',
              sessionsUploaded: 15,
            },
          },
          totalSessionsUploaded: 15,
        })
      );

      const result = await storage.getProjectState('/projects/my-app');
      expect(result).toEqual({
        projectPath: '/projects/my-app',
        lastSyncTime: syncTime,
        lastSessionId: 'session-abc-123',
        sessionsUploaded: 15,
      });
    });
  });

  describe('recordSync()', () => {
    it('creates state for new project', async () => {
      await storage.recordSync('/projects/new-app', 5, 'session-123');

      const state = await storage.getProjectState('/projects/new-app');
      expect(state).toBeDefined();
      expect(state!.sessionsUploaded).toBe(5);
      expect(state!.lastSessionId).toBe('session-123');
    });

    it('increments sessionsUploaded for existing project', async () => {
      // First sync
      await storage.recordSync('/projects/my-app', 5);

      // Second sync
      await storage.recordSync('/projects/my-app', 3);

      const state = await storage.getProjectState('/projects/my-app');
      expect(state!.sessionsUploaded).toBe(8);
    });

    it('updates lastSessionId', async () => {
      await storage.recordSync('/projects/my-app', 5, 'session-first');
      await storage.recordSync('/projects/my-app', 3, 'session-second');

      const state = await storage.getProjectState('/projects/my-app');
      expect(state!.lastSessionId).toBe('session-second');
    });

    it('increments totalSessionsUploaded', async () => {
      await storage.recordSync('/projects/app-a', 5);
      await storage.recordSync('/projects/app-b', 3);

      const fullState = await storage.getState();
      expect(fullState.totalSessionsUploaded).toBe(8);
    });

    it('updates lastSyncTime to current time', async () => {
      const before = new Date();
      await storage.recordSync('/projects/my-app', 5);
      const after = new Date();

      const state = await storage.getProjectState('/projects/my-app');
      expect(state!.lastSyncTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(state!.lastSyncTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('updates globalLastSync', async () => {
      const before = new Date();
      await storage.recordSync('/projects/my-app', 5);
      const after = new Date();

      const globalLast = await storage.getGlobalLastSync();
      expect(globalLast!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(globalLast!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('recordError()', () => {
    it('records error with timestamp', async () => {
      const before = new Date();
      await storage.recordError({ message: 'Upload failed', code: 'UPLOAD_FAILED' });
      const after = new Date();

      const state = await storage.getState();
      expect(state.lastError).toBeDefined();
      expect(state.lastError!.message).toBe('Upload failed');
      expect(state.lastError!.code).toBe('UPLOAD_FAILED');
      expect(new Date(state.lastError!.time).getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(new Date(state.lastError!.time).getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('overwrites previous error', async () => {
      await storage.recordError({ message: 'First error' });
      await storage.recordError({ message: 'Second error' });

      const state = await storage.getState();
      expect(state.lastError!.message).toBe('Second error');
    });
  });

  describe('getState()', () => {
    it('returns empty state when no file exists', async () => {
      const state = await storage.getState();
      expect(state).toEqual({
        projects: {},
        totalSessionsUploaded: 0,
      });
    });

    it('returns full state from file', async () => {
      const stateData = {
        globalLastSync: '2024-01-20T10:00:00.000Z',
        projects: {
          '/projects/my-app': {
            projectPath: '/projects/my-app',
            lastSyncTime: '2024-01-20T10:00:00.000Z',
            sessionsUploaded: 10,
          },
        },
        totalSessionsUploaded: 10,
        lastError: {
          time: '2024-01-19T08:00:00.000Z',
          message: 'Network error',
          code: 'NETWORK_ERROR',
        },
      };

      fs.addDirectory('/home/user/.devark');
      fs.addFile(STATE_PATH, JSON.stringify(stateData));

      const state = await storage.getState();
      expect(state.globalLastSync).toEqual(new Date('2024-01-20T10:00:00.000Z'));
      expect(state.totalSessionsUploaded).toBe(10);
      expect(state.lastError!.message).toBe('Network error');
    });
  });

  describe('clear()', () => {
    it('resets state to empty', async () => {
      // Setup: existing state
      await storage.recordSync('/projects/my-app', 10);
      await storage.recordError({ message: 'Some error' });

      // Clear
      await storage.clear();

      const state = await storage.getState();
      expect(state).toEqual({
        projects: {},
        totalSessionsUploaded: 0,
      });
    });

    it('does not throw if no state exists', async () => {
      await expect(storage.clear()).resolves.not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('handles corrupted JSON gracefully', async () => {
      fs.addDirectory('/home/user/.devark');
      fs.addFile(STATE_PATH, 'not valid json {{{');

      const state = await storage.getState();
      expect(state).toEqual({
        projects: {},
        totalSessionsUploaded: 0,
      });
    });

    it('handles project paths with special characters', async () => {
      const projectPath = '/Users/john doe/projects/my-app (2024)';
      await storage.recordSync(projectPath, 5);

      const state = await storage.getProjectState(projectPath);
      expect(state).toBeDefined();
      expect(state!.projectPath).toBe(projectPath);
    });

    it('handles concurrent writes by last-write-wins', async () => {
      // Simulate concurrent writes
      await Promise.all([
        storage.recordSync('/projects/app-a', 5),
        storage.recordSync('/projects/app-b', 3),
      ]);

      // Both should be recorded
      const stateA = await storage.getProjectState('/projects/app-a');
      const stateB = await storage.getProjectState('/projects/app-b');
      expect(stateA).toBeDefined();
      expect(stateB).toBeDefined();
    });
  });
});
