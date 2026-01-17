/**
 * GoalService - Session Goal Management for Co-Pilot V2
 *
 * Responsibilities:
 * - Analyze last N prompts for common theme
 * - Generate suggested goal text (using LLM)
 * - Trigger inference modal after threshold
 * - Track goal completion
 */

import { getSessionManager } from './SessionManagerService';
import { PromptRecord, Session } from './types/session-types';
import { ExtensionState } from '../extension-state';
import { GoalProgressAnalyzer, GoalProgressOutput } from '../copilot/goal-progress-analyzer';

/**
 * Goal inference result
 */
export interface GoalInference {
  /** Suggested goal text */
  suggestedGoal: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Detected theme/topic */
  detectedTheme: string;
  /** Keywords that led to this inference */
  keywords: string[];
  /** Number of prompts analyzed */
  promptsAnalyzed: number;
}

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
 * Configuration for goal inference
 */
export interface GoalServiceConfig {
  /** Minimum prompts before suggesting a goal */
  minPromptsForInference: number;
  /** Minimum confidence to show suggestion */
  minConfidence: number;
  /** Time without goal before suggesting (minutes) */
  noGoalSuggestionDelayMinutes: number;
  /** Minimum prompts before first goal progress analysis */
  minPromptsForProgressAnalysis: number;
  /** Analyze goal progress every N prompts */
  progressAnalysisInterval: number;
  /** Minimum time between analyses (ms) */
  progressAnalysisDebounceMs: number;
}

const DEFAULT_CONFIG: GoalServiceConfig = {
  minPromptsForInference: 1,
  minConfidence: 0.3,
  noGoalSuggestionDelayMinutes: 0,
  minPromptsForProgressAnalysis: 2,
  progressAnalysisInterval: 3, // Analyze every 3 prompts
  progressAnalysisDebounceMs: 30000, // 30 seconds minimum between analyses
};

/**
 * Common development themes and their keywords
 */
const DEVELOPMENT_THEMES: Record<string, string[]> = {
  'Feature Development': ['feature', 'implement', 'build', 'create', 'add', 'new'],
  'Bug Fixing': ['bug', 'fix', 'error', 'issue', 'broken', 'debug', 'crash'],
  'Refactoring': ['refactor', 'clean', 'improve', 'restructure', 'reorganize', 'simplify'],
  'Testing': ['test', 'testing', 'spec', 'coverage', 'unit', 'integration', 'e2e'],
  'Documentation': ['document', 'docs', 'readme', 'comment', 'explain', 'describe'],
  'Performance': ['performance', 'optimize', 'speed', 'fast', 'slow', 'memory', 'cache'],
  'UI/UX': ['ui', 'ux', 'design', 'layout', 'style', 'css', 'component', 'button', 'form'],
  'API Development': ['api', 'endpoint', 'route', 'rest', 'graphql', 'request', 'response'],
  'Database': ['database', 'db', 'query', 'sql', 'schema', 'migration', 'model'],
  'Authentication': ['auth', 'login', 'logout', 'password', 'token', 'session', 'user'],
  'Configuration': ['config', 'settings', 'environment', 'setup', 'install'],
  'Deployment': ['deploy', 'build', 'ci', 'cd', 'pipeline', 'release', 'production'],
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

  private constructor() {}

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
      goal: session.goal,
      platform: session.platform,
    });

    // Skip if session has no prompts
    if (session.promptCount === 0 || session.prompts.length === 0) {
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
      const result = await analyzer.analyzeProgress(session, session.goal);

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
    // - Not a Claude Code session (their prompts aren't in SessionManagerService)
    // - Has prompts >= minPromptsForProgressAnalysis (2)
    // - No goalProgress set yet (undefined or 0)
    const sessionsNeedingAnalysis = topSessions.filter(s => {
      // Skip Claude Code sessions - their prompts are read from files, not stored in SessionManager
      if (s.platform === 'claude_code') {
        console.log(`[GoalService] ⏭ Skipping Claude Code session ${s.id} - prompts not in SessionManager`);
        return false;
      }
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

  /**
   * Check if we should suggest a goal
   */
  public shouldSuggestGoal(): boolean {
    const status = this.getGoalStatus();

    // Already has a goal
    if (status.hasGoal) {
      return false;
    }

    const sessionManager = getSessionManager();
    const session = sessionManager.getActiveSession();

    if (!session) {
      return false;
    }

    // Check minimum prompts
    if (session.prompts.length < this.config.minPromptsForInference) {
      return false;
    }

    // Check session duration
    const sessionDurationMinutes = (Date.now() - session.startTime.getTime()) / 60000;
    if (sessionDurationMinutes < this.config.noGoalSuggestionDelayMinutes) {
      return false;
    }

    return true;
  }

  /**
   * Infer a goal from recent prompts (LEGACY: pattern-matching version)
   * Use inferGoalWithLLM() for better results
   */
  public inferGoal(): GoalInference | null {
    const sessionManager = getSessionManager();
    const session = sessionManager.getActiveSession();

    if (!session || session.prompts.length < this.config.minPromptsForInference) {
      return null;
    }

    // Get recent prompts
    const recentPrompts = session.prompts.slice(0, 5);
    const promptTexts = recentPrompts.map(p => p.text.toLowerCase());
    const combinedText = promptTexts.join(' ');

    // Analyze for themes
    const themeScores = this.analyzeThemes(combinedText);

    // Get top theme
    const topTheme = this.getTopTheme(themeScores);

    if (!topTheme || topTheme.score < this.config.minConfidence) {
      return null;
    }

    // Extract specific keywords
    const keywords = this.extractKeywords(combinedText, topTheme.theme);

    // Generate goal suggestion
    const suggestedGoal = this.generateGoalText(topTheme.theme, keywords, recentPrompts);

    return {
      suggestedGoal,
      confidence: topTheme.score,
      detectedTheme: topTheme.theme,
      keywords,
      promptsAnalyzed: recentPrompts.length,
    };
  }

  /**
   * Infer a goal from recent prompts using LLM (ASYNC)
   * This provides much better accuracy than pattern matching
   */
  public async inferGoalWithLLM(): Promise<GoalInference | null> {
    const sessionManager = getSessionManager();
    const session = sessionManager.getActiveSession();

    if (!session || session.prompts.length < this.config.minPromptsForInference) {
      return null;
    }

    // Get LLM provider
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager) {
      console.warn('[GoalService] No LLM provider available, falling back to pattern matching');
      return this.inferGoal(); // Fallback to pattern matching
    }

    try {
      // Get recent prompts
      const recentPrompts = session.prompts.slice(0, 5);
      const promptsList = recentPrompts
        .map((p, i) => `${i + 1}. ${p.text}`)
        .join('\n\n');

      // Create LLM prompt
      const systemPrompt = `You are analyzing a developer's recent coding session prompts to infer their current goal.
Your task is to:
1. Identify the common theme/task across the prompts
2. Generate a concise, actionable goal statement (max 8 words)
3. Provide confidence score (0-100)

Respond in JSON format:
{
  "goal": "Brief goal statement",
  "theme": "Bug Fixing | Feature Development | Refactoring | Testing | Documentation | UI/UX | Performance | Setup",
  "confidence": 85,
  "reasoning": "Brief explanation"
}`;

      const userPrompt = `Analyze these recent prompts and infer the developer's goal:

${promptsList}

What is the developer trying to accomplish?`;

      // Call LLM
      const response = await llmManager.generateCompletion({
        prompt: userPrompt,
        systemPrompt,
        temperature: 0.3, // Low temperature for consistent output
        maxTokens: 200,
      });

      // Parse response
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[GoalService] LLM response not in JSON format, falling back');
        return this.inferGoal();
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        suggestedGoal: parsed.goal || 'Continue working on current task',
        confidence: (parsed.confidence || 50) / 100, // Convert to 0-1
        detectedTheme: parsed.theme || 'General Development',
        keywords: [parsed.reasoning || ''], // Use reasoning as keyword
        promptsAnalyzed: recentPrompts.length,
      };
    } catch (error) {
      console.error('[GoalService] LLM inference failed:', error);
      // Fallback to pattern matching
      return this.inferGoal();
    }
  }

  /**
   * Analyze text for development themes
   */
  private analyzeThemes(text: string): Map<string, number> {
    const scores = new Map<string, number>();

    for (const [theme, keywords] of Object.entries(DEVELOPMENT_THEMES)) {
      let matchCount = 0;
      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = text.match(regex);
        if (matches) {
          matchCount += matches.length;
        }
      }
      if (matchCount > 0) {
        // Normalize score based on number of keywords
        scores.set(theme, matchCount / keywords.length);
      }
    }

    return scores;
  }

  /**
   * Get the top-scoring theme
   */
  private getTopTheme(scores: Map<string, number>): { theme: string; score: number } | null {
    let topTheme: string | null = null;
    let topScore = 0;

    for (const [theme, score] of scores) {
      if (score > topScore) {
        topScore = score;
        topTheme = theme;
      }
    }

    if (!topTheme) {
      return null;
    }

    // Normalize to 0-1 range
    const normalizedScore = Math.min(1, topScore / 3);

    return { theme: topTheme, score: normalizedScore };
  }

  /**
   * Extract specific keywords from text
   */
  private extractKeywords(text: string, theme: string): string[] {
    const keywords: string[] = [];
    const themeKeywords = DEVELOPMENT_THEMES[theme] || [];

    // Find matching theme keywords
    for (const keyword of themeKeywords) {
      if (text.includes(keyword)) {
        keywords.push(keyword);
      }
    }

    // Extract technical terms
    const techTerms = text.match(/\b(component|function|class|module|service|api|endpoint|database|table|field|variable|method|hook|state|context|reducer|action|selector|route|page|view|controller|model|schema|migration|test|spec|fixture|mock|stub|spy)\b/gi);
    if (techTerms) {
      keywords.push(...new Set(techTerms.map(t => t.toLowerCase())));
    }

    return keywords.slice(0, 5); // Limit to 5 keywords
  }

  /**
   * Generate a goal text suggestion
   */
  private generateGoalText(theme: string, keywords: string[], prompts: PromptRecord[]): string {
    // Try to extract a specific target from prompts
    const specificTarget = this.extractSpecificTarget(prompts);

    if (specificTarget) {
      // Use specific target in goal
      switch (theme) {
        case 'Feature Development':
          return `Implement ${specificTarget}`;
        case 'Bug Fixing':
          return `Fix ${specificTarget}`;
        case 'Refactoring':
          return `Refactor ${specificTarget}`;
        case 'Testing':
          return `Write tests for ${specificTarget}`;
        case 'Documentation':
          return `Document ${specificTarget}`;
        case 'UI/UX':
          return `Design ${specificTarget}`;
        default:
          return `Work on ${specificTarget}`;
      }
    }

    // Generate generic goal based on theme
    const keywordStr = keywords.slice(0, 2).join(' and ');
    switch (theme) {
      case 'Feature Development':
        return `Implement new feature${keywordStr ? ` (${keywordStr})` : ''}`;
      case 'Bug Fixing':
        return `Fix bugs and issues`;
      case 'Refactoring':
        return `Clean up and refactor code`;
      case 'Testing':
        return `Improve test coverage`;
      case 'Documentation':
        return `Update documentation`;
      case 'Performance':
        return `Optimize performance`;
      case 'UI/UX':
        return `Improve user interface`;
      case 'API Development':
        return `Build API endpoints`;
      case 'Database':
        return `Database work`;
      case 'Authentication':
        return `Authentication system`;
      default:
        return `Development session`;
    }
  }

  /**
   * Extract a specific target from prompt texts
   */
  private extractSpecificTarget(prompts: PromptRecord[]): string | null {
    for (const prompt of prompts) {
      const text = prompt.text;

      // Look for patterns like "the X component", "X function", etc.
      const patterns = [
        /(?:the\s+)?(\w+)\s+(?:component|function|class|module|service|hook)/i,
        /(?:implement|create|build|add)\s+(?:a\s+)?(\w+(?:\s+\w+)?)/i,
        /(?:fix|debug|resolve)\s+(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:bug|issue|error)/i,
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[1].length > 2) {
          return match[1];
        }
      }
    }

    return null;
  }
}

/**
 * Get GoalService singleton
 */
export function getGoalService(): GoalService {
  return GoalService.getInstance();
}
