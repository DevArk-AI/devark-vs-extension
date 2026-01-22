/**
 * Cursor CLI Provider
 *
 * Provider implementation for Cursor CLI tool (cursor-agent).
 * Based on https://cursor.com/docs/cli/headless
 *
 * Installation: curl https://cursor.com/install -fsS | bash
 * Authentication: Run `cursor-agent login` to authenticate via browser
 * Usage: cursor-agent -p --model auto --output-format stream-json "Your prompt"
 *
 * Note: Uses browser-based authentication, no API key required.
 */

import { spawn } from 'child_process';
import { CLIProviderBase } from './cli-provider-base';
import { RegisterProvider } from '../decorators';
import { CompletionOptions, CompletionResponse, ConnectionTestResult, ModelInfo } from '../types';
import { PromptDeliveryMethod } from '../provider-types';

/**
 * Cursor CLI provider metadata
 */
const METADATA = {
  id: 'cursor-cli',
  displayName: 'Cursor CLI',
  description: 'Cursor CLI tool with streaming JSON output (requires cursor-agent login)',
  requiresAuth: false, // Uses browser login, not API key
  supportsStreaming: true,
  supportsCostTracking: false,
  configSchema: {
    model: {
      type: 'string' as const,
      required: false,
      default: 'auto',
      description: 'Cursor model to use (auto recommended to avoid rate limits)',
    },
    enabled: {
      type: 'boolean' as const,
      required: false,
      default: false,
      description: 'Enable Cursor CLI provider',
    },
  },
};

/**
 * Cursor CLI Provider
 *
 * Executes Cursor CLI for completions.
 * Uses browser-based authentication (run `cursor-agent login` first).
 */
@RegisterProvider(METADATA)
export class CursorCLIProvider extends CLIProviderBase {
  constructor(config: { model?: string; enabled?: boolean; [key: string]: any }) {
    super(
      'cursor-cli',
      { ...config, model: config.model || 'auto' },
      {
        command: 'cursor-agent',
        // Use --model auto to avoid rate limits on default model
        args: ['-p', '--model', config.model || 'auto', '--output-format', 'stream-json'],
        outputFormat: 'stream-json',
        // Cursor CLI uses prompt as command argument, not stdin
        promptDelivery: PromptDeliveryMethod.ARGUMENT,
        env: {},
      },
      {
        requiresApiKey: false, // Uses browser login
      }
    );
  }

  /**
   * Check if user is logged in to Cursor
   */
  private async checkLoginStatus(): Promise<{ loggedIn: boolean; email?: string; error?: string }> {
    return new Promise((resolve) => {
      const child = spawn('cursor-agent', ['status'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        resolve({
          loggedIn: false,
          error: `Failed to check login status: ${error.message}`,
        });
      });

      child.on('exit', (code) => {
        // cursor-agent status outputs "✓ Logged in as email@example.com" when logged in
        const loggedInMatch = stdout.match(/Logged in as (.+)/);
        if (loggedInMatch) {
          resolve({
            loggedIn: true,
            email: loggedInMatch[1].trim(),
          });
        } else if (code === 0) {
          // Command succeeded but no login info found
          resolve({
            loggedIn: false,
            error: 'Not logged in to Cursor',
          });
        } else {
          resolve({
            loggedIn: false,
            error: stderr || 'Failed to check login status',
          });
        }
      });
    });
  }

  /**
   * Test connection - check login status and CLI availability
   */
  async testConnection(): Promise<ConnectionTestResult> {
    // First check if cursor-agent command exists
    try {
      const loginStatus = await this.checkLoginStatus();

      if (!loginStatus.loggedIn) {
        return {
          success: false,
          error: loginStatus.error ||
            'Not logged in to Cursor. Run "cursor-agent login" to authenticate via browser.',
        };
      }

      // Test with a simple prompt to verify everything works
      const result = await super.testConnection();

      if (result.success) {
        return {
          success: true,
          details: {
            endpoint: `cursor-agent CLI (${loginStatus.email || 'logged in'})`,
          },
        };
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * List available models from Cursor CLI
   *
   * Tries to fetch models dynamically via `cursor-agent --list-models`.
   * Falls back to a static list if the command fails.
   */
  async listModels(): Promise<ModelInfo[]> {
    try {
      const output = await this.execListModelsCommand();
      const models = this.parseModelsOutput(output);
      if (models.length > 0) {
        return models;
      }
    } catch (error) {
      console.error('[CursorCLIProvider] Failed to fetch models dynamically:', error);
    }

    // Fallback to known models
    return [
      { id: 'auto', name: 'Auto (recommended)', description: 'Automatically selects the best model', supportsStreaming: true },
      { id: 'claude-4-sonnet', name: 'Claude 4 Sonnet', supportsStreaming: true },
      { id: 'claude-4-opus', name: 'Claude 4 Opus', supportsStreaming: true },
      { id: 'gpt-4o', name: 'GPT-4o', supportsStreaming: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', supportsStreaming: true },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', supportsStreaming: true },
    ];
  }

  /**
   * Execute `cursor-agent --list-models` command
   */
  private execListModelsCommand(): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('cursor-agent', ['--list-models'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to run cursor-agent --list-models: ${error.message}`));
      });

      child.on('exit', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`cursor-agent --list-models exited with code ${code}: ${stderr}`));
        }
      });
    });
  }

  /**
   * Parse the output of `cursor-agent --list-models`
   */
  private parseModelsOutput(output: string): ModelInfo[] {
    const models: ModelInfo[] = [];
    const lines = output.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      // Try to parse JSON format first (e.g., {"id": "model-id", "name": "Model Name"})
      try {
        const parsed = JSON.parse(line);
        if (parsed.id) {
          models.push({
            id: parsed.id,
            name: parsed.name || parsed.id,
            description: parsed.description,
            supportsStreaming: true,
          });
          continue;
        }
      } catch {
        // Not JSON, try line-based format
      }

      // Try simple line format (model-id or model-id: Model Name)
      const match = line.match(/^([a-zA-Z0-9._-]+)(?::\s*(.+))?$/);
      if (match) {
        models.push({
          id: match[1],
          name: match[2] || match[1],
          supportsStreaming: true,
        });
      }
    }

    return models;
  }

  /**
   * Build CLI arguments with Cursor-specific options
   */
  protected buildArgs(_options: CompletionOptions): string[] {
    const args = ['-p', '--model', this._model, '--output-format', 'stream-json'];

    // Note: cursor-agent doesn't support --temperature and --max-tokens in the same way
    // These are handled by the model configuration on Cursor's side

    return args;
  }

  /**
   * Build prompt string for Cursor CLI
   *
   * cursor-agent doesn't support --system flag or "System:" prefix.
   * Embed system instructions directly in the prompt.
   */
  protected buildPrompt(options: CompletionOptions): string {
    if (options.systemPrompt) {
      return `${options.systemPrompt}\n\n${options.prompt}`;
    }
    return options.prompt;
  }

  /**
   * Generate completion with Cursor CLI
   *
   * Uses browser-based authentication, no API key needed.
   */
  async generateCompletion(options: CompletionOptions): Promise<CompletionResponse> {
    // The base class now handles prompt delivery via ARGUMENT
    // since we configured promptDelivery: PromptDeliveryMethod.ARGUMENT
    return super.generateCompletion(options);
  }
}
