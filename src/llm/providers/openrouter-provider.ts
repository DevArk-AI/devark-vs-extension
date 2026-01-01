/**
 * OpenRouter Provider Implementation
 *
 * Connects to OpenRouter API to access multiple LLM providers (Claude, GPT-4, Llama, Gemini).
 * Handles authentication, rate limiting, and cost tracking.
 */

import {
  LLMProvider,
  LLMProviderType,
  CompletionOptions,
  CompletionResponse,
  StreamChunk,
  ModelInfo,
  ConnectionTestResult,
  OpenRouterConfig,
  ProviderCapabilities,
} from '../types';
import { RegisterProvider } from '../decorators';
import { RateLimiter } from '../rate-limiter';

/**
 * OpenRouter Chat Completions API request
 */
interface OpenRouterChatRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
  stream?: boolean;
}

/**
 * OpenRouter Chat Completions API response
 */
interface OpenRouterChatResponse {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenRouter streaming chunk (SSE format)
 */
interface OpenRouterStreamChunk {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenRouter error response
 */
interface OpenRouterErrorResponse {
  error: {
    code: number;
    message: string;
  };
}

/**
 * Supported OpenRouter models with metadata
 */
const SUPPORTED_MODELS: Record<string, ModelInfo> = {
  'anthropic/claude-3.5-sonnet': {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: 'Anthropic\'s most intelligent model with excellent coding capabilities',
    contextLength: 200000,
    supportsStreaming: true,
  },
  'openai/gpt-4-turbo': {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: 'OpenAI\'s latest GPT-4 with improved performance and lower cost',
    contextLength: 128000,
    supportsStreaming: true,
  },
  'meta-llama/llama-3-70b-instruct': {
    id: 'meta-llama/llama-3-70b-instruct',
    name: 'Llama 3 70B Instruct',
    description: 'Meta\'s powerful open-source model optimized for instructions',
    contextLength: 8192,
    supportsStreaming: true,
  },
  'google/gemini-pro': {
    id: 'google/gemini-pro',
    name: 'Gemini Pro',
    description: 'Google\'s capable multimodal model',
    contextLength: 32768,
    supportsStreaming: true,
  },
};

/**
 * OpenRouter model info from API
 */
interface OpenRouterModelInfo {
  id: string;
  name: string;
  context_length?: number;
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
  };
}

/**
 * Cached model limits
 */
interface ModelLimits {
  maxCompletionTokens: number;
  contextLength: number;
  fetchedAt: number;
}

/**
 * Provider implementation for OpenRouter
 *
 * Automatically registers with the global provider registry via @RegisterProvider decorator.
 */
@RegisterProvider({
  id: 'openrouter',
  displayName: 'OpenRouter',
  description: 'Your OpenRouter subscription',
  requiresAuth: true,
  supportsStreaming: true,
  supportsCostTracking: true,
  configSchema: {
    apiKey: {
      type: 'string',
      required: true,
      secret: true,
      description: 'OpenRouter API key (get from https://openrouter.ai)',
    },
    model: {
      type: 'string',
      required: true,
      description: 'Model identifier (e.g., anthropic/claude-3.5-sonnet, openai/gpt-4-turbo)',
    },
    siteUrl: {
      type: 'string',
      required: false,
      description: 'Optional site URL for OpenRouter ranking',
    },
    siteName: {
      type: 'string',
      required: false,
      description: 'Optional site name for OpenRouter ranking',
    },
  },
})
export class OpenRouterProvider implements LLMProvider {
  public readonly type: LLMProviderType = 'openrouter';
  private readonly apiKey: string;
  private readonly _model: string;
  private readonly endpoint = 'https://openrouter.ai/api/v1';
  private readonly siteUrl?: string;
  private readonly siteName?: string;
  private rateLimiter = new RateLimiter(20, 60000, 'OpenRouter');

  // Cache for model limits (shared across instances)
  private static modelLimitsCache: Map<string, ModelLimits> = new Map();
  private static readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * OpenRouter provider capabilities
   */
  public readonly capabilities: ProviderCapabilities = {
    streaming: true,
    costTracking: true, // OpenRouter provides detailed cost tracking
    modelListing: true,
    customEndpoints: false, // Uses fixed OpenRouter endpoint
    requiresAuth: true, // Requires API key
  };

  constructor(config: OpenRouterConfig) {
    if (!config.model) {
      throw new Error('OpenRouter model is required');
    }
    this.apiKey = config.apiKey;
    this._model = config.model;
    this.siteUrl = config.siteUrl;
    this.siteName = config.siteName;
  }

  public get model(): string {
    return this._model;
  }

  /**
   * Build request headers for OpenRouter API
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': this.siteUrl || 'https://github.com/devark/devark',
      'X-Title': this.siteName || 'VibeLog VSCode Extension',
    };

    return headers;
  }

  /**
   * Fetch and cache model limits from OpenRouter API
   * Returns max completion tokens for the current model
   */
  private async getModelLimits(): Promise<ModelLimits> {
    // Check cache first
    const cached = OpenRouterProvider.modelLimitsCache.get(this._model);
    if (cached && (Date.now() - cached.fetchedAt) < OpenRouterProvider.CACHE_TTL_MS) {
      console.log(`[OpenRouter] Using cached model limits for ${this._model}: maxTokens=${cached.maxCompletionTokens}`);
      return cached;
    }

    try {
      console.log(`[OpenRouter] Fetching model limits for ${this._model}...`);
      const response = await fetch(`${this.endpoint}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(`[OpenRouter] Failed to fetch models: HTTP ${response.status}`);
        return this.getDefaultLimits();
      }

      const data = await response.json() as { data?: OpenRouterModelInfo[] };
      const models = data.data || [];

      // Find our specific model
      const modelInfo = models.find(m => m.id === this._model);

      if (modelInfo) {
        const limits: ModelLimits = {
          maxCompletionTokens: modelInfo.top_provider?.max_completion_tokens || 4096,
          contextLength: modelInfo.top_provider?.context_length || modelInfo.context_length || 4096,
          fetchedAt: Date.now(),
        };

        console.log(`[OpenRouter] Model ${this._model} limits: maxCompletionTokens=${limits.maxCompletionTokens}, contextLength=${limits.contextLength}`);

        // Cache the limits
        OpenRouterProvider.modelLimitsCache.set(this._model, limits);
        return limits;
      }

      console.warn(`[OpenRouter] Model ${this._model} not found in models list, using defaults`);
      return this.getDefaultLimits();

    } catch (error) {
      console.warn(`[OpenRouter] Error fetching model limits:`, error);
      return this.getDefaultLimits();
    }
  }

  /**
   * Get default limits when API fetch fails
   */
  private getDefaultLimits(): ModelLimits {
    // Conservative defaults - 800 tokens to be safe with free tier models
    return {
      maxCompletionTokens: 800,
      contextLength: 4096,
      fetchedAt: Date.now(),
    };
  }

  /**
   * OpenRouter free tier has a hard 1000 token output limit that isn't exposed in the API.
   * Models ending with `:free` use this routing.
   */
  private static readonly FREE_TIER_MAX_TOKENS = 1000;
  private static readonly FREE_TIER_SAFE_MAX = 800; // Leave 200 token buffer

  /**
   * Get the effective max tokens, respecting model limits
   */
  private async getEffectiveMaxTokens(requestedMaxTokens?: number): Promise<number> {
    const requested = requestedMaxTokens || 1000;

    // Check if this is a free tier model (ends with :free)
    // Free tier has a hard 1000 token output limit NOT reported by the API
    if (this._model.endsWith(':free')) {
      const freeMax = OpenRouterProvider.FREE_TIER_SAFE_MAX;
      if (requested > freeMax) {
        console.log(`[OpenRouter] Free tier model detected (${this._model}). Capping tokens from ${requested} to ${freeMax} (free tier limit: ${OpenRouterProvider.FREE_TIER_MAX_TOKENS})`);
        return freeMax;
      }
      console.log(`[OpenRouter] Free tier model: using ${requested} tokens (limit: ${OpenRouterProvider.FREE_TIER_MAX_TOKENS})`);
      return requested;
    }

    // For non-free models, use the API-reported limits
    const limits = await this.getModelLimits();

    // Use 90% of max to leave headroom for the model
    const safeMax = Math.floor(limits.maxCompletionTokens * 0.9);

    if (requested > safeMax) {
      console.log(`[OpenRouter] Requested ${requested} tokens exceeds safe limit ${safeMax}, capping to ${safeMax}`);
      return safeMax;
    }

    return requested;
  }

  /**
   * Check if OpenRouter is accessible with current API key
   */
  public async isAvailable(): Promise<boolean> {
    try {
      // Test with a minimal request
      const response = await fetch(`${this.endpoint}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Test connection to OpenRouter and validate API key
   */
  public async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await fetch(`${this.endpoint}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            error: 'Invalid API key. Please check your OpenRouter API key.',
          };
        }

        if (response.status === 429) {
          return {
            success: false,
            error: 'Rate limit exceeded. Please try again later.',
          };
        }

        const errorData = await response.json() as OpenRouterErrorResponse;
        return {
          success: false,
          error: errorData.error.message || `HTTP ${response.status}`,
        };
      }

      const data = await response.json() as { data?: unknown[] };
      const modelsCount = Array.isArray(data.data) ? data.data.length : 0;

      return {
        success: true,
        details: {
          modelsAvailable: modelsCount,
          endpoint: this.endpoint,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('timeout')) {
        return {
          success: false,
          error: 'Connection to OpenRouter timed out. Check your internet connection.',
        };
      }

      return {
        success: false,
        error: `Failed to connect to OpenRouter: ${errorMessage}`,
      };
    }
  }

  /**
   * List supported models
   */
  public async listModels(): Promise<ModelInfo[]> {
    // Return our curated list of supported models
    // In a production system, we could fetch this dynamically from OpenRouter's /models endpoint
    return Object.values(SUPPORTED_MODELS);
  }

  /**
   * Calculate cost based on token usage (approximate)
   */
  private calculateCost(model: string, usage: {
    prompt_tokens: number;
    completion_tokens: number;
  }): { amount: number; currency: string } {
    // Approximate pricing (in USD per 1M tokens)
    const pricing: Record<string, { prompt: number; completion: number }> = {
      'anthropic/claude-3.5-sonnet': { prompt: 3.0, completion: 15.0 },
      'openai/gpt-4-turbo': { prompt: 10.0, completion: 30.0 },
      'meta-llama/llama-3-70b-instruct': { prompt: 0.9, completion: 0.9 },
      'google/gemini-pro': { prompt: 0.5, completion: 1.5 },
    };

    const modelPricing = pricing[model] || { prompt: 1.0, completion: 2.0 };

    const promptCost = (usage.prompt_tokens / 1_000_000) * modelPricing.prompt;
    const completionCost = (usage.completion_tokens / 1_000_000) * modelPricing.completion;

    return {
      amount: promptCost + completionCost,
      currency: 'USD',
    };
  }

  /**
   * Generate a completion (non-streaming)
   */
  public async generateCompletion(
    options: CompletionOptions
  ): Promise<CompletionResponse> {
    try {
      await this.rateLimiter.throttle();

      const messages: OpenRouterChatRequest['messages'] = [];

      if (options.systemPrompt) {
        messages.push({
          role: 'system',
          content: options.systemPrompt,
        });
      }

      messages.push({
        role: 'user',
        content: options.prompt,
      });

      // Get effective max tokens respecting model limits
      const effectiveMaxTokens = await this.getEffectiveMaxTokens(options.maxTokens);

      const requestBody: OpenRouterChatRequest = {
        model: this._model,
        messages,
        temperature: options.temperature,
        max_tokens: effectiveMaxTokens,
        stop: options.stop,
        stream: false,
      };

      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(120000), // 2 minute timeout
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }

        if (response.status === 401) {
          throw new Error('Invalid API key. Please check your OpenRouter configuration.');
        }

        const errorData = await response.json() as OpenRouterErrorResponse;
        throw new Error(errorData.error.message || `HTTP ${response.status}`);
      }

      const data = await response.json() as OpenRouterChatResponse;

      // Debug logging for empty responses
      console.log('[OpenRouter] Raw API response:', JSON.stringify(data, null, 2));

      const choice = data.choices[0];

      if (!choice) {
        throw new Error('No completion returned from OpenRouter');
      }

      // Check for empty content
      if (!choice.message?.content) {
        console.warn('[OpenRouter] Empty content received from API');
        console.warn('[OpenRouter] Full choice object:', JSON.stringify(choice, null, 2));
        console.warn('[OpenRouter] finish_reason:', choice.finish_reason);
      }

      const cost = this.calculateCost(this._model, data.usage);

      // Get content, defaulting to empty string if null/undefined
      const content = choice.message?.content || '';

      // If content is empty despite successful response, report as error
      if (!content) {
        // Special handling for finish_reason: "length" - model hit token limit
        if (choice.finish_reason === 'length') {
          console.warn('[OpenRouter] Model hit output token limit - returned empty content');
          console.warn('[OpenRouter] completion_tokens:', data.usage?.completion_tokens);
          return {
            text: '',
            model: this._model,
            provider: 'openrouter',
            timestamp: new Date(),
            error: `Model ${this._model} hit its output token limit (${data.usage?.completion_tokens || 'unknown'} tokens). The free tier of this model may have a lower limit. Try a different model or reduce the prompt size.`,
            usage: data.usage ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            } : undefined,
          };
        }

        console.warn('[OpenRouter] Model returned empty content with finish_reason:', choice.finish_reason);
        return {
          text: '',
          model: this._model,
          provider: 'openrouter',
          timestamp: new Date(),
          error: `Model ${this._model} returned empty response. This model may not support this request format or may have content filtering enabled.`,
          usage: data.usage ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          } : undefined,
        };
      }

      return {
        text: content,
        model: this._model,
        provider: 'openrouter',
        timestamp: new Date(),
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        cost,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        text: '',
        model: this._model,
        provider: 'openrouter',
        timestamp: new Date(),
        error: `OpenRouter completion failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Stream a completion
   */
  public async *streamCompletion(
    options: CompletionOptions
  ): AsyncGenerator<StreamChunk> {
    try {
      await this.rateLimiter.throttle();

      const messages: OpenRouterChatRequest['messages'] = [];

      if (options.systemPrompt) {
        messages.push({
          role: 'system',
          content: options.systemPrompt,
        });
      }

      messages.push({
        role: 'user',
        content: options.prompt,
      });

      // Get effective max tokens respecting model limits
      const effectiveMaxTokens = await this.getEffectiveMaxTokens(options.maxTokens);

      const requestBody: OpenRouterChatRequest = {
        model: this._model,
        messages,
        temperature: options.temperature,
        max_tokens: effectiveMaxTokens,
        stop: options.stop,
        stream: true,
      };

      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(120000), // 2 minute timeout
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }

        if (response.status === 401) {
          throw new Error('Invalid API key. Please check your OpenRouter configuration.');
        }

        const errorData = await response.json() as OpenRouterErrorResponse;
        throw new Error(errorData.error.message || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Process SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let totalUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // Decode chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed || trimmed === 'data: [DONE]') {
              continue;
            }

            if (!trimmed.startsWith('data: ')) {
              continue;
            }

            try {
              const jsonStr = trimmed.slice(6); // Remove 'data: ' prefix
              const data: OpenRouterStreamChunk = JSON.parse(jsonStr);

              const delta = data.choices[0]?.delta;
              const finishReason = data.choices[0]?.finish_reason;

              if (delta?.content) {
                yield {
                  text: delta.content,
                  isComplete: false,
                  model: this._model,
                  provider: 'openrouter',
                };
              }

              // Store usage info if present
              if (data.usage) {
                totalUsage = data.usage;
              }

              // Send final chunk with usage info
              if (finishReason) {
                const finalChunk: StreamChunk = {
                  text: '',
                  isComplete: true,
                  model: this._model,
                  provider: 'openrouter',
                };

                if (totalUsage) {
                  finalChunk.usage = {
                    promptTokens: totalUsage.prompt_tokens,
                    completionTokens: totalUsage.completion_tokens,
                    totalTokens: totalUsage.total_tokens,
                  };

                  finalChunk.cost = this.calculateCost(this._model, totalUsage);
                }

                yield finalChunk;
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
        model: this._model,
        provider: 'openrouter',
        error: `OpenRouter streaming failed: ${errorMessage}`,
      };
    }
  }
}
