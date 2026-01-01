/**
 * SessionPersistenceService Tests (TDD)
 *
 * Tests for session state persistence:
 * - Serialize/deserialize round-trips
 * - Load state handling
 * - Save state
 * - Project deduplication by path
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtensionContext } from 'vscode';
import { SessionPersistenceService } from '../SessionPersistenceService';
import type {
  Project,
  Session,
  PromptRecord,
  ResponseRecord,
  SessionManagerState,
  SessionDetectionConfig,
} from '../../types/session-types';
import { STORAGE_KEYS } from '../types';

describe('SessionPersistenceService', () => {
  let service: SessionPersistenceService;
  let globalStateStore: Map<string, unknown>;
  let mockContext: ExtensionContext;
  let projects: Map<string, Project>;
  let config: SessionDetectionConfig;

  beforeEach(() => {
    globalStateStore = new Map();
    mockContext = {
      globalState: {
        get: vi.fn((key: string, defaultValue?: unknown) => {
          const value = globalStateStore.get(key);
          return value !== undefined ? value : defaultValue;
        }),
        update: vi.fn(async (key: string, value: unknown) => {
          globalStateStore.set(key, value);
        }),
      },
    } as unknown as ExtensionContext;

    projects = new Map();
    config = { maxInactivityMinutes: 120, minPromptsForSession: 1 };

    service = new SessionPersistenceService({
      context: mockContext,
      projects,
      config,
    });
  });

  describe('serializePrompt / deserializePrompt', () => {
    it('should round-trip a prompt correctly', () => {
      const prompt: PromptRecord = {
        id: 'prompt-1',
        sessionId: 'session-1',
        text: 'Test prompt',
        truncatedText: 'Test...',
        timestamp: new Date('2024-01-15T10:30:00Z'),
        score: 7.5,
      };

      const serialized = service.serializePrompt(prompt);
      expect(serialized.timestamp).toBe('2024-01-15T10:30:00.000Z');

      const deserialized = service.deserializePrompt(serialized);
      expect(deserialized.id).toBe(prompt.id);
      expect(deserialized.timestamp).toEqual(prompt.timestamp);
      expect(deserialized.score).toBe(prompt.score);
    });

    it('should preserve breakdown in round-trip', () => {
      const prompt: PromptRecord = {
        id: 'prompt-1',
        sessionId: 'session-1',
        text: 'Test',
        truncatedText: 'Test',
        timestamp: new Date(),
        score: 8,
        breakdown: {
          specificity: { score: 8, weight: 0.2 },
          context: { score: 7, weight: 0.25 },
          intent: { score: 9, weight: 0.25 },
          actionability: { score: 8, weight: 0.15 },
          constraints: { score: 7, weight: 0.15 },
          total: 7.85,
        },
      };

      const serialized = service.serializePrompt(prompt);
      const deserialized = service.deserializePrompt(serialized);

      expect(deserialized.breakdown).toEqual(prompt.breakdown);
    });
  });

  describe('serializeResponse / deserializeResponse', () => {
    it('should round-trip a response correctly', () => {
      const response: ResponseRecord = {
        id: 'response-1',
        promptId: 'prompt-1',
        timestamp: new Date('2024-01-15T10:31:00Z'),
        text: 'Response text',
        outcome: 'success',
        filesModified: ['file1.ts', 'file2.ts'],
        toolCalls: ['edit', 'bash'],
        source: 'cursor',
      };

      const serialized = service.serializeResponse(response);
      expect(serialized.timestamp).toBe('2024-01-15T10:31:00.000Z');

      const deserialized = service.deserializeResponse(serialized);
      expect(deserialized.id).toBe(response.id);
      expect(deserialized.timestamp).toEqual(response.timestamp);
      expect(deserialized.filesModified).toEqual(response.filesModified);
    });
  });

  describe('serializeSession / deserializeSession', () => {
    it('should round-trip a session correctly', () => {
      const session: Session = {
        id: 'session-1',
        projectId: 'project-1',
        platform: 'cursor',
        startTime: new Date('2024-01-15T09:00:00Z'),
        lastActivityTime: new Date('2024-01-15T10:30:00Z'),
        promptCount: 5,
        prompts: [],
        responses: [],
        isActive: true,
        averageScore: 7.5,
      };

      const serialized = service.serializeSession(session);
      expect(serialized.startTime).toBe('2024-01-15T09:00:00.000Z');
      expect(serialized.lastActivityTime).toBe('2024-01-15T10:30:00.000Z');

      const deserialized = service.deserializeSession(serialized);
      expect(deserialized.id).toBe(session.id);
      expect(deserialized.startTime).toEqual(session.startTime);
      expect(deserialized.lastActivityTime).toEqual(session.lastActivityTime);
    });

    it('should handle session with goal dates', () => {
      const session: Session = {
        id: 'session-1',
        projectId: 'project-1',
        platform: 'cursor',
        startTime: new Date('2024-01-15T09:00:00Z'),
        lastActivityTime: new Date('2024-01-15T10:30:00Z'),
        promptCount: 5,
        prompts: [],
        responses: [],
        isActive: false,
        goal: 'Implement feature X',
        goalSetAt: new Date('2024-01-15T09:05:00Z'),
        goalCompletedAt: new Date('2024-01-15T10:00:00Z'),
      };

      const serialized = service.serializeSession(session);
      const deserialized = service.deserializeSession(serialized);

      expect(deserialized.goal).toBe(session.goal);
      expect(deserialized.goalSetAt).toEqual(session.goalSetAt);
      expect(deserialized.goalCompletedAt).toEqual(session.goalCompletedAt);
    });

    it('should handle session with prompts and responses', () => {
      const session: Session = {
        id: 'session-1',
        projectId: 'project-1',
        platform: 'cursor',
        startTime: new Date('2024-01-15T09:00:00Z'),
        lastActivityTime: new Date('2024-01-15T10:30:00Z'),
        promptCount: 1,
        prompts: [{
          id: 'prompt-1',
          sessionId: 'session-1',
          text: 'Test',
          truncatedText: 'Test',
          timestamp: new Date('2024-01-15T09:01:00Z'),
          score: 7,
        }],
        responses: [{
          id: 'response-1',
          promptId: 'prompt-1',
          timestamp: new Date('2024-01-15T09:02:00Z'),
          text: 'Done',
          outcome: 'success',
          filesModified: [],
          toolCalls: [],
          source: 'cursor',
        }],
        isActive: true,
      };

      const serialized = service.serializeSession(session);
      const deserialized = service.deserializeSession(serialized);

      expect(deserialized.prompts.length).toBe(1);
      expect(deserialized.prompts[0].timestamp).toEqual(session.prompts[0].timestamp);
      expect(deserialized.responses.length).toBe(1);
      expect(deserialized.responses[0].timestamp).toEqual(session.responses[0].timestamp);
    });
  });

  describe('serializeProject / deserializeProject', () => {
    it('should round-trip a project correctly', () => {
      const project: Project = {
        id: 'project-1',
        name: 'my-project',
        path: '/Users/test/my-project',
        sessions: [],
        isExpanded: true,
        totalSessions: 5,
        totalPrompts: 25,
        lastActivityTime: new Date('2024-01-15T10:30:00Z'),
      };

      const serialized = service.serializeProject(project);
      expect(serialized.lastActivityTime).toBe('2024-01-15T10:30:00.000Z');

      const deserialized = service.deserializeProject(serialized);
      expect(deserialized.id).toBe(project.id);
      expect(deserialized.name).toBe(project.name);
      expect(deserialized.path).toBe(project.path);
      expect(deserialized.lastActivityTime).toEqual(project.lastActivityTime);
    });

    it('should handle project without lastActivityTime', () => {
      const project: Project = {
        id: 'project-1',
        name: 'new-project',
        sessions: [],
        isExpanded: true,
        totalSessions: 0,
        totalPrompts: 0,
      };

      const serialized = service.serializeProject(project);
      expect(serialized.lastActivityTime).toBeUndefined();

      const deserialized = service.deserializeProject(serialized);
      expect(deserialized.lastActivityTime).toBeUndefined();
    });
  });

  describe('loadState', () => {
    it('should handle empty state (no persisted data)', async () => {
      const result = await service.loadState();

      expect(result.loaded).toBe(false);
      expect(projects.size).toBe(0);
    });

    it('should load valid persisted state', async () => {
      const savedState: SessionManagerState = {
        projects: [{
          id: 'project-1',
          name: 'test-project',
          path: '/Users/test/project',
          sessions: [],
          isExpanded: true,
          totalSessions: 1,
          totalPrompts: 5,
          lastActivityTime: '2024-01-15T10:00:00.000Z',
        }],
        activeSessionId: 'session-1',
        activeProjectId: 'project-1',
        config: { maxInactivityMinutes: 60, minPromptsForSession: 2 },
        lastUpdated: '2024-01-15T11:00:00.000Z',
      };
      globalStateStore.set(STORAGE_KEYS.SESSION_STATE, savedState);

      const result = await service.loadState();

      expect(result.loaded).toBe(true);
      expect(result.activeSessionId).toBe('session-1');
      expect(result.activeProjectId).toBe('project-1');
      expect(projects.size).toBe(1);
      expect(projects.get('project-1')?.name).toBe('test-project');
    });

    it('should handle corrupted state gracefully', async () => {
      globalStateStore.set(STORAGE_KEYS.SESSION_STATE, 'not-valid-json-object');

      const result = await service.loadState();

      expect(result.loaded).toBe(false);
      expect(projects.size).toBe(0);
    });

    it('should deduplicate projects by path', async () => {
      const savedState: SessionManagerState = {
        projects: [
          {
            id: 'project-1',
            name: 'my-project-v1',
            path: '/Users/test/my-project',
            sessions: [{
              id: 'session-1',
              projectId: 'project-1',
              platform: 'cursor',
              startTime: '2024-01-15T09:00:00.000Z',
              lastActivityTime: '2024-01-15T10:00:00.000Z',
              promptCount: 3,
              prompts: [],
              responses: [],
              isActive: false,
            }],
            isExpanded: true,
            totalSessions: 1,
            totalPrompts: 3,
            lastActivityTime: '2024-01-15T10:00:00.000Z',
          },
          {
            id: 'project-2',
            name: 'my-project-v2',
            path: '/Users/test/my-project', // Same path!
            sessions: [{
              id: 'session-2',
              projectId: 'project-2',
              platform: 'claude_code',
              startTime: '2024-01-15T11:00:00.000Z',
              lastActivityTime: '2024-01-15T12:00:00.000Z',
              promptCount: 2,
              prompts: [],
              responses: [],
              isActive: true,
            }],
            isExpanded: true,
            totalSessions: 1,
            totalPrompts: 2,
            lastActivityTime: '2024-01-15T12:00:00.000Z',
          },
        ],
        activeSessionId: 'session-2',
        activeProjectId: 'project-2',
        config: { maxInactivityMinutes: 120, minPromptsForSession: 1 },
        lastUpdated: '2024-01-15T12:00:00.000Z',
      };
      globalStateStore.set(STORAGE_KEYS.SESSION_STATE, savedState);

      const result = await service.loadState();

      // Should deduplicate to 1 project
      expect(result.loaded).toBe(true);
      expect(result.deduplicated).toBe(true);
      expect(projects.size).toBe(1);

      // The kept project should have both sessions merged
      const keptProject = projects.get('project-1');
      expect(keptProject).toBeDefined();
      expect(keptProject!.sessions.length).toBe(2);
      expect(keptProject!.totalPrompts).toBe(5); // 3 + 2
    });

    it('should handle case-insensitive path deduplication', async () => {
      const savedState: SessionManagerState = {
        projects: [
          {
            id: 'project-1',
            name: 'Project Lower',
            path: '/users/test/project',
            sessions: [],
            isExpanded: true,
            totalSessions: 0,
            totalPrompts: 0,
          },
          {
            id: 'project-2',
            name: 'Project Upper',
            path: '/Users/Test/Project', // Same path different case
            sessions: [],
            isExpanded: true,
            totalSessions: 0,
            totalPrompts: 0,
          },
        ],
        activeSessionId: null,
        activeProjectId: null,
        config: { maxInactivityMinutes: 120, minPromptsForSession: 1 },
        lastUpdated: '2024-01-15T12:00:00.000Z',
      };
      globalStateStore.set(STORAGE_KEYS.SESSION_STATE, savedState);

      const result = await service.loadState();

      expect(result.loaded).toBe(true);
      expect(projects.size).toBe(1);
    });
  });

  describe('saveState', () => {
    it('should save current state to globalState', async () => {
      const project: Project = {
        id: 'project-1',
        name: 'test-project',
        path: '/Users/test/project',
        sessions: [],
        isExpanded: true,
        totalSessions: 0,
        totalPrompts: 0,
      };
      projects.set('project-1', project);

      await service.saveState('session-1', 'project-1');

      const savedState = globalStateStore.get(STORAGE_KEYS.SESSION_STATE) as SessionManagerState;
      expect(savedState).toBeDefined();
      expect(savedState.projects.length).toBe(1);
      expect(savedState.projects[0].id).toBe('project-1');
      expect(savedState.activeSessionId).toBe('session-1');
      expect(savedState.activeProjectId).toBe('project-1');
      expect(savedState.lastUpdated).toBeDefined();
    });

    it('should serialize dates correctly in saved state', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      const project: Project = {
        id: 'project-1',
        name: 'test-project',
        sessions: [{
          id: 'session-1',
          projectId: 'project-1',
          platform: 'cursor',
          startTime: now,
          lastActivityTime: now,
          promptCount: 1,
          prompts: [{
            id: 'prompt-1',
            sessionId: 'session-1',
            text: 'Test',
            truncatedText: 'Test',
            timestamp: now,
            score: 7,
          }],
          responses: [],
          isActive: true,
        }],
        isExpanded: true,
        totalSessions: 1,
        totalPrompts: 1,
        lastActivityTime: now,
      };
      projects.set('project-1', project);

      await service.saveState(null, null);

      const savedState = globalStateStore.get(STORAGE_KEYS.SESSION_STATE) as SessionManagerState;
      expect(savedState.projects[0].lastActivityTime).toBe('2024-01-15T10:00:00.000Z');
      expect(savedState.projects[0].sessions[0].startTime).toBe('2024-01-15T10:00:00.000Z');
      expect(savedState.projects[0].sessions[0].prompts[0].timestamp).toBe('2024-01-15T10:00:00.000Z');
    });
  });

  describe('UI state persistence', () => {
    it('should save and get sidebar width', async () => {
      await service.saveSidebarWidth(300);

      const width = service.getSidebarWidth();
      expect(width).toBe(300);
    });

    it('should return default sidebar width when not set', () => {
      const width = service.getSidebarWidth();
      expect(width).toBe(240);
    });
  });

  describe('normalizePath', () => {
    it('should normalize path to lowercase', () => {
      expect(service.normalizePath('/Users/Test/Project')).toBe('/users/test/project');
    });

    it('should convert backslashes to forward slashes', () => {
      expect(service.normalizePath('C:\\Users\\Test\\Project')).toBe('c:/users/test/project');
    });

    it('should remove trailing slashes', () => {
      expect(service.normalizePath('/users/test/project/')).toBe('/users/test/project');
      expect(service.normalizePath('/users/test/project///')).toBe('/users/test/project');
    });

    it('should trim whitespace', () => {
      expect(service.normalizePath('  /users/test/project  ')).toBe('/users/test/project');
    });
  });
});
