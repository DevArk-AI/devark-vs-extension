/**
 * Session types - represents coding sessions from Claude Code or Cursor
 */

import type { Message, SanitizationMetadata } from './message.types';
import type { SessionSource } from '../services/UnifiedSessionService';

export type ToolType = 'claude_code' | 'cursor' | 'vscode';

export interface ModelUsageStats {
  models: string[];                    // All unique models used
  primaryModel: string | null;         // Most frequently used model
  modelUsage: Record<string, number>;  // Model ID -> message count
  modelSwitches: number;               // Number of times model changed
}

export interface PlanningModeInfo {
  hasPlanningMode: boolean;           // True if any ExitPlanMode detected
  planningCycles: number;             // Count of ExitPlanMode tool uses
  exitPlanTimestamps: Date[];         // Timestamps when ExitPlanMode was called
}

export interface SessionMetadata {
  files_edited: number;
  languages: string[];
  editedFiles?: string[];    // Actual file paths that were edited
  models?: string[];         // All models used in session
  primaryModel?: string;     // Most frequently used model
  gitBranch?: string;        // Git branch from JSONL
  hasPlanningMode?: boolean;
  planningCycles?: number;
  exitPlanTimestamps?: string[];
}

/**
 * Conversation highlights extracted for efficient summarization
 */
export interface ConversationHighlights {
  /** First user message showing intent (truncated) */
  firstUserMessage?: string;
  /** Claude Code's auto-generated session summaries */
  sessionSummaries?: string[];
  /** Last meaningful exchange (truncated) */
  lastExchange?: {
    userMessage: string;
    assistantResponse: string;
  };
}

export interface SourceFileInfo {
  claudeProjectPath: string;  // e.g., ~/.claude/projects/-home-user-vibe-log
  sessionFile: string;        // e.g., session-123.jsonl
}

/**
 * Raw session data from session readers
 */
/**
 * Token usage data for context window tracking.
 * When source is 'api', values are from actual Claude API response.
 * When source is 'estimated', values are tiktoken estimates (fallback).
 */
export interface TokenUsageData {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Cache tokens created during this session (reduces future input costs) */
  cacheCreationInputTokens?: number;
  /** Cache tokens read (reused from previous context) */
  cacheReadInputTokens?: number;
  /** Source of the data: 'api' for actual usage, 'estimated' for tiktoken */
  source?: 'api' | 'estimated';
}

export interface SessionData {
  id: string;
  projectPath: string;
  timestamp: Date;
  messages: Message[];
  duration: number;
  tool: ToolType;
  claudeSessionId?: string;  // Claude's unique session identifier
  metadata?: SessionMetadata;
  modelInfo?: ModelUsageStats;
  planningModeInfo?: PlanningModeInfo;
  gitBranch?: string;
  sourceFile?: SourceFileInfo;
  highlights?: ConversationHighlights;  // Conversation highlights for summarization
  tokenUsage?: TokenUsageData;  // Token usage for context window tracking
}

/**
 * Sanitized session ready for upload
 */
export interface SanitizedSession {
  id: string;
  tool: ToolType;
  timestamp: string;  // ISO string for API
  duration: number;
  claudeSessionId?: string;
  data: {
    projectName: string;
    messageSummary: string;  // JSON string with aggregated stats
    messageCount: number;
    metadata: SessionMetadata;
  };
  sanitizationMetadata: SanitizationMetadata;
}

/**
 * Reader options for filtering sessions
 */
export interface ReaderOptions {
  since?: Date;
  projectPath?: string;
  limit?: number;
}

/**
 * Duration calculation result
 */
export interface DurationResult {
  seconds: number;
  activeGaps: number;
  idleGaps: number;
}

/**
 * Language statistics from session
 */
export interface LanguageStats {
  languages: string[];
  counts: Record<string, number>;
  primaryLanguage: string | null;
}

/**
 * Lightweight session index for fast queries.
 * Contains only metadata needed for filtering, counting, and display.
 * Does NOT include messages, highlights, or raw data.
 */
export interface SessionIndex {
  id: string;
  source: SessionSource;
  timestamp: Date;
  duration: number;           // seconds
  projectPath: string;
  workspaceName: string;
  promptCount: number;
  tokenUsage?: TokenUsageData;  // Token usage for context window tracking
}

/**
 * Session details loaded on-demand.
 * Contains the heavy data that's expensive to load.
 */
export interface SessionDetails {
  messages: Message[];
  highlights?: ConversationHighlights;
  modelInfo?: ModelUsageStats;
  planningModeInfo?: PlanningModeInfo;
  fileContext?: string[];
}
