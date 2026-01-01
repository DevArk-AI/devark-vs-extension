/**
 * SessionLifecycleService Tests (TDD)
 *
 * Tests for session lifecycle management:
 * - Session creation and retrieval
 * - Activity checking
 * - Session switching
 * - Goal management
 * - Session editing and deletion
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionLifecycleService } from '../SessionLifecycleService';
import type { Project, Session, SessionDetectionConfig } from '../../types/session-types';
import { generateId } from '../../types/session-types';

describe('SessionLifecycleService', () => {
  let service: SessionLifecycleService;
  let projects: Map<string, Project>;
  let config: SessionDetectionConfig;
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

  beforeEach(() => {
    vi.clearAllMocks();
    projects = new Map();
    config = { maxInactivityMinutes: 120, minPromptsForSession: 1 };
    emitEvent = vi.fn();
    saveState = vi.fn().mockResolvedValue(undefined);
    activeSessionId = null;
    activeProjectId = null;

    service = new SessionLifecycleService({
      projects,
      config,
      emitEvent,
      saveState,
      getActiveSessionId: () => activeSessionId,
      setActiveSessionId: (id) => { activeSessionId = id; },
      getActiveProjectId: () => activeProjectId,
      setActiveProjectId: (id) => { activeProjectId = id; },
    });
  });

  describe('isSessionStillActive', () => {
    it('should return true for recent activity', () => {
      const session = createTestSession('s1', 'p1', {
        lastActivityTime: new Date(), // Just now
      });

      expect(service.isSessionStillActive(session)).toBe(true);
    });

    it('should return false for old activity beyond config timeout', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const session = createTestSession('s1', 'p1', {
        lastActivityTime: threeHoursAgo,
      });

      expect(service.isSessionStillActive(session)).toBe(false);
    });

    it('should respect config timeout setting', () => {
      config.maxInactivityMinutes = 30;
      const fortyFiveMinsAgo = new Date(Date.now() - 45 * 60 * 1000);
      const session = createTestSession('s1', 'p1', {
        lastActivityTime: fortyFiveMinsAgo,
      });

      expect(service.isSessionStillActive(session)).toBe(false);

      // Activity within 30 mins should be active
      const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
      session.lastActivityTime = twentyMinsAgo;
      expect(service.isSessionStillActive(session)).toBe(true);
    });
  });

  describe('createSession', () => {
    it('should create session with correct properties and generated sourceSessionId', () => {
      const session = service.createSession('proj-1', 'cursor');

      expect(session.projectId).toBe('proj-1');
      expect(session.platform).toBe('cursor');
      expect(session.isActive).toBe(true);
      expect(session.prompts).toEqual([]);
      expect(session.responses).toEqual([]);
      expect(session.promptCount).toBe(0);
      expect(session.startTime).toBeInstanceOf(Date);
      expect(session.lastActivityTime).toBeInstanceOf(Date);
      expect(session.metadata?.sourceSessionId).toBeDefined();
      expect(session.metadata?.sourceSessionId).toMatch(/^generated-/);
    });

    it('should use provided sourceSessionId when given', () => {
      const session = service.createSession('proj-1', 'claude_code', 'source-123');

      expect(session.metadata?.sourceSessionId).toBe('source-123');
    });

    it('should generate unique session IDs', () => {
      const s1 = service.createSession('proj-1', 'cursor');
      const s2 = service.createSession('proj-1', 'cursor');

      expect(s1.id).not.toBe(s2.id);
    });
  });

  describe('getOrCreateSession', () => {
    it('should return existing active session for same platform', () => {
      const project = createTestProject('p1', 'test');
      const existingSession = createTestSession('s1', 'p1');
      project.sessions.push(existingSession);
      projects.set('p1', project);

      const result = service.getOrCreateSession('p1', 'cursor');

      expect(result.id).toBe('s1');
      expect(project.sessions.length).toBe(1); // No new session created
    });

    it('should create new session for different platform', () => {
      const project = createTestProject('p1', 'test');
      const existingSession = createTestSession('s1', 'p1', { platform: 'cursor' });
      project.sessions.push(existingSession);
      projects.set('p1', project);

      const result = service.getOrCreateSession('p1', 'claude_code');

      expect(result.id).not.toBe('s1');
      expect(result.platform).toBe('claude_code');
      expect(project.sessions.length).toBe(2);
    });

    it('should create new session when existing is stale', () => {
      const project = createTestProject('p1', 'test');
      const staleSession = createTestSession('s1', 'p1', {
        lastActivityTime: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
      });
      project.sessions.push(staleSession);
      projects.set('p1', project);

      const result = service.getOrCreateSession('p1', 'cursor');

      expect(result.id).not.toBe('s1');
      expect(staleSession.isActive).toBe(false);
      expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'session_ended',
        sessionId: 's1',
      }));
    });

    it('should throw error for non-existent project', () => {
      expect(() => service.getOrCreateSession('nonexistent', 'cursor'))
        .toThrow('Project not found');
    });

    it('should match by sourceSessionId when provided', () => {
      const project = createTestProject('p1', 'test');
      const sessionA = createTestSession('s1', 'p1', {
        metadata: { sourceSessionId: 'source-A' },
      });
      const sessionB = createTestSession('s2', 'p1', {
        metadata: { sourceSessionId: 'source-B' },
      });
      project.sessions.push(sessionA, sessionB);
      projects.set('p1', project);

      const result = service.getOrCreateSession('p1', 'cursor', 'source-A');
      expect(result.id).toBe('s1');
    });

    it('should NOT reuse session without sourceSessionId when sourceSessionId is provided', () => {
      const project = createTestProject('p1', 'test');
      const sessionWithoutSource = createTestSession('s1', 'p1', {
        metadata: {},
      });
      project.sessions.push(sessionWithoutSource);
      projects.set('p1', project);

      const result = service.getOrCreateSession('p1', 'cursor', 'new-source-123');

      expect(result.id).not.toBe('s1');
      expect(result.metadata?.sourceSessionId).toBe('new-source-123');
    });

    it('should emit session_created event for new session', () => {
      const project = createTestProject('p1', 'test');
      projects.set('p1', project);

      service.getOrCreateSession('p1', 'cursor');

      expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'session_created',
        projectId: 'p1',
      }));
    });
  });

  describe('getActiveSession', () => {
    it('should return null when no active session', () => {
      expect(service.getActiveSession()).toBeNull();
    });

    it('should return active session when set', () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      const result = service.getActiveSession();
      expect(result).toBe(session);
    });

    it('should return null when project not found', () => {
      activeSessionId = 's1';
      activeProjectId = 'nonexistent';

      expect(service.getActiveSession()).toBeNull();
    });
  });

  describe('getActiveProject', () => {
    it('should return null when no active project', () => {
      expect(service.getActiveProject()).toBeNull();
    });

    it('should return active project when set', () => {
      const project = createTestProject('p1', 'test');
      projects.set('p1', project);
      activeProjectId = 'p1';

      const result = service.getActiveProject();
      expect(result).toBe(project);
    });
  });

  describe('findSessionBySourceId', () => {
    it('should find session by sourceSessionId', () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1', {
        metadata: { sourceSessionId: 'source-123' },
      });
      project.sessions.push(session);
      projects.set('p1', project);

      const result = service.findSessionBySourceId('source-123');
      expect(result).toBe(session);
    });

    it('should find session by cursorComposerId', () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1', {
        metadata: { cursorComposerId: 'composer-456' },
      });
      project.sessions.push(session);
      projects.set('p1', project);

      const result = service.findSessionBySourceId('composer-456');
      expect(result).toBe(session);
    });

    it('should return null when not found', () => {
      expect(service.findSessionBySourceId('nonexistent')).toBeNull();
    });
  });

  describe('switchSession', () => {
    it('should switch to existing session', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);

      const result = await service.switchSession('s1');

      expect(result).toBe(session);
      expect(activeSessionId).toBe('s1');
      expect(activeProjectId).toBe('p1');
      expect(saveState).toHaveBeenCalled();
    });

    it('should clear unread flag when switching', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1', { hasUnreadActivity: true });
      project.sessions.push(session);
      projects.set('p1', project);

      await service.switchSession('s1');

      expect(session.hasUnreadActivity).toBe(false);
    });

    it('should return null for non-existent session', async () => {
      const result = await service.switchSession('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('markSessionAsRead', () => {
    it('should clear unread flag', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1', { hasUnreadActivity: true });
      project.sessions.push(session);
      projects.set('p1', project);

      await service.markSessionAsRead('s1');

      expect(session.hasUnreadActivity).toBe(false);
      expect(saveState).toHaveBeenCalled();
      expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'session_updated',
        sessionId: 's1',
        data: { hasUnreadActivity: false },
      }));
    });

    it('should do nothing for session without unread flag', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1', { hasUnreadActivity: false });
      project.sessions.push(session);
      projects.set('p1', project);

      await service.markSessionAsRead('s1');

      expect(saveState).not.toHaveBeenCalled();
    });
  });

  describe('endCurrentSession', () => {
    it('should mark active session as inactive', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      await service.endCurrentSession();

      expect(session.isActive).toBe(false);
      expect(activeSessionId).toBeNull();
      expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'session_ended',
        sessionId: 's1',
      }));
    });

    it('should do nothing when no active session', async () => {
      await service.endCurrentSession();
      expect(emitEvent).not.toHaveBeenCalled();
    });
  });

  describe('setGoal / completeGoal', () => {
    it('should set goal on active session', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      await service.setGoal('Implement feature X');

      expect(session.goal).toBe('Implement feature X');
      expect(session.goalSetAt).toBeInstanceOf(Date);
      expect(session.goalCompletedAt).toBeUndefined();
      expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'goal_set',
        data: { goal: 'Implement feature X' },
      }));
    });

    it('should throw when setting goal without active session', async () => {
      await expect(service.setGoal('Test')).rejects.toThrow('No active session');
    });

    it('should complete goal on active session', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1', { goal: 'Test goal' });
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      await service.completeGoal();

      expect(session.goalCompletedAt).toBeInstanceOf(Date);
      expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'goal_completed',
      }));
    });

    it('should throw when completing goal without active session or goal', async () => {
      await expect(service.completeGoal()).rejects.toThrow('No active session or goal');
    });
  });

  describe('updateSession', () => {
    it('should update session properties', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);

      await service.updateSession('s1', { customName: 'My Session' });

      expect(session.customName).toBe('My Session');
      expect(saveState).toHaveBeenCalled();
      expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'session_updated',
        sessionId: 's1',
      }));
    });

    it('should not allow updating protected fields', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      session.prompts = [{ id: 'prompt-1', sessionId: 's1', text: 'test', truncatedText: 'test', timestamp: new Date(), score: 5 }];
      project.sessions.push(session);
      projects.set('p1', project);

      await service.updateSession('s1', {
        id: 'new-id',
        projectId: 'new-project',
        prompts: [],
      } as Partial<Session>);

      // Protected fields should not change
      expect(session.id).toBe('s1');
      expect(session.projectId).toBe('p1');
      expect(session.prompts.length).toBe(1);
    });

    it('should throw for non-existent session', async () => {
      await expect(service.updateSession('nonexistent', {}))
        .rejects.toThrow('Session nonexistent not found');
    });
  });

  describe('deleteSession', () => {
    it('should delete session from project', async () => {
      const project = createTestProject('p1', 'test');
      project.totalSessions = 1;
      project.totalPrompts = 5;
      const session = createTestSession('s1', 'p1', { promptCount: 5 });
      project.sessions.push(session);
      projects.set('p1', project);

      await service.deleteSession('s1');

      expect(project.sessions.length).toBe(0);
      expect(project.totalSessions).toBe(0);
      expect(project.totalPrompts).toBe(0);
      expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'session_deleted',
        sessionId: 's1',
      }));
    });

    it('should clear active session if deleted', async () => {
      const project = createTestProject('p1', 'test');
      const session = createTestSession('s1', 'p1');
      project.sessions.push(session);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      await service.deleteSession('s1');

      expect(activeSessionId).toBeNull();
    });

    it('should set new active session from same project if available', async () => {
      const project = createTestProject('p1', 'test');
      const session1 = createTestSession('s1', 'p1');
      const session2 = createTestSession('s2', 'p1');
      project.sessions.push(session1, session2);
      projects.set('p1', project);
      activeSessionId = 's1';
      activeProjectId = 'p1';

      await service.deleteSession('s1');

      expect(activeSessionId).toBe('s2');
    });

    it('should throw for non-existent session', async () => {
      await expect(service.deleteSession('nonexistent'))
        .rejects.toThrow('Session nonexistent not found');
    });
  });
});
