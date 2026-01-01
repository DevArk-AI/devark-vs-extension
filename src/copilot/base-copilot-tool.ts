/**
 * Base Copilot Tool
 *
 * Abstract base class for all copilot tools (analyzer, scorer, enhancer, etc.)
 * Eliminates code duplication by providing common functionality:
 * - LLM interaction with retry logic
 * - Progress reporting
 * - JSON parsing from LLM responses
 * - Error handling
 * - Consistent logging
 *
 * Benefits:
 * - DRY: Single implementation of retry, progress, and parsing logic
 * - Consistent: All tools work the same way
 * - Maintainable: Bug fixes and improvements benefit all tools
 * - Testable: Easier to mock and test common functionality
 */

import { ILLMProvider } from '../llm/interfaces';

export type ProgressCallback = (progress: number, message: string) => void;

/**
 * Interaction context - prompt + response pair for session correspondence
 */
export interface InteractionContext {
  prompt: string;
  response?: string;
  filesModified?: string[];
}

/**
 * Context for enhancing prompt analysis and enhancement
 * Provides relevant background information to make LLM operations more targeted
 */
export interface PromptContext {
  goal?: string | null;
  techStack?: string[];
  recentTopics?: string[];
  codeSnippets?: Array<{
    entityName: string;
    filePath: string;
    relevantCode: string;
  }>;
  sessionDuration?: number;

  // Session correspondence (prompt + response pairs)
  firstInteractions?: InteractionContext[];
  lastInteractions?: InteractionContext[];
}

/**
 * Abstract base class for copilot tools
 *
 * @template TInput - The input type for this tool
 * @template TOutput - The output type for this tool
 */
export abstract class BaseCopilotTool<TInput, TOutput> {
  constructor(protected provider: ILLMProvider) {}

  /**
   * Execute the tool with the given input
   *
   * Template method that orchestrates the entire process:
   * 1. Validate input
   * 2. Build prompt
   * 3. Call LLM (with retry logic)
   * 4. Parse response
   * 5. Return result
   *
   * Subclasses only need to implement the abstract methods.
   */
  async execute(input: TInput, onProgress?: ProgressCallback, context?: PromptContext): Promise<TOutput> {
    this.reportProgress(onProgress, 0, 'Starting...');
    this.validateInput(input);

    this.reportProgress(onProgress, 20, 'Building prompt...');
    const prompt = this.buildPrompt(input, context);

    this.reportProgress(onProgress, 40, 'Calling LLM...');
    const rawResponse = await this.callLLM(prompt, onProgress);

    this.reportProgress(onProgress, 80, 'Processing response...');
    const result = this.parseResponse(rawResponse);

    this.reportProgress(onProgress, 100, 'Complete');
    return result;
  }

  /**
   * Validate input before processing
   * Override to add custom validation logic
   */
  protected validateInput(input: TInput): void {
    if (!input) {
      throw new Error(`${this.getToolName()}: Input cannot be null or undefined`);
    }
  }

  /**
   * Build the prompt for the LLM
   * Must be implemented by subclasses
   * @param context Optional context to make the prompt more targeted
   */
  protected abstract buildPrompt(input: TInput, context?: PromptContext): string;

  /**
   * Parse the LLM response into the output type
   * Must be implemented by subclasses
   */
  protected abstract parseResponse(response: string): TOutput;

  /**
   * Get the tool name for logging
   * Must be implemented by subclasses
   */
  protected abstract getToolName(): string;

  /**
   * Call the LLM with retry logic
   *
   * Automatically retries on failure up to maxRetries times.
   * Reports progress between retries.
   */
  protected async callLLM(prompt: string, onProgress?: ProgressCallback): Promise<string> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.provider.generateCompletion({
          prompt,
          temperature: 0.7,
          maxTokens: 2000
        });

        // Check for errors in response
        if (response.error) {
          throw new Error(response.error);
        }

        return response.text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          const retryMessage = `Retrying (${attempt}/${maxRetries})...`;
          this.reportProgress(onProgress, 40 + (attempt * 10), retryMessage);
          console.log(`[${this.getToolName()}] ${retryMessage}`);

          // Exponential backoff
          await this.delay(1000 * attempt);
        }
      }
    }

    // All retries failed
    throw new Error(
      `${this.getToolName()} failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Parse JSON from LLM response
   *
   * Handles common patterns:
   * - JSON wrapped in markdown code blocks
   * - Plain JSON
   * - JSON with surrounding text
   *
   * @throws Error if JSON is invalid
   */
  protected parseJSON<T>(content: string): T {
    // Strategy 1: Try parsing the raw content first (fastest path)
    try {
      return JSON.parse(content.trim()) as T;
    } catch {
      // Content is not raw JSON, continue to other strategies
    }

    // Strategy 2: Extract from markdown code blocks (GREEDY match for nested JSON)
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim()) as T;
      } catch {
        // Code block content is not valid JSON, continue
      }
    }

    // Strategy 3: Find JSON object by matching balanced braces
    const jsonStr = this.extractBalancedJSON(content);
    if (jsonStr) {
      try {
        return JSON.parse(jsonStr) as T;
      } catch {
        // Extracted content is not valid JSON
      }
    }

    // Strategy 4: Clean common prefixes/suffixes and try again
    const cleanedContent = content
      .replace(/^(Here'?s?|The|This is|My|I'll provide|Response:?).*?:/i, '') // Remove common prefixes
      .replace(/^[\s\n]+/, '') // Remove leading whitespace
      .trim();

    if (cleanedContent !== content) {
      const cleanedJson = this.extractBalancedJSON(cleanedContent);
      if (cleanedJson) {
        try {
          return JSON.parse(cleanedJson) as T;
        } catch {
          // Cleaned content still not valid JSON
        }
      }
    }

    // All strategies failed - log the actual response for debugging
    console.error(`[${this.getToolName()}] Failed to parse JSON from response. Raw content (first 500 chars):`);
    console.error(content.substring(0, 500));

    throw new Error(
      `${this.getToolName()}: Failed to parse JSON response: No valid JSON found in response`
    );
  }

  /**
   * Extract JSON object by finding balanced braces
   * Handles nested objects correctly
   */
  private extractBalancedJSON(content: string): string | null {
    const startIdx = content.indexOf('{');
    if (startIdx === -1) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIdx; i < content.length; i++) {
      const char = content[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\' && inString) {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0) {
            return content.substring(startIdx, i + 1);
          }
        }
      }
    }

    return null;
  }

  /**
   * Report progress to callback and console
   */
  protected reportProgress(
    callback: ProgressCallback | undefined,
    progress: number,
    message: string
  ): void {
    if (callback) {
      callback(progress, message);
    }
    console.log(`[${this.getToolName()}] ${progress}% - ${message}`);
  }

  /**
   * Delay for a specified number of milliseconds
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get a user-friendly error message
   */
  protected getErrorMessage(error: Error): string {
    const message = error.message.toLowerCase();

    // Provider configuration errors
    if (message.includes('not initialized') || message.includes('no llm provider')) {
      return 'LLM provider is not configured. Please configure a provider in settings.';
    }

    // Network/API errors
    if (message.includes('fetch failed') || message.includes('network')) {
      return 'Network error. Please check your connection.';
    }

    if (message.includes('unauthorized') || message.includes('api key')) {
      return 'Authentication failed. Please check your API key.';
    }

    if (message.includes('quota') || message.includes('rate limit')) {
      return 'API quota exceeded. Please try again later.';
    }

    // Generic fallback
    return `${this.getToolName()} failed: ${error.message}`;
  }
}
