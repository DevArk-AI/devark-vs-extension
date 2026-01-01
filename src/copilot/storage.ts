/**
 * Storage Manager for Co-Pilot
 *
 * Hybrid storage approach:
 * - Uses ExtensionContext.globalState for metadata (session list, settings)
 * - Uses filesystem for analysis JSON files (like CLI)
 * - Maintains in-memory cache for recent analyses
 *
 * Pattern adapted from vibe-log-cli/src/lib/prompt-analyzer.ts
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  PromptAnalysis,
  CursorSession,
  CoPilotSettings,
  DEFAULT_COPILOT_SETTINGS
} from '../cursor-integration/types';
import type { CoachingData } from '../services/types/coaching-types';

/**
 * Storage keys for ExtensionContext.globalState
 */
const STORAGE_KEYS = {
  SESSIONS: 'copilot.sessions',
  SETTINGS: 'copilot.settings',
  LAST_CLEANUP: 'copilot.lastCleanup',
  COACHING: 'copilot.coaching'
} as const;

/**
 * Storage Manager
 */
export class CoPilotStorageManager {
  private context: vscode.ExtensionContext;
  private analysisDir: string;
  private coachingDir: string;
  private cache: Map<string, PromptAnalysis>; // In-memory cache for recent analyses
  private coachingCache: Map<string, CoachingData>; // In-memory cache for coaching data
  private readonly MAX_CACHE_SIZE = 50;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.analysisDir = path.join(
      context.globalStorageUri.fsPath,
      'analyses'
    );
    this.coachingDir = path.join(
      context.globalStorageUri.fsPath,
      'coaching'
    );
    this.cache = new Map();
    this.coachingCache = new Map();
  }

  /**
   * Initialize storage (create directories, load cache)
   */
  async initialize(): Promise<void> {
    try {
      // Ensure analysis directory exists
      await fs.mkdir(this.analysisDir, { recursive: true });

      // Ensure coaching directory exists
      await fs.mkdir(this.coachingDir, { recursive: true });

      // Run cleanup on first init of the day
      await this.cleanupIfNeeded();

      console.log('[CoPilot Storage] Initialized:', this.analysisDir, this.coachingDir);
    } catch (error) {
      console.error('[CoPilot Storage] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * ANALYSES
   */

  /**
   * Save analysis to filesystem and cache
   */
  async saveAnalysis(analysis: PromptAnalysis): Promise<void> {
    try {
      const filename = `${analysis.id}.json`;
      const filepath = path.join(this.analysisDir, filename);

      // Save to filesystem
      await fs.writeFile(
        filepath,
        JSON.stringify(analysis, null, 2),
        'utf8'
      );

      // Add to cache
      this.cache.set(analysis.id, analysis);

      // Trim cache if needed
      if (this.cache.size > this.MAX_CACHE_SIZE) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
          this.cache.delete(firstKey);
        }
      }

      console.log('[CoPilot Storage] Analysis saved:', analysis.id);
    } catch (error) {
      console.error('[CoPilot Storage] Failed to save analysis:', error);
      throw error;
    }
  }

  /**
   * Load analysis by ID (checks cache first, then filesystem)
   */
  async loadAnalysis(id: string): Promise<PromptAnalysis | null> {
    try {
      // Check cache first
      if (this.cache.has(id)) {
        console.log('[CoPilot Storage] Analysis found in cache:', id);
        return this.cache.get(id)!;
      }

      // Load from filesystem
      const filename = `${id}.json`;
      const filepath = path.join(this.analysisDir, filename);

      const content = await fs.readFile(filepath, 'utf8');
      const analysis = JSON.parse(content) as PromptAnalysis;

      // Add to cache
      this.cache.set(id, analysis);

      console.log('[CoPilot Storage] Analysis loaded from disk:', id);
      return analysis;
    } catch {
      console.log('[CoPilot Storage] Analysis not found:', id);
      return null;
    }
  }

  /**
   * Get recent analyses (from cache and/or filesystem)
   */
  async getRecentAnalyses(limit: number = 10): Promise<PromptAnalysis[]> {
    try {
      const files = await fs.readdir(this.analysisDir);

      // Filter JSON files and sort by modified time (most recent first)
      const jsonFiles = files
        .filter(f => f.endsWith('.json'))
        .map(f => path.join(this.analysisDir, f));

      // Get file stats and sort
      const filesWithStats = await Promise.all(
        jsonFiles.map(async f => ({
          path: f,
          mtime: (await fs.stat(f)).mtime
        }))
      );

      filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Load the most recent files up to limit
      const recentFiles = filesWithStats.slice(0, limit);
      const analyses: PromptAnalysis[] = [];

      for (const { path: filepath } of recentFiles) {
        try {
          const content = await fs.readFile(filepath, 'utf8');
          const analysis = JSON.parse(content) as PromptAnalysis;
          analyses.push(analysis);

          // Add to cache
          if (!this.cache.has(analysis.id)) {
            this.cache.set(analysis.id, analysis);
          }
        } catch (error) {
          console.error('[CoPilot Storage] Failed to load analysis file:', filepath, error);
        }
      }

      return analyses;
    } catch (error) {
      console.error('[CoPilot Storage] Failed to get recent analyses:', error);
      return [];
    }
  }

  /**
   * Delete analysis by ID
   */
  async deleteAnalysis(id: string): Promise<void> {
    try {
      const filename = `${id}.json`;
      const filepath = path.join(this.analysisDir, filename);

      await fs.unlink(filepath);
      this.cache.delete(id);

      console.log('[CoPilot Storage] Analysis deleted:', id);
    } catch (error) {
      console.error('[CoPilot Storage] Failed to delete analysis:', error);
    }
  }

  /**
   * COACHING
   */

  /**
   * Save coaching data to filesystem and cache
   */
  async saveCoaching(coaching: CoachingData): Promise<void> {
    try {
      // Use promptId as filename, fallback to responseId or timestamp
      const id = coaching.promptId || coaching.responseId || `coaching-${Date.now()}`;
      const filename = `${id}.json`;
      const filepath = path.join(this.coachingDir, filename);

      // Save to filesystem
      await fs.writeFile(
        filepath,
        JSON.stringify(coaching, null, 2),
        'utf8'
      );

      // Add to cache
      this.coachingCache.set(id, coaching);

      // Trim cache if needed
      if (this.coachingCache.size > this.MAX_CACHE_SIZE) {
        const firstKey = this.coachingCache.keys().next().value;
        if (firstKey !== undefined) {
          this.coachingCache.delete(firstKey);
        }
      }

      console.log('[CoPilot Storage] Coaching saved:', id);
    } catch (error) {
      console.error('[CoPilot Storage] Failed to save coaching:', error);
      throw error;
    }
  }

  /**
   * Load coaching data by promptId (checks cache first, then filesystem)
   */
  async loadCoaching(promptId: string): Promise<CoachingData | null> {
    try {
      // Check cache first
      if (this.coachingCache.has(promptId)) {
        console.log('[CoPilot Storage] Coaching found in cache:', promptId);
        return this.coachingCache.get(promptId)!;
      }

      // Load from filesystem
      const filename = `${promptId}.json`;
      const filepath = path.join(this.coachingDir, filename);

      const content = await fs.readFile(filepath, 'utf8');
      const coaching = JSON.parse(content) as CoachingData;

      // Restore Date objects
      coaching.timestamp = new Date(coaching.timestamp);

      // Add to cache
      this.coachingCache.set(promptId, coaching);

      console.log('[CoPilot Storage] Coaching loaded from disk:', promptId);
      return coaching;
    } catch {
      console.log('[CoPilot Storage] Coaching not found:', promptId);
      return null;
    }
  }

  /**
   * Get recent coaching entries (from cache and/or filesystem)
   */
  async getRecentCoaching(limit: number = 10): Promise<CoachingData[]> {
    try {
      const files = await fs.readdir(this.coachingDir);

      // Filter JSON files and sort by modified time (most recent first)
      const jsonFiles = files
        .filter(f => f.endsWith('.json'))
        .map(f => path.join(this.coachingDir, f));

      // Get file stats and sort
      const filesWithStats = await Promise.all(
        jsonFiles.map(async f => ({
          path: f,
          mtime: (await fs.stat(f)).mtime
        }))
      );

      filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Load the most recent files up to limit
      const recentFiles = filesWithStats.slice(0, limit);
      const coachingData: CoachingData[] = [];

      for (const { path: filepath } of recentFiles) {
        try {
          const content = await fs.readFile(filepath, 'utf8');
          const coaching = JSON.parse(content) as CoachingData;

          // Restore Date objects
          coaching.timestamp = new Date(coaching.timestamp);

          coachingData.push(coaching);

          // Add to cache
          const id = coaching.promptId || coaching.responseId || path.basename(filepath, '.json');
          if (!this.coachingCache.has(id)) {
            this.coachingCache.set(id, coaching);
          }
        } catch (error) {
          console.error('[CoPilot Storage] Failed to load coaching file:', filepath, error);
        }
      }

      return coachingData;
    } catch (error) {
      console.error('[CoPilot Storage] Failed to get recent coaching:', error);
      return [];
    }
  }

  /**
   * Delete coaching data by promptId
   */
  async deleteCoaching(promptId: string): Promise<void> {
    try {
      const filename = `${promptId}.json`;
      const filepath = path.join(this.coachingDir, filename);

      await fs.unlink(filepath);
      this.coachingCache.delete(promptId);

      console.log('[CoPilot Storage] Coaching deleted:', promptId);
    } catch (error) {
      console.error('[CoPilot Storage] Failed to delete coaching:', error);
    }
  }

  /**
   * SESSIONS
   */

  /**
   * Get all sessions from globalState
   */
  getSessions(): CursorSession[] {
    return this.context.globalState.get<CursorSession[]>(STORAGE_KEYS.SESSIONS, []);
  }

  /**
   * Save sessions to globalState
   */
  async saveSessions(sessions: CursorSession[]): Promise<void> {
    await this.context.globalState.update(STORAGE_KEYS.SESSIONS, sessions);
    console.log('[CoPilot Storage] Sessions saved:', sessions.length);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): CursorSession | null {
    const sessions = this.getSessions();
    return sessions.find(s => s.sessionId === sessionId) || null;
  }

  /**
   * Add or update a session
   */
  async upsertSession(session: CursorSession): Promise<void> {
    const sessions = this.getSessions();
    const index = sessions.findIndex(s => s.sessionId === session.sessionId);

    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }

    await this.saveSessions(sessions);
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const sessions = this.getSessions();
    const filtered = sessions.filter(s => s.sessionId !== sessionId);
    await this.saveSessions(filtered);
  }

  /**
   * SETTINGS
   */

  /**
   * Get settings from globalState
   */
  getSettings(): CoPilotSettings {
    return this.context.globalState.get<CoPilotSettings>(
      STORAGE_KEYS.SETTINGS,
      DEFAULT_COPILOT_SETTINGS
    );
  }

  /**
   * Save settings to globalState
   */
  async saveSettings(settings: CoPilotSettings): Promise<void> {
    await this.context.globalState.update(STORAGE_KEYS.SETTINGS, settings);
    console.log('[CoPilot Storage] Settings saved:', settings);
  }

  /**
   * Update partial settings
   */
  async updateSettings(partial: Partial<CoPilotSettings>): Promise<CoPilotSettings> {
    const current = this.getSettings();
    const updated = { ...current, ...partial };
    await this.saveSettings(updated);
    return updated;
  }

  /**
   * CLEANUP
   */

  /**
   * Clean up old analysis and coaching files (older than specified days)
   */
  async cleanup(olderThanDays: number = 7): Promise<number> {
    try {
      const now = Date.now();
      const threshold = olderThanDays * 24 * 60 * 60 * 1000;
      let deletedCount = 0;

      // Clean up analysis files
      const analysisFiles = await fs.readdir(this.analysisDir);
      for (const file of analysisFiles) {
        if (!file.endsWith('.json')) continue;

        const filepath = path.join(this.analysisDir, file);
        const stats = await fs.stat(filepath);

        if (now - stats.mtime.getTime() > threshold) {
          await fs.unlink(filepath);
          deletedCount++;

          // Remove from cache if present
          const id = file.replace('.json', '');
          this.cache.delete(id);
        }
      }

      // Clean up coaching files
      const coachingFiles = await fs.readdir(this.coachingDir);
      for (const file of coachingFiles) {
        if (!file.endsWith('.json')) continue;

        const filepath = path.join(this.coachingDir, file);
        const stats = await fs.stat(filepath);

        if (now - stats.mtime.getTime() > threshold) {
          await fs.unlink(filepath);
          deletedCount++;

          // Remove from cache if present
          const id = file.replace('.json', '');
          this.coachingCache.delete(id);
        }
      }

      console.log(`[CoPilot Storage] Cleanup: deleted ${deletedCount} old files`);
      await this.context.globalState.update(STORAGE_KEYS.LAST_CLEANUP, new Date().toISOString());

      return deletedCount;
    } catch (error) {
      console.error('[CoPilot Storage] Cleanup failed:', error);
      return 0;
    }
  }

  /**
   * Run cleanup if it hasn't been run today
   */
  private async cleanupIfNeeded(): Promise<void> {
    const lastCleanup = this.context.globalState.get<string>(STORAGE_KEYS.LAST_CLEANUP);

    if (!lastCleanup) {
      // First time, run cleanup
      await this.cleanup();
      return;
    }

    const lastDate = new Date(lastCleanup);
    const today = new Date();

    // Run cleanup if last cleanup was on a different day
    if (
      lastDate.getFullYear() !== today.getFullYear() ||
      lastDate.getMonth() !== today.getMonth() ||
      lastDate.getDate() !== today.getDate()
    ) {
      await this.cleanup();
    }
  }

  /**
   * Clear all data (for testing/debugging)
   */
  async clearAll(): Promise<void> {
    try {
      // Clear caches
      this.cache.clear();
      this.coachingCache.clear();

      // Delete all analysis files
      const analysisFiles = await fs.readdir(this.analysisDir);
      for (const file of analysisFiles) {
        await fs.unlink(path.join(this.analysisDir, file));
      }

      // Delete all coaching files
      const coachingFiles = await fs.readdir(this.coachingDir);
      for (const file of coachingFiles) {
        await fs.unlink(path.join(this.coachingDir, file));
      }

      // Clear globalState
      await this.context.globalState.update(STORAGE_KEYS.SESSIONS, []);
      await this.context.globalState.update(STORAGE_KEYS.SETTINGS, DEFAULT_COPILOT_SETTINGS);
      await this.context.globalState.update(STORAGE_KEYS.LAST_CLEANUP, null);

      console.log('[CoPilot Storage] All data cleared');
    } catch (error) {
      console.error('[CoPilot Storage] Failed to clear data:', error);
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalAnalyses: number;
    cachedAnalyses: number;
    totalCoaching: number;
    cachedCoaching: number;
    totalSessions: number;
    storageSize: number; // bytes
  }> {
    try {
      let totalSize = 0;

      // Count analysis files
      const analysisFiles = await fs.readdir(this.analysisDir);
      const analysisJsonFiles = analysisFiles.filter(f => f.endsWith('.json'));
      for (const file of analysisJsonFiles) {
        const stats = await fs.stat(path.join(this.analysisDir, file));
        totalSize += stats.size;
      }

      // Count coaching files
      const coachingFiles = await fs.readdir(this.coachingDir);
      const coachingJsonFiles = coachingFiles.filter(f => f.endsWith('.json'));
      for (const file of coachingJsonFiles) {
        const stats = await fs.stat(path.join(this.coachingDir, file));
        totalSize += stats.size;
      }

      return {
        totalAnalyses: analysisJsonFiles.length,
        cachedAnalyses: this.cache.size,
        totalCoaching: coachingJsonFiles.length,
        cachedCoaching: this.coachingCache.size,
        totalSessions: this.getSessions().length,
        storageSize: totalSize
      };
    } catch (error) {
      console.error('[CoPilot Storage] Failed to get stats:', error);
      return {
        totalAnalyses: 0,
        cachedAnalyses: 0,
        totalCoaching: 0,
        cachedCoaching: 0,
        totalSessions: 0,
        storageSize: 0
      };
    }
  }
}
