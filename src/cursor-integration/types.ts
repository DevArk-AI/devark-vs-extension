/**
 * TypeScript types for Cursor Integration
 *
 * Defines interfaces for:
 * - Cursor hooks data
 * - SQLite database schema
 * - Session tracking
 * - Prompt analysis
 */

import type { ConversationHighlights } from '../types';

/**
 * Database interface for Cursor's SQLite database.
 * Abstracted to allow dependency injection for testing.
 */
export interface ICursorDatabase {
  exec(sql: string): { values: any[][] }[];
  prepare(sql: string): {
    bind(params: any[]): void;
    step(): boolean;
    get(): any[];
    free(): void;
  };
  close(): void;
}

/**
 * Cursor Hook Types
 */
export interface CursorHookPayload {
  text: string;  // The assistant's response text
}

export type CursorHookType = 'afterAgentResponse';

export interface CursorHookEvent {
  type: CursorHookType;
  payload: CursorHookPayload;
  timestamp: Date;
}

/**
 * Cursor SQLite Database Types
 */

// The main key-value table in Cursor's state.vscdb
export interface CursorDiskKVRow {
  key: string;    // Format: "composerData:<composerId>"
  value: string;  // JSON string containing composer data
}

// Parsed composer data (supports multiple Cursor versions)
export interface ComposerData {
  _v?: number;  // Version number (3 = legacy, 9/10+ = modern)
  id: string;
  composerId?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  lastUpdatedAt?: number;
  // Legacy format: message arrays with text directly
  messages?: RawCursorMessage[];
  conversation?: RawCursorMessage[];
  conversationHistory?: RawCursorMessage[];
  // Modern format (v9+): headers only, actual text stored in bubbleId:* keys
  fullConversationHeadersOnly?: ConversationHeader[];
  // Add more fields as discovered through testing
  [key: string]: any;
}

// Modern format conversation header (v9+)
export interface ConversationHeader {
  bubbleId: string;
  type: number;  // 1 = user, 2 = assistant
}

/**
 * Raw message format from Cursor database
 * Structure varies by Cursor version
 */
export interface RawCursorMessage {
  role?: 'user' | 'assistant' | 'system';
  type?: number | string; // Some versions use type instead of role
  content?: string;
  text?: string; // Some versions use text instead of content
  message?: string; // Some versions use message
  timestamp?: string | number;
  bubbleId?: string;
  [key: string]: any;
}

/**
 * Normalized message data extracted from Cursor sessions
 * Used for consistent handling regardless of Cursor DB format
 */
export interface MessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  bubbleId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Session Types
 */

export type SessionStatus = 'active' | 'historical';

export interface CursorSession {
  sessionId: string;         // composerId from Cursor DB
  workspaceName: string;     // Project name
  workspacePath?: string;    // Full path to workspace
  startTime: Date;           // When session started
  lastActivity: Date;        // Last message timestamp
  promptCount: number;       // Number of prompts in session
  status: SessionStatus;     // Active or historical
  fileContext?: string[];    // Files mentioned in conversation
  /** Extracted conversation highlights for summarization */
  highlights?: ConversationHighlights;
}

/**
 * Prompt Types
 */

export type PromptStatus = 'pending' | 'analyzing' | 'completed' | 'failed';

export interface PromptData {
  id: string;                // Unique ID for this prompt
  sessionId: string;         // Which session this belongs to
  timestamp: Date;           // When prompt was sent
  userPrompt: string;        // The user's input
  assistantResponse?: string; // The AI's response
  status: PromptStatus;      // Analysis status
  analysisId?: string;       // ID of analysis result if completed
}

/**
 * Analysis Types
 */

export interface PromptAnalysis {
  id: string;                // Unique ID for this analysis
  promptId: string;          // Which prompt was analyzed
  timestamp: Date;           // When analysis completed
  result: {
    overallScore: number;
    categoryScores: {
      clarity: number;
      specificity: number;
      context: number;
      actionability: number;
    };
    strengths: string[];
    improvements: string[];
    rewrittenPrompt: string;
    explanation: string;
  };
  modelUsed: string;         // Which AI model did the analysis
  analysisTimeMs: number;    // How long analysis took
}

/**
 * Settings Types
 */

export interface CoPilotSettings {
  enabled: boolean;           // Is co-pilot monitoring active?
  autoAnalyze: boolean;       // Analyze prompts automatically?
  model: string;              // Which model to use for analysis
  verbosity: 'concise' | 'detailed';  // Feedback detail level
  maxHistorySize: number;     // Max prompts to keep in memory (default: 50)
}

export const DEFAULT_COPILOT_SETTINGS: CoPilotSettings = {
  enabled: true,
  autoAnalyze: true,
  model: 'gpt-4o',
  verbosity: 'detailed',
  maxHistorySize: 50
};

/**
 * Storage Types
 */

export interface CoPilotStorage {
  sessions: CursorSession[];
  prompts: PromptData[];
  analyses: PromptAnalysis[];
  settings: CoPilotSettings;
  lastSync: Date;
}

/**
 * WebView Message Types
 */

export type WebViewMessageType =
  | 'init'
  | 'promptCaptured'
  | 'analysisStarted'
  | 'analysisProgress'
  | 'analysisCompleted'
  | 'analysisFailed'
  | 'settingsUpdated'
  | 'sessionSelected'
  | 'requestAnalysis'
  | 'updateSettings'
  | 'clearHistory';

export interface WebViewMessage {
  type: WebViewMessageType;
  data?: any;
  error?: string;
}

/**
 * Extension to WebView Messages
 */

export interface PromptCapturedMessage extends WebViewMessage {
  type: 'promptCaptured';
  data: {
    prompt: PromptData;
    session: CursorSession;
  };
}

export interface AnalysisStartedMessage extends WebViewMessage {
  type: 'analysisStarted';
  data: {
    promptId: string;
  };
}

export interface AnalysisProgressMessage extends WebViewMessage {
  type: 'analysisProgress';
  data: {
    promptId: string;
    progress: number;  // 0-100
    status: string;
  };
}

export interface AnalysisCompletedMessage extends WebViewMessage {
  type: 'analysisCompleted';
  data: {
    analysis: PromptAnalysis;
  };
}

export interface AnalysisFailedMessage extends WebViewMessage {
  type: 'analysisFailed';
  data: {
    promptId: string;
    error: string;
  };
}

export interface SettingsUpdatedMessage extends WebViewMessage {
  type: 'settingsUpdated';
  data: {
    settings: CoPilotSettings;
  };
}

/**
 * WebView to Extension Messages
 */

export interface RequestAnalysisMessage extends WebViewMessage {
  type: 'requestAnalysis';
  data: {
    promptId: string;
  };
}

export interface UpdateSettingsMessage extends WebViewMessage {
  type: 'updateSettings';
  data: {
    settings: Partial<CoPilotSettings>;
  };
}

export interface SessionSelectedMessage extends WebViewMessage {
  type: 'sessionSelected';
  data: {
    sessionId: string;
  };
}

export interface ClearHistoryMessage extends WebViewMessage {
  type: 'clearHistory';
  data?: {
    sessionId?: string;  // If provided, clear only this session
  };
}

/**
 * Analysis Queue Types
 */

export interface AnalysisQueueItem {
  promptId: string;
  priority: number;      // Higher = more urgent
  addedAt: Date;
  retryCount: number;
}

/**
 * Model Executor Types
 */

export interface ModelRequest {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface ModelResponse {
  text: string;
  model: string;
  tokensUsed?: number;
  finishReason?: string;
}

export interface ModelError {
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * Utility Types
 */

export type ScoreColor = 'red' | 'yellow' | 'green';

export function getScoreColor(score: number): ScoreColor {
  if (score >= 8) return 'green';
  if (score >= 5) return 'yellow';
  return 'red';
}

export function getStatusIcon(status: PromptStatus): string {
  switch (status) {
    case 'pending': return '🔵';
    case 'analyzing': return '🟡';
    case 'completed': return '🟢';
    case 'failed': return '🔴';
  }
}

export function getSessionStatusIcon(status: SessionStatus): string {
  return status === 'active' ? '🟢' : '⚪';
}

/**
 * Database Query Types
 */

export interface SessionQuery {
  status?: SessionStatus;
  workspaceName?: string;
  limit?: number;
  offset?: number;
}

export interface PromptQuery {
  sessionId?: string;
  status?: PromptStatus;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'score';
  sortOrder?: 'asc' | 'desc';
}

export interface AnalysisQuery {
  promptId?: string;
  sessionId?: string;
  minScore?: number;
  maxScore?: number;
  limit?: number;
  offset?: number;
}
