/**
 * CloudAuthHandler - Handles cloud sync and authentication messages
 *
 * Responsibilities:
 * - GitHub OAuth login/logout
 * - Session sync to cloud
 * - Sync status and preview
 * - Manages sync status cache
 */

import * as vscode from 'vscode';
import { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
import { SharedContext } from './shared-context';
import { ExtensionState } from '../../extension-state';
import { isEligibleForSync } from '../../core/sync';
import type { SessionIndex, SessionData, DetailedSyncProgress } from '../../types';
import type { UnifiedSession } from '../../services/UnifiedSessionService';
import type { SyncProgressData } from '../../shared/webview-protocol';
import { AnalyticsEvents } from '../../services/analytics-events';
import { getNotificationService } from '../../services/NotificationService';

export class CloudAuthHandler extends BaseMessageHandler {
  private sharedContext: SharedContext;
  private syncAbortController: AbortController | null = null;

  constructor(
    messageSender: MessageSender,
    handlerContext: HandlerContext,
    sharedContext: SharedContext
  ) {
    super(messageSender, handlerContext);
    this.sharedContext = sharedContext;
  }

  getHandledMessageTypes(): string[] {
    return [
      'getCloudStatus',
      'loginWithGithub',
      'authenticate', // Legacy alias
      'logout',
      'requestLogoutConfirmation',
      'syncNow',
      'previewSync',
      'syncWithFilters',
      'getSyncStatus',
      'cancelSync',
    ];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    switch (type) {
      case 'getCloudStatus':
        await this.handleGetCloudStatus();
        return true;
      case 'loginWithGithub':
      case 'authenticate':
        await this.handleLoginWithGithub();
        return true;
      case 'logout':
        await this.handleLogout();
        return true;
      case 'requestLogoutConfirmation':
        await this.handleLogoutConfirmation();
        return true;
      case 'syncNow':
        await this.handleSyncNow();
        return true;
      case 'previewSync':
        await this.handlePreviewSync(data);
        return true;
      case 'syncWithFilters':
        await this.handleSyncWithFilters(data);
        return true;
      case 'getSyncStatus':
        await this.handleGetSyncStatus();
        return true;
      case 'cancelSync':
        this.handleCancelSync();
        return true;
      default:
        return false;
    }
  }

  /**
   * Cancel an in-progress sync operation
   */
  private handleCancelSync(): void {
    if (this.syncAbortController) {
      console.log('[CloudAuthHandler] Cancelling sync operation');
      this.syncAbortController.abort();
      this.send('syncCancelled');
    }
  }

  /**
   * Send sync progress update to webview
   */
  private sendProgress(progress: SyncProgressData): void {
    this.send('syncProgress', progress);
  }

  private async handleGetCloudStatus(): Promise<void> {
    console.log('[CloudAuthHandler] handleGetCloudStatus called');
    try {
      const authService = ExtensionState.getAuthService();
      const isAuthenticated = await authService.isAuthenticated();
      console.log('[CloudAuthHandler] isAuthenticated:', isAuthenticated);
      let username: string | undefined;

      if (isAuthenticated) {
        try {
          const user = await authService.getCurrentUser();
          if (user) {
            username = user.username || user.userId;
          }
        } catch {
          // Username fetch failed, continue without it
        }
      }

      console.log('[CloudAuthHandler] Sending cloudStatus:', { isConnected: isAuthenticated, username });
      this.send('cloudStatus', {
        isConnected: isAuthenticated,
        username,
        autoSyncEnabled: false,
      });
    } catch (error) {
      console.error('[CloudAuthHandler] handleGetCloudStatus error:', error);
      this.send('cloudStatus', { isConnected: false });
    }
  }

  private async handleLoginWithGithub(): Promise<void> {
    console.log('[CloudAuthHandler] handleLoginWithGithub: START');
    try {
      const authService = ExtensionState.getAuthService();
      console.log('[CloudAuthHandler] handleLoginWithGithub: calling startLogin...');
      const { authUrl, waitForCompletion } = await authService.startLogin();
      console.log('[CloudAuthHandler] handleLoginWithGithub: startLogin succeeded, authUrl:', authUrl);

      // Open browser for auth
      getNotificationService().info('Opening browser for authentication...');
      vscode.env.openExternal(vscode.Uri.parse(authUrl));

      // Wait for SSE completion (handles timeout internally - 5 minutes)
      console.log('[CloudAuthHandler] Waiting for SSE auth completion...');
      const success = await waitForCompletion();

      if (success) {
        console.log('[CloudAuthHandler] SSE auth succeeded, calling handleGetCloudStatus');
        getNotificationService().info('Login successful!');
        ExtensionState.getAnalyticsService().track(AnalyticsEvents.CLOUD_CONNECTED, {
          provider: 'github',
        });
        await this.handleGetCloudStatus();
        console.log('[CloudAuthHandler] handleGetCloudStatus completed');
      } else {
        getNotificationService().error('Login failed. Please try again.');
      }
    } catch (error) {
      console.error('[CloudAuthHandler] handleLoginWithGithub: FAILED', error);
      getNotificationService().error(
        `Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleLogoutConfirmation(): Promise<void> {
    const result = await vscode.window.showWarningMessage(
      'Are you sure you want to log out of Vibe-Log?',
      { modal: true },
      'Log out'
    );

    if (result === 'Log out') {
      await this.handleLogout();
    }
  }

  private async handleLogout(): Promise<void> {
    try {
      const authService = ExtensionState.getAuthService();
      await authService.logout();
      ExtensionState.getAnalyticsService().track(AnalyticsEvents.CLOUD_DISCONNECTED);
      this.send('cloudStatus', { isConnected: false });
    } catch (error) {
      console.error('[CloudAuthHandler] Logout failed:', error);
    }
  }

  private async handleSyncNow(): Promise<void> {
    try {
      ExtensionState.getAnalyticsService().track(AnalyticsEvents.SYNC_STARTED, {
        tool: 'mixed',
      });
      const syncService = ExtensionState.getSyncService();
      const result = await syncService.sync();

      if (!result.success) {
        const errorMsg = result.errors.length > 0 ? result.errors[0].message : 'Sync failed';
        throw new Error(errorMsg);
      }

      getNotificationService().info(
        `Synced ${result.sessionsUploaded} sessions successfully!`
      );

      ExtensionState.getAnalyticsService().track(AnalyticsEvents.SESSIONS_SYNCED, {
        session_count: result.sessionsUploaded,
        tool: 'mixed',
      });

      // Invalidate caches before refreshing status so we get fresh data
      this.invalidateSyncStatusCache();

      // Also invalidate UnifiedSessionService cache since we just uploaded sessions
      if (this.sharedContext.unifiedSessionService) {
        this.sharedContext.unifiedSessionService.invalidateCache();
      }

      await this.handleGetCloudStatus();
      await this.handleGetSyncStatus();
    } catch (error: unknown) {
      // Handle auth errors
      if (error instanceof Error && error.message.includes('auth')) {
        getNotificationService().warn('Please login first');
        return;
      }

      getNotificationService().error(
        `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Preview sync - show session count without uploading
   * Uses fast session index for accurate counts from all sources.
   * For 'recent' filter, uses server's last session timestamp for accurate incremental preview.
   */
  private async handlePreviewSync(filterOptions: unknown): Promise<void> {
    try {
      const options = filterOptions as {
        startDate?: string;
        endDate?: string;
        limit?: number;
        filterType?: string;
      } | undefined;

      console.log('[CloudAuthHandler] Preview sync with filters:', options);

      if (!this.sharedContext.unifiedSessionService) {
        throw new Error('UnifiedSessionService not available');
      }

      // Determine date range based on filter type
      let since: Date | undefined;
      let until: Date | undefined;
      let serverLastSyncedAt: string | undefined;

      if (options?.filterType === 'date-range') {
        since = options?.startDate ? new Date(options.startDate) : undefined;
        until = options?.endDate ? new Date(options.endDate) : undefined;
      } else if (options?.filterType === 'recent') {
        // For 'recent' filter, use server's last session timestamp for accurate preview
        const syncService = ExtensionState.getSyncService();
        const serverSince = await syncService.getServerLastSessionDate();
        since = serverSince ?? new Date(0);
        until = new Date();
        serverLastSyncedAt = serverSince?.toISOString();
        console.log('[CloudAuthHandler] Preview using server timestamp:', since.toISOString());
      } else {
        // 'all' - get all sessions from epoch
        since = new Date(0);
        until = new Date();
      }

      // Use fast session index for counting (no message loading)
      // Don't pass limit here - we apply it after eligibility filtering
      const sessionIndex = await this.sharedContext.unifiedSessionService.getSessionIndex({
        since,
        until,
      });

      // Filter out sessions shorter than 4 minutes
      const eligibleSessions = sessionIndex.filter((s: SessionIndex) => isEligibleForSync(s));
      const filteredOutShort = sessionIndex.length - eligibleSessions.length;

      // Apply limit if specified
      let sessionsToSync = eligibleSessions;
      if (options?.filterType === 'recent' && options?.limit) {
        sessionsToSync = eligibleSessions.slice(0, options.limit);
      }

      // Estimate size (rough estimate: ~5KB per session)
      const estimatedSizeKB = sessionsToSync.length * 5;

      // Get date range
      const dateRange = sessionsToSync.length > 0 ? {
        oldest: sessionsToSync[sessionsToSync.length - 1].timestamp.toISOString(),
        newest: sessionsToSync[0].timestamp.toISOString(),
      } : undefined;

      // Calculate session breakdown by source
      const cursorCount = sessionsToSync.filter((s: SessionIndex) => s.source === 'cursor').length;
      const claudeCodeCount = sessionsToSync.filter((s: SessionIndex) => s.source === 'claude_code').length;

      console.log('[CloudAuthHandler] Preview results:', {
        totalSessions: sessionsToSync.length,
        filteredOutShort,
        estimatedSizeKB,
      });

      this.send('syncPreview', {
        totalSessions: sessionsToSync.length,
        estimatedSizeKB,
        dateRange,
        filteredOutShort,
        sessionsBySource: {
          cursor: cursorCount,
          claudeCode: claudeCodeCount,
          total: sessionsToSync.length
        },
        serverLastSyncedAt,
      });
    } catch (error: unknown) {
      console.error('[CloudAuthHandler] Preview sync failed:', error);
      this.send('syncPreview', {
        totalSessions: 0,
        estimatedSizeKB: 0,
        error: error instanceof Error ? error.message : 'Failed to preview sessions',
      });
    }
  }

  /**
   * Sync with filters - fetches sessions from UnifiedSessionService,
   * applies filters, then delegates to SyncService for upload.
   */
  private async handleSyncWithFilters(filterOptions: unknown): Promise<void> {
    // Create abort controller for cancellation
    this.syncAbortController = new AbortController();
    const signal = this.syncAbortController.signal;

    try {
      const options = filterOptions as {
        startDate?: string;
        endDate?: string;
        limit?: number;
        filterType?: string;
      } | undefined;

      console.log('[CloudAuthHandler] Sync with filters:', options);

      ExtensionState.getAnalyticsService().track(AnalyticsEvents.SYNC_STARTED, {
        tool: 'mixed',
      });

      // Phase: Preparing
      this.sendProgress({
        phase: 'preparing',
        message: 'Preparing to sync...',
        current: 0,
        total: 0,
      });

      if (!this.sharedContext.unifiedSessionService) {
        throw new Error('UnifiedSessionService not available');
      }

      const syncService = ExtensionState.getSyncService();

      // Determine date range based on filter type
      let since: Date | undefined;
      let until: Date | undefined;

      if (options?.filterType === 'date-range') {
        since = options?.startDate ? new Date(options.startDate) : undefined;
        until = options?.endDate ? new Date(options.endDate) : undefined;
      } else {
        // For 'recent' filter, use server's last session timestamp for incremental sync
        const serverSince = await syncService.getServerLastSessionDate();
        since = serverSince ?? new Date(0);
        until = new Date();
      }

      this.sendProgress({
        phase: 'preparing',
        message: 'Fetching sessions...',
        current: 0,
        total: 0,
      });

      // Get full sessions (not just index) to access rawData for upload
      const result = await this.sharedContext.unifiedSessionService.getUnifiedSessions({
        since,
        until,
      });

      // Filter out sessions shorter than 4 minutes
      const eligibleSessions = result.sessions.filter((s: UnifiedSession) =>
        isEligibleForSync({ duration: s.duration * 60 } as SessionIndex)
      );

      // Apply limit if specified
      let sessionsToSync = eligibleSessions;
      if (options?.filterType === 'recent' && options?.limit) {
        sessionsToSync = eligibleSessions.slice(0, options.limit);
      }

      // Extract SessionData from rawData
      const sessionDataList: SessionData[] = [];
      for (const session of sessionsToSync) {
        if (session.rawData) {
          sessionDataList.push(session.rawData as SessionData);
        }
      }

      if (sessionDataList.length === 0) {
        this.sendProgress({
          phase: 'complete',
          message: 'No sessions to sync.',
          current: 0,
          total: 0,
        });
        this.send('syncComplete', { success: true, sessionsUploaded: 0 });
        return;
      }

      // Delegate to SyncService for upload with progress
      const syncResult = await syncService.uploadSessionsWithProgress({
        sessions: sessionDataList,
        onDetailedProgress: (progress: DetailedSyncProgress) => {
          this.sendProgress(progress);
        },
        abortSignal: signal,
      });

      // Send completion message
      this.send('syncComplete', {
        success: syncResult.success,
        sessionsUploaded: syncResult.sessionsUploaded,
        error: syncResult.errors.length > 0 ? syncResult.errors[0].message : undefined,
      });

      if (syncResult.success && syncResult.sessionsUploaded > 0) {
        ExtensionState.getAnalyticsService().track(AnalyticsEvents.SESSIONS_SYNCED, {
          session_count: syncResult.sessionsUploaded,
          tool: 'mixed',
        });

        getNotificationService().info(
          `Synced ${syncResult.sessionsUploaded} sessions successfully!`
        );

        // Invalidate caches after successful sync
        this.invalidateSyncStatusCache();
        if (this.sharedContext.unifiedSessionService) {
          this.sharedContext.unifiedSessionService.invalidateCache();
        }

        await this.handleGetCloudStatus();
        await this.handleGetSyncStatus();
      } else if (!syncResult.success) {
        const errorMsg = syncResult.errors.length > 0 ? syncResult.errors[0].message : 'Unknown error';
        if (errorMsg !== 'Sync cancelled by user') {
          getNotificationService().error(`Sync failed: ${errorMsg}`);
        }
      }
    } catch (error: unknown) {
      console.error('[CloudAuthHandler] Sync with filters failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.sendProgress({
        phase: 'error',
        message: `Sync failed: ${errorMessage}`,
        current: 0,
        total: 0,
      });

      this.send('syncComplete', {
        success: false,
        sessionsUploaded: 0,
        error: errorMessage,
      });

      getNotificationService().error(`Sync failed: ${errorMessage}`);
    } finally {
      this.syncAbortController = null;
    }
  }

  private async handleGetSyncStatus(): Promise<void> {
    try {
      // Check cache first - return cached data immediately if valid
      if (this.sharedContext.isSyncStatusCacheValid() && this.sharedContext.syncStatusCache.data) {
        console.log('[CloudAuthHandler] Returning cached sync status');
        const cached = this.sharedContext.syncStatusCache.data;
        this.send('syncStatus', {
          ...cached,
          lastSynced: cached.lastSynced instanceof Date ? cached.lastSynced.toISOString() : cached.lastSynced,
        });
        return;
      }

      console.log('[CloudAuthHandler] Getting sync status (cache miss or expired)...');
      const startTime = Date.now();

      if (!this.sharedContext.unifiedSessionService) {
        throw new Error('UnifiedSessionService not available');
      }

      // Use fast session index for counting (no message loading)
      const sessionsStart = Date.now();
      const sessionIndex = await this.sharedContext.unifiedSessionService.getSessionIndex();
      const sessionsMs = Date.now() - sessionsStart;

      // Filter sessions by duration (4+ minutes)
      const eligibleSessions = sessionIndex.filter((s: SessionIndex) => isEligibleForSync(s));

      // Get last sync time from sync state (fast; avoids scanning sessions again)
      const syncService = ExtensionState.getSyncService();
      const syncStateStart = Date.now();
      const syncStateSummary = await syncService.getSyncStateSummary();
      const syncStateMs = Date.now() - syncStateStart;
      const lastSynced = syncStateSummary.lastSynced;

      // Calculate pending uploads based on last sync time
      const pendingUploads = lastSynced
        ? eligibleSessions.filter((s: SessionIndex) => s.timestamp > lastSynced).length
        : eligibleSessions.length;

      const statusData = {
        localSessions: eligibleSessions.length,
        syncedSessions: syncStateSummary.syncedSessions,
        pendingUploads,
        lastSynced: lastSynced?.toISOString(),
      };

      // Update cache (store with original Date for internal use)
      this.sharedContext.updateSyncStatusCache({
        localSessions: eligibleSessions.length,
        syncedSessions: syncStateSummary.syncedSessions,
        pendingUploads,
        lastSynced,
      });

      const elapsedMs = Date.now() - startTime;
      console.log(
        `[CloudAuthHandler] Sync status computed in ${elapsedMs}ms (sessions=${sessionsMs}ms, syncState=${syncStateMs}ms):`,
        statusData
      );

      this.send('syncStatus', statusData);
    } catch (error) {
      console.error('[CloudAuthHandler] Failed to get sync status:', error);
      this.send('syncStatus', {
        localSessions: 0,
        syncedSessions: 0,
        pendingUploads: 0,
        lastSynced: undefined,
      });
    }
  }

  /**
   * Invalidate sync status cache
   */
  public invalidateSyncStatusCache(): void {
    this.sharedContext.invalidateSyncStatusCache();
    console.log('[CloudAuthHandler] Sync status cache invalidated');
  }

  /**
   * Push initial cloud status to webview (called during V2MessageHandler initialization)
   * This ensures the webview gets cloud status even if getCloudStatus was dropped during init
   */
  public async pushInitialCloudStatus(): Promise<void> {
    console.log('[CloudAuthHandler] Pushing initial cloud status to webview');
    await this.handleGetCloudStatus();
  }

  /**
   * Pre-cache sync status in the background (called on extension init)
   * This runs async and doesn't block initialization
   */
  public preCacheSyncStatus(): void {
    // Run in background without awaiting - don't block extension startup
    (async () => {
      try {
        console.log('[CloudAuthHandler] Pre-caching sync status in background...');
        const startTime = Date.now();

        if (!this.sharedContext.unifiedSessionService) {
          console.warn('[CloudAuthHandler] UnifiedSessionService not available for pre-caching');
          return;
        }

        // Use fast session index for counting (no message loading)
        const sessionIndex = await this.sharedContext.unifiedSessionService.getSessionIndex();

        // Filter sessions by duration (4+ minutes)
        const eligibleSessions = sessionIndex.filter((s: SessionIndex) => isEligibleForSync(s));

        // Get last sync time from sync state
        const syncService = ExtensionState.getSyncService();
        const syncStateSummary = await syncService.getSyncStateSummary();
        const lastSynced = syncStateSummary.lastSynced;

        // Calculate pending uploads based on last sync time
        const pendingUploads = lastSynced
          ? eligibleSessions.filter((s: SessionIndex) => s.timestamp > lastSynced).length
          : eligibleSessions.length;

        const statusData = {
          localSessions: eligibleSessions.length,
          syncedSessions: syncStateSummary.syncedSessions,
          pendingUploads,
          lastSynced,
        };

        // Store in cache
        this.sharedContext.updateSyncStatusCache(statusData);

        const elapsedMs = Date.now() - startTime;
        console.log(`[CloudAuthHandler] Sync status pre-cached in ${elapsedMs}ms:`, statusData);
      } catch (error) {
        console.warn('[CloudAuthHandler] Failed to pre-cache sync status:', error);
        // Non-critical - the Account tab will just compute fresh when needed
      }
    })();
  }
}
