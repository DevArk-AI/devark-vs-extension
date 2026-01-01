/**
 * Sync State Interface
 *
 * Contract for tracking synchronization state (last sync times, etc.)
 * This prevents duplicate uploads and enables incremental syncing.
 */

/**
 * Sync state for a single project
 */
export interface ProjectSyncState {
  projectPath: string;
  lastSyncTime: Date;
  lastSessionId?: string;
  sessionsUploaded: number;
}

/**
 * Overall sync state
 */
export interface SyncState {
  globalLastSync?: Date;
  projects: Record<string, ProjectSyncState>;
  totalSessionsUploaded: number;
  lastError?: {
    time: Date;
    message: string;
    code?: string;
  };
}

export interface ISyncStateStorage {
  /**
   * Get the last sync time for a specific project
   * @param projectPath The project path identifier
   * @returns The last sync time, or null if never synced
   */
  getLastSyncTime(projectPath: string): Promise<Date | null>;

  /**
   * Set the last sync time for a specific project
   * @param projectPath The project path identifier
   * @param time The sync time to record
   */
  setLastSyncTime(projectPath: string, time: Date): Promise<void>;

  /**
   * Get the global last sync time (any project)
   * @returns The most recent sync time across all projects
   */
  getGlobalLastSync(): Promise<Date | null>;

  /**
   * Get sync state for a specific project
   * @param projectPath The project path identifier
   */
  getProjectState(projectPath: string): Promise<ProjectSyncState | null>;

  /**
   * Update sync state for a project after successful upload
   * @param projectPath The project path
   * @param sessionsUploaded Number of sessions uploaded
   * @param lastSessionId ID of the last session uploaded
   */
  recordSync(
    projectPath: string,
    sessionsUploaded: number,
    lastSessionId?: string
  ): Promise<void>;

  /**
   * Record a sync error
   * @param error The error that occurred
   */
  recordError(error: { message: string; code?: string }): Promise<void>;

  /**
   * Get the complete sync state
   */
  getState(): Promise<SyncState>;

  /**
   * Clear all sync state (reset)
   */
  clear(): Promise<void>;
}
