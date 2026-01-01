/**
 * SharedContext - Container for shared state across handlers
 *
 * Provides:
 * - Sync status cache (owned by CloudAuthHandler, read by others)
 * - Status bar manager reference
 * - Prompt history store reference
 *
 * This avoids passing shared dependencies through every handler.
 */

import type { StatusBarManager } from '../../status-bar/StatusBarManager';
import type { PromptHistoryStore } from '../../storage/PromptHistoryStore';
import type { SavedPromptsStore } from '../../storage/SavedPromptsStore';
import type { ProviderDetectionService } from '../../services/ProviderDetectionService';
import type { SummaryService } from '../../services/SummaryService';
import type { CursorSessionReader } from '../../cursor-integration/session-reader';
import type { UnifiedSessionService } from '../../services/UnifiedSessionService';
import type { UnifiedPromptDetectionService } from '../../services/UnifiedPromptDetectionService';
import type { SessionManagerService } from '../../services/SessionManagerService';
import type { DailyStatsService } from '../../services/DailyStatsService';
import type { GoalService } from '../../services/GoalService';
import type { SuggestionEngine } from '../../services/SuggestionEngine';
import type { ContextExtractor } from '../../services/ContextExtractor';
import type { CoPilotStorageManager } from '../../copilot/storage';
import type { ChatInjector } from '../../cursor-integration/chat-injector';
import type { WebviewMessageType } from '../../shared/webview-protocol';

/**
 * Sync status cache structure
 */
export interface SyncStatusCache {
  data: {
    localSessions: number;
    syncedSessions: number;
    pendingUploads: number;
    lastSynced?: Date;
  } | null;
  timestamp: number;
}

/**
 * Shared context - singleton container for cross-handler state
 */
export class SharedContext {
  // Cache TTL
  static readonly SYNC_STATUS_CACHE_TTL_MS = 30000; // 30 seconds

  // Sync status cache
  private _syncStatusCache: SyncStatusCache = { data: null, timestamp: 0 };

  // Service references (set during initialization)
  statusBarManager?: StatusBarManager;
  promptHistoryStore?: PromptHistoryStore;
  savedPromptsStore?: SavedPromptsStore;
  providerDetectionService?: ProviderDetectionService;
  summaryService?: SummaryService;
  sessionReader?: CursorSessionReader;
  unifiedSessionService?: UnifiedSessionService;
  promptDetectionService?: UnifiedPromptDetectionService;
  sessionManagerService?: SessionManagerService;
  dailyStatsService?: DailyStatsService;
  goalService?: GoalService;
  suggestionEngine?: SuggestionEngine;
  contextExtractor?: ContextExtractor;
  storageManager?: CoPilotStorageManager;
  chatInjector?: ChatInjector;

  // Disposal state
  isDisposed = false;

  // Initialization state
  initialized = false;
  pendingMessages: Array<{ type: WebviewMessageType; data: unknown }> = [];

  /**
   * Get sync status cache (read-only access)
   */
  get syncStatusCache(): SyncStatusCache {
    return this._syncStatusCache;
  }

  /**
   * Check if cache is valid
   */
  isSyncStatusCacheValid(): boolean {
    const now = Date.now();
    return (
      this._syncStatusCache.data !== null &&
      now - this._syncStatusCache.timestamp < SharedContext.SYNC_STATUS_CACHE_TTL_MS
    );
  }

  /**
   * Update sync status cache (call from CloudAuthHandler)
   */
  updateSyncStatusCache(data: SyncStatusCache['data']): void {
    this._syncStatusCache = { data, timestamp: Date.now() };
  }

  /**
   * Invalidate sync status cache
   */
  invalidateSyncStatusCache(): void {
    this._syncStatusCache = { data: null, timestamp: 0 };
  }
}
