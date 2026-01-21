/**
 * Prompt Utilities
 *
 * Shared utilities for identifying and counting user prompts.
 * These are used across multiple services to differentiate actual
 * user prompts from tool results and system messages.
 */

/**
 * Minimal message interface for prompt utilities.
 * Compatible with Message, CursorMessage, and other message types.
 */
interface MessageLike {
  role: string;
  content: string;
}

/**
 * Check if message content is an actual user prompt (not tool result).
 * Tool results contain [Tool result] or [Tool: ...] markers.
 *
 * @param content - The message content to check
 * @returns true if the content is an actual user prompt
 */
export function isActualUserPrompt(content: string): boolean {
  // Skip empty content
  if (!content || content.trim().length === 0) {
    return false;
  }
  // Skip tool results (these are machine-generated, not user prompts)
  if (content.startsWith('[Tool result]') || content.startsWith('[Tool:')) {
    return false;
  }
  // Skip if content is only tool markers
  const toolMarkerPattern = /^\s*\[Tool[^\]]*\]\s*$/;
  if (toolMarkerPattern.test(content)) {
    return false;
  }
  return true;
}

/**
 * Count actual user prompts in a list of messages.
 * Filters out tool results and empty messages.
 *
 * @param messages - Array of messages to count (any type with role and content)
 * @returns Number of actual user prompts
 */
export function countActualUserPrompts(messages: MessageLike[]): number {
  return messages.filter(
    (m) => m.role === 'user' && isActualUserPrompt(m.content)
  ).length;
}
