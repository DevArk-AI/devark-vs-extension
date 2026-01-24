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
import type { IApiClient, ApiSession, LastSessionResult } from '../../ports/network/api-client.interface';
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

// Size-based batching constants
const TARGET_BATCH_SIZE_BYTES = 500 * 1024; // 500KB
const BUFFER_PERCENT = 0.20; // 20% overhead buffer

export class DevArkApiClient implements IApiClient {
  private readonly httpClient: IHttpClient;
  private readonly baseUrl: string;

  constructor(httpClient: IHttpClient, baseUrl: string) {
    this.httpClient = httpClient;
    this.baseUrl = baseUrl;
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
      source: 'ide_extension',
    });

    const { authUrl, token, sessionId } = response.data;

    if (!authUrl || typeof authUrl !== 'string') {
      throw new Error('Invalid auth response: missing authUrl');
    }

    const resultToken = token || sessionId;
    if (!resultToken || typeof resultToken !== 'string') {
      throw new Error('Invalid auth response: missing token');
    }

    // Append source param for UI display on auth page
    const authUrlWithSource = authUrl.includes('?')
      ? `${authUrl}&source=ide_extension`
      : `${authUrl}?source=ide_extension`;

    return { authUrl: authUrlWithSource, token: resultToken };
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

  private estimateSessionSize(session: SanitizedSession): number {
    const encoder = new TextEncoder();
    return encoder.encode(JSON.stringify(session)).length;
  }

  private createSizeBatches(
    sessions: SanitizedSession[],
    targetSizeBytes: number = TARGET_BATCH_SIZE_BYTES,
    bufferPercent: number = BUFFER_PERCENT
  ): SanitizedSession[][] {
    const effectiveTarget = targetSizeBytes * (1 - bufferPercent);
    const batches: SanitizedSession[][] = [];
    let currentBatch: SanitizedSession[] = [];
    let currentSize = 0;

    for (const session of sessions) {
      const sessionSize = this.estimateSessionSize(session);

      // Only split if batch already has sessions
      // This ensures oversized sessions get their own batch, never infinite loop
      if (currentBatch.length > 0 && currentSize + sessionSize > effectiveTarget) {
        batches.push(currentBatch);
        currentBatch = [session];
        currentSize = sessionSize;
      } else {
        // Always add to batch - even if session exceeds target (when batch is empty)
        currentBatch.push(session);
        currentSize += sessionSize;
      }
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

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

    // Use size-based batching for optimal payload sizes
    const chunks = this.createSizeBatches(sessions);

    // Log batching info
    const totalSizeKB = sessions.reduce((sum, s) => sum + this.estimateSessionSize(s), 0) / 1024;
    console.log(`[DevArkApiClient] Uploading in ${chunks.length} size-based batches (Total: ${totalSizeKB.toFixed(2)} KB, Target: ~500KB per batch)`);

    const results: UploadResult[] = [];
    let uploadedCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkSizeKB = chunk.reduce((sum, s) => sum + this.estimateSessionSize(s), 0) / 1024;
      console.log(`[DevArkApiClient] Uploading batch ${i + 1} of ${chunks.length} with ${chunk.length} sessions (${chunkSizeKB.toFixed(2)} KB)`);

      const payload = {
        sessions: chunk,
        checksum: this.calculateChecksum(chunk),
        totalSessions: sessions.length,
        batchNumber: i + 1,
        totalBatches: chunks.length,
      };

      const response = await this.httpClient.post<UploadResult>('/cli/sessions', payload, {
        headers: { 'x-devark-source': 'ide_extension' },
      });
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

  async getLastSessionDate(): Promise<LastSessionResult> {
    try {
      console.log('[DevArkApiClient] GET /api/sessions/last');
      const response = await this.httpClient.get<LastSessionResult>('/api/sessions/last');
      console.log('[DevArkApiClient] /api/sessions/last response:', response.data);
      return response.data;
    } catch (error) {
      const httpError = error as HttpError;
      console.error('[DevArkApiClient] /api/sessions/last error:', httpError.status, httpError.message);
      // If endpoint returns 404, user has no sessions
      if (httpError.status === 404) {
        return { lastSessionTimestamp: null, lastSessionId: null };
      }
      throw error;
    }
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

  // === Feedback ===

  async submitFeedback(rating: number, message?: string): Promise<{ success: boolean }> {
    const response = await this.httpClient.post<{ success: boolean }>('/api/feedback-extension', {
      rating,
      message,
    });
    return response.data;
  }

  // === Configuration ===

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setToken(token: string | null): void {
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
