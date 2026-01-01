/**
 * FileSyncStateStorage - File-based sync state storage
 *
 * Stores synchronization state in ~/.devark/sync-state.json
 * Tracks last sync times per project, sessions uploaded, and errors.
 */

import type { IFileSystem } from '../../ports/readers/file-system.interface';
import type {
  ISyncStateStorage,
  SyncState,
  ProjectSyncState,
} from '../../ports/storage/sync-state.interface';

interface StoredSyncState {
  globalLastSync?: string;
  projects: Record<string, StoredProjectState>;
  totalSessionsUploaded: number;
  lastError?: {
    time: string;
    message: string;
    code?: string;
  };
}

interface StoredProjectState {
  projectPath: string;
  lastSyncTime: string;
  lastSessionId?: string;
  sessionsUploaded: number;
}

export class FileSyncStateStorage implements ISyncStateStorage {
  private readonly fs: IFileSystem;
  private readonly configDir: string;
  private readonly statePath: string;

  constructor(fs: IFileSystem) {
    this.fs = fs;
    this.configDir = this.fs.join(this.fs.homedir(), '.devark');
    this.statePath = this.fs.join(this.configDir, 'sync-state.json');
  }

  async getLastSyncTime(projectPath: string): Promise<Date | null> {
    const state = await this.readState();
    const projectState = state.projects[projectPath];
    if (!projectState?.lastSyncTime) {
      return null;
    }
    return new Date(projectState.lastSyncTime);
  }

  async setLastSyncTime(projectPath: string, time: Date): Promise<void> {
    const state = await this.readState();

    if (!state.projects[projectPath]) {
      state.projects[projectPath] = {
        projectPath,
        lastSyncTime: time.toISOString(),
        sessionsUploaded: 0,
      };
    } else {
      state.projects[projectPath].lastSyncTime = time.toISOString();
    }

    state.globalLastSync = time.toISOString();
    await this.writeState(state);
  }

  async getGlobalLastSync(): Promise<Date | null> {
    const state = await this.readState();
    if (!state.globalLastSync) {
      return null;
    }
    return new Date(state.globalLastSync);
  }

  async getProjectState(projectPath: string): Promise<ProjectSyncState | null> {
    const state = await this.readState();
    const stored = state.projects[projectPath];
    if (!stored) {
      return null;
    }
    return {
      projectPath: stored.projectPath,
      lastSyncTime: new Date(stored.lastSyncTime),
      lastSessionId: stored.lastSessionId,
      sessionsUploaded: stored.sessionsUploaded,
    };
  }

  async recordSync(
    projectPath: string,
    sessionsUploaded: number,
    lastSessionId?: string
  ): Promise<void> {
    const state = await this.readState();
    const now = new Date();

    if (!state.projects[projectPath]) {
      state.projects[projectPath] = {
        projectPath,
        lastSyncTime: now.toISOString(),
        sessionsUploaded,
        lastSessionId,
      };
    } else {
      state.projects[projectPath].lastSyncTime = now.toISOString();
      state.projects[projectPath].sessionsUploaded += sessionsUploaded;
      state.projects[projectPath].lastSessionId = lastSessionId;
    }

    state.globalLastSync = now.toISOString();
    state.totalSessionsUploaded += sessionsUploaded;

    await this.writeState(state);
  }

  async recordError(error: { message: string; code?: string }): Promise<void> {
    const state = await this.readState();
    state.lastError = {
      time: new Date().toISOString(),
      message: error.message,
      code: error.code,
    };
    await this.writeState(state);
  }

  async getState(): Promise<SyncState> {
    const stored = await this.readState();
    return this.toSyncState(stored);
  }

  async clear(): Promise<void> {
    const emptyState: StoredSyncState = {
      projects: {},
      totalSessionsUploaded: 0,
    };
    await this.writeState(emptyState);
  }

  // === Private Methods ===

  private async ensureConfigDir(): Promise<void> {
    const exists = await this.fs.exists(this.configDir);
    if (!exists) {
      await this.fs.mkdir(this.configDir);
    }
  }

  private async readState(): Promise<StoredSyncState> {
    try {
      const content = await this.fs.readFile(this.statePath);
      return JSON.parse(content);
    } catch {
      return {
        projects: {},
        totalSessionsUploaded: 0,
      };
    }
  }

  private async writeState(state: StoredSyncState): Promise<void> {
    await this.ensureConfigDir();
    await this.fs.writeFile(this.statePath, JSON.stringify(state, null, 2));
  }

  private toSyncState(stored: StoredSyncState): SyncState {
    const projects: Record<string, ProjectSyncState> = {};

    for (const [path, project] of Object.entries(stored.projects)) {
      projects[path] = {
        projectPath: project.projectPath,
        lastSyncTime: new Date(project.lastSyncTime),
        lastSessionId: project.lastSessionId,
        sessionsUploaded: project.sessionsUploaded,
      };
    }

    return {
      globalLastSync: stored.globalLastSync ? new Date(stored.globalLastSync) : undefined,
      projects,
      totalSessionsUploaded: stored.totalSessionsUploaded,
      lastError: stored.lastError
        ? {
            time: new Date(stored.lastError.time),
            message: stored.lastError.message,
            code: stored.lastError.code,
          }
        : undefined,
    };
  }
}
