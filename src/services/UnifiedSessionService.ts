/**
 * Unified Session Service
 *
 * Provides a unified view of sessions from both Cursor Composer and Claude Code.
 * This service:
 * - Fetches sessions from Cursor's SQLite database (state.vscdb)
 * - Fetches sessions from Claude Code local files (~/.claude/sessions/)
 * - Normalizes both to a common UnifiedSession format
 * - Provides filtering by date range and source
 * - Tracks session source for analytics display
 */

import { CursorSession } from '../cursor-integration/types';
import type { ConversationHighlights, SessionIndex, SessionDetails, TokenUsageData } from '../types';
import { SessionData } from '../types/session.types';
import type { CursorSessionReader } from '../cursor-integration/session-reader';
import { ClaudeSessionReader } from '../adapters/readers/claude-session-reader';
import { NodeFileSystem } from '../adapters/readers/node-filesystem';
import { shouldIgnorePath } from '../adapters/prompt-detection/ignore-paths';
import { countActualUserPrompts } from '../core/session/prompt-utils';

// Re-export SessionSource from shared for backwards compatibility
export type { SessionSource } from '../shared/webview-protocol';
import type { SessionSource } from '../shared/webview-protocol';

// Set to true to enable verbose logging for debugging
const DEBUG_UNIFIED_SESSION = false;

// Cache configuration
const CACHE_TTL_MS = 30000; // 30 seconds - matches sync status cache TTL
const INDEX_CACHE_TTL_MS = 60000; // 60 seconds - index is lightweight, can be cached longer

// ============================================================================
// Types
// ============================================================================

/**
 * Business outcome category for session analysis
 */
export type BusinessCategory = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test' | 'research' | 'other';

/**
 * Business context extracted from session analysis
 */
export interface BusinessContext {
  /** What was the developer trying to accomplish? */
  objective?: string;
  /** What was the outcome? (completed/in-progress/blocked) */
  outcome?: string;
  /** Category of work */
  category?: BusinessCategory;
}

/**
 * Unified session format that works with both Cursor and Claude Code sessions
 */
export interface UnifiedSession {
  /** Unique identifier (prefixed with source: cursor-xxx or claude-xxx) */
  id: string;
  /** Session source for tracking and display */
  source: SessionSource;
  /** Project/workspace name */
  workspaceName: string;
  /** Full path to workspace */
  workspacePath?: string;
  /** When session started */
  startTime: Date;
  /** When session ended or last activity */
  endTime: Date;
  /** Duration in minutes */
  duration: number;
  /** Number of prompts/messages in session */
  promptCount: number;
  /** Files mentioned or edited in session */
  fileContext: string[];
  /** Session status */
  status: 'active' | 'historical';
  /** Business context (populated by AI analysis) */
  businessContext?: BusinessContext;
  /** Extracted conversation highlights for summarization */
  highlights?: ConversationHighlights;
  /** Token usage data for context window tracking */
  tokenUsage?: TokenUsageData;
  /** Original session data (for debugging) */
  rawData?: CursorSession | SessionData;
}

/**
 * Filter options for fetching unified sessions
 */
export interface UnifiedSessionFilters {
  /** Start date (inclusive) */
  since?: Date;
  /** End date (inclusive) */
  until?: Date;
  /** Filter by specific sources */
  sources?: SessionSource[];
  /** Maximum number of sessions to return */
  limit?: number;
  /** Minimum prompt count (default: 1 to exclude empty sessions) */
  minPromptCount?: number;
}

/**
 * Session count breakdown by source
 */
export interface SessionsBySource {
  cursor: number;
  claudeCode: number;
  total: number;
}

/**
 * Result from unified session fetch
 */
export interface UnifiedSessionResult {
  sessions: UnifiedSession[];
  bySource: SessionsBySource;
  dateRange: {
    start: Date;
    end: Date;
  };
}

// ============================================================================
// Service
// ============================================================================

/**
 * Cache entry for unified sessions
 */
interface SessionCache {
  result: UnifiedSessionResult;
  timestamp: number;
  filters: string; // Serialized filters for cache key
}

/**
 * Cache entry for session index (lightweight)
 */
interface IndexCache {
  data: SessionIndex[];
  timestamp: number;
  filters: string;
}

/**
 * Service that provides unified access to sessions from multiple sources
 */
export class UnifiedSessionService {
  private cursorReader: CursorSessionReader | null = null;
  private claudeReader: ClaudeSessionReader | null = null;
  private cache: Map<string, SessionCache> = new Map();
  private indexCache: Map<string, IndexCache> = new Map();

  /**
   * Initialize with session readers
   */
  initialize(cursorReader: CursorSessionReader): void {
    this.cursorReader = cursorReader;
    // Create Claude reader with NodeFileSystem adapter
    this.claudeReader = new ClaudeSessionReader(new NodeFileSystem());
    if (DEBUG_UNIFIED_SESSION) console.log('[UnifiedSessionService] Initialized with Cursor and Claude readers');
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.cursorReader !== null;
  }

  /**
   * Create cache key from filters
   */
  private getCacheKey(filters: UnifiedSessionFilters): string {
    const until = filters.until || new Date();
    const since = filters.since || new Date(until.getTime() - 24 * 60 * 60 * 1000);
    const sources = (filters.sources || ['cursor', 'claude_code']).sort().join(',');
    const limit = filters.limit || 'none';
    return `${since.getTime()}-${until.getTime()}-${sources}-${limit}`;
  }

  /**
   * Get cached result if valid
   */
  private getCachedResult(filters: UnifiedSessionFilters): UnifiedSessionResult | null {
    const key = this.getCacheKey(filters);
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    if (DEBUG_UNIFIED_SESSION) {
      console.log(`[UnifiedSessionService] Cache HIT for key: ${key}`);
    }
    return cached.result;
  }

  /**
   * Store result in cache
   */
  private setCachedResult(filters: UnifiedSessionFilters, result: UnifiedSessionResult): void {
    const key = this.getCacheKey(filters);
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      filters: key
    });
    if (DEBUG_UNIFIED_SESSION) {
      console.log(`[UnifiedSessionService] Cached result for key: ${key}`);
    }
  }

  /**
   * Invalidate all cached sessions
   */
  public invalidateCache(): void {
    this.cache.clear();
    this.indexCache.clear();
    if (DEBUG_UNIFIED_SESSION) {
      console.log('[UnifiedSessionService] Cache invalidated');
    }
  }

  /**
   * Fetch unified sessions from all available sources
   */
  async getUnifiedSessions(filters: UnifiedSessionFilters = {}): Promise<UnifiedSessionResult> {
    // Check cache first
    const cached = this.getCachedResult(filters);
    if (cached) {
      return cached;
    }

    const sources = filters.sources || ['cursor', 'claude_code'];
    const until = filters.until || new Date();
    const since = filters.since || new Date(until.getTime() - 24 * 60 * 60 * 1000); // Default: last 24 hours

    if (DEBUG_UNIFIED_SESSION) {
      console.log(`[UnifiedSessionService] Cache MISS - Fetching sessions from ${sources.join(', ')}`);
      console.log(`[UnifiedSessionService] Date range: ${since.toISOString()} to ${until.toISOString()}`);
    }

    const allSessions: UnifiedSession[] = [];
    let cursorCount = 0;
    let claudeCount = 0;

    // Fetch from Cursor (parallel-safe)
    if (sources.includes('cursor')) {
      try {
        const cursorSessions = await this.getCursorSessions(since, until);
        allSessions.push(...cursorSessions);
        cursorCount = cursorSessions.length;
        if (DEBUG_UNIFIED_SESSION) console.log(`[UnifiedSessionService] Found ${cursorCount} Cursor sessions`);
      } catch (error) {
        console.error('[UnifiedSessionService] Failed to fetch Cursor sessions:', error);
      }
    }

    // Fetch from Claude Code (parallel-safe)
    if (sources.includes('claude_code')) {
      try {
        const claudeSessions = await this.getClaudeSessions(since, until);
        allSessions.push(...claudeSessions);
        claudeCount = claudeSessions.length;
        if (DEBUG_UNIFIED_SESSION) console.log(`[UnifiedSessionService] Found ${claudeCount} Claude Code sessions`);
      } catch (error) {
        console.error('[UnifiedSessionService] Failed to fetch Claude Code sessions:', error);
      }
    }

    // Filter by minimum prompt count (default: 1 to exclude empty sessions)
    const minPromptCount = filters.minPromptCount ?? 1;
    const filteredSessions = allSessions.filter(s => s.promptCount >= minPromptCount);

    // Update counts after filtering
    cursorCount = filteredSessions.filter(s => s.source === 'cursor').length;
    claudeCount = filteredSessions.filter(s => s.source === 'claude_code').length;

    // Sort by start time (most recent first)
    filteredSessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    // Apply limit if specified
    const limitedSessions = filters.limit ? filteredSessions.slice(0, filters.limit) : filteredSessions;

    if (DEBUG_UNIFIED_SESSION) console.log(`[UnifiedSessionService] Total unified sessions: ${limitedSessions.length} (Cursor: ${cursorCount}, Claude: ${claudeCount}, minPromptCount: ${minPromptCount})`);

    const result: UnifiedSessionResult = {
      sessions: limitedSessions,
      bySource: {
        cursor: cursorCount,
        claudeCode: claudeCount,
        total: cursorCount + claudeCount
      },
      dateRange: { start: since, end: until }
    };

    // Cache the result
    this.setCachedResult(filters, result);

    return result;
  }

  /**
   * Get sessions for today from all sources
   */
  async getTodaySessions(): Promise<UnifiedSessionResult> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.getUnifiedSessions({
      since: today,
      until: new Date()
    });
  }

  /**
   * Get sessions for the last N days from all sources
   */
  async getSessionsForDays(days: number): Promise<UnifiedSessionResult> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    return this.getUnifiedSessions({
      since: startDate,
      until: endDate
    });
  }

  /**
   * Get unified sessions for a specific date range
   */
  async getSessionsForDateRange(startDate: Date, endDate: Date): Promise<UnifiedSessionResult> {
    // Normalize dates to start and end of day
    const normalizedStart = new Date(startDate);
    normalizedStart.setHours(0, 0, 0, 0);

    const normalizedEnd = new Date(endDate);
    normalizedEnd.setHours(23, 59, 59, 999);

    return this.getUnifiedSessions({
      since: normalizedStart,
      until: normalizedEnd
    });
  }

  // ========================================
  // INDEX METHODS (Lightweight, Fast)
  // ========================================

  /**
   * Get lightweight session index from all sources.
   * Much faster than getUnifiedSessions() - only loads metadata, not messages.
   * Use this for counting, filtering, and list display.
   */
  async getSessionIndex(filters: UnifiedSessionFilters = {}): Promise<SessionIndex[]> {
    // Check index cache first
    const cacheKey = this.getIndexCacheKey(filters);
    const cached = this.indexCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < INDEX_CACHE_TTL_MS) {
      if (DEBUG_UNIFIED_SESSION) {
        console.log(`[UnifiedSessionService] Index cache HIT for key: ${cacheKey}`);
      }
      return cached.data;
    }

    const sources = filters.sources || ['cursor', 'claude_code'];
    const until = filters.until || new Date();
    const since = filters.since || new Date(until.getTime() - 24 * 60 * 60 * 1000);

    if (DEBUG_UNIFIED_SESSION) {
      console.log(`[UnifiedSessionService] Index cache MISS - Fetching index from ${sources.join(', ')}`);
    }

    const allIndices: SessionIndex[] = [];

    // Fetch from Cursor
    if (sources.includes('cursor') && this.cursorReader) {
      try {
        if (!this.cursorReader.isReady()) {
          await this.cursorReader.initialize();
        }
        const cursorIndex = this.cursorReader.getSessionIndex();

        // Filter by date range
        const filtered = cursorIndex.filter(s => {
          return s.timestamp >= since && s.timestamp <= until;
        });

        // Filter out ignored paths
        const valid = filtered.filter(s => !shouldIgnorePath(s.projectPath));

        // Add cursor- prefix to IDs
        valid.forEach(s => {
          s.id = `cursor-${s.id}`;
        });

        allIndices.push(...valid);
      } catch (error) {
        console.error('[UnifiedSessionService] Error fetching Cursor session index:', error);
      }
    }

    // Fetch from Claude Code
    if (sources.includes('claude_code') && this.claudeReader) {
      try {
        const available = await this.claudeReader.isAvailable();
        if (available) {
          const claudeIndex = await this.claudeReader.readSessionIndex({ since });

          // Filter by date range (Claude reader already applies since filter)
          const filtered = claudeIndex.filter(s => {
            return s.timestamp >= since && s.timestamp <= until;
          });

          // Filter out ignored paths
          const valid = filtered.filter(s => !shouldIgnorePath(s.projectPath));

          // Add claude- prefix to IDs
          valid.forEach(s => {
            s.id = `claude-${s.id}`;
          });

          allIndices.push(...valid);
        }
      } catch (error) {
        if (!this.isFileLockError(error)) {
          console.error('[UnifiedSessionService] Error fetching Claude session index:', error);
        }
      }
    }

    // Filter by minimum prompt count (default: 1 to exclude empty sessions)
    const minPromptCount = filters.minPromptCount ?? 1;
    const filteredIndices = allIndices.filter(s => s.promptCount >= minPromptCount);

    // Sort by timestamp (most recent first)
    filteredIndices.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply limit if specified
    const result = filters.limit ? filteredIndices.slice(0, filters.limit) : filteredIndices;

    // Cache the result
    this.indexCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
      filters: cacheKey,
    });

    if (DEBUG_UNIFIED_SESSION) {
      console.log(`[UnifiedSessionService] Index query returned ${result.length} sessions`);
    }

    return result;
  }

  /**
   * Get count of eligible sessions (>= minDurationSeconds).
   * Fast method that uses index for counting without loading full session data.
   */
  async getEligibleSessionCount(minDurationSeconds = 240): Promise<number> {
    const index = await this.getSessionIndex();
    return index.filter(s => s.duration >= minDurationSeconds).length;
  }

  /**
   * Get session details on-demand for a specific session.
   * Use this when you need messages/highlights for a single session.
   * @param id Session ID with source prefix (cursor-xxx or claude-xxx)
   */
  async getSessionDetails(id: string): Promise<SessionDetails | null> {
    // Parse source from id prefix: "cursor-xxx" or "claude-xxx"
    const [source, actualId] = this.parseSessionId(id);

    if (source === 'cursor' && this.cursorReader) {
      try {
        if (!this.cursorReader.isReady()) {
          await this.cursorReader.initialize();
        }
        return this.cursorReader.getSessionDetails(actualId);
      } catch (error) {
        console.error('[UnifiedSessionService] Error fetching Cursor session details:', error);
        return null;
      }
    } else if (source === 'claude_code' && this.claudeReader) {
      try {
        return await this.claudeReader.getSessionDetails(actualId);
      } catch (error) {
        console.error('[UnifiedSessionService] Error fetching Claude session details:', error);
        return null;
      }
    }

    return null;
  }

  /**
   * Parse session ID to extract source and actual ID.
   * IDs are prefixed: "cursor-xxx" or "claude-xxx"
   */
  private parseSessionId(id: string): [SessionSource | null, string] {
    if (id.startsWith('cursor-')) {
      return ['cursor', id.substring(7)];
    } else if (id.startsWith('claude-')) {
      return ['claude_code', id.substring(7)];
    }
    return [null, id];
  }

  /**
   * Get cache key for index queries
   */
  private getIndexCacheKey(filters: UnifiedSessionFilters): string {
    const until = filters.until || new Date();
    const since = filters.since || new Date(until.getTime() - 24 * 60 * 60 * 1000);
    const sources = (filters.sources || ['cursor', 'claude_code']).sort().join(',');
    const limit = filters.limit || 'none';
    const minPromptCount = filters.minPromptCount ?? 1;
    return `index-${since.getTime()}-${until.getTime()}-${sources}-${limit}-minPrompts${minPromptCount}`;
  }

  // ========================================
  // PRIVATE: Source-specific fetchers
  // ========================================

  /**
   * Fetch and normalize Cursor sessions
   */
  private async getCursorSessions(since: Date, until: Date): Promise<UnifiedSession[]> {
    if (!this.cursorReader) {
      if (DEBUG_UNIFIED_SESSION) console.warn('[UnifiedSessionService] Cursor reader not initialized');
      return [];
    }

    try {
      // Ensure reader is ready
      if (!this.cursorReader.isReady()) {
        if (DEBUG_UNIFIED_SESSION) console.log('[UnifiedSessionService] Initializing Cursor session reader...');
        const initialized = await this.cursorReader.initialize();
        if (!initialized) {
          console.warn('[UnifiedSessionService] Failed to initialize Cursor reader');
          return [];
        }
      }

      // Get all Cursor sessions
      const allSessions = this.cursorReader.getActiveSessions();

      // Filter by date range
      const filteredSessions = allSessions.filter(session => {
        const sessionStart = new Date(session.startTime);
        return sessionStart >= since && sessionStart <= until;
      });

      // Filter out ignored paths (temp directories, IDE installations)
      const validSessions = filteredSessions.filter(session => {
        const shouldIgnore = shouldIgnorePath(session.workspacePath);
        if (shouldIgnore && DEBUG_UNIFIED_SESSION) {
          console.log('[UnifiedSessionService] Filtered Cursor session from ignored path:', session.workspacePath);
        }
        return !shouldIgnore;
      });

      // Normalize to unified format
      return validSessions.map(session => this.normalizeCursorSession(session));

    } catch (error) {
      console.error('[UnifiedSessionService] Error fetching Cursor sessions:', error);
      return [];
    }
  }

  /**
   * Fetch and normalize Claude Code sessions
   */
  private async getClaudeSessions(since: Date, until: Date): Promise<UnifiedSession[]> {
    if (!this.claudeReader) {
      if (DEBUG_UNIFIED_SESSION) console.warn('[UnifiedSessionService] Claude reader not initialized');
      return [];
    }

    try {
      // Check if Claude sessions are available
      const available = await this.claudeReader.isAvailable();
      if (!available) {
        if (DEBUG_UNIFIED_SESSION) console.log('[UnifiedSessionService] Claude projects directory not found');
        return [];
      }

      // Read Claude sessions from local files
      const result = await this.claudeReader.readSessions({
        since: since,
        limit: 1000
      });

      if (!result.sessions || result.sessions.length === 0) {
        return [];
      }

      // Filter by date range (since readSessions might not respect until)
      const filteredSessions = result.sessions.filter((session: SessionData) => {
        const sessionDate = new Date(session.timestamp);
        return sessionDate >= since && sessionDate <= until;
      });

      // Filter out ignored paths (temp directories, IDE installations)
      const validSessions = filteredSessions.filter((session: SessionData) => {
        const shouldIgnore = shouldIgnorePath(session.projectPath);
        if (shouldIgnore && DEBUG_UNIFIED_SESSION) {
          console.log('[UnifiedSessionService] Filtered Claude Code session from ignored path:', session.projectPath);
        }
        return !shouldIgnore;
      });

      // Normalize to unified format
      const normalized = validSessions.map((session: SessionData) => this.normalizeClaudeSession(session));

      // Debug: Log tokenUsage presence for first few sessions
      const sessionsWithTokenUsage = normalized.filter(s => s.tokenUsage);
      console.debug(`[UnifiedSessionService] Claude sessions: ${normalized.length} total, ${sessionsWithTokenUsage.length} with tokenUsage`);
      if (sessionsWithTokenUsage.length > 0) {
        const sample = sessionsWithTokenUsage[0];
        console.debug(`[UnifiedSessionService] Sample tokenUsage: contextUtil=${sample.tokenUsage?.contextUtilization}, total=${sample.tokenUsage?.totalTokens}`);
      }

      return normalized;

    } catch (error: unknown) {
      // Handle Claude file lock errors gracefully
      if (this.isFileLockError(error)) {
        console.warn('[UnifiedSessionService] Claude settings file locked, skipping Claude sessions');
        return [];
      }
      console.error('[UnifiedSessionService] Error fetching Claude sessions:', error);
      return [];
    }
  }

  // ========================================
  // PRIVATE: Normalization helpers
  // ========================================

  /**
   * Normalize a Cursor session to unified format
   */
  private normalizeCursorSession(cursor: CursorSession): UnifiedSession {
    const startTime = new Date(cursor.startTime);
    const endTime = new Date(cursor.lastActivity);
    const duration = Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 60000));

    return {
      id: `cursor-${cursor.sessionId}`,
      source: 'cursor',
      workspaceName: cursor.workspaceName || 'Unknown Workspace',
      workspacePath: cursor.workspacePath,
      startTime,
      endTime,
      duration,
      promptCount: cursor.promptCount || 0,
      fileContext: cursor.fileContext || [],
      status: cursor.status || 'historical',
      highlights: cursor.highlights,
      rawData: cursor
    };
  }

  /**
   * Normalize a Claude Code session to unified format
   */
  private normalizeClaudeSession(claude: SessionData): UnifiedSession {
    // Extract project name from path
    const projectName = claude.projectPath
      ? claude.projectPath.split(/[/\\]/).filter(Boolean).pop() || 'Unknown Project'
      : 'Unknown Project';

    // timestamp is already a Date in new type
    const startTime = claude.timestamp instanceof Date ? claude.timestamp : new Date(claude.timestamp);
    const durationMs = (claude.duration || 0) * 1000; // duration is in seconds
    const endTime = new Date(startTime.getTime() + durationMs);
    const durationMinutes = Math.floor(durationMs / 60000);

    // Use actual edited file paths, fall back to languages for display
    const fileContext: string[] = claude.metadata?.editedFiles || claude.metadata?.languages || [];

    // Count actual user prompts (not tool results or assistant messages)
    const promptCount = countActualUserPrompts(claude.messages || []);

    return {
      id: `claude-${claude.id}`,
      source: 'claude_code',
      workspaceName: projectName,
      workspacePath: claude.projectPath,
      startTime,
      endTime,
      duration: durationMinutes,
      promptCount,
      fileContext,
      status: 'historical',
      highlights: claude.highlights,  // Pass through conversation highlights
      tokenUsage: claude.tokenUsage,  // Pass through token usage for context tracking
      rawData: claude
    };
  }

  /**
   * Check if error is a file lock error (EBUSY)
   */
  private isFileLockError(error: any): boolean {
    if (!error) return false;
    const errorStr = error.message || error.toString() || '';
    return (
      errorStr.includes('EBUSY') ||
      errorStr.includes('resource busy or locked') ||
      error.code === 'EBUSY' ||
      error.errno === -16
    );
  }

  // ========================================
  // CONVERSION: For backward compatibility
  // ========================================

  /**
   * Convert unified sessions to CursorSession format
   * Used for backward compatibility with SummaryService
   */
  convertToCursorSessions(unified: UnifiedSession[]): CursorSession[] {
    return unified.map(session => ({
      sessionId: session.id,
      workspaceName: session.workspaceName,
      workspacePath: session.workspacePath,
      startTime: session.startTime,
      lastActivity: session.endTime,
      promptCount: session.promptCount,
      status: session.status,
      fileContext: session.fileContext,
      highlights: session.highlights
    }));
  }

  /**
   * Add source metadata to sessions for summary display
   */
  getSourceMetadata(unified: UnifiedSession[]): {
    sessionsBySource: SessionsBySource;
    sourceBreakdown: Array<{ source: SessionSource; count: number; percentage: number }>;
  } {
    const cursorCount = unified.filter(s => s.source === 'cursor').length;
    const claudeCount = unified.filter(s => s.source === 'claude_code').length;
    const total = unified.length;

    return {
      sessionsBySource: {
        cursor: cursorCount,
        claudeCode: claudeCount,
        total
      },
      sourceBreakdown: [
        {
          source: 'cursor',
          count: cursorCount,
          percentage: total > 0 ? Math.round((cursorCount / total) * 100) : 0
        },
        {
          source: 'claude_code',
          count: claudeCount,
          percentage: total > 0 ? Math.round((claudeCount / total) * 100) : 0
        }
      ]
    };
  }
}

// Export singleton instance
export const unifiedSessionService = new UnifiedSessionService();
