/**
 * OllamaProvider Unit Tests
 *
 * Tests for Ollama provider including:
 * - Model auto-detection when no model is configured
 * - ensureModel() lazy initialization
 * - generateCompletion with auto-detected model
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from '../ollama-provider';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

/**
 * Helper to create a mock NDJSON stream for streaming tests
 */
function createMockNDJSONStream(
  chunks: Array<{ response: string; done: boolean; prompt_eval_count?: number; eval_count?: number }>
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(chunk) + '\n'));
      }
      controller.close();
    },
  });
}

describe('OllamaProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should accept config without model', () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
      });

      expect(provider).toBeDefined();
      expect(provider.model).toBe(''); // No model set yet
    });

    test('should use configured model when provided', () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
        model: 'llama3.1:8b',
      });

      expect(provider.model).toBe('llama3.1:8b');
    });
  });

  describe('autoDetectModel', () => {
    test('should return configured model if set', async () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
        model: 'configured-model',
      });

      const model = await provider.autoDetectModel();

      expect(model).toBe('configured-model');
      expect(mockFetch).not.toHaveBeenCalled(); // Should not call API
    });

    test('should detect first available model from Ollama', async () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
      });

      // Mock listModels response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: 'llama3.1:8b', details: { family: 'llama', parameter_size: '8B' } },
            { name: 'codellama:7b', details: { family: 'llama', parameter_size: '7B' } },
          ],
        }),
      });

      const model = await provider.autoDetectModel();

      expect(model).toBe('llama3.1:8b');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ method: 'GET' })
      );
    });

    test('should cache detected model', async () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'cached-model', details: {} }],
        }),
      });

      // First call - should fetch
      const model1 = await provider.autoDetectModel();
      expect(model1).toBe('cached-model');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const model2 = await provider.autoDetectModel();
      expect(model2).toBe('cached-model');
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    test('should return null if no models available', async () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const model = await provider.autoDetectModel();

      expect(model).toBeNull();
    });

    test('should return null if listModels fails', async () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
      });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const model = await provider.autoDetectModel();

      expect(model).toBeNull();
    });
  });

  describe('generateCompletion with auto-detection', () => {
    test('should auto-detect model before making request', async () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
      });

      // First call - listModels for auto-detection
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'auto-detected-model', details: {} }],
        }),
      });

      // Second call - actual completion request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: 'Hello world',
          done: true,
          prompt_eval_count: 10,
          eval_count: 5,
        }),
      });

      const result = await provider.generateCompletion({
        prompt: 'Say hello',
      });

      expect(result.model).toBe('auto-detected-model');
      expect(result.text).toBe('Hello world');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify the completion request used the detected model
      const completionCall = mockFetch.mock.calls[1];
      const body = JSON.parse(completionCall[1].body);
      expect(body.model).toBe('auto-detected-model');
    });

    test('should throw helpful error if no models found', async () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await expect(provider.generateCompletion({
        prompt: 'Say hello',
      })).rejects.toThrow('No model configured');
    });

    test('should use configured model without auto-detection', async () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
        model: 'pre-configured-model',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: 'Response',
          done: true,
        }),
      });

      const result = await provider.generateCompletion({
        prompt: 'Test',
      });

      expect(result.model).toBe('pre-configured-model');
      // Only 1 call - no auto-detection needed
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('model getter', () => {
    test('should return empty string when no model configured or detected', () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
      });

      expect(provider.model).toBe('');
    });

    test('should return configured model', () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
        model: 'my-model',
      });

      expect(provider.model).toBe('my-model');
    });

    test('should return detected model after autoDetectModel call', async () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'detected-model', details: {} }],
        }),
      });

      await provider.autoDetectModel();

      expect(provider.model).toBe('detected-model');
    });
  });

  describe('streamCompletion with auto-detection', () => {
    test('should auto-detect model before starting stream', async () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
      });

      // First call - listModels for auto-detection
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'auto-detected-model', details: {} }],
        }),
      });

      // Second call - streaming response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockNDJSONStream([
          { response: 'Hello', done: false },
          { response: ' world', done: false },
          { response: '', done: true, prompt_eval_count: 10, eval_count: 5 },
        ]),
      });

      const chunks: Array<{ text: string; model: string; isComplete: boolean }> = [];
      for await (const chunk of provider.streamCompletion({ prompt: 'Say hello' })) {
        chunks.push({ text: chunk.text, model: chunk.model, isComplete: chunk.isComplete });
      }

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(chunks[0].model).toBe('auto-detected-model');
      expect(chunks.some((c) => c.text === 'Hello')).toBe(true);
      expect(chunks.some((c) => c.text === ' world')).toBe(true);
      expect(chunks[chunks.length - 1].isComplete).toBe(true);
    });

    test('should use detected model in stream request body', async () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
      });

      // Mock listModels
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'detected-model', details: {} }] }),
      });

      // Mock stream
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockNDJSONStream([{ response: '', done: true }]),
      });

      // Consume stream
      for await (const _ of provider.streamCompletion({ prompt: 'Test' })) {
        // consume
      }

      // Verify second call uses detected model
      const streamCall = mockFetch.mock.calls[1];
      const body = JSON.parse(streamCall[1].body);
      expect(body.model).toBe('detected-model');
      expect(body.stream).toBe(true);
    });

    test('should throw helpful error if no models found before streaming', async () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const generator = provider.streamCompletion({ prompt: 'Test' });

      // First call to next() should throw
      await expect(generator.next()).rejects.toThrow('No model configured');
    });

    test('should use configured model without auto-detection for streaming', async () => {
      const provider = new OllamaProvider({
        endpoint: 'http://localhost:11434',
        model: 'pre-configured-model',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockNDJSONStream([{ response: 'Test', done: true }]),
      });

      for await (const chunk of provider.streamCompletion({ prompt: 'Test' })) {
        expect(chunk.model).toBe('pre-configured-model');
      }

      // Only 1 call - no auto-detection needed
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
