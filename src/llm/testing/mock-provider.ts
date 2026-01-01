import {
  LLMProvider,
  ProviderCapabilities,
  CompletionOptions,
  CompletionResponse,
  StreamChunk,
  ConnectionTestResult,
  ModelInfo
} from '../types';

/**
 * Mock LLM Provider for testing
 *
 * Allows pre-configuring responses for specific prompts or patterns.
 * Useful for unit testing copilot services without hitting real APIs.
 */
export class MockLLMProvider implements LLMProvider {
  readonly type = 'mock';
  readonly model = 'mock-model';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    costTracking: false,
    modelListing: true,
    customEndpoints: false,
    requiresAuth: false
  };

  private responses: Map<string, CompletionResponse> = new Map();
  private streamingResponses: Map<string, string[]> = new Map();
  private callHistory: Array<{ prompt: string; options: CompletionOptions }> = [];
  private failOnNextCall = false;
  private nextCallError: Error | null = null;

  /**
   * Set a specific response for a given prompt
   */
  setResponse(prompt: string, response: CompletionResponse): void {
    this.responses.set(prompt, response);
  }

  /**
   * Set a streaming response for a given prompt
   */
  setStreamingResponse(prompt: string, chunks: string[]): void {
    this.streamingResponses.set(prompt, chunks);
  }

  /**
   * Set default response for any prompt
   */
  setDefaultResponse(response: CompletionResponse): void {
    this.responses.set('__default__', response);
  }

  /**
   * Make the next call fail with an error
   */
  failNextCall(errorMessage?: string): void {
    this.failOnNextCall = true;
    this.setDefaultResponse({
      text: '',
      model: 'mock-model',
      provider: 'mock',
      timestamp: new Date(),
      error: errorMessage || 'Mock error',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    });
  }

  /**
   * Make the next call fail by throwing a specific error
   */
  failNextCallWithError(error: Error): void {
    this.failOnNextCall = true;
    this.nextCallError = error;
  }

  /**
   * Get the history of all calls made to this provider
   */
  getCallHistory(): Array<{ prompt: string; options: CompletionOptions }> {
    return [...this.callHistory];
  }

  /**
   * Clear all configured responses and call history
   */
  reset(): void {
    this.responses.clear();
    this.streamingResponses.clear();
    this.callHistory = [];
    this.failOnNextCall = false;
    this.nextCallError = null;
  }

  // LLMProvider implementation

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    if (this.failOnNextCall) {
      return {
        success: false,
        error: 'Mock connection test failed'
      };
    }
    return {
      success: true
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: 'mock-model', name: 'Mock Model', contextLength: 100000 },
      { id: 'mock-model-2', name: 'Mock Model 2', contextLength: 200000 }
    ];
  }

  async generateCompletion(options: CompletionOptions): Promise<CompletionResponse> {
    // Record the call
    this.callHistory.push({
      prompt: options.prompt,
      options: { ...options }
    });

    // Throw error if configured
    if (this.failOnNextCall && this.nextCallError) {
      this.failOnNextCall = false;
      const error = this.nextCallError;
      this.nextCallError = null;
      throw error;
    }

    // Check for specific response
    if (this.responses.has(options.prompt)) {
      const response = this.responses.get(options.prompt)!;
      if (this.failOnNextCall) {
        this.failOnNextCall = false;
      }
      return response;
    }

    // Check for default response
    if (this.responses.has('__default__')) {
      const response = this.responses.get('__default__')!;
      if (this.failOnNextCall) {
        this.failOnNextCall = false;
      }
      return response;
    }

    // Generate a simple mock response
    return {
      text: `Mock response for: ${options.prompt.substring(0, 50)}...`,
      model: 'mock-model',
      provider: 'mock',
      timestamp: new Date(),
      usage: {
        promptTokens: Math.ceil(options.prompt.length / 4),
        completionTokens: 20,
        totalTokens: Math.ceil(options.prompt.length / 4) + 20
      }
    };
  }

  async *streamCompletion(options: CompletionOptions): AsyncGenerator<StreamChunk> {
    // Record the call
    this.callHistory.push({
      prompt: options.prompt,
      options: { ...options }
    });

    // Check for specific streaming response
    const chunks = this.streamingResponses.get(options.prompt) || ['Mock streaming response'];

    for (let i = 0; i < chunks.length; i++) {
      yield {
        text: chunks[i],
        isComplete: false,
        model: 'mock-model',
        provider: 'mock',
        usage: i === chunks.length - 1 ? {
          promptTokens: 10,
          completionTokens: chunks.length * 5,
          totalTokens: 10 + chunks.length * 5
        } : undefined
      };

      // Simulate streaming delay
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    yield {
      text: '',
      isComplete: true,
      model: 'mock-model',
      provider: 'mock'
    };
  }
}

/**
 * Helper to create a mock provider with common test responses
 */
export function createMockProviderWithDefaults(): MockLLMProvider {
  const provider = new MockLLMProvider();

  // Set some sensible defaults
  provider.setDefaultResponse({
    text: 'This is a mock response from the test provider.',
    model: 'mock-model',
    provider: 'mock',
    timestamp: new Date(),
    usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
  });

  return provider;
}
