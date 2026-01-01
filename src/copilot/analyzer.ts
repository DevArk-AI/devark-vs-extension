/**
 * Prompt Analysis Engine
 *
 * Adapted from vibe-log-cli/src/lib/prompt-analyzer.ts
 *
 * Key differences from CLI:
 * - Uses LLMManager (Ollama/OpenRouter) instead of Cursor API
 * - Uses storage manager instead of direct filesystem
 * - Removed push-up specific logic
 * - Removed promotional tips
 * - Simplified session handling
 */

import { PromptData, PromptAnalysis } from '../cursor-integration/types';
import { CoPilotStorageManager } from './storage';
import { ILLMProvider, ILogger, ConsoleLogger } from '../llm/interfaces';
import {
  generateAnalysisPrompt,
  validateAnalysisResult,
  generateErrorResult,
  AnalysisInput
} from './analysis-prompt-template';

/**
 * Loading state for UI feedback
 */
export type LoadingState =
  | 'idle'
  | 'preparing'
  | 'analyzing'
  | 'parsing'
  | 'saving'
  | 'completed'
  | 'failed';

/**
 * Progress callback for real-time UI updates
 */
export type ProgressCallback = (state: LoadingState, progress: number, message?: string) => void;

/**
 * Prompt Analysis Engine
 */
export class PromptAnalysisEngine {
  private currentState: LoadingState = 'idle';
  private logger: ILogger;

  constructor(
    private storage: CoPilotStorageManager,
    private llmProvider: ILLMProvider,
    logger?: ILogger
  ) {
    this.logger = logger || new ConsoleLogger();
  }

  /**
   * Analyze a prompt
   *
   * @param prompt - The prompt data to analyze
   * @param sessionContext - Optional session context for better analysis
   * @param onProgress - Optional progress callback for UI updates
   * @returns The analysis result
   */
  async analyze(
    prompt: PromptData,
    sessionContext?: {
      workspaceName?: string;
      fileContext?: string[];
      conversationHistory?: number;
    },
    onProgress?: ProgressCallback
  ): Promise<PromptAnalysis> {
    const startTime = Date.now();
    const analysisId = this.generateAnalysisId();

    try {
      // Update state: preparing
      this.updateState('preparing', onProgress, 0, 'Preparing analysis...');

      // Build input for analysis prompt
      const input: AnalysisInput = {
        userPrompt: prompt.userPrompt,
        assistantResponse: prompt.assistantResponse,
        sessionContext
      };

      // Generate the analysis prompt
      const analysisPrompt = generateAnalysisPrompt(input);
      this.logger.info(`Generated analysis prompt, length: ${analysisPrompt.length}`);

      // Update state: analyzing
      this.updateState('analyzing', onProgress, 20, 'Analyzing prompt quality...');

      // Execute analysis using LLM Provider
      const rawResponse = await this.executeAnalysis(analysisPrompt, onProgress);
      this.logger.info(`Received analysis response, length: ${rawResponse.length}`);

      // Update state: parsing
      this.updateState('parsing', onProgress, 80, 'Parsing results...');

      // Parse and validate the result
      const result = validateAnalysisResult(rawResponse);
      this.logger.info(`Parsed analysis result, overall score: ${result.overallScore}`);

      // Model used is tracked externally - not available in minimal interface
      const modelUsed = 'llm-provider';

      // Create analysis record
      const analysis: PromptAnalysis = {
        id: analysisId,
        promptId: prompt.id,
        timestamp: new Date(),
        result,
        modelUsed,
        analysisTimeMs: Date.now() - startTime
      };

      // Update state: saving
      this.updateState('saving', onProgress, 90, 'Saving analysis...');

      // Save to storage
      await this.storage.saveAnalysis(analysis);
      this.logger.info(`Analysis saved: ${analysisId}`);

      // Update state: completed
      this.updateState('completed', onProgress, 100, 'Analysis complete!');

      return analysis;

    } catch (error) {
      this.logger.error('Analysis failed', error as Error);

      // Update state: failed
      this.updateState('failed', onProgress, 0, `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Create error result
      const errorResult = generateErrorResult(
        error instanceof Error ? error : new Error('Unknown analysis error')
      );

      // Return partial analysis with error
      const analysis: PromptAnalysis = {
        id: analysisId,
        promptId: prompt.id,
        timestamp: new Date(),
        result: errorResult,
        modelUsed: 'error',
        analysisTimeMs: Date.now() - startTime
      };

      // Try to save error analysis
      try {
        await this.storage.saveAnalysis(analysis);
      } catch (saveError) {
        this.logger.error('Failed to save error analysis', saveError as Error);
      }

      return analysis;
    }
  }

  /**
   * Execute the analysis using LLM Provider
   */
  private async executeAnalysis(
    prompt: string,
    _onProgress?: ProgressCallback
  ): Promise<string> {
    try {
      this.logger.info('Executing LLM analysis...');

      // Execute with LLM Provider
      const response = await this.llmProvider.generateCompletion({
        prompt,
        temperature: 0.7,
        maxTokens: 2000
      });

      // Check for errors in response
      if (response.error) {
        throw new Error(response.error);
      }

      this.logger.info(`LLM completion successful, tokens used: ${response.usage?.totalTokens || 'N/A'}`);

      return response.text;

    } catch (error) {
      this.logger.error('LLM execution failed', error as Error);
      throw error;
    }
  }

  /**
   * Generate a unique analysis ID
   */
  private generateAnalysisId(): string {
    return `analysis-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Update loading state and notify via callback
   */
  private updateState(
    state: LoadingState,
    callback: ProgressCallback | undefined,
    progress: number,
    message?: string
  ): void {
    this.currentState = state;
    if (callback) {
      callback(state, progress, message);
    }
  }

  /**
   * Get current loading state
   */
  getLoadingState(): LoadingState {
    return this.currentState;
  }

  /**
   * Load existing analysis by ID
   */
  async loadAnalysis(analysisId: string): Promise<PromptAnalysis | null> {
    return await this.storage.loadAnalysis(analysisId);
  }

  /**
   * Get recent analyses
   */
  async getRecentAnalyses(limit: number = 10): Promise<PromptAnalysis[]> {
    return await this.storage.getRecentAnalyses(limit);
  }

  /**
   * Re-analyze a prompt (useful for retries or model changes)
   */
  async reanalyze(
    prompt: PromptData,
    sessionContext?: {
      workspaceName?: string;
      fileContext?: string[];
      conversationHistory?: number;
    },
    onProgress?: ProgressCallback
  ): Promise<PromptAnalysis> {
    this.logger.info(`Re-analyzing prompt: ${prompt.id}`);
    return await this.analyze(prompt, sessionContext, onProgress);
  }

  /**
   * Batch analyze multiple prompts
   * (for catching up on historical prompts)
   */
  async batchAnalyze(
    prompts: PromptData[],
    sessionContext?: {
      workspaceName?: string;
      fileContext?: string[];
      conversationHistory?: number;
    },
    onBatchProgress?: (completed: number, total: number) => void
  ): Promise<PromptAnalysis[]> {
    this.logger.info(`Batch analyzing ${prompts.length} prompts`);

    const results: PromptAnalysis[] = [];

    for (let i = 0; i < prompts.length; i++) {
      try {
        const analysis = await this.analyze(prompts[i], sessionContext);
        results.push(analysis);

        if (onBatchProgress) {
          onBatchProgress(i + 1, prompts.length);
        }

        // Small delay between analyses to avoid rate limiting
        await this.delay(1000);
      } catch (error) {
        this.logger.error(`Batch analysis failed for prompt: ${prompts[i].id}`, error as Error);
        // Continue with next prompt
      }
    }

    this.logger.info(`Batch analysis complete: ${results.length} analyzed`);
    return results;
  }

  /**
   * Check if LLM provider is ready
   * Note: This is a simple test - may generate a small API call
   */
  async isReady(): Promise<boolean> {
    try {
      // Try a simple completion to test if provider is available
      const testResponse = await this.llmProvider.generateCompletion({
        prompt: 'test',
        maxTokens: 5
      });
      return !testResponse.error;
    } catch (error) {
      this.logger.error('isReady check failed', error as Error);
      return false;
    }
  }

  /**
   * Utility: delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get friendly error message for display
   */
  static getErrorMessage(error: Error): string {
    const message = error.message.toLowerCase();

    // LLM Provider configuration errors
    if (message.includes('no llm provider configured')) {
      return 'No LLM provider is configured. Please configure Ollama or OpenRouter in VSCode settings.';
    }

    if (message.includes('not available') || message.includes('provider is not accessible')) {
      return 'LLM provider is not available. Please ensure it is running and properly configured.';
    }

    // Network/API errors
    if (message.includes('fetch failed') || message.includes('network')) {
      return 'Network error. Please check your connection and provider settings.';
    }

    if (message.includes('unauthorized') || message.includes('api key')) {
      return 'Authentication failed. Please check your API key in settings.';
    }

    if (message.includes('quota') || message.includes('rate limit')) {
      return 'API quota exceeded. Please try again later or check your provider plan.';
    }

    // User action errors
    if (message.includes('cancelled')) {
      return 'Analysis was cancelled by user.';
    }

    // Ollama-specific errors
    if (message.includes('ollama')) {
      return 'Ollama error. Please ensure Ollama is running (ollama serve) and the model is installed.';
    }

    // Generic fallback
    return `Analysis failed: ${error.message}`;
  }
}
