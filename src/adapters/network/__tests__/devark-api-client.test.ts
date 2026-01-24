/**
 * DevArkApiClient Tests - TDD
 *
 * Tests written FIRST before implementation (RED phase).
 * High-level API client for vibe-log backend.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DevArkApiClient } from '../devark-api-client';
import { MockHttpClient } from '../../../../test/mocks/mock-http-client';
import { DEFAULT_CONFIG } from '../../../ports/storage/config-storage.interface';
import type { SanitizedSession, SessionMetadata } from '../../../types';

// Helper to create a sample sanitized session
function createSampleSession(overrides?: Partial<SanitizedSession>): SanitizedSession {
  const metadata: SessionMetadata = {
    files_edited: 5,
    languages: ['typescript', 'javascript'],
  };

  return {
    id: `session-${Math.random().toString(36).substr(2, 9)}`,
    tool: 'claude_code',
    timestamp: new Date().toISOString(),
    duration: 1800, // 30 minutes
    data: {
      projectName: 'test-project',
      messageSummary: JSON.stringify({ userMessages: 10, assistantMessages: 10 }),
      messageCount: 20,
      metadata,
    },
    sanitizationMetadata: {
      totalRedactions: 0,
      credentialsRedacted: 0,
      pathsRedacted: 0,
      urlsRedacted: 0,
      emailsRedacted: 0,
      ipsRedacted: 0,
    },
    ...overrides,
  };
}

describe('DevArkApiClient', () => {
  let httpClient: MockHttpClient;
  let apiClient: DevArkApiClient;

  beforeEach(() => {
    httpClient = new MockHttpClient();
    apiClient = new DevArkApiClient(httpClient, DEFAULT_CONFIG.apiUrl);
  });

  describe('createAuthSession()', () => {
    it('POST /api/auth/cli/session returns authUrl and token', async () => {
      httpClient.setResponse('/api/auth/cli/session', {
        data: {
          authUrl: 'https://app.devark.ai/auth?token=abc123',
          token: 'temp-session-token',
        },
      });

      const result = await apiClient.createAuthSession();

      expect(result.authUrl).toBe('https://app.devark.ai/auth?token=abc123&source=ide_extension');
      expect(result.token).toBe('temp-session-token');

      // Verify request was made
      const requests = httpClient.getRequestsTo('/api/auth/cli/session');
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe('POST');
    });

    it('handles sessionId as alternative to token', async () => {
      httpClient.setResponse('/api/auth/cli/session', {
        data: {
          authUrl: 'https://app.devark.ai/auth',
          sessionId: 'session-id-123', // Alternative field name
        },
      });

      const result = await apiClient.createAuthSession();

      expect(result.token).toBe('session-id-123');
    });

    it('throws on invalid response format', async () => {
      httpClient.setResponse('/api/auth/cli/session', {
        data: { invalid: 'response' },
      });

      await expect(apiClient.createAuthSession()).rejects.toThrow();
    });
  });

  describe('checkAuthCompletion()', () => {
    it('GET /api/auth/cli/complete with token param', async () => {
      httpClient.setResponse('/api/auth/cli/complete', {
        data: { success: true, userId: 123 },
      });

      const result = await apiClient.checkAuthCompletion('my-token');

      expect(httpClient.wasRequestMadeTo('/api/auth/cli/complete?token=my-token')).toBe(true);
      expect(result.success).toBe(true);
      expect(result.userId).toBe(123);
    });

    it('returns { success: false } on 404', async () => {
      httpClient.setError('/api/auth/cli/complete', {
        message: 'Not found',
        status: 404,
      });

      const result = await apiClient.checkAuthCompletion('invalid-token');

      expect(result.success).toBe(false);
    });

    it('returns { success: true, userId } on success', async () => {
      httpClient.setResponse('/api/auth/cli/complete', {
        data: { success: true, userId: 456 },
      });

      const result = await apiClient.checkAuthCompletion('valid-token');

      expect(result.success).toBe(true);
      expect(result.userId).toBe(456);
    });
  });

  describe('verifyToken()', () => {
    it('GET /api/auth/cli/verify with auth header', async () => {
      httpClient.setResponse('/api/auth/cli/verify', {
        data: { valid: true, user: { id: 'user-123' } },
      });

      apiClient.setToken('test-token');
      await apiClient.verifyToken();

      const request = httpClient.getLastRequest();
      expect(request?.headers?.Authorization).toBe('Bearer test-token');
    });

    it('returns { valid: true, userId } on success', async () => {
      httpClient.setResponse('/api/auth/cli/verify', {
        data: { valid: true, user: { id: 'user-123' } },
      });

      const result = await apiClient.verifyToken();

      expect(result.valid).toBe(true);
      expect(result.user?.id).toBe('user-123');
    });

    it('returns { valid: false } on error', async () => {
      httpClient.setError('/api/auth/cli/verify', {
        message: 'Unauthorized',
        status: 401,
      });

      const result = await apiClient.verifyToken();

      expect(result.valid).toBe(false);
    });
  });

  describe('uploadSessions()', () => {
    it('POST /cli/sessions with sessions array', async () => {
      httpClient.setResponse('/cli/sessions', {
        data: { success: true, created: 1, duplicates: 0 },
      });

      const sessions = [createSampleSession()];
      await apiClient.uploadSessions(sessions);

      const request = httpClient.getLastRequest();
      expect(request?.method).toBe('POST');
      expect(request?.url).toContain('/cli/sessions');
      expect(request?.data).toHaveProperty('sessions');
    });

    it('batches sessions based on payload size', async () => {
      httpClient.setResponse('/cli/sessions', {
        data: { success: true, created: 100, duplicates: 0 },
      });

      // Create 250 small sessions - they should fit in fewer batches with size-based batching
      const sessions = Array.from({ length: 250 }, () => createSampleSession());
      await apiClient.uploadSessions(sessions);

      // With small sessions, batching should be based on size, not count
      const requests = httpClient.getRequestsTo('/cli/sessions');
      expect(requests.length).toBeGreaterThanOrEqual(1);

      // Verify all sessions were uploaded
      const totalUploaded = requests.reduce(
        (sum, req) => sum + (req.data as any).sessions.length,
        0
      );
      expect(totalUploaded).toBe(250);
    });

    it('includes checksum in payload', async () => {
      httpClient.setResponse('/cli/sessions', {
        data: { success: true, created: 1, duplicates: 0 },
      });

      const sessions = [createSampleSession()];
      await apiClient.uploadSessions(sessions);

      const request = httpClient.getLastRequest();
      const payload = request?.data as any;
      expect(payload.checksum).toBeDefined();
      expect(typeof payload.checksum).toBe('string');
      expect(payload.checksum.length).toBe(64); // SHA256 hex
    });

    it('calls progress callback with current/total', async () => {
      httpClient.setResponse('/cli/sessions', {
        data: { success: true, created: 50, duplicates: 0 },
      });

      const progressCalls: { current: number; total: number }[] = [];
      const sessions = Array.from({ length: 150 }, () => createSampleSession());

      await apiClient.uploadSessions(sessions, (current, total) => {
        progressCalls.push({ current, total });
      });

      // Progress should be called for each batch
      expect(progressCalls.length).toBeGreaterThanOrEqual(1);
      // Last progress call should show all sessions uploaded
      const lastCall = progressCalls[progressCalls.length - 1];
      expect(lastCall.total).toBe(150);
      expect(lastCall.current).toBe(150);
    });

    it('merges results from multiple chunks', async () => {
      httpClient.setResponse('/cli/sessions', {
        data: {
          success: true,
          created: 80,
          duplicates: 20,
          streak: { current: 5, points: 100 },
        },
      });

      const sessions = Array.from({ length: 200 }, () => createSampleSession());
      const result = await apiClient.uploadSessions(sessions);

      expect(result.success).toBe(true);
      expect(result.sessionsProcessed).toBe(200);
      // created and duplicates will be aggregated from all batches
      expect(result.created).toBeGreaterThanOrEqual(80);
    });

    it('includes batchNumber and totalBatches', async () => {
      httpClient.setResponse('/cli/sessions', {
        data: { success: true, created: 50, duplicates: 0 },
      });

      const sessions = Array.from({ length: 150 }, () => createSampleSession());
      await apiClient.uploadSessions(sessions);

      const requests = httpClient.getRequestsTo('/cli/sessions');

      // Verify batch metadata is included in all requests
      expect(requests.length).toBeGreaterThanOrEqual(1);
      expect((requests[0].data as any).batchNumber).toBe(1);
      expect((requests[0].data as any).totalBatches).toBeGreaterThanOrEqual(1);

      // If multiple batches, verify incrementing batch numbers
      if (requests.length > 1) {
        expect((requests[1].data as any).batchNumber).toBe(2);
      }
    });

    it('returns empty result for empty sessions array', async () => {
      const result = await apiClient.uploadSessions([]);

      expect(result.success).toBe(true);
      expect(result.sessionsProcessed).toBe(0);
      expect(httpClient.getRequests()).toHaveLength(0);
    });
  });

  describe('Size-Based Batching', () => {
    // Helper to create session with specific size
    function createSessionWithSize(sizeKB: number): SanitizedSession {
      const baseSize = 300;
      const targetBytes = sizeKB * 1024;
      const paddingNeeded = Math.max(0, targetBytes - baseSize);
      const padding = 'x'.repeat(paddingNeeded);

      return createSampleSession({
        data: {
          projectName: 'test-project',
          messageSummary: JSON.stringify({ padding, stats: {} }),
          messageCount: 10,
          metadata: { files_edited: 1, languages: ['typescript'] },
        },
      });
    }

    it('should batch by payload size not session count', async () => {
      httpClient.setResponse('/cli/sessions', {
        data: { success: true, created: 5, duplicates: 0 },
      });

      // 10 large sessions at 50KB each = 500KB total
      const sessions = Array.from({ length: 10 }, () => createSessionWithSize(50));
      await apiClient.uploadSessions(sessions);

      // Should make 2+ calls due to size
      const requests = httpClient.getRequestsTo('/cli/sessions');
      expect(requests.length).toBeGreaterThanOrEqual(2);
    });

    it('should keep small sessions in single batch up to ~400KB', async () => {
      httpClient.setResponse('/cli/sessions', {
        data: { success: true, created: 50, duplicates: 0 },
      });

      // 50 small sessions at 5KB each = 250KB total
      const sessions = Array.from({ length: 50 }, () => createSessionWithSize(5));
      await apiClient.uploadSessions(sessions);

      const requests = httpClient.getRequestsTo('/cli/sessions');
      expect(requests).toHaveLength(1);
      expect((requests[0].data as any).sessions).toHaveLength(50);
    });

    it('should split into multiple batches when exceeding ~400KB', async () => {
      httpClient.setResponse('/cli/sessions', {
        data: { success: true, created: 7, duplicates: 0 },
      });

      // 20 sessions at 50KB each = 1000KB total
      const sessions = Array.from({ length: 20 }, () => createSessionWithSize(50));
      await apiClient.uploadSessions(sessions);

      const requests = httpClient.getRequestsTo('/cli/sessions');
      expect(requests.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle single session exceeding target size', async () => {
      httpClient.setResponse('/cli/sessions', {
        data: { success: true, created: 1, duplicates: 0 },
      });

      const hugeSession = createSessionWithSize(600);
      await apiClient.uploadSessions([hugeSession]);

      const requests = httpClient.getRequestsTo('/cli/sessions');
      expect(requests).toHaveLength(1);
      expect((requests[0].data as any).sessions).toHaveLength(1);
    });

    it('should report accurate batch count in payload metadata', async () => {
      httpClient.setResponse('/cli/sessions', {
        data: { success: true, created: 2, duplicates: 0 },
      });

      // 4 sessions at 150KB each = 600KB total
      // Should create 2 batches (2 sessions per batch at ~300KB each, under 400KB limit)
      const sessions = Array.from({ length: 4 }, () => createSessionWithSize(150));
      await apiClient.uploadSessions(sessions);

      const requests = httpClient.getRequestsTo('/cli/sessions');
      expect(requests.length).toBe(2);

      expect((requests[0].data as any).batchNumber).toBe(1);
      expect((requests[0].data as any).totalBatches).toBe(2);
      expect((requests[1].data as any).batchNumber).toBe(2);
      expect((requests[1].data as any).totalBatches).toBe(2);
    });

    it('should call progress callback for each size-based batch', async () => {
      httpClient.setResponse('/cli/sessions', {
        data: { success: true, created: 2, duplicates: 0 },
      });

      // 4 sessions at 150KB each = 600KB total, 2 batches
      const sessions = Array.from({ length: 4 }, () => createSessionWithSize(150));
      const progressCalls: number[] = [];

      await apiClient.uploadSessions(sessions, (current) => {
        progressCalls.push(current);
      });

      expect(progressCalls.length).toBe(2);
    });
  });

  describe('getStreak()', () => {
    it('GET /api/user/streak returns StreakInfo', async () => {
      const streakData = {
        current: 7,
        points: 256,
        longestStreak: 14,
        totalSessions: 42,
        todaySessions: 3,
      };

      httpClient.setResponse('/api/user/streak', {
        data: streakData,
      });

      const result = await apiClient.getStreak();

      expect(result.current).toBe(7);
      expect(result.points).toBe(256);
      expect(result.longestStreak).toBe(14);
      expect(result.totalSessions).toBe(42);
      expect(result.todaySessions).toBe(3);
    });
  });

  describe('getRecentSessions()', () => {
    it('GET /api/sessions/recent with limit', async () => {
      httpClient.setResponse('/api/sessions/recent', {
        data: {
          sessions: [{ id: '1' }, { id: '2' }],
          count: 2,
        },
      });

      const sessions = await apiClient.getRecentSessions(10);

      expect(httpClient.wasRequestMadeTo('/api/sessions/recent?limit=10')).toBe(true);
      expect(sessions).toHaveLength(2);
    });

    it('includes startDate and endDate params', async () => {
      httpClient.setResponse('/api/sessions/recent', {
        data: { sessions: [], count: 0 },
      });

      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');

      await apiClient.getRecentSessions(10, start, end);

      const request = httpClient.getLastRequest();
      expect(request?.url).toContain('start=');
      expect(request?.url).toContain('end=');
    });

    it('handles response with sessions array at top level', async () => {
      httpClient.setResponse('/api/sessions/recent', {
        data: {
          sessions: [{ id: '1', projectName: 'test' }],
        },
      });

      const sessions = await apiClient.getRecentSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('1');
    });
  });

  describe('instructions', () => {
    it('syncInstructions() POST with content and source', async () => {
      httpClient.setResponse('/api/user/instructions', {
        data: { success: true, updatedAt: '2024-01-15T10:00:00Z' },
      });

      const result = await apiClient.syncInstructions('My custom instructions', 'cli');

      const request = httpClient.getLastRequest();
      expect(request?.method).toBe('POST');
      expect((request?.data as any).content).toBe('My custom instructions');
      expect((request?.data as any).source).toBe('cli');
      expect(result.success).toBe(true);
    });

    it('fetchInstructions() GET returns content', async () => {
      httpClient.setResponse('/api/user/instructions', {
        data: {
          content: 'Saved instructions',
          updatedAt: '2024-01-15T10:00:00Z',
          lastUpdatedFrom: 'web',
        },
      });

      const result = await apiClient.fetchInstructions();

      expect(result.content).toBe('Saved instructions');
      expect(result.lastUpdatedFrom).toBe('web');
    });

    it('deleteInstructions() DELETE', async () => {
      httpClient.setResponse('/api/user/instructions', {
        data: { success: true },
      });

      const result = await apiClient.deleteInstructions();

      const request = httpClient.getLastRequest();
      expect(request?.method).toBe('DELETE');
      expect(result.success).toBe(true);
    });
  });

  describe('configuration', () => {
    it('getBaseUrl() returns current base URL', () => {
      apiClient = new DevArkApiClient(httpClient, 'https://custom.api.com');

      expect(apiClient.getBaseUrl()).toBe('https://custom.api.com');
    });

    it('setToken() sets auth token for all requests', async () => {
      httpClient.setResponse('/api/user/streak', { data: { current: 1 } });

      apiClient.setToken('my-auth-token');
      await apiClient.getStreak();

      expect(httpClient.getAuthToken()).toBe('my-auth-token');
    });

    it('setToken(null) clears auth token', () => {
      apiClient.setToken('my-token');
      apiClient.setToken(null);

      expect(httpClient.getAuthToken()).toBeNull();
    });
  });
});
