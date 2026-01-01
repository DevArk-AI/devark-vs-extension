/**
 * CLI Provider Base Class
 *
 * Base implementation for CLI-based LLM providers (Claude Code, Cursor).
 * Inspired by vibe-log-cli implementation patterns.
 */

import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import {
  LLMProvider,
  LLMProviderType,
  CompletionOptions,
  CompletionResponse,
  StreamChunk,
  ModelInfo,
  ConnectionTestResult,
  ProviderCapabilities as BaseProviderCapabilities,
} from '../types';
import { ProviderCapabilities, ProviderType, CLIConfig, PromptDeliveryMethod } from '../provider-types';
import { StreamJSONParser, StreamEvent } from './stream-json-parser';
import { isCommandAvailable } from '../command-utils';

/**
 * Error types for CLI provider errors
 */
export type CLIErrorType = 'rate_limit' | 'auth_failed' | 'network' | 'unknown';

/**
 * Extended Error class that carries classification info
 */
export class CLIProviderError extends Error {
  constructor(
    message: string,
    public readonly errorType: CLIErrorType,
    public readonly suggestion: string
  ) {
    super(message);
    this.name = 'CLIProviderError';
  }
}

/**
 * Classify CLI error based on stderr output and exit code
 */
function classifyError(stderr: string, _code: number | null): { type: CLIErrorType; message: string; suggestion: string } {
  const lowerStderr = stderr.toLowerCase();

  // Rate limit errors
  if (lowerStderr.includes('resource_exhausted') || lowerStderr.includes('rate limit') || lowerStderr.includes('rate_limit')) {
    return {
      type: 'rate_limit',
      message: 'CLI rate limit reached',
      suggestion: 'Wait a few minutes or switch AI provider in Settings'
    };
  }

  // Auth errors
  if (lowerStderr.includes('not logged in') || lowerStderr.includes('unauthorized') || lowerStderr.includes('authentication')) {
    return {
      type: 'auth_failed',
      message: 'CLI authentication required',
      suggestion: 'Run the CLI login command in your terminal'
    };
  }

  // Network errors
  if (lowerStderr.includes('econnrefused') || lowerStderr.includes('network') || lowerStderr.includes('connection')) {
    return {
      type: 'network',
      message: 'Network connection failed',
      suggestion: 'Check your internet connection'
    };
  }

  // Unknown error
  return {
    type: 'unknown',
    message: 'CLI error occurred',
    suggestion: 'Check the CLI output for details'
  };
}

/**
 * Base class for CLI-based LLM providers
 *
 * Handles common CLI execution patterns:
 * - Process spawning and lifecycle
 * - Streaming JSON parsing
 * - Error handling and retry logic
 * - Message format conversion
 */
export abstract class CLIProviderBase implements LLMProvider {
  /** Extended capabilities for CLI providers */
  protected cliCapabilities: ProviderCapabilities;

  /** CLI execution configuration */
  protected cliConfig: CLIConfig;

  /** Currently configured model */
  protected _model: string;

  constructor(
    public readonly type: LLMProviderType,
    protected config: { model?: string; [key: string]: any },
    cliConfig: CLIConfig,
    capabilities: Partial<ProviderCapabilities> = {}
  ) {
    this.cliConfig = cliConfig;
    this._model = config.model || 'default';

    // Default CLI capabilities
    this.cliCapabilities = {
      type: ProviderType.CLI,
      requiresApiKey: false,
      requiresRateLimiting: false,
      isLocal: true,
      supportsStreaming: true,
      ...capabilities
    };
  }

  /**
   * Get current model identifier
   */
  get model(): string {
    return this._model;
  }

  /**
   * Get provider capabilities (base interface)
   */
  get capabilities(): BaseProviderCapabilities {
    return {
      streaming: this.cliCapabilities.supportsStreaming,
      costTracking: false,
      modelListing: false,
      customEndpoints: false,
      requiresAuth: this.cliCapabilities.requiresApiKey,
    };
  }

  /**
   * Check if CLI tool is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // First check if command is in PATH
      const commandExists = await isCommandAvailable(this.cliConfig.command);
      if (!commandExists) {
        return false;
      }

      // Then test if it actually works
      await this.testConnection();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Test connection to CLI tool
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // First check if command is in PATH
      const commandExists = await isCommandAvailable(this.cliConfig.command);
      if (!commandExists) {
        return {
          success: false,
          error: `Command '${this.cliConfig.command}' not found in PATH. Please ensure it is installed and available in your system PATH.`
        };
      }

      // Quick test with minimal prompt
      await this.generateCompletion({
        prompt: 'Hello',
        maxTokens: 10
      });

      return {
        success: true,
        details: {
          endpoint: `CLI: ${this.cliConfig.command}`,
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * List available models (not supported by most CLI tools)
   */
  async listModels(): Promise<ModelInfo[]> {
    return [{
      id: this._model,
      name: this._model,
      description: `${this.type} CLI model`,
      supportsStreaming: this.cliCapabilities.supportsStreaming,
    }];
  }

  /**
   * Generate a completion using CLI tool
   */
  async generateCompletion(options: CompletionOptions): Promise<CompletionResponse> {
    const prompt = this.buildPrompt(options);
    let args = this.buildArgs(options);

    // If prompt delivery is ARGUMENT, add prompt to args
    const useArgumentDelivery = this.cliConfig.promptDelivery === PromptDeliveryMethod.ARGUMENT;
    if (useArgumentDelivery) {
      args = [...args, prompt];
    }

    return new Promise((resolve, reject) => {
      // Use devark-hooks temp directory as cwd so our hook filter can identify
      // internal extension prompts and prevent infinite loops
      const vibeLogHooksCwd = path.join(os.tmpdir(), 'devark-hooks');

      const child = spawn(this.cliConfig.command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.cliConfig.env },
        cwd: vibeLogHooksCwd
      });

      const parser = new StreamJSONParser();
      const events: StreamEvent[] = [];
      let stderrOutput = '';

      // Capture stdout
      child.stdout?.on('data', (data) => {
        try {
          const chunk = data.toString();
          const parsedEvents = parser.parseChunk(chunk);
          events.push(...parsedEvents);
        } catch (error) {
          console.error('[CLIProviderBase] Error parsing stdout:', error);
        }
      });

      // Capture stderr
      child.stderr?.on('data', (data) => {
        try {
          stderrOutput += data.toString();
        } catch (error) {
          console.error('[CLIProviderBase] Error capturing stderr:', error);
        }
      });

      // Handle errors
      child.on('error', (error) => {
        reject(new Error(`Failed to spawn ${this.cliConfig.command}: ${error.message}`));
      });

      // Handle completion
      child.on('exit', (code) => {
        try {
          if (code === 0) {
            const content = parser.extractResult(events);

            // Debug logging when content is empty
            if (!content) {
              if (events.length === 0) {
                console.warn('[CLIProviderBase] No events parsed from CLI output');
                if (stderrOutput) {
                  console.warn('[CLIProviderBase] Stderr:', stderrOutput.substring(0, 500));
                }
              } else {
                console.warn(`[CLIProviderBase] Empty result extracted from ${events.length} events`);
                console.warn('[CLIProviderBase] Event types:', events.map(e => e.type).join(', '));
                // Log first few events for debugging
                events.slice(0, 3).forEach((e, i) => {
                  console.warn(`[CLIProviderBase] Event ${i}:`, JSON.stringify(e).substring(0, 200));
                });
              }
            }

            resolve({
              text: content,
              model: this._model,
              provider: this.type,
              timestamp: new Date(),
              usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0
              }
            });
          } else {
            const classification = classifyError(stderrOutput, code);
            reject(new CLIProviderError(
              `CLI exited with code ${code}\n` +
              `Command: ${this.cliConfig.command} ${args.join(' ')}\n` +
              `Error: ${stderrOutput}`,
              classification.type,
              classification.suggestion
            ));
          }
        } catch (error) {
          console.error('[CLIProviderBase] Error in exit handler:', error);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });

      // Send prompt to stdin (unless using argument delivery)
      if (!useArgumentDelivery && child.stdin) {
        child.stdin.write(prompt);
        child.stdin.end();
      } else if (child.stdin) {
        // Close stdin immediately for argument-based delivery
        child.stdin.end();
      }
    });
  }

  /**
   * Stream a completion (basic implementation)
   */
  async *streamCompletion(options: CompletionOptions): AsyncGenerator<StreamChunk> {
    // For now, do non-streaming and yield as single chunk
    // Subclasses can override for true streaming
    const response = await this.generateCompletion(options);

    yield {
      text: response.text,
      isComplete: true,
      model: this._model,
      provider: this.type,
      usage: response.usage,
      cost: response.cost,
    };
  }

  /**
   * Build CLI arguments from options
   *
   * Subclasses should override to add provider-specific args
   */
  protected buildArgs(options: CompletionOptions): string[] {
    const args = [...this.cliConfig.args];

    if (options.temperature !== undefined) {
      args.push('--temperature', options.temperature.toString());
    }

    if (options.maxTokens) {
      args.push('--max-tokens', options.maxTokens.toString());
    }

    return args;
  }

  /**
   * Build prompt string from options
   *
   * Combines system prompt and user prompt into format expected by CLI
   */
  protected buildPrompt(options: CompletionOptions): string {
    const parts: string[] = [];

    if (options.systemPrompt) {
      parts.push(`System: ${options.systemPrompt}`);
    }

    parts.push(options.prompt);

    return parts.join('\n\n');
  }
}
