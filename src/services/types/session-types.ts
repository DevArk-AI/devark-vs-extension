/**
 * Session Types for Co-Pilot V2
 *
 * Backend type definitions for:
 * - Projects (workspace/repo grouping)
 * - Sessions (time-based activity grouping)
 * - Prompts (individual user prompts with scores)
 *
 * These types are used by SessionManagerService for:
 * - Session detection and creation
 * - Prompt grouping and pagination
 * - Storage persistence
 */

import type { SessionSource } from '../UnifiedSessionService';

/**
 * Supported AI tool platforms
 */
export type Platform = 'cursor' | 'claude_code' | 'vscode';

/**
 * Platform metadata for display
 */
export const PLATFORM_INFO: Record<Platform, { icon: string; name: string; color: string }> = {
  cursor: { icon: '🟣', name: 'Cursor', color: '#9333ea' },
  claude_code: { icon: '🟠', name: 'Claude Code', color: '#f97316' },
  vscode: { icon: '🔵', name: 'VS Code', color: '#3b82f6' },
};

/**
 * 5-dimension scoring weights
 * Total must equal 1.0
 */
export const SCORE_WEIGHTS = {
  specificity: 0.20,
  context: 0.25,
  intent: 0.25,
  actionability: 0.15,
  constraints: 0.15,
} as const;

/**
 * Individual dimension score
 */
export interface DimensionScore {
  score: number; // 0-10 scale
  weight: number; // Weight for weighted average
  feedback?: string; // Optional explanation
}

/**
 * Complete score breakdown for a prompt
 */
export interface ScoreBreakdown {
  specificity: DimensionScore;
  context: DimensionScore;
  intent: DimensionScore;
  actionability: DimensionScore;
  constraints: DimensionScore;
  total: number; // Weighted average, 0-10 scale
}

/**
 * Score explanation for "Why this score?" section
 */
export interface ScoreExplanation {
  goodPoints: string[]; // What the prompt did well
  missingElements: string[]; // What could be improved
  suggestions: string[]; // Actionable suggestions
}

/**
 * Individual prompt record within a session
 */
export interface PromptRecord {
  id: string;
  sessionId: string;
  text: string;
  truncatedText: string; // First ~100 chars for display
  timestamp: Date;
  score: number; // Overall score 0-10
  breakdown?: ScoreBreakdown;
  explanation?: ScoreExplanation;
  // Optional enhanced version
  enhancedText?: string;
  enhancedScore?: number;
}

/**
 * Serialized version for storage
 */
export interface SerializedPromptRecord extends Omit<PromptRecord, 'timestamp'> {
  timestamp: string; // ISO string
}

/**
 * Record of an agent response in the session
 * Links back to the prompt that triggered it
 */
export interface ResponseRecord {
  id: string;
  promptId: string; // Links to the PromptRecord that triggered this
  timestamp: Date;
  text: string; // Response text (truncated to 2000 chars)
  outcome: 'success' | 'partial' | 'error';
  filesModified: string[];
  toolCalls: string[]; // Tool names used
  source: SessionSource;
}

/**
 * Serialized version for storage
 */
export interface SerializedResponseRecord extends Omit<ResponseRecord, 'timestamp'> {
  timestamp: string; // ISO string
}

/**
 * Session - A grouping of prompts within a time window
 *
 * New session is created when:
 * - Different project detected
 * - Different tool/platform
 * - >2 hour gap in activity
 */
export interface Session {
  id: string;
  projectId: string;
  platform: Platform;
  startTime: Date;
  lastActivityTime: Date;
  promptCount: number;
  prompts: PromptRecord[];
  responses: ResponseRecord[]; // Agent responses linked to prompts
  goal?: string;
  goalSetAt?: Date;
  goalCompletedAt?: Date;
  goalProgress?: number; // 0-100 percentage, LLM-inferred progress toward goal
  isActive: boolean;
  // User-defined custom name for the session
  customName?: string;
  // Indicates this session has new activity the user hasn't seen
  hasUnreadActivity?: boolean;
  // Session metadata
  averageScore?: number;
  totalDuration?: number; // In minutes
  // Context extracted from prompts
  extractedContext?: SessionContext;
  // Cursor-specific metadata
  metadata?: {
    cursorComposerId?: string;
    cursorMessageCount?: number;
    files?: string[];
    // Native session ID from the source (Claude Code session_id or Cursor conversation_id)
    sourceSessionId?: string;
    [key: string]: unknown;
  };
}

/**
 * Serialized version for storage
 */
export interface SerializedSession extends Omit<Session, 'startTime' | 'lastActivityTime' | 'goalSetAt' | 'goalCompletedAt' | 'prompts' | 'responses'> {
  startTime: string;
  lastActivityTime: string;
  goalSetAt?: string;
  goalCompletedAt?: string;
  prompts: SerializedPromptRecord[];
  responses: SerializedResponseRecord[];
}

/**
 * Session context extracted from prompts
 * Used for suggestions and goal inference
 */
export interface SessionContext {
  techStack: string[]; // Detected technologies (React, TypeScript, etc.)
  entities: string[]; // Files, components, concepts mentioned
  keyDecisions: string[]; // Important choices made
  topics: string[]; // Main discussion topics
  lastUpdated: Date;
}

/**
 * Project - A workspace/repo grouping containing sessions
 */
export interface Project {
  id: string;
  name: string; // From git repo or folder name
  path?: string; // Full workspace path
  sessions: Session[];
  isExpanded: boolean; // UI state for sidebar
  // Aggregated stats
  totalSessions: number;
  totalPrompts: number;
  lastActivityTime?: Date;
}

/**
 * Serialized version for storage
 */
export interface SerializedProject extends Omit<Project, 'sessions' | 'lastActivityTime'> {
  sessions: SerializedSession[];
  lastActivityTime?: string;
}

/**
 * Session detection criteria
 */
export interface SessionDetectionConfig {
  /** Maximum gap between prompts to continue session (minutes) */
  maxInactivityMinutes: number;
  /** Minimum prompts to consider session valid */
  minPromptsForSession: number;
}

export const DEFAULT_SESSION_DETECTION_CONFIG: SessionDetectionConfig = {
  maxInactivityMinutes: 120, // 2 hours
  minPromptsForSession: 1,
};

/**
 * Session manager state persisted to storage
 */
export interface SessionManagerState {
  projects: SerializedProject[];
  activeSessionId: string | null;
  activeProjectId: string | null;
  config: SessionDetectionConfig;
  lastUpdated: string;
}

/**
 * Pagination options for prompt history
 */
export interface PromptPaginationOptions {
  sessionId: string;
  offset: number;
  limit: number;
}

/**
 * Paginated prompt result
 */
export interface PaginatedPrompts {
  prompts: PromptRecord[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

/**
 * Session filter options
 */
export interface SessionFilterOptions {
  projectId?: string;
  platform?: Platform;
  isActive?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  limit?: number;
}

/**
 * Session summary for display
 */
export interface SessionSummary {
  id: string;
  projectName: string;
  platform: Platform;
  startTime: Date;
  duration: number; // minutes
  promptCount: number;
  averageScore: number;
  isActive: boolean;
  goal?: string;
}

/**
 * Event emitted when session state changes
 */
export type SessionEventType =
  | 'session_created'
  | 'session_updated'
  | 'session_ended'
  | 'session_deleted'
  | 'session_activity'
  | 'prompt_added'
  | 'prompt_updated'
  | 'response_added'
  | 'goal_set'
  | 'goal_completed'
  | 'project_created';

export interface SessionEvent {
  type: SessionEventType;
  sessionId?: string;
  projectId?: string;
  promptId?: string;
  responseId?: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

/**
 * Callback for session events
 */
export type SessionEventCallback = (event: SessionEvent) => void;

/**
 * Prompt-Response interaction pair for conversation history
 */
export interface Interaction {
  prompt: PromptRecord;
  response?: ResponseRecord;
}

/**
 * Utility functions
 */

/**
 * Truncate text for display
 */
export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Format time ago
 */
export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Calculate session duration in minutes
 */
export function calculateSessionDuration(session: Session): number {
  const start = session.startTime.getTime();
  const end = session.lastActivityTime.getTime();
  return Math.round((end - start) / 60000);
}

/**
 * Get platform icon
 */
export function getPlatformIcon(platform: Platform): string {
  return PLATFORM_INFO[platform].icon;
}

/**
 * Create default score breakdown
 */
export function createDefaultScoreBreakdown(totalScore: number): ScoreBreakdown {
  return {
    specificity: { score: totalScore, weight: SCORE_WEIGHTS.specificity },
    context: { score: totalScore, weight: SCORE_WEIGHTS.context },
    intent: { score: totalScore, weight: SCORE_WEIGHTS.intent },
    actionability: { score: totalScore, weight: SCORE_WEIGHTS.actionability },
    constraints: { score: totalScore, weight: SCORE_WEIGHTS.constraints },
    total: totalScore,
  };
}

/**
 * Calculate weighted total from breakdown
 */
export function calculateWeightedScore(breakdown: Omit<ScoreBreakdown, 'total'>): number {
  return (
    breakdown.specificity.score * breakdown.specificity.weight +
    breakdown.context.score * breakdown.context.weight +
    breakdown.intent.score * breakdown.intent.weight +
    breakdown.actionability.score * breakdown.actionability.weight +
    breakdown.constraints.score * breakdown.constraints.weight
  );
}
