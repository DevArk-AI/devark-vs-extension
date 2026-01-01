/**
 * API types - types for backend communication
 */

// Note: SanitizedSession is imported by consumers of this module

/**
 * User streak information
 */
export interface StreakInfo {
  current: number;
  points: number;
  longestStreak: number;
  totalSessions: number;
  todaySessions: number;
}

/**
 * Points earned from session upload
 */
export interface PointsEarned {
  streak: number;      // Exponential streak points (2^day)
  volume: number;      // Session volume bonus (1 per session, max 30/day)
  share: number;       // Social share bonus
  total: number;       // Total points earned
  message?: string;    // Optional celebratory message from server
}

/**
 * Result of uploading sessions
 */
export interface UploadResult {
  success: boolean;
  sessionsProcessed: number;
  analysisPreview?: string;
  streak?: StreakInfo;
  pointsEarned?: PointsEarned;
  created?: number;
  duplicates?: number;
  batchId?: string;
}

/**
 * Token verification result
 */
export interface TokenVerificationResult {
  valid: boolean;
  userId?: string;
  user?: {
    id: string;
    name?: string;
    email?: string;
  };
}

/**
 * Auth session creation result (for OAuth flow)
 */
export interface AuthSessionResult {
  authUrl: string;
  token: string;
}

/**
 * Auth completion check result
 */
export interface AuthCompletionResult {
  success: boolean;
  userId?: number;
}

/**
 * Upload progress callback
 */
export type UploadProgressCallback = (
  current: number,
  total: number,
  sizeKB?: number
) => void;

/**
 * API error types
 */
export type ApiErrorCode =
  | 'AUTH_EXPIRED'
  | 'ACCESS_DENIED'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'VALIDATION_ERROR'
  | 'NETWORK_ERROR'
  | 'ENDPOINT_NOT_FOUND'
  | 'CLIENT_RATE_LIMITED';

export interface ApiError extends Error {
  code: ApiErrorCode;
  status?: number;
}

/**
 * HTTP response types
 */
export interface HttpResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

/**
 * HTTP request config
 */
export interface HttpRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Instructions sync types
 */
export interface InstructionsSyncResult {
  success: boolean;
  updatedAt?: string;
}

export interface InstructionsFetchResult {
  content: string | null;
  updatedAt: string | null;
  lastUpdatedFrom: 'cli' | 'web' | null;
}
