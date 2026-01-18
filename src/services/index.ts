/**
 * Services Index
 *
 * Central export point for all service modules.
 */

// Auth & Config Services (new - CLI-free architecture)
export { AuthService } from './auth-service';
export type { AuthLoginResult, AuthUser } from './auth-service';
export { ConfigService } from './config-service';
export { SyncService } from './sync-service';
export type { SyncOptions, SyncResult, SyncError } from './sync-service';

// Summary Service
export {
  SummaryService,
  SummaryContext,
  AISummaryResult,
  DailySummary,
  WeeklySummary,
  MonthlySummary,
  BusinessOutcome
} from './SummaryService';

// Auto Analyze Service (existing)
export { AutoAnalyzeService } from './AutoAnalyzeService';

// Prompt builders
export {
  buildDailySummaryPrompt,
  SYSTEM_PROMPT,
  getExamplePrompt
} from './prompts/summary-prompt';

// Unified Session Service (multi-source session aggregation)
export {
  UnifiedSessionService,
  unifiedSessionService,
  UnifiedSession,
  UnifiedSessionFilters,
  UnifiedSessionResult,
  SessionsBySource,
  SessionSource,
  BusinessContext,
  BusinessCategory
} from './UnifiedSessionService';

// Session Manager Service (Co-Pilot V2 - project/session/prompt management)
export {
  SessionManagerService,
  getSessionManager
} from './SessionManagerService';

// Session types (Co-Pilot V2)
export type {
  Platform,
  Project,
  Session,
  PromptRecord,
  ScoreBreakdown,
  DimensionScore,
  ScoreExplanation,
  SessionContext,
  SessionManagerState,
  SessionDetectionConfig,
  SessionFilterOptions,
  SessionSummary,
  SessionEvent,
  SessionEventType,
  SessionEventCallback,
  PromptPaginationOptions,
  PaginatedPrompts,
} from './types/session-types';

export {
  PLATFORM_INFO,
  SCORE_WEIGHTS,
  DEFAULT_SESSION_DETECTION_CONFIG,
  generateId,
  truncateText,
  formatDuration,
  formatTimeAgo,
  calculateSessionDuration,
  getPlatformIcon,
  createDefaultScoreBreakdown,
  calculateWeightedScore,
} from './types/session-types';

// Score types (Co-Pilot V2 - 5-dimension scoring)
export type {
  ScoreDimension,
  DimensionScoreV2,
  ScoreBreakdownV2,
  DimensionMetadata,
  ScoreExplanationV2,
  ExplanationPoint,
} from './types/score-types';

export {
  SCORE_DIMENSION_WEIGHTS,
  DIMENSION_METADATA,
} from './types/score-types';

// Daily Stats Service (Co-Pilot V2 - daily statistics tracking)
export {
  DailyStatsService,
  getDailyStatsService,
} from './DailyStatsService';

export type {
  DailyStats,
  DailyTrendPoint,
} from './DailyStatsService';

// Note: PeerComparisonService was replaced by personal comparison
// integrated directly into DailyStatsService and V2MessageHandler

// Goal Service (Co-Pilot V2 - goal inference and management)
export {
  GoalService,
  getGoalService,
} from './GoalService';

export type {
  GoalStatus,
  GoalServiceConfig,
} from './GoalService';

// Suggestion Engine (Co-Pilot V2 - intelligent suggestions)
export {
  SuggestionEngine,
  getSuggestionEngine,
} from './SuggestionEngine';

export type {
  SuggestionType,
  SuggestionIntrusiveness,
  Suggestion,
  SuggestionCallback,
} from './SuggestionEngine';

// Context Extractor (Co-Pilot V2 - session context extraction)
export {
  ContextExtractor,
  getContextExtractor,
} from './ContextExtractor';

export type {
  ExtractedEntity,
  KeyDecision,
  ExtractedContext,
} from './ContextExtractor';
