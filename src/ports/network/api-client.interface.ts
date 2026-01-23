/**
 * API Client Interface
 *
 * High-level interface for vibe-log backend API operations.
 * Handles authentication, session uploads, and user data.
 */

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

/**
 * Recent session from API (different from local SessionData)
 */
export interface ApiSession {
  id: string;
  tool: string;
  timestamp: string;
  duration: number;
  projectName: string;
  messageCount: number;
  metadata: {
    languages: string[];
    files_edited: number;
  };
}

/**
 * Result from getLastSessionDate for incremental sync
 */
export interface LastSessionResult {
  lastSessionTimestamp: string | null;
  lastSessionId: number | null;
}

export interface IApiClient {
  // === Authentication ===

  /**
   * Create a new authentication session (initiates OAuth flow)
   * @returns Auth URL and temporary token
   */
  createAuthSession(): Promise<AuthSessionResult>;

  /**
   * Check if authentication flow is complete
   * @param token The temporary token from createAuthSession
   */
  checkAuthCompletion(token: string): Promise<AuthCompletionResult>;

  /**
   * Verify the current authentication token
   * @returns Verification result with user info if valid
   */
  verifyToken(): Promise<TokenVerificationResult>;

  // === Session Management ===

  /**
   * Upload sessions to the backend
   * @param sessions Sanitized sessions to upload
   * @param onProgress Optional progress callback
   * @returns Upload result with streak and points info
   */
  uploadSessions(
    sessions: SanitizedSession[],
    onProgress?: UploadProgressCallback
  ): Promise<UploadResult>;

  /**
   * Get recent sessions from the server
   * @param limit Maximum number of sessions to return
   * @param startDate Optional start date filter
   * @param endDate Optional end date filter
   */
  getRecentSessions(
    limit?: number,
    startDate?: Date,
    endDate?: Date
  ): Promise<ApiSession[]>;

  /**
   * Get the timestamp of the user's most recent session for incremental sync
   * @returns Last session timestamp (ISO string) and ID, or null if no sessions exist
   */
  getLastSessionDate(): Promise<LastSessionResult>;

  // === User Data ===

  /**
   * Get current streak information
   */
  getStreak(): Promise<StreakInfo>;

  // === Custom Instructions ===

  /**
   * Sync custom instructions to the backend
   * @param content The instructions content
   * @param source Source of the update
   */
  syncInstructions(
    content: string,
    source?: 'cli' | 'web'
  ): Promise<InstructionsSyncResult>;

  /**
   * Fetch custom instructions from the backend
   */
  fetchInstructions(): Promise<InstructionsFetchResult>;

  /**
   * Delete custom instructions
   */
  deleteInstructions(): Promise<{ success: boolean }>;

  // === Configuration ===

  /**
   * Get the base API URL
   */
  getBaseUrl(): string;

  /**
   * Set the authentication token
   * @param token The bearer token
   */
  setToken(token: string | null): void;
}
