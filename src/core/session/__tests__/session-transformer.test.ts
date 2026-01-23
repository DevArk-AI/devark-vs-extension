/**
 * Session Transformer Tests
 */

import { describe, it, expect } from 'vitest';
import {
  toSanitizedSession,
  extractProjectName,
  summarizeMessages,
} from '../session-transformer';
import type { SessionData } from '../../../types';
import type { SanitizeMessagesResult } from '../../sanitizer/message-sanitizer';

describe('SessionTransformer', () => {
  describe('extractProjectName()', () => {
    it('extracts last path segment from Unix path', () => {
      expect(extractProjectName('/Users/danny/dev/my-project')).toBe('my-project');
    });

    it('extracts last path segment from deep path', () => {
      expect(extractProjectName('/home/user/workspace/apps/frontend')).toBe('frontend');
    });

    it('handles trailing slash', () => {
      expect(extractProjectName('/Users/danny/dev/my-project/')).toBe('my-project');
    });

    it('handles single segment path', () => {
      expect(extractProjectName('/project')).toBe('project');
    });

    it('returns "unknown" for empty path', () => {
      expect(extractProjectName('')).toBe('unknown');
    });

    it('returns "unknown" for root path', () => {
      expect(extractProjectName('/')).toBe('unknown');
    });

    it('handles relative path', () => {
      expect(extractProjectName('foo/bar/baz')).toBe('baz');
    });

    it('extracts last path segment from Windows absolute path', () => {
      expect(extractProjectName('C:\\Users\\dev\\my-project')).toBe('my-project');
    });

    it('extracts last path segment from Windows path with lowercase drive', () => {
      expect(extractProjectName('c:\\devark\\devark-test')).toBe('devark-test');
    });

    it('handles mixed separators', () => {
      expect(extractProjectName('C:\\dev/my-project')).toBe('my-project');
    });

    it('handles Windows relative path', () => {
      expect(extractProjectName('foo\\bar\\baz')).toBe('baz');
    });
  });

  describe('summarizeMessages()', () => {
    it('counts user and assistant messages', () => {
      const sanitizeResult: SanitizeMessagesResult = {
        messages: [
          { role: 'user', content: 'Hello', originalLength: 5 },
          { role: 'assistant', content: 'Hi there', originalLength: 8 },
          { role: 'user', content: 'How are you?', originalLength: 12 },
        ],
        totalRedactions: {
          credentials: 0,
          paths: 0,
          emails: 0,
          urls: 0,
          ips: 0,
          envVars: 0,
          databaseUrls: 0,
        },
      };

      const summary = summarizeMessages(sanitizeResult);
      expect(summary.userMessageCount).toBe(2);
      expect(summary.assistantMessageCount).toBe(1);
    });

    it('calculates total characters', () => {
      const sanitizeResult: SanitizeMessagesResult = {
        messages: [
          { role: 'user', content: '12345', originalLength: 5 },
          { role: 'assistant', content: '1234567890', originalLength: 10 },
        ],
        totalRedactions: {
          credentials: 0,
          paths: 0,
          emails: 0,
          urls: 0,
          ips: 0,
          envVars: 0,
          databaseUrls: 0,
        },
      };

      const summary = summarizeMessages(sanitizeResult);
      expect(summary.totalCharacters).toBe(15);
    });

    it('includes redaction counts', () => {
      const sanitizeResult: SanitizeMessagesResult = {
        messages: [],
        totalRedactions: {
          credentials: 3,
          paths: 2,
          emails: 1,
          urls: 0,
          ips: 4,
          envVars: 0,
          databaseUrls: 1,
        },
      };

      const summary = summarizeMessages(sanitizeResult);
      expect(summary.redactions.credentials).toBe(3);
      expect(summary.redactions.paths).toBe(2);
      expect(summary.redactions.emails).toBe(1);
      expect(summary.redactions.ips).toBe(4);
      expect(summary.redactions.databaseUrls).toBe(1);
    });

    it('handles empty message array', () => {
      const sanitizeResult: SanitizeMessagesResult = {
        messages: [],
        totalRedactions: {
          credentials: 0,
          paths: 0,
          emails: 0,
          urls: 0,
          ips: 0,
          envVars: 0,
          databaseUrls: 0,
        },
      };

      const summary = summarizeMessages(sanitizeResult);
      expect(summary.userMessageCount).toBe(0);
      expect(summary.assistantMessageCount).toBe(0);
      expect(summary.totalCharacters).toBe(0);
    });

    it('handles system messages (not counted as user or assistant)', () => {
      const sanitizeResult: SanitizeMessagesResult = {
        messages: [
          { role: 'system', content: 'System prompt', originalLength: 13 },
          { role: 'user', content: 'Hi', originalLength: 2 },
        ],
        totalRedactions: {
          credentials: 0,
          paths: 0,
          emails: 0,
          urls: 0,
          ips: 0,
          envVars: 0,
          databaseUrls: 0,
        },
      };

      const summary = summarizeMessages(sanitizeResult);
      expect(summary.userMessageCount).toBe(1);
      expect(summary.assistantMessageCount).toBe(0);
      expect(summary.totalCharacters).toBe(15); // Still counts system message chars
    });
  });

  describe('toSanitizedSession()', () => {
    const createMockSession = (overrides: Partial<SessionData> = {}): SessionData => ({
      id: 'session-123',
      projectPath: '/Users/danny/dev/my-app',
      timestamp: new Date('2024-01-15T10:30:00Z'),
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
      duration: 3600,
      tool: 'claude_code',
      ...overrides,
    });

    it('transforms session ID correctly', () => {
      const session = createMockSession({ id: 'unique-id-456' });
      const result = toSanitizedSession(session);
      expect(result.id).toBe('unique-id-456');
    });

    it('transforms tool type correctly', () => {
      const session = createMockSession({ tool: 'cursor' });
      const result = toSanitizedSession(session);
      expect(result.tool).toBe('cursor');
    });

    it('converts timestamp to ISO string', () => {
      const session = createMockSession({
        timestamp: new Date('2024-06-20T14:45:30.000Z'),
      });
      const result = toSanitizedSession(session);
      expect(result.timestamp).toBe('2024-06-20T14:45:30.000Z');
    });

    it('preserves duration', () => {
      const session = createMockSession({ duration: 7200 });
      const result = toSanitizedSession(session);
      expect(result.duration).toBe(7200);
    });

    it('preserves claudeSessionId when present', () => {
      const session = createMockSession({ claudeSessionId: 'claude-abc-123' });
      const result = toSanitizedSession(session);
      expect(result.claudeSessionId).toBe('claude-abc-123');
    });

    it('extracts project name from path', () => {
      const session = createMockSession({
        projectPath: '/home/user/workspace/awesome-project',
      });
      const result = toSanitizedSession(session);
      expect(result.data.projectName).toBe('awesome-project');
    });

    it('includes message count', () => {
      const session = createMockSession({
        messages: [
          { role: 'user', content: 'One' },
          { role: 'assistant', content: 'Two' },
          { role: 'user', content: 'Three' },
        ],
      });
      const result = toSanitizedSession(session);
      expect(result.data.messageCount).toBe(3);
    });

    it('generates parseable messageSummary JSON as array', () => {
      const session = createMockSession();
      const result = toSanitizedSession(session);

      const messages = JSON.parse(result.data.messageSummary);
      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBe(2);
    });

    it('preserves metadata when present', () => {
      const session = createMockSession({
        metadata: {
          files_edited: 5,
          languages: ['typescript', 'javascript'],
          primaryModel: 'claude-3-opus',
        },
      });
      const result = toSanitizedSession(session);
      expect(result.data.metadata.files_edited).toBe(5);
      expect(result.data.metadata.languages).toEqual(['typescript', 'javascript']);
      expect(result.data.metadata.primaryModel).toBe('claude-3-opus');
    });

    it('uses empty metadata object when not present', () => {
      const session = createMockSession({ metadata: undefined });
      const result = toSanitizedSession(session);
      expect(result.data.metadata).toEqual({});
    });

    it('includes sanitization metadata', () => {
      const session = createMockSession({
        messages: [
          { role: 'user', content: 'My API key is sk-ant-api123456789' },
        ],
      });
      const result = toSanitizedSession(session);

      expect(result.sanitizationMetadata).toHaveProperty('credentialsRedacted');
      expect(result.sanitizationMetadata).toHaveProperty('pathsRedacted');
      expect(result.sanitizationMetadata).toHaveProperty('emailsRedacted');
      expect(result.sanitizationMetadata).toHaveProperty('urlsRedacted');
      expect(result.sanitizationMetadata).toHaveProperty('ipAddressesRedacted');
      expect(result.sanitizationMetadata).toHaveProperty('envVarsRedacted');
      expect(result.sanitizationMetadata).toHaveProperty('databaseUrlsRedacted');
    });

    it('sanitizes credentials in messages', () => {
      const session = createMockSession({
        messages: [
          { role: 'user', content: 'Use this key: sk-ant-mykey123456' },
        ],
      });
      const result = toSanitizedSession(session);

      // The message summary should not contain the actual key
      expect(result.data.messageSummary).not.toContain('sk-ant-mykey123456');
      expect(result.sanitizationMetadata.credentialsRedacted).toBeGreaterThan(0);
    });

    it('messageSummary should be array of sanitized messages (matches CLI)', () => {
      const session = createMockSession();
      const result = toSanitizedSession(session);
      const messages = JSON.parse(result.data.messageSummary);

      // Must be array - server calls messages.map()
      expect(Array.isArray(messages)).toBe(true);
      expect(messages[0]).toHaveProperty('role');
      expect(messages[0]).toHaveProperty('content');
    });
  });
});
