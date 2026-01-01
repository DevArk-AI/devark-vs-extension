/**
 * Response Types for Workstream B: Response Capture Hooks
 *
 * Types for capturing AI agent responses from Cursor and Claude Code.
 * Used by HookBasedPromptService to detect and process response events.
 */

import type { SessionSource } from '../UnifiedSessionService';

/**
 * Tool call made by the AI agent
 */
export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool result from Claude Code
 */
export interface ToolResult {
  tool: string;
  result: string;
}

/**
 * Stop reason - unified for both Cursor and Claude Code
 * Cursor uses: 'completed' | 'aborted' | 'error'
 * Claude Code uses: 'completed' | 'error' | 'cancelled'
 */
export type StopReason = 'completed' | 'aborted' | 'error' | 'cancelled';

/**
 * Captured response from either Cursor or Claude Code
 *
 * This is the normalized format that the extension works with,
 * regardless of the source AI tool.
 */
export interface CapturedResponse {
  /** Unique identifier for this response */
  id: string;

  /** ISO timestamp when response was captured */
  timestamp: string;

  /** Source tool: 'cursor' or 'claude_code' */
  source: SessionSource;

  /** The AI agent's response text (truncated to 5000 chars) */
  response: string;

  /** Whether the response completed successfully */
  success: boolean;

  // ========================================
  // Cursor-specific fields
  // ========================================

  /** Cursor conversation ID */
  conversationId?: string;

  /** Cursor generation ID */
  generationId?: string;

  /** Model used (e.g., 'claude-3-5-sonnet') */
  model?: string;

  /** Tool calls made by the agent (max 10) */
  toolCalls?: ToolCall[];

  /** Files modified by the agent (max 20) */
  filesModified?: string[];

  /** Cursor version */
  cursorVersion?: string;

  // ========================================
  // Claude Code-specific fields
  // ========================================

  /** Claude Code session ID */
  sessionId?: string;

  /** Path to the transcript file */
  transcriptPath?: string;

  /** Stop reason: 'completed', 'error', or 'cancelled' */
  reason?: StopReason;

  /** Tool results from Claude Code (max 10) */
  toolResults?: ToolResult[];

  /** Current working directory */
  cwd?: string;

  // ========================================
  // Common fields
  // ========================================

  /** Workspace roots for context */
  workspaceRoots?: string[];

  // ========================================
  // Prompt linking fields (for coaching)
  // ========================================

  /** ID of the prompt that triggered this response */
  promptId?: string;

  /** Original prompt text (for context) */
  promptText?: string;

  /** When the prompt was submitted */
  promptTimestamp?: string;

  // ========================================
  // Final Response Fields (Stop Hook)
  // ========================================

  /** Whether this is a final response (from stop hook) */
  isFinal?: boolean;

  /** Stop reason from Cursor stop hook: 'completed', 'aborted', 'error' */
  stopReason?: StopReason;

  /** Number of agent loop iterations (Cursor stop hook only) */
  loopCount?: number;

  /** Which hook triggered this capture */
  hookType?: 'afterAgentResponse' | 'stop' | 'Stop';

  /** User email from Cursor (available in all hooks) */
  userEmail?: string;
}

/**
 * Response detection event emitted by HookBasedPromptService
 */
export interface ResponseDetectedEvent {
  /** The captured response data */
  response: CapturedResponse;

  /** Timestamp when the event was detected */
  detectedAt: Date;
}

/**
 * Response file pattern for file system watching
 * Matches:
 *   cursor-response-*.json (intermediate, afterAgentResponse)
 *   cursor-response-final-*.json (final, stop hook)
 *   claude-response-*.json (Claude Code)
 */
export const RESPONSE_FILE_PATTERN = /^(cursor-response(?:-final)?|claude-response)-\d+\.json$/;

/**
 * Latest response file names (for quick access)
 */
export const LATEST_RESPONSE_FILES = {
  cursor: 'latest-cursor-response.json',
  cursorFinal: 'latest-cursor-response-final.json',
  claude: 'latest-claude-response.json',
} as const;

/**
 * Check if a filename is a response file
 */
export function isResponseFile(filename: string): boolean {
  return RESPONSE_FILE_PATTERN.test(filename);
}

/**
 * Check if a filename is a "latest" response file (should be skipped)
 */
export function isLatestResponseFile(filename: string): boolean {
  return (
    filename === LATEST_RESPONSE_FILES.cursor ||
    filename === LATEST_RESPONSE_FILES.cursorFinal ||
    filename === LATEST_RESPONSE_FILES.claude
  );
}

/**
 * Extract source from response filename
 */
export function getSourceFromFilename(filename: string): SessionSource | null {
  if (filename.startsWith('cursor-response-final-') || filename.startsWith('cursor-response-')) {
    return 'cursor';
  }
  if (filename.startsWith('claude-response-')) {
    return 'claude_code';
  }
  return null;
}

/**
 * Check if filename represents a final response (from stop hook)
 */
export function isFinalResponseFile(filename: string): boolean {
  return filename.includes('-response-final-');
}

/**
 * Response statistics for tracking
 */
export interface ResponseStats {
  /** Total responses captured */
  totalResponses: number;

  /** Successful responses */
  successfulResponses: number;

  /** Failed/errored responses */
  failedResponses: number;

  /** Responses by source */
  bySource: {
    cursor: number;
    claude_code: number;
  };

  /** Average response length */
  averageResponseLength: number;

  /** Most used tools */
  topTools: Array<{ name: string; count: number }>;
}

/**
 * Create empty response stats
 */
export function createEmptyResponseStats(): ResponseStats {
  return {
    totalResponses: 0,
    successfulResponses: 0,
    failedResponses: 0,
    bySource: {
      cursor: 0,
      claude_code: 0,
    },
    averageResponseLength: 0,
    topTools: [],
  };
}

/**
 * Response coaching context - used for generating coaching suggestions
 */
export interface ResponseCoachingContext {
  /** The original prompt that led to this response */
  promptId?: string;

  /** The captured response */
  response: CapturedResponse;

  /** Whether the response achieved the intended goal */
  goalAchieved?: boolean;

  /** Detected issues or inefficiencies */
  issues?: string[];

  /** Suggested improvements for future prompts */
  suggestions?: string[];
}

/**
 * Conversation state captured at stop hook
 * Aggregates data across entire conversation for coaching analysis
 */
export interface ConversationState {
  /** Conversation identifier */
  conversationId: string;

  /** When conversation started (first prompt timestamp) */
  startTime?: string;

  /** When conversation ended (stop hook timestamp) */
  endTime: string;

  /** Total duration in milliseconds */
  durationMs?: number;

  /** Number of user prompts in conversation */
  totalPrompts: number;

  /** Number of assistant responses (afterAgentResponse calls) */
  totalResponses: number;

  /** Final stop reason from Cursor */
  stopReason: StopReason;

  /** Agent loop iterations (from stop hook) */
  loopCount: number;

  /** All files modified during conversation (deduplicated) */
  filesModified: string[];

  /** All tools used during conversation (deduplicated) */
  toolsUsed: string[];
}
