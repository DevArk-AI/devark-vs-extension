/**
 * Coaching Types for Workstream C: Coaching Service
 *
 * Type definitions for response analysis and coaching suggestions.
 * Used by ResponseAnalyzer and CoachingService.
 */

import type { SessionSource } from '../UnifiedSessionService';

/**
 * Types of coaching suggestions
 */
export type SuggestionType =
  | 'follow_up'        // Build on what was accomplished
  | 'test'             // Add tests for changes
  | 'error_prevention' // Prevent potential issues
  | 'documentation'    // Add documentation
  | 'refactor'         // Clean up or improve code
  | 'goal_alignment'   // Align with session goal
  | 'celebration';     // Recognize achievement

/**
 * A single coaching suggestion
 */
export interface CoachingSuggestion {
  /** Unique identifier */
  id: string;

  /** Type of suggestion */
  type: SuggestionType;

  /** Short action title (e.g., "Add tests for UserService") */
  title: string;

  /** Why this is recommended */
  description: string;

  /** Ready-to-use prompt for the AI agent */
  suggestedPrompt: string;

  /** Confidence score 0-1 */
  confidence: number;

  /** Reasoning behind this suggestion */
  reasoning: string;
}

/**
 * Outcome of an agent response
 */
export type ResponseOutcome = 'success' | 'partial' | 'blocked' | 'error';

/**
 * Analysis of an agent response
 */
export interface ResponseAnalysis {
  /** One-line summary of what happened */
  summary: string;

  /** Overall outcome of the response */
  outcome: ResponseOutcome;

  /** Topics/themes addressed in the response */
  topicsAddressed: string[];

  /** Files or entities modified */
  entitiesModified: string[];

  /** Goal progress tracking */
  goalProgress?: {
    /** Progress before this response (0-100%) */
    before: number;
    /** Progress after this response (0-100%) */
    after: number;
    /** Specific milestone just completed */
    justCompleted?: string;
  };
}

/**
 * Complete coaching data for a response
 */
export interface CoachingData {
  /** Analysis of the agent response */
  analysis: ResponseAnalysis;

  /** Generated coaching suggestions (1-3) */
  suggestions: CoachingSuggestion[];

  /** When this coaching was generated */
  timestamp: Date;

  /** ID of the response that triggered this coaching */
  responseId?: string;

  // Prompt linking fields (Workstream D)
  /** ID of the prompt that triggered the response */
  promptId?: string;

  /** Original prompt text (for context in UI) */
  promptText?: string;

  /** Source tool: 'cursor' or 'claude_code' */
  source?: SessionSource;

  /** Session identifier for the originating tool (Cursor conversation or Claude Code session) */
  sessionId?: string;
}

/**
 * State of the coaching system
 */
export interface CoachingState {
  /** Whether coaching is actively listening for responses */
  isListening: boolean;

  /** Current coaching data (null if none) */
  currentCoaching: CoachingData | null;

  /** When coaching state was last updated */
  lastUpdated: Date | null;

  /** Whether coaching is on cooldown */
  onCooldown: boolean;

  /** When cooldown ends (if on cooldown) */
  cooldownEndsAt?: Date;
}

/**
 * Callback for coaching updates
 */
export type CoachingListener = (coaching: CoachingData) => void;

/**
 * Options for coaching generation
 */
export interface CoachingOptions {
  /** Maximum number of suggestions to generate */
  maxSuggestions?: number;

  /** Minimum confidence threshold for suggestions */
  minConfidence?: number;

  /** Whether to show toast notification */
  showToast?: boolean;

  /** Whether to skip throttling checks */
  force?: boolean;

  /** The prompt that triggered this response (for enriched context) */
  linkedPrompt?: {
    id: string;
    prompt: string;
    timestamp: string;
    source?: SessionSource;
  };
}

/**
 * Result of coaching generation
 */
export interface CoachingResult {
  /** Whether coaching was generated */
  generated: boolean;

  /** Reason if not generated */
  reason?: 'throttled' | 'cooldown' | 'error' | 'no_suggestions' | 'error_response' | 'duplicate';

  /** The coaching data if generated */
  coaching?: CoachingData;
}

/**
 * Coaching configuration
 */
export interface CoachingConfig {
  /** Minimum interval between coaching (ms) */
  minInterval: number;

  /** Cooldown after dismissal (ms) */
  cooldownDuration: number;

  /** Whether coaching is enabled */
  enabled: boolean;

  /** Whether to show toast notifications */
  showToasts: boolean;
}

/**
 * Default coaching configuration
 */
export const DEFAULT_COACHING_CONFIG: CoachingConfig = {
  minInterval: 3 * 60 * 1000,        // 3 minutes
  cooldownDuration: 10 * 60 * 1000,  // 10 minutes
  enabled: true,
  showToasts: true,
};

/**
 * Icon for each suggestion type
 */
export const SUGGESTION_TYPE_ICONS: Record<SuggestionType, string> = {
  follow_up: '➡️',
  test: '🧪',
  error_prevention: '🛡️',
  documentation: '📝',
  refactor: '🔧',
  goal_alignment: '🎯',
  celebration: '🎉',
};

/**
 * Display name for each suggestion type
 */
export const SUGGESTION_TYPE_NAMES: Record<SuggestionType, string> = {
  follow_up: 'Next Step',
  test: 'Add Tests',
  error_prevention: 'Prevent Issues',
  documentation: 'Document',
  refactor: 'Refactor',
  goal_alignment: 'Goal Focus',
  celebration: 'Achievement',
};
