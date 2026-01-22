/**
 * ClaudeAgentSDKProvider Unit Tests
 *
 * Tests for Claude Agent SDK provider including:
 * - Response extraction from different message structures
 * - Handling of extended thinking (Opus model)
 * - Streaming and non-streaming completions
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the SDK before importing the provider
const mockQuery = vi.fn();
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
}));

// Mock fs, os, path
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}));

vi.mock('os', () => ({
  tmpdir: vi.fn().mockReturnValue('/tmp'),
  homedir: vi.fn().mockReturnValue('/home/user'),
}));

vi.mock('path', () => ({
  join: vi.fn((...args: string[]) => args.join('/')),
}));

// Helper to create async generator from array of messages
async function* createMessageGenerator(messages: any[]) {
  for (const msg of messages) {
    yield msg;
  }
}

describe('ClaudeAgentSDKProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateCompletion - message structure handling', () => {
    test('should extract text from assistant message with text content block (Haiku/Sonnet style)', async () => {
      const { ClaudeAgentSDKProvider } = await import('../claude-agent-sdk-provider');

      const messages = [
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'This is the response text.' }
            ]
          }
        },
        {
          type: 'result',
          total_cost_usd: 0.001
        }
      ];

      mockQuery.mockReturnValue(createMessageGenerator(messages));

      const provider = new ClaudeAgentSDKProvider({ model: 'haiku' });
      const result = await provider.generateCompletion({ prompt: 'Test prompt' });

      expect(result.text).toBe('This is the response text.');
      expect(result.cost?.amount).toBe(0.001);
    });

    test('should extract text from assistant message with thinking + text blocks (Opus style)', async () => {
      const { ClaudeAgentSDKProvider } = await import('../claude-agent-sdk-provider');

      const messages = [
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'thinking', thinking: 'Let me think about this...' },
              { type: 'text', text: 'Here is my response after thinking.' }
            ]
          }
        },
        {
          type: 'result',
          total_cost_usd: 0.05
        }
      ];

      mockQuery.mockReturnValue(createMessageGenerator(messages));

      const provider = new ClaudeAgentSDKProvider({ model: 'opus' });
      const result = await provider.generateCompletion({ prompt: 'Test prompt' });

      expect(result.text).toBe('Here is my response after thinking.');
      expect(result.cost?.amount).toBe(0.05);
    });

    test('should handle text event type directly', async () => {
      const { ClaudeAgentSDKProvider } = await import('../claude-agent-sdk-provider');

      const messages = [
        { type: 'text', text: 'Direct text response.' },
        { type: 'result' }
      ];

      mockQuery.mockReturnValue(createMessageGenerator(messages));

      const provider = new ClaudeAgentSDKProvider({ model: 'haiku' });
      const result = await provider.generateCompletion({ prompt: 'Test prompt' });

      expect(result.text).toBe('Direct text response.');
    });

    test('should handle content_block_delta events', async () => {
      const { ClaudeAgentSDKProvider } = await import('../claude-agent-sdk-provider');

      const messages = [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'First ' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'chunk.' } },
        { type: 'result' }
      ];

      mockQuery.mockReturnValue(createMessageGenerator(messages));

      const provider = new ClaudeAgentSDKProvider({ model: 'sonnet' });
      const result = await provider.generateCompletion({ prompt: 'Test prompt' });

      expect(result.text).toBe('First chunk.');
    });

    test('should handle result message with text fallback', async () => {
      const { ClaudeAgentSDKProvider } = await import('../claude-agent-sdk-provider');

      const messages = [
        { type: 'result', result: 'Fallback response from result.', total_cost_usd: 0.002 }
      ];

      mockQuery.mockReturnValue(createMessageGenerator(messages));

      const provider = new ClaudeAgentSDKProvider({ model: 'haiku' });
      const result = await provider.generateCompletion({ prompt: 'Test prompt' });

      expect(result.text).toBe('Fallback response from result.');
    });

    test('should accumulate text from multiple text blocks', async () => {
      const { ClaudeAgentSDKProvider } = await import('../claude-agent-sdk-provider');

      const messages = [
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'First paragraph.' },
              { type: 'text', text: 'Second paragraph.' }
            ]
          }
        },
        { type: 'result' }
      ];

      mockQuery.mockReturnValue(createMessageGenerator(messages));

      const provider = new ClaudeAgentSDKProvider({ model: 'sonnet' });
      const result = await provider.generateCompletion({ prompt: 'Test prompt' });

      expect(result.text).toBe('First paragraph.\nSecond paragraph.');
    });

    test('should handle errors gracefully', async () => {
      const { ClaudeAgentSDKProvider } = await import('../claude-agent-sdk-provider');

      mockQuery.mockImplementation(() => {
        throw new Error('SDK connection failed');
      });

      const provider = new ClaudeAgentSDKProvider({ model: 'haiku' });
      const result = await provider.generateCompletion({ prompt: 'Test prompt' });

      expect(result.text).toBe('');
      expect(result.error).toContain('SDK connection failed');
    });

    test('should pass system prompt separately via SDK options', async () => {
      const { ClaudeAgentSDKProvider } = await import('../claude-agent-sdk-provider');

      const messages = [
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Response' }] }
        },
        { type: 'result' }
      ];

      mockQuery.mockReturnValue(createMessageGenerator(messages));

      const provider = new ClaudeAgentSDKProvider({ model: 'haiku' });
      await provider.generateCompletion({
        prompt: 'User prompt',
        systemPrompt: 'System instructions'
      });

      // System prompt should be passed separately via options.systemPrompt
      expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
        prompt: 'User prompt',
        options: expect.objectContaining({
          systemPrompt: 'System instructions'
        })
      }));
    });
  });

  describe('streamCompletion', () => {
    test('should yield text chunks from assistant message', async () => {
      const { ClaudeAgentSDKProvider } = await import('../claude-agent-sdk-provider');

      const messages = [
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Streamed response.' }]
          }
        },
        { type: 'result', total_cost_usd: 0.001 }
      ];

      mockQuery.mockReturnValue(createMessageGenerator(messages));

      const provider = new ClaudeAgentSDKProvider({ model: 'haiku' });
      const chunks: any[] = [];

      for await (const chunk of provider.streamCompletion({ prompt: 'Test' })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0].text).toBe('Streamed response.');
      expect(chunks[0].isComplete).toBe(false);
      expect(chunks[chunks.length - 1].isComplete).toBe(true);
      expect(chunks[chunks.length - 1].cost?.amount).toBe(0.001);
    });

    test('should yield chunks from content_block_delta events', async () => {
      const { ClaudeAgentSDKProvider } = await import('../claude-agent-sdk-provider');

      const messages = [
        { type: 'content_block_delta', delta: { text: 'Chunk 1 ' } },
        { type: 'content_block_delta', delta: { text: 'Chunk 2' } },
        { type: 'result' }
      ];

      mockQuery.mockReturnValue(createMessageGenerator(messages));

      const provider = new ClaudeAgentSDKProvider({ model: 'sonnet' });
      const chunks: any[] = [];

      for await (const chunk of provider.streamCompletion({ prompt: 'Test' })) {
        chunks.push(chunk);
      }

      expect(chunks[0].text).toBe('Chunk 1 ');
      expect(chunks[1].text).toBe('Chunk 2');
    });
  });

  describe('listModels', () => {
    test('should return haiku, sonnet, and opus models', async () => {
      const { ClaudeAgentSDKProvider } = await import('../claude-agent-sdk-provider');

      const provider = new ClaudeAgentSDKProvider({ model: 'haiku' });
      const models = await provider.listModels();

      expect(models).toHaveLength(3);
      expect(models.map(m => m.id)).toEqual(['haiku', 'sonnet', 'opus']);
      expect(models.every(m => m.supportsStreaming)).toBe(true);
    });
  });

  describe('model property', () => {
    test('should use default model when not provided', async () => {
      const { ClaudeAgentSDKProvider } = await import('../claude-agent-sdk-provider');

      const provider = new ClaudeAgentSDKProvider({});
      expect(provider.model).toBe('haiku');
    });

    test('should use configured model when provided', async () => {
      const { ClaudeAgentSDKProvider } = await import('../claude-agent-sdk-provider');

      const provider = new ClaudeAgentSDKProvider({ model: 'opus' });
      expect(provider.model).toBe('opus');
    });
  });

  describe('type property', () => {
    test('should have correct provider type', async () => {
      const { ClaudeAgentSDKProvider } = await import('../claude-agent-sdk-provider');

      const provider = new ClaudeAgentSDKProvider({});
      expect(provider.type).toBe('claude-agent-sdk');
    });
  });
});
