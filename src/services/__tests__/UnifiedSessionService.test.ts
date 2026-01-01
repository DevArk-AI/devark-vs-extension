/**
 * UnifiedSessionService Unit Tests
 *
 * Tests for session aggregation from multiple sources including:
 * - Empty session filtering (promptCount > 0)
 * - Date range filtering
 * - Ignored path filtering
 * - Session source counting (SessionsBySource)
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { UnifiedSessionService } from '../UnifiedSessionService';
import { CursorSession } from '../../cursor-integration/types';
import { createMockSession } from '../../test/fixtures/mock-sessions';

// Mock the CursorSessionReader
const mockCursorReader = {
  isReady: vi.fn().mockReturnValue(true),
  initialize: vi.fn().mockResolvedValue(true),
  getActiveSessions: vi.fn().mockReturnValue([]),
};

// Mock the ClaudeSessionReader and NodeFileSystem
vi.mock('../../adapters/readers/claude-session-reader', () => {
  return {
    ClaudeSessionReader: class MockClaudeSessionReader {
      getSessions() {
        return Promise.resolve([]);
      }
    },
  };
});

vi.mock('../../adapters/readers/node-filesystem', () => {
  return {
    NodeFileSystem: class MockNodeFileSystem {},
  };
});

// Mock shouldIgnorePath
vi.mock('../../adapters/prompt-detection/ignore-paths', () => ({
  shouldIgnorePath: (path: string | undefined) => {
    if (!path) return false;
    return path.includes('/tmp/') || path.includes('/.cursor/');
  },
}));

describe('UnifiedSessionService', () => {
  let service: UnifiedSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UnifiedSessionService();
    service.initialize(mockCursorReader as any);
  });

  describe('Session Counting', () => {
    test('should filter out empty sessions by default (minPromptCount=1)', async () => {
      const sessions: CursorSession[] = [
        createMockSession({ sessionId: 'session-1', promptCount: 0, workspaceName: 'project-a' }),
        createMockSession({ sessionId: 'session-2', promptCount: 5, workspaceName: 'project-b' }),
        createMockSession({ sessionId: 'session-3', promptCount: 0, workspaceName: 'project-c' }),
        createMockSession({ sessionId: 'session-4', promptCount: 10, workspaceName: 'project-d' }),
      ];

      mockCursorReader.getActiveSessions.mockReturnValue(sessions);

      const result = await service.getUnifiedSessions({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
        until: new Date(),
        sources: ['cursor'],
      });

      // Default minPromptCount=1 filters out empty sessions
      expect(result.sessions).toHaveLength(2);
      expect(result.bySource.cursor).toBe(2);
    });

    test('should include all sessions when minPromptCount=0', async () => {
      const sessions: CursorSession[] = [
        createMockSession({ sessionId: 'session-1', promptCount: 0, workspaceName: 'project-a' }),
        createMockSession({ sessionId: 'session-2', promptCount: 5, workspaceName: 'project-b' }),
        createMockSession({ sessionId: 'session-3', promptCount: 0, workspaceName: 'project-c' }),
        createMockSession({ sessionId: 'session-4', promptCount: 10, workspaceName: 'project-d' }),
      ];

      mockCursorReader.getActiveSessions.mockReturnValue(sessions);

      const result = await service.getUnifiedSessions({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
        until: new Date(),
        sources: ['cursor'],
        minPromptCount: 0,
      });

      expect(result.sessions).toHaveLength(4);
      expect(result.bySource.cursor).toBe(4);
    });

    test('should include sessions with promptCount=0 when minPromptCount=0', async () => {
      const sessions: CursorSession[] = [
        createMockSession({ sessionId: 'empty-1', promptCount: 0 }),
        createMockSession({ sessionId: 'empty-2', promptCount: 0 }),
        createMockSession({ sessionId: 'empty-3', promptCount: 0 }),
      ];

      mockCursorReader.getActiveSessions.mockReturnValue(sessions);

      const result = await service.getUnifiedSessions({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
        until: new Date(),
        sources: ['cursor'],
        minPromptCount: 0,
      });

      expect(result.sessions).toHaveLength(3);
      expect(result.bySource.cursor).toBe(3);
    });

    test('should filter sessions with custom minPromptCount threshold', async () => {
      const sessions: CursorSession[] = [
        createMockSession({ sessionId: 'session-1', promptCount: 1, workspaceName: 'project-a' }),
        createMockSession({ sessionId: 'session-2', promptCount: 5, workspaceName: 'project-b' }),
        createMockSession({ sessionId: 'session-3', promptCount: 3, workspaceName: 'project-c' }),
        createMockSession({ sessionId: 'session-4', promptCount: 10, workspaceName: 'project-d' }),
      ];

      mockCursorReader.getActiveSessions.mockReturnValue(sessions);

      const result = await service.getUnifiedSessions({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
        until: new Date(),
        sources: ['cursor'],
        minPromptCount: 5,
      });

      expect(result.sessions).toHaveLength(2);
      expect(result.bySource.cursor).toBe(2);
    });
  });

  describe('Date Range Filtering', () => {
    test('should filter sessions within date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      const sessions: CursorSession[] = [
        createMockSession({ sessionId: 'recent', startTime: yesterday, promptCount: 5 }),
        createMockSession({ sessionId: 'old', startTime: threeDaysAgo, promptCount: 5 }),
      ];

      mockCursorReader.getActiveSessions.mockReturnValue(sessions);

      const result = await service.getUnifiedSessions({
        since: twoDaysAgo,
        until: now,
        sources: ['cursor'],
      });

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].id).toBe('cursor-recent');
    });

    test('should include sessions at date range boundaries', async () => {
      const endDate = new Date('2025-01-15T23:59:59.999Z');
      const startDate = new Date('2025-01-15T00:00:00.000Z');

      const sessions: CursorSession[] = [
        createMockSession({
          sessionId: 'at-start',
          startTime: new Date('2025-01-15T00:00:00.000Z'),
          promptCount: 5,
        }),
        createMockSession({
          sessionId: 'at-end',
          startTime: new Date('2025-01-15T23:59:59.000Z'),
          promptCount: 5,
        }),
      ];

      mockCursorReader.getActiveSessions.mockReturnValue(sessions);

      const result = await service.getUnifiedSessions({
        since: startDate,
        until: endDate,
        sources: ['cursor'],
      });

      expect(result.sessions).toHaveLength(2);
    });

    test('should exclude sessions outside date range', async () => {
      const sessions: CursorSession[] = [
        createMockSession({
          sessionId: 'before-range',
          startTime: new Date('2025-01-10T12:00:00Z'),
          promptCount: 5,
        }),
        createMockSession({
          sessionId: 'after-range',
          startTime: new Date('2025-01-20T12:00:00Z'),
          promptCount: 5,
        }),
      ];

      mockCursorReader.getActiveSessions.mockReturnValue(sessions);

      const result = await service.getUnifiedSessions({
        since: new Date('2025-01-14T00:00:00Z'),
        until: new Date('2025-01-16T23:59:59Z'),
        sources: ['cursor'],
      });

      expect(result.sessions).toHaveLength(0);
    });
  });

  describe('Ignored Path Filtering', () => {
    test('should filter out sessions from temp directories', async () => {
      const sessions: CursorSession[] = [
        createMockSession({
          sessionId: 'valid',
          workspacePath: '/Users/dev/projects/my-app',
          promptCount: 5,
        }),
        createMockSession({
          sessionId: 'temp',
          workspacePath: '/tmp/some-temp-project',
          promptCount: 5,
        }),
      ];

      mockCursorReader.getActiveSessions.mockReturnValue(sessions);

      const result = await service.getUnifiedSessions({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
        until: new Date(),
        sources: ['cursor'],
      });

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].id).toBe('cursor-valid');
    });

    test('should filter out sessions from IDE installation paths', async () => {
      const sessions: CursorSession[] = [
        createMockSession({
          sessionId: 'valid',
          workspacePath: '/Users/dev/projects/my-app',
          promptCount: 5,
        }),
        createMockSession({
          sessionId: 'cursor-install',
          workspacePath: '/Users/dev/.cursor/extensions/some-ext',
          promptCount: 5,
        }),
      ];

      mockCursorReader.getActiveSessions.mockReturnValue(sessions);

      const result = await service.getUnifiedSessions({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
        until: new Date(),
        sources: ['cursor'],
      });

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].id).toBe('cursor-valid');
    });

    test('should keep sessions with valid workspace paths', async () => {
      const sessions: CursorSession[] = [
        createMockSession({
          sessionId: 'project-1',
          workspacePath: '/Users/dev/projects/frontend',
          promptCount: 5,
        }),
        createMockSession({
          sessionId: 'project-2',
          workspacePath: '/home/user/code/backend',
          promptCount: 10,
        }),
      ];

      mockCursorReader.getActiveSessions.mockReturnValue(sessions);

      const result = await service.getUnifiedSessions({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
        until: new Date(),
        sources: ['cursor'],
      });

      expect(result.sessions).toHaveLength(2);
    });
  });

  describe('SessionsBySource Counting', () => {
    test('should accurately count Cursor sessions', async () => {
      const sessions: CursorSession[] = [
        createMockSession({ sessionId: 's1', promptCount: 5 }),
        createMockSession({ sessionId: 's2', promptCount: 10 }),
        createMockSession({ sessionId: 's3', promptCount: 15 }),
      ];

      mockCursorReader.getActiveSessions.mockReturnValue(sessions);

      const result = await service.getUnifiedSessions({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
        until: new Date(),
        sources: ['cursor'],
      });

      expect(result.bySource.cursor).toBe(3);
      expect(result.bySource.total).toBe(3);
    });

    test('should count sessions even with promptCount=0 when minPromptCount=0', async () => {
      const sessions: CursorSession[] = [
        createMockSession({ sessionId: 's1', promptCount: 0 }),
        createMockSession({ sessionId: 's2', promptCount: 0 }),
      ];

      mockCursorReader.getActiveSessions.mockReturnValue(sessions);

      const result = await service.getUnifiedSessions({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
        until: new Date(),
        sources: ['cursor'],
        minPromptCount: 0,
      });

      // Sessions with promptCount=0 are counted when minPromptCount=0
      expect(result.bySource.cursor).toBe(2);
      expect(result.bySource.total).toBe(2);
    });

    test('should filter out sessions from ignored paths', async () => {
      const sessions: CursorSession[] = [
        createMockSession({ sessionId: 'temp-path', promptCount: 5, workspacePath: '/tmp/test' }),
        createMockSession({ sessionId: 'valid-1', promptCount: 5 }),
        createMockSession({ sessionId: 'valid-2', promptCount: 10 }),
      ];

      mockCursorReader.getActiveSessions.mockReturnValue(sessions);

      const result = await service.getUnifiedSessions({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
        until: new Date(),
        sources: ['cursor'],
      });

      // Only temp-path is filtered out
      expect(result.bySource.cursor).toBe(2);
      expect(result.bySource.total).toBe(2);
    });
  });

  describe('Combined Filtering', () => {
    test('should apply all filters in correct order: date -> empty -> path', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const sessions: CursorSession[] = [
        // Should pass: within date, has prompts, valid path
        createMockSession({
          sessionId: 'valid',
          startTime: yesterday,
          promptCount: 5,
          workspacePath: '/Users/dev/project',
        }),
        // Should fail: outside date range
        createMockSession({
          sessionId: 'old',
          startTime: lastWeek,
          promptCount: 5,
          workspacePath: '/Users/dev/project',
        }),
        // Should fail: no prompts
        createMockSession({
          sessionId: 'empty',
          startTime: yesterday,
          promptCount: 0,
          workspacePath: '/Users/dev/project',
        }),
        // Should fail: temp path
        createMockSession({
          sessionId: 'temp',
          startTime: yesterday,
          promptCount: 5,
          workspacePath: '/tmp/test',
        }),
      ];

      mockCursorReader.getActiveSessions.mockReturnValue(sessions);

      const result = await service.getUnifiedSessions({
        since: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        until: now,
        sources: ['cursor'],
      });

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].id).toBe('cursor-valid');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty session list from reader', async () => {
      mockCursorReader.getActiveSessions.mockReturnValue([]);

      const result = await service.getUnifiedSessions({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
        until: new Date(),
        sources: ['cursor'],
      });

      expect(result.sessions).toHaveLength(0);
      expect(result.bySource.cursor).toBe(0);
    });

    test('should handle sessions with undefined workspace path', async () => {
      const sessions: CursorSession[] = [
        createMockSession({
          sessionId: 'no-path',
          workspacePath: undefined,
          promptCount: 5,
        }),
      ];

      mockCursorReader.getActiveSessions.mockReturnValue(sessions);

      const result = await service.getUnifiedSessions({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
        until: new Date(),
        sources: ['cursor'],
      });

      expect(result.sessions).toHaveLength(1);
    });

    test('should handle reader not being ready', async () => {
      mockCursorReader.isReady.mockReturnValue(false);
      mockCursorReader.initialize.mockResolvedValue(false);

      const result = await service.getUnifiedSessions({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
        until: new Date(),
        sources: ['cursor'],
      });

      expect(result.sessions).toHaveLength(0);
      expect(result.bySource.cursor).toBe(0);
    });
  });
});
