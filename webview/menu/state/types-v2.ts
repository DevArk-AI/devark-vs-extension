/**
 * State Types V2 - Redesigned State Management
 *
 * New types for the redesigned Vibe-Log Co-Pilot extension
 */

import type { SessionSource } from '@shared/webview-protocol';

// Tab navigation
export type MainTab = 'copilot' | 'summaries' | 'account';
export type SummaryPeriod = 'standup' | 'today' | 'week' | 'month' | 'custom';

// Sidebar types
export type SidebarState = 'collapsed' | 'default' | 'expanded';

export interface SidebarConfig {
  width: number;
  state: SidebarState;
  isCollapsed: boolean;
}

// Sidebar width constants
export const SIDEBAR_WIDTH = {
  MIN: 60,       // Icons only
  DEFAULT: 240,  // Default width
  MAX: 400,      // Maximum width
} as const;

// Platform types for sessions
export type Platform = 'cursor' | 'claude_code' | 'vscode';

// Platform configuration - centralized styling using CSS variables
export interface PlatformConfig {
  icon: string;       // Emoji fallback when favicon fails
  faviconUrl?: string;
  colorVar: string;   // CSS variable name
  label: string;
}

export const PLATFORM_CONFIG: Record<Platform, PlatformConfig> = {
  cursor: {
    icon: '\u25CF',   // Filled circle - styled with CSS color
    faviconUrl: 'https://cursor.com/favicon.ico',
    colorVar: 'var(--platform-cursor)',
    label: 'Cursor'
  },
  claude_code: {
    icon: '\u25CF',   // Filled circle - styled with CSS color
    faviconUrl: 'https://code.claude.com/docs/_mintlify/favicons/claude-code/pLsy-mRpNksna2sx/_generated/favicon-dark/favicon.ico',
    colorVar: 'var(--platform-claude)',
    label: 'Claude Code'
  },
  vscode: {
    icon: '\u25CF',   // Filled circle - styled with CSS color
    colorVar: 'var(--platform-vscode)',
    label: 'VS Code'
  },
};

// Project and Session types for sidebar
export interface Project {
  id: string;
  name: string;
  path?: string; // Full workspace path
  sessions: Session[];
  isExpanded: boolean;
}

export interface Session {
  id: string;
  projectId: string;
  platform: Platform;
  startTime: Date;
  lastActivityTime: Date;
  promptCount: number;
  isActive: boolean;
  hasUnreadActivity?: boolean; // Indicates new activity user hasn't seen
  goal?: string;
  customName?: string; // User-defined name for the session
}

// Sidebar mode for toggling between Projects view and Prompt Lab view
export type SidebarMode = 'projects' | 'prompt-lab';

// Saved prompt for Prompt Lab library
export interface SavedPrompt {
  id: string;
  text: string;
  name?: string;
  tags: string[];
  folder?: string;
  projectId?: string; // null/undefined = global library
  createdAt: Date;
  lastModifiedAt: Date;
  lastScore?: number;
  improvedVersion?: string;
  improvedScore?: number;
  lastAnalyzedAt?: Date;
}

// Context used in Prompt Lab analysis (for UI transparency)
export interface PromptLabContextUsed {
  goal?: string;
  techStack: string[];
  snippetCount: number;
  topicsCount: number;
}

// Prompt Lab state (isolated from main CoPilot state)
export interface PromptLabState {
  currentPrompt: string;
  isAnalyzing: boolean;
  isEnhancing: boolean;
  isScoringEnhanced: boolean;
  currentAnalysis: AnalyzedPrompt | null;
  savedPrompts: SavedPrompt[];
  selectedTags: string[];
  selectedFolder?: string;
  lastContextUsed?: PromptLabContextUsed;
}

export interface PromptRecord {
  id: string;
  text: string;
  truncatedText: string;
  timestamp: Date;
  score: number;
  breakdown?: ScoreBreakdown;
}

// Score breakdown for 5-dimension scoring
export interface ScoreBreakdown {
  specificity: { score: number; weight: 0.20 };
  context: { score: number; weight: 0.25 };
  intent: { score: number; weight: 0.25 };
  actionability: { score: number; weight: 0.15 };
  constraints: { score: number; weight: 0.15 };
  total: number;
}

// Coaching types for Workstream D
export interface CoachingSuggestion {
  id: string;
  type: string;
  title: string;
  description: string;
  suggestedPrompt: string;
  confidence: number;
}

/**
 * Conversation state captured at stop hook
 * Aggregates data across entire conversation for coaching analysis
 */
export interface ConversationState {
  conversationId: string;
  startTime?: string;
  endTime: string;
  durationMs?: number;
  totalPrompts: number;
  totalResponses: number;
  stopReason: 'completed' | 'aborted' | 'error' | 'cancelled';
  loopCount: number;
  filesModified: string[];
  toolsUsed: string[];
}

/**
 * Final response detected message (from Cursor stop hook)
 */
export interface FinalResponseDetectedMessage {
  type: 'finalResponseDetected';
  id: string;
  source: 'cursor' | 'claude_code';
  stopReason: string;
  loopCount: number;
  success: boolean;
  conversationId?: string;
  timestamp: string;
  conversationState: ConversationState | null;
  linkedPromptId?: string;
  linkedPromptText?: string;
}

export interface CoachingAnalysis {
  summary: string;
  outcome: string;
  entitiesModified?: string[];
  toolsUsed?: string[];
  goalProgress?: {
    before: number;
    after: number;
    justCompleted?: string;
  };
}

export interface CoachingData {
  analysis: CoachingAnalysis;
  suggestions: CoachingSuggestion[];
  timestamp: Date;
  responseId?: string;
  // Prompt linking fields (Workstream D)
  promptId?: string;
  promptText?: string;
  source?: 'cursor' | 'claude_code';
  sessionId?: string;
}

export interface ContextUsed {
  goal?: string;
  promptCount: number;
  snippetCount: number;
}

export interface SessionContext {
  topics: Array<{ topic: string; count: number }>;
  alreadyAddressed: string[];
  promptCount: number;
}

// Daily stats types
export interface DailyStatsData {
  promptCount: number;
  averageScore: number;
  deltaVsUsual: number;
  percentileRank: number;
}

// Suggestion types
export type SuggestionType =
  | 'add_context'
  | 'combine_prompts'
  | 'progress_check'
  | 'resume_session'
  | 'be_specific'
  | 'set_goal';

export interface CoPilotSuggestionData {
  id: string;
  type: SuggestionType;
  title: string;
  content: string;
  actionLabel: string;
  dismissible: boolean;
  timestamp: Date;
}

// Date range for custom summary periods
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// LLM Provider types
export interface LLMProvider {
  id: string;
  name: string;
  type: 'cli' | 'local' | 'cloud';
  status: 'connected' | 'available' | 'not-configured' | 'not-running' | 'not-detected' | 'not-logged-in';
  description: string;
  model?: string;
  availableModels?: string[]; // Available models from the provider (e.g., Ollama models)
  requiresApiKey?: boolean;
}

// Feature-specific model configuration types
export type FeatureType = 'summaries' | 'scoring' | 'improvement';

export interface FeatureModelConfig {
  enabled: boolean;
  summaries: string;
  promptScoring: string;
  promptImprovement: string;
}

export interface FeatureModelOption {
  providerId: string;
  model: string; // Format: "provider:model"
  displayName: string; // Human-readable name for UI
}

// Explanation point for score breakdown
export interface ExplanationPoint {
  label: string;
  description?: string;
  dimension?: 'specificity' | 'context' | 'intent' | 'actionability' | 'constraints';
}

// Score explanation for UI display
export interface ScoreExplanationV2 {
  goodPoints: ExplanationPoint[];
  missingElements: ExplanationPoint[];
  suggestions: string[];
}

// Prompt analysis types
export interface AnalyzedPrompt {
  id: string;
  text: string;
  truncatedText: string;
  score: number;
  timestamp: Date;
  categoryScores?: {
    clarity: number;
    specificity: number;
    context: number;
    actionability: number;
  };
  quickWins?: string[];
  improvedVersion?: string;
  improvedScore?: number;
  // V2 additions
  breakdown?: ScoreBreakdown;
  explanation?: ScoreExplanationV2;
  // Source metadata for "Use this prompt" injection
  source?: 'cursor' | 'claude_code';
  sessionId?: string;
}

// Cloud connection state
export interface CloudState {
  isConnected: boolean;
  isLoading?: boolean;
  username?: string;
  autoSyncEnabled: boolean;
  lastSynced?: Date;
}

// Upload history for ACCOUNT tab
export interface UploadHistoryItem {
  timestamp: Date;
  sessionCount: number;
  status: 'success' | 'failed';
}

// Sync status for ACCOUNT tab
export interface SyncStatus {
  localSessions: number;
  syncedSessions: number;
  pendingUploads: number;
  lastSynced?: Date;
}

// Sync filter options
export interface SyncFilterOptions {
  filterType: 'all' | 'recent' | 'date-range' | 'project';
  // For 'recent' filter
  limit?: number;
  // For 'date-range' filter
  startDate?: string;
  endDate?: string;
  // For 'project' filter (future implementation)
  projectPath?: string;
}

// Sync preview result
export interface SyncPreview {
  totalSessions: number;
  estimatedSizeKB: number;
  dateRange?: {
    oldest: Date;
    newest: Date;
  };
  projects?: string[];
  filteredOutShort?: number; // Number of sessions < 4 minutes filtered out
  sessionsBySource?: SessionsBySource; // Breakdown by source (Cursor vs Claude Code)
}

// Editor info (Cursor vs VS Code)
export interface EditorInfo {
  isCursor: boolean;
  editorName: 'Cursor' | 'VS Code';
  autoDetectSupported: boolean;
}

// Session source breakdown
export interface SessionsBySource {
  cursor: number;
  claudeCode: number;
  total: number;
}

// Error types for summary generation failures
export type SummaryErrorType = 'rate_limit' | 'auth_failed' | 'network' | 'no_provider' | 'unknown';

// Structured error info for summary fallbacks
export interface SummaryError {
  type: SummaryErrorType;
  message: string;
  suggestion: string;
}

// Business outcome type
export type BusinessCategory = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test' | 'research' | 'other';

export interface BusinessOutcome {
  project: string;
  objective: string;
  outcome: string; // completed | in-progress | blocked
  category: BusinessCategory;
}

// Activity type for activity distribution
export type ActivityType = 'Development' | 'Debugging' | 'Refactoring' | 'Testing' | 'Planning' | 'Research' | 'Review' | 'Documentation' | 'Other';

// Prompt quality metrics
export interface PromptQualityMetrics {
  averageScore: number; // 0-100
  breakdown: {
    excellent: number; // percentage
    good: number;
    fair: number;
    poor: number;
  };
  insights?: string;
}

// Project breakdown item for reports
export interface ProjectBreakdownItem {
  name: string;
  sessions: number;
  largestSession: string; // duration string like "2h 30m"
  focus: string; // main activity description
}

// Summary data types
export interface DailySummary {
  date: Date;
  totalMessages: number; // Total messages/prompts (not analyzed, just counted)
  avgScore: number;
  timeCoding: number; // minutes
  filesWorkedOn: number;
  sessions: number;
  bestPromptScore: number;
  workedOn: string[];
  suggestedFocus: string[];
  // New: Session source breakdown
  sessionsBySource?: SessionsBySource;
  // New: Business outcomes
  businessOutcomes?: BusinessOutcome[];
  // New: AI provider info
  providerInfo?: {
    model: string;
    provider: string;
  };
  // New: Summary source
  source?: 'ai' | 'fallback';
  // New: Additional insights
  insights?: string;
  // New: Error info when falling back
  error?: SummaryError;
}

export interface StandupSummary {
  previousWorkday: DailySummary;
  previousWorkdayDate: Date;
  weekendActivity?: {
    hasSaturday: boolean;
    hasSunday: boolean;
    totalMinutes: number;
    projectsWorkedOn: string[];
  };
  totalSessions: number;
  totalTimeCoding: number;
  sessionsBySource?: SessionsBySource;
  suggestedFocusForToday: string[];
  source?: 'ai' | 'fallback';
  providerInfo?: { model: string; provider: string };
  error?: SummaryError;
}

export interface WeeklySummary {
  startDate: Date;
  endDate: Date;
  totalTime: number; // minutes
  totalMessages: number; // Total messages/prompts (not analyzed, just counted)
  avgScore: number;
  scoreTrend: number; // compared to last week
  sessions: number;
  dailyBreakdown: {
    day: string;
    time: number;
    prompts: number;
    avgScore: number;
  }[];
  topProjects: {
    name: string;
    time: number;
    prompts: number;
  }[];
  // New: Session source breakdown
  sessionsBySource?: SessionsBySource;
  // New: Business outcomes
  businessOutcomes?: BusinessOutcome[];
  // New: AI provider info
  providerInfo?: {
    model: string;
    provider: string;
  };
  // New: Summary source
  source?: 'ai' | 'fallback';
  // New: Additional insights
  insights?: string;
  // New: Key achievements (accomplishments)
  achievements?: string[];
  // Enhanced report fields
  executiveSummary?: string[];
  activityDistribution?: Record<string, number>; // e.g., {Development: 35, Debugging: 25, ...}
  promptQuality?: PromptQualityMetrics;
  projectBreakdown?: ProjectBreakdownItem[];
  // New: Error info when falling back
  error?: SummaryError;
}

export interface MonthlySummary {
  month: string;
  year: number;
  totalTime: number;
  totalMessages: number; // Total messages/prompts (not analyzed, just counted)
  avgScore: number;
  scoreTrend: number;
  sessions: number;
  activeDays: number;
  totalDays: number;
  weeklyBreakdown: {
    week: number;
    time: number;
    prompts: number;
    avgScore: number;
  }[];
  // New: Session source breakdown
  sessionsBySource?: SessionsBySource;
  // New: Business outcomes
  businessOutcomes?: BusinessOutcome[];
  // New: AI provider info
  providerInfo?: {
    model: string;
    provider: string;
  };
  // New: Summary source
  source?: 'ai' | 'fallback';
  // New: Additional insights
  insights?: string;
  // New: Key achievements (accomplishments)
  achievements?: string[];
  // New: Trends
  trends?: string[];
  // Enhanced report fields
  executiveSummary?: string[];
  activityDistribution?: Record<string, number>; // e.g., {Development: 35, Debugging: 25, ...}
  promptQuality?: PromptQualityMetrics;
  projectBreakdown?: ProjectBreakdownItem[];
  // New: Error info when falling back
  error?: SummaryError;
}

// Settings state
export interface SettingsState {
  autoAnalyzeEnabled: boolean;
  responseAnalysisEnabled: boolean;
  generateDailySummary: boolean;
  llmProvider: string;
}

export type CoachingPhase = 'idle' | 'analyzing_response' | 'generating_coaching';

// Main app state for redesign
export interface AppStateV2 {
  // Navigation
  currentTab: MainTab;
  currentView: 'loading' | 'main' | 'onboarding' | 'settings' | 'provider-select' | 'hook-setup';

  // Cloud
  cloud: CloudState;

  // Sidebar mode (Projects vs Prompt Lab)
  sidebarMode: SidebarMode;

  // Prompt Lab (isolated from CoPilot)
  promptLab: PromptLabState;

  // Projects & Sessions (for sidebar)
  projects: Project[];
  activeSessionId: string | null;
  activeSession: Session | null; // Full session object for detail display
  activeProject: Project | null; // Full project object for detail display
  currentWorkspaceSessionId: string | null; // Session in the current VS Code/Cursor window (always shown)
  currentGoal: string | null;

  // Upload & Sync (ACCOUNT tab)
  uploadHistory?: UploadHistoryItem[];
  syncStatus?: SyncStatus;

  // LLM
  providers: LLMProvider[];
  activeProvider: string | null;

  // Advanced feature model settings
  featureModels: FeatureModelConfig | null;
  availableFeatureModels: FeatureModelOption[];

  // Co-Pilot
  autoAnalyzeEnabled: boolean;
  responseAnalysisEnabled: boolean;
  analyzedToday: number;
  recentPrompts: AnalyzedPrompt[];
  currentPrompt: string;
  isAnalyzing: boolean;
  isEnhancing: boolean; // True while waiting for prompt improvement
  isScoringEnhanced: boolean; // True while waiting for enhanced prompt score
  isInferringGoal: boolean; // True while waiting for goal inference
  currentAnalysis: AnalyzedPrompt | null;
  inferredGoal: { suggestedGoal: string; confidence: number; detectedTheme: string } | null;

  // Coaching state (Workstream D)
  currentCoaching: CoachingData | null;
  coachingPhase: CoachingPhase;
  contextUsed: ContextUsed | null;
  sessionContext: SessionContext | null;

  // Summaries
  summaryPeriod: SummaryPeriod;
  customDateRange: DateRange | null; // For custom period
  standupSummary: StandupSummary | null; // For standup prep
  todaySummary: DailySummary | null;
  yesterdaySummary: DailySummary | null;
  weekendRecap: DailySummary[] | null;
  weeklySummary: WeeklySummary | null;
  monthlySummary: MonthlySummary | null;
  customSummary: DailySummary | null; // For custom date range
  isLoadingSummary: boolean;
  loadingProgress: number;
  loadingMessage: string;
  summaryLoadingCancelled: boolean;

  // Settings
  settings: SettingsState;

  // First run
  isFirstRun: boolean;

  // Theme
  theme: 'light' | 'dark' | 'high-contrast';

  // Editor info (Cursor vs VS Code)
  editorInfo: EditorInfo | null;
}

// Action types
export type ActionV2 =
  | { type: 'SET_TAB'; payload: MainTab }
  | { type: 'SET_VIEW'; payload: AppStateV2['currentView'] }
  | { type: 'SET_FIRST_RUN'; payload: boolean }
  | { type: 'SET_SUMMARY_PERIOD'; payload: SummaryPeriod }
  | { type: 'SET_CUSTOM_DATE_RANGE'; payload: DateRange | null }
  | { type: 'SET_CLOUD_STATE'; payload: Partial<CloudState> }
  | { type: 'SET_PROVIDERS'; payload: LLMProvider[] }
  | { type: 'SET_ACTIVE_PROVIDER'; payload: string }
  // Feature model actions
  | { type: 'SET_FEATURE_MODELS'; payload: FeatureModelConfig | null }
  | { type: 'SET_AVAILABLE_FEATURE_MODELS'; payload: FeatureModelOption[] }
  | { type: 'UPDATE_FEATURE_MODEL'; payload: { feature: FeatureType; model: string } }
  | { type: 'TOGGLE_AUTO_ANALYZE' }
  | { type: 'TOGGLE_RESPONSE_ANALYSIS' }
  | { type: 'SET_RESPONSE_ANALYSIS_ENABLED'; payload: boolean }
  | { type: 'SET_CURRENT_PROMPT'; payload: string }
  | { type: 'SET_CURRENT_ANALYSIS'; payload: AnalyzedPrompt | null }
  | { type: 'START_ANALYSIS' }
  | { type: 'SCORE_RECEIVED'; payload: { score: number; source?: SessionSource; breakdown?: ScoreBreakdown; explanation?: ScoreExplanationV2; categoryScores?: { clarity: number; specificity: number; context: number; actionability: number } } }
  | { type: 'ENHANCED_PROMPT_READY'; payload: { promptId: string; improvedVersion: string } }
  | { type: 'ENHANCED_SCORE_READY'; payload: { promptId: string; improvedScore: number } }
  | { type: 'GOAL_INFERENCE_READY'; payload: { suggestedGoal: string; confidence: number; detectedTheme: string } }
  | { type: 'ANALYSIS_COMPLETE'; payload: AnalyzedPrompt }
  | { type: 'ADD_RECENT_PROMPT'; payload: AnalyzedPrompt }
  | { type: 'SET_RECENT_PROMPTS'; payload: AnalyzedPrompt[] }
  | { type: 'SELECT_PROMPT_FROM_HISTORY'; payload: AnalyzedPrompt }
  | { type: 'SET_TODAY_SUMMARY'; payload: DailySummary }
  | { type: 'SET_YESTERDAY_SUMMARY'; payload: DailySummary }
  | { type: 'SET_WEEKEND_RECAP'; payload: DailySummary[] }
  | { type: 'SET_WEEKLY_SUMMARY'; payload: WeeklySummary }
  | { type: 'SET_MONTHLY_SUMMARY'; payload: MonthlySummary }
  | { type: 'SET_CUSTOM_SUMMARY'; payload: DailySummary }
  | { type: 'SET_STANDUP_SUMMARY'; payload: StandupSummary | null }
  | { type: 'START_LOADING_SUMMARY'; payload: string }
  | { type: 'UPDATE_LOADING_PROGRESS'; payload: { progress: number; message: string } }
  | { type: 'FINISH_LOADING_SUMMARY' }
  | { type: 'CANCEL_LOADING_SUMMARY' }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<SettingsState> }
  | { type: 'COMPLETE_ONBOARDING' }
  | { type: 'SET_THEME'; payload: 'light' | 'dark' | 'high-contrast' }
  | { type: 'INCREMENT_ANALYZED_TODAY'; payload?: number }
  | { type: 'SET_UPLOAD_HISTORY'; payload: UploadHistoryItem[] }
  | { type: 'SET_SYNC_STATUS'; payload: SyncStatus }
  | { type: 'UPLOAD_PROGRESS'; payload: { current: number; total: number } }
  | { type: 'SET_EDITOR_INFO'; payload: EditorInfo }
  // Projects & Sessions (sidebar)
  | { type: 'SET_PROJECTS'; payload: Project[] }
  | { type: 'TOGGLE_PROJECT'; payload: string }
  | { type: 'SET_ACTIVE_SESSION'; payload: string | null }
  | { type: 'SET_ACTIVE_SESSION_DETAILS'; payload: { session: Session | null; project: Project | null } }
  | { type: 'SET_CURRENT_WORKSPACE_SESSION'; payload: string | null }
  | { type: 'SET_CURRENT_GOAL'; payload: string | null }
  // Coaching state (Workstream D)
  | { type: 'SET_COACHING'; payload: CoachingData | null }
  | { type: 'SET_COACHING_PHASE'; payload: CoachingPhase }
  | { type: 'SET_CONTEXT_USED'; payload: ContextUsed | null }
  | { type: 'SET_SESSION_CONTEXT'; payload: SessionContext | null }
  | { type: 'DISMISS_COACHING_SUGGESTION'; payload: string }
  // Sidebar mode toggle
  | { type: 'SET_SIDEBAR_MODE'; payload: SidebarMode }
  // Prompt Lab actions (isolated from CoPilot, same structure as auto-capture)
  | { type: 'SET_PROMPT_LAB_PROMPT'; payload: string }
  | { type: 'START_PROMPT_LAB_ANALYSIS' }
  | { type: 'PROMPT_LAB_SCORE_RECEIVED'; payload: { promptId?: string; score: number; categoryScores?: { clarity: number; specificity: number; context: number; actionability: number }; breakdown?: ScoreBreakdown; explanation?: ScoreExplanationV2 } }
  | { type: 'PROMPT_LAB_CONTEXT_USED'; payload: PromptLabContextUsed }
  | { type: 'PROMPT_LAB_ENHANCED_READY'; payload: { promptId?: string; improvedVersion: string } }
  | { type: 'PROMPT_LAB_ENHANCED_SCORE_READY'; payload: { promptId?: string; improvedScore: number } }
  | { type: 'PROMPT_LAB_ANALYSIS_COMPLETE'; payload: { prompt: AnalyzedPrompt; isRegenerate?: boolean } | AnalyzedPrompt }
  | { type: 'CLEAR_PROMPT_LAB' }
  // Saved prompts library
  | { type: 'SET_SAVED_PROMPTS'; payload: SavedPrompt[] }
  | { type: 'ADD_SAVED_PROMPT'; payload: SavedPrompt }
  | { type: 'UPDATE_SAVED_PROMPT'; payload: { id: string; updates: Partial<SavedPrompt> } }
  | { type: 'DELETE_SAVED_PROMPT'; payload: string }
  | { type: 'LOAD_SAVED_PROMPT'; payload: SavedPrompt }
  // Session management
  | { type: 'RENAME_SESSION'; payload: { sessionId: string; customName: string } }
  | { type: 'DELETE_SESSION'; payload: { sessionId: string } };

// Score color utility
export function getScoreColor(score: number): string {
  if (score >= 8) return 'var(--score-good)';
  if (score >= 5) return 'var(--score-medium)';
  return 'var(--score-low)';
}

export function getScoreClass(score: number): string {
  if (score >= 8) return 'score-good';
  if (score >= 5) return 'score-medium';
  return 'score-low';
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
