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

/**
 * Information about a detected slash command.
 */
export interface SlashCommandInfo {
  /** Whether the prompt is a slash command */
  isSlashCommand: boolean;
  /** The command name (without the leading slash) */
  commandName?: string;
  /** Arguments passed to the command (if any) */
  arguments?: string;
}

/**
 * Detect if a prompt is a slash command.
 * Slash commands start with "/" followed by an alphanumeric command name
 * (which may include hyphens, underscores, and colons for namespaced commands).
 *
 * Examples:
 * - "/commit" -> { isSlashCommand: true, commandName: "commit" }
 * - "/work-on-item VIB-123" -> { isSlashCommand: true, commandName: "work-on-item", arguments: "VIB-123" }
 * - "/my_custom_cmd" -> { isSlashCommand: true, commandName: "my_custom_cmd" }
 * - "/bmad:bmad-custom:workflows:quiz-master" -> { isSlashCommand: true, commandName: "bmad:bmad-custom:workflows:quiz-master" }
 * - "/skill:sub-skill" -> { isSlashCommand: true, commandName: "skill:sub-skill" }
 * - "regular prompt" -> { isSlashCommand: false }
 *
 * Note: This may produce false positives for Unix-style file paths like "/home"
 * or "/etc" when typed as standalone prompts. However, this is rare in practice
 * since users typically provide more context with file paths. The regex requires
 * the command to start with a letter, which filters out paths like "/123" or "/-foo".
 *
 * @param content - The prompt content to check
 * @returns SlashCommandInfo with detection result
 */
export function detectSlashCommand(content: string): SlashCommandInfo {
  if (!content || content.trim().length === 0) {
    return { isSlashCommand: false };
  }

  const trimmed = content.trim();

  // Match slash commands: /command-name [optional args]
  // Command name must start with letter, can contain letters, numbers, hyphens, underscores, colons
  const slashCommandRegex = /^\/([a-zA-Z][a-zA-Z0-9-_:]*)(?:\s+(.*))?$/;
  const match = trimmed.match(slashCommandRegex);

  if (match) {
    return {
      isSlashCommand: true,
      commandName: match[1],
      arguments: match[2]?.trim() || undefined,
    };
  }

  return { isSlashCommand: false };
}
