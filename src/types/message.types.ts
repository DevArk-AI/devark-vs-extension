/**
 * Message types - represents individual messages within a session
 */

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  role: MessageRole;
  content: string;
  timestamp: Date;
}

export interface SanitizedMessage {
  role: MessageRole;
  content: string;
  timestamp: Date;
}

export interface SanitizationMetadata {
  credentialsRedacted: number;
  pathsRedacted: number;
  urlsRedacted: number;
  emailsRedacted: number;
  ipAddressesRedacted: number;
  envVarsRedacted: number;
  databaseUrlsRedacted: number;
}

export interface SanitizedContent {
  content: string;
  metadata: SanitizationMetadata;
}
