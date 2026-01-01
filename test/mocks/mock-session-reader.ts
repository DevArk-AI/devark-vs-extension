/**
 * Mock Session Reader
 *
 * In-memory session storage for testing session reading functionality.
 */

import type {
  ISessionReader,
  ReaderCapabilities,
  SessionReaderResult,
  SessionReaderError,
} from '../../src/ports/readers/session-reader.interface';
import type { SessionData, ReaderOptions, ToolType } from '../../src/types';

export class MockSessionReader implements ISessionReader {
  readonly tool: ToolType;

  private sessions: SessionData[] = [];
  private available = true;
  private errors: SessionReaderError[] = [];

  constructor(tool: ToolType = 'claude_code') {
    this.tool = tool;
  }

  // === Setup Methods (for tests) ===

  /**
   * Add a session to the mock reader
   */
  addSession(session: Partial<SessionData>): SessionData {
    const fullSession: SessionData = {
      id: session.id ?? `session-${this.sessions.length + 1}`,
      projectPath: session.projectPath ?? '/home/user/project',
      timestamp: session.timestamp ?? new Date(),
      messages: session.messages ?? [],
      duration: session.duration ?? 3600,
      tool: session.tool ?? this.tool,
      ...session,
    };
    this.sessions.push(fullSession);
    return fullSession;
  }

  /**
   * Add multiple sessions
   */
  addSessions(sessions: Partial<SessionData>[]): SessionData[] {
    return sessions.map((s) => this.addSession(s));
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.sessions = [];
    this.errors = [];
  }

  /**
   * Set whether the reader is available
   */
  setAvailable(available: boolean): void {
    this.available = available;
  }

  /**
   * Add a simulated error
   */
  addError(error: SessionReaderError): void {
    this.errors.push(error);
  }

  /**
   * Get all sessions (for assertions)
   */
  getSessions(): SessionData[] {
    return [...this.sessions];
  }

  // === ISessionReader Implementation ===

  getCapabilities(): ReaderCapabilities {
    return {
      tool: this.tool,
      supportsIncremental: true,
      supportsFiltering: true,
      supportsModelTracking: true,
      supportsPlanningMode: true,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async readSessions(options?: ReaderOptions): Promise<SessionReaderResult> {
    let filtered = [...this.sessions];

    // Apply filters
    if (options?.since) {
      filtered = filtered.filter((s) => s.timestamp >= options.since!);
    }

    if (options?.projectPath) {
      const normalizedPath = options.projectPath.toLowerCase();
      filtered = filtered.filter((s) =>
        s.projectPath.toLowerCase().startsWith(normalizedPath)
      );
    }

    if (options?.limit && options.limit > 0) {
      filtered = filtered.slice(0, options.limit);
    }

    return {
      sessions: filtered,
      tool: this.tool,
      totalFound: this.sessions.length,
      filtered: this.sessions.length - filtered.length,
      errors: this.errors,
    };
  }

  async getSessionById(id: string): Promise<SessionData | null> {
    return this.sessions.find((s) => s.id === id) ?? null;
  }

  async getProjectPaths(): Promise<string[]> {
    const paths = new Set(this.sessions.map((s) => s.projectPath));
    return [...paths];
  }

  async getSessionCount(options?: ReaderOptions): Promise<number> {
    const result = await this.readSessions(options);
    return result.sessions.length;
  }
}
