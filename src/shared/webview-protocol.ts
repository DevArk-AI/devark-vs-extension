/**
 * Webview Protocol - Type-Safe Message Definitions
 *
 * This file defines all message types for communication between
 * the VS Code extension and the webview (React UI).
 *
 * Benefits:
 * - Compile-time type checking
 * - IDE autocomplete
 * - Refactoring safety
 * - Self-documenting API
 */

// ============================================================
// DATA TYPES (shared between messages)
// ============================================================

/**
 * Session source identifier - which AI coding tool the session came from
 */
export type SessionSource = 'cursor' | 'claude_code';

/**
 * Error types for summary generation failures
 */
export type SummaryErrorType = 'rate_limit' | 'auth_failed' | 'network' | 'no_provider' | 'unknown';

/**
 * Structured error info for summary fallbacks
 */
export interface SummaryError {
  type: SummaryErrorType;
  message: string;
  suggestion: string;
}

export interface DetectedTool {
  id: 'cursor' | 'claude-code';
  name: string;
  detected: boolean;
}

export interface HooksStatusData {
  installed: boolean;
  watching: boolean;
  claude?: {
    installed: boolean;
    hooks: Array<{ type: string; installed: boolean; enabled: boolean }>;
  };
  cursor?: {
    installed: boolean;
    hooks: Array<{ type: string; installed: boolean; enabled: boolean }>;
  };
}

export interface ProviderInfo {
  id: string;
  name: string;
  type: 'cli' | 'local' | 'cloud';
  status: 'connected' | 'available' | 'not-configured' | 'not-running' | 'not-detected' | 'not-logged-in';
  description?: string;
  model?: string;
  availableModels?: string[];
  requiresApiKey?: boolean;
}

export interface ScoreBreakdown {
  specificity: { score: number; weight: number };
  context: { score: number; weight: number };
  intent: { score: number; weight: number };
  actionability: { score: number; weight: number };
  constraints: { score: number; weight: number };
  total: number;
}

export interface ScoreExplanation {
  overall: string;
  dimensions: Record<string, string>;
}

export interface PromptScoreResult {
  score: number;
  breakdown?: ScoreBreakdown;
  explanation?: ScoreExplanation;
}

export interface EnhancedPromptResult {
  promptId?: string;
  improvedVersion: string;
  improvedScore?: number;
}

export interface CloudStatusData {
  isConnected: boolean;
  username?: string;
  autoSyncEnabled?: boolean;
  lastSynced?: string;
}

export interface DailyStatsData {
  promptCount: number;
  averageScore: number;
  deltaVsUsual: number;
  percentileRank: number;
}

export interface ProjectInfo {
  path: string;
  name: string;
}

export interface FeatureModelConfig {
  enabled: boolean;
  summaries: string;
  promptScoring: string;
  promptImprovement: string;
}

export interface FeatureModelOption {
  providerId: string;
  model: string;
  displayName: string;
}

/**
 * Sync progress data - sent during upload to show visual feedback
 */
export interface SyncProgressData {
  phase: 'preparing' | 'sanitizing' | 'uploading' | 'complete' | 'cancelled' | 'error';
  message: string;
  current: number;
  total: number;
  currentBatch?: number;
  totalBatches?: number;
  sizeKB?: number;
}

/**
 * Sync completion data - final status after sync
 */
export interface SyncCompleteData {
  success: boolean;
  sessionsUploaded: number;
  error?: string;
}

// ============================================================
// WEBVIEW → EXTENSION MESSAGES
// ============================================================

export type WebviewMessage =
  // -------- Hooks --------
  | { type: 'getDetectedTools' }
  | { type: 'getRecentProjects' }
  | { type: 'selectProjectFolder' }
  | { type: 'installHooks'; data: { tools: string[]; projects: string[] | 'all' } }
  | { type: 'uninstallHooks'; data: { tools: string[] } }
  | { type: 'installCursorHooks'; data: { scope: 'global' | 'workspace' } }
  | { type: 'getHooksStatus' }
  | { type: 'getClaudeHooksStatus' }
  | { type: 'installClaudeHooks' }

  // -------- Providers --------
  | { type: 'getProviders' }
  | { type: 'detectProviders' }
  | { type: 'detectProvider'; data: { providerId: string } }
  | { type: 'switchProvider'; data: { providerId: string; model?: string } }
  | { type: 'verifyApiKey'; data: { providerId: string; apiKey: string; model?: string } }
  | { type: 'setOllamaModel'; data: { model: string } }
  | { type: 'setOpenRouterModel'; data: { model: string } }
  | { type: 'setCursorCliModel'; data: { model: string } }
  | { type: 'setClaudeAgentSdkModel'; data: { model: string } }

  // -------- Feature Models --------
  | { type: 'getFeatureModels' }
  | { type: 'setFeatureModel'; data: { feature: string; model: string } }
  | { type: 'setFeatureModelsEnabled'; data: { enabled: boolean } }
  | { type: 'resetFeatureModels' }
  | { type: 'getAvailableModelsForFeature'; data: { feature: string } }

  // -------- Prompt Analysis --------
  | { type: 'analyzePrompt'; data: { prompt: string; regenerate?: boolean } }
  | { type: 'useImprovedPrompt'; data: { prompt: string; source?: SessionSource; sessionId?: string } }
  | { type: 'toggleAutoAnalyze'; data: { enabled: boolean } }
  | { type: 'getAutoAnalyzeStatus' }
  | { type: 'toggleResponseAnalysis'; data: { enabled: boolean } }
  | { type: 'getResponseAnalysisStatus' }
  | { type: 'copyPromptToClipboard'; data: { prompt: string } }
  | { type: 'trackImprovedPromptCopied' }
  | { type: 'trackLlmSelectorOpenedFooter' }
  | { type: 'trackLlmSelectorOpenedSettings' }
  | { type: 'v2AnalyzePromptV2'; data: { prompt: string } }
  | { type: 'getPromptHistory' }
  | { type: 'showAllPrompts' }

  // -------- Prompt Lab --------
  | { type: 'analyzePromptLabPrompt'; data: { prompt: string; regenerate?: boolean } }
  | { type: 'savePromptToLibrary'; data: { text: string; name?: string; tags?: string[]; lastScore?: number; improvedVersion?: string; improvedScore?: number; lastAnalyzedAt?: Date } }
  | { type: 'getSavedPrompts' }
  | { type: 'deleteSavedPrompt'; data: { id: string } }
  | { type: 'renamePrompt'; data: { id: string; name: string } }

  // -------- Coaching --------
  | { type: 'getCoachingStatus' }
  | { type: 'getCoachingForPrompt'; data: { promptId: string } }
  | { type: 'useCoachingSuggestion'; data: { suggestion: unknown } }
  | { type: 'dismissCoachingSuggestion'; data: { id: string } }

  // -------- Sessions --------
  | { type: 'v2GetActiveSession' }
  | { type: 'v2GetSessionList' }
  | { type: 'v2GetPrompts'; data: { sessionId?: string; limit?: number; offset?: number } }
  | { type: 'switchSession'; data: { sessionId: string } }
  | { type: 'markSessionAsRead'; data: { sessionId: string } }
  | { type: 'renameSession'; data: { sessionId: string; name: string } }
  | { type: 'deleteSession'; data: { sessionId: string } }

  // -------- Goals --------
  | { type: 'v2GetGoalStatus' }
  | { type: 'v2SetGoal'; data: { goalText: string } }
  | { type: 'v2MaybeLaterGoal' }
  | { type: 'v2DontAskGoal' }
  | { type: 'v2InferGoal'; data?: { sessionId?: string } }
  | { type: 'v2CompleteGoal' }
  | { type: 'v2ClearGoal' }
  | { type: 'v2AnalyzeGoalProgress'; data?: { sessionId?: string } }
  | { type: 'editGoal'; data: { goal: string } }
  | { type: 'completeGoal' }

  // -------- Suggestions --------
  | { type: 'v2ApplySuggestion'; data: { id: string } }
  | { type: 'v2NotNowSuggestion'; data: { type: string } }
  | { type: 'v2DismissSuggestion'; data: { type: string } }
  | { type: 'v2CheckSuggestions' }

  // -------- Stats & Context --------
  | { type: 'v2GetDailyStats' }
  | { type: 'v2GetWeeklyTrend' }
  | { type: 'v2GetStreak' }
  | { type: 'v2GetPersonalComparison' }
  | { type: 'v2GetSessionContext'; data: { sessionId?: string } }
  | { type: 'v2GetContextSummary' }

  // -------- Summaries --------
  | { type: 'getSummary'; data: { period: 'standup' | 'today' | 'week' | 'month' | 'custom'; startDate?: string; endDate?: string } }

  // -------- Cloud & Auth --------
  | { type: 'loginWithGithub' }
  | { type: 'logout' }
  | { type: 'requestLogoutConfirmation' }
  | { type: 'getCloudStatus' }
  | { type: 'syncNow' }
  | { type: 'previewSync'; data: unknown }
  | { type: 'syncWithFilters'; data: unknown }
  | { type: 'getSyncStatus' }
  | { type: 'openDashboard' }
  | { type: 'checkAuthStatus' }
  | { type: 'uploadCurrentSession' }
  | { type: 'uploadRecentSessions' }

  // -------- Navigation & Config --------
  | { type: 'tabChanged'; data: { tab: string } }
  | { type: 'getEditorInfo' }
  | { type: 'getConfig' }
  | { type: 'completeOnboarding'; data: { provider?: string; autoAnalyze?: boolean; generateSummary?: boolean } }
  | { type: 'clearLocalData' }
  | { type: 'clearPromptHistory' }
  | { type: 'openExternal'; data: { url: string } }

  // -------- Misc --------
  | { type: 'test'; data?: unknown }
  | { type: 'testCLI' }
  | { type: 'testProviders' }
  | { type: 'cancelLoading' }
  | { type: 'uploadCursorSessions' }
  | { type: 'uploadClaudeSessions' }
  | { type: 'generateReport' }

  // -------- Sync Progress --------
  | { type: 'cancelSync' }
  | { type: 'minimizeSync' }
  ;

// ============================================================
// EXTENSION → WEBVIEW MESSAGES
// ============================================================

export type ExtensionMessage =
  // -------- Hooks --------
  | { type: 'detectedTools'; data: { tools: DetectedTool[] } }
  | { type: 'recentProjects'; data: { projects: ProjectInfo[] } }
  | { type: 'projectFolderSelected'; data: { path: string; name: string } }
  | { type: 'hooksStatus'; data: HooksStatusData }
  | { type: 'uninstallHooksComplete'; data: { success: boolean; errors: string[] } }
  | { type: 'claudeHooksStatusResult'; data: unknown }
  | { type: 'installClaudeHooksComplete'; data: { success: boolean } }

  // -------- Providers --------
  | { type: 'providersUpdate'; data: { providers: ProviderInfo[]; active: string | null } }
  | { type: 'verifyApiKeyResult'; data: { providerId?: string; success: boolean; message?: string; error?: string; details?: unknown } }
  | { type: 'testProvidersResult'; data: { results: Record<string, { success: boolean; error?: string; details?: unknown }>; error?: string } }

  // -------- Feature Models --------
  | { type: 'featureModelsUpdate'; data: { config: FeatureModelConfig | null } }
  | { type: 'availableModelsForFeature'; data: { models: FeatureModelOption[] } }

  // -------- Prompt Analysis --------
  | { type: 'scoreReceived'; data: { score: number; source?: SessionSource; categoryScores?: Record<string, number>; breakdown?: ScoreBreakdown; explanation?: unknown } }
  | { type: 'enhancedPromptReady'; data: EnhancedPromptResult }
  | { type: 'enhancedScoreReady'; data: { promptId?: string; improvedScore: number } }
  | { type: 'analysisComplete'; data: { prompt: unknown; analyzedToday?: number; avgScore?: number } }
  | { type: 'autoAnalyzeStatus'; data: { enabled: boolean; useHookBased?: boolean } }
  | { type: 'responseAnalysisStatus'; data: { enabled: boolean } }

  // -------- Prompt Lab --------
  | { type: 'promptLabScoreReceived'; data: { promptId?: string; score: number; categoryScores?: Record<string, number>; breakdown?: ScoreBreakdown; explanation?: unknown } }
  | { type: 'promptLabEnhancedReady'; data: EnhancedPromptResult }
  | { type: 'promptLabEnhancedScoreReady'; data: { promptId?: string; improvedScore: number } }
  | { type: 'promptLabAnalysisComplete'; data: { prompt: unknown; isRegenerate?: boolean } }
  | { type: 'promptLabContextUsed'; data: { goal?: string | null; techStack: string[]; snippetCount: number; topicsCount: number } }
  | { type: 'savedPromptsLoaded'; data: { prompts: unknown[]; tags?: string[]; folders?: string[] } }

  // -------- Coaching --------
  | { type: 'coachingUpdated'; data: { coaching: unknown } }
  | { type: 'coachingStatus'; data: { coaching: unknown; isListening?: boolean; onCooldown?: boolean } }
  | { type: 'finalResponseDetected'; data: unknown }

  // -------- Sessions --------
  | { type: 'v2SessionList'; data: { sessions: unknown[]; projects: unknown[] } }
  | { type: 'v2ActiveSession'; data: { sessionId: string | null; session: unknown; project: unknown; goal?: string | null } }
  | { type: 'v2Prompts'; data: { prompts: unknown[]; total: number; hasMore: boolean; offset: number; limit: number } }
  | { type: 'v2PromptAutoSelected'; data: { prompt: unknown } }
  | { type: 'sessionRenamed'; data: { sessionId: string; customName: string } }
  | { type: 'sessionDeleted'; data: { sessionId: string } }

  // -------- Stats --------
  | { type: 'v2DailyStats'; data: { stats: unknown; error?: string } }
  | { type: 'v2WeeklyTrend'; data: { trend: unknown } }
  | { type: 'v2Streak'; data: { currentStreak: number; longestStreak: number } }
  | { type: 'v2PersonalComparison'; data: { comparison: unknown; error?: string } }
  | { type: 'v2AnalysisResult'; data: { promptRecord?: unknown; breakdown?: unknown; explanation?: unknown; suggestion?: unknown; error?: string } }
  | { type: 'v2AnalysisProgress'; data: { progress: unknown } }

  // -------- Goals --------
  | { type: 'v2GoalStatus'; data: { goal: string | null; status: unknown } }
  | { type: 'v2GoalSet'; data: { success: boolean; error?: string; status?: unknown } }
  | { type: 'v2GoalCompleted'; data: { success: boolean; error?: string; status?: unknown } }
  | { type: 'v2GoalCleared'; data: Record<string, never> }
  | { type: 'v2GoalInferenceDismissed'; data: { reason: string } }
  | { type: 'v2GoalInference'; data: { suggestedGoal?: string; confidence?: number; detectedTheme?: string; inference?: unknown; error?: string } }
  | { type: 'v2GoalProgressAnalysis'; data: { success: boolean; sessionId?: string; progress?: number; reasoning?: string; inferredGoal?: string; accomplishments?: string[]; remaining?: string[]; error?: string; autoTriggered?: boolean } }
  | { type: 'openGoalEditor'; data: { currentGoal: string | null | undefined } }

  // -------- Suggestions --------
  | { type: 'v2Suggestion'; data: { suggestion: unknown } }
  | { type: 'v2SuggestionApplied'; data: { id: string; success: boolean; error?: string } }
  | { type: 'v2SuggestionDismissed'; data: { type: string } }
  | { type: 'v2SuggestionNotNow'; data: { type: string } }

  // -------- Context --------
  | { type: 'v2SessionContext'; data: { context: unknown } }
  | { type: 'v2ContextSummary'; data: { summary: unknown } }

  // -------- Summaries --------
  | { type: 'summaryData'; data: { type: string; summary?: unknown; error?: SummaryError } }
  | { type: 'loadingProgress'; data: { progress: number; message: string } }

  // -------- Reports --------
  | { type: 'reportStart'; data: string }
  | { type: 'reportProgress'; data: { progress: number; message: string } }
  | { type: 'reportError'; data: string }
  | { type: 'reportSuccess'; data: { html: string; type: string; dateRange: { start: string; end: string }; sessionCount: number } }
  | { type: 'reportReset' }

  // -------- Auth --------
  | { type: 'authStatusResult'; data: { authenticated: boolean } }

  // -------- Cloud & Auth --------
  | { type: 'cloudStatus'; data: CloudStatusData }
  | { type: 'syncStatus'; data: { localSessions: number; syncedSessions: number; pendingUploads: number; lastSynced?: string } }
  | { type: 'syncPreview'; data: { totalSessions: number; estimatedSizeKB: number; dateRange?: unknown; projects?: unknown; filteredOutShort?: number; sessionsBySource?: { cursor: number; claudeCode: number; total: number }; error?: string } }

  // -------- Sync Progress --------
  | { type: 'syncProgress'; data: SyncProgressData }
  | { type: 'syncStart' }
  | { type: 'syncComplete'; data: SyncCompleteData }
  | { type: 'syncError'; data?: { message?: string } }
  | { type: 'syncCancelled' }

  // -------- Config & Editor --------
  | { type: 'configLoaded'; data: { isFirstRun: boolean } }
  | { type: 'editorInfo'; data: { isCursor: boolean; editorName: string; autoDetectSupported: boolean } }
  | { type: 'onboardingComplete'; data: { success: boolean } }

  // -------- History --------
  | { type: 'promptHistoryLoaded'; data: { history: unknown[]; analyzedToday: number; avgScore: number } }

  // -------- Misc --------
  | { type: 'error'; data: { message: string; operation?: string; error?: unknown } }
  | { type: 'testResponse'; data: { received: unknown } }
  | { type: 'testCLIResponse'; data: { success: boolean; healthCheck?: { authenticated: boolean } } }
  | { type: 'uploadClaudeSessionsComplete'; data: unknown }

  // -------- Notifications (VIB-74) --------
  | { type: 'notification'; data: { level: 'info' | 'warning' | 'error'; message: string; action?: { label: string; command: string } } }
  ;

// ============================================================
// HELPER TYPES
// ============================================================

/**
 * Extract the data type for a specific webview message type.
 * Returns `undefined` if the message has no data field.
 */
export type WebviewMessageData<T extends WebviewMessage['type']> =
  Extract<WebviewMessage, { type: T }> extends { data: infer D } ? D : undefined;

/**
 * Extract the data type for a specific extension message type.
 */
export type ExtensionMessageData<T extends ExtensionMessage['type']> =
  Extract<ExtensionMessage, { type: T }> extends { data: infer D } ? D : undefined;

/**
 * All possible message types from webview
 */
export type WebviewMessageType = WebviewMessage['type'];

/**
 * All possible message types from extension
 */
export type ExtensionMessageType = ExtensionMessage['type'];
