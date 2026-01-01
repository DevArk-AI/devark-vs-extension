/**
 * PeerComparisonService - Peer Comparison for Co-Pilot V2
 *
 * Responsibilities:
 * - Fetch aggregate stats from vibe-log API
 * - Calculate percentile rank
 * - Cache results (refresh every 5 minutes)
 * - Provide comparison data for UI
 */

import * as vscode from 'vscode';
import { getDailyStatsService } from './DailyStatsService';

/**
 * Peer comparison data
 */
export interface PeerComparison {
  /** User's average score */
  userScore: number;
  /** Average score across all users */
  peerAverage: number;
  /** User's percentile rank (0-100) */
  percentileRank: number;
  /** Total users in comparison */
  totalUsers: number;
  /** Whether data is from cache */
  isCached: boolean;
  /** Last updated timestamp */
  lastUpdated: Date;
  /** Time period for comparison */
  period: 'today' | 'week' | 'month';
}

/**
 * Aggregate stats from API
 */
interface AggregateStats {
  averageScore: number;
  totalUsers: number;
  percentiles: {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
}

/**
 * Storage keys
 */
const STORAGE_KEYS = {
  PEER_COMPARISON_CACHE: 'copilot.v2.peerComparisonCache',
} as const;

/**
 * Cache TTL (5 minutes)
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * PeerComparisonService - Peer comparison functionality
 */
export class PeerComparisonService {
  private static instance: PeerComparisonService | null = null;
  private context: vscode.ExtensionContext | null = null;
  private cache: Map<string, { data: PeerComparison; timestamp: number }> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): PeerComparisonService {
    if (!PeerComparisonService.instance) {
      PeerComparisonService.instance = new PeerComparisonService();
    }
    return PeerComparisonService.instance;
  }

  /**
   * Initialize with extension context
   */
  public async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;
    await this.loadCache();
    console.log('[PeerComparisonService] Initialized');
  }

  /**
   * Get peer comparison for today
   */
  public async getTodayComparison(): Promise<PeerComparison> {
    return this.getComparison('today');
  }

  /**
   * Get peer comparison for this week
   */
  public async getWeekComparison(): Promise<PeerComparison> {
    return this.getComparison('week');
  }

  /**
   * Get peer comparison for this month
   */
  public async getMonthComparison(): Promise<PeerComparison> {
    return this.getComparison('month');
  }

  /**
   * Get comparison for a specific period
   */
  private async getComparison(period: 'today' | 'week' | 'month'): Promise<PeerComparison> {
    const cacheKey = `peer_${period}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { ...cached.data, isCached: true };
    }

    // Get user's score
    const dailyStats = getDailyStatsService();
    const userScore = dailyStats.getDailyStats().averageScore;

    try {
      // Try to fetch from API
      const aggregateStats = await this.fetchAggregateStats(period);

      const comparison: PeerComparison = {
        userScore,
        peerAverage: aggregateStats.averageScore,
        percentileRank: this.calculatePercentile(userScore, aggregateStats.percentiles),
        totalUsers: aggregateStats.totalUsers,
        isCached: false,
        lastUpdated: new Date(),
        period,
      };

      // Update cache
      this.cache.set(cacheKey, { data: comparison, timestamp: Date.now() });
      await this.saveCache();

      return comparison;
    } catch (error) {
      console.warn('[PeerComparisonService] API fetch failed, using fallback:', error);

      // Return fallback data
      return this.getFallbackComparison(userScore, period, cached?.data);
    }
  }

  /**
   * Fetch aggregate stats from vibe-log API
   * TODO: Replace with actual API call when endpoint is available
   * For now returns simulated stats
   */
  private async fetchAggregateStats(_period: string): Promise<AggregateStats> {
    // For now, return simulated stats since the API endpoint may not exist yet
    // Once AuthService integration is ready, this can be updated to:
    // 1. Check if user is authenticated via AuthService
    // 2. Fetch real aggregate stats from the API
    return this.getSimulatedAggregateStats();
  }

  /**
   * Get simulated aggregate stats
   * TODO: Replace with real API data
   */
  private getSimulatedAggregateStats(): AggregateStats {
    return {
      averageScore: 4.8,
      totalUsers: 1247,
      percentiles: {
        p25: 3.5,
        p50: 4.8,
        p75: 6.2,
        p90: 7.5,
        p95: 8.2,
      },
    };
  }

  /**
   * Calculate percentile rank based on score and distribution
   */
  private calculatePercentile(
    score: number,
    percentiles: { p25: number; p50: number; p75: number; p90: number; p95: number }
  ): number {
    if (score <= percentiles.p25) {
      // 0-25th percentile
      return Math.round((score / percentiles.p25) * 25);
    } else if (score <= percentiles.p50) {
      // 25-50th percentile
      return Math.round(25 + ((score - percentiles.p25) / (percentiles.p50 - percentiles.p25)) * 25);
    } else if (score <= percentiles.p75) {
      // 50-75th percentile
      return Math.round(50 + ((score - percentiles.p50) / (percentiles.p75 - percentiles.p50)) * 25);
    } else if (score <= percentiles.p90) {
      // 75-90th percentile
      return Math.round(75 + ((score - percentiles.p75) / (percentiles.p90 - percentiles.p75)) * 15);
    } else if (score <= percentiles.p95) {
      // 90-95th percentile
      return Math.round(90 + ((score - percentiles.p90) / (percentiles.p95 - percentiles.p90)) * 5);
    } else {
      // Top 5%
      return Math.min(99, Math.round(95 + ((score - percentiles.p95) / (10 - percentiles.p95)) * 5));
    }
  }

  /**
   * Get fallback comparison when API is unavailable
   */
  private getFallbackComparison(
    userScore: number,
    period: 'today' | 'week' | 'month',
    cached?: PeerComparison
  ): PeerComparison {
    // If we have cached data, use it
    if (cached) {
      return {
        ...cached,
        userScore,
        isCached: true,
      };
    }

    // Otherwise, use default values
    const fallbackAverage = 4.8;
    const fallbackPercentiles = {
      p25: 3.5,
      p50: 4.8,
      p75: 6.2,
      p90: 7.5,
      p95: 8.2,
    };

    return {
      userScore,
      peerAverage: fallbackAverage,
      percentileRank: this.calculatePercentile(userScore, fallbackPercentiles),
      totalUsers: 0, // Indicates fallback data
      isCached: false,
      lastUpdated: new Date(),
      period,
    };
  }

  /**
   * Load cache from storage
   */
  private async loadCache(): Promise<void> {
    if (!this.context) return;

    try {
      const stored = this.context.globalState.get<
        Record<string, { data: PeerComparison; timestamp: number }>
      >(STORAGE_KEYS.PEER_COMPARISON_CACHE, {});

      this.cache.clear();
      for (const [key, value] of Object.entries(stored)) {
        // Convert date strings back to Date objects
        value.data.lastUpdated = new Date(value.data.lastUpdated);
        this.cache.set(key, value);
      }

      console.log('[PeerComparisonService] Cache loaded:', this.cache.size, 'entries');
    } catch (error) {
      console.error('[PeerComparisonService] Failed to load cache:', error);
    }
  }

  /**
   * Save cache to storage
   */
  private async saveCache(): Promise<void> {
    if (!this.context) return;

    try {
      const data: Record<string, { data: PeerComparison; timestamp: number }> = {};
      for (const [key, value] of this.cache) {
        data[key] = value;
      }

      await this.context.globalState.update(STORAGE_KEYS.PEER_COMPARISON_CACHE, data);
    } catch (error) {
      console.error('[PeerComparisonService] Failed to save cache:', error);
    }
  }

  /**
   * Invalidate all caches
   */
  public invalidateCache(): void {
    this.cache.clear();
  }

  /**
   * Get formatted percentile string
   */
  public static formatPercentile(percentile: number): string {
    if (percentile >= 90) return `TOP ${100 - percentile}%`;
    if (percentile >= 75) return `Top 25%`;
    if (percentile >= 50) return `Top 50%`;
    return `Bottom ${100 - percentile}%`;
  }
}

/**
 * Get PeerComparisonService singleton
 */
export function getPeerComparisonService(): PeerComparisonService {
  return PeerComparisonService.getInstance();
}
