/**
 * State Management Types
 *
 * Global state type definitions for the Menu panel
 */

// Authentication state
export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  error: string | null;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  avatar?: string;
  provider: 'github' | 'twitter';
}

// Status/Dashboard state
export interface StatusState {
  streak: StreakData | null;
  points: number;
  level: number;
  recentSessions: Session[];
  loading: boolean;
  error: string | null;
}

export interface StreakData {
  current: number;
  longest: number;
  lastActivity: string;
}

export interface Session {
  id: string;
  timestamp: string;
  tool: 'claude_code' | 'cursor' | 'vscode';
  project: string;
  duration: number;
  messageCount: number;
  summary?: string;
}

// Upload state (Claude + Cursor)
export interface UploadState {
  inProgress: boolean;
  progress: number;
  message: string;
  result: UploadResult | null;
  error: string | null;
}

export interface UploadResult {
  sessionsUploaded: number;
  duplicates: number;
  failed: number;
  totalMessages: number;
  projects: string[];
}

// Hooks state
export interface HooksState {
  claude: ClaudeHooksStatus;
  cursor: CursorHooksStatus;
  loading: boolean;
  error: string | null;
}

export interface ClaudeHooksStatus {
  sessionStart: HookStatus;
  preCompact: HookStatus;
}

export interface CursorHooksStatus {
  afterAgentResponse: HookStatus;
}

export interface HookStatus {
  installed: boolean;
  version?: string;
  lastRun?: string;
  successRate?: number;
  executions?: number;
}

// Reports state
export interface ReportsState {
  generating: boolean;
  progress: number;
  message: string;
  result: ReportResult | null;
  error: string | null;
}

export interface ReportResult {
  html: string;
  type: 'daily' | 'weekly' | 'custom';
  dateRange: {
    start: string;
    end: string;
  };
  sessionCount: number;
}

// Global app state
export interface AppState {
  auth: AuthState;
  status: StatusState;
  upload: UploadState;
  hooks: HooksState;
  reports: ReportsState;
  currentSection: Section;
  theme: 'light' | 'dark' | 'high-contrast';
}

export type Section =
  | 'auth'
  | 'status'
  | 'claude-sessions'
  | 'cursor-sessions'
  | 'hooks'
  | 'reports';

// Action types for state updates
export type Action =
  | { type: 'SET_SECTION'; payload: Section }
  | { type: 'SET_THEME'; payload: 'light' | 'dark' | 'high-contrast' }
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: User }
  | { type: 'AUTH_ERROR'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'STATUS_LOADING' }
  | { type: 'STATUS_SUCCESS'; payload: Partial<StatusState> }
  | { type: 'STATUS_ERROR'; payload: string }
  | { type: 'UPLOAD_START'; payload: string }
  | { type: 'UPLOAD_PROGRESS'; payload: { progress: number; message: string } }
  | { type: 'UPLOAD_SUCCESS'; payload: UploadResult }
  | { type: 'UPLOAD_ERROR'; payload: string }
  | { type: 'UPLOAD_RESET' }
  | { type: 'HOOKS_LOADING' }
  | { type: 'HOOKS_SUCCESS'; payload: Partial<HooksState> }
  | { type: 'HOOKS_ERROR'; payload: string }
  | { type: 'REPORT_START'; payload: string }
  | { type: 'REPORT_PROGRESS'; payload: { progress: number; message: string } }
  | { type: 'REPORT_SUCCESS'; payload: ReportResult }
  | { type: 'REPORT_ERROR'; payload: string }
  | { type: 'REPORT_RESET' };
