/**
 * Mock Storage Implementations
 *
 * In-memory storage for testing.
 */

import type {
  ITokenStorage,
} from '../../src/ports/storage/token-storage.interface';
import type {
  IConfigStorage,
  ExtensionConfig,
  DEFAULT_CONFIG,
} from '../../src/ports/storage/config-storage.interface';
import type {
  ISyncStateStorage,
  SyncState,
  ProjectSyncState,
} from '../../src/ports/storage/sync-state.interface';

/**
 * Mock Token Storage
 */
export class MockTokenStorage implements ITokenStorage {
  private token: string | null = null;

  // === Setup Methods ===

  setToken(token: string | null): void {
    this.token = token;
  }

  // === ITokenStorage Implementation ===

  async getToken(): Promise<string | null> {
    return this.token;
  }

  async storeToken(token: string): Promise<void> {
    this.token = token;
  }

  async clearToken(): Promise<void> {
    this.token = null;
  }

  async hasToken(): Promise<boolean> {
    return this.token !== null;
  }
}

/**
 * Mock Config Storage
 */
export class MockConfigStorage implements IConfigStorage {
  private config: ExtensionConfig = {};

  // === Setup Methods ===

  setConfig(config: ExtensionConfig): void {
    this.config = { ...config };
  }

  getConfig(): ExtensionConfig {
    return { ...this.config };
  }

  clear(): void {
    this.config = {};
  }

  // === IConfigStorage Implementation ===

  async get<K extends keyof ExtensionConfig>(
    key: K
  ): Promise<ExtensionConfig[K] | undefined> {
    return this.config[key];
  }

  async set<K extends keyof ExtensionConfig>(
    key: K,
    value: ExtensionConfig[K]
  ): Promise<void> {
    this.config[key] = value;
  }

  async getAll(): Promise<ExtensionConfig> {
    return { ...this.config };
  }

  async setAll(config: Partial<ExtensionConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
  }

  async reset(): Promise<void> {
    this.config = {};
  }

  async exists(): Promise<boolean> {
    return Object.keys(this.config).length > 0;
  }
}

/**
 * Mock Sync State Storage
 */
export class MockSyncStateStorage implements ISyncStateStorage {
  private state: SyncState = {
    projects: {},
    totalSessionsUploaded: 0,
  };

  // === Setup Methods (sync, for test setup) ===

  /**
   * Set state directly (sync helper for test setup)
   */
  setState(state: Partial<SyncState>): void {
    this.state = {
      projects: {},
      totalSessionsUploaded: 0,
      ...state,
    };
  }

  /**
   * Get state directly (sync helper for assertions)
   */
  getStateSync(): SyncState {
    return { ...this.state };
  }

  /**
   * Clear state directly (sync helper for test cleanup)
   */
  clearSync(): void {
    this.state = {
      projects: {},
      totalSessionsUploaded: 0,
    };
  }

  /**
   * Helper to set last sync time for a project
   */
  setLastSync(projectPath: string, time: Date): void {
    this.state.projects[projectPath] = {
      projectPath,
      lastSyncTime: time,
      sessionsUploaded: 0,
    };
    this.state.globalLastSync = time;
  }

  // === ISyncStateStorage Implementation ===

  async getLastSyncTime(projectPath: string): Promise<Date | null> {
    return this.state.projects[projectPath]?.lastSyncTime ?? null;
  }

  async setLastSyncTime(projectPath: string, time: Date): Promise<void> {
    if (!this.state.projects[projectPath]) {
      this.state.projects[projectPath] = {
        projectPath,
        lastSyncTime: time,
        sessionsUploaded: 0,
      };
    } else {
      this.state.projects[projectPath].lastSyncTime = time;
    }
    this.state.globalLastSync = time;
  }

  async getGlobalLastSync(): Promise<Date | null> {
    return this.state.globalLastSync ?? null;
  }

  async getProjectState(projectPath: string): Promise<ProjectSyncState | null> {
    return this.state.projects[projectPath] ?? null;
  }

  async recordSync(
    projectPath: string,
    sessionsUploaded: number,
    lastSessionId?: string
  ): Promise<void> {
    const now = new Date();
    if (!this.state.projects[projectPath]) {
      this.state.projects[projectPath] = {
        projectPath,
        lastSyncTime: now,
        sessionsUploaded,
        lastSessionId,
      };
    } else {
      this.state.projects[projectPath].lastSyncTime = now;
      this.state.projects[projectPath].sessionsUploaded += sessionsUploaded;
      this.state.projects[projectPath].lastSessionId = lastSessionId;
    }
    this.state.globalLastSync = now;
    this.state.totalSessionsUploaded += sessionsUploaded;
  }

  async recordError(error: { message: string; code?: string }): Promise<void> {
    this.state.lastError = {
      time: new Date(),
      message: error.message,
      code: error.code,
    };
  }

  // === ISyncStateStorage async methods ===

  async getState(): Promise<SyncState> {
    return { ...this.state };
  }

  async clear(): Promise<void> {
    this.state = {
      projects: {},
      totalSessionsUploaded: 0,
    };
  }
}
