/**
 * Ollama Provider Implementation
 *
 * Connects to a local Ollama instance to provide LLM completions.
 * Supports popular code-focused models like CodeLlama, DeepSeek Coder, and StarCoder.
 */

import {
  LLMProvider,
  LLMProviderType,
  CompletionOptions,
  CompletionResponse,
  StreamChunk,
  ModelInfo,
  ConnectionTestResult,
  OllamaConfig,
  ProviderCapabilities,
} from '../types';
import { RegisterProvider } from '../decorators';

/**
 * Ollama API response for version endpoint
 */
interface OllamaVersionResponse {
  version: string;
}

/**
 * Ollama API response for tags endpoint
 */
interface OllamaTagsResponse {
  models: Array<{
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details?: {
      format?: string;
      family?: string;
      families?: string[];
      parameter_size?: string;
      quantization_level?: string;
    };
  }>;
}

/**
 * Ollama API request for generate endpoint
 */
interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
    stop?: string[];
  };
}

/**
 * Ollama API response for generate endpoint (streaming)
 */
interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Default Ollama models with metadata
 */
const DEFAULT_MODELS: Record<string, ModelInfo> = {
  'codellama:7b': {
    id: 'codellama:7b',
    name: 'CodeLlama 7B',
    description: 'Meta\'s CodeLlama 7B model optimized for code generation',
    contextLength: 16384,
    supportsStreaming: true,
  },
  'deepseek-coder:6.7b': {
    id: 'deepseek-coder:6.7b',
    name: 'DeepSeek Coder 6.7B',
    description: 'DeepSeek\'s code-focused model with strong performance',
    contextLength: 16384,
    supportsStreaming: true,
  },
  'starcoder2:7b': {
    id: 'starcoder2:7b',
    name: 'StarCoder2 7B',
    description: 'BigCode\'s StarCoder2 model for code tasks',
    contextLength: 16384,
    supportsStreaming: true,
  },
};

/**
 * Provider implementation for Ollama
 *
 * Automatically registers with the global provider registry via @RegisterProvider decorator.
 */
@RegisterProvider({
  id: 'ollama',
  displayName: 'Ollama',
  description: 'Local LLM provider via Ollama. Supports CodeLlama, DeepSeek Coder, and other models.',
  requiresAuth: false,
  supportsStreaming: true,
  supportsCostTracking: false,
  configSchema: {
    endpoint: {
      type: 'string',
      required: true,
      default: 'http://localhost:11434',
      description: 'Ollama API endpoint URL',
    },
    model: {
      type: 'string',
      required: false,
      description: 'Model identifier (auto-detects from installed models if not specified)',
    },
  },
})
export class OllamaProvider implements LLMProvider {
  public readonly type: LLMProviderType = 'ollama';
  private readonly endpoint: string;
  private _model: string | null;
  private _detectedModel: string | null = null;

  /**
   * Ollama provider capabilities
   */
  public readonly capabilities: ProviderCapabilities = {
    streaming: true,
    costTracking: false, // Ollama is free/local
    modelListing: true,
    customEndpoints: true,
    requiresAuth: false,
  };

  constructor(config: OllamaConfig) {
    this.endpoint = config.endpoint.replace(/\/$/, ''); // Remove trailing slash
    this._model = config.model || null; // No hardcoded fallback - will auto-detect
  }

  public get model(): string {
    return this._model || this._detectedModel || '';
  }

  /**
   * Auto-detect the first available model from Ollama.
   * Called lazily when model is needed but not configured.
   */
  public async autoDetectModel(): Promise<string | null> {
    if (this._model) return this._model;
    if (this._detectedModel) return this._detectedModel;

    try {
      const models = await this.listModels();
      if (models.length > 0) {
        this._detectedModel = models[0].id;
        return this._detectedModel;
      }
    } catch {
      // Failed to detect - will return null
    }
    return null;
  }

  /**
   * Ensure we have a model (configured or auto-detected) before making requests.
   */
  private async ensureModel(): Promise<string> {
    if (this._model) return this._model;
    if (this._detectedModel) return this._detectedModel;

    const detected = await this.autoDetectModel();
    if (!detected) {
      throw new Error(
        'No model configured and no models found on Ollama server. ' +
        'Please install a model with: ollama pull llama3.1:8b'
      );
    }
    return detected;
  }

  /**
   * Check if Ollama is running and accessible
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/api/version`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Test connection to Ollama and get version info
   */
  public async testConnection(): Promise<ConnectionTestResult> {
    try {
      // Check version endpoint
      const versionResponse = await fetch(`${this.endpoint}/api/version`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!versionResponse.ok) {
        return {
          success: false,
          error: `HTTP ${versionResponse.status}: ${versionResponse.statusText}`,
        };
      }

      const versionData = await versionResponse.json() as OllamaVersionResponse;

      // Get available models
      const tagsResponse = await fetch(`${this.endpoint}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      let modelsCount = 0;
      if (tagsResponse.ok) {
        const tagsData = await tagsResponse.json() as OllamaTagsResponse;
        modelsCount = tagsData.models.length;
      }

      return {
        success: true,
        details: {
          version: versionData.version,
          modelsAvailable: modelsCount,
          endpoint: this.endpoint,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Provide helpful error messages
      if (errorMessage.includes('ECONNREFUSED')) {
        return {
          success: false,
          error: `Cannot connect to Ollama at ${this.endpoint}. Is Ollama running?`,
        };
      }

      if (errorMessage.includes('timeout')) {
        return {
          success: false,
          error: `Connection to Ollama timed out. Check if ${this.endpoint} is accessible.`,
        };
      }

      return {
        success: false,
        error: `Failed to connect to Ollama: ${errorMessage}`,
      };
    }
  }

  /**
   * List available models from Ollama
   */
  public async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as OllamaTagsResponse;

      // Map Ollama models to our ModelInfo interface
      return data.models.map((model) => {
        // Check if we have default metadata for this model
        const defaultInfo = DEFAULT_MODELS[model.name];

        return {
          id: model.name,
          name: defaultInfo?.name || model.name,
          description:
            defaultInfo?.description ||
            `${model.details?.family || 'Unknown'} model (${model.details?.parameter_size || 'size unknown'})`,
          contextLength: defaultInfo?.contextLength,
          supportsStreaming: true, // All Ollama models support streaming
        };
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to list Ollama models: ${errorMessage}`);
    }
  }

  /**
   * Generate a completion (non-streaming)
   */
  public async generateCompletion(
    options: CompletionOptions
  ): Promise<CompletionResponse> {
    const model = await this.ensureModel();
    try {
      const requestBody: OllamaGenerateRequest = {
        model,
        prompt: options.prompt,
        system: options.systemPrompt,
        stream: false,
        options: {
          temperature: options.temperature,
          num_predict: options.maxTokens,
          stop: options.stop,
        },
      };

      // 10 minute timeout for CPU inference (CPU-only can take 5+ minutes for large prompts)
      const response = await fetch(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(600000), // 10 minute timeout
      });

      if (!response.ok) {
        // Special handling for 404 - usually means model not found
        if (response.status === 404) {
          throw new Error(
            `Model '${model}' not found on Ollama server.\n\n` +
            `Available models can be listed with: ollama list\n` +
            `Pull this model with: ollama pull ${model}\n\n` +
            `Or change the model in VS Code settings (devark.llm.providers.ollama.model)`
          );
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as OllamaGenerateResponse;

      return {
        text: data.response,
        model,
        provider: 'ollama',
        timestamp: new Date(),
        usage: {
          promptTokens: data.prompt_eval_count,
          completionTokens: data.eval_count,
          totalTokens:
            (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        text: '',
        model,
        provider: 'ollama',
        timestamp: new Date(),
        error: `Ollama completion failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Stream a completion
   */
  public async *streamCompletion(
    options: CompletionOptions
  ): AsyncGenerator<StreamChunk> {
    const model = await this.ensureModel();
    try {
      const requestBody: OllamaGenerateRequest = {
        model,
        prompt: options.prompt,
        system: options.systemPrompt,
        stream: true,
        options: {
          temperature: options.temperature,
          num_predict: options.maxTokens,
          stop: options.stop,
        },
      };

      // 10 minute timeout for CPU inference (CPU-only can take 5+ minutes for large prompts)
      const response = await fetch(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(600000), // 10 minute timeout
      });

      if (!response.ok) {
        // Special handling for 404 - usually means model not found
        if (response.status === 404) {
          throw new Error(
            `Model '${model}' not found on Ollama server.\n\n` +
            `Available models can be listed with: ollama list\n` +
            `Pull this model with: ollama pull ${model}\n\n` +
            `Or change the model in VS Code settings (devark.llm.providers.ollama.model)`
          );
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Process NDJSON stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // Decode chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete JSON lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) {
              continue;
            }

            try {
              const data: OllamaGenerateResponse = JSON.parse(line);

              yield {
                text: data.response,
                isComplete: data.done,
                model,
                provider: 'ollama',
                ...(data.done && {
                  usage: {
                    promptTokens: data.prompt_eval_count,
                    completionTokens: data.eval_count,
                    totalTokens:
                      (data.prompt_eval_count || 0) + (data.eval_count || 0),
                  },
                }),
              };

              if (data.done) {
                return;
              }
            } catch (parseError) {
              console.error('Failed to parse streaming chunk:', parseError);
              // Continue processing other chunks
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      yield {
        text: '',
        isComplete: true,
        model,
        provider: 'ollama',
        error: `Ollama streaming failed: ${errorMessage}`,
      };
    }
  }
}
