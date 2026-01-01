/**
 * UnifiedPromptDetectionService - Central orchestrator for prompt detection
 *
 * Manages multiple prompt source adapters (Cursor, Claude Code, etc.)
 * and routes detected prompts to:
 * - SessionManagerService (for project/session tracking)
 * - LLM analysis (for scoring and enhancement)
 * - Webview (for UI updates)
 *
 * This is the single entry point for all prompt detection, regardless of source.
 */

import type {
  PromptSourceAdapter,
  DetectedPrompt,
  AdapterStatus,
  PromptDetectionConfig,
  KnownSourceId,
} from '../adapters/prompt-detection/types';
import { getSourceDisplayName } from '../adapters/prompt-detection/types';
import { getSessionManager } from './SessionManagerService';
import { ExtensionState } from '../extension-state';
import { gatherPromptContext } from './context-utils';

/**
 * Message handler interface for webview communication
 */
interface MessageHandler {
  sendMessage(type: string, data: unknown): void;
}

/**
 * Callback for prompt events
 */
export type UnifiedPromptCallback = (prompt: DetectedPrompt, analysis?: PromptAnalysis) => void;

import type { ScoreBreakdownV2, ScoreExplanationV2 } from './types/score-types';

/**
 * Analysis result from LLM
 */
export interface PromptAnalysis {
  score: number;
  categoryScores: {
    clarity: number;
    specificity: number;
    context: number;
    actionability: number;
  };
  breakdown?: ScoreBreakdownV2;
  explanation?: ScoreExplanationV2;
  suggestions: string[];
  enhancedPrompt?: string;
  enhancedScore?: number;
}

/**
 * Combined status of all adapters
 */
export interface UnifiedDetectionStatus {
  enabled: boolean;
  adapters: Array<{
    sourceId: string;
    displayName: string;
    status: AdapterStatus;
  }>;
  totalPromptsDetected: number;
  activeAdapters: number;
}

export class UnifiedPromptDetectionService {
  private adapters: Map<string, PromptSourceAdapter> = new Map();
  private config: PromptDetectionConfig;
  private messageHandler?: MessageHandler;
  private promptCallbacks: Set<UnifiedPromptCallback> = new Set();
  private isStarted = false;

  constructor(config?: Partial<PromptDetectionConfig>) {
    this.config = {
      enabled: true,
      autoAnalyze: true,
      enabledSources: [],
      ...config,
    };
  }

  /**
   * Register a prompt source adapter
   */
  registerAdapter(adapter: PromptSourceAdapter): void {
    const sourceId = adapter.source.id;

    if (this.adapters.has(sourceId)) {
      console.warn(`[UnifiedDetection] Adapter for ${sourceId} already registered, replacing`);
      this.adapters.get(sourceId)?.dispose();
    }

    // Wire up the prompt callback
    adapter.onPromptDetected((prompt) => {
      this.handleDetectedPrompt(prompt);
    });

    adapter.onStatusChanged((status) => {
      this.handleAdapterStatusChange(sourceId, status);
    });

    this.adapters.set(sourceId, adapter);
    console.log(`[UnifiedDetection] Registered adapter: ${adapter.source.displayName}`);
  }

  /**
   * Unregister an adapter
   */
  unregisterAdapter(sourceId: string): void {
    const adapter = this.adapters.get(sourceId);
    if (adapter) {
      adapter.dispose();
      this.adapters.delete(sourceId);
      console.log(`[UnifiedDetection] Unregistered adapter: ${sourceId}`);
    }
  }

  /**
   * Initialize all registered adapters
   */
  async initialize(): Promise<void> {
    console.log(`[UnifiedDetection] Initializing ${this.adapters.size} adapters...`);

    const results = await Promise.allSettled(
      Array.from(this.adapters.entries()).map(async ([sourceId, adapter]) => {
        const success = await adapter.initialize();
        return { sourceId, success };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { sourceId, success } = result.value;
        console.log(`[UnifiedDetection] ${sourceId}: ${success ? 'initialized' : 'failed to initialize'}`);
      } else {
        console.error('[UnifiedDetection] Adapter initialization error:', result.reason);
      }
    }
  }

  /**
   * Start all adapters (begin watching for prompts)
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[UnifiedDetection] Detection is disabled');
      return;
    }

    if (this.isStarted) {
      console.log('[UnifiedDetection] Already started');
      return;
    }

    console.log('[UnifiedDetection] Starting prompt detection...');

    const adaptersToStart = this.getEnabledAdapters();

    for (const adapter of adaptersToStart) {
      try {
        await adapter.start();
        console.log(`[UnifiedDetection] Started: ${adapter.source.displayName}`);
      } catch (error) {
        console.error(`[UnifiedDetection] Failed to start ${adapter.source.displayName}:`, error);
      }
    }

    this.isStarted = true;
    this.notifyStatusChange();
  }

  /**
   * Stop all adapters
   */
  stop(): void {
    if (!this.isStarted) {
      return;
    }

    console.log('[UnifiedDetection] Stopping all adapters...');

    for (const adapter of this.adapters.values()) {
      adapter.stop();
    }

    this.isStarted = false;
    this.notifyStatusChange();
  }

  /**
   * Set message handler for webview communication
   */
  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * Subscribe to prompt events
   */
  onPromptDetected(callback: UnifiedPromptCallback): () => void {
    this.promptCallbacks.add(callback);
    return () => {
      this.promptCallbacks.delete(callback);
    };
  }

  /**
   * Get unified status of all adapters
   */
  getStatus(): UnifiedDetectionStatus {
    const adapterStatuses = Array.from(this.adapters.entries()).map(([sourceId, adapter]) => ({
      sourceId,
      displayName: getSourceDisplayName(sourceId),
      status: adapter.getStatus(),
    }));

    const totalPromptsDetected = adapterStatuses.reduce(
      (sum, a) => sum + a.status.promptsDetected,
      0
    );

    const activeAdapters = adapterStatuses.filter(
      (a) => a.status.isWatching
    ).length;

    return {
      enabled: this.config.enabled,
      adapters: adapterStatuses,
      totalPromptsDetected,
      activeAdapters,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PromptDetectionConfig>): void {
    this.config = { ...this.config, ...config };

    // If enabled state changed, start/stop accordingly
    if (config.enabled !== undefined) {
      if (config.enabled && !this.isStarted) {
        this.start();
      } else if (!config.enabled && this.isStarted) {
        this.stop();
      }
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.stop();
    for (const adapter of this.adapters.values()) {
      adapter.dispose();
    }
    this.adapters.clear();
    this.promptCallbacks.clear();
    this.messageHandler = undefined;
  }

  /**
   * Get enabled adapters based on config
   */
  private getEnabledAdapters(): PromptSourceAdapter[] {
    if (!this.config.enabledSources || this.config.enabledSources.length === 0) {
      // All adapters enabled
      return Array.from(this.adapters.values());
    }

    return this.config.enabledSources
      .map((sourceId) => this.adapters.get(sourceId))
      .filter((adapter): adapter is PromptSourceAdapter => adapter !== undefined);
  }

  /**
   * Handle a detected prompt from any adapter
   */
  private async handleDetectedPrompt(prompt: DetectedPrompt): Promise<void> {
    console.log(`[UnifiedDetection] Prompt from ${prompt.source.displayName}: ${prompt.text.substring(0, 50)}...`);

    // 1. Sync with SessionManagerService (enables goals, projects, history)
    const promptId = await this.syncWithSessionManager(prompt);
    if (!promptId) {
      console.warn('[UnifiedDetection] Failed to get prompt ID from SessionManager');
      return;
    }

    // Update the prompt object with the actual ID used by SessionManager
    prompt.id = promptId;

    // 2. Notify webview about new prompt
    this.notifyWebview('newPromptsDetected', {
      count: 1,
      prompts: [
        {
          id: prompt.id,
          text: prompt.text,
          timestamp: prompt.timestamp.toISOString(),
          source: prompt.source.id,
          sourceName: prompt.source.displayName,
          projectPath: prompt.context.projectPath,
          projectName: prompt.context.projectName,
        },
      ],
    });

    // 3. Auto-analyze if enabled
    let analysis: PromptAnalysis | undefined;
    if (this.config.autoAnalyze) {
      analysis = await this.analyzePrompt(prompt);
    }

    // 4. Notify callbacks
    for (const callback of this.promptCallbacks) {
      try {
        callback(prompt, analysis);
      } catch (error) {
        console.error('[UnifiedDetection] Callback error:', error);
      }
    }
  }

  /**
   * Sync prompt with SessionManagerService
   * Returns the prompt ID used by SessionManager (may differ from adapter's ID)
   */
  private async syncWithSessionManager(prompt: DetectedPrompt): Promise<string | null> {
    try {
      const sessionManager = getSessionManager();

      // Sync project/session from context
      if (prompt.context.projectPath) {
        await sessionManager.syncFromSource({
          sourceId: prompt.source.id as KnownSourceId,
          projectPath: prompt.context.projectPath,
          projectName: prompt.context.projectName,
          sourceSessionId: prompt.context.sourceSessionId,
        });
      }

      // Add prompt to session with adapter's ID
      const promptId = await sessionManager.onPromptDetected({
        id: prompt.id, // Pass the adapter's prompt ID
        text: prompt.text,
        timestamp: prompt.timestamp,
        sourceId: prompt.source.id as KnownSourceId,
        sourceSessionId: prompt.context?.sourceSessionId, // Route to correct session
      });

      console.log('[UnifiedDetection] Synced with SessionManager');
      return promptId;
    } catch (error) {
      console.warn('[UnifiedDetection] Failed to sync with SessionManager:', error);
      return null;
    }
  }

  /**
   * Analyze prompt using LLM
   */
  private async analyzePrompt(prompt: DetectedPrompt): Promise<PromptAnalysis | undefined> {
    try {
      const llmManager = ExtensionState.getLLMManager();
      if (!llmManager) {
        console.warn('[UnifiedDetection] No LLM provider configured');
        return undefined;
      }

      this.notifyWebview('promptAnalyzing', {
        promptId: prompt.id,
        text: prompt.text,
      });

      // Import and use the scorer
      const { PromptScorer } = await import('../copilot/prompt-scorer');
      const { PromptEnhancer } = await import('../copilot/prompt-enhancer');
      const { GoalService } = await import('./GoalService');

      const scorer = new PromptScorer(llmManager);
      const enhancer = new PromptEnhancer(llmManager);
      const goalService = GoalService.getInstance();
      const sessionManager = getSessionManager();

      // Gather context for more targeted scoring (includes session correspondence)
      const context = await gatherPromptContext(prompt.text, '[UnifiedDetection]');

      // ============================================================
      // FIRE ALL 3 LLM CALLS IN PARALLEL - Stream results as they arrive
      // ============================================================

      // 1. FIRE: Score prompt (stream result when ready)
      const scorePromise = scorer.scorePromptV2(prompt.text, undefined, context).then(async (result) => {
        console.log(`[UnifiedDetection] Score ready: ${result.overall / 10} - streaming to UI`);

        // Stream score to UI immediately
        await sessionManager.updatePromptScore(prompt.id, result.overall / 10, result.breakdown);
        this.notifyWebview('scoreReceived', {
          score: result.overall / 10,
          categoryScores: {
            clarity: result.clarity,
            specificity: result.specificity,
            context: result.context,
            actionability: result.actionability,
          },
          breakdown: result.breakdown,
          explanation: result.explanation,
        });
        return result;
      });

      // 2. FIRE: Enhance prompt (stream result when ready, then score enhanced)
      const enhancePromise = enhancer.enhancePrompt(prompt.text, 'medium', undefined, context).then(async (result) => {
        console.log(`[UnifiedDetection] Enhancement ready - streaming to UI`);

        // Stream enhanced prompt to UI immediately
        this.notifyWebview('enhancedPromptReady', {
          promptId: prompt.id,
          improvedVersion: result.enhanced,
        });

        // Now score the enhanced version (sequential after enhance completes)
        const enhScore = await scorer.scorePrompt(result.enhanced);
        console.log(`[UnifiedDetection] Enhanced score ready: ${enhScore.overall / 10} - streaming to UI`);

        // Stream enhanced score to UI
        this.notifyWebview('enhancedScoreReady', {
          promptId: prompt.id,
          improvedScore: enhScore.overall / 10,
        });
        return { enhanced: result, enhancedScore: enhScore };
      });

      // 3. FIRE: Infer goal (stream result when ready)
      const goalPromise = goalService.inferGoalWithLLM().then((inference) => {
        if (inference && inference.suggestedGoal) {
          console.log(`[UnifiedDetection] Goal inference ready: ${inference.suggestedGoal} - streaming to UI`);
          this.notifyWebview('v2GoalInference', {
            suggestedGoal: inference.suggestedGoal,
            confidence: inference.confidence,
            detectedTheme: inference.detectedTheme,
          });
        }
        return inference;
      }).catch((error) => {
        console.warn('[UnifiedDetection] Goal inference failed (non-blocking):', error);
        return null;
      });

      // Wait for all to complete and get results
      const [scoreResult, enhanceResult] = await Promise.all([
        scorePromise.catch(() => null),
        enhancePromise.catch(() => null),
        goalPromise, // Already catches internally
      ]);

      // Guard: If scoring failed, we can't proceed
      if (!scoreResult) {
        console.error('[UnifiedDetection] Scoring failed - cannot complete analysis');
        return undefined;
      }

      // Update with enhanced data (if available)
      if (enhanceResult) {
        await sessionManager.updatePromptScore(
          prompt.id,
          scoreResult.overall / 10, // Keep original score
          scoreResult.breakdown,
          enhanceResult.enhanced.enhanced,
          enhanceResult.enhancedScore.overall / 10
        );
      }

      // Send complete analysis with enhanced data - this adds to history and sets isEnhancing false
      this.notifyWebview('analysisComplete', {
        prompt: {
          id: prompt.id,
          text: prompt.text,
          truncatedText: prompt.text.length > 50 ? prompt.text.substring(0, 50) + '...' : prompt.text,
          score: scoreResult.overall / 10,
          timestamp: prompt.timestamp,
          categoryScores: {
            clarity: scoreResult.clarity,
            specificity: scoreResult.specificity,
            context: scoreResult.context,
            actionability: scoreResult.actionability,
          },
          quickWins: scoreResult.suggestions.slice(0, 3).map((s: string) => s.split(' ').slice(0, 3).join(' ')),
          breakdown: scoreResult.breakdown,
          explanation: scoreResult.explanation,
          improvedVersion: enhanceResult?.enhanced?.enhanced,
          improvedScore: enhanceResult?.enhancedScore ? enhanceResult.enhancedScore.overall / 10 : undefined,
          source: prompt.source.id,
          sessionId: prompt.context.sourceSessionId,
        },
        analyzedToday: 0, // Will be updated from daily stats
      });

      const analysis: PromptAnalysis = {
        score: scoreResult.overall / 10,
        categoryScores: {
          clarity: scoreResult.clarity,
          specificity: scoreResult.specificity,
          context: scoreResult.context,
          actionability: scoreResult.actionability,
        },
        breakdown: scoreResult.breakdown,
        explanation: scoreResult.explanation,
        suggestions: scoreResult.suggestions.slice(0, 3),
        enhancedPrompt: enhanceResult?.enhanced?.enhanced,
        enhancedScore: enhanceResult?.enhancedScore ? enhanceResult.enhancedScore.overall / 10 : undefined,
      };

      // Update status bar
      const statusBarManager = ExtensionState.getStatusBarManager();
      if (statusBarManager) {
        statusBarManager.addPromptScore(analysis.score);
      }

      console.log(`[UnifiedDetection] Analysis complete: score ${analysis.score}`);
      return analysis;
    } catch (error) {
      console.error('[UnifiedDetection] Analysis failed:', error);

      this.notifyWebview('analysisFailed', {
        promptId: prompt.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return undefined;
    }
  }

  /**
   * Handle adapter status change
   */
  private handleAdapterStatusChange(sourceId: string, status: AdapterStatus): void {
    this.notifyWebview('adapterStatusChanged', {
      sourceId,
      displayName: getSourceDisplayName(sourceId),
      status,
    });
  }

  /**
   * Notify webview via message handler
   */
  private notifyWebview(type: string, data: unknown): void {
    if (this.messageHandler) {
      this.messageHandler.sendMessage(type, data);
    }
  }

  /**
   * Notify overall status change
   */
  private notifyStatusChange(): void {
    this.notifyWebview('detectionStatusChanged', this.getStatus());
  }
}

// Singleton instance
let serviceInstance: UnifiedPromptDetectionService | null = null;

/**
 * Get the singleton instance
 */
export function getUnifiedPromptDetectionService(): UnifiedPromptDetectionService {
  if (!serviceInstance) {
    serviceInstance = new UnifiedPromptDetectionService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetUnifiedPromptDetectionService(): void {
  if (serviceInstance) {
    serviceInstance.dispose();
    serviceInstance = null;
  }
}
