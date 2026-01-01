/**
 * PromptHistoryStore - Persistent Storage for Prompt Analysis History
 *
 * Uses VS Code's globalState for persistence across sessions.
 * Features:
 * - Max 100 prompts stored
 * - Auto-cleanup of prompts older than 30 days
 * - Daily statistics calculation
 * - Thread-safe operations
 */

import * as vscode from 'vscode';

// Import V2 score types for breakdown and explanation
import type { ScoreBreakdownV2, ScoreExplanationV2 } from '../services/types/score-types';
import type { SessionSource } from '../services/UnifiedSessionService';

export interface AnalyzedPrompt {
  id: string;
  text: string;
  truncatedText: string;
  score: number;
  timestamp: Date;
  categoryScores?: {
    clarity: number;
    specificity: number;
    context: number;
    actionability: number;
  };
  quickWins?: string[];
  improvedVersion?: string;
  improvedScore?: number;
  // V2 additions for 5-dimension scoring
  breakdown?: ScoreBreakdownV2;
  explanation?: ScoreExplanationV2;
  // Source metadata for "Use this prompt" injection
  source?: SessionSource;
  sessionId?: string;
}

// Serializable version for storage
interface SerializedPrompt extends Omit<AnalyzedPrompt, 'timestamp'> {
  timestamp: string; // ISO string
}

export interface DailyStats {
  analyzedToday: number;
  avgScore: number;
  lastResetDate: string; // ISO date string
}

export class PromptHistoryStore {
  private static readonly STORAGE_KEY = 'devark.promptHistory';
  private static readonly STATS_KEY = 'devark.dailyStats';
  private static readonly MAX_PROMPTS = 100;
  private static readonly MAX_AGE_DAYS = 30;

  private context: vscode.ExtensionContext;
  private cache: AnalyzedPrompt[] | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Initialize and load history from storage
   */
  public async initialize(): Promise<void> {
    await this.loadFromStorage();
    await this.cleanupOldPrompts();
    await this.checkAndResetDailyStats();
  }

  /**
   * Get all prompts from history
   */
  public getAll(): AnalyzedPrompt[] {
    return this.cache || [];
  }

  /**
   * Get prompts analyzed today
   */
  public getTodayPrompts(): AnalyzedPrompt[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.getAll().filter(prompt => {
      const promptDate = new Date(prompt.timestamp);
      promptDate.setHours(0, 0, 0, 0);
      return promptDate.getTime() === today.getTime();
    });
  }

  /**
   * Add a new prompt to history
   */
  public async addPrompt(prompt: AnalyzedPrompt): Promise<void> {
    const history = this.getAll();

    // Add to beginning
    history.unshift(prompt);

    // Enforce max size
    if (history.length > PromptHistoryStore.MAX_PROMPTS) {
      history.length = PromptHistoryStore.MAX_PROMPTS;
    }

    this.cache = history;
    await this.saveToStorage();
    await this.updateDailyStats();
  }

  /**
   * Clear all history
   */
  public async clearAll(): Promise<void> {
    this.cache = [];
    await this.saveToStorage();
    await this.resetDailyStats();
  }

  /**
   * Clear history older than N days
   */
  public async clearOlderThan(days: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    cutoffDate.setHours(0, 0, 0, 0);

    const history = this.getAll();
    this.cache = history.filter(prompt => {
      const promptDate = new Date(prompt.timestamp);
      return promptDate >= cutoffDate;
    });

    await this.saveToStorage();
  }

  /**
   * Get daily statistics
   */
  public getDailyStats(): DailyStats {
    const stats = this.context.globalState.get<DailyStats>(PromptHistoryStore.STATS_KEY);

    if (!stats) {
      return {
        analyzedToday: 0,
        avgScore: 0,
        lastResetDate: new Date().toISOString(),
      };
    }

    return stats;
  }

  /**
   * Get count of prompts analyzed today
   */
  public getAnalyzedTodayCount(): number {
    const stats = this.getDailyStats();
    return stats.analyzedToday;
  }

  /**
   * Get average score for today
   */
  public getAvgScoreToday(): number {
    const todayPrompts = this.getTodayPrompts();

    if (todayPrompts.length === 0) {
      return 0;
    }

    const sum = todayPrompts.reduce((acc, p) => acc + p.score, 0);
    return sum / todayPrompts.length;
  }

  /**
   * Load history from VS Code storage
   */
  private async loadFromStorage(): Promise<void> {
    const serialized = this.context.globalState.get<SerializedPrompt[]>(
      PromptHistoryStore.STORAGE_KEY,
      []
    );

    // Deserialize timestamps
    this.cache = serialized.map(p => ({
      ...p,
      timestamp: new Date(p.timestamp),
    }));
  }

  /**
   * Save history to VS Code storage
   */
  private async saveToStorage(): Promise<void> {
    if (!this.cache) {
      return;
    }

    // Serialize timestamps
    const serialized: SerializedPrompt[] = this.cache.map(p => ({
      ...p,
      timestamp: p.timestamp.toISOString(),
    }));

    await this.context.globalState.update(PromptHistoryStore.STORAGE_KEY, serialized);
  }

  /**
   * Remove prompts older than MAX_AGE_DAYS
   */
  private async cleanupOldPrompts(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - PromptHistoryStore.MAX_AGE_DAYS);
    cutoffDate.setHours(0, 0, 0, 0);

    const history = this.getAll();
    const filtered = history.filter(prompt => {
      const promptDate = new Date(prompt.timestamp);
      return promptDate >= cutoffDate;
    });

    // Only save if we actually removed something
    if (filtered.length !== history.length) {
      this.cache = filtered;
      await this.saveToStorage();
    }
  }

  /**
   * Check if it's a new day and reset stats if needed
   */
  private async checkAndResetDailyStats(): Promise<void> {
    const stats = this.getDailyStats();
    const lastReset = new Date(stats.lastResetDate);
    const today = new Date();

    lastReset.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    // If last reset was on a different day, reset stats
    if (lastReset.getTime() !== today.getTime()) {
      await this.resetDailyStats();
    }
  }

  /**
   * Update daily statistics based on current prompts
   */
  private async updateDailyStats(): Promise<void> {
    const todayPrompts = this.getTodayPrompts();
    const avgScore = todayPrompts.length > 0
      ? todayPrompts.reduce((acc, p) => acc + p.score, 0) / todayPrompts.length
      : 0;

    const stats: DailyStats = {
      analyzedToday: todayPrompts.length,
      avgScore,
      lastResetDate: new Date().toISOString(),
    };

    await this.context.globalState.update(PromptHistoryStore.STATS_KEY, stats);
  }

  /**
   * Reset daily statistics
   */
  private async resetDailyStats(): Promise<void> {
    const stats: DailyStats = {
      analyzedToday: 0,
      avgScore: 0,
      lastResetDate: new Date().toISOString(),
    };

    await this.context.globalState.update(PromptHistoryStore.STATS_KEY, stats);
  }
}
