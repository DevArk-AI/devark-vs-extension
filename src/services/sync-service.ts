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
  onProgress?: UploadProgressCallback;
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
   * Sync sessions to the backend from all available readers.
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

    // Read from all available readers
    const claudeResult = await this.readFromReader(this.claudeReader, options);
    const cursorResult = this.cursorReader
      ? await this.readFromReader(this.cursorReader, options)
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
