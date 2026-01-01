/**
 * DevArkApiClient - High-level API client for vibe-log backend
 *
 * Handles all communication with the vibe-log API including:
 * - Authentication (OAuth flow, token verification)
 * - Session uploads (with chunking and checksums)
 * - User data (streak, recent sessions)
 * - Custom instructions
 */

import crypto from 'crypto';
import type { IApiClient, ApiSession } from '../../ports/network/api-client.interface';
import type { IHttpClient, HttpError } from '../../ports/network/http-client.interface';
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
} from '../../types';

const DEFAULT_BASE_URL = 'https://app.devark.dev';
const CHUNK_SIZE = 100;

export class DevArkApiClient implements IApiClient {
  private readonly httpClient: IHttpClient;
  private readonly baseUrl: string;

  constructor(httpClient: IHttpClient, baseUrl?: string) {
    this.httpClient = httpClient;
    this.baseUrl = baseUrl || DEFAULT_BASE_URL;
    this.httpClient.setBaseUrl(this.baseUrl);
  }

  // === Authentication ===

  async createAuthSession(): Promise<AuthSessionResult> {
    const response = await this.httpClient.post<{
      authUrl?: string;
      token?: string;
      sessionId?: string;
    }>('/api/auth/cli/session', {
      timestamp: new Date().toISOString(),
    });

    const { authUrl, token, sessionId } = response.data;

    if (!authUrl || typeof authUrl !== 'string') {
      throw new Error('Invalid auth response: missing authUrl');
    }

    const resultToken = token || sessionId;
    if (!resultToken || typeof resultToken !== 'string') {
      throw new Error('Invalid auth response: missing token');
    }

    return { authUrl, token: resultToken };
  }

  async checkAuthCompletion(token: string): Promise<AuthCompletionResult> {
    try {
      const response = await this.httpClient.get<{
        success: boolean;
        userId?: number;
      }>(`/api/auth/cli/complete?token=${encodeURIComponent(token)}`);

      return {
        success: response.data.success,
        userId: response.data.userId,
      };
    } catch (error) {
      const httpError = error as HttpError;
      if (httpError.status === 404) {
        return { success: false };
      }
      throw error;
    }
  }

  async verifyToken(): Promise<TokenVerificationResult> {
    try {
      const response = await this.httpClient.get<{
        valid?: boolean;
        user?: { id: string; name?: string; email?: string };
      }>('/api/auth/cli/verify');

      // Infer validity: if API returns user data, token is valid
      const isValid = response.data.valid === true || response.data.user !== undefined;

      return {
        valid: isValid,
        userId: response.data.user?.id,
        user: response.data.user,
      };
    } catch {
      return { valid: false };
    }
  }

  // === Session Management ===

  async uploadSessions(
    sessions: SanitizedSession[],
    onProgress?: UploadProgressCallback
  ): Promise<UploadResult> {
    console.log('[DevArkApiClient] uploadSessions called with', sessions.length, 'sessions');
    if (sessions.length === 0) {
      return {
        success: true,
        sessionsProcessed: 0,
        created: 0,
        duplicates: 0,
      };
    }

    // Chunk sessions into batches
    const chunks: SanitizedSession[][] = [];
    for (let i = 0; i < sessions.length; i += CHUNK_SIZE) {
      chunks.push(sessions.slice(i, i + CHUNK_SIZE));
    }

    const results: UploadResult[] = [];
    let uploadedCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const payload = {
        sessions: chunk,
        checksum: this.calculateChecksum(chunk),
        totalSessions: sessions.length,
        batchNumber: i + 1,
        totalBatches: chunks.length,
      };

      const response = await this.httpClient.post<UploadResult>('/cli/sessions', payload);
      results.push(response.data);

      uploadedCount += chunk.length;
      if (onProgress) {
        onProgress(uploadedCount, sessions.length);
      }
    }

    return this.mergeResults(results, sessions.length);
  }

  async getRecentSessions(
    limit = 10,
    startDate?: Date,
    endDate?: Date
  ): Promise<ApiSession[]> {
    const params = new URLSearchParams();
    params.set('limit', String(Math.min(Math.max(1, limit), 100)));

    if (startDate) {
      params.set('start', startDate.toISOString());
    }
    if (endDate) {
      params.set('end', endDate.toISOString());
    }

    const response = await this.httpClient.get<{
      sessions: ApiSession[];
      count?: number;
    }>(`/api/sessions/recent?${params.toString()}`);

    // Handle both formats: { sessions: [...] } or [...]
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return response.data.sessions || [];
  }

  // === User Data ===

  async getStreak(): Promise<StreakInfo> {
    const response = await this.httpClient.get<StreakInfo>('/api/user/streak');
    return response.data;
  }

  // === Custom Instructions ===

  async syncInstructions(
    content: string,
    source: 'cli' | 'web' = 'cli'
  ): Promise<InstructionsSyncResult> {
    const response = await this.httpClient.post<InstructionsSyncResult>(
      '/api/user/instructions',
      { content, source }
    );
    return response.data;
  }

  async fetchInstructions(): Promise<InstructionsFetchResult> {
    const response = await this.httpClient.get<InstructionsFetchResult>(
      '/api/user/instructions'
    );
    return response.data;
  }

  async deleteInstructions(): Promise<{ success: boolean }> {
    const response = await this.httpClient.delete<{ success: boolean }>(
      '/api/user/instructions'
    );
    return response.data;
  }

  // === Configuration ===

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setToken(token: string | null): void {
    console.log('[DevArkApiClient] setToken called:', token ? token.substring(0, 10) + '...' : 'null');
    this.httpClient.setAuthToken(token);
  }

  // === Private Helpers ===

  private calculateChecksum(data: unknown): string {
    const json = JSON.stringify(data);
    return crypto.createHash('sha256').update(json).digest('hex');
  }

  private mergeResults(results: UploadResult[], totalSessions: number): UploadResult {
    if (results.length === 0) {
      return {
        success: true,
        sessionsProcessed: 0,
        created: 0,
        duplicates: 0,
      };
    }

    return {
      success: results.every((r) => r.success),
      sessionsProcessed: totalSessions,
      created: results.reduce((sum, r) => sum + (r.created || 0), 0),
      duplicates: results.reduce((sum, r) => sum + (r.duplicates || 0), 0),
      analysisPreview: results[0]?.analysisPreview,
      streak: results[results.length - 1]?.streak,
      pointsEarned: this.mergePointsEarned(results),
      batchId: results.find((r) => r.batchId)?.batchId,
    };
  }

  private mergePointsEarned(results: UploadResult[]): UploadResult['pointsEarned'] {
    const pointsResults = results.filter((r) => r.pointsEarned);
    if (pointsResults.length === 0) {
      return undefined;
    }

    return pointsResults.reduce((acc, r) => {
      const points = r.pointsEarned!;
      if (!acc) return points;

      return {
        streak: Math.max(acc.streak || 0, points.streak || 0),
        volume: (acc.volume || 0) + (points.volume || 0),
        share: Math.max(acc.share || 0, points.share || 0),
        total: (acc.total || 0) + (points.total || 0),
        message: points.message || acc.message,
      };
    }, undefined as UploadResult['pointsEarned']);
  }
}
