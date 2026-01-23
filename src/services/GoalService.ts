/**
 * GoalService - Session Goal Management for Co-Pilot V2
 *
 * Responsibilities:
 * - Analyze goal progress using LLM (via GoalProgressAnalyzer)
 * - Auto-set goals when inferred from progress analysis
 * - Track goal status and completion
 * - Trigger periodic progress analysis based on prompt count
 */

import { getSessionManager } from './SessionManagerService';
import { PromptRecord, Session, generateId, truncateText } from './types/session-types';
import { ExtensionState } from '../extension-state';
import { GoalProgressAnalyzer, GoalProgressOutput } from '../copilot/goal-progress-analyzer';
import { ClaudeSessionReader } from '../adapters/readers/claude-session-reader';
import { NodeFileSystem } from '../adapters/readers/node-filesystem';
import { isActualUserPrompt } from '../core/session/prompt-utils';

/**
 * Goal status
 */
export interface GoalStatus {
  /** Whether a goal is set */
  hasGoal: boolean;
  /** Current goal text */
  goalText?: string;
  /** When the goal was set */
  setAt?: Date;
  /** Whether goal is completed */
  isCompleted: boolean;
  /** When goal was completed */
  completedAt?: Date;
  /** Prompts since goal was set */
  promptsSinceGoalSet: number;
}

/**
 * Configuration for goal progress analysis
 */
export interface GoalServiceConfig {
  /** Minimum prompts before first goal progress analysis */
  minPromptsForProgressAnalysis: number;
  /** Analyze goal progress every N prompts */
  progressAnalysisInterval: number;
  /** Minimum time between analyses (ms) */
  progressAnalysisDebounceMs: number;
}

const DEFAULT_CONFIG: GoalServiceConfig = {
  minPromptsForProgressAnalysis: 1, // Trigger analysis on first prompt
  progressAnalysisInterval: 3, // Analyze every 3 prompts
  progressAnalysisDebounceMs: 30000, // 30 seconds minimum between analyses
};

/**
 * GoalService - Goal inference and management
 */
export class GoalService {
  private static instance: GoalService | null = null;
  private config: GoalServiceConfig = DEFAULT_CONFIG;

  // Track last analysis time per session to debounce
  private lastAnalysisTime: Map<string, number> = new Map();
  // Track prompt count at last analysis per session
  private lastAnalysisPromptCount: Map<string, number> = new Map();
  // Pending analysis timers per session
  private pendingAnalysis: Map<string, NodeJS.Timeout> = new Map();
  // Callback for notifying webview of progress updates
  private progressUpdateCallback: ((sessionId: string, progress: GoalProgressOutput) => void) | null = null;
  // Claude session reader for loading prompts on-demand
  private claudeReader: ClaudeSessionReader | null = null;

  private constructor() {}

  /**
   * Get or create Claude session reader
   */
  private getClaudeReader(): ClaudeSessionReader {
    if (!this.claudeReader) {
      this.claudeReader = new ClaudeSessionReader(new NodeFileSystem());
    }
    return this.claudeReader;
  }

  /**
   * Load prompts for a Claude Code session on-demand.
   * Claude Code sessions store prompts in JSONL files, not in SessionManager memory.
   * This method reads the file and converts messages to PromptRecords.
   */
  private async loadClaudeCodePrompts(session: Session): Promise<PromptRecord[]> {
    try {
      // Get the source session ID which contains the file path info
      const sourceSessionId = session.metadata?.sourceSessionId;
      if (!sourceSessionId) {
        console.log(`[GoalService] No sourceSessionId for Claude Code session ${session.id}`);
        return [];
      }

      console.log(`[GoalService] Loading prompts for Claude Code session from: ${sourceSessionId}`);

      const reader = this.getClaudeReader();
      const details = await reader.getSessionDetails(sourceSessionId);

      if (!details || !details.messages || details.messages.length === 0) {
        console.log(`[GoalService] No messages found for Claude Code session ${session.id}`);
        return [];
      }

      // Convert messages to PromptRecords (only user messages that are actual prompts)
      const prompts: PromptRecord[] = [];
      for (const msg of details.messages) {
        if (msg.role === 'user' && isActualUserPrompt(msg.content)) {
          prompts.push({
            id: generateId(),
            sessionId: session.id,
            text: msg.content,
            truncatedText: truncateText(msg.content, 100),
            timestamp: msg.timestamp,
            score: 0, // Not scored for goal progress analysis
          });
        }
      }

      console.log(`[GoalService] Loaded ${prompts.length} prompts for Claude Code session ${session.id}`);
      return prompts;
    } catch (error) {
      console.error(`[GoalService] Failed to load Claude Code prompts:`, error);
      return [];
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): GoalService {
    if (!GoalService.instance) {
      GoalService.instance = new GoalService();
    }
    return GoalService.instance;
  }

  /**
   * Update configuration
   */
  public setConfig(config: Partial<GoalServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current goal status
   */
  public getGoalStatus(): GoalStatus {
    const sessionManager = getSessionManager();
    const session = sessionManager.getActiveSession();

    if (!session) {
      return {
        hasGoal: false,
        isCompleted: false,
        promptsSinceGoalSet: 0,
      };
    }

    const promptsSinceGoalSet = session.goalSetAt
      ? session.prompts.filter(p => p.timestamp >= session.goalSetAt!).length
      : 0;

    return {
      hasGoal: !!session.goal,
      goalText: session.goal,
      setAt: session.goalSetAt,
      isCompleted: !!session.goalCompletedAt,
      completedAt: session.goalCompletedAt,
      promptsSinceGoalSet,
    };
  }

  /**
   * Set a goal for the current session
   */
  public async setGoal(goalText: string): Promise<void> {
    const sessionManager = getSessionManager();
    await sessionManager.setGoal(goalText);
    console.log('[GoalService] Goal set:', goalText);
  }

  /**
   * Complete the current goal
   */
  public async completeGoal(): Promise<void> {
    const sessionManager = getSessionManager();
    await sessionManager.completeGoal();
    console.log('[GoalService] Goal completed');
  }

  /**
   * Clear the current goal
   */
  public async clearGoal(): Promise<void> {
    const sessionManager = getSessionManager();
    const session = sessionManager.getActiveSession();
    if (session) {
      session.goal = undefined;
      session.goalSetAt = undefined;
      session.goalCompletedAt = undefined;
    }
    console.log('[GoalService] Goal cleared');
  }

  /**
   * Analyze goal progress for a session using LLM
   * Updates the session's goalProgress field with the inferred percentage
   *
   * @param sessionId - Session to analyze (or active session if not provided)
   * @returns The goal progress analysis result, or null if analysis failed
   */
  public async analyzeGoalProgress(sessionId?: string): Promise<GoalProgressOutput | null> {
    console.log(`[GoalService] ▶ analyzeGoalProgress called`, { sessionId: sessionId || 'active session' });

    const sessionManager = getSessionManager();

    // Find the session to analyze
    let session: Session | null = null;
    if (sessionId) {
      const sessions = sessionManager.getSessions();
      session = sessions.find(s => s.id === sessionId) || null;
    } else {
      session = sessionManager.getActiveSession();
    }

    if (!session) {
      console.warn('[GoalService] ✗ No session found for goal progress analysis');
      return null;
    }

    console.log(`[GoalService] Found session:`, {
      id: session.id,
      promptCount: session.promptCount,
      promptsArrayLength: session.prompts.length,
      goal: session.goal,
      platform: session.platform,
    });

    // For Claude Code sessions, prompts are stored in JSONL files, not in memory.
    // Load them on-demand if the prompts array is empty but promptCount > 0.
    let sessionToAnalyze = session;
    if (session.platform === 'claude_code' && session.prompts.length === 0 && session.promptCount > 0) {
      console.log(`[GoalService] 🔄 Loading prompts on-demand for Claude Code session...`);
      const loadedPrompts = await this.loadClaudeCodePrompts(session);

      if (loadedPrompts.length > 0) {
        // Create a working copy with loaded prompts for analysis
        sessionToAnalyze = {
          ...session,
          prompts: loadedPrompts,
        };
        console.log(`[GoalService] ✓ Loaded ${loadedPrompts.length} prompts for analysis`);
      } else {
        console.log('[GoalService] ✗ Failed to load Claude Code prompts, skipping analysis');
        return {
          progress: 0,
          reasoning: 'Could not load session prompts.',
        };
      }
    }

    // Skip if session has no prompts
    if (sessionToAnalyze.promptCount === 0 || sessionToAnalyze.prompts.length === 0) {
      console.log('[GoalService] ✗ Session has no prompts, skipping goal progress analysis');
      return {
        progress: 0,
        reasoning: 'Session has no prompts yet.',
      };
    }

    // Get LLM provider
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager) {
      console.warn('[GoalService] ✗ No LLM provider available for goal progress analysis');
      return null;
    }

    try {
      console.log(`[GoalService] 🔄 Creating GoalProgressAnalyzer and running analysis...`);
      // Create the analyzer and run analysis
      const analyzer = new GoalProgressAnalyzer(llmManager);
      const result = await analyzer.analyzeProgress(sessionToAnalyze, sessionToAnalyze.goal);

      console.log(`[GoalService] ✓ LLM analysis complete:`, result);

      // Build update payload - always include progress
      const updatePayload: { goalProgress: number; customName?: string } = {
        goalProgress: result.progress,
      };

      // Also set customName from sessionTitle if session doesn't already have one
      if (result.sessionTitle && !session.customName) {
        updatePayload.customName = result.sessionTitle;
        console.log(`[GoalService] ✓ Setting session title: "${result.sessionTitle}"`);
      }

      // Update the session
      await sessionManager.updateSession(session.id, updatePayload);

      console.log('[GoalService] ✓ Session updated with goalProgress:', result.progress);

      // Auto-set goal if inferred and session has no goal
      if (result.inferredGoal && !session.goal) {
        await sessionManager.setGoal(result.inferredGoal);
        console.log('[GoalService] ✓ Auto-set goal from progress analysis:', result.inferredGoal);
      }

      return result;
    } catch (error) {
      console.error('[GoalService] ✗ Goal progress analysis failed:', error);
      return null;
    }
  }

  /**
   * Register a callback to be notified when goal progress is updated
   * Used by message handlers to push updates to webview
   */
  public setProgressUpdateCallback(
    callback: (sessionId: string, progress: GoalProgressOutput) => void
  ): void {
    this.progressUpdateCallback = callback;
  }

  /**
   * Called when a new prompt is added to a session
   * Triggers goal progress analysis if conditions are met:
   * - Session has no goalProgress yet and has minimum prompts
   * - OR enough prompts have been added since last analysis
   * - AND debounce time has passed
   */
  public onPromptAdded(sessionId: string): void {
    console.log(`[GoalService] ▶ onPromptAdded called for session: ${sessionId}`);

    const sessionManager = getSessionManager();
    const sessions = sessionManager.getSessions();
    const session = sessions.find(s => s.id === sessionId);

    if (!session) {
      console.log(`[GoalService] ✗ Session not found: ${sessionId}`);
      return;
    }

    const promptCount = session.promptCount;
    const hasGoalProgress = session.goalProgress !== undefined && session.goalProgress > 0;
    const lastAnalysisCount = this.lastAnalysisPromptCount.get(sessionId) || 0;
    const lastAnalysisAt = this.lastAnalysisTime.get(sessionId) || 0;
    const now = Date.now();

    console.log(`[GoalService] State check:`, {
      promptCount,
      hasGoalProgress,
      goalProgress: session.goalProgress,
      lastAnalysisCount,
      lastAnalysisAt: lastAnalysisAt ? new Date(lastAnalysisAt).toISOString() : 'never',
      minPromptsRequired: this.config.minPromptsForProgressAnalysis,
      analysisInterval: this.config.progressAnalysisInterval,
    });

    // Determine if we should analyze
    let shouldAnalyze = false;
    let reason = '';

    // Case 1: No goal progress yet and we have minimum prompts
    if (!hasGoalProgress && promptCount >= this.config.minPromptsForProgressAnalysis) {
      shouldAnalyze = true;
      reason = 'no progress data yet';
    }
    // Case 2: Enough prompts since last analysis
    else if (promptCount - lastAnalysisCount >= this.config.progressAnalysisInterval) {
      shouldAnalyze = true;
      reason = `${this.config.progressAnalysisInterval} prompts since last analysis`;
    }

    if (!shouldAnalyze) {
      console.log(`[GoalService] ✗ Skipping analysis - conditions not met (promptCount=${promptCount}, hasGoalProgress=${hasGoalProgress})`);
      return;
    }

    console.log(`[GoalService] ✓ Should analyze: ${reason}`);

    // Check debounce
    const timeSinceLastAnalysis = now - lastAnalysisAt;
    if (lastAnalysisAt > 0 && timeSinceLastAnalysis < this.config.progressAnalysisDebounceMs) {
      // Schedule analysis after debounce period
      const existingTimer = this.pendingAnalysis.get(sessionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const delay = this.config.progressAnalysisDebounceMs - timeSinceLastAnalysis;
      console.log(`[GoalService] Debouncing goal progress analysis for ${sessionId}, will run in ${delay}ms`);

      const timer = setTimeout(() => {
        this.pendingAnalysis.delete(sessionId);
        this.triggerProgressAnalysis(sessionId, reason);
      }, delay);

      this.pendingAnalysis.set(sessionId, timer);
      return;
    }

    // Analyze immediately
    this.triggerProgressAnalysis(sessionId, reason);
  }

  /**
   * Analyze goal progress for top sessions on load (cockpit header rings)
   * Only analyzes sessions that need it (have prompts but no goalProgress)
   *
   * @param sessions - All sessions to consider
   */
  public async analyzeTopSessionsOnLoad(sessions: Session[]): Promise<void> {
    console.log(`[GoalService] ▶ analyzeTopSessionsOnLoad called with ${sessions.length} sessions`);

    const minPrompts = this.config.minPromptsForProgressAnalysis;

    // Enhanced sorting logic:
    // 1. Sessions with enough prompts for analysis come first
    // 2. Then active sessions
    // 3. Then by lastActivityTime descending
    const sorted = [...sessions].sort((a, b) => {
      const aHasEnoughPrompts = a.promptCount >= minPrompts;
      const bHasEnoughPrompts = b.promptCount >= minPrompts;

      // Sessions with enough prompts come first
      if (aHasEnoughPrompts && !bHasEnoughPrompts) return -1;
      if (!aHasEnoughPrompts && bHasEnoughPrompts) return 1;

      // Then active sessions
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;

      // Then by lastActivityTime (most recent first)
      return b.lastActivityTime.getTime() - a.lastActivityTime.getTime();
    });
    const topSessions = sorted.slice(0, 3);

    console.log(`[GoalService] Top 3 sessions:`, topSessions.map(s => ({
      id: s.id,
      promptCount: s.promptCount,
      goalProgress: s.goalProgress,
      isActive: s.isActive,
    })));

    // Filter to sessions that need analysis:
    // - Has prompts >= minPromptsForProgressAnalysis (1)
    // - No goalProgress set yet (undefined or 0)
    // Note: Claude Code sessions now supported - prompts are loaded on-demand in analyzeGoalProgress
    const sessionsNeedingAnalysis = topSessions.filter(s => {
      const hasEnoughPrompts = s.promptCount >= this.config.minPromptsForProgressAnalysis;
      const needsProgress = s.goalProgress === undefined || s.goalProgress === 0;
      return hasEnoughPrompts && needsProgress;
    });

    if (sessionsNeedingAnalysis.length === 0) {
      console.log(`[GoalService] ✓ No sessions need analysis (all have goalProgress or insufficient prompts)`);
      return;
    }

    console.log(`[GoalService] 🔄 ${sessionsNeedingAnalysis.length} sessions need goal progress analysis`);

    // Check if LLM manager is available
    try {
      const llmManager = ExtensionState.getLLMManager();
      if (!llmManager) {
        console.log('[GoalService] ✗ No LLM manager available, skipping top sessions analysis');
        return;
      }
      const activeProvider = llmManager.getActiveProvider();
      if (!activeProvider) {
        console.log('[GoalService] ✗ No active LLM provider yet, skipping top sessions analysis');
        return;
      }
      console.log(`[GoalService] ✓ LLM provider ready: ${activeProvider.type}`);
    } catch (error) {
      console.log('[GoalService] ✗ LLM manager not initialized, skipping top sessions analysis:', error);
      return;
    }

    // For each session needing analysis:
    for (const session of sessionsNeedingAnalysis) {
      // Skip if already analyzed recently
      const lastAnalysisAt = this.lastAnalysisTime.get(session.id) || 0;
      const now = Date.now();
      if (lastAnalysisAt > 0 && now - lastAnalysisAt < this.config.progressAnalysisDebounceMs) {
        console.log(`[GoalService] ⏭ Skipping ${session.id} - analyzed recently`);
        continue;
      }

      console.log(`[GoalService] 🔄 Analyzing goal progress for session ${session.id}...`);
      const result = await this.analyzeGoalProgress(session.id);

      if (result && result.progress !== undefined) {
        console.log(`[GoalService] ✓ Session ${session.id}: ${result.progress}%`);
        this.lastAnalysisTime.set(session.id, Date.now());
        this.lastAnalysisPromptCount.set(session.id, session.promptCount);

        // Notify via callback if registered
        if (this.progressUpdateCallback) {
          console.log(`[GoalService] 📤 Sending progress update to webview for ${session.id}`);
          this.progressUpdateCallback(session.id, result);
        }
      } else {
        console.log(`[GoalService] ✗ Analysis failed for session ${session.id}`);
      }
    }

    console.log(`[GoalService] ✓ analyzeTopSessionsOnLoad complete`);
  }

  /**
   * Internal method to trigger goal progress analysis
   */
  private async triggerProgressAnalysis(sessionId: string, reason: string): Promise<void> {
    console.log(`[GoalService] ▶ triggerProgressAnalysis called for ${sessionId}: ${reason}`);

    // Check if LLM manager is available AND has an active provider
    try {
      const llmManager = ExtensionState.getLLMManager();
      if (!llmManager) {
        console.log('[GoalService] ✗ No LLM manager available, skipping auto goal progress analysis');
        return;
      }
      // Check if provider is actually ready (fixes race condition on startup)
      const activeProvider = llmManager.getActiveProvider();
      if (!activeProvider) {
        console.log('[GoalService] ✗ No active LLM provider yet, skipping auto goal progress analysis (will retry on next prompt)');
        return;
      }
      console.log(`[GoalService] ✓ LLM provider ready: ${activeProvider.type}`);
    } catch (error) {
      // LLM manager not initialized - skip analysis silently
      console.log('[GoalService] ✗ LLM manager not initialized, skipping auto goal progress analysis:', error);
      return;
    }

    console.log(`[GoalService] 🔄 Running goal progress analysis for ${sessionId}...`);

    // Run analysis FIRST
    const result = await this.analyzeGoalProgress(sessionId);

    // Only update tracking if analysis succeeded (prevents failed attempts from blocking retries)
    if (result && result.progress !== undefined) {
      console.log(`[GoalService] ✓ Analysis succeeded! Progress: ${result.progress}%, Reasoning: ${result.reasoning}`);
      this.lastAnalysisTime.set(sessionId, Date.now());

      const sessionManager = getSessionManager();
      const sessions = sessionManager.getSessions();
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        this.lastAnalysisPromptCount.set(sessionId, session.promptCount);
      }

      // Notify via callback if registered
      if (this.progressUpdateCallback) {
        console.log(`[GoalService] 📤 Sending progress update to webview for ${sessionId}`);
        this.progressUpdateCallback(sessionId, result);
      }
    } else {
      console.log(`[GoalService] ✗ Goal progress analysis failed for ${sessionId}, will retry on next prompt`);
    }
  }
}

/**
 * Get GoalService singleton
 */
export function getGoalService(): GoalService {
  return GoalService.getInstance();
}
