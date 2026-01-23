/**
 * SyncService
 *
 * Orchestrates session sync: loads sessions, sanitizes, uploads, tracks state.
 * Supports both Claude Code and Cursor session readers.
 */

import type { ISessionReader, SessionReaderError } from '../ports/readers/session-reader.interface';
import type { IApiClient } from '../ports/network/api-client.interface';
import type { ISyncStateStorage } from '../ports/storage/sync-state.interface';
import type { AuthService } from './auth-service';
import type {
  SessionData,
  UploadProgressCallback,
  UploadResult,
  DetailedProgressCallback,
  DetailedSyncProgress,
} from '../types';
import { toSanitizedSession } from '../core/session';
import { filterEligibleSessions } from '../core/sync';

export interface SyncServiceDeps {
  claudeReader: ISessionReader;
  cursorReader?: ISessionReader;
  apiClient: IApiClient;
  syncState: ISyncStateStorage;
  authService: AuthService;
}

export interface SyncOptions {
  projectPath?: string;
  force?: boolean;
  since?: Date;
  until?: Date;
  limit?: number;
  filterType?: 'recent' | 'date-range' | 'all';
  onProgress?: UploadProgressCallback;
  onDetailedProgress?: DetailedProgressCallback;
  abortSignal?: AbortSignal;
}

export interface SyncError {
  projectPath?: string;
  sessionId?: string;
  message: string;
  code: string;
}

export interface SyncResult {
  success: boolean;
  sessionsUploaded: number;
  sessionsFailed: number;
  sessionsSkipped: number;
  projectsSynced: string[];
  errors: SyncError[];
  uploadResult?: UploadResult;
}

/**
 * Options for uploading pre-loaded sessions
 */
export interface UploadSessionsOptions {
  sessions: SessionData[];
  onDetailedProgress?: DetailedProgressCallback;
  abortSignal?: AbortSignal;
}

export interface SyncStatusSummary {
  localSessions: number;
  syncedSessions: number;
  pendingUploads: number;
  lastSynced?: Date;
}

interface ReaderSyncResult {
  sessions: SessionData[];
  skipped: number;
  errors: SyncError[];
}

export class SyncService {
  private readonly claudeReader: ISessionReader;
  private readonly cursorReader?: ISessionReader;
  private readonly apiClient: IApiClient;
  private readonly syncState: ISyncStateStorage;
  private readonly authService: AuthService;

  constructor(deps: SyncServiceDeps) {
    this.claudeReader = deps.claudeReader;
    this.cursorReader = deps.cursorReader;
    this.apiClient = deps.apiClient;
    this.syncState = deps.syncState;
    this.authService = deps.authService;
  }

  /**
   * Fast path: return sync state derived purely from persisted sync metadata,
   * without scanning local sessions.
   *
   * This is useful for UI "status" views where session counting is handled elsewhere,
   * and prevents expensive duplicate reads of local session stores.
   */
  async getSyncStateSummary(): Promise<Pick<SyncStatusSummary, 'syncedSessions' | 'lastSynced'>> {
    const state = await this.syncState.getState();
    return {
      syncedSessions: state.totalSessionsUploaded ?? 0,
      lastSynced: state.globalLastSync ?? undefined,
    };
  }

  /**
   * Upload pre-loaded sessions with detailed progress tracking.
   * Use this when sessions are already loaded (e.g., from UnifiedSessionService).
   * Handles sanitization, batching, and upload with cancellation support.
   */
  async uploadSessionsWithProgress(options: UploadSessionsOptions): Promise<SyncResult> {
    const { sessions, onDetailedProgress, abortSignal } = options;
    const BATCH_SIZE = 100;
    let sessionsUploaded = 0;

    const sendProgress = (progress: DetailedSyncProgress) => {
      if (onDetailedProgress) {
        onDetailedProgress(progress);
      }
    };

    const checkCancelled = (): boolean => {
      if (abortSignal?.aborted) {
        sendProgress({
          phase: 'cancelled',
          message: `Sync cancelled. ${sessionsUploaded} sessions uploaded.`,
          current: sessionsUploaded,
          total: sessionsUploaded,
        });
        return true;
      }
      return false;
    };

    // Check authentication first
    const hasToken = await this.authService.getToken();
    if (!hasToken) {
      sendProgress({
        phase: 'error',
        message: 'Please login first',
        current: 0,
        total: 0,
      });
      return {
        success: false,
        sessionsUploaded: 0,
        sessionsFailed: 0,
        sessionsSkipped: 0,
        projectsSynced: [],
        errors: [{ message: 'Not authenticated', code: 'NOT_AUTHENTICATED' }],
      };
    }

    if (checkCancelled()) {
      return this.cancelledResult(sessionsUploaded);
    }

    // Verify token is valid
    const isValid = await this.authService.verifyToken();
    if (!isValid) {
      sendProgress({
        phase: 'error',
        message: 'Session expired. Please login again.',
        current: 0,
        total: 0,
      });
      return {
        success: false,
        sessionsUploaded: 0,
        sessionsFailed: 0,
        sessionsSkipped: 0,
        projectsSynced: [],
        errors: [{ message: 'Token is invalid', code: 'TOKEN_INVALID' }],
      };
    }

    if (checkCancelled()) {
      return this.cancelledResult(sessionsUploaded);
    }

    // Filter eligible sessions (4+ minutes)
    const eligibleSessions = filterEligibleSessions(sessions);
    const totalSessions = eligibleSessions.length;

    if (totalSessions === 0) {
      sendProgress({
        phase: 'complete',
        message: 'No sessions to sync.',
        current: 0,
        total: 0,
      });
      return {
        success: true,
        sessionsUploaded: 0,
        sessionsFailed: 0,
        sessionsSkipped: sessions.length,
        projectsSynced: [],
        errors: [],
      };
    }

    // Phase: Sanitizing
    sendProgress({
      phase: 'sanitizing',
      message: `Sanitizing ${totalSessions} sessions...`,
      current: 0,
      total: totalSessions,
    });

    const sanitizedSessions = [];
    for (let i = 0; i < eligibleSessions.length; i++) {
      if (checkCancelled()) {
        return this.cancelledResult(sessionsUploaded);
      }

      sanitizedSessions.push(toSanitizedSession(eligibleSessions[i]));

      // Update progress every 10 sessions
      if (i % 10 === 0 || i === eligibleSessions.length - 1) {
        sendProgress({
          phase: 'sanitizing',
          message: `Sanitizing session ${i + 1} of ${totalSessions}...`,
          current: i + 1,
          total: totalSessions,
        });
      }
    }

    const estimatedSizeKB = sanitizedSessions.length * 5;
    const totalBatches = Math.ceil(sanitizedSessions.length / BATCH_SIZE);

    // Phase: Uploading
    sendProgress({
      phase: 'uploading',
      message: `Uploading ${sanitizedSessions.length} sessions...`,
      current: 0,
      total: sanitizedSessions.length,
      currentBatch: 1,
      totalBatches,
      sizeKB: estimatedSizeKB,
    });

    const projectsSynced = [...new Set(eligibleSessions.map((s) => s.projectPath))];
    const errors: SyncError[] = [];
    let lastUploadResult: UploadResult | undefined;

    try {
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        if (checkCancelled()) {
          return this.cancelledResult(sessionsUploaded, projectsSynced, errors);
        }

        const start = batchIndex * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, sanitizedSessions.length);
        const batch = sanitizedSessions.slice(start, end);

        sendProgress({
          phase: 'uploading',
          message: `Uploading batch ${batchIndex + 1} of ${totalBatches}...`,
          current: start,
          total: sanitizedSessions.length,
          currentBatch: batchIndex + 1,
          totalBatches,
          sizeKB: estimatedSizeKB,
        });

        const uploadResult = await this.apiClient.uploadSessions(batch);
        lastUploadResult = uploadResult;

        if (!uploadResult.success) {
          throw new Error(`Batch ${batchIndex + 1} upload failed`);
        }

        sessionsUploaded += uploadResult.sessionsProcessed;

        sendProgress({
          phase: 'uploading',
          message: `Uploaded ${sessionsUploaded} of ${sanitizedSessions.length} sessions...`,
          current: sessionsUploaded,
          total: sanitizedSessions.length,
          currentBatch: batchIndex + 1,
          totalBatches,
          sizeKB: estimatedSizeKB,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      errors.push({ message, code: 'UPLOAD_FAILED' });
      await this.syncState.recordError({ message, code: 'UPLOAD_FAILED' });

      sendProgress({
        phase: 'error',
        message: `Sync failed: ${message}`,
        current: sessionsUploaded,
        total: sanitizedSessions.length,
      });

      return {
        success: false,
        sessionsUploaded,
        sessionsFailed: sanitizedSessions.length - sessionsUploaded,
        sessionsSkipped: sessions.length - totalSessions,
        projectsSynced,
        errors,
        uploadResult: lastUploadResult,
      };
    }

    // Update sync state for each project
    for (const project of projectsSynced) {
      const projectSessions = eligibleSessions.filter((s) => s.projectPath === project);
      const lastSession = projectSessions[projectSessions.length - 1];
      await this.syncState.recordSync(project, projectSessions.length, lastSession?.id);
    }

    // Phase: Complete
    sendProgress({
      phase: 'complete',
      message: `Successfully synced ${sessionsUploaded} sessions!`,
      current: sessionsUploaded,
      total: sessionsUploaded,
    });

    return {
      success: true,
      sessionsUploaded,
      sessionsFailed: 0,
      sessionsSkipped: sessions.length - totalSessions,
      projectsSynced,
      errors,
      uploadResult: lastUploadResult,
    };
  }

  /**
   * Get server's last session timestamp for incremental sync.
   * Returns undefined if the endpoint fails (caller should fall back to full sync).
   */
  async getServerLastSessionDate(): Promise<Date | undefined> {
    try {
      console.log('[SyncService] Calling getLastSessionDate API...');
      const lastSession = await this.apiClient.getLastSessionDate();
      console.log('[SyncService] getLastSessionDate response:', lastSession);
      if (lastSession.lastSessionTimestamp) {
        const date = new Date(lastSession.lastSessionTimestamp);
        console.log('[SyncService] ✅ Server last session timestamp:', date.toISOString());
        return date;
      }
      console.log('[SyncService] Server has no sessions');
      return undefined;
    } catch (error) {
      console.warn('[SyncService] ❌ Failed to get server last session:', error);
      return undefined;
    }
  }

  private cancelledResult(
    sessionsUploaded: number,
    projectsSynced: string[] = [],
    errors: SyncError[] = []
  ): SyncResult {
    return {
      success: false,
      sessionsUploaded,
      sessionsFailed: 0,
      sessionsSkipped: 0,
      projectsSynced,
      errors: [...errors, { message: 'Sync cancelled by user', code: 'CANCELLED' }],
    };
  }

  /**
   * Sync sessions to the backend from all available readers.
   * Uses incremental sync by querying server for last session timestamp.
   */
  async sync(options: SyncOptions = {}): Promise<SyncResult> {
    const { onProgress } = options;

    // Check authentication first
    const hasToken = await this.authService.getToken();
    if (!hasToken) {
      return {
        success: false,
        sessionsUploaded: 0,
        sessionsFailed: 0,
        sessionsSkipped: 0,
        projectsSynced: [],
        errors: [{ message: 'Not authenticated', code: 'NOT_AUTHENTICATED' }],
      };
    }

    // Verify token is valid
    const isValid = await this.authService.verifyToken();
    if (!isValid) {
      return {
        success: false,
        sessionsUploaded: 0,
        sessionsFailed: 0,
        sessionsSkipped: 0,
        projectsSynced: [],
        errors: [{ message: 'Token is invalid', code: 'TOKEN_INVALID' }],
      };
    }

    // Get server's last session timestamp for incremental sync
    let serverSince: Date | undefined;
    console.log('[SyncService] Starting sync with options:', {
      force: options.force,
      since: options.since?.toISOString(),
      projectPath: options.projectPath,
    });

    if (!options.force && !options.since) {
      try {
        console.log('[SyncService] Calling getLastSessionDate API...');
        const lastSession = await this.apiClient.getLastSessionDate();
        console.log('[SyncService] getLastSessionDate response:', lastSession);
        if (lastSession.lastSessionTimestamp) {
          serverSince = new Date(lastSession.lastSessionTimestamp);
          console.log('[SyncService] ✅ Using server timestamp for incremental sync:', serverSince.toISOString());
        } else {
          console.log('[SyncService] Server has no sessions, will upload all local sessions');
        }
      } catch (error) {
        // Fall back to local sync state if endpoint fails
        console.warn('[SyncService] ❌ Failed to get server last session, falling back to local sync state:', error);
      }
    } else {
      console.log('[SyncService] Skipping server timestamp check (force:', options.force, ', since:', options.since?.toISOString(), ')');
    }

    // Merge server timestamp into options if available
    const effectiveOptions: SyncOptions = {
      ...options,
      since: options.since ?? serverSince,
    };
    console.log('[SyncService] Effective since date for reading sessions:', effectiveOptions.since?.toISOString() ?? 'none (all sessions)');

    // Read from all available readers
    const claudeResult = await this.readFromReader(this.claudeReader, effectiveOptions);
    console.log('[SyncService] Claude reader found', claudeResult.sessions.length, 'sessions after filtering');
    const cursorResult = this.cursorReader
      ? await this.readFromReader(this.cursorReader, effectiveOptions)
      : { sessions: [], skipped: 0, errors: [] };

    // Merge results
    const allSessions = [...claudeResult.sessions, ...cursorResult.sessions];
    const totalSkipped = claudeResult.skipped + cursorResult.skipped;
    const allErrors = [...claudeResult.errors, ...cursorResult.errors];

    // Return early if no sessions to sync
    if (allSessions.length === 0) {
      return {
        success: true,
        sessionsUploaded: 0,
        sessionsFailed: 0,
        sessionsSkipped: totalSkipped,
        projectsSynced: [],
        errors: allErrors,
      };
    }

    // Sanitize and transform sessions
    const sanitizedSessions = allSessions.map((session) =>
      toSanitizedSession(session)
    );

    // Collect unique project paths
    const projectsSynced = [...new Set(allSessions.map((s) => s.projectPath))];

    // Upload sessions
    let uploadResult: UploadResult;
    try {
      uploadResult = await this.apiClient.uploadSessions(
        sanitizedSessions,
        onProgress
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      allErrors.push({ message, code: 'UPLOAD_FAILED' });
      await this.syncState.recordError({ message, code: 'UPLOAD_FAILED' });
      return {
        success: false,
        sessionsUploaded: 0,
        sessionsFailed: allSessions.length,
        sessionsSkipped: totalSkipped,
        projectsSynced: [],
        errors: allErrors,
      };
    }

    // Update sync state for each project
    for (const project of projectsSynced) {
      const projectSessions = allSessions.filter(
        (s) => s.projectPath === project
      );
      const lastSession = projectSessions[projectSessions.length - 1];
      await this.syncState.recordSync(
        project,
        projectSessions.length,
        lastSession?.id
      );
    }

    return {
      success: uploadResult.success,
      sessionsUploaded: uploadResult.sessionsProcessed,
      sessionsFailed: 0,
      sessionsSkipped: totalSkipped,
      projectsSynced,
      errors: allErrors,
      uploadResult,
    };
  }

  /**
   * Read and filter sessions from a single reader.
   */
  private async readFromReader(
    reader: ISessionReader,
    options: SyncOptions
  ): Promise<ReaderSyncResult> {
    const { projectPath, force, since } = options;
    const errors: SyncError[] = [];

    // Determine the since date
    let sinceDate: Date | undefined;
    if (!force) {
      if (since) {
        sinceDate = since;
      } else if (projectPath) {
        const lastSync = await this.syncState.getLastSyncTime(projectPath);
        sinceDate = lastSync ?? undefined;
      }
    }

    // Read sessions
    const readerResult = await reader.readSessions({
      since: sinceDate,
      projectPath,
    });

    // Collect reader errors
    for (const err of readerResult.errors) {
      errors.push(this.readerErrorToSyncError(err));
    }

    // Filter out short sessions (< 4 minutes)
    const validSessions = filterEligibleSessions(readerResult.sessions);
    const skipped = readerResult.sessions.length - validSessions.length;

    return { sessions: validSessions, skipped, errors };
  }

  /**
   * Report sync status without uploading.
   * Counts eligible local sessions (4+ minutes), totals previously uploaded
   * sessions, and estimates pending uploads based on the last recorded sync time.
   */
  async getSyncStatus(): Promise<SyncStatusSummary> {
    try {
      // Load persisted sync state and sessions from all readers in parallel
      const readPromises: Promise<{ sessions: SessionData[]; errors: SessionReaderError[] }>[] = [
        this.claudeReader.readSessions(),
      ];
      if (this.cursorReader) {
        readPromises.push(this.cursorReader.readSessions());
      }

      const [state, ...readerResults] = await Promise.all([
        this.syncState.getState(),
        ...readPromises,
      ]);

      // Combine sessions from all readers
      const allSessions = readerResults.flatMap((r) => r.sessions);
      const eligibleSessions = filterEligibleSessions(allSessions);

      const localSessions = eligibleSessions.length;
      const lastSynced = state.globalLastSync ?? undefined;

      const pendingUploads = lastSynced
        ? eligibleSessions.filter((session) => session.timestamp > lastSynced).length
        : localSessions;

      return {
        localSessions,
        syncedSessions: state.totalSessionsUploaded ?? 0,
        pendingUploads,
        lastSynced,
      };
    } catch (error) {
      // Surface a safe fallback while logging for debugging
      console.error('[SyncService] Failed to compute sync status:', error);
      return {
        localSessions: 0,
        syncedSessions: 0,
        pendingUploads: 0,
        lastSynced: undefined,
      };
    }
  }

  /**
   * Convert reader error to sync error.
   */
  private readerErrorToSyncError(err: SessionReaderError): SyncError {
    return {
      message: err.error,
      code: err.recoverable ? 'RECOVERABLE_ERROR' : 'READ_ERROR',
      sessionId: err.path,
    };
  }
}
