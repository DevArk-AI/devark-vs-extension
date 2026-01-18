/**
 * SuggestionEngine - Intelligent Suggestions for Co-Pilot V2
 *
 * Triggers suggestions based on:
 * - Prompt score < 4.0 -> "Add more context"
 * - Same topic 3x -> "Combine these?"
 * - Session > 30 min -> "Progress check"
 * - Returning user -> "Resume from..."
 * - Vague words detected -> "Be more specific"
 * - No goal set (10 min) -> "Set a goal?"
 *
 * Throttling:
 * - Max 1 toast per 5 minutes
 * - Max 3 inline tips per session
 * - "Not now" = 1 hour cooldown
 * - "Dismiss" 3x = disable suggestion type
 */

import * as vscode from 'vscode';
import { getSessionManager } from './SessionManagerService';
import { getGoalService } from './GoalService';
import { PromptRecord } from './types/session-types';

/**
 * Suggestion types
 */
export type SuggestionType =
  | 'add_context'
  | 'combine_prompts'
  | 'progress_check'
  | 'resume_session'
  | 'be_specific';

/**
 * Suggestion intrusiveness level
 */
export type SuggestionIntrusiveness = 'inline' | 'toast' | 'sidebar_badge' | 'modal';

/**
 * Suggestion data
 */
export interface Suggestion {
  id: string;
  type: SuggestionType;
  title: string;
  content: string;
  actionLabel: string;
  dismissLabel: string;
  intrusiveness: SuggestionIntrusiveness;
  timestamp: Date;
  /** Additional context data */
  context?: Record<string, unknown>;
}

/**
 * Suggestion callback
 */
export type SuggestionCallback = (suggestion: Suggestion) => void;

/**
 * Throttle configuration
 */
interface ThrottleConfig {
  /** Max toasts per time period */
  maxToastsPerPeriod: number;
  /** Toast period in minutes */
  toastPeriodMinutes: number;
  /** Max inline tips per session */
  maxInlineTipsPerSession: number;
  /** "Not now" cooldown in minutes */
  notNowCooldownMinutes: number;
  /** Dismissals before disable */
  dismissalsBeforeDisable: number;
}

const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  maxToastsPerPeriod: 1,
  toastPeriodMinutes: 5,
  maxInlineTipsPerSession: 3,
  notNowCooldownMinutes: 60,
  dismissalsBeforeDisable: 3,
};

/**
 * Storage keys
 */
const STORAGE_KEYS = {
  THROTTLE_STATE: 'copilot.v2.suggestionThrottle',
  DISMISSED_TYPES: 'copilot.v2.dismissedSuggestionTypes',
} as const;

/**
 * Vague words to detect
 */
const VAGUE_WORDS = [
  'something', 'stuff', 'thing', 'things', 'somehow',
  'maybe', 'perhaps', 'probably', 'kind of', 'sort of',
  'whatever', 'etc', 'and so on', 'similar',
  'fix it', 'make it work', 'deal with', 'handle this',
];

/**
 * SuggestionEngine - Intelligent suggestion generation
 */
export class SuggestionEngine {
  private static instance: SuggestionEngine | null = null;
  private context: vscode.ExtensionContext | null = null;
  private throttleConfig: ThrottleConfig = DEFAULT_THROTTLE_CONFIG;
  private callbacks: Set<SuggestionCallback> = new Set();

  // Throttle state
  private lastToastTime: number = 0;
  private inlineTipsCount: number = 0;
  private notNowCooldowns: Map<SuggestionType, number> = new Map();
  private dismissalCounts: Map<SuggestionType, number> = new Map();
  private disabledTypes: Set<SuggestionType> = new Set();

  // Topic tracking for "combine prompts" suggestion
  private recentTopics: string[] = [];

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): SuggestionEngine {
    if (!SuggestionEngine.instance) {
      SuggestionEngine.instance = new SuggestionEngine();
    }
    return SuggestionEngine.instance;
  }

  /**
   * Initialize with extension context
   */
  public async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;
    await this.loadThrottleState();
    console.log('[SuggestionEngine] Initialized');
  }

  /**
   * Subscribe to suggestions
   */
  public subscribe(callback: SuggestionCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Analyze a new prompt and potentially generate suggestions
   */
  public analyzePrompt(prompt: PromptRecord): Suggestion | null {
    // Track topic
    this.trackTopic(prompt.text);

    // Check for low score suggestion
    const lowScoreSuggestion = this.checkLowScore(prompt);
    if (lowScoreSuggestion) return lowScoreSuggestion;

    // Check for vague words
    const vagueSuggestion = this.checkVagueWords(prompt);
    if (vagueSuggestion) return vagueSuggestion;

    // Check for repeated topic
    const combineSuggestion = this.checkRepeatedTopic();
    if (combineSuggestion) return combineSuggestion;

    return null;
  }

  /**
   * Check for session-level suggestions (call periodically)
   */
  public checkSessionSuggestions(): Suggestion | null {
    // Note: Goal suggestions removed - goals are now auto-set via GoalService progress analysis

    // Check for progress check
    const progressSuggestion = this.checkSessionDuration();
    if (progressSuggestion) return progressSuggestion;

    return null;
  }

  /**
   * Generate a resume suggestion for returning users
   */
  public generateResumeSuggestion(): Suggestion | null {
    const sessionManager = getSessionManager();
    const sessions = sessionManager.getSessions({ limit: 1 });

    if (sessions.length === 0) {
      return null;
    }

    const lastSession = sessions[0];
    const hoursSinceLastActivity = (Date.now() - lastSession.lastActivityTime.getTime()) / 3600000;

    // Only show for sessions 2-48 hours old
    if (hoursSinceLastActivity < 2 || hoursSinceLastActivity > 48) {
      return null;
    }

    if (!this.canShowSuggestion('resume_session', 'modal')) {
      return null;
    }

    const project = sessionManager.getProject(lastSession.projectId);

    return this.createSuggestion({
      type: 'resume_session',
      title: 'Welcome back!',
      content: `Resume your ${project?.name || 'previous'} session? You were working on ${lastSession.goal || 'your project'}.`,
      actionLabel: 'Resume',
      dismissLabel: 'Start Fresh',
      intrusiveness: 'modal',
      context: {
        sessionId: lastSession.id,
        projectName: project?.name,
        goal: lastSession.goal,
      },
    });
  }

  /**
   * Handle "Not Now" action
   */
  public handleNotNow(type: SuggestionType): void {
    const cooldownEnd = Date.now() + this.throttleConfig.notNowCooldownMinutes * 60000;
    this.notNowCooldowns.set(type, cooldownEnd);
    this.saveThrottleState();
    console.log('[SuggestionEngine] Not now for', type, '- cooling down until', new Date(cooldownEnd));
  }

  /**
   * Handle dismiss action
   */
  public handleDismiss(type: SuggestionType): void {
    const count = (this.dismissalCounts.get(type) || 0) + 1;
    this.dismissalCounts.set(type, count);

    if (count >= this.throttleConfig.dismissalsBeforeDisable) {
      this.disabledTypes.add(type);
      console.log('[SuggestionEngine] Disabled suggestion type:', type);
    }

    this.saveThrottleState();
  }

  /**
   * Reset throttle state for new session
   */
  public resetSession(): void {
    this.inlineTipsCount = 0;
    this.recentTopics = [];
    console.log('[SuggestionEngine] Session throttle state reset');
  }

  // ========================================
  // Private: Suggestion Checks
  // ========================================

  private checkLowScore(prompt: PromptRecord): Suggestion | null {
    if (prompt.score >= 4.0) return null;

    if (!this.canShowSuggestion('add_context', 'inline')) return null;

    return this.createSuggestion({
      type: 'add_context',
      title: 'Add more context',
      content: 'Your prompt could be more effective with additional context or specifics.',
      actionLabel: 'See suggestions',
      dismissLabel: 'Got it',
      intrusiveness: 'inline',
      context: { score: prompt.score },
    });
  }

  private checkVagueWords(prompt: PromptRecord): Suggestion | null {
    const lowerText = prompt.text.toLowerCase();
    const foundVague = VAGUE_WORDS.filter(word => lowerText.includes(word));

    if (foundVague.length === 0) return null;

    if (!this.canShowSuggestion('be_specific', 'inline')) return null;

    return this.createSuggestion({
      type: 'be_specific',
      title: 'Be more specific',
      content: `Your prompt contains vague terms like "${foundVague[0]}". Being more specific helps the AI understand your needs.`,
      actionLabel: 'Show example',
      dismissLabel: 'Dismiss',
      intrusiveness: 'inline',
      context: { vagueWords: foundVague },
    });
  }

  private checkRepeatedTopic(): Suggestion | null {
    if (this.recentTopics.length < 3) return null;

    // Check if last 3 topics are similar
    const lastThree = this.recentTopics.slice(-3);
    const firstTopic = lastThree[0];

    // Simple similarity check - all contain same word
    const words = firstTopic.toLowerCase().split(/\s+/);
    const commonWord = words.find(word =>
      word.length > 3 && lastThree.every(topic => topic.toLowerCase().includes(word))
    );

    if (!commonWord) return null;

    if (!this.canShowSuggestion('combine_prompts', 'toast')) return null;

    return this.createSuggestion({
      type: 'combine_prompts',
      title: 'Combine related prompts?',
      content: `You've asked about "${commonWord}" 3 times. Consider combining into one comprehensive prompt.`,
      actionLabel: 'Show how',
      dismissLabel: 'Not now',
      intrusiveness: 'toast',
      context: { topic: commonWord, count: 3 },
    });
  }

  private checkSessionDuration(): Suggestion | null {
    const sessionManager = getSessionManager();
    const session = sessionManager.getActiveSession();

    if (!session) return null;

    const sessionMinutes = (Date.now() - session.startTime.getTime()) / 60000;
    if (sessionMinutes < 30) return null; // Wait at least 30 minutes

    // Only show once per session
    if (!this.canShowSuggestion('progress_check', 'sidebar_badge')) return null;

    const goalService = getGoalService();
    const status = goalService.getGoalStatus();

    return this.createSuggestion({
      type: 'progress_check',
      title: 'Progress check',
      content: status.hasGoal
        ? `You've been working on "${status.goalText}" for ${Math.round(sessionMinutes)} minutes. How's it going?`
        : `You've been working for ${Math.round(sessionMinutes)} minutes. Take a break?`,
      actionLabel: status.hasGoal ? 'Mark complete' : 'Take a break',
      dismissLabel: 'Keep going',
      intrusiveness: 'sidebar_badge',
      context: {
        sessionMinutes,
        hasGoal: status.hasGoal,
        goalText: status.goalText,
      },
    });
  }

  // ========================================
  // Private: Throttling
  // ========================================

  private canShowSuggestion(type: SuggestionType, intrusiveness: SuggestionIntrusiveness): boolean {
    // Check if type is disabled
    if (this.disabledTypes.has(type)) {
      return false;
    }

    // Check "not now" cooldown
    const cooldownEnd = this.notNowCooldowns.get(type) || 0;
    if (Date.now() < cooldownEnd) {
      return false;
    }

    // Check toast throttle
    if (intrusiveness === 'toast') {
      const timeSinceLastToast = Date.now() - this.lastToastTime;
      if (timeSinceLastToast < this.throttleConfig.toastPeriodMinutes * 60000) {
        return false;
      }
    }

    // Check inline tip limit
    if (intrusiveness === 'inline') {
      if (this.inlineTipsCount >= this.throttleConfig.maxInlineTipsPerSession) {
        return false;
      }
    }

    return true;
  }

  private recordSuggestionShown(intrusiveness: SuggestionIntrusiveness): void {
    if (intrusiveness === 'toast') {
      this.lastToastTime = Date.now();
    } else if (intrusiveness === 'inline') {
      this.inlineTipsCount++;
    }
  }

  // ========================================
  // Private: Helpers
  // ========================================

  private createSuggestion(config: Omit<Suggestion, 'id' | 'timestamp'>): Suggestion {
    const suggestion: Suggestion = {
      ...config,
      id: `${config.type}-${Date.now()}`,
      timestamp: new Date(),
    };

    // Record that we showed this suggestion
    this.recordSuggestionShown(config.intrusiveness);

    // Emit to callbacks
    this.emitSuggestion(suggestion);

    return suggestion;
  }

  private trackTopic(promptText: string): void {
    // Extract main topic (simplified - could use NLP)
    const words = promptText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const topic = words.slice(0, 5).join(' ');
    this.recentTopics.push(topic);

    // Keep only last 10 topics
    if (this.recentTopics.length > 10) {
      this.recentTopics.shift();
    }
  }

  private emitSuggestion(suggestion: Suggestion): void {
    for (const callback of this.callbacks) {
      try {
        callback(suggestion);
      } catch (error) {
        console.error('[SuggestionEngine] Callback error:', error);
      }
    }
  }

  // ========================================
  // Private: Persistence
  // ========================================

  private async loadThrottleState(): Promise<void> {
    if (!this.context) return;

    try {
      const state = this.context.globalState.get<{
        dismissalCounts: Record<string, number>;
        disabledTypes: string[];
      }>(STORAGE_KEYS.THROTTLE_STATE);

      if (state) {
        this.dismissalCounts = new Map(
          Object.entries(state.dismissalCounts) as [SuggestionType, number][]
        );
        this.disabledTypes = new Set(state.disabledTypes as SuggestionType[]);
      }
    } catch (error) {
      console.error('[SuggestionEngine] Failed to load throttle state:', error);
    }
  }

  private async saveThrottleState(): Promise<void> {
    if (!this.context) return;

    try {
      const state = {
        dismissalCounts: Object.fromEntries(this.dismissalCounts),
        disabledTypes: Array.from(this.disabledTypes),
      };

      await this.context.globalState.update(STORAGE_KEYS.THROTTLE_STATE, state);
    } catch (error) {
      console.error('[SuggestionEngine] Failed to save throttle state:', error);
    }
  }

  /**
   * Re-enable a disabled suggestion type
   */
  public enableSuggestionType(type: SuggestionType): void {
    this.disabledTypes.delete(type);
    this.dismissalCounts.delete(type);
    this.saveThrottleState();
    console.log('[SuggestionEngine] Re-enabled suggestion type:', type);
  }

  /**
   * Get list of disabled suggestion types
   */
  public getDisabledTypes(): SuggestionType[] {
    return Array.from(this.disabledTypes);
  }
}

/**
 * Get SuggestionEngine singleton
 */
export function getSuggestionEngine(): SuggestionEngine {
  return SuggestionEngine.getInstance();
}
