/**
 * Claude Agent SDK Provider Implementation
 *
 * Uses @anthropic-ai/claude-agent-sdk for local analysis.
 * No API key required - uses existing Claude Code browser login.
 */

import {
  LLMProvider,
  LLMProviderType,
  CompletionOptions,
  CompletionResponse,
  StreamChunk,
  ModelInfo,
  ConnectionTestResult,
  ProviderCapabilities,
  BaseProviderConfig,
} from '../types';
import { RegisterProvider } from '../decorators';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// Error message for missing SDK
const SDK_NOT_INSTALLED_ERROR =
  'Claude Agent SDK not installed.\n\n' +
  'To use this provider, install the SDK:\n' +
  '  npm install @anthropic-ai/claude-agent-sdk\n\n' +
  'Also requires Claude Code to be installed and logged in.';

// Check if SDK is installed (synchronous check)
function isSDKInstalled(): boolean {
  try {
    require.resolve('@anthropic-ai/claude-agent-sdk');
    return true;
  } catch {
    return false;
  }
}

// Lazy-load the SDK
let cachedSDK: { query: any } | null = null;

async function getClaudeSDK(): Promise<{ query: any }> {
  if (!cachedSDK) {
    try {
      cachedSDK = await import('@anthropic-ai/claude-agent-sdk');
    } catch {
      throw new Error(SDK_NOT_INSTALLED_ERROR);
    }
  }
  return cachedSDK!;
}

export interface ClaudeAgentSDKConfig extends BaseProviderConfig {
  // No apiKey needed - uses local Claude Code authentication
}

@RegisterProvider({
  id: 'claude-agent-sdk',
  displayName: 'Claude Agent SDK',
  description: 'Requires: npm install @anthropic-ai/claude-agent-sdk',
  requiresAuth: false,
  supportsStreaming: true,
  supportsCostTracking: true,
  configSchema: {
    model: {
      type: 'string',
      required: false,
      default: 'haiku',
      description: 'Claude model (haiku, sonnet, opus)',
    },
    enabled: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Enable Claude Agent SDK provider',
    },
  },
})
export class ClaudeAgentSDKProvider implements LLMProvider {
  public readonly type: LLMProviderType = 'claude-agent-sdk';
  private readonly _model: string;
  private tempDir: string;

  public readonly capabilities: ProviderCapabilities = {
    streaming: true,
    costTracking: true,
    modelListing: true,
    customEndpoints: false,
    requiresAuth: false,
  };

  constructor(config: ClaudeAgentSDKConfig) {
    // Check if SDK is installed BEFORE allowing provider creation
    if (!isSDKInstalled()) {
      throw new Error(SDK_NOT_INSTALLED_ERROR);
    }

    this._model = config.model || 'haiku';

    // Create temp directory for analysis to avoid polluting project history
    // Works on both Windows and macOS/Linux via os.tmpdir() and path.join()
    const systemTemp = os.tmpdir();
    const preferredDir = path.join(systemTemp, 'devark-analysis');

    try {
      if (!fs.existsSync(preferredDir)) {
        fs.mkdirSync(preferredDir, { recursive: true });
      }
      this.tempDir = preferredDir;
    } catch {
      // Fallback to system temp directory
      this.tempDir = systemTemp;
    }

    // Final fallback: ensure tempDir is never undefined
    if (!this.tempDir) {
      this.tempDir = process.cwd();
    }

    console.log('[ClaudeAgentSDK] Initialized with cwd:', this.tempDir);
  }

  get model(): string {
    return this._model;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await getClaudeSDK();
      const result = await this.testConnection();
      return result.success;
    } catch {
      return false;
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    // First check if SDK is installed
    try {
      await getClaudeSDK();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: msg,
      };
    }

    // SDK is installed, now test the actual connection
    try {
      const { query } = await getClaudeSDK();

      // Ensure we have a valid working directory
      const workingDir = this.tempDir || os.homedir();

      let gotResponse = false;
      for await (const message of query({
        prompt: 'Say "ok"',
        options: {
          maxTurns: 1,
          model: this._model,
          disallowedTools: ['*'],
          cwd: workingDir,
        },
      })) {
        if (message.type === 'assistant') {
          gotResponse = true;
          break;
        }
      }

      if (gotResponse) {
        return {
          success: true,
          details: { endpoint: 'local Claude Code' },
        };
      }

      return { success: false, error: 'No response from Claude SDK' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not found') || msg.includes('ENOENT')) {
        return {
          success: false,
          error: 'Claude Code not installed. Please install Claude Code first.',
        };
      }
      if (msg.includes('not logged in') || msg.includes('auth')) {
        return {
          success: false,
          error: 'Not logged into Claude Code. Run "claude login" first.',
        };
      }
      return { success: false, error: msg };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'haiku',
        name: 'Claude Haiku',
        description: 'Fast model, ideal for scoring',
        supportsStreaming: true,
      },
      {
        id: 'sonnet',
        name: 'Claude Sonnet',
        description: 'Balanced speed and quality',
        supportsStreaming: true,
      },
      {
        id: 'opus',
        name: 'Claude Opus',
        description: 'Most capable model',
        supportsStreaming: true,
      },
    ];
  }

  async generateCompletion(options: CompletionOptions): Promise<CompletionResponse> {
    try {
      const { query } = await getClaudeSDK();

      // Build prompt with system prompt if provided
      let fullPrompt = options.prompt;
      if (options.systemPrompt) {
        fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`;
      }

      let responseText = '';
      let usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;
      let cost: { amount: number; currency: string } | undefined;

      // Ensure we have a valid working directory
      // The SDK requires a valid path - use os.homedir() as fallback since it's cross-platform
      const workingDir = this.tempDir || os.homedir();
      console.log('[ClaudeAgentSDK] generateCompletion using cwd:', workingDir);

      for await (const message of query({
        prompt: fullPrompt,
        options: {
          maxTurns: 1,
          model: options.model || this._model,
          disallowedTools: ['*'],
          cwd: workingDir,
        },
      })) {
        if (message.type === 'assistant' && message.message?.content) {
          const textContent = message.message.content.find((c: any) => c.type === 'text');
          if (textContent?.text) {
            responseText = textContent.text;
          }
        }

        if (message.type === 'result') {
          if (message.total_cost_usd !== undefined) {
            cost = {
              amount: message.total_cost_usd,
              currency: 'USD',
            };
          }
        }
      }

      return {
        text: responseText,
        model: options.model || this._model,
        provider: 'claude-agent-sdk',
        timestamp: new Date(),
        usage,
        cost,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        text: '',
        model: this._model,
        provider: 'claude-agent-sdk',
        timestamp: new Date(),
        error: `Claude Agent SDK error: ${msg}`,
      };
    }
  }

  async *streamCompletion(options: CompletionOptions): AsyncGenerator<StreamChunk> {
    try {
      const { query } = await getClaudeSDK();

      // Build prompt with system prompt if provided
      let fullPrompt = options.prompt;
      if (options.systemPrompt) {
        fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`;
      }

      let cost: { amount: number; currency: string } | undefined;

      // Ensure we have a valid working directory
      const workingDir = this.tempDir || os.homedir();

      for await (const message of query({
        prompt: fullPrompt,
        options: {
          maxTurns: 1,
          model: options.model || this._model,
          disallowedTools: ['*'],
          cwd: workingDir,
        },
      })) {
        if (message.type === 'assistant' && message.message?.content) {
          const textContent = message.message.content.find((c: any) => c.type === 'text');
          if (textContent?.text) {
            yield {
              text: textContent.text,
              isComplete: false,
              model: options.model || this._model,
              provider: 'claude-agent-sdk',
            };
          }
        }

        if (message.type === 'result') {
          if (message.total_cost_usd !== undefined) {
            cost = {
              amount: message.total_cost_usd,
              currency: 'USD',
            };
          }
        }
      }

      // Final chunk
      yield {
        text: '',
        isComplete: true,
        model: options.model || this._model,
        provider: 'claude-agent-sdk',
        cost,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      yield {
        text: '',
        isComplete: true,
        model: this._model,
        provider: 'claude-agent-sdk',
        error: `Claude Agent SDK streaming error: ${msg}`,
      };
    }
  }
}
