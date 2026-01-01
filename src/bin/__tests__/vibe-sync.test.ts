/**
 * devark-sync Script Tests - TDD
 *
 * Tests for the standalone sync script that hooks call.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { executeSync, type SyncDependencies } from '../devark-sync';
import { MockTokenStorage, MockSyncStateStorage } from '../../../test/mocks/mock-storage';
import { MockApiClient } from '../../../test/mocks/mock-api-client';
import { MockSessionReader } from '../../../test/mocks/mock-session-reader';
import type { SyncCliArgs } from '../cli-args';

describe('devark-sync', () => {
  let mockTokenStorage: MockTokenStorage;
  let mockSyncState: MockSyncStateStorage;
  let mockApiClient: MockApiClient;
  let mockSessionReader: MockSessionReader;
  let deps: SyncDependencies;
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockTokenStorage = new MockTokenStorage();
    mockSyncState = new MockSyncStateStorage();
    mockApiClient = new MockApiClient();
    mockSessionReader = new MockSessionReader();

    deps = {
      tokenStorage: mockTokenStorage,
      syncState: mockSyncState,
      apiClient: mockApiClient,
      sessionReader: mockSessionReader,
    };

    consoleOutput = [];
    consoleErrors = [];

    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors.push(args.join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authentication', () => {
    it('returns error code when no token stored', async () => {
      const args: SyncCliArgs = { silent: false, debug: false, force: false, test: false };

      const result = await executeSync(args, deps);

      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('Not authenticated');
    });

    it('returns error code when token is invalid', async () => {
      mockTokenStorage.setToken('invalid-token');
      mockApiClient.setTokenValid(false);

      const args: SyncCliArgs = { silent: false, debug: false, force: false, test: false };
      const result = await executeSync(args, deps);

      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('invalid');
    });

    it('proceeds with sync when token is valid', async () => {
      mockTokenStorage.setToken('valid-token-12345');
      mockApiClient.setTokenValid(true);

      const args: SyncCliArgs = { silent: false, debug: false, force: false, test: false };
      const result = await executeSync(args, deps);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('sync execution', () => {
    beforeEach(() => {
      mockTokenStorage.setToken('valid-token-12345');
      mockApiClient.setTokenValid(true);
    });

    it('returns success with 0 sessions when nothing to sync', async () => {
      const args: SyncCliArgs = { silent: false, debug: false, force: false, test: false };
      const result = await executeSync(args, deps);

      expect(result.exitCode).toBe(0);
      expect(result.sessionsUploaded).toBe(0);
    });

    it('uploads sessions from reader', async () => {
      mockSessionReader.addSession({
        id: 'session-1',
        tool: 'claude',
        timestamp: new Date(),
        duration: 600,
        projectPath: '/projects/my-app',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const args: SyncCliArgs = { silent: false, debug: false, force: false, test: false };
      const result = await executeSync(args, deps);

      expect(result.exitCode).toBe(0);
      expect(result.sessionsUploaded).toBe(1);
    });

    it('filters sessions shorter than 4 minutes', async () => {
      mockSessionReader.addSession({
        id: 'short-session',
        tool: 'claude',
        timestamp: new Date(),
        duration: 180, // 3 minutes - too short
        projectPath: '/projects/my-app',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const args: SyncCliArgs = { silent: false, debug: false, force: false, test: false };
      const result = await executeSync(args, deps);

      expect(result.exitCode).toBe(0);
      expect(result.sessionsUploaded).toBe(0);
      expect(result.sessionsSkipped).toBe(1);
    });

    it('respects force option to skip last sync check', async () => {
      // Set a recent last sync time
      mockSyncState.setLastSync('/projects/my-app', new Date());

      // Add an older session
      const oldTimestamp = new Date();
      oldTimestamp.setDate(oldTimestamp.getDate() - 7);
      mockSessionReader.addSession({
        id: 'old-session',
        tool: 'claude',
        timestamp: oldTimestamp,
        duration: 600,
        projectPath: '/projects/my-app',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      // Without force, session should be skipped (already synced)
      const argsNoForce: SyncCliArgs = {
        silent: false,
        debug: false,
        force: false,
        test: false,
        project: '/projects/my-app',
      };
      const resultNoForce = await executeSync(argsNoForce, deps);
      expect(resultNoForce.sessionsUploaded).toBe(0);

      // Reset mock state for second test
      mockApiClient.reset();
      mockApiClient.setTokenValid(true);

      // With force, session should be uploaded
      const argsWithForce: SyncCliArgs = {
        silent: false,
        debug: false,
        force: true,
        test: false,
        project: '/projects/my-app',
      };
      const resultWithForce = await executeSync(argsWithForce, deps);
      expect(resultWithForce.sessionsUploaded).toBe(1);
    });

    it('respects project option to sync specific project', async () => {
      mockSessionReader.addSession({
        id: 'session-app-a',
        tool: 'claude',
        timestamp: new Date(),
        duration: 600,
        projectPath: '/projects/app-a',
        messages: [{ role: 'user', content: 'Hello' }],
      });
      mockSessionReader.addSession({
        id: 'session-app-b',
        tool: 'claude',
        timestamp: new Date(),
        duration: 600,
        projectPath: '/projects/app-b',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const args: SyncCliArgs = {
        silent: false,
        debug: false,
        force: false,
        test: false,
        project: '/projects/app-a',
      };
      const result = await executeSync(args, deps);

      expect(result.exitCode).toBe(0);
      // Should only upload session from app-a
      expect(result.sessionsUploaded).toBe(1);
    });
  });

  describe('test mode', () => {
    beforeEach(() => {
      mockTokenStorage.setToken('valid-token-12345');
      mockApiClient.setTokenValid(true);
    });

    it('validates configuration without uploading', async () => {
      mockSessionReader.addSession({
        id: 'session-1',
        tool: 'claude',
        timestamp: new Date(),
        duration: 600,
        projectPath: '/projects/my-app',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const args: SyncCliArgs = { silent: false, debug: false, force: false, test: true };
      const result = await executeSync(args, deps);

      expect(result.exitCode).toBe(0);
      expect(result.sessionsUploaded).toBe(0);
      expect(result.testMode).toBe(true);
    });
  });

  describe('output modes', () => {
    beforeEach(() => {
      mockTokenStorage.setToken('valid-token-12345');
      mockApiClient.setTokenValid(true);
    });

    it('silent mode suppresses output', async () => {
      mockSessionReader.addSession({
        id: 'session-1',
        tool: 'claude',
        timestamp: new Date(),
        duration: 600,
        projectPath: '/projects/my-app',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const args: SyncCliArgs = { silent: true, debug: false, force: false, test: false };
      await executeSync(args, deps);

      expect(consoleOutput).toHaveLength(0);
    });

    it('debug mode shows verbose output', async () => {
      mockSessionReader.addSession({
        id: 'session-1',
        tool: 'claude',
        timestamp: new Date(),
        duration: 600,
        projectPath: '/projects/my-app',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const args: SyncCliArgs = { silent: false, debug: true, force: false, test: false };
      await executeSync(args, deps);

      expect(consoleOutput.length).toBeGreaterThan(0);
    });

    it('shows summary in normal mode', async () => {
      mockSessionReader.addSession({
        id: 'session-1',
        tool: 'claude',
        timestamp: new Date(),
        duration: 600,
        projectPath: '/projects/my-app',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const args: SyncCliArgs = { silent: false, debug: false, force: false, test: false };
      await executeSync(args, deps);

      const output = consoleOutput.join('\n');
      expect(output).toContain('session');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockTokenStorage.setToken('valid-token-12345');
      mockApiClient.setTokenValid(true);
    });

    it('returns error code on upload failure', async () => {
      mockSessionReader.addSession({
        id: 'session-1',
        tool: 'claude',
        timestamp: new Date(),
        duration: 600,
        projectPath: '/projects/my-app',
        messages: [{ role: 'user', content: 'Hello' }],
      });
      mockApiClient.setUploadFailure(new Error('Network error'));

      const args: SyncCliArgs = { silent: false, debug: false, force: false, test: false };
      const result = await executeSync(args, deps);

      expect(result.exitCode).toBe(1);
      expect(result.error).toBeDefined();
    });

    it('logs error in silent mode when debug is enabled', async () => {
      mockTokenStorage.setToken(null);

      const args: SyncCliArgs = { silent: true, debug: true, force: false, test: false };
      await executeSync(args, deps);

      expect(consoleErrors.length).toBeGreaterThan(0);
    });
  });
});
