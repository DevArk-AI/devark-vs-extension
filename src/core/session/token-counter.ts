/**
 * Token Counter Utility
 *
 * Uses js-tiktoken to count tokens for context window tracking.
 * Claude models use cl100k_base encoding (same as GPT-4).
 */

import { getEncoding, type Tiktoken } from 'js-tiktoken';

/**
 * Context window sizes for different Claude models (in tokens)
 */
export const CLAUDE_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  'claude-3.5-sonnet': 200000,
  'claude-3.5-haiku': 200000,
  'claude-opus-4': 200000,
  'claude-sonnet-4': 200000,
  'default': 200000,
};

// Lazy-load encoder for performance
let encoder: Tiktoken | null = null;

/**
 * Get or initialize the tokenizer encoder.
 * Uses cl100k_base encoding which is compatible with Claude models.
 */
function getEncoder(): Tiktoken {
  if (!encoder) {
    encoder = getEncoding('cl100k_base');
  }
  return encoder;
}

/**
 * Count tokens in a text string.
 * @param text The text to count tokens for
 * @returns Number of tokens
 */
export function countTokens(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }
  try {
    const enc = getEncoder();
    return enc.encode(text).length;
  } catch {
    // Fallback: rough estimate of ~4 chars per token
    return Math.ceil(text.length / 4);
  }
}

/**
 * Count tokens for an array of messages (input and output separately).
 * @param messages Array of messages with role and content
 * @returns Token counts for input (user) and output (assistant) messages
 */
export function countMessageTokens(
  messages: Array<{ role: string; content: string }>
): { inputTokens: number; outputTokens: number; totalTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;

  for (const message of messages) {
    const tokens = countTokens(message.content);
    if (message.role === 'user') {
      inputTokens += tokens;
    } else if (message.role === 'assistant') {
      outputTokens += tokens;
    }
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

/**
 * Estimate context utilization as a percentage (0-1).
 * @param totalTokens Total tokens used in the session
 * @param model Optional model name to get specific context window
 * @returns Context utilization ratio (0-1)
 */
export function estimateContextUtilization(
  totalTokens: number,
  model?: string
): number {
  const contextWindow = model
    ? CLAUDE_CONTEXT_WINDOWS[model] ?? CLAUDE_CONTEXT_WINDOWS.default
    : CLAUDE_CONTEXT_WINDOWS.default;

  const utilization = totalTokens / contextWindow;
  // Cap at 1.0 (100%) in case tokens exceed context window
  return Math.min(utilization, 1);
}

/**
 * Token usage data structure for sessions
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextUtilization: number;
}

/**
 * Calculate token usage for a session from its messages.
 * @param messages Array of messages with role and content
 * @param model Optional model name for context window size
 * @returns Token usage data including context utilization
 */
export function calculateTokenUsage(
  messages: Array<{ role: string; content: string }>,
  model?: string
): TokenUsage {
  const { inputTokens, outputTokens, totalTokens } = countMessageTokens(messages);
  const contextUtilization = estimateContextUtilization(totalTokens, model);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    contextUtilization,
  };
}
