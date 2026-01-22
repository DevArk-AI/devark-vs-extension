/**
 * Cursor SQLite Session Reader
 *
 * Reads Cursor's state.vscdb (SQLite database) to:
 * - Detect active Cursor composer sessions
 * - Extract session metadata and conversation history
 * - Track composerData changes
 *
 * Based on research from Cursor DB MCP server patterns
 * Database: globalStorage/state.vscdb
 * Table: cursorDiskKV
 * Keys: composerData:<composerId>
 *
 * Uses sql.js (pure JavaScript SQLite) for cross-platform compatibility
 * in VS Code extension environment.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

// Optional vscode import - not available in standalone CLI mode
let vscode: typeof import('vscode') | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  vscode = require('vscode');
} catch {
  // Running in standalone CLI mode without VS Code
}
import { CursorSession, ComposerData, CursorDiskKVRow, MessageData, RawCursorMessage, ICursorDatabase } from './types';
import type { ConversationHighlights, SessionIndex, SessionDetails, SessionData, ReaderOptions, ToolType, Message, SessionMetadata, TokenUsageData } from '../types';
import type { ISessionReader, ReaderCapabilities, SessionReaderResult, SessionReaderError } from '../ports/readers/session-reader.interface';
import { extractHighlights, calculateDuration, calculateTokenUsage } from '../core/session';

/** Max characters for truncated content in highlights */
const MAX_HIGHLIGHT_LENGTH = 300;

// Set to true to enable verbose logging
const DEBUG_SESSION_READER = false;

/**
 * Platform-specific paths to Cursor's state.vscdb
 */
function getCursorDatabasePaths(): string[] {
  const homeDir = os.homedir();
  const platform = os.platform();

  switch (platform) {
    case 'darwin': // macOS
      return [
        path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
      ];

    case 'linux':
      return [
        path.join(homeDir, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
      ];

    case 'win32': // Windows
      const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
      return [
        path.join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb')
      ];

    default:
      if (DEBUG_SESSION_READER) console.warn(`[Session Reader] Unsupported platform: ${platform}`);
      return [];
  }
}

/**
 * Cursor Session Reader
 */
/**
 * Maximum database file size to load into memory (100MB)
 * Larger files will be truncated or cause an error
 */
const MAX_DB_FILE_SIZE = 100 * 1024 * 1024;

/**
 * Debounce delay for reconnection to prevent rapid re-reads
 */
const RECONNECT_DEBOUNCE_MS = 2000;

/**
 * Maximum retry attempts for database operations
 */
const MAX_RETRY_ATTEMPTS = 3;

export class CursorSessionReader implements ISessionReader {
  readonly tool: ToolType = 'cursor';

  private dbPath: string | null = null;
  private db: SqlJsDatabase | ICursorDatabase | null = null;
  private sqlInstance: Awaited<ReturnType<typeof initSqlJs>> | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isReconnecting: boolean = false;
  private lastReconnectTime: number = 0;
  private dbFileSize: number = 0;
  private initialized = false;

  /**
   * Create a new session reader.
   * @param injectedDb Optional database for testing. If provided, skips file-based initialization.
   */
  constructor(private injectedDb?: ICursorDatabase) {
    if (injectedDb) {
      this.db = injectedDb;
      this.initialized = true;
    }
  }

  getCapabilities(): ReaderCapabilities {
    return {
      tool: 'cursor',
      supportsIncremental: true,
      supportsFiltering: true,
      supportsModelTracking: false,
      supportsPlanningMode: false,
    };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.initialized) {
      this.initialized = await this.initialize();
    }
    return this.isReady();
  }

  async readSessions(options: ReaderOptions = {}): Promise<SessionReaderResult> {
    const sessions: SessionData[] = [];
    const errors: SessionReaderError[] = [];

    if (!this.initialized) {
      this.initialized = await this.initialize();
    }

    if (!this.isReady()) {
      return {
        sessions: [],
        tool: 'cursor',
        totalFound: 0,
        filtered: 0,
        errors: [{
          path: 'cursor-database',
          error: 'Cursor database not available',
          recoverable: false,
        }],
      };
    }

    const cursorSessions = this.getActiveSessions();

    for (const cursorSession of cursorSessions) {
      try {
        const sessionData = this.convertToSessionData(cursorSession);

        if (!sessionData || sessionData.messages.length === 0) {
          continue;
        }

        if (options.since && sessionData.timestamp < options.since) {
          continue;
        }

        if (options.projectPath && sessionData.projectPath) {
          const normalizedSession = sessionData.projectPath.toLowerCase();
          const normalizedFilter = options.projectPath.toLowerCase();
          if (!normalizedSession.startsWith(normalizedFilter)) {
            continue;
          }
        }

        sessions.push(sessionData);

        if (options.limit && sessions.length >= options.limit) {
          break;
        }
      } catch (error) {
        errors.push({
          path: cursorSession.sessionId,
          error: error instanceof Error ? error.message : String(error),
          recoverable: true,
        });
      }
    }

    sessions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return {
      sessions,
      tool: 'cursor',
      totalFound: sessions.length,
      filtered: sessions.length,
      errors,
    };
  }

  async getProjectPaths(): Promise<string[]> {
    const result = await this.readSessions();
    const paths = new Set<string>();

    for (const session of result.sessions) {
      if (session.projectPath) {
        paths.add(session.projectPath);
      }
    }

    return Array.from(paths);
  }

  async getSessionCount(options?: ReaderOptions): Promise<number> {
    const result = await this.readSessions(options);
    return result.sessions.length;
  }

  /**
   * Convert CursorSession to SessionData format (ISessionReader interface)
   */
  private convertToSessionData(cursorSession: CursorSession): SessionData | null {
    const messages = this.getAllMessagesForSession(cursorSession.sessionId);

    if (messages.length === 0) {
      return null;
    }

    const convertedMessages: Message[] = messages.map((msg: MessageData) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: new Date(msg.timestamp),
    }));

    const durationResult = calculateDuration(convertedMessages);

    const metadata: SessionMetadata = {
      files_edited: 0,
      languages: [],
    };

    // Calculate token usage for context window tracking
    // Cursor sessions use tiktoken estimates (no direct API access)
    const tokenUsageResult = calculateTokenUsage(convertedMessages);
    const tokenUsage: TokenUsageData = {
      inputTokens: tokenUsageResult.inputTokens,
      outputTokens: tokenUsageResult.outputTokens,
      totalTokens: tokenUsageResult.totalTokens,
      contextUtilization: tokenUsageResult.contextUtilization,
      source: 'estimated',
    };

    return {
      id: `cursor-${cursorSession.sessionId}`,
      projectPath: cursorSession.workspacePath || cursorSession.workspaceName || 'Unknown',
      timestamp: cursorSession.startTime,
      messages: convertedMessages,
      duration: durationResult.durationSeconds,
      tool: 'cursor',
      metadata,
      highlights: cursorSession.highlights,
      tokenUsage,
    };
  }

  /**
   * Initialize the session reader
   * Finds and connects to Cursor's SQLite database
   */
  async initialize(): Promise<boolean> {
    // Skip file loading if db was injected (for testing)
    if (this.injectedDb) {
      return true;
    }

    try {
      // Find the database
      this.dbPath = await this.findCursorDatabase();

      if (!this.dbPath) {
        if (DEBUG_SESSION_READER) console.warn('[Session Reader] Cursor database not found');
        return false;
      }

      if (DEBUG_SESSION_READER) console.log('[Session Reader] Found database:', this.dbPath);

      // Initialize sql.js with the WASM file path
      // The WASM file should be in the extension's dist folder
      // In standalone CLI mode, vscode is undefined so we use __dirname
      let wasmPath: string;
      if (vscode) {
        const extensionPath = vscode.extensions.getExtension('devark.devark-extension')?.extensionPath
          || path.join(__dirname, '..');
        wasmPath = path.join(extensionPath, 'dist', 'sql-wasm.wasm');
      } else {
        // CLI mode: __dirname is dist/bin/, WASM is at dist/sql-wasm.wasm
        wasmPath = path.join(__dirname, '..', 'sql-wasm.wasm');
      }
      if (DEBUG_SESSION_READER) console.log('[Session Reader] Looking for WASM at:', wasmPath);

      // Check if WASM file exists, fall back to node_modules if not found
      let wasmBinary: ArrayBuffer | undefined;
      try {
        const wasmBuffer = await fs.readFile(wasmPath);
        wasmBinary = wasmBuffer.buffer.slice(wasmBuffer.byteOffset, wasmBuffer.byteOffset + wasmBuffer.byteLength);
        if (DEBUG_SESSION_READER) console.log('[Session Reader] WASM file loaded from:', wasmPath);
      } catch {
        // Try node_modules path as fallback (only makes sense in extension context)
        if (vscode) {
          const extensionPath = vscode.extensions.getExtension('devark.devark-extension')?.extensionPath
            || path.join(__dirname, '..');
          const fallbackWasmPath = path.join(extensionPath, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
          if (DEBUG_SESSION_READER) console.log('[Session Reader] Trying fallback WASM at:', fallbackWasmPath);
          try {
            const wasmBuffer = await fs.readFile(fallbackWasmPath);
            wasmBinary = wasmBuffer.buffer.slice(wasmBuffer.byteOffset, wasmBuffer.byteOffset + wasmBuffer.byteLength);
            if (DEBUG_SESSION_READER) console.log('[Session Reader] WASM file loaded from node_modules/');
          } catch {
            if (DEBUG_SESSION_READER) console.warn('[Session Reader] WASM file not found, sql.js will try to fetch it');
          }
        } else {
          if (DEBUG_SESSION_READER) console.warn('[Session Reader] WASM file not found at:', wasmPath);
        }
      }

      this.sqlInstance = await initSqlJs({
        wasmBinary,
      });

      // Check database file size before loading
      const stats = await fs.stat(this.dbPath);
      this.dbFileSize = stats.size;

      if (this.dbFileSize > MAX_DB_FILE_SIZE) {
        console.warn(`[Session Reader] Database file too large: ${Math.round(this.dbFileSize / 1024 / 1024)}MB (max ${MAX_DB_FILE_SIZE / 1024 / 1024}MB)`);
        // Still try to load, but warn about potential memory issues
      }

      if (DEBUG_SESSION_READER) console.log(`[Session Reader] Loading database file: ${Math.round(this.dbFileSize / 1024)}KB`);

      // Read database file with explicit buffer handling
      let dbBuffer: Buffer;
      try {
        dbBuffer = await fs.readFile(this.dbPath);
      } catch (readError) {
        // Handle EBUSY or file lock errors
        if ((readError as NodeJS.ErrnoException).code === 'EBUSY') {
          console.warn('[Session Reader] Database file is busy (Cursor may be writing). Will retry later.');
          return false;
        }
        throw readError;
      }

      this.db = new this.sqlInstance.Database(dbBuffer);

      // Test connection
      const tables = this.db.exec("SELECT name FROM sqlite_master WHERE type='table'");
      const tableNames = tables[0]?.values.map((row: any[]) => row[0]) || [];
      if (DEBUG_SESSION_READER) console.log('[Session Reader] Connected. Tables:', tableNames.join(', '));

      // Check if cursorDiskKV table exists and has data
      if (tableNames.includes('cursorDiskKV') && DEBUG_SESSION_READER) {
        const countResult = this.db.exec("SELECT COUNT(*) as count FROM cursorDiskKV WHERE key LIKE 'composerData:%'");
        const count = countResult[0]?.values[0]?.[0] || 0;
        console.log(`[Session Reader] Found ${count} composerData entries in database`);

        // Also check for any recent entries
        const sampleResult = this.db.exec("SELECT key FROM cursorDiskKV WHERE key LIKE 'composerData:%' LIMIT 3");
        const sampleKeys = sampleResult[0]?.values.map((row: any[]) => row[0] as string) || [];
        if (sampleKeys.length > 0) {
          console.log('[Session Reader] Sample session IDs:', sampleKeys.map((k: string) => k.replace('composerData:', '').substring(0, 8) + '...').join(', '));
        }
      }

      return true;
    } catch (error) {
      console.error('[Session Reader] Failed to initialize:', error);
      this.db = null;
      return false;
    }
  }

  /**
   * Find Cursor's database file
   */
  async findCursorDatabase(): Promise<string | null> {
    const possiblePaths = getCursorDatabasePaths();

    for (const dbPath of possiblePaths) {
      try {
        await fs.access(dbPath, fs.constants.R_OK);
        if (DEBUG_SESSION_READER) console.log('[Session Reader] Database found:', dbPath);
        return dbPath;
      } catch {
        // File doesn't exist or isn't readable, try next path
        continue;
      }
    }

    return null;
  }

  /**
   * Get all active Cursor composer sessions
   * With retry logic for database corruption errors
   */
  getActiveSessions(): CursorSession[] {
    if (!this.db) {
      if (DEBUG_SESSION_READER) console.warn('[Session Reader] Database not initialized');
      return [];
    }

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        // Query cursorDiskKV table for composerData keys
        const result = this.db.exec(`
          SELECT key, value
          FROM cursorDiskKV
          WHERE key LIKE 'composerData:%'
        `);

        const rows: CursorDiskKVRow[] = (result[0]?.values || []).map((row: any[]) => ({
          key: row[0] as string,
          value: row[1] as string
        }));

        if (DEBUG_SESSION_READER) console.log(`[Session Reader] Query returned ${rows.length} composerData rows`);

        const sessions: CursorSession[] = [];

        for (const row of rows) {
          try {
            const session = this.parseComposerRow(row);
            if (session) {
              sessions.push(session);
            }
          } catch (error) {
            // Don't fail the whole operation for one bad row
            if (DEBUG_SESSION_READER) console.warn('[Session Reader] Failed to parse row:', row.key, error);
          }
        }

        // Sort by last activity (most recent first)
        sessions.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());

        if (DEBUG_SESSION_READER) {
          console.log(`[Session Reader] Found ${sessions.length} valid sessions from ${rows.length} rows`);

          // Log the most recent session for debugging
          if (sessions.length > 0) {
            const latest = sessions[0];
            console.log(`[Session Reader] Most recent session: ${latest.sessionId.substring(0, 8)}... (${latest.workspaceName}), last activity: ${latest.lastActivity.toISOString()}`);
          }
        }

        return sessions;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Check for database corruption errors
        if (errorMsg.includes('malformed') || errorMsg.includes('corrupt') || errorMsg.includes('disk image')) {
          console.warn(`[Session Reader] Database corruption detected (attempt ${attempt}/${MAX_RETRY_ATTEMPTS}), scheduling reconnect...`);

          // Schedule a reconnect to reload the database
          this.scheduleReconnect();

          if (attempt < MAX_RETRY_ATTEMPTS) {
            // Wait briefly before retry
            continue;
          }
        }

        console.error('[Session Reader] Failed to get active sessions:', error);
        return [];
      }
    }

    return [];
  }

  /**
   * Get lightweight session index for fast queries.
   * Similar to getActiveSessions() but skips expensive highlights extraction.
   * Returns only metadata needed for filtering, counting, and display.
   */
  getSessionIndex(): SessionIndex[] {
    if (!this.db) {
      if (DEBUG_SESSION_READER) console.warn('[Session Reader] Database not initialized');
      return [];
    }

    try {
      const result = this.db.exec(`
        SELECT key, value
        FROM cursorDiskKV
        WHERE key LIKE 'composerData:%'
      `);

      const rows: CursorDiskKVRow[] = (result[0]?.values || []).map((row: any[]) => ({
        key: row[0] as string,
        value: row[1] as string
      }));

      const indices: SessionIndex[] = [];

      for (const row of rows) {
        try {
          const index = this.parseComposerRowToIndex(row);
          if (index) {
            indices.push(index);
          }
        } catch {
          // Skip invalid rows
        }
      }

      // Sort by timestamp (most recent first)
      indices.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      if (DEBUG_SESSION_READER) {
        console.log(`[Session Reader] getSessionIndex: Found ${indices.length} sessions from ${rows.length} rows`);
      }

      return indices;
    } catch (error) {
      console.error('[Session Reader] Failed to get session index:', error);
      return [];
    }
  }

  /**
   * Parse a cursorDiskKV row into a lightweight SessionIndex.
   * Skips highlights extraction for better performance.
   */
  private parseComposerRowToIndex(row: CursorDiskKVRow): SessionIndex | null {
    try {
      const composerId = row.key.replace('composerData:', '');
      const data: ComposerData = JSON.parse(row.value);

      const startTime = this.extractStartTime(data);
      const lastActivity = this.extractLastActivity(data);
      const durationSeconds = Math.floor(
        (lastActivity.getTime() - startTime.getTime()) / 1000
      );

      return {
        id: composerId,
        source: 'cursor',
        timestamp: startTime,
        duration: durationSeconds,
        projectPath: this.extractWorkspacePath(data) || '',
        workspaceName: this.extractWorkspaceName(data),
        promptCount: this.extractPromptCount(data),
      };
    } catch {
      return null;
    }
  }

  /**
   * Get session by ID (ISessionReader interface)
   * Returns SessionData format for interface compliance.
   */
  async getSessionById(id: string): Promise<SessionData | null> {
    if (!this.initialized) {
      this.initialized = await this.initialize();
    }

    if (!this.isReady()) {
      return null;
    }

    // Handle prefixed IDs (cursor-xxx)
    const sessionId = id.startsWith('cursor-') ? id.replace('cursor-', '') : id;
    const cursorSession = this.getCursorSessionById(sessionId);

    if (!cursorSession) {
      return null;
    }

    return this.convertToSessionData(cursorSession);
  }

  /**
   * Get session by ID (internal format)
   * Returns CursorSession format for internal use.
   */
  getCursorSessionById(sessionId: string): CursorSession | null {
    if (!this.db) {
      if (DEBUG_SESSION_READER) console.warn('[Session Reader] Database not initialized');
      return null;
    }

    try {
      const stmt = this.db.prepare(`
        SELECT key, value
        FROM cursorDiskKV
        WHERE key = ?
      `);
      stmt.bind([`composerData:${sessionId}`]);

      if (stmt.step()) {
        const row: CursorDiskKVRow = {
          key: stmt.get()[0] as string,
          value: stmt.get()[1] as string
        };
        stmt.free();
        return this.parseComposerRow(row);
      }

      stmt.free();
      return null;
    } catch (error) {
      console.error('[Session Reader] Failed to get session by ID:', error);
      return null;
    }
  }

  /**
   * Get session details (messages, highlights, etc.) for a specific session.
   * On-demand loading for when full session data is needed.
   */
  getSessionDetails(sessionId: string): SessionDetails | null {
    if (!this.db) {
      if (DEBUG_SESSION_READER) console.warn('[Session Reader] Database not initialized');
      return null;
    }

    try {
      const stmt = this.db.prepare(`
        SELECT key, value
        FROM cursorDiskKV
        WHERE key = ?
      `);
      stmt.bind([`composerData:${sessionId}`]);

      if (stmt.step()) {
        const value = stmt.get()[1] as string;
        stmt.free();

        const data: ComposerData = JSON.parse(value);

        // Extract messages
        const messages = this.extractMessagesFromComposerData(data, sessionId);

        // Convert MessageData[] to Message[] format
        const formattedMessages = messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.timestamp),
        }));

        return {
          messages: formattedMessages,
          highlights: this.extractConversationHighlights(data),
          fileContext: this.extractFileContext(data),
        };
      }

      stmt.free();
      return null;
    } catch (error) {
      console.error('[Session Reader] Failed to get session details:', error);
      return null;
    }
  }

  /**
   * Get messages from a session using inline array format
   * Format 1: { messages: [{role: 'user', content: '...'}] }
   * Format 3: { conversation: [...], conversationHistory: [...] }
   */
  getSessionMessages(sessionId: string): MessageData[] {
    if (!this.db) {
      if (DEBUG_SESSION_READER) console.warn('[Session Reader] Database not initialized');
      return [];
    }

    try {
      const stmt = this.db.prepare(`
        SELECT key, value
        FROM cursorDiskKV
        WHERE key = ?
      `);
      stmt.bind([`composerData:${sessionId}`]);

      if (stmt.step()) {
        const value = stmt.get()[1] as string;
        stmt.free();

        const data: ComposerData = JSON.parse(value);
        return this.extractMessagesFromComposerData(data, sessionId);
      }

      stmt.free();
      if (DEBUG_SESSION_READER) console.log(`[Session Reader] No composer data found for session ${sessionId}`);
      return [];
    } catch (error) {
      console.error('[Session Reader] Failed to get session messages:', error);
      return [];
    }
  }

  /**
   * Get messages from bubble format (transitional format)
   * Format 2: bubbleId:{composerId}:{index} -> {role, content, timestamp}
   */
  getBubbleMessages(composerId: string): MessageData[] {
    if (!this.db) {
      if (DEBUG_SESSION_READER) console.warn('[Session Reader] Database not initialized');
      return [];
    }

    try {
      const result = this.db.exec(`
        SELECT key, value
        FROM cursorDiskKV
        WHERE key LIKE 'bubbleId:${composerId}:%'
        ORDER BY key ASC
      `);

      const rows: CursorDiskKVRow[] = (result[0]?.values || []).map((row: any[]) => ({
        key: row[0] as string,
        value: row[1] as string
      }));

      const messages: MessageData[] = [];

      for (const row of rows) {
        try {
          const bubbleData = JSON.parse(row.value);
          const message = this.normalizeBubbleMessage(bubbleData, row.key);
          if (message) {
            messages.push(message);
          }
        } catch (parseError) {
          if (DEBUG_SESSION_READER) console.warn(`[Session Reader] Failed to parse bubble: ${row.key}`, parseError);
        }
      }

      if (DEBUG_SESSION_READER) console.log(`[Session Reader] Found ${messages.length} bubble messages for ${composerId}`);
      return messages;
    } catch (error) {
      console.error('[Session Reader] Failed to get bubble messages:', error);
      return [];
    }
  }

  /**
   * Get all messages for a session, trying all formats
   * Unified method that combines inline and bubble messages
   */
  getAllMessagesForSession(sessionId: string): MessageData[] {
    // Try inline format first (most common)
    const inlineMessages = this.getSessionMessages(sessionId);

    if (inlineMessages.length > 0) {
      if (DEBUG_SESSION_READER) console.log(`[Session Reader] Found ${inlineMessages.length} inline messages for ${sessionId}`);
      return inlineMessages;
    }

    // Try bubble format as fallback
    const bubbleMessages = this.getBubbleMessages(sessionId);

    if (bubbleMessages.length > 0) {
      if (DEBUG_SESSION_READER) console.log(`[Session Reader] Found ${bubbleMessages.length} bubble messages for ${sessionId}`);
      return bubbleMessages;
    }

    if (DEBUG_SESSION_READER) console.log(`[Session Reader] No messages found for session ${sessionId}`);
    return [];
  }

  /**
   * Extract messages from composer data, handling multiple formats
   */
  private extractMessagesFromComposerData(data: ComposerData, sessionId: string): MessageData[] {
    const messages: MessageData[] = [];

    // Try Format 1: messages array
    if (data.messages && Array.isArray(data.messages)) {
      if (DEBUG_SESSION_READER) console.log(`[Session Reader] Using messages array format (${data.messages.length} messages)`);
      for (let i = 0; i < data.messages.length; i++) {
        const msg = this.normalizeRawMessage(data.messages[i], `${sessionId}-msg-${i}`);
        if (msg) {
          messages.push(msg);
        }
      }
      return messages;
    }

    // Try Format 3: conversation array
    if (data.conversation && Array.isArray(data.conversation)) {
      if (DEBUG_SESSION_READER) console.log(`[Session Reader] Using conversation array format (${data.conversation.length} messages)`);
      for (let i = 0; i < data.conversation.length; i++) {
        const msg = this.normalizeRawMessage(data.conversation[i], `${sessionId}-conv-${i}`);
        if (msg) {
          messages.push(msg);
        }
      }
      return messages;
    }

    // Try conversationHistory as another variant
    if (data.conversationHistory && Array.isArray(data.conversationHistory)) {
      if (DEBUG_SESSION_READER) console.log(`[Session Reader] Using conversationHistory format (${data.conversationHistory.length} messages)`);
      for (let i = 0; i < data.conversationHistory.length; i++) {
        const msg = this.normalizeRawMessage(data.conversationHistory[i], `${sessionId}-hist-${i}`);
        if (msg) {
          messages.push(msg);
        }
      }
      return messages;
    }

    // Try to find any array that looks like messages
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length > 0 && this.looksLikeMessageArray(value)) {
        if (DEBUG_SESSION_READER) console.log(`[Session Reader] Found message-like array in field '${key}' (${value.length} items)`);
        for (let i = 0; i < value.length; i++) {
          const msg = this.normalizeRawMessage(value[i], `${sessionId}-${key}-${i}`);
          if (msg) {
            messages.push(msg);
          }
        }
        if (messages.length > 0) {
          return messages;
        }
      }
    }

    if (DEBUG_SESSION_READER) console.log('[Session Reader] No message arrays found in composer data');
    return messages;
  }

  /**
   * Check if an array looks like it contains messages
   */
  private looksLikeMessageArray(arr: any[]): boolean {
    if (arr.length === 0) return false;
    const first = arr[0];
    if (typeof first !== 'object' || first === null) return false;

    // Check for common message indicators
    return (
      'role' in first ||
      'type' in first ||
      'content' in first ||
      'text' in first ||
      'message' in first
    );
  }

  /**
   * Generate a stable hash from content for message ID
   * Uses a simple but fast hash algorithm (djb2)
   */
  private generateContentHash(content: string, role: string, timestamp?: string): string {
    const input = `${role}:${content}:${timestamp || ''}`;
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash) + input.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert to positive hex string
    return Math.abs(hash).toString(16);
  }

  /**
   * Normalize a raw message to MessageData format
   */
  private normalizeRawMessage(raw: RawCursorMessage, _fallbackId: string): MessageData | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    // Extract role
    let role: 'user' | 'assistant' = 'user';
    if (raw.role === 'assistant' || raw.role === 'system') {
      role = 'assistant';
    } else if (raw.type !== undefined) {
      // Some versions use type: 1 for user, 2 for assistant
      role = raw.type === 2 || raw.type === 'assistant' ? 'assistant' : 'user';
    }

    // Skip system messages
    if (raw.role === 'system') {
      return null;
    }

    // Extract content
    const content = raw.content || raw.text || raw.message || '';
    if (!content || typeof content !== 'string' || content.trim() === '') {
      return null;
    }

    // Extract timestamp
    let timestamp: string;
    if (raw.timestamp) {
      if (typeof raw.timestamp === 'number') {
        timestamp = new Date(raw.timestamp).toISOString();
      } else {
        timestamp = raw.timestamp;
      }
    } else {
      timestamp = new Date().toISOString();
    }

    // Extract ID - prefer existing IDs, but generate content-based hash as fallback
    // IMPORTANT: Don't use array index as fallback - it shifts when new messages are added
    // Instead, use a hash of the content which remains stable
    let id = raw.bubbleId || raw.id;
    if (!id) {
      // Generate stable ID from content hash
      id = `msg-${this.generateContentHash(content, role, raw.timestamp?.toString())}`;
    }

    return {
      id: String(id),
      role,
      content: content.trim(),
      timestamp,
      bubbleId: raw.bubbleId,
      metadata: raw.metadata || undefined
    };
  }

  /**
   * Normalize a bubble format message
   */
  private normalizeBubbleMessage(bubbleData: any, key: string): MessageData | null {
    if (!bubbleData || typeof bubbleData !== 'object') {
      return null;
    }

    // Extract role
    let role: 'user' | 'assistant' = 'user';
    if (bubbleData.role === 'assistant' || bubbleData.type === 2 || bubbleData.type === 'assistant') {
      role = 'assistant';
    }

    // Extract content
    const content = bubbleData.content || bubbleData.text || bubbleData.message || '';
    if (!content || content.trim() === '') {
      return null;
    }

    // Extract timestamp
    let timestamp: string;
    if (bubbleData.timestamp) {
      if (typeof bubbleData.timestamp === 'number') {
        timestamp = new Date(bubbleData.timestamp).toISOString();
      } else {
        timestamp = bubbleData.timestamp;
      }
    } else {
      timestamp = new Date().toISOString();
    }

    // Use the database key as ID since it's stable (assigned by Cursor)
    // Fall back to content hash if key is malformed
    const id = key || `bubble-${this.generateContentHash(content, role, bubbleData.timestamp?.toString())}`;

    return {
      id,
      role,
      content: content.trim(),
      timestamp,
      bubbleId: key,
      metadata: bubbleData.metadata || undefined
    };
  }

  /**
   * Parse a cursorDiskKV row into a CursorSession
   */
  private parseComposerRow(row: CursorDiskKVRow): CursorSession | null {
    try {
      // Extract composerId from key (format: "composerData:<composerId>")
      const composerId = row.key.replace('composerData:', '');

      // Parse JSON value
      const data: ComposerData = JSON.parse(row.value);

      // Log version for debugging (Cursor uses versions 3, 9, 10, etc.)
      // Note: Different Cursor versions use different schema versions, but the core structure remains compatible
      if (DEBUG_SESSION_READER && data._v !== undefined && data._v !== 3 && data._v !== 9 && data._v !== 10) {
        console.log(`[Session Reader] Found composer ${composerId} with schema version ${data._v}`);
      }

      // Extract session metadata
      const session: CursorSession = {
        sessionId: composerId,
        workspaceName: this.extractWorkspaceName(data),
        workspacePath: this.extractWorkspacePath(data),
        startTime: this.extractStartTime(data),
        lastActivity: this.extractLastActivity(data),
        promptCount: this.extractPromptCount(data),
        status: this.determineStatus(data),
        fileContext: this.extractFileContext(data),
        highlights: this.extractConversationHighlights(data)
      };

      return session;
    } catch (error) {
      console.error('[Session Reader] Failed to parse composer data:', error);
      return null;
    }
  }

  /**
   * Extract workspace name from composer data
   */
  private extractWorkspaceName(data: ComposerData): string {
    // Try to extract from various possible fields
    if (data.workspaceName) return data.workspaceName;
    if (data.workspace) return String(data.workspace);

    // Fallback to workspace path basename
    if (data.workspacePath) {
      return path.basename(String(data.workspacePath));
    }

    return 'Unknown Workspace';
  }

  /**
   * Extract workspace path from composer data
   */
  private extractWorkspacePath(data: ComposerData): string | undefined {
    if (data.workspacePath) return String(data.workspacePath);
    if (data.workspace && typeof data.workspace === 'string') {
      return data.workspace;
    }
    return undefined;
  }

  /**
   * Extract start time from composer data
   */
  private extractStartTime(data: ComposerData): Date {
    if (data.createdAt) {
      return new Date(data.createdAt);
    }
    // Fallback to current time if not available
    return new Date();
  }

  /**
   * Extract last activity time from composer data
   */
  private extractLastActivity(data: ComposerData): Date {
    if (data.updatedAt) {
      return new Date(data.updatedAt);
    }
    if (data.createdAt) {
      return new Date(data.createdAt);
    }
    return new Date();
  }

  /**
   * Extract prompt count from composer data
   */
  private extractPromptCount(data: ComposerData): number {
    // Legacy format: messages array with text directly
    if (data.messages && Array.isArray(data.messages)) {
      return data.messages.length;
    }
    if (data.conversationHistory && Array.isArray(data.conversationHistory)) {
      return data.conversationHistory.length;
    }
    // Legacy format: conversation array
    if (data.conversation && Array.isArray(data.conversation)) {
      return data.conversation.length;
    }
    // Modern format (Cursor v9+): fullConversationHeadersOnly contains message headers
    // type 1 = user message, type 2 = assistant message
    if (data.fullConversationHeadersOnly && Array.isArray(data.fullConversationHeadersOnly)) {
      // Count user messages only (type === 1) to match prompt count semantics
      return data.fullConversationHeadersOnly.filter(
        (header: { type?: number }) => header.type === 1
      ).length;
    }
    if (typeof data.promptCount === 'number') {
      return data.promptCount;
    }
    return 0;
  }

  /**
   * Determine if session is active or historical
   */
  private determineStatus(data: ComposerData): 'active' | 'historical' {
    const lastActivity = this.extractLastActivity(data);
    const now = new Date();
    const hoursSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);

    // Consider sessions active if updated in last 24 hours
    return hoursSinceActivity < 24 ? 'active' : 'historical';
  }

  /**
   * Extract file context from composer data
   */
  private extractFileContext(data: ComposerData): string[] | undefined {
    const files: string[] = [];

    // Try to extract from various possible fields
    if (data.files && Array.isArray(data.files)) {
      files.push(...data.files.map(String));
    }
    if (data.fileContext && Array.isArray(data.fileContext)) {
      files.push(...data.fileContext.map(String));
    }
    if (data.contextFiles && Array.isArray(data.contextFiles)) {
      files.push(...data.contextFiles.map(String));
    }

    return files.length > 0 ? files : undefined;
  }

  /**
   * Extract conversation highlights from Cursor session data
   * Uses shared highlights extractor.
   */
  private extractConversationHighlights(data: ComposerData): ConversationHighlights | undefined {
    // Convert raw Cursor messages to Message[] format
    const rawMessages = data.messages || data.conversation || data.conversationHistory || [];

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return undefined;
    }

    const messages: Message[] = [];

    for (const msg of rawMessages) {
      const content = msg.content || msg.text || msg.message || '';
      const role = this.normalizeRole(msg);

      if (role && content && content.trim().length >= 10) {
        messages.push({
          role,
          content,
          timestamp: new Date(msg.timestamp || Date.now()),
        });
      }
    }

    if (messages.length === 0) {
      return undefined;
    }

    // Use shared highlights extractor
    return extractHighlights(messages, { maxLength: MAX_HIGHLIGHT_LENGTH });
  }

  /**
   * Normalize message role from various Cursor formats
   */
  private normalizeRole(msg: RawCursorMessage): 'user' | 'assistant' | null {
    if (msg.role === 'user' || msg.role === 'assistant') {
      return msg.role;
    }
    // Some versions use type numbers
    if (msg.type === 1 || msg.type === 'user') return 'user';
    if (msg.type === 2 || msg.type === 'assistant') return 'assistant';
    return null;
  }

  /**
   * Watch for database changes (for real-time updates)
   * Returns a file watcher that can be disposed
   *
   * IMPORTANT: SQLite with WAL mode writes to .wal and .shm files,
   * so we need to watch those as well as the main .vscdb file.
   * We also watch the entire directory for any changes.
   *
   * NOTE: Only available when running in VS Code extension context.
   * Returns null in standalone CLI mode.
   */
  watchForChanges(callback: () => void): { dispose(): void } | null {
    if (!vscode) {
      if (DEBUG_SESSION_READER) console.log('[Session Reader] File watching not available in standalone mode');
      return null;
    }

    if (!this.dbPath) {
      console.warn('[Session Reader] Cannot watch: database path not found');
      return null;
    }

    try {
      // Get the directory containing the database
      const dbDir = path.dirname(this.dbPath);

      // Watch the main database file AND WAL files (.vscdb, .vscdb-wal, .vscdb-shm)
      // Using a glob pattern to catch all SQLite-related file changes
      const watchPattern = new vscode.RelativePattern(dbDir, '*.vscdb*');
      const watcher = vscode.workspace.createFileSystemWatcher(watchPattern);

      const handleChange = (uri: { fsPath: string }) => {
        if (DEBUG_SESSION_READER) console.log('[Session Reader] Database file changed:', uri.fsPath);
        // Schedule a debounced reconnect to pick up changes
        this.scheduleReconnect();
        // Callback will be invoked after successful reconnect
        setTimeout(() => callback(), RECONNECT_DEBOUNCE_MS + 100);
      };

      watcher.onDidChange(handleChange);
      watcher.onDidCreate(handleChange);

      if (DEBUG_SESSION_READER) console.log('[Session Reader] Watching database and WAL files for changes in:', dbDir);
      return watcher;
    } catch (error) {
      console.error('[Session Reader] Failed to create watcher:', error);
      return null;
    }
  }

  /**
   * Schedule a reconnect with debouncing to prevent rapid re-reads
   */
  private scheduleReconnect(): void {
    // Clear any pending reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Check if we recently reconnected
    const now = Date.now();
    if (now - this.lastReconnectTime < RECONNECT_DEBOUNCE_MS) {
      if (DEBUG_SESSION_READER) console.log('[Session Reader] Reconnect debounced (too soon)');
      return;
    }

    // Schedule reconnect after debounce delay
    this.reconnectTimeout = setTimeout(() => {
      this.reconnect();
    }, RECONNECT_DEBOUNCE_MS);
  }

  /**
   * Reconnect to the database
   * Useful after database changes to pick up new data
   * Includes debouncing and better memory management
   */
  private async reconnect(): Promise<void> {
    // Prevent concurrent reconnections
    if (this.isReconnecting) {
      if (DEBUG_SESSION_READER) console.log('[Session Reader] Reconnect already in progress');
      return;
    }

    this.isReconnecting = true;
    this.lastReconnectTime = Date.now();

    try {
      // Close existing database and release memory
      if (this.db) {
        try {
          this.db.close();
        } catch {
          // Ignore close errors
        }
        this.db = null;
      }

      // Verify file exists and check size
      if (!this.dbPath) {
        if (DEBUG_SESSION_READER) console.warn('[Session Reader] No database path set');
        return;
      }

      let stats;
      try {
        stats = await fs.stat(this.dbPath);
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === 'ENOENT') {
          console.warn('[Session Reader] Database file not found during reconnect');
          return;
        }
        throw statError;
      }

      // Check if file size exceeds limit
      if (stats.size > MAX_DB_FILE_SIZE) {
        console.warn(`[Session Reader] Database file too large for reconnect: ${Math.round(stats.size / 1024 / 1024)}MB`);
        return;
      }

      this.dbFileSize = stats.size;

      if (this.sqlInstance) {
        // Read database file with error handling
        let dbBuffer: Buffer;
        try {
          dbBuffer = await fs.readFile(this.dbPath);
        } catch (readError) {
          const errno = (readError as NodeJS.ErrnoException).code;
          if (errno === 'EBUSY' || errno === 'EPERM' || errno === 'EACCES') {
            console.warn(`[Session Reader] Database file is locked (${errno}), will retry later`);
            return;
          }
          throw readError;
        }

        this.db = new this.sqlInstance.Database(dbBuffer);
        if (DEBUG_SESSION_READER) console.log('[Session Reader] Reconnected to database');
      } else if (this.dbPath) {
        // Re-initialize if SQL instance is lost
        if (DEBUG_SESSION_READER) console.log('[Session Reader] Re-initializing SQL instance...');
        await this.initialize();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Handle memory allocation errors specifically
      if (errorMsg.includes('allocation failed') || errorMsg.includes('out of memory')) {
        console.error('[Session Reader] Memory allocation failed during reconnect. Database may be too large.');
      } else {
        console.error('[Session Reader] Failed to reconnect:', error);
      }

      this.db = null;
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * Close database connection and clean up resources
   */
  dispose(): void {
    // Clear any pending reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.db) {
      try {
        this.db.close();
      } catch (error) {
        // Ignore close errors during dispose
      }
      this.db = null;
      if (DEBUG_SESSION_READER) console.log('[Session Reader] Database connection closed');
    }

    // Clear SQL instance to free WASM memory
    this.sqlInstance = null;
    this.isReconnecting = false;
  }

  /**
   * Check if reader is ready
   */
  isReady(): boolean {
    return this.db !== null;
  }
}
