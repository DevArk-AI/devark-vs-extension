/**
 * CoachingService
 *
 * Generates intelligent coaching suggestions after AI agent responses.
 * Uses LLM with XML-structured prompts to produce actionable next steps.
 *
 * Features:
 * - Response analysis integration
 * - Context-aware suggestions
 * - Goal alignment
 * - Throttling to prevent suggestion spam
 * - VS Code toast notifications
 *
 * Performance budget:
 * - Response analysis: 100ms (heuristics)
 * - Context gathering: 500ms (cached)
 * - LLM suggestion: 2000ms (with fallback)
 * - Total: ~2.5 seconds
 */

import * as vscode from 'vscode';
import type { CapturedResponse } from './types/response-types';
import type { CapturedPrompt } from './HookBasedPromptService';
import type {
  CoachingSuggestion,
  CoachingData,
  CoachingState,
  CoachingListener,
  CoachingOptions,
  CoachingResult,
  CoachingConfig,
  ResponseAnalysis,
} from './types/coaching-types';
import { DEFAULT_COACHING_CONFIG } from './types/coaching-types';
import { getResponseAnalyzer } from './ResponseAnalyzer';
import { getGoalService } from './GoalService';
import { getSessionManager } from './SessionManagerService';
import { getSmartSnippetService } from './SmartSnippetService';
import { ExtensionState } from '../extension-state';
import type { CoPilotStorageManager } from '../copilot/storage';

/**
 * Enriched system prompt for coaching
 * Provides detailed instructions for generating specific, actionable suggestions
 */
const COACHING_SYSTEM_PROMPT = `You are an expert coding coach analyzing a developer's AI-assisted coding session.

CRITICAL RULES:
1. NEVER give generic advice like "add tests" or "improve documentation"
2. ALWAYS reference specific files, functions, or code from the context provided
3. ALWAYS explain WHY the suggestion matters for THIS specific work
4. Make suggestions that build directly on what was just accomplished
5. If a goal is set, prioritize suggestions that advance the goal
6. Consider what the developer's prompt was trying to achieve

SUGGESTION QUALITY EXAMPLES:
- BAD: "Consider adding tests" (too generic)
- GOOD: "Write tests for the handleAuth function - specifically test the token expiration edge case you just implemented"

- BAD: "Add documentation"
- GOOD: "Add JSDoc to the new validateUserInput function - document the expected input format and the validation rules"

Each suggestion must include:
- Specific file or function to work on
- Clear, actionable first step
- Why this matters NOW based on the context`;

// Debug logging - controlled by VIBE_LOG_DEBUG environment variable (set via devark.toggleDebugMode command)
const DEBUG_COACHING = process.env.VIBE_LOG_DEBUG === 'true';

/**
 * CoachingService - Singleton service for generating coaching suggestions
 *
 * Two-Tier Storage Design:
 * - L1 Memory Cache: Fast in-memory Map (max 50 entries, LRU eviction)
 * - L2 Disk Storage: Persistent coaching files (7-day retention, daily cleanup)
 *
 * LRU eviction removes from memory only; disk files cleaned by retention policy.
 */
export class CoachingService {
  private static instance: CoachingService | null = null;

  private config: CoachingConfig;
  private lastCoachingTime: number = 0;
  private cooldownUntil: number = 0;
  // Store coaching per promptId for history navigation (in-memory cache)
  private coachingByPromptId: Map<string, CoachingData> = new Map();
  private currentPromptId: string | null = null;
  private listeners: Set<CoachingListener> = new Set();
  // Track which responses are currently being processed (by response ID)
  private processingResponses: Set<string> = new Set();
  // Maximum coaching entries to keep in memory (LRU eviction)
  private readonly MAX_COACHING_ENTRIES = 50;
  // Storage manager for disk persistence (optional)
  private storageManager: CoPilotStorageManager | null = null;

  private constructor(config: Partial<CoachingConfig> = {}) {
    this.config = { ...DEFAULT_COACHING_CONFIG, ...config };
  }

  public static getInstance(): CoachingService {
    if (!CoachingService.instance) {
      CoachingService.instance = new CoachingService();
    }
    return CoachingService.instance;
  }

  /**
   * Initialize with storage manager for disk persistence
   * Call this after creating CoPilotStorageManager
   */
  public setStorageManager(storageManager: CoPilotStorageManager): void {
    this.storageManager = storageManager;
    // Load recent coaching from disk on initialization
    this.loadRecentCoachingFromDisk().catch(err => {
      console.warn('[CoachingService] Failed to load coaching from disk:', err);
    });
  }

  /**
   * Process a captured response and generate coaching
   * @param response The captured response from the AI agent
   * @param linkedPrompt Optional prompt that triggered this response (for context)
   * @param options Coaching generation options
   */
  public async processResponse(
    response: CapturedResponse,
    linkedPrompt?: CapturedPrompt,
    options: CoachingOptions = {}
  ): Promise<CoachingResult> {
    const responseId = response.id;

    // DIAGNOSTIC: Log all incoming responses with key identifying info
    console.log('[CoachingService] processResponse CALLED', {
      responseId,
      sessionId: response.sessionId,
      source: response.source,
      promptId: response.promptId,
      isAlreadyProcessing: this.processingResponses.has(responseId),
      currentlyProcessing: Array.from(this.processingResponses),
      timestamp: new Date().toISOString(),
    });

    if (DEBUG_COACHING) {
      console.log('[CoachingService] Processing response:', responseId);
    }

    // Prevent duplicate processing of the same response
    if (this.processingResponses.has(responseId)) {
      console.log('[CoachingService] SKIPPED - this response is already being processed', {
        responseId,
      });
      return { generated: false, reason: 'duplicate' };
    }

    // Check if coaching is enabled
    if (!this.config.enabled && !options.force) {
      console.log('[CoachingService] SKIPPED - coaching disabled', {
        enabled: this.config.enabled,
        force: options.force,
        responseId: response.id,
      });
      return { generated: false, reason: 'throttled' };
    }

    // Check throttling
    if (!options.force && !this.shouldShowCoaching()) {
      const reason = this.isCooldown() ? 'cooldown' : 'throttled';
      console.log('[CoachingService] SKIPPED -', reason, {
        responseId: response.id,
        cooldownUntil: this.cooldownUntil ? new Date(this.cooldownUntil).toISOString() : null,
        lastCoachingTime: this.lastCoachingTime ? new Date(this.lastCoachingTime).toISOString() : null,
      });
      return { generated: false, reason };
    }

    // Mark this response as being processed
    this.processingResponses.add(responseId);
    console.log('[CoachingService] Started processing response:', responseId);

    try {
      // Analyze the response
      const analyzer = getResponseAnalyzer();
      const analysis = await analyzer.analyzeResponse(response);

      // Only coach on successful or partial completions
      if (analysis.outcome === 'error') {
        console.log('[CoachingService] SKIPPED - response outcome was error', {
          responseId,
          outcome: analysis.outcome,
        });
        return { generated: false, reason: 'error_response' };
      }

      // Generate suggestions
      const suggestions = await this.generateSuggestions(response, analysis, options, linkedPrompt);

      if (suggestions.length === 0) {
        console.log('[CoachingService] SKIPPED - no suggestions generated', {
          responseId,
          analysisOutcome: analysis.outcome,
        });
        return { generated: false, reason: 'no_suggestions' };
      }

      // Create coaching data with prompt linking (Workstream D)
      const coaching: CoachingData = {
        analysis,
        suggestions,
        timestamp: new Date(),
        responseId,
        promptId: response.promptId,
        promptText: linkedPrompt?.prompt,
        source: response.source,
        sessionId: response.sessionId || response.conversationId,
      };

      // Store by promptId for history navigation
      const promptIdKey = response.promptId || responseId || `coaching-${Date.now()}`;
      this.setCoachingForPrompt(promptIdKey, coaching);
      this.currentPromptId = promptIdKey;

      this.lastCoachingTime = Date.now();

      // Notify listeners
      console.log('[CoachingService] SUCCESS - coaching generated', {
        suggestionCount: suggestions.length,
        promptId: promptIdKey,
        responseId,
        listenerCount: this.listeners.size,
      });
      this.notifyListeners();

      // Show toast notification
      if (this.config.showToasts && options.showToast !== false) {
        await this.showToast();
      }

      return { generated: true, coaching };

    } catch (error) {
      console.error('[CoachingService] Error processing response:', error);
      return { generated: false, reason: 'error' };
    } finally {
      // Remove from processing set when done
      this.processingResponses.delete(responseId);
      console.log('[CoachingService] Finished processing response:', responseId);
    }
  }

  /**
   * Generate coaching suggestions
   */
  private async generateSuggestions(
    response: CapturedResponse,
    analysis: ResponseAnalysis,
    options: CoachingOptions,
    linkedPrompt?: CapturedPrompt
  ): Promise<CoachingSuggestion[]> {
    const maxSuggestions = options.maxSuggestions ?? 3;
    const minConfidence = options.minConfidence ?? 0.3;

    try {
      // Try LLM-based generation
      const llmManager = ExtensionState.getLLMManager();
      if (!llmManager) {
        if (DEBUG_COACHING) {
          console.log('[CoachingService] No LLM manager - using fallback');
        }
        return this.getFallbackSuggestions(analysis, maxSuggestions);
      }

      const provider = llmManager.getActiveProvider();
      if (!provider) {
        if (DEBUG_COACHING) {
          console.log('[CoachingService] No active provider - using fallback');
        }
        return this.getFallbackSuggestions(analysis, maxSuggestions);
      }

      // Build context
      const goalService = getGoalService();
      const goalStatus = goalService.getGoalStatus();

      // Build the enriched coaching prompt
      const prompt = await this.buildCoachingPrompt(response, analysis, goalStatus, linkedPrompt);

      if (DEBUG_COACHING) {
        console.log('[CoachingService] Calling LLM for suggestions...');
      }

      // Get response from LLM with enriched system prompt
      const result = await llmManager.generateCompletion({
        prompt,
        systemPrompt: COACHING_SYSTEM_PROMPT,
        temperature: 0.3,
        maxTokens: 1000,
      });

      if (!result || !result.text) {
        return this.getFallbackSuggestions(analysis, maxSuggestions);
      }

      // Parse suggestions from LLM response
      const suggestions = this.parseSuggestions(result.text, minConfidence, maxSuggestions);

      if (suggestions.length === 0) {
        return this.getFallbackSuggestions(analysis, maxSuggestions);
      }

      return suggestions;

    } catch (error) {
      console.error('[CoachingService] LLM error:', error);
      return this.getFallbackSuggestions(analysis, maxSuggestions);
    }
  }

  /**
   * Build XML-structured prompt for coaching suggestions
   * Now includes enriched context: full response, prompt, session history, code snippets
   */
  private async buildCoachingPrompt(
    response: CapturedResponse,
    analysis: ResponseAnalysis,
    goalStatus: { hasGoal?: boolean; goalText?: string },
    linkedPrompt?: CapturedPrompt
  ): Promise<string> {
    // Get session context
    let techStack = 'unknown';
    let recentTopics = 'none';
    let sessionDuration = 0;

    try {
      const { getContextExtractor } = require('./ContextExtractor');
      const contextExtractor = getContextExtractor();
      const sessionContext = contextExtractor.extractSessionContext();
      if (sessionContext) {
        techStack = sessionContext.techStack?.join(', ') || 'unknown';
        recentTopics = sessionContext.topics?.join(', ') || 'none';
      }
    } catch (e) {
      console.warn('[CoachingService] Context extractor not available:', e);
    }

    // Get session duration and history from SessionManagerService (consolidated)
    let sessionHistoryXml = '';
    try {
      const sessionManager = getSessionManager();
      const session = sessionManager.getActiveSession();

      // Get session duration
      if (session) {
        sessionDuration = Math.round((Date.now() - session.startTime.getTime()) / 60000);
      }

      // Get session history (last 3 interactions)
      const lastInteractions = sessionManager.getLastInteractions(3);

      // Build first prompt section
      const firstPromptText = session?.prompts[session.prompts.length - 1]?.text.slice(0, 500) || 'N/A';

      // Build recent interactions section
      const interactionsXml = lastInteractions.map((interaction, i) => `
<interaction index="${i + 1}">
<user_prompt>${interaction.prompt.text.slice(0, 400)}</user_prompt>
<agent_response>${interaction.response?.text.slice(0, 600) || 'No response captured'}</agent_response>
<files_modified>${interaction.response?.filesModified.join(', ') || 'none'}</files_modified>
</interaction>`).join('');

      sessionHistoryXml = `
<session_history>
<first_prompt>${firstPromptText}</first_prompt>
<recent_interactions>${interactionsXml}
</recent_interactions>
</session_history>`;
    } catch (e) {
      console.warn('[CoachingService] Session manager not available:', e);
      sessionHistoryXml = '<session_history><error>Session history not available</error></session_history>';
    }

    // Get code snippets from modified files
    let codeContextXml = '<code_context><no_relevant_code_found/></code_context>';
    try {
      const modifiedFiles = response.filesModified || analysis.entitiesModified || [];
      if (modifiedFiles.length > 0) {
        const snippetService = getSmartSnippetService();
        const snippets = await snippetService.getSnippetsFromFiles(modifiedFiles);
        if (snippets.length > 0) {
          codeContextXml = `<code_context>
${snippets.map(s => `<snippet file="${s.filePath}" entity="${s.entityName}">
${s.relevantCode.slice(0, 500)}
</snippet>`).join('\n')}
</code_context>`;
        }
      }
    } catch (e) {
      console.warn('[CoachingService] Failed to get code snippets:', e);
    }

    // Build triggering prompt section
    const triggeringPromptXml = linkedPrompt?.prompt
      ? `<triggering_prompt>
<text>${linkedPrompt.prompt.slice(0, 500)}</text>
</triggering_prompt>`
      : '<triggering_prompt><text>N/A</text></triggering_prompt>';

    return `<coaching_request>

<current_response>
<full_text>${(response.response || '').slice(0, 3000)}</full_text>
<summary>${analysis.summary}</summary>
<outcome>${analysis.outcome}</outcome>
<files_modified>${analysis.entitiesModified.join(', ') || 'none'}</files_modified>
<tool_calls>${response.toolCalls?.map(t => t.name).join(', ') || 'none'}</tool_calls>
</current_response>

${triggeringPromptXml}

<session_goal>
<text>${goalStatus.hasGoal && goalStatus.goalText ? goalStatus.goalText : 'No goal set'}</text>
<progress>${analysis.goalProgress?.after ?? 0}%</progress>
</session_goal>

${sessionHistoryXml}

<session_context>
<tech_stack>${techStack}</tech_stack>
<recent_topics>${recentTopics}</recent_topics>
<session_duration>${sessionDuration} minutes</session_duration>
</session_context>

${codeContextXml}

<instructions>
Generate 1-3 coaching suggestions for what the developer should do next.
Each suggestion MUST:
1. Reference specific files, functions, or code from the context above
2. Build directly on what was just accomplished
3. Align with the session goal if set
4. Be specific and actionable (not generic)
5. Include a ready-to-use prompt

Return as JSON array:
[
  {
    "type": "test|follow_up|error_prevention|documentation|refactor|goal_alignment|celebration",
    "title": "Short action title (reference specific file/function)",
    "description": "Why this is recommended NOW for THIS specific work",
    "suggestedPrompt": "The exact prompt to use (specific to the code context)",
    "confidence": 0.0-1.0,
    "reasoning": "Why this suggestion based on the context"
  }
]

Only return the JSON array, no other text.
</instructions>

</coaching_request>`;
  }

  /**
   * Parse suggestions from LLM response
   */
  private parseSuggestions(
    llmResponse: string,
    minConfidence: number,
    maxSuggestions: number
  ): CoachingSuggestion[] {
    try {
      // Extract JSON from response
      const jsonMatch = llmResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        if (DEBUG_COACHING) {
          console.log('[CoachingService] No JSON array found in response');
        }
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!Array.isArray(parsed)) {
        return [];
      }

      // Validate and transform suggestions
      const suggestions: CoachingSuggestion[] = parsed
        .filter((s: any) => {
          return s.title && s.suggestedPrompt && (s.confidence ?? 0.5) >= minConfidence;
        })
        .map((s: any, i: number) => ({
          id: `suggestion-${Date.now()}-${i}`,
          type: this.validateSuggestionType(s.type),
          title: String(s.title).substring(0, 100),
          description: String(s.description || '').substring(0, 300),
          suggestedPrompt: String(s.suggestedPrompt).substring(0, 1000),
          confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0.5)),
          reasoning: String(s.reasoning || '').substring(0, 300),
        }))
        .slice(0, maxSuggestions);

      return suggestions;

    } catch (error) {
      console.error('[CoachingService] Parse error:', error);
      return [];
    }
  }

  /**
   * Validate suggestion type
   */
  private validateSuggestionType(type: string): CoachingSuggestion['type'] {
    const validTypes: CoachingSuggestion['type'][] = [
      'follow_up', 'test', 'error_prevention', 'documentation',
      'refactor', 'goal_alignment', 'celebration'
    ];

    if (validTypes.includes(type as any)) {
      return type as CoachingSuggestion['type'];
    }

    return 'follow_up'; // Default type
  }

  /**
   * Generate fallback suggestions when LLM is unavailable
   */
  private getFallbackSuggestions(
    analysis: ResponseAnalysis,
    maxSuggestions: number
  ): CoachingSuggestion[] {
    const suggestions: CoachingSuggestion[] = [];
    const timestamp = Date.now();

    // Suggest tests if files were modified
    if (analysis.entitiesModified.length > 0) {
      const firstFile = analysis.entitiesModified[0];
      suggestions.push({
        id: `fallback-test-${timestamp}`,
        type: 'test',
        title: 'Add tests for changes',
        description: 'Consider adding tests for the modified files to ensure they work correctly.',
        suggestedPrompt: `Write unit tests for the changes in ${firstFile}. Cover the main functionality and edge cases.`,
        confidence: 0.6,
        reasoning: 'Files were modified without explicit test updates',
      });
    }

    // Suggest documentation if outcome was success
    if (analysis.outcome === 'success' && analysis.entitiesModified.length > 0) {
      suggestions.push({
        id: `fallback-doc-${timestamp}`,
        type: 'documentation',
        title: 'Document the changes',
        description: 'Add comments or documentation for the new code.',
        suggestedPrompt: `Add JSDoc comments to the new functions and update any relevant documentation.`,
        confidence: 0.5,
        reasoning: 'Successful changes could benefit from documentation',
      });
    }

    // Suggest follow-up based on topics
    if (analysis.topicsAddressed.includes('Bug Fix')) {
      suggestions.push({
        id: `fallback-followup-${timestamp}`,
        type: 'follow_up',
        title: 'Verify the fix',
        description: 'Test the bug fix to ensure it works as expected.',
        suggestedPrompt: `Test the bug fix we just made. Verify it works correctly and doesn't introduce any regressions.`,
        confidence: 0.7,
        reasoning: 'Bug fixes should be verified',
      });
    }

    return suggestions.slice(0, maxSuggestions);
  }

  /**
   * Show VS Code toast notification
   */
  private async showToast(): Promise<void> {
    const coaching = this.getCurrentCoaching();
    if (!coaching || coaching.suggestions.length === 0) {
      return;
    }
    const topSuggestion = coaching.suggestions[0];

    const action = await vscode.window.showInformationMessage(
      `${coaching.analysis.summary} | ${topSuggestion.title}`,
      'View in CoPilot',
      'Use Prompt',
      'Not Now'
    );

    switch (action) {
      case 'View in CoPilot':
        await vscode.commands.executeCommand('devark.showMenu');
        break;

      case 'Use Prompt':
        await this.injectPrompt(topSuggestion.suggestedPrompt);
        break;

      case 'Not Now':
        this.cooldownUntil = Date.now() + this.config.cooldownDuration;
        if (DEBUG_COACHING) {
          console.log('[CoachingService] User dismissed - cooldown until:', new Date(this.cooldownUntil));
        }
        break;
    }
  }

  /**
   * Inject a prompt into the active editor or clipboard
   */
  private async injectPrompt(prompt: string): Promise<void> {
    try {
      // Try the vibelog command first
      await vscode.commands.executeCommand('devark.useImprovedPrompt', { prompt });
    } catch {
      // Fallback: copy to clipboard
      await vscode.env.clipboard.writeText(prompt);
      vscode.window.showInformationMessage('Prompt copied to clipboard');
    }
  }

  /**
   * Check if coaching should be shown (respects throttling)
   */
  private shouldShowCoaching(): boolean {
    const now = Date.now();

    // Check cooldown from "Not Now"
    if (this.isCooldown()) {
      return false;
    }

    // Check minimum interval
    if (now - this.lastCoachingTime < this.config.minInterval) {
      return false;
    }

    return true;
  }

  /**
   * Check if on cooldown
   */
  private isCooldown(): boolean {
    return Date.now() < this.cooldownUntil;
  }

  // ==========================================
  // Public API
  // ==========================================

  /**
   * Get current coaching data (most recently generated or selected)
   */
  public getCurrentCoaching(): CoachingData | null {
    if (this.currentPromptId) {
      return this.coachingByPromptId.get(this.currentPromptId) || null;
    }
    // Fallback: return most recent if no current promptId
    const entries = Array.from(this.coachingByPromptId.values());
    return entries.length > 0 ? entries[entries.length - 1] : null;
  }

  /**
   * Load recent coaching from disk into memory cache
   */
  private async loadRecentCoachingFromDisk(): Promise<void> {
    if (!this.storageManager) {
      return;
    }

    try {
      const recentCoaching = await this.storageManager.getRecentCoaching(this.MAX_COACHING_ENTRIES);
      recentCoaching.forEach((coaching, index) => {
        const id = coaching.promptId || coaching.responseId || `coaching-${Date.now()}-${index}`;
        this.coachingByPromptId.set(id, coaching);
      });
      if (DEBUG_COACHING) {
        console.log('[CoachingService] Loaded', recentCoaching.length, 'coaching entries from disk');
      }
    } catch (error) {
      console.error('[CoachingService] Failed to load coaching from disk:', error);
    }
  }

  /**
   * Get coaching data for a specific prompt
   * Used when navigating prompt history
   * Checks memory cache first, then disk
   */
  public async getCoachingForPrompt(promptId: string): Promise<CoachingData | null> {
    if (DEBUG_COACHING) {
      console.log('[CoachingService] Getting coaching for prompt:', promptId);
    }

    // Check memory cache first
    const cached = this.coachingByPromptId.get(promptId);
    if (cached) {
      return cached;
    }

    // Try loading from disk if storage manager available
    if (this.storageManager) {
      try {
        const fromDisk = await this.storageManager.loadCoaching(promptId);
        if (fromDisk) {
          // Add to memory cache
          this.coachingByPromptId.set(promptId, fromDisk);
          return fromDisk;
        }
      } catch (error) {
        console.error('[CoachingService] Failed to load coaching from disk:', error);
      }
    }

    return null;
  }

  /**
   * Store coaching data for a specific prompt
   * Handles LRU eviction when max entries exceeded
   * Persists to disk if storage manager available
   *
   * Note: LRU eviction only removes from memory cache. Disk files remain
   * until 7-day cleanup, enabling history navigation across restarts.
   */
  public setCoachingForPrompt(promptId: string, coaching: CoachingData): void {
    // Enforce max entries (LRU eviction from memory only - disk files preserved)
    if (this.coachingByPromptId.size >= this.MAX_COACHING_ENTRIES) {
      const firstKey = this.coachingByPromptId.keys().next().value;
      if (firstKey !== undefined) {
        this.coachingByPromptId.delete(firstKey);
        if (DEBUG_COACHING) {
          console.log('[CoachingService] Evicted oldest coaching:', firstKey);
        }
      }
    }

    // Store in memory cache
    this.coachingByPromptId.set(promptId, coaching);

    // Persist to disk if storage manager available
    if (this.storageManager) {
      this.storageManager.saveCoaching(coaching).catch(err => {
        console.error('[CoachingService] Failed to save coaching to disk:', err);
      });
    }

    if (DEBUG_COACHING) {
      console.log('[CoachingService] Stored coaching for prompt:', promptId);
    }
  }

  /**
   * Set the current prompt context (for UI display)
   * Called when user selects a prompt from history
   */
  public setCurrentPromptId(promptId: string | null): void {
    this.currentPromptId = promptId;
    if (DEBUG_COACHING) {
      console.log('[CoachingService] Set current prompt:', promptId);
    }
  }

  /**
   * Get coaching state
   */
  public getState(): CoachingState {
    const currentCoaching = this.getCurrentCoaching();
    return {
      isListening: this.config.enabled,
      currentCoaching,
      lastUpdated: currentCoaching?.timestamp ?? null,
      onCooldown: this.isCooldown(),
      cooldownEndsAt: this.isCooldown() ? new Date(this.cooldownUntil) : undefined,
    };
  }

  /**
   * Subscribe to coaching updates
   */
  public subscribe(listener: CoachingListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of coaching update
   */
  private notifyListeners(): void {
    const coaching = this.getCurrentCoaching();
    if (coaching) {
      for (const listener of this.listeners) {
        try {
          listener(coaching);
        } catch (error) {
          console.error('[CoachingService] Listener error:', error);
        }
      }
    }
  }

  /**
   * Dismiss a specific suggestion
   */
  public dismissSuggestion(id: string): void {
    if (this.currentPromptId) {
      const coaching = this.coachingByPromptId.get(this.currentPromptId);
      if (coaching) {
        coaching.suggestions = coaching.suggestions.filter(s => s.id !== id);
        this.coachingByPromptId.set(this.currentPromptId, coaching);
        this.notifyListeners();
      }
    }
  }

  /**
   * Dismiss all current coaching (clears current prompt's coaching)
   */
  public dismissAll(): void {
    if (this.currentPromptId) {
      this.coachingByPromptId.delete(this.currentPromptId);
    }
    this.currentPromptId = null;
    this.notifyListeners();
  }

  /**
   * Clear all coaching data (used when clearing session)
   */
  public clearAll(): void {
    this.coachingByPromptId.clear();
    this.currentPromptId = null;
    if (DEBUG_COACHING) {
      console.log('[CoachingService] Cleared all coaching data');
    }
  }

  /**
   * Enable/disable coaching
   */
  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<CoachingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset cooldown (for testing or admin override)
   */
  public resetCooldown(): void {
    this.cooldownUntil = 0;
  }

  /**
   * Reset the processing state
   * Called when initializing to clear any stale state from previous sessions
   */
  public resetProcessingState(): void {
    if (this.processingResponses.size > 0) {
      console.log('[CoachingService] Resetting stale processing state, had:', Array.from(this.processingResponses));
    }
    this.processingResponses.clear();
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    CoachingService.instance = null;
  }
}

/**
 * Get the singleton CoachingService instance
 */
export function getCoachingService(): CoachingService {
  return CoachingService.getInstance();
}
