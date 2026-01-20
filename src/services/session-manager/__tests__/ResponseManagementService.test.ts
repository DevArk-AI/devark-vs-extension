/**
 * ResponseManagementService Tests (TDD)
 *
 * Tests for response management:
 * - Adding responses to sessions
 * - Mapping response outcomes
 * - Linking responses to prompts
 * - Getting interactions (prompt+response pairs)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResponseManagementService } from '../ResponseManagementService';
import type { Project, Session, PromptRecord, ResponseRecord } from '../../types/session-types';
import type { CapturedResponse } from '../../types/response-types';

describe('ResponseManagementService', () => {
  let service: ResponseManagementService;
  let projects: Map<string, Project>;
  let emitEvent: ReturnType<typeof vi.fn>;
  let saveState: ReturnType<typeof vi.fn>;
  let activeSessionId: string | null;
  let activeProjectId: string | null;

  const createTestProject = (id: string, name: string): Project => ({
    id,
    name,
    path: `/users/test/${name}`,
    sessions: [],
    isExpanded: true,
    totalSessions: 0,
    totalPrompts: 0,
  });

  const createTestSession = (id: string, projectId: string, overrides?: Partial<Session>): Session => ({
    id,
    projectId,
    platform: 'cursor',
    startTime: new Date(),
    lastActivityTime: new Date(),
    promptCount: 0,
    prompts: [],
    responses: [],
    isActive: true,
    ...overrides,
  });

  const createTestPrompt = (id: string, sessionId: string): PromptRecord => ({
    id,
    sessionId,
    text: 'Test prompt',
    truncatedText: 'Test...',
    timestamp: new Date(),
    score: 5,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    projects = new Map();
    emitEvent = vi.fn();
    saveState = vi.fn().mockResolvedValue(undefined);
    activeSessionId = null;
    activeProjectId = null;

    service = new ResponseManagementService({
      projects,
      emitEvent,
      saveState,
      getActiveSession: () => {
        if (!activeSessionId || !activeProjectId) return null;
        const project = projects.get(activeProjectId);
        if (!project) return null;
        return project.sessions.find(s => s.id === activeSessionId) || null;
      },
    });
  });

  describe('mapResponseOutcome', () => {
    it('should return error for unsuccessful response', () => {
      const response: CapturedResponse = {
        id: 'r1',
        timestamp: new Date().toISOString(),
        success: false,
        source: 'cursor',
      };
      expect(service.mapResponseOutcome(response)).toBe('error');
    });

    it('should return partial for cancelled response', () => {
      const response: CapturedResponse = {
        id: 'r1',
        timestamp: new Date().toISOString(),
        success: true,
        reason: 'cancelled',
        source: 'cursor',
      };
      expect(service.mapResponseOutcome(response)).toBe('partial');
    });

    it('should return partial for aborted response', () => {
      const response: CapturedResponse = {
        id: 'r1',
        timestamp: new Date().toISOString(),
        success: true,
        stopReason: 'aborted',
        source: 'cursor',
      };
      expect(service.mapResponseOutcome(response)).toBe('partial');
    });

    it('should return success for successful response', () => {
      const response: CapturedResponse = {
        id: 'r1',
        timestamp: new Date().toISOString(),
        success: true,
        source: 'cursor',
      };
      expect(service.mapResponseOutcome(response)).toBe('success');
    });
  });

  describe('findMatchingPromptId', () => {
    it('should return promptId from response if present', () => {
      const session = createTestSession('s1', 'p1');
      const response: CapturedResponse = {
        id: 'r1',
        timestamp: new Date().toISOString(),
        success: true,
        source: 'cursor',
        promptId: 'explicit-prompt-id',
      };

      expect(service.findMatchingPromptId(response, session)).toBe('explicit-prompt-id');
    });

    it('should return most recent prompt ID when no promptId in response', () => {
      const session = createTestSession('s1', 'p1');
      session.prompts = [
        createTestPrompt('recent-prompt', 's1'),
        createTestPrompt('older-prompt', 's1'),
      ];

      const response: CapturedResponse = {
        id: 'r1',
        timestamp: new Date().toISOString(),
        success: true,
        source: 'cursor',
      };

      expect(service.findMatchingPromptId(response, session)).toBe('recent-prompt');
    });

    it('should return empty string when no prompts', () => {
      const session = createTestSession('s1', 'p1');

      const response: CapturedResponse = {
        id: 'r1',
        timestamp: new Date().toISOString(),
        success: true,
        source: 'cursor',
      };

      expect(service.findMatchingPromptId(response, session)).toBe('');
    });
  });

  describe('addResponse', () => {
    it('should add response to active session', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      session.prompts.push(createTestPrompt('prompt-1', 's1'));
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      const capturedResponse: CapturedResponse = {
        id: 'response-1',
        timestamp: new Date().toISOString(),
        success: true,
        response: 'This is the AI response text',
        filesModified: ['file1.ts', 'file2.ts'],
        toolCalls: [{ name: 'edit', arguments: {} }, { name: 'bash', arguments: {} }],
        source: 'cursor',
      };

      await service.addResponse(capturedResponse);

      expect(session.responses.length).toBe(1);
      expect(session.responses[0].id).toBe('response-1');
      expect(session.responses[0].promptId).toBe('prompt-1');
      expect(session.responses[0].outcome).toBe('success');
      expect(session.responses[0].filesModified).toEqual(['file1.ts', 'file2.ts']);
      expect(session.responses[0].toolCalls).toEqual(['edit', 'bash']);
      expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'response_added',
        responseId: 'response-1',
      }));
    });

    it('should extract tools from both toolCalls and toolResults', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      const capturedResponse: CapturedResponse = {
        id: 'response-1',
        timestamp: new Date().toISOString(),
        success: true,
        source: 'claude_code',
        toolCalls: [{ name: 'Edit', arguments: {} }],
        toolResults: [
          { tool: 'Bash', result: 'ok' },
          { tool: 'Read', result: 'content' },
        ],
      };

      await service.addResponse(capturedResponse);

      expect(session.responses[0].toolCalls).toEqual(['Edit', 'Bash', 'Read']);
    });

    it('should use provided promptId', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      session.prompts.push(createTestPrompt('prompt-1', 's1'));
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      const capturedResponse: CapturedResponse = {
        id: 'response-1',
        timestamp: new Date().toISOString(),
        success: true,
        source: 'cursor',
      };

      await service.addResponse(capturedResponse, 'explicit-prompt-id');

      expect(session.responses[0].promptId).toBe('explicit-prompt-id');
    });

    it('should truncate response text to 2000 chars', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      const capturedResponse: CapturedResponse = {
        id: 'response-1',
        timestamp: new Date().toISOString(),
        success: true,
        response: 'x'.repeat(3000),
        source: 'cursor',
      };

      await service.addResponse(capturedResponse);

      expect(session.responses[0].text.length).toBe(2000);
    });

    it('should initialize responses array if missing', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      delete (session as { responses?: ResponseRecord[] }).responses;
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      const capturedResponse: CapturedResponse = {
        id: 'response-1',
        timestamp: new Date().toISOString(),
        success: true,
        source: 'cursor',
      };

      await service.addResponse(capturedResponse);

      expect(session.responses).toBeDefined();
      expect(session.responses.length).toBe(1);
    });

    it('should do nothing when no active session', async () => {
      const capturedResponse: CapturedResponse = {
        id: 'response-1',
        timestamp: new Date().toISOString(),
        success: true,
        source: 'cursor',
      };

      await service.addResponse(capturedResponse);

      expect(emitEvent).not.toHaveBeenCalled();
    });

    it('should limit responses to MAX_PROMPTS_PER_SESSION', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      for (let i = 0; i < 105; i++) {
        await service.addResponse({
          id: `response-${i}`,
          timestamp: new Date().toISOString(),
          success: true,
          source: 'cursor',
        });
      }

      expect(session.responses.length).toBe(100);
    });
  });

  describe('getLastInteractions', () => {
    it('should return prompt+response pairs', () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      const prompt1 = createTestPrompt('p1', 's1');
      const prompt2 = createTestPrompt('p2', 's1');
      session.prompts = [prompt2, prompt1]; // Reverse chronological
      session.responses = [
        {
          id: 'r1',
          promptId: 'p1',
          timestamp: new Date(),
          text: 'Response 1',
          outcome: 'success',
          filesModified: [],
          toolCalls: [],
          source: 'cursor',
        },
      ];
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      const interactions = service.getLastInteractions(5);

      expect(interactions.length).toBe(2);
      expect(interactions[0].prompt.id).toBe('p2');
      expect(interactions[0].response).toBeUndefined();
      expect(interactions[1].prompt.id).toBe('p1');
      expect(interactions[1].response?.id).toBe('r1');
    });

    it('should return empty array when no active session', () => {
      const interactions = service.getLastInteractions(5);
      expect(interactions).toEqual([]);
    });

    it('should respect count limit', () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      for (let i = 0; i < 10; i++) {
        session.prompts.push(createTestPrompt(`p${i}`, 's1'));
      }
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      const interactions = service.getLastInteractions(3);

      expect(interactions.length).toBe(3);
    });
  });
});
