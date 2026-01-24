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

// All built-in tools that must be explicitly disabled
// Note: disallowedTools: ['*'] doesn't work - must list tools explicitly
// See: https://github.com/anthropics/claude-agent-sdk-typescript/issues/19
// Full list from: https://github.com/Piebald-AI/claude-code-system-prompts
const ALL_BUILTIN_TOOLS = [
  // Core file/code tools
  'Task',
  'Bash',
  'Glob',
  'Grep',
  'Read',
  'ReadFile', // Alternative name for Read in some SDK versions
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
  // Web tools
  'WebFetch',
  'WebSearch',
  // Task/session management
  'TodoWrite',
  'KillShell',
  'TaskOutput',
  // Skills and plugins
  'Skill',
  'ToolSearch', // For deferred tool loading
  // User interaction
  'AskUserQuestion',
  'EnterPlanMode',
  'ExitPlanMode',
  // Code intelligence
  'LSP', // Language Server Protocol operations
  // Browser automation
  'Computer', // Chrome browser automation
];

// Check if SDK is installed (synchronous check)
function isSDKInstalled(): boolean {
  try {
    require.resolve('@anthropic-ai/claude-agent-sdk');
    return true;
  } catch {
    return false;
  }
}

// Clean up Claude Code's project folder for a given temp directory path
// Claude Code stores projects at ~/.claude/projects/{sanitized-path}
// Exported for testing
export function cleanupClaudeProjectFolder(tempDirPath: string): void {
  try {
    const homeDir = os.homedir();
    const claudeProjectsDir = path.join(homeDir, '.claude', 'projects');

    // Resolve symlinks (macOS: /var -> /private/var)
    // Claude Code uses the resolved real path, so we must match it
    let realPath = tempDirPath;
    try {
      realPath = fs.realpathSync(tempDirPath);
    } catch {
      // Path may not exist yet, try resolving parent directory
      try {
        const parentReal = fs.realpathSync(path.dirname(tempDirPath));
        realPath = path.join(parentReal, path.basename(tempDirPath));
      } catch {
        // Fallback to original path if resolution fails completely
      }
    }

    // Convert path to Claude's format (cross-platform):
    // - Windows: C:\Users\foo\temp -> C-Users-foo-temp
    // - macOS:   /private/var/folders/xyz -> -private-var-folders-xyz
    // - Linux:   /tmp/devark              -> -tmp-devark
    // IMPORTANT: Claude Code KEEPS the leading dash from Unix paths starting with /
    const sanitizedPath = realPath.replace(/[:\\/]/g, '-');
    const projectFolder = path.join(claudeProjectsDir, sanitizedPath);

    if (fs.existsSync(projectFolder)) {
      fs.rmSync(projectFolder, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors - not critical
  }
}

// Clean up temporary query directory
function cleanupTempDir(dirPath: string): void {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
    // Also clean up Claude Code's project folder for this path
    cleanupClaudeProjectFolder(dirPath);
  } catch {
    // Ignore cleanup errors - not critical
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
    // Use a unique working directory for test to avoid session caching
    const queryId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    const workingDir = path.join(this.tempDir || os.tmpdir(), `test-${queryId}`);

    try {
      const { query } = await getClaudeSDK();

      try {
        if (!fs.existsSync(workingDir)) {
          fs.mkdirSync(workingDir, { recursive: true });
        }
      } catch {
        // Fallback to base temp dir
      }

      let gotResponse = false;
      for await (const message of query({
        prompt: 'Say "ok"',
        options: {
          maxTurns: 1,
          model: this._model,
          disallowedTools: ALL_BUILTIN_TOOLS,
          cwd: workingDir,
          settingSources: [],
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
    } finally {
      // Clean up temporary directory
      cleanupTempDir(workingDir);
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
    // Use a unique working directory per query to avoid session caching issues
    // The SDK maintains session state per cwd, which can cause inconsistent behavior
    const queryId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    const workingDir = path.join(this.tempDir || os.tmpdir(), `query-${queryId}`);

    try {
      const { query } = await getClaudeSDK();

      let responseText = '';
      let usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;
      let cost: { amount: number; currency: string } | undefined;

      try {
        if (!fs.existsSync(workingDir)) {
          fs.mkdirSync(workingDir, { recursive: true });
        }
      } catch {
        // Fallback to base temp dir if creation fails
      }

      const modelUsed = options.model || this._model;

      for await (const message of query({
        prompt: options.prompt,
        options: {
          maxTurns: 1,
          model: modelUsed,
          disallowedTools: ALL_BUILTIN_TOOLS,
          cwd: workingDir,
          // Use SDK's systemPrompt option instead of concatenating into user prompt
          systemPrompt: options.systemPrompt,
          // Don't load any filesystem settings - ensures isolation
          settingSources: [],
        },
      })) {
        // Debug logging for Opus to diagnose response structure
        if (modelUsed === 'opus') {
          console.log(`[ClaudeAgentSDK:Opus] Event type: ${message.type}, keys: ${Object.keys(message).join(', ')}`);
          if (message.type === 'assistant') {
            console.log(`[ClaudeAgentSDK:Opus] Assistant message structure:`, JSON.stringify(message, null, 2).slice(0, 500));
          }
        }

        // Handle assistant messages - extract text from content blocks
        if (message.type === 'assistant' && message.message?.content) {
          // Iterate through all content blocks to find text
          // Opus may have thinking blocks before text blocks
          for (const contentBlock of message.message.content) {
            if (contentBlock.type === 'text' && contentBlock.text) {
              // Accumulate text from all text blocks (in case there are multiple)
              if (responseText) {
                responseText += '\n' + contentBlock.text;
              } else {
                responseText = contentBlock.text;
              }
            }
          }
        }

        // Handle streaming text events (some SDK versions emit these)
        if (message.type === 'text' && message.text) {
          if (responseText) {
            responseText += message.text;
          } else {
            responseText = message.text;
          }
        }

        // Handle content_block_delta for streaming responses
        // The delta structure varies: delta.text for text_delta, delta.thinking for thinking_delta
        if (message.type === 'content_block_delta' && message.delta) {
          const delta = message.delta as { type?: string; text?: string; thinking?: string };
          if (delta.text) {
            responseText += delta.text;
          }
        }

        // Handle result message for cost tracking
        if (message.type === 'result') {
          if (message.total_cost_usd !== undefined) {
            cost = {
              amount: message.total_cost_usd,
              currency: 'USD',
            };
          }
          // Some SDK versions include the final text in the result message
          if (message.result && typeof message.result === 'string' && !responseText) {
            responseText = message.result;
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
    } finally {
      // Clean up temporary directory
      cleanupTempDir(workingDir);
    }
  }

  async *streamCompletion(options: CompletionOptions): AsyncGenerator<StreamChunk> {
    // Use a unique working directory per query to avoid session caching issues
    const queryId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    const workingDir = path.join(this.tempDir || os.tmpdir(), `stream-${queryId}`);

    try {
      const { query } = await getClaudeSDK();

      let cost: { amount: number; currency: string } | undefined;

      try {
        if (!fs.existsSync(workingDir)) {
          fs.mkdirSync(workingDir, { recursive: true });
        }
      } catch {
        // Fallback to base temp dir
      }

      for await (const message of query({
        prompt: options.prompt,
        options: {
          maxTurns: 1,
          model: options.model || this._model,
          disallowedTools: ALL_BUILTIN_TOOLS,
          cwd: workingDir,
          systemPrompt: options.systemPrompt,
          settingSources: [],
        },
      })) {
        // Handle assistant messages - yield text from all text content blocks
        if (message.type === 'assistant' && message.message?.content) {
          for (const contentBlock of message.message.content) {
            if (contentBlock.type === 'text' && contentBlock.text) {
              yield {
                text: contentBlock.text,
                isComplete: false,
                model: options.model || this._model,
                provider: 'claude-agent-sdk',
              };
            }
          }
        }

        // Handle streaming text events
        if (message.type === 'text' && message.text) {
          yield {
            text: message.text,
            isComplete: false,
            model: options.model || this._model,
            provider: 'claude-agent-sdk',
          };
        }

        // Handle content_block_delta for streaming responses
        if (message.type === 'content_block_delta' && message.delta) {
          const delta = message.delta as { type?: string; text?: string; thinking?: string };
          if (delta.text) {
            yield {
              text: delta.text,
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
          // Some SDK versions include the final text in the result message
          if (message.result && typeof message.result === 'string') {
            yield {
              text: message.result,
              isComplete: false,
              model: options.model || this._model,
              provider: 'claude-agent-sdk',
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
    } finally {
      // Clean up temporary directory
      cleanupTempDir(workingDir);
    }
  }
}
