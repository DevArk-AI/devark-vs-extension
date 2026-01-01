/**
 * Highlights Extractor - Pure Functions
 *
 * Extracts conversation highlights from message arrays for efficient summarization.
 * Shared between Claude and Cursor session readers.
 */

import type { Message, ConversationHighlights } from '../../types';

/**
 * Default maximum length for truncated highlight text
 */
export const DEFAULT_MAX_HIGHLIGHT_LENGTH = 500;

/**
 * Minimum content length to be considered meaningful
 */
export const MIN_MEANINGFUL_LENGTH = 10;

/**
 * Options for highlights extraction
 */
export interface HighlightsOptions {
  maxLength?: number;
}

/**
 * Check if a message content is meaningful (not empty, not just meta/commands).
 * Override patterns can be provided for tool-specific filtering.
 */
export function isMeaningfulMessage(
  content: string,
  skipPatterns: string[] = []
): boolean {
  if (!content || content.trim().length < MIN_MEANINGFUL_LENGTH) {
    return false;
  }

  // Default skip patterns (tool results, meta messages)
  const defaultSkipPatterns = [
    '[Tool:',
    '[Tool result]',
  ];

  const allPatterns = [...defaultSkipPatterns, ...skipPatterns];

  for (const pattern of allPatterns) {
    if (content.startsWith(pattern) || content.includes(pattern)) {
      return false;
    }
  }

  return true;
}

/**
 * Truncate text to max length (including ellipsis), preserving word boundaries when possible.
 * The resulting string will be at most maxLength characters.
 */
export function truncateText(
  text: string,
  maxLength: number = DEFAULT_MAX_HIGHLIGHT_LENGTH
): string {
  if (!text || text.length <= maxLength) {
    return text;
  }

  // Account for '...' suffix in the truncation point
  const truncateAt = maxLength - 3;
  const truncated = text.substring(0, truncateAt);
  const lastSpace = truncated.lastIndexOf(' ');

  // Try to break at word boundary if we're at least 80% through
  if (lastSpace > truncateAt * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Extract conversation highlights for efficient summarization.
 * Captures first user intent and last meaningful exchange.
 *
 * @param messages - Array of messages with role and content
 * @param options - Configuration options
 * @param skipPatterns - Additional patterns to skip (tool-specific)
 * @returns Highlights object or undefined if no meaningful messages
 */
export function extractHighlights(
  messages: Message[],
  options: HighlightsOptions = {},
  skipPatterns: string[] = []
): ConversationHighlights | undefined {
  const { maxLength = DEFAULT_MAX_HIGHLIGHT_LENGTH } = options;

  const highlights: ConversationHighlights = {};

  // Filter to meaningful messages
  const meaningfulMessages = messages.filter(
    (m) => isMeaningfulMessage(m.content, skipPatterns)
  );

  if (meaningfulMessages.length === 0) {
    return undefined;
  }

  // Find first meaningful user message (shows initial intent)
  const userMessages = meaningfulMessages.filter((m) => m.role === 'user');

  if (userMessages.length > 0) {
    highlights.firstUserMessage = truncateText(userMessages[0].content, maxLength);
  }

  // Find last meaningful user message and its assistant response
  const messagesWithIndex = messages.map((m, i) => ({ m, i }));
  const lastUserEntry = messagesWithIndex
    .filter(
      ({ m }) => m.role === 'user' && isMeaningfulMessage(m.content, skipPatterns)
    )
    .pop();

  if (lastUserEntry) {
    const lastUserMessage = lastUserEntry.m;

    // Look for assistant response after this user message
    const assistantAfter = messages
      .slice(lastUserEntry.i + 1)
      .find(
        (m) =>
          m.role === 'assistant' && isMeaningfulMessage(m.content, skipPatterns)
      );

    if (assistantAfter) {
      // Use shorter length for exchange to fit both parts
      const exchangeLength = Math.min(maxLength, 300);
      highlights.lastExchange = {
        userMessage: truncateText(lastUserMessage.content, exchangeLength),
        assistantResponse: truncateText(assistantAfter.content, exchangeLength),
      };
    }
  }

  return Object.keys(highlights).length > 0 ? highlights : undefined;
}
