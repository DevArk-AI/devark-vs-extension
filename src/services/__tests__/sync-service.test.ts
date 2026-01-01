/**
 * SyncService Tests
 *
 * TDD: Tests written first, implementation follows.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SyncService } from '../sync-service';
import { MockSessionReader } from '../../../test/mocks/mock-session-reader';
import { MockApiClient } from '../../../test/mocks/mock-api-client';
import { MockTokenStorage, MockSyncStateStorage } from '../../../test/mocks/mock-storage';
import { AuthService } from '../auth-service';
import type { Message } from '../../types';

describe('SyncService', () => {
  let syncService: SyncService;
  let mockSessionReader: MockSessionReader;
  let mockApiClient: MockApiClient;
  let mockSyncState: MockSyncStateStorage;
  let mockTokenStorage: MockTokenStorage;
  let authService: AuthService;

  beforeEach(() => {
    mockSessionReader = new MockSessionReader();
    mockApiClient = new MockApiClient();
    mockSyncState = new MockSyncStateStorage();
    mockTokenStorage = new MockTokenStorage();
    authService = new AuthService(mockTokenStorage, mockApiClient);

    // Set up authenticated state by default
    mockTokenStorage.setToken('valid-token');
    mockApiClient.setTokenValid(true);

    syncService = new SyncService({
      claudeReader: mockSessionReader,
      apiClient: mockApiClient,
      syncState: mockSyncState,
      authService,
    });
  });

  describe('sync()', () => {
    describe('session loading', () => {
      it('returns empty result when no sessions found', async () => {
        const result = await syncService.sync();

        expect(result.success).toBe(true);
        expect(result.sessionsUploaded).toBe(0);
        expect(result.sessionsSkipped).toBe(0);
        expect(result.projectsSynced).toEqual([]);
      });

      it('only loads sessions after last sync time', async () => {
        const lastSync = new Date('2024-01-15');
        mockSyncState.setLastSync('/project', lastSync);

        // Session before last sync - should be excluded
        mockSessionReader.addSession({
          id: 'old-session',
          projectPath: '/project',
          timestamp: new Date('2024-01-10'),
          duration: 3600,
        });

        // Session after last sync - should be included
        mockSessionReader.addSession({
          id: 'new-session',
          projectPath: '/project',
          timestamp: new Date('2024-01-20'),
          duration: 3600,
        });

        const result = await syncService.sync({ projectPath: '/project' });

        expect(result.sessionsUploaded).toBe(1);
        expect(mockApiClient.uploadedSessions).toHaveLength(1);
        expect(mockApiClient.uploadedSessions[0].id).toBe('new-session');
      });

      it('loads all sessions when force: true', async () => {
        const lastSync = new Date('2024-01-15');
        mockSyncState.setLastSync('/project', lastSync);

        mockSessionReader.addSession({
          id: 'old-session',
          projectPath: '/project',
          timestamp: new Date('2024-01-10'),
          duration: 3600,
        });

        mockSessionReader.addSession({
          id: 'new-session',
          projectPath: '/project',
          timestamp: new Date('2024-01-20'),
          duration: 3600,
        });

        const result = await syncService.sync({ force: true });

        expect(result.sessionsUploaded).toBe(2);
        expect(mockApiClient.uploadedSessions).toHaveLength(2);
      });

      it('filters sessions by projectPath when specified', async () => {
        mockSessionReader.addSession({
          id: 'session-1',
          projectPath: '/project-a',
          duration: 3600,
        });

        mockSessionReader.addSession({
          id: 'session-2',
          projectPath: '/project-b',
          duration: 3600,
        });

        const result = await syncService.sync({ projectPath: '/project-a' });

        expect(result.sessionsUploaded).toBe(1);
        expect(mockApiClient.uploadedSessions[0].id).toBe('session-1');
        expect(result.projectsSynced).toEqual(['/project-a']);
      });

      it('skips sessions under 4 minutes duration', async () => {
        // 3 minutes - should be skipped
        mockSessionReader.addSession({
          id: 'short-session',
          duration: 180,
        });

        // 5 minutes - should be included
        mockSessionReader.addSession({
          id: 'long-session',
          duration: 300,
        });

        const result = await syncService.sync();

        expect(result.sessionsUploaded).toBe(1);
        expect(result.sessionsSkipped).toBe(1);
        expect(mockApiClient.uploadedSessions[0].id).toBe('long-session');
      });

      it('handles reader errors gracefully', async () => {
        mockSessionReader.addError({
          path: 'session-corrupted.jsonl',
          error: 'Failed to parse session file',
          recoverable: true,
        });

        mockSessionReader.addSession({
          id: 'valid-session',
          duration: 3600,
        });

        const result = await syncService.sync();

        expect(result.success).toBe(true);
        expect(result.sessionsUploaded).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('Failed to parse');
      });
    });

    describe('sanitization', () => {
      it('sanitizes all messages before upload', async () => {
        const messages: Message[] = [
          { role: 'user', content: 'My API key is sk-abc123def456', timestamp: new Date() },
          { role: 'assistant', content: 'I see your key', timestamp: new Date() },
        ];

        mockSessionReader.addSession({
          id: 'session-1',
          duration: 3600,
          messages,
        });

        await syncService.sync();

        const uploaded = mockApiClient.uploadedSessions[0];
        // The message summary should not contain the raw API key
        expect(uploaded.data.messageSummary).not.toContain('sk-abc123def456');
      });

      it('redacts credentials in uploaded sessions', async () => {
        const messages: Message[] = [
          { role: 'user', content: 'Token: sk-ant-xyz789', timestamp: new Date() },
        ];

        mockSessionReader.addSession({
          id: 'session-1',
          duration: 3600,
          messages,
        });

        await syncService.sync();

        const uploaded = mockApiClient.uploadedSessions[0];
        expect(uploaded.sanitizationMetadata.credentialsRedacted).toBeGreaterThan(0);
      });

      it('redacts file paths in uploaded sessions', async () => {
        const messages: Message[] = [
          { role: 'user', content: 'Edit /Users/danny/secret/project/main.ts', timestamp: new Date() },
        ];

        mockSessionReader.addSession({
          id: 'session-1',
          duration: 3600,
          messages,
        });

        await syncService.sync();

        const uploaded = mockApiClient.uploadedSessions[0];
        expect(uploaded.sanitizationMetadata.pathsRedacted).toBeGreaterThan(0);
      });

      it('captures sanitization metadata per session', async () => {
        const messages: Message[] = [
          { role: 'user', content: 'key: sk-abc email: test@example.com', timestamp: new Date() },
        ];

        mockSessionReader.addSession({
          id: 'session-1',
          duration: 3600,
          messages,
        });

        await syncService.sync();

        const uploaded = mockApiClient.uploadedSessions[0];
        expect(uploaded.sanitizationMetadata).toEqual(
          expect.objectContaining({
            credentialsRedacted: expect.any(Number),
            pathsRedacted: expect.any(Number),
            emailsRedacted: expect.any(Number),
            urlsRedacted: expect.any(Number),
            ipAddressesRedacted: expect.any(Number),
            envVarsRedacted: expect.any(Number),
            databaseUrlsRedacted: expect.any(Number),
          })
        );
      });

      it('does not mutate original session data', async () => {
        const originalContent = 'My secret key is sk-secret123';
        const messages: Message[] = [
          { role: 'user', content: originalContent, timestamp: new Date() },
        ];

        const session = mockSessionReader.addSession({
          id: 'session-1',
          duration: 3600,
          messages,
        });

        await syncService.sync();

        // Original session should be unchanged
        expect(session.messages[0].content).toBe(originalContent);
      });
    });

    describe('upload', () => {
      it('uploads sanitized sessions to API', async () => {
        mockSessionReader.addSession({
          id: 'session-1',
          duration: 3600,
        });

        await syncService.sync();

        expect(mockApiClient.uploadCallCount).toBe(1);
        expect(mockApiClient.uploadedSessions).toHaveLength(1);
      });

      it('calls progress callback with current/total', async () => {
        mockSessionReader.addSession({ id: 'session-1', duration: 3600 });
        mockSessionReader.addSession({ id: 'session-2', duration: 3600 });

        const progressCalls: { current: number; total: number }[] = [];
        const onProgress = (current: number, total: number) => {
          progressCalls.push({ current, total });
        };

        await syncService.sync({ onProgress });

        expect(progressCalls.length).toBeGreaterThan(0);
        // MockApiClient simulates progress from 0 to total
        expect(progressCalls[progressCalls.length - 1].total).toBe(2);
      });

      it('updates sync state on success', async () => {
        mockSessionReader.addSession({
          id: 'session-1',
          projectPath: '/my-project',
          duration: 3600,
        });

        await syncService.sync();

        const state = await mockSyncState.getProjectState('/my-project');
        expect(state).not.toBeNull();
        expect(state?.sessionsUploaded).toBe(1);
        expect(state?.lastSessionId).toBe('session-1');
      });

      it('records last sync time per project', async () => {
        mockSessionReader.addSession({
          id: 'session-1',
          projectPath: '/project-a',
          duration: 3600,
        });
        mockSessionReader.addSession({
          id: 'session-2',
          projectPath: '/project-b',
          duration: 3600,
        });

        await syncService.sync();

        const stateA = await mockSyncState.getProjectState('/project-a');
        const stateB = await mockSyncState.getProjectState('/project-b');

        expect(stateA?.lastSyncTime).toBeDefined();
        expect(stateB?.lastSyncTime).toBeDefined();
      });

      it('handles upload failures gracefully', async () => {
        mockSessionReader.addSession({
          id: 'session-1',
          duration: 3600,
        });

        mockApiClient.setUploadFailure(new Error('Network error'));

        const result = await syncService.sync();

        expect(result.success).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('Network error');
      });

      it('returns upload result with streak info', async () => {
        mockSessionReader.addSession({
          id: 'session-1',
          duration: 3600,
        });

        mockApiClient.setStreak({
          current: 5,
          points: 1000,
          longestStreak: 10,
          totalSessions: 50,
          todaySessions: 3,
        });

        const result = await syncService.sync();

        expect(result.uploadResult).toBeDefined();
        expect(result.uploadResult?.streak?.current).toBe(5);
      });
    });

    describe('authentication', () => {
      it('fails early if not authenticated', async () => {
        mockTokenStorage.setToken(null);

        mockSessionReader.addSession({
          id: 'session-1',
          duration: 3600,
        });

        const result = await syncService.sync();

        expect(result.success).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('NOT_AUTHENTICATED');
        expect(mockApiClient.uploadCallCount).toBe(0);
      });

      it('fails if token is invalid', async () => {
        mockTokenStorage.setToken('invalid-token');
        mockApiClient.setTokenValid(false);

        mockSessionReader.addSession({
          id: 'session-1',
          duration: 3600,
        });

        const result = await syncService.sync();

        expect(result.success).toBe(false);
        expect(result.errors[0].code).toBe('TOKEN_INVALID');
        expect(mockApiClient.uploadCallCount).toBe(0);
      });
    });
  });
});
