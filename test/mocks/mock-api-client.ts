/**
 * Mock API Client
 *
 * In-memory API client for testing API interactions.
 */

import type { IApiClient, ApiSession } from '../../src/ports/network/api-client.interface';
import type {
  SanitizedSession,
  StreakInfo,
  UploadResult,
  TokenVerificationResult,
  AuthSessionResult,
  AuthCompletionResult,
  UploadProgressCallback,
  InstructionsSyncResult,
  InstructionsFetchResult,
} from '../../src/types';

export class MockApiClient implements IApiClient {
  // === State tracking for assertions ===
  public uploadedSessions: SanitizedSession[] = [];
  public uploadCallCount = 0;
  public verifyCallCount = 0;
  public lastUploadProgress: { current: number; total: number }[] = [];

  // === Configurable responses ===
  private token: string | null = null;
  private tokenValid = true;
  private authComplete = false;
  private streak: StreakInfo = {
    current: 1,
    points: 100,
    longestStreak: 5,
    totalSessions: 10,
    todaySessions: 2,
  };
  private instructions: InstructionsFetchResult = {
    content: null,
    updatedAt: null,
    lastUpdatedFrom: null,
  };
  private recentSessions: ApiSession[] = [];
  private shouldFail = false;
  private failureError: Error | null = null;
  private uploadFailure: Error | null = null;

  // === Setup Methods (for tests) ===

  /**
   * Set whether token verification should succeed
   */
  setTokenValid(valid: boolean): void {
    this.tokenValid = valid;
  }

  /**
   * Set whether auth completion check should return true
   */
  setAuthComplete(complete: boolean): void {
    this.authComplete = complete;
  }

  /**
   * Set the streak info to return
   */
  setStreak(streak: StreakInfo): void {
    this.streak = streak;
  }

  /**
   * Set instructions to return
   */
  setInstructions(instructions: InstructionsFetchResult): void {
    this.instructions = instructions;
  }

  /**
   * Set recent sessions to return
   */
  setRecentSessions(sessions: ApiSession[]): void {
    this.recentSessions = sessions;
  }

  /**
   * Configure the mock to fail on next call
   */
  setFailure(error: Error): void {
    this.shouldFail = true;
    this.failureError = error;
  }

  /**
   * Clear failure state
   */
  clearFailure(): void {
    this.shouldFail = false;
    this.failureError = null;
  }

  /**
   * Configure upload to fail specifically (doesn't affect other methods)
   */
  setUploadFailure(error: Error): void {
    this.uploadFailure = error;
  }

  /**
   * Clear upload failure
   */
  clearUploadFailure(): void {
    this.uploadFailure = null;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.uploadedSessions = [];
    this.uploadCallCount = 0;
    this.verifyCallCount = 0;
    this.lastUploadProgress = [];
    this.token = null;
    this.tokenValid = true;
    this.authComplete = false;
    this.shouldFail = false;
    this.failureError = null;
    this.uploadFailure = null;
    this.recentSessions = [];
    this.instructions = {
      content: null,
      updatedAt: null,
      lastUpdatedFrom: null,
    };
  }

  private checkFailure(): void {
    if (this.shouldFail && this.failureError) {
      throw this.failureError;
    }
  }

  // === IApiClient Implementation ===

  async createAuthSession(): Promise<AuthSessionResult> {
    this.checkFailure();
    return {
      authUrl: 'https://app.vibe-log.dev/auth/cli?token=test-token',
      token: 'test-auth-token',
    };
  }

  async checkAuthCompletion(token: string): Promise<AuthCompletionResult> {
    this.checkFailure();
    return {
      success: this.authComplete,
      userId: this.authComplete ? 123 : undefined,
    };
  }

  async verifyToken(): Promise<TokenVerificationResult> {
    this.checkFailure();
    this.verifyCallCount++;
    return {
      valid: this.tokenValid,
      userId: this.tokenValid ? 'user-123' : undefined,
      user: this.tokenValid ? { id: 'user-123', name: 'Test User' } : undefined,
    };
  }

  async uploadSessions(
    sessions: SanitizedSession[],
    onProgress?: UploadProgressCallback
  ): Promise<UploadResult> {
    this.checkFailure();
    if (this.uploadFailure) {
      throw this.uploadFailure;
    }
    this.uploadCallCount++;
    this.uploadedSessions.push(...sessions);

    // Simulate progress callbacks
    if (onProgress) {
      for (let i = 0; i <= sessions.length; i++) {
        const progress = { current: i, total: sessions.length };
        this.lastUploadProgress.push(progress);
        onProgress(i, sessions.length, i * 10);
      }
    }

    return {
      success: true,
      sessionsProcessed: sessions.length,
      created: sessions.length,
      duplicates: 0,
      streak: this.streak,
      pointsEarned: {
        streak: 10,
        volume: sessions.length,
        share: 0,
        total: 10 + sessions.length,
      },
    };
  }

  async getRecentSessions(
    limit?: number,
    startDate?: Date,
    endDate?: Date
  ): Promise<ApiSession[]> {
    this.checkFailure();
    let sessions = [...this.recentSessions];

    if (startDate) {
      sessions = sessions.filter((s) => new Date(s.timestamp) >= startDate);
    }
    if (endDate) {
      sessions = sessions.filter((s) => new Date(s.timestamp) <= endDate);
    }
    if (limit) {
      sessions = sessions.slice(0, limit);
    }

    return sessions;
  }

  async getStreak(): Promise<StreakInfo> {
    this.checkFailure();
    return this.streak;
  }

  async syncInstructions(
    content: string,
    source?: 'cli' | 'web'
  ): Promise<InstructionsSyncResult> {
    this.checkFailure();
    this.instructions = {
      content,
      updatedAt: new Date().toISOString(),
      lastUpdatedFrom: source ?? 'cli',
    };
    return {
      success: true,
      updatedAt: this.instructions.updatedAt ?? undefined,
    };
  }

  async fetchInstructions(): Promise<InstructionsFetchResult> {
    this.checkFailure();
    return this.instructions;
  }

  async deleteInstructions(): Promise<{ success: boolean }> {
    this.checkFailure();
    this.instructions = {
      content: null,
      updatedAt: null,
      lastUpdatedFrom: null,
    };
    return { success: true };
  }

  getBaseUrl(): string {
    return 'https://app.vibe-log.dev';
  }

  setToken(token: string | null): void {
    this.token = token;
  }
}
