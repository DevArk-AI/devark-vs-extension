/**
 * DailyStatsService - Daily Statistics Tracking for Co-Pilot V2
 *
 * Responsibilities:
 * - Count prompts per day
 * - Calculate daily average score
 * - Track user's historical average
 * - Calculate delta vs typical performance
 * - Provide weekly/monthly trend data
 */

import * as vscode from 'vscode';
import { getSessionManager } from './SessionManagerService';

/**
 * Daily statistics structure
 */
export interface DailyStats {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Number of prompts today */
  promptCount: number;
  /** Average score today (0-10) */
  averageScore: number;
  /** User's historical average */
  historicalAverage: number;
  /** Delta vs historical average */
  deltaVsTypical: number;
  /** Best score today */
  bestScore: number;
  /** Worst score today */
  worstScore: number;
  /** Time spent coding (minutes) */
  codingMinutes: number;
  /** Number of sessions today */
  sessionCount: number;
}

/**
 * Weekly trend data point
 */
export interface DailyTrendPoint {
  date: string;
  dayOfWeek: string;
  promptCount: number;
  averageScore: number;
}

/**
 * Storage keys
 */
const STORAGE_KEYS = {
  DAILY_STATS_CACHE: 'copilot.v2.dailyStatsCache',
  HISTORICAL_SCORES: 'copilot.v2.historicalScores',
} as const;

/**
 * Maximum historical data points to keep
 */
const MAX_HISTORICAL_DAYS = 90;

/**
 * DailyStatsService - Daily statistics tracking
 */
export class DailyStatsService {
  private static instance: DailyStatsService | null = null;
  private context: vscode.ExtensionContext | null = null;
  private historicalScores: Map<string, { total: number; count: number }> = new Map();
  private cachedDailyStats: DailyStats | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): DailyStatsService {
    if (!DailyStatsService.instance) {
      DailyStatsService.instance = new DailyStatsService();
    }
    return DailyStatsService.instance;
  }

  /**
   * Initialize with extension context
   */
  public async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;
    await this.loadHistoricalData();
    console.log('[DailyStatsService] Initialized');
  }

  /**
   * Get today's statistics
   */
  public getDailyStats(): DailyStats {
    // Check cache
    if (this.cachedDailyStats && Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.cachedDailyStats;
    }

    const sessionManager = getSessionManager();
    const todayStats = sessionManager.getTodayStats();
    const today = this.getDateString(new Date());

    // Get historical average
    const historicalAverage = this.calculateHistoricalAverage();

    // Calculate delta
    const deltaVsTypical = todayStats.averageScore > 0
      ? Math.round((todayStats.averageScore - historicalAverage) * 10) / 10
      : 0;

    // Get additional stats from sessions
    const { bestScore, worstScore, codingMinutes, sessionCount } = this.calculateAdditionalStats();

    const stats: DailyStats = {
      date: today,
      promptCount: todayStats.promptCount,
      averageScore: todayStats.averageScore,
      historicalAverage,
      deltaVsTypical,
      bestScore,
      worstScore,
      codingMinutes,
      sessionCount,
    };

    // Update cache
    this.cachedDailyStats = stats;
    this.cacheTimestamp = Date.now();

    return stats;
  }

  /**
   * Record a new score for today
   */
  public async recordScore(score: number): Promise<void> {
    const today = this.getDateString(new Date());

    // Update historical data
    const existing = this.historicalScores.get(today) || { total: 0, count: 0 };
    existing.total += score;
    existing.count += 1;
    this.historicalScores.set(today, existing);

    // Invalidate cache
    this.cachedDailyStats = null;

    // Save to storage
    await this.saveHistoricalData();
  }

  /**
   * Get weekly trend data (last 7 days)
   */
  public getWeeklyTrend(): DailyTrendPoint[] {
    const trend: DailyTrendPoint[] = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = this.getDateString(date);
      const dayOfWeek = dayNames[date.getDay()];

      const data = this.historicalScores.get(dateStr);
      trend.push({
        date: dateStr,
        dayOfWeek,
        promptCount: data?.count || 0,
        averageScore: data ? Math.round((data.total / data.count) * 10) / 10 : 0,
      });
    }

    return trend;
  }

  /**
   * Get monthly statistics
   */
  public getMonthlyStats(): {
    totalPrompts: number;
    averageScore: number;
    activeDays: number;
    bestDay: string | null;
    bestDayScore: number;
  } {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    let totalPrompts = 0;
    let totalScore = 0;
    let activeDays = 0;
    let bestDay: string | null = null;
    let bestDayScore = 0;

    for (const [dateStr, data] of this.historicalScores) {
      const date = new Date(dateStr);
      if (date >= startOfMonth && date <= today) {
        totalPrompts += data.count;
        totalScore += data.total;
        activeDays++;

        const dayAvg = data.total / data.count;
        if (dayAvg > bestDayScore) {
          bestDayScore = dayAvg;
          bestDay = dateStr;
        }
      }
    }

    return {
      totalPrompts,
      averageScore: totalPrompts > 0 ? Math.round((totalScore / totalPrompts) * 10) / 10 : 0,
      activeDays,
      bestDay,
      bestDayScore: Math.round(bestDayScore * 10) / 10,
    };
  }

  /**
   * Get streak information
   */
  public getStreak(): { currentStreak: number; longestStreak: number } {
    const sortedDates = Array.from(this.historicalScores.keys()).sort().reverse();
    let currentStreak = 0;
    let longestStreak = 0;
    let streak = 0;

    const today = this.getDateString(new Date());
    const yesterday = this.getDateString(new Date(Date.now() - 86400000));

    // Check current streak
    if (sortedDates.includes(today) || sortedDates.includes(yesterday)) {
      const startDate = sortedDates.includes(today) ? today : yesterday;
      const checkDate = new Date(startDate);

      while (true) {
        const dateStr = this.getDateString(checkDate);
        if (this.historicalScores.has(dateStr)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    // Calculate longest streak
    for (let i = 0; i < sortedDates.length; i++) {
      const currentDate = new Date(sortedDates[i]);
      const nextDate = i + 1 < sortedDates.length ? new Date(sortedDates[i + 1]) : null;

      streak++;

      // Check if consecutive
      if (nextDate) {
        const expectedNext = new Date(currentDate);
        expectedNext.setDate(expectedNext.getDate() - 1);

        if (this.getDateString(expectedNext) !== this.getDateString(nextDate)) {
          longestStreak = Math.max(longestStreak, streak);
          streak = 0;
        }
      } else {
        longestStreak = Math.max(longestStreak, streak);
      }
    }

    return { currentStreak, longestStreak };
  }

  /**
   * Calculate historical average from stored data
   */
  private calculateHistoricalAverage(): number {
    let totalScore = 0;
    let totalCount = 0;

    // Use last 30 days for historical average
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const [dateStr, data] of this.historicalScores) {
      const date = new Date(dateStr);
      if (date >= thirtyDaysAgo) {
        totalScore += data.total;
        totalCount += data.count;
      }
    }

    if (totalCount === 0) {
      return 5.0; // Default average if no history
    }

    return Math.round((totalScore / totalCount) * 10) / 10;
  }

  /**
   * Calculate additional stats from session manager
   */
  private calculateAdditionalStats(): {
    bestScore: number;
    worstScore: number;
    codingMinutes: number;
    sessionCount: number;
  } {
    const sessionManager = getSessionManager();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sessions = sessionManager.getSessions({
      dateRange: {
        start: today,
        end: new Date(),
      },
    });

    let bestScore = 0;
    let worstScore = 10;
    let codingMinutes = 0;

    for (const session of sessions) {
      // Calculate session duration
      const duration = Math.round(
        (session.lastActivityTime.getTime() - session.startTime.getTime()) / 60000
      );
      codingMinutes += duration;

      // Check scores
      for (const prompt of session.prompts) {
        if (prompt.score > bestScore) bestScore = prompt.score;
        if (prompt.score < worstScore && prompt.score > 0) worstScore = prompt.score;
      }
    }

    return {
      bestScore,
      worstScore: worstScore === 10 ? 0 : worstScore,
      codingMinutes,
      sessionCount: sessions.length,
    };
  }

  /**
   * Load historical data from storage
   */
  private async loadHistoricalData(): Promise<void> {
    if (!this.context) return;

    try {
      const stored = this.context.globalState.get<Record<string, { total: number; count: number }>>(
        STORAGE_KEYS.HISTORICAL_SCORES,
        {}
      );

      this.historicalScores.clear();
      for (const [date, data] of Object.entries(stored)) {
        this.historicalScores.set(date, data);
      }

      // Clean old data
      await this.cleanOldData();

      console.log('[DailyStatsService] Loaded historical data:', this.historicalScores.size, 'days');
    } catch (error) {
      console.error('[DailyStatsService] Failed to load historical data:', error);
    }
  }

  /**
   * Save historical data to storage
   */
  private async saveHistoricalData(): Promise<void> {
    if (!this.context) return;

    try {
      const data: Record<string, { total: number; count: number }> = {};
      for (const [date, scores] of this.historicalScores) {
        data[date] = scores;
      }

      await this.context.globalState.update(STORAGE_KEYS.HISTORICAL_SCORES, data);
    } catch (error) {
      console.error('[DailyStatsService] Failed to save historical data:', error);
    }
  }

  /**
   * Clean data older than MAX_HISTORICAL_DAYS
   */
  private async cleanOldData(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_HISTORICAL_DAYS);
    const cutoffStr = this.getDateString(cutoffDate);

    let cleaned = 0;
    for (const [date] of this.historicalScores) {
      if (date < cutoffStr) {
        this.historicalScores.delete(date);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log('[DailyStatsService] Cleaned', cleaned, 'old records');
      await this.saveHistoricalData();
    }
  }

  /**
   * Get date string in YYYY-MM-DD format
   */
  private getDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Invalidate cache (call when new prompts are added)
   */
  public invalidateCache(): void {
    this.cachedDailyStats = null;
    this.cacheTimestamp = 0;
  }
}

/**
 * Get DailyStatsService singleton
 */
export function getDailyStatsService(): DailyStatsService {
  return DailyStatsService.getInstance();
}
