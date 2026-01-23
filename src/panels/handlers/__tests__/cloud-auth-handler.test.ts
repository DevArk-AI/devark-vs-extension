import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudAuthHandler } from '../cloud-auth-handler';
import { SharedContext } from '../shared-context';
import type { MessageSender } from '../base-handler';
import type * as vscode from 'vscode';

const mockUri = { fsPath: '/test/path' } as vscode.Uri;

// Mock ExtensionState
vi.mock('../../../extension-state', () => ({
  ExtensionState: {
    getAuthService: vi.fn().mockReturnValue({
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getCurrentUser: vi.fn().mockResolvedValue({ username: 'testuser', userId: 'user123' }),
      startLogin: vi.fn().mockResolvedValue({
        authUrl: 'https://auth.example.com',
        waitForCompletion: vi.fn().mockResolvedValue(true),
      }),
      logout: vi.fn().mockResolvedValue(undefined),
      getToken: vi.fn().mockResolvedValue('test-token'),
      verifyToken: vi.fn().mockResolvedValue(true),
    }),
    getSyncService: vi.fn().mockReturnValue({
      sync: vi.fn().mockResolvedValue({ success: true, sessionsUploaded: 5, errors: [] }),
      getSyncStateSummary: vi.fn().mockResolvedValue({
        syncedSessions: 10,
        lastSynced: new Date('2024-01-01'),
      }),
      getServerLastSessionDate: vi.fn().mockResolvedValue(new Date('2024-01-10')),
      uploadSessionsWithProgress: vi.fn().mockResolvedValue({ success: true, sessionsUploaded: 2, errors: [] }),
    }),
    getApiClient: vi.fn().mockReturnValue({
      uploadSessions: vi.fn().mockResolvedValue({ success: true, sessionsProcessed: 2 }),
    }),
    getAnalyticsService: vi.fn().mockReturnValue({
      track: vi.fn(),
      isEnabled: vi.fn().mockReturnValue(false),
    }),
  },
}));

// Mock vscode
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
  },
  env: {
    openExternal: vi.fn(),
  },
  Uri: {
    parse: vi.fn((url: string) => ({ toString: () => url })),
  },
}));

describe('CloudAuthHandler', () => {
  let handler: CloudAuthHandler;
  let mockSender: MessageSender;
  let sharedContext: SharedContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSender = { sendMessage: vi.fn() };
    sharedContext = new SharedContext();

    // Mock unifiedSessionService
    sharedContext.unifiedSessionService = {
      // Index method: duration is in seconds (240 seconds = 4 min threshold)
      getSessionIndex: vi.fn().mockResolvedValue([
        { id: '1', duration: 600, timestamp: new Date('2024-01-15'), source: 'cursor', projectPath: '/test', workspaceName: 'test', promptCount: 5 },
        { id: '2', duration: 300, timestamp: new Date('2024-01-14'), source: 'claude_code', projectPath: '/test', workspaceName: 'test', promptCount: 3 },
        { id: '3', duration: 120, timestamp: new Date('2024-01-13'), source: 'cursor', projectPath: '/test', workspaceName: 'test', promptCount: 1 }, // Too short (< 240 seconds)
      ]),
      getUnifiedSessions: vi.fn().mockResolvedValue({
        sessions: [
          { id: '1', duration: 10, startTime: new Date('2024-01-15'), source: 'cursor' },
          { id: '2', duration: 5, startTime: new Date('2024-01-14'), source: 'claude_code' },
          { id: '3', duration: 2, startTime: new Date('2024-01-13'), source: 'cursor' },
        ],
        bySource: { total: 3, cursor: 2, claudeCode: 1 },
      }),
      invalidateCache: vi.fn(),
    } as any;

    handler = new CloudAuthHandler(
      mockSender,
      { extensionUri: mockUri, context: {} as vscode.ExtensionContext },
      sharedContext
    );
  });

  describe('getHandledMessageTypes', () => {
    it('should return correct message types', () => {
      const types = handler.getHandledMessageTypes();
      expect(types).toContain('getCloudStatus');
      expect(types).toContain('loginWithGithub');
      expect(types).toContain('authenticate');
      expect(types).toContain('logout');
      expect(types).toContain('syncNow');
      expect(types).toContain('previewSync');
      expect(types).toContain('syncWithFilters');
      expect(types).toContain('getSyncStatus');
    });
  });

  describe('handleMessage', () => {
    it('should handle getCloudStatus', async () => {
      const result = await handler.handleMessage('getCloudStatus', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('cloudStatus', expect.objectContaining({
        isConnected: true,
        username: 'testuser',
      }));
    });

    it('should handle logout', async () => {
      const result = await handler.handleMessage('logout', {});
      expect(result).toBe(true);
      expect(mockSender.sendMessage).toHaveBeenCalledWith('cloudStatus', { isConnected: false });
    });

    it('should return false for unknown message types', async () => {
      const result = await handler.handleMessage('unknownType', {});
      expect(result).toBe(false);
    });
  });

  describe('handleGetSyncStatus', () => {
    it('should return cached data if valid', async () => {
      // Pre-populate cache
      sharedContext.updateSyncStatusCache({
        localSessions: 5,
        syncedSessions: 3,
        pendingUploads: 2,
        lastSynced: new Date('2024-01-01'),
      });

      await handler.handleMessage('getSyncStatus', {});

      expect(mockSender.sendMessage).toHaveBeenCalledWith('syncStatus', expect.objectContaining({
        localSessions: 5,
        syncedSessions: 3,
        pendingUploads: 2,
      }));
    });

    it('should compute fresh status if cache is invalid', async () => {
      // Invalidate cache
      sharedContext.invalidateSyncStatusCache();

      await handler.handleMessage('getSyncStatus', {});

      // Should have called unifiedSessionService's fast index method
      expect(sharedContext.unifiedSessionService!.getSessionIndex).toHaveBeenCalled();
      // Should have called sync state summary (no full session re-scan)
      const { ExtensionState } = await import('../../../extension-state');
      expect(ExtensionState.getSyncService().getSyncStateSummary).toHaveBeenCalled();
      expect(mockSender.sendMessage).toHaveBeenCalledWith('syncStatus', expect.any(Object));
    });
  });

  describe('handlePreviewSync', () => {
    it('should filter sessions by duration', async () => {
      await handler.handleMessage('previewSync', {});

      expect(mockSender.sendMessage).toHaveBeenCalledWith('syncPreview', expect.objectContaining({
        totalSessions: 2, // Only 2 sessions with duration >= 4 minutes
        filteredOutShort: 1,
      }));
    });

    it('should apply limit when filterType is recent', async () => {
      await handler.handleMessage('previewSync', { filterType: 'recent', limit: 1 });

      expect(mockSender.sendMessage).toHaveBeenCalledWith('syncPreview', expect.objectContaining({
        totalSessions: 1,
      }));
    });

    it('should include sessionsBySource breakdown in preview', async () => {
      await handler.handleMessage('previewSync', {});

      // Expects breakdown: 1 cursor (duration 10), 1 claude_code (duration 5)
      // Session 3 (cursor, duration 2) is filtered out (< 4 min)
      expect(mockSender.sendMessage).toHaveBeenCalledWith('syncPreview', expect.objectContaining({
        sessionsBySource: {
          cursor: 1,
          claudeCode: 1,
          total: 2
        },
      }));
    });
  });

  describe('pushInitialCloudStatus', () => {
    it('should send cloudStatus to webview', async () => {
      await handler.pushInitialCloudStatus();

      expect(mockSender.sendMessage).toHaveBeenCalledWith('cloudStatus', expect.objectContaining({
        isConnected: true,
        username: 'testuser',
      }));
    });
  });

  describe('cache management', () => {
    it('should invalidate cache via public method', () => {
      // Pre-populate cache
      sharedContext.updateSyncStatusCache({
        localSessions: 5,
        syncedSessions: 3,
        pendingUploads: 2,
      });
      expect(sharedContext.isSyncStatusCacheValid()).toBe(true);

      handler.invalidateSyncStatusCache();

      expect(sharedContext.isSyncStatusCacheValid()).toBe(false);
    });

    it('should invalidate both sync status and session caches after sync', async () => {
      // Pre-populate sync status cache
      sharedContext.updateSyncStatusCache({
        localSessions: 5,
        syncedSessions: 3,
        pendingUploads: 2,
      });

      await handler.handleMessage('syncNow', {});

      // Verify both caches were invalidated (they get repopulated after, which is correct)
      expect(sharedContext.unifiedSessionService!.invalidateCache).toHaveBeenCalled();

      // Cache should be refreshed with new data after sync
      expect(sharedContext.isSyncStatusCacheValid()).toBe(true);
    });
  });
});
