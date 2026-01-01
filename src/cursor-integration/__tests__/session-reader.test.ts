import { describe, it, expect } from 'vitest';
import { CursorSessionReader } from '../session-reader';
import { createMockCursorDb, createComposerData, createBubbleMessage } from '../testing/mock-cursor-db';

describe('CursorSessionReader', () => {
  describe('getActiveSessions', () => {
    it('should return empty array when no sessions exist', () => {
      const mockDb = createMockCursorDb({ composerData: {} });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions).toEqual([]);
    });

    it('should parse sessions with messages array format', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            workspaceName: 'my-project',
            messages: [
              { role: 'user', content: 'Hello', timestamp: Date.now() },
              { role: 'assistant', content: 'Hi there!', timestamp: Date.now() },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].workspaceName).toBe('my-project');
      expect(sessions[0].promptCount).toBe(2);
    });

    it('should parse sessions with conversation array format', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            workspaceName: 'test-project',
            conversation: [
              { type: 1, text: 'User question' },
              { type: 2, text: 'Assistant answer' },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].promptCount).toBe(2);
    });

    it('should parse sessions with fullConversationHeadersOnly (v9+)', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            _v: 9,
            workspaceName: 'modern-project',
            fullConversationHeadersOnly: [
              { bubbleId: 'b1', type: 1 },
              { bubbleId: 'b2', type: 2 },
              { bubbleId: 'b3', type: 1 },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].promptCount).toBe(2); // Only counts user messages (type=1)
    });

    it('should sort sessions by lastActivity (most recent first)', () => {
      const now = Date.now();
      const mockDb = createMockCursorDb({
        composerData: {
          'old-session': createComposerData({
            workspaceName: 'old-project',
            updatedAt: now - 86400000, // 1 day ago
          }),
          'new-session': createComposerData({
            workspaceName: 'new-project',
            updatedAt: now,
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions[0].workspaceName).toBe('new-project');
      expect(sessions[1].workspaceName).toBe('old-project');
    });

    it('should extract file context from files array', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            files: ['src/index.ts', 'package.json'],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions[0].fileContext).toEqual(['src/index.ts', 'package.json']);
    });

    it('should combine file context from multiple sources', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            files: ['src/a.ts'],
            fileContext: ['src/b.ts'],
            contextFiles: ['src/c.ts'],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions[0].fileContext).toContain('src/a.ts');
      expect(sessions[0].fileContext).toContain('src/b.ts');
      expect(sessions[0].fileContext).toContain('src/c.ts');
    });
  });

  describe('getSessionIndex', () => {
    it('should return lightweight session index', () => {
      const now = Date.now();
      const startTime = now - 3600000;
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            workspaceName: 'test-project',
            workspacePath: '/path/to/project',
            createdAt: startTime,
            updatedAt: now,
            messages: [{ role: 'user', content: 'test' }],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const indices = reader.getSessionIndex();

      expect(indices).toHaveLength(1);
      expect(indices[0].id).toBe('session-1');
      expect(indices[0].source).toBe('cursor');
      expect(indices[0].workspaceName).toBe('test-project');
      expect(indices[0].projectPath).toBe('/path/to/project');
      expect(indices[0].promptCount).toBe(1);
      expect(indices[0].duration).toBeGreaterThan(0);
    });
  });

  describe('getSessionById', () => {
    it('should return session by ID', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'target-session': createComposerData({
            workspaceName: 'target-project',
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const session = reader.getCursorSessionById('target-session');

      expect(session).not.toBeNull();
      expect(session?.sessionId).toBe('target-session');
      expect(session?.workspaceName).toBe('target-project');
    });

    it('should return null for non-existent session', () => {
      const mockDb = createMockCursorDb({ composerData: {} });
      const reader = new CursorSessionReader(mockDb);

      const session = reader.getCursorSessionById('non-existent');

      expect(session).toBeNull();
    });
  });

  describe('getSessionDetails', () => {
    it('should return session details with messages', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            messages: [
              { role: 'user', content: 'Hello world', timestamp: Date.now() },
              { role: 'assistant', content: 'Hello!', timestamp: Date.now() },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const details = reader.getSessionDetails('session-1');

      expect(details).not.toBeNull();
      expect(details?.messages).toHaveLength(2);
      expect(details?.messages[0].role).toBe('user');
      expect(details?.messages[0].content).toBe('Hello world');
    });

    it('should extract highlights from messages', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            messages: [
              { role: 'user', content: 'What is TypeScript used for?', timestamp: Date.now() },
              { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript.', timestamp: Date.now() },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const details = reader.getSessionDetails('session-1');

      expect(details?.highlights?.firstUserMessage).toBe('What is TypeScript used for?');
      expect(details?.highlights?.lastExchange?.userMessage).toBe('What is TypeScript used for?');
    });
  });

  describe('getSessionMessages', () => {
    it('should extract messages from messages array', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            messages: [
              { role: 'user', content: 'Test message' },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const messages = reader.getSessionMessages('session-1');

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Test message');
      expect(messages[0].role).toBe('user');
    });

    it('should extract messages from conversation array', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            conversation: [
              { type: 1, text: 'User text' },
              { type: 2, text: 'Assistant text' },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const messages = reader.getSessionMessages('session-1');

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('User text');
      expect(messages[0].role).toBe('user');
      expect(messages[1].content).toBe('Assistant text');
      expect(messages[1].role).toBe('assistant');
    });

    it('should extract messages from conversationHistory', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            conversationHistory: [
              { role: 'user', content: 'History message' },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const messages = reader.getSessionMessages('session-1');

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('History message');
    });

    it('should skip empty messages', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            messages: [
              { role: 'user', content: 'Valid message' },
              { role: 'user', content: '' },
              { role: 'user', content: '   ' },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const messages = reader.getSessionMessages('session-1');

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Valid message');
    });

    it('should skip system messages', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            messages: [
              { role: 'system', content: 'System prompt' },
              { role: 'user', content: 'User message' },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const messages = reader.getSessionMessages('session-1');

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
    });

    it('should handle numeric timestamps', () => {
      const timestamp = 1702300000000;
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            messages: [
              { role: 'user', content: 'Test', timestamp },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const messages = reader.getSessionMessages('session-1');

      expect(messages[0].timestamp).toBe(new Date(timestamp).toISOString());
    });

    it('should handle string timestamps', () => {
      const timestamp = '2023-12-11T10:00:00.000Z';
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            messages: [
              { role: 'user', content: 'Test', timestamp: timestamp as any },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const messages = reader.getSessionMessages('session-1');

      expect(messages[0].timestamp).toBe(timestamp);
    });

    it('should return empty array for non-existent session', () => {
      const mockDb = createMockCursorDb({ composerData: {} });
      const reader = new CursorSessionReader(mockDb);

      const messages = reader.getSessionMessages('non-existent');

      expect(messages).toEqual([]);
    });
  });

  describe('getBubbleMessages', () => {
    it('should extract messages from bubble format', () => {
      const mockDb = createMockCursorDb({
        composerData: {},
        bubbleData: {
          'bubbleId:session-1:0': createBubbleMessage({
            role: 'user',
            content: 'Bubble message 1',
          }),
          'bubbleId:session-1:1': createBubbleMessage({
            role: 'assistant',
            content: 'Bubble response',
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const messages = reader.getBubbleMessages('session-1');

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Bubble message 1');
      expect(messages[1].content).toBe('Bubble response');
    });

    it('should handle type-based role detection in bubbles', () => {
      const mockDb = createMockCursorDb({
        composerData: {},
        bubbleData: {
          'bubbleId:session-1:0': createBubbleMessage({
            type: 1,
            text: 'User text',
          }),
          'bubbleId:session-1:1': createBubbleMessage({
            type: 2,
            text: 'Assistant text',
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const messages = reader.getBubbleMessages('session-1');

      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });
  });

  describe('getAllMessagesForSession', () => {
    it('should prefer inline messages over bubble format', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            messages: [{ role: 'user', content: 'Inline message' }],
          }),
        },
        bubbleData: {
          'bubbleId:session-1:0': createBubbleMessage({
            content: 'Bubble message',
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const messages = reader.getAllMessagesForSession('session-1');

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Inline message');
    });

    it('should fall back to bubble format when no inline messages', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({}),
        },
        bubbleData: {
          'bubbleId:session-1:0': createBubbleMessage({
            content: 'Bubble message',
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const messages = reader.getAllMessagesForSession('session-1');

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Bubble message');
    });
  });

  describe('metadata extraction', () => {
    it('should extract workspaceName from workspaceName field', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            workspaceName: 'my-workspace',
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions[0].workspaceName).toBe('my-workspace');
    });

    it('should fallback to path basename for workspaceName', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            workspacePath: '/Users/dev/projects/my-app',
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions[0].workspaceName).toBe('my-app');
    });

    it('should use "Unknown Workspace" as final fallback', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({}),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions[0].workspaceName).toBe('Unknown Workspace');
    });

    it('should extract startTime from createdAt', () => {
      const createdAt = Date.now() - 7200000;
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            createdAt,
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions[0].startTime.getTime()).toBe(createdAt);
    });

    it('should extract lastActivity from updatedAt', () => {
      const updatedAt = Date.now();
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            updatedAt,
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions[0].lastActivity.getTime()).toBe(updatedAt);
    });

    it('should determine active status for recent sessions', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            updatedAt: Date.now(),
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions[0].status).toBe('active');
    });

    it('should determine historical status for old sessions', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            updatedAt: Date.now() - 48 * 60 * 60 * 1000, // 48 hours ago
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions[0].status).toBe('historical');
    });
  });

  describe('conversation highlights', () => {
    it('should extract first user message', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            messages: [
              { role: 'user', content: 'First user message here' },
              { role: 'assistant', content: 'Response' },
              { role: 'user', content: 'Second user message' },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions[0].highlights?.firstUserMessage).toBe('First user message here');
    });

    it('should extract last exchange', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            messages: [
              { role: 'user', content: 'First question' },
              { role: 'assistant', content: 'First answer' },
              { role: 'user', content: 'Last question' },
              { role: 'assistant', content: 'Last answer' },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions[0].highlights?.lastExchange?.userMessage).toBe('Last question');
      expect(sessions[0].highlights?.lastExchange?.assistantResponse).toBe('Last answer');
    });

    it('should truncate long messages in highlights', () => {
      const longMessage = 'A'.repeat(500);
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            messages: [
              { role: 'user', content: longMessage },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();
      const highlight = sessions[0].highlights?.firstUserMessage || '';

      expect(highlight.length).toBeLessThanOrEqual(300);
      expect(highlight.endsWith('...')).toBe(true);
    });

    it('should return undefined highlights for empty conversation', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            messages: [],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions[0].highlights).toBeUndefined();
    });

    it('should skip non-meaningful messages (too short)', () => {
      const mockDb = createMockCursorDb({
        composerData: {
          'session-1': createComposerData({
            messages: [
              { role: 'user', content: 'hi' },
              { role: 'user', content: 'This is a real meaningful question about TypeScript' },
            ],
          }),
        },
      });
      const reader = new CursorSessionReader(mockDb);

      const sessions = reader.getActiveSessions();

      expect(sessions[0].highlights?.firstUserMessage).toBe('This is a real meaningful question about TypeScript');
    });
  });

  describe('isReady', () => {
    it('should return true when database is injected', () => {
      const mockDb = createMockCursorDb({});
      const reader = new CursorSessionReader(mockDb);

      expect(reader.isReady()).toBe(true);
    });

    it('should return false when no database', () => {
      const reader = new CursorSessionReader();

      expect(reader.isReady()).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should close the database', () => {
      const mockDb = createMockCursorDb({});
      const reader = new CursorSessionReader(mockDb);

      reader.dispose();

      expect(mockDb.close).toHaveBeenCalled();
    });
  });

  // ISessionReader interface method tests
  describe('ISessionReader interface', () => {
    // Helper to create session data with messages (required for readSessions)
    const createSessionWithMessages = (workspaceName: string) => {
      const now = Date.now();
      return createComposerData({
        workspaceName,
        messages: [
          { role: 'user', content: 'Question', timestamp: now - 300000 },
          { role: 'assistant', content: 'Answer', timestamp: now },
        ],
      });
    };

    describe('tool property', () => {
      it('should return cursor as the tool type', () => {
        const mockDb = createMockCursorDb({});
        const reader = new CursorSessionReader(mockDb);

        expect(reader.tool).toBe('cursor');
      });
    });

    describe('getCapabilities', () => {
      it('should return cursor capabilities', () => {
        const mockDb = createMockCursorDb({});
        const reader = new CursorSessionReader(mockDb);

        const capabilities = reader.getCapabilities();

        expect(capabilities.tool).toBe('cursor');
        expect(capabilities.supportsIncremental).toBe(true);
        expect(capabilities.supportsFiltering).toBe(true);
        expect(capabilities.supportsModelTracking).toBe(false);
        expect(capabilities.supportsPlanningMode).toBe(false);
      });
    });

    describe('isAvailable', () => {
      it('should return true when database is injected', async () => {
        const mockDb = createMockCursorDb({});
        const reader = new CursorSessionReader(mockDb);

        const available = await reader.isAvailable();

        expect(available).toBe(true);
      });
    });

    describe('readSessions', () => {
      it('should return SessionReaderResult with sessions', async () => {
        const now = Date.now();
        const mockDb = createMockCursorDb({
          composerData: {
            'session-1': createComposerData({
              workspaceName: 'test-project',
              messages: [
                { role: 'user', content: 'Hello', timestamp: now - 300000 },
                { role: 'assistant', content: 'Hi!', timestamp: now },
              ],
            }),
          },
        });
        const reader = new CursorSessionReader(mockDb);

        const result = await reader.readSessions();

        expect(result.tool).toBe('cursor');
        expect(result.sessions).toHaveLength(1);
        expect(result.totalFound).toBe(1);
        expect(result.errors).toEqual([]);
        expect(result.sessions[0].tool).toBe('cursor');
      });

      it('should return empty result when no sessions', async () => {
        const mockDb = createMockCursorDb({ composerData: {} });
        const reader = new CursorSessionReader(mockDb);

        const result = await reader.readSessions();

        expect(result.sessions).toHaveLength(0);
        expect(result.totalFound).toBe(0);
      });
    });

    describe('getSessionById (async)', () => {
      it('should return SessionData for existing session', async () => {
        const now = Date.now();
        const mockDb = createMockCursorDb({
          composerData: {
            'session-123': createComposerData({
              workspaceName: 'my-project',
              messages: [
                { role: 'user', content: 'Question', timestamp: now - 300000 },
                { role: 'assistant', content: 'Answer', timestamp: now },
              ],
            }),
          },
        });
        const reader = new CursorSessionReader(mockDb);

        const session = await reader.getSessionById('session-123');

        expect(session).not.toBeNull();
        expect(session?.id).toBe('cursor-session-123'); // Prefixed with 'cursor-'
        expect(session?.tool).toBe('cursor');
        expect(session?.projectPath).toBe('my-project');
        expect(session?.messages).toHaveLength(2);
      });

      it('should return null for non-existent session', async () => {
        const mockDb = createMockCursorDb({ composerData: {} });
        const reader = new CursorSessionReader(mockDb);

        const session = await reader.getSessionById('non-existent');

        expect(session).toBeNull();
      });
    });

    describe('getProjectPaths', () => {
      it('should return unique project paths from all sessions', async () => {
        const mockDb = createMockCursorDb({
          composerData: {
            'session-1': createSessionWithMessages('project-a'),
            'session-2': createSessionWithMessages('project-b'),
            'session-3': createSessionWithMessages('project-a'), // duplicate
          },
        });
        const reader = new CursorSessionReader(mockDb);

        const paths = await reader.getProjectPaths();

        expect(paths).toHaveLength(2);
        expect(paths).toContain('project-a');
        expect(paths).toContain('project-b');
      });

      it('should return empty array when no sessions', async () => {
        const mockDb = createMockCursorDb({ composerData: {} });
        const reader = new CursorSessionReader(mockDb);

        const paths = await reader.getProjectPaths();

        expect(paths).toEqual([]);
      });
    });

    describe('getSessionCount', () => {
      it('should return total session count', async () => {
        const mockDb = createMockCursorDb({
          composerData: {
            'session-1': createSessionWithMessages('project-a'),
            'session-2': createSessionWithMessages('project-b'),
            'session-3': createSessionWithMessages('project-c'),
          },
        });
        const reader = new CursorSessionReader(mockDb);

        const count = await reader.getSessionCount();

        expect(count).toBe(3);
      });

      it('should return 0 when no sessions', async () => {
        const mockDb = createMockCursorDb({ composerData: {} });
        const reader = new CursorSessionReader(mockDb);

        const count = await reader.getSessionCount();

        expect(count).toBe(0);
      });
    });
  });
});
