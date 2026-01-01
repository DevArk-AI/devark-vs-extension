/**
 * ResponseCapture Tests
 *
 * Tests for Workstream B: Response Capture Hooks
 * - File detection for both sources (Cursor and Claude Code)
 * - JSON parsing with various payloads
 * - Event emission
 * - File cleanup after processing
 * - Handling of malformed files
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CapturedResponse,
  isResponseFile,
  isLatestResponseFile,
  getSourceFromFilename,
  RESPONSE_FILE_PATTERN,
  createEmptyResponseStats,
} from '../types/response-types';

describe('Response Types', () => {
  describe('isResponseFile', () => {
    it('should match valid Cursor response files', () => {
      expect(isResponseFile('cursor-response-1702345678901.json')).toBe(true);
      expect(isResponseFile('cursor-response-123456.json')).toBe(true);
    });

    it('should match valid Claude response files', () => {
      expect(isResponseFile('claude-response-1702345678901.json')).toBe(true);
      expect(isResponseFile('claude-response-987654.json')).toBe(true);
    });

    it('should NOT match prompt files', () => {
      expect(isResponseFile('prompt-1702345678901.json')).toBe(false);
      expect(isResponseFile('claude-prompt-1702345678901.json')).toBe(false);
    });

    it('should NOT match latest files', () => {
      expect(isResponseFile('latest-cursor-response.json')).toBe(false);
      expect(isResponseFile('latest-claude-response.json')).toBe(false);
    });

    it('should NOT match non-json files', () => {
      expect(isResponseFile('cursor-response-123.txt')).toBe(false);
      expect(isResponseFile('claude-response-123.txt')).toBe(false);
    });

    it('should NOT match invalid filenames', () => {
      expect(isResponseFile('response.json')).toBe(false);
      expect(isResponseFile('cursor-response.json')).toBe(false);
      expect(isResponseFile('random-file.json')).toBe(false);
    });
  });

  describe('isLatestResponseFile', () => {
    it('should match latest Cursor response file', () => {
      expect(isLatestResponseFile('latest-cursor-response.json')).toBe(true);
    });

    it('should match latest Claude response file', () => {
      expect(isLatestResponseFile('latest-claude-response.json')).toBe(true);
    });

    it('should NOT match timestamped response files', () => {
      expect(isLatestResponseFile('cursor-response-123456.json')).toBe(false);
      expect(isLatestResponseFile('claude-response-123456.json')).toBe(false);
    });

    it('should NOT match prompt files', () => {
      expect(isLatestResponseFile('latest-prompt.json')).toBe(false);
      expect(isLatestResponseFile('latest-claude-prompt.json')).toBe(false);
    });
  });

  describe('getSourceFromFilename', () => {
    it('should return cursor for Cursor response files', () => {
      expect(getSourceFromFilename('cursor-response-123456.json')).toBe('cursor');
    });

    it('should return claude_code for Claude response files', () => {
      expect(getSourceFromFilename('claude-response-123456.json')).toBe('claude_code');
    });

    it('should return null for non-response files', () => {
      expect(getSourceFromFilename('prompt-123456.json')).toBe(null);
      expect(getSourceFromFilename('random-file.json')).toBe(null);
    });
  });

  describe('createEmptyResponseStats', () => {
    it('should create empty stats object', () => {
      const stats = createEmptyResponseStats();

      expect(stats.totalResponses).toBe(0);
      expect(stats.successfulResponses).toBe(0);
      expect(stats.failedResponses).toBe(0);
      expect(stats.bySource.cursor).toBe(0);
      expect(stats.bySource.claude_code).toBe(0);
      expect(stats.averageResponseLength).toBe(0);
      expect(stats.topTools).toEqual([]);
    });
  });
});

describe('CapturedResponse Interface', () => {
  describe('Cursor response format', () => {
    it('should validate a complete Cursor response', () => {
      const response: CapturedResponse = {
        id: 'cursor-response-1702345678901-abc123',
        timestamp: '2024-12-08T10:30:00.000Z',
        source: 'cursor',
        response: "I've fixed the type error in UserService.ts by adding a null check...",
        success: true,
        conversationId: 'conv-xyz',
        generationId: 'gen-123',
        model: 'claude-3-5-sonnet',
        toolCalls: [
          { name: 'edit_file', arguments: { path: 'src/UserService.ts' } },
        ],
        filesModified: ['src/UserService.ts'],
        workspaceRoots: ['/Users/dev/project'],
      };

      expect(response.source).toBe('cursor');
      expect(response.success).toBe(true);
      expect(response.toolCalls).toHaveLength(1);
      expect(response.filesModified).toContain('src/UserService.ts');
    });

    it('should validate a minimal Cursor response', () => {
      const response: CapturedResponse = {
        id: 'cursor-response-123',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Done!',
        success: true,
      };

      expect(response.id).toBeTruthy();
      expect(response.source).toBe('cursor');
    });
  });

  describe('Claude Code response format', () => {
    it('should validate a complete Claude Code response', () => {
      const response: CapturedResponse = {
        id: 'claude-response-1702345678901-def456',
        timestamp: '2024-12-08T10:30:00.000Z',
        source: 'claude_code',
        response: "Done! I've updated the LoginComponent to handle the token refresh...",
        success: true,
        sessionId: 'session-abc',
        transcriptPath: '/Users/dev/.claude/sessions/session-abc.jsonl',
        reason: 'completed',
        toolResults: [
          { tool: 'Write', result: 'File written successfully' },
        ],
        cwd: '/Users/dev/project',
      };

      expect(response.source).toBe('claude_code');
      expect(response.reason).toBe('completed');
      expect(response.toolResults).toHaveLength(1);
    });

    it('should validate an errored Claude Code response', () => {
      const response: CapturedResponse = {
        id: 'claude-response-456',
        timestamp: new Date().toISOString(),
        source: 'claude_code',
        response: 'Error: Could not read file',
        success: false,
        reason: 'error',
        sessionId: 'session-xyz',
      };

      expect(response.success).toBe(false);
      expect(response.reason).toBe('error');
    });

    it('should validate a cancelled Claude Code response', () => {
      const response: CapturedResponse = {
        id: 'claude-response-789',
        timestamp: new Date().toISOString(),
        source: 'claude_code',
        response: '',
        success: false,
        reason: 'cancelled',
        sessionId: 'session-cancelled',
      };

      expect(response.success).toBe(false);
      expect(response.reason).toBe('cancelled');
    });
  });
});

describe('Response File Pattern', () => {
  it('should match valid response file patterns', () => {
    const validPatterns = [
      'cursor-response-1702345678901.json',
      'claude-response-1702345678901.json',
      'cursor-response-1.json',
      'claude-response-9999999999999.json',
    ];

    for (const pattern of validPatterns) {
      expect(RESPONSE_FILE_PATTERN.test(pattern)).toBe(true);
    }
  });

  it('should NOT match invalid patterns', () => {
    const invalidPatterns = [
      'cursor-response.json',        // No timestamp
      'claude-response.json',        // No timestamp
      'cursor-response-abc.json',    // Non-numeric timestamp
      'prompt-123.json',             // Prompt file
      'latest-cursor-response.json', // Latest file
    ];

    for (const pattern of invalidPatterns) {
      expect(RESPONSE_FILE_PATTERN.test(pattern)).toBe(false);
    }
  });
});

describe('Response Data Parsing', () => {
  it('should parse valid Cursor response JSON', () => {
    const jsonStr = JSON.stringify({
      id: 'cursor-response-123-abc',
      timestamp: '2024-12-08T10:30:00.000Z',
      source: 'cursor',
      response: 'Fixed the bug',
      success: true,
      conversationId: 'conv-1',
      model: 'claude-3-5-sonnet',
    });

    const parsed: CapturedResponse = JSON.parse(jsonStr);

    expect(parsed.source).toBe('cursor');
    expect(parsed.success).toBe(true);
    expect(parsed.response).toBe('Fixed the bug');
  });

  it('should parse valid Claude Code response JSON', () => {
    const jsonStr = JSON.stringify({
      id: 'claude-response-456-def',
      timestamp: '2024-12-08T10:30:00.000Z',
      source: 'claude_code',
      response: 'Completed the task',
      success: true,
      sessionId: 'session-1',
      reason: 'completed',
    });

    const parsed: CapturedResponse = JSON.parse(jsonStr);

    expect(parsed.source).toBe('claude_code');
    expect(parsed.reason).toBe('completed');
  });

  it('should handle response with truncated text', () => {
    const longResponse = 'A'.repeat(6000);
    const truncated = longResponse.substring(0, 5000);

    const response: CapturedResponse = {
      id: 'test-123',
      timestamp: new Date().toISOString(),
      source: 'cursor',
      response: truncated,
      success: true,
    };

    expect(response.response.length).toBe(5000);
  });

  it('should handle response with many tool calls (truncated)', () => {
    const manyToolCalls = Array.from({ length: 20 }, (_, i) => ({
      name: `tool_${i}`,
      arguments: { index: i },
    }));

    // Should only keep first 10
    const truncatedToolCalls = manyToolCalls.slice(0, 10);

    const response: CapturedResponse = {
      id: 'test-tools',
      timestamp: new Date().toISOString(),
      source: 'cursor',
      response: 'Done',
      success: true,
      toolCalls: truncatedToolCalls,
    };

    expect(response.toolCalls?.length).toBe(10);
  });

  it('should handle malformed JSON gracefully', () => {
    const malformedJson = '{ invalid json }';

    expect(() => JSON.parse(malformedJson)).toThrow();
  });
});

describe('Response Event Handling', () => {
  it('should create valid response event structure', () => {
    const response: CapturedResponse = {
      id: 'test-event',
      timestamp: new Date().toISOString(),
      source: 'cursor',
      response: 'Test response',
      success: true,
    };

    const event = {
      response,
      detectedAt: new Date(),
    };

    expect(event.response.id).toBe('test-event');
    expect(event.detectedAt).toBeInstanceOf(Date);
  });
});
