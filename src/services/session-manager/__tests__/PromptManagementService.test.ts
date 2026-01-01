/**
 * PromptManagementService Tests (TDD)
 *
 * Tests for prompt management:
 * - Adding prompts to sessions
 * - Updating prompt scores
 * - Pagination
 * - MAX_PROMPTS_PER_SESSION limit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptManagementService } from '../PromptManagementService';
import type { Project, Session, PromptRecord, ScoreBreakdown } from '../../types/session-types';

describe('PromptManagementService', () => {
  let service: PromptManagementService;
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

  const createTestPrompt = (id: string, sessionId: string, overrides?: Partial<PromptRecord>): PromptRecord => ({
    id,
    sessionId,
    text: 'Test prompt',
    truncatedText: 'Test...',
    timestamp: new Date(),
    score: 5,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    projects = new Map();
    emitEvent = vi.fn();
    saveState = vi.fn().mockResolvedValue(undefined);
    activeSessionId = null;
    activeProjectId = null;

    service = new PromptManagementService({
      projects,
      emitEvent,
      saveState,
      getActiveSession: () => {
        if (!activeSessionId || !activeProjectId) return null;
        const project = projects.get(activeProjectId);
        if (!project) return null;
        return project.sessions.find(s => s.id === activeSessionId) || null;
      },
      getActiveProject: () => {
        if (!activeProjectId) return null;
        return projects.get(activeProjectId) || null;
      },
    });
  });

  describe('calculateAverageScore', () => {
    it('should return 0 for empty prompts', () => {
      expect(service.calculateAverageScore([])).toBe(0);
    });

    it('should calculate correct average', () => {
      const prompts: PromptRecord[] = [
        createTestPrompt('p1', 's1', { score: 6 }),
        createTestPrompt('p2', 's1', { score: 8 }),
        createTestPrompt('p3', 's1', { score: 7 }),
      ];
      expect(service.calculateAverageScore(prompts)).toBe(7); // (6+8+7)/3 = 7
    });

    it('should round to one decimal place', () => {
      const prompts: PromptRecord[] = [
        createTestPrompt('p1', 's1', { score: 7 }),
        createTestPrompt('p2', 's1', { score: 8 }),
      ];
      expect(service.calculateAverageScore(prompts)).toBe(7.5); // (7+8)/2 = 7.5
    });
  });

  describe('addPrompt', () => {
    it('should add prompt to active session', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      const result = await service.addPrompt('Test prompt text', 7.5);

      expect(result.text).toBe('Test prompt text');
      expect(result.score).toBe(7.5);
      expect(session.prompts.length).toBe(1);
      expect(session.promptCount).toBe(1);
      expect(project.totalPrompts).toBe(1);
      expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'prompt_added',
      }));
    });

    it('should add prompt with breakdown', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      const breakdown: ScoreBreakdown = {
        specificity: { score: 8, weight: 0.2 },
        context: { score: 7, weight: 0.25 },
        intent: { score: 9, weight: 0.25 },
        actionability: { score: 8, weight: 0.15 },
        constraints: { score: 6, weight: 0.15 },
        total: 7.6,
      };

      const result = await service.addPrompt('Test', 7.6, breakdown);

      expect(result.breakdown).toEqual(breakdown);
    });

    it('should add prompts to beginning of array (most recent first)', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      await service.addPrompt('First prompt', 5);
      await service.addPrompt('Second prompt', 7);

      expect(session.prompts[0].text).toBe('Second prompt');
      expect(session.prompts[1].text).toBe('First prompt');
    });

    it('should truncate prompts array at MAX_PROMPTS_PER_SESSION', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      // Add 105 prompts (MAX is 100)
      for (let i = 0; i < 105; i++) {
        await service.addPrompt(`Prompt ${i}`, 5);
      }

      expect(session.prompts.length).toBe(100);
      expect(session.prompts[0].text).toBe('Prompt 104'); // Most recent
    });

    it('should update session averageScore', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      await service.addPrompt('First', 6);
      await service.addPrompt('Second', 8);

      expect(session.averageScore).toBe(7);
    });

    it('should throw when no active session', async () => {
      await expect(service.addPrompt('Test', 5)).rejects.toThrow('No workspace detected');
    });

    it('should use custom id from options', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      const result = await service.addPrompt('Test prompt', 5, undefined, { id: 'custom-id-123' });

      expect(result.id).toBe('custom-id-123');
    });

    it('should use custom timestamp from options', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      const customTimestamp = new Date('2024-01-15T10:30:00Z');
      const result = await service.addPrompt('Test prompt', 5, undefined, { timestamp: customTimestamp });

      expect(result.timestamp).toBe(customTimestamp);
      expect(session.lastActivityTime).toBe(customTimestamp);
    });

    it('should use custom truncateLength from options', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      const longText = 'A'.repeat(300);
      const result = await service.addPrompt(longText, 5, undefined, { truncateLength: 200 });

      expect(result.truncatedText.length).toBeLessThanOrEqual(203); // 200 + "..."
      expect(result.truncatedText.length).toBeGreaterThan(103); // more than default 100 + "..."
    });
  });

  describe('addPromptToSession', () => {
    it('should add prompt to specific session', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);

      const result = await service.addPromptToSession(session, project, 'Direct add', 7);

      expect(result.text).toBe('Direct add');
      expect(result.score).toBe(7);
      expect(session.prompts.length).toBe(1);
      expect(session.promptCount).toBe(1);
      expect(project.totalPrompts).toBe(1);
    });

    it('should use all options when provided', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);

      const customTimestamp = new Date('2024-06-01T12:00:00Z');
      const longText = 'B'.repeat(250);

      const result = await service.addPromptToSession(
        session,
        project,
        longText,
        0,
        undefined,
        { id: 'my-custom-id', timestamp: customTimestamp, truncateLength: 200 }
      );

      expect(result.id).toBe('my-custom-id');
      expect(result.timestamp).toBe(customTimestamp);
      expect(result.truncatedText.length).toBeLessThanOrEqual(203);
    });
  });

  describe('updatePromptScore', () => {
    it('should update existing prompt score', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      const prompt = createTestPrompt('prompt-1', 's1', { score: 0 });
      session.prompts.push(prompt);
      project.sessions.push(session);
      projects.set('p1', project);

      await service.updatePromptScore('prompt-1', 8.5);

      expect(prompt.score).toBe(8.5);
      expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'prompt_updated',
        promptId: 'prompt-1',
      }));
    });

    it('should update prompt with breakdown', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      const prompt = createTestPrompt('prompt-1', 's1');
      session.prompts.push(prompt);
      project.sessions.push(session);
      projects.set('p1', project);

      const breakdown: ScoreBreakdown = {
        specificity: { score: 9, weight: 0.2 },
        context: { score: 8, weight: 0.25 },
        intent: { score: 9, weight: 0.25 },
        actionability: { score: 7, weight: 0.15 },
        constraints: { score: 8, weight: 0.15 },
        total: 8.4,
      };

      await service.updatePromptScore('prompt-1', 8.4, breakdown);

      expect(prompt.breakdown).toEqual(breakdown);
    });

    it('should update enhanced text and score', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      const prompt = createTestPrompt('prompt-1', 's1');
      session.prompts.push(prompt);
      project.sessions.push(session);
      projects.set('p1', project);

      await service.updatePromptScore('prompt-1', 7, undefined, 'Enhanced version', 9.5);

      expect(prompt.enhancedText).toBe('Enhanced version');
      expect(prompt.enhancedScore).toBe(9.5);
    });

    it('should recalculate session averageScore', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      session.prompts.push(
        createTestPrompt('p1', 's1', { score: 6 }),
        createTestPrompt('p2', 's1', { score: 8 }),
      );
      project.sessions.push(session);
      projects.set('p1', project);

      await service.updatePromptScore('p1', 10); // Change 6 -> 10

      expect(session.averageScore).toBe(9); // (10+8)/2
    });

    it('should do nothing for non-existent prompt', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);

      await service.updatePromptScore('nonexistent', 5);

      expect(emitEvent).not.toHaveBeenCalled();
    });
  });

  describe('getPrompts', () => {
    it('should return paginated prompts', () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      for (let i = 0; i < 25; i++) {
        session.prompts.push(createTestPrompt(`p${i}`, 's1'));
      }
      project.sessions.push(session);
      projects.set('p1', project);

      const result = service.getPrompts({ sessionId: 's1', offset: 0, limit: 10 });

      expect(result.prompts.length).toBe(10);
      expect(result.total).toBe(25);
      expect(result.hasMore).toBe(true);
      expect(result.offset).toBe(0);
      expect(result.limit).toBe(10);
    });

    it('should handle offset correctly', () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      for (let i = 0; i < 25; i++) {
        session.prompts.push(createTestPrompt(`p${i}`, 's1'));
      }
      project.sessions.push(session);
      projects.set('p1', project);

      const result = service.getPrompts({ sessionId: 's1', offset: 20, limit: 10 });

      expect(result.prompts.length).toBe(5);
      expect(result.hasMore).toBe(false);
    });

    it('should return empty for non-existent session', () => {
      const result = service.getPrompts({ sessionId: 'nonexistent', offset: 0, limit: 10 });

      expect(result.prompts).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getActiveSessionPrompts', () => {
    it('should return prompts from active session', () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      for (let i = 0; i < 15; i++) {
        session.prompts.push(createTestPrompt(`p${i}`, 's1'));
      }
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      const result = service.getActiveSessionPrompts(10);

      expect(result.prompts.length).toBe(10);
      expect(result.total).toBe(15);
    });

    it('should return empty when no active session', () => {
      const result = service.getActiveSessionPrompts();

      expect(result.prompts).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
