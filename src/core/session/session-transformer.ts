/**
 * Session Transformer - Pure functions for transforming session data
 *
 * Converts raw SessionData to SanitizedSession for API upload.
 */

import type { SessionData, SanitizedSession, SessionMetadata } from '../../types';
import {
  sanitizeMessages,
  type SanitizeMessagesResult,
} from '../sanitizer/message-sanitizer';

export interface MessageSummary {
  userMessageCount: number;
  assistantMessageCount: number;
  totalCharacters: number;
  redactions: SanitizeMessagesResult['totalRedactions'];
}

/**
 * Extract project name from full path.
 */
export function extractProjectName(projectPath: string): string {
  const parts = projectPath.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? 'unknown';
}

/**
 * Create a summary of messages for the upload payload.
 */
export function summarizeMessages(
  sanitizeResult: SanitizeMessagesResult
): MessageSummary {
  const messages = sanitizeResult.messages;
  const userMessages = messages.filter((m) => m.role === 'user');
  const assistantMessages = messages.filter((m) => m.role === 'assistant');

  return {
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
    totalCharacters: messages.reduce((sum, m) => sum + m.content.length, 0),
    redactions: sanitizeResult.totalRedactions,
  };
}

/**
 * Convert a SessionData to SanitizedSession for upload.
 */
export function toSanitizedSession(session: SessionData): SanitizedSession {
  const sanitizeResult = sanitizeMessages(session.messages);

  return {
    id: session.id,
    tool: session.tool,
    timestamp: session.timestamp.toISOString(),
    duration: session.duration,
    claudeSessionId: session.claudeSessionId,
    data: {
      projectName: extractProjectName(session.projectPath),
      messageSummary: JSON.stringify(sanitizeResult.messages),
      messageCount: session.messages.length,
      metadata: session.metadata ?? ({} as SessionMetadata),
    },
    sanitizationMetadata: {
      credentialsRedacted: sanitizeResult.totalRedactions.credentials,
      pathsRedacted: sanitizeResult.totalRedactions.paths,
      emailsRedacted: sanitizeResult.totalRedactions.emails,
      urlsRedacted: sanitizeResult.totalRedactions.urls,
      ipAddressesRedacted: sanitizeResult.totalRedactions.ips,
      envVarsRedacted: sanitizeResult.totalRedactions.envVars,
      databaseUrlsRedacted: sanitizeResult.totalRedactions.databaseUrls,
    },
  };
}
