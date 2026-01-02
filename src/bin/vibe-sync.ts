/**
 * devark-sync - Standalone sync script for hooks
 *
 * This script is called by hooks to sync sessions without VS Code.
 * It can be executed directly via node or as a symlink.
 */

import type { ITokenStorage } from '../ports/storage/token-storage.interface';
import type { ISyncStateStorage } from '../ports/storage/sync-state.interface';
import type { IApiClient } from '../ports/network/api-client.interface';
import type { ISessionReader } from '../ports/readers/session-reader.interface';
import { toSanitizedSession } from '../core/session';
import { filterEligibleSessions } from '../core/sync';
import type { SyncCliArgs } from './cli-args';

export interface SyncDependencies {
  tokenStorage: ITokenStorage;
  syncState: ISyncStateStorage;
  apiClient: IApiClient;
  sessionReader: ISessionReader;
}

export interface SyncResult {
  exitCode: number;
  sessionsUploaded: number;
  sessionsSkipped?: number;
  error?: string;
  testMode?: boolean;
}

export async function executeSync(
  args: SyncCliArgs,
  deps: SyncDependencies
): Promise<SyncResult> {
  const { tokenStorage, syncState, apiClient, sessionReader } = deps;
  const { silent, debug, force, project, test } = args;

  const log = (message: string) => {
    if (!silent) {
      console.log(message);
    }
  };

  const logDebug = (message: string) => {
    if (debug) {
      console.log(`[DEBUG] ${message}`);
    }
  };

  const logError = (message: string) => {
    if (debug || !silent) {
      console.error(message);
    }
  };

  try {
    // Check authentication
    logDebug('Checking authentication...');
    const token = await tokenStorage.getToken();
    if (!token) {
      logError('Error: Not authenticated. Run vibe-log login first.');
      return { exitCode: 1, sessionsUploaded: 0, error: 'Not authenticated' };
    }

    // Verify token
    logDebug('Verifying token...');
    const verification = await apiClient.verifyToken();
    if (!verification.valid) {
      logError('Error: Token is invalid. Please re-authenticate.');
      return { exitCode: 1, sessionsUploaded: 0, error: 'Token is invalid' };
    }

    // Test mode - just validate config and exit
    if (test) {
      log('Test mode: configuration valid');
      return { exitCode: 0, sessionsUploaded: 0, testMode: true };
    }

    // Determine since date
    let since: Date | undefined;
    if (!force && project) {
      since = await syncState.getLastSyncTime(project) ?? undefined;
      if (since) {
        logDebug(`Using last sync time: ${since.toISOString()}`);
      }
    }

    // Read sessions
    logDebug('Reading sessions...');
    const readerResult = await sessionReader.readSessions({
      since,
      projectPath: project,
    });

    // Filter short sessions (< 4 minutes)
    const validSessions = filterEligibleSessions(readerResult.sessions);
    const skipped = readerResult.sessions.length - validSessions.length;

    if (skipped > 0) {
      logDebug(`Skipped ${skipped} short session(s)`);
    }

    if (validSessions.length === 0) {
      log(`No sessions to sync (${skipped} skipped - too short)`);
      return { exitCode: 0, sessionsUploaded: 0, sessionsSkipped: skipped };
    }

    // Sanitize and upload
    logDebug(`Sanitizing ${validSessions.length} sessions...`);
    const sanitizedSessions = validSessions.map((session) =>
      toSanitizedSession(session)
    );

    logDebug('Uploading sessions...');
    const uploadResult = await apiClient.uploadSessions(sanitizedSessions);

    // Update sync state
    const projectPaths = [...new Set(validSessions.map((s) => s.projectPath))];
    for (const projectPath of projectPaths) {
      const projectSessions = validSessions.filter(
        (s) => s.projectPath === projectPath
      );
      const lastSession = projectSessions[projectSessions.length - 1];
      await syncState.recordSync(
        projectPath,
        projectSessions.length,
        lastSession?.id
      );
    }

    log(`Synced ${uploadResult.sessionsProcessed} session(s)`);
    return {
      exitCode: 0,
      sessionsUploaded: uploadResult.sessionsProcessed,
      sessionsSkipped: skipped,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logError(`Error: ${message}`);
    await syncState.recordError({ message, code: 'SYNC_ERROR' });
    return { exitCode: 1, sessionsUploaded: 0, error: message };
  }
}

// Main entry point when run directly
if (require.main === module) {
  // Use dynamic imports to avoid loading VS Code dependencies
  (async () => {
    const { parseArgs } = await import('./cli-args');

    async function main(): Promise<void> {
      const args = parseArgs(process.argv.slice(2));

      // When called from hook with --silent, spawn in background and exit immediately
      if (args.silent && args.hookTrigger) {
        const { spawnDetached, isUploadRunning } = await import('./spawn');

        if (await isUploadRunning()) {
          process.exit(0); // Another sync already running
        }

        // Spawn self WITHOUT --silent (so it does actual work)
        const childArgs = [process.argv[1], `--hook-trigger=${args.hookTrigger}`];
        if (args.source) childArgs.push(`--source=${args.source}`);
        if (args.debug) childArgs.push('--debug');
        if (args.force) childArgs.push('--force');
        if (args.project) childArgs.push(`--project=${args.project}`);

        await spawnDetached(process.argv[0], childArgs);
        process.exit(0); // Exit immediately, child does work
      }

      // Background child process - acquire lock and do actual sync
      const { createUploadLock, removeUploadLock } = await import('./spawn');
      await createUploadLock();

      try {
        const { NodeFileSystem } = await import(
          '../adapters/readers/node-filesystem'
        );
        const { FileTokenStorage } = await import(
          '../adapters/storage/file-token-storage'
        );
        const { FileSyncStateStorage } = await import(
          '../adapters/storage/file-sync-state'
        );
        const { FetchHttpClient } = await import(
          '../adapters/network/fetch-http-client'
        );
        const { DevArkApiClient } = await import(
          '../adapters/network/devark-api-client'
        );
        const { ClaudeSessionReader } = await import(
          '../adapters/readers/claude-session-reader'
        );

        // Production adapters
        const fs = new NodeFileSystem();
        const tokenStorage = new FileTokenStorage(fs);
        const httpClient = new FetchHttpClient();
        const apiClient = new DevArkApiClient(httpClient);
        const syncState = new FileSyncStateStorage(fs);

        // Set auth token on API client if available
        const token = await tokenStorage.getToken();
        if (token) {
          apiClient.setToken(token);
        }

        // Select reader based on explicit --source flag (required)
        let sessionReader;

        if (args.source === 'cursor') {
          const { CursorSessionReader } = await import(
            '../cursor-integration/session-reader'
          );
          sessionReader = new CursorSessionReader();
        } else if (args.source === 'claude') {
          sessionReader = new ClaudeSessionReader(fs);
        } else {
          console.error('Error: --source flag is required (claude or cursor)');
          process.exit(1);
        }

        const result = await executeSync(args, {
          tokenStorage,
          syncState,
          apiClient,
          sessionReader,
        });

        process.exit(result.exitCode);
      } finally {
        await removeUploadLock();
      }
    }

    main().catch((err) => {
      console.error(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    });
  })();
}
