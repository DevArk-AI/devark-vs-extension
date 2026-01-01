/**
 * Session Reader Interface
 *
 * Contract for reading sessions from different tools (Claude Code, Cursor, VS Code).
 * Implementations:
 * - ClaudeSessionReader: Reads JSONL files from ~/.claude/projects/
 * - CursorSessionReader: Reads from Cursor's SQLite database
 */

import type { SessionData, ReaderOptions, ToolType } from '../../types';

/**
 * Session reader capabilities
 */
export interface ReaderCapabilities {
  tool: ToolType;
  supportsIncremental: boolean;  // Can read only new sessions since timestamp
  supportsFiltering: boolean;    // Can filter by project path
  supportsModelTracking: boolean; // Tracks model usage
  supportsPlanningMode: boolean;  // Tracks planning mode usage
}

/**
 * Result of reading sessions
 */
export interface SessionReaderResult {
  sessions: SessionData[];
  tool: ToolType;
  totalFound: number;
  filtered: number;
  errors: SessionReaderError[];
}

/**
 * Error during session reading
 */
export interface SessionReaderError {
  path: string;
  error: string;
  recoverable: boolean;
}

export interface ISessionReader {
  /**
   * Get the tool type this reader handles
   */
  readonly tool: ToolType;

  /**
   * Get reader capabilities
   */
  getCapabilities(): ReaderCapabilities;

  /**
   * Check if this reader can operate (e.g., Claude installed, data exists)
   * @returns true if the reader can read sessions
   */
  isAvailable(): Promise<boolean>;

  /**
   * Read sessions with optional filtering
   * @param options Filtering options
   * @returns Array of session data
   */
  readSessions(options?: ReaderOptions): Promise<SessionReaderResult>;

  /**
   * Get a specific session by ID
   * @param id The session ID
   * @returns Session data or null if not found
   */
  getSessionById(id: string): Promise<SessionData | null>;

  /**
   * Get all available project paths
   * Useful for showing users which projects have sessions
   */
  getProjectPaths(): Promise<string[]>;

  /**
   * Get session count without loading full data
   * @param options Filtering options
   */
  getSessionCount(options?: ReaderOptions): Promise<number>;
}

/**
 * Factory for creating session readers
 */
export interface ISessionReaderFactory {
  /**
   * Create a reader for a specific tool
   * @param tool The tool type
   */
  createReader(tool: ToolType): ISessionReader;

  /**
   * Get all available readers
   */
  getAvailableReaders(): Promise<ISessionReader[]>;

  /**
   * Create a composite reader that reads from all sources
   */
  createCompositeReader(): ISessionReader;
}
