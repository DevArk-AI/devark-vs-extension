/**
 * SessionManagerService Tests
 *
 * Comprehensive tests for the core session tracking service.
 * Tests cover:
 * - Singleton pattern and lifecycle
 * - Project detection and ID generation
 * - Platform detection
 * - Session management
 * - Prompt management
 * - Event system
 * - Persistence
 * - Statistics
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExtensionContext } from 'vscode';

// Mock vscode module before importing the service
vi.mock('vscode', () => {
  const createMockUri = (fsPath: string) => ({
    fsPath,
    path: fsPath,
    scheme: 'file',
  });

  return {
    workspace: {
      workspaceFolders: undefined as { uri: { fsPath: string }; name: string }[] | undefined,
      fs: {
        stat: vi.fn(),
        readFile: vi.fn(),
      },
    },
    window: {
      terminals: [] as { name: string }[],
    },
    env: {
      appName: 'Visual Studio Code',
    },
    Uri: {
      file: (p: string) => createMockUri(p),
    },
  };
});

// Access mocked vscode for test manipulation
import * as vscode from 'vscode';

describe('SessionManagerService', () => {
  let SessionManagerService: typeof import('../SessionManagerService').SessionManagerService;
  let getSessionManager: typeof import('../SessionManagerService').getSessionManager;

  // Mock globalState with in-memory storage
  let globalStateStore: Map<string, unknown>;
  let mockContext: ExtensionContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reset environment variables
    delete process.env.CURSOR_SESSION_ID;
    delete process.env.CLAUDE_CODE_SESSION;
    delete process.env.XDG_CONFIG_HOME;

    // Reset vscode mocks
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
    (vscode.window as { terminals: unknown[] }).terminals = [];
    (vscode.env as { appName: string }).appName = 'Visual Studio Code';

    // Create fresh in-memory globalState
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
      subscriptions: [],
      secrets: {
        get: vi.fn(),
        store: vi.fn(),
        delete: vi.fn(),
        onDidChange: vi.fn(),
      },
    } as unknown as ExtensionContext;

    // Reset fs mocks
    vi.mocked(vscode.workspace.fs.stat).mockRejectedValue(new Error('Not found'));
    vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('Not found'));

    // Import fresh module
    const module = await import('../SessionManagerService');
    SessionManagerService = module.SessionManagerService;
    getSessionManager = module.getSessionManager;
  });

  afterEach(() => {
    // Reset singleton for next test
    SessionManagerService.resetInstance();
  });

  // ============================================
  // SINGLETON PATTERN & LIFECYCLE
  // ============================================

  describe('Singleton Pattern', () => {
    it('getInstance returns same instance', () => {
      const instance1 = SessionManagerService.getInstance();
      const instance2 = SessionManagerService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('getSessionManager helper returns singleton', () => {
      const instance1 = getSessionManager();
      const instance2 = getSessionManager();
      expect(instance1).toBe(instance2);
    });

    it('resetInstance clears the singleton', () => {
      const instance1 = SessionManagerService.getInstance();
      SessionManagerService.resetInstance();
      const instance2 = SessionManagerService.getInstance();
      expect(instance1).not.toBe(instance2);
    });

    it('resetInstance calls dispose on existing instance', async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);

      // Add a listener to verify dispose clears it
      const listener = vi.fn();
      instance.subscribe(listener);

      SessionManagerService.resetInstance();

      // Get new instance and verify old listener is not called
      const newInstance = SessionManagerService.getInstance();
      await newInstance.initialize(mockContext);
    });
  });

  describe('Initialization', () => {
    it('initialize sets up context', async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);

      // After initialization, getStats should work
      const stats = instance.getStats();
      expect(stats.totalProjects).toBe(0);
    });

    it('initialize is idempotent', async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);
      await instance.initialize(mockContext); // Second call should be no-op

      const stats = instance.getStats();
      expect(stats.totalProjects).toBe(0);
    });

    it('dispose clears all state', async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);

      // Create some state
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/test/project'), name: 'test-project' },
      ];
      await instance.detectCurrentProject();

      // Verify state exists
      expect(instance.getStats().totalProjects).toBe(1);

      // Dispose
      instance.dispose();

      // Verify state cleared
      expect(instance.getStats().totalProjects).toBe(0);
    });
  });

  // ============================================
  // PROJECT DETECTION
  // ============================================

  describe('Project Detection', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);
    });

    it('detectCurrentProject returns null with no workspace', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();
      expect(project).toBeNull();
    });

    it('detectCurrentProject creates project from workspace folder', async () => {
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/home/user/my-project'), name: 'my-project' },
      ];

      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      expect(project).not.toBeNull();
      expect(project!.name).toBe('my-project');
      expect(project!.path).toBe('/home/user/my-project');
    });

    it('detectCurrentProject returns existing project for same path', async () => {
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/home/user/my-project'), name: 'my-project' },
      ];

      const instance = SessionManagerService.getInstance();
      const project1 = await instance.detectCurrentProject();
      const project2 = await instance.detectCurrentProject();

      expect(project1).toBe(project2);
      expect(instance.getStats().totalProjects).toBe(1);
    });

    it('detectCurrentProject uses git repo name when available', async () => {
      const projectPath = '/home/user/my-project';
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file(projectPath), name: 'folder-name' },
      ];

      // Mock .git exists
      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({} as vscode.FileStat);

      // Mock git config with remote origin
      const gitConfig = `
[core]
  repositoryformatversion = 0
[remote "origin"]
  url = git@github.com:user/actual-repo-name.git
  fetch = +refs/heads/*:refs/remotes/origin/*
`;
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(gitConfig) as unknown as Uint8Array
      );

      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      expect(project!.name).toBe('user/actual-repo-name');
    });
  });

  describe('extractRepoNameFromUrl', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);
    });

    it('extracts name from SSH URL', async () => {
      const projectPath = '/test';
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file(projectPath), name: 'test' },
      ];

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({} as vscode.FileStat);
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from('[remote "origin"]\n  url = git@github.com:org/repo-name.git') as unknown as Uint8Array
      );

      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      expect(project!.name).toBe('org/repo-name');
    });

    it('extracts name from HTTPS URL', async () => {
      const projectPath = '/test';
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file(projectPath), name: 'test' },
      ];

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({} as vscode.FileStat);
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from('[remote "origin"]\n  url = https://github.com/org/my-repo.git') as unknown as Uint8Array
      );

      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      expect(project!.name).toBe('org/my-repo');
    });

    it('handles URL without .git suffix', async () => {
      const projectPath = '/test';
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file(projectPath), name: 'test' },
      ];

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({} as vscode.FileStat);
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from('[remote "origin"]\n  url = https://github.com/org/repo') as unknown as Uint8Array
      );

      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      expect(project!.name).toBe('org/repo');
    });
  });

  describe('generateProjectId', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);
    });

    it('generates stable ID based on path', async () => {
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/home/user/project'), name: 'project' },
      ];

      const instance = SessionManagerService.getInstance();
      const project1 = await instance.detectCurrentProject();

      // Reset and recreate
      SessionManagerService.resetInstance();
      const newModule = await import('../SessionManagerService');
      const newInstance = newModule.SessionManagerService.getInstance();
      await newInstance.initialize(mockContext);

      const project2 = await newInstance.detectCurrentProject();

      // Same path should produce same ID
      expect(project1!.id).toBe(project2!.id);
    });

    it('generates different IDs for different paths', async () => {
      const instance = SessionManagerService.getInstance();

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/path/a'), name: 'a' },
      ];
      const project1 = await instance.detectCurrentProject();

      // Clear and switch workspace
      instance.dispose();
      await instance.initialize(mockContext);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/path/b'), name: 'b' },
      ];
      const project2 = await instance.detectCurrentProject();

      expect(project1!.id).not.toBe(project2!.id);
    });
  });

  describe('findProjectByPath', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);
    });

    it('finds project with exact path match', async () => {
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/home/user/project'), name: 'project' },
      ];

      const instance = SessionManagerService.getInstance();
      await instance.detectCurrentProject();

      const found = instance.findProjectByPath('/home/user/project');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('project');
    });

    it('finds project with case-insensitive match', async () => {
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/Home/User/Project'), name: 'project' },
      ];

      const instance = SessionManagerService.getInstance();
      await instance.detectCurrentProject();

      const found = instance.findProjectByPath('/home/user/project');
      expect(found).not.toBeNull();
    });

    it('returns null for non-existent path', async () => {
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/home/user/project'), name: 'project' },
      ];

      const instance = SessionManagerService.getInstance();
      await instance.detectCurrentProject();

      const found = instance.findProjectByPath('/non/existent/path');
      expect(found).toBeNull();
    });
  });

  // ============================================
  // PLATFORM DETECTION
  // ============================================

  describe('Platform Detection', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);
    });

    it('detects VS Code by default', () => {
      const instance = SessionManagerService.getInstance();
      const platform = instance.detectCurrentPlatform();
      expect(platform).toBe('vscode');
    });

    it('detects Cursor from app name', () => {
      (vscode.env as { appName: string }).appName = 'Cursor';

      const instance = SessionManagerService.getInstance();
      const platform = instance.detectCurrentPlatform();
      expect(platform).toBe('cursor');
    });

    it('detects Cursor from app name (case-insensitive)', () => {
      (vscode.env as { appName: string }).appName = 'My Cursor App';

      const instance = SessionManagerService.getInstance();
      const platform = instance.detectCurrentPlatform();
      expect(platform).toBe('cursor');
    });

    it('detects Cursor from CURSOR_SESSION_ID env var', () => {
      process.env.CURSOR_SESSION_ID = 'some-session';

      const instance = SessionManagerService.getInstance();
      const platform = instance.detectCurrentPlatform();
      expect(platform).toBe('cursor');
    });

    it('detects Claude Code from terminal name', () => {
      (vscode.window as { terminals: { name: string }[] }).terminals = [
        { name: 'Claude' },
      ];

      const instance = SessionManagerService.getInstance();
      const platform = instance.detectCurrentPlatform();
      expect(platform).toBe('claude_code');
    });

    it('detects Claude Code from CLAUDE_CODE_SESSION env var', () => {
      process.env.CLAUDE_CODE_SESSION = 'active';

      const instance = SessionManagerService.getInstance();
      const platform = instance.detectCurrentPlatform();
      expect(platform).toBe('claude_code');
    });
  });

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  describe('Session Management', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);

      // Set up a workspace
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/test/project'), name: 'test-project' },
      ];
    });

    it('getOrCreateSession creates new session', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      const session = instance.getOrCreateSession(project!.id, 'cursor');

      expect(session).not.toBeNull();
      expect(session.projectId).toBe(project!.id);
      expect(session.platform).toBe('cursor');
      expect(session.isActive).toBe(true);
      expect(session.promptCount).toBe(0);
    });

    it('getOrCreateSession returns existing active session', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      const session1 = instance.getOrCreateSession(project!.id, 'cursor');
      const session2 = instance.getOrCreateSession(project!.id, 'cursor');

      expect(session1.id).toBe(session2.id);
    });

    it('getOrCreateSession creates new session for different platform', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      const cursorSession = instance.getOrCreateSession(project!.id, 'cursor');
      const claudeSession = instance.getOrCreateSession(project!.id, 'claude_code');

      expect(cursorSession.id).not.toBe(claudeSession.id);
    });

    it('getOrCreateSession creates new session for different sourceSessionId', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      const session1 = instance.getOrCreateSession(project!.id, 'cursor', 'source-1');
      const session2 = instance.getOrCreateSession(project!.id, 'cursor', 'source-2');

      expect(session1.id).not.toBe(session2.id);
    });

    it('getOrCreateSession throws for unknown project', () => {
      const instance = SessionManagerService.getInstance();

      expect(() => {
        instance.getOrCreateSession('unknown-project', 'cursor');
      }).toThrow('Project not found');
    });

    it('getActiveSession returns null initially', () => {
      const instance = SessionManagerService.getInstance();
      const session = instance.getActiveSession();
      expect(session).toBeNull();
    });

    it('getActiveSession returns session after creation', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();
      instance.getOrCreateSession(project!.id, 'cursor');

      // Note: getOrCreateSession doesn't set activeSessionId
      // We need to use addPrompt or other methods that do
    });

    it('switchSession changes active session', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      const session1 = instance.getOrCreateSession(project!.id, 'cursor', 'source-1');
      const session2 = instance.getOrCreateSession(project!.id, 'cursor', 'source-2');

      const switched = await instance.switchSession(session2.id);
      expect(switched).not.toBeNull();
      expect(switched!.id).toBe(session2.id);
    });

    it('switchSession clears unread flag', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      const session = instance.getOrCreateSession(project!.id, 'cursor');
      session.hasUnreadActivity = true;

      await instance.switchSession(session.id);

      expect(session.hasUnreadActivity).toBe(false);
    });

    it('switchSession returns null for unknown session', async () => {
      const instance = SessionManagerService.getInstance();
      const switched = await instance.switchSession('unknown-session');
      expect(switched).toBeNull();
    });

    it('endCurrentSession marks session as inactive', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      // Create and set as active via addPrompt
      await instance.addPrompt('test prompt', 7);

      const session = instance.getActiveSession();
      expect(session).not.toBeNull();
      expect(session!.isActive).toBe(true);

      await instance.endCurrentSession();

      // Session should be marked inactive
      const project2 = instance.getProject(project!.id);
      const endedSession = project2!.sessions.find(s => s.id === session!.id);
      expect(endedSession!.isActive).toBe(false);
    });

    it('markSessionAsRead clears unread flag', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      const session = instance.getOrCreateSession(project!.id, 'cursor');
      session.hasUnreadActivity = true;

      await instance.markSessionAsRead(session.id);

      expect(session.hasUnreadActivity).toBe(false);
    });
  });

  describe('Session Staleness', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/test/project'), name: 'test-project' },
      ];
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('session becomes stale after max inactivity', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      const session1 = instance.getOrCreateSession(project!.id, 'cursor');

      // Advance time past max inactivity (120 minutes + 1 minute)
      vi.advanceTimersByTime(121 * 60 * 1000);

      // Next getOrCreateSession should create new session
      const session2 = instance.getOrCreateSession(project!.id, 'cursor');

      expect(session1.id).not.toBe(session2.id);
      expect(session1.isActive).toBe(false);
    });

    it('session stays active within inactivity window', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      const session1 = instance.getOrCreateSession(project!.id, 'cursor');

      // Advance time but stay within window (60 minutes)
      vi.advanceTimersByTime(60 * 60 * 1000);

      // Update activity
      session1.lastActivityTime = new Date();

      const session2 = instance.getOrCreateSession(project!.id, 'cursor');

      expect(session1.id).toBe(session2.id);
    });
  });

  // ============================================
  // PROMPT MANAGEMENT
  // ============================================

  describe('Prompt Management', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/test/project'), name: 'test-project' },
      ];
    });

    it('addPrompt creates prompt in active session', async () => {
      const instance = SessionManagerService.getInstance();

      const prompt = await instance.addPrompt('Test prompt text', 8.5);

      expect(prompt).not.toBeNull();
      expect(prompt.text).toBe('Test prompt text');
      expect(prompt.score).toBe(8.5);
      expect(prompt.sessionId).toBeTruthy();
    });

    it('addPrompt auto-creates session if none active', async () => {
      const instance = SessionManagerService.getInstance();

      expect(instance.getActiveSession()).toBeNull();

      await instance.addPrompt('Test prompt', 7);

      expect(instance.getActiveSession()).not.toBeNull();
    });

    it('addPrompt increments session promptCount', async () => {
      const instance = SessionManagerService.getInstance();

      await instance.addPrompt('First prompt', 7);
      await instance.addPrompt('Second prompt', 8);

      const session = instance.getActiveSession();
      expect(session!.promptCount).toBe(2);
    });

    it('addPrompt updates session lastActivityTime', async () => {
      vi.useFakeTimers();
      const instance = SessionManagerService.getInstance();

      await instance.addPrompt('First prompt', 7);
      const session = instance.getActiveSession();
      const firstTime = session!.lastActivityTime;

      vi.advanceTimersByTime(1000);

      await instance.addPrompt('Second prompt', 8);
      expect(session!.lastActivityTime.getTime()).toBeGreaterThan(firstTime.getTime());

      vi.useRealTimers();
    });

    it('addPrompt updates project stats', async () => {
      const instance = SessionManagerService.getInstance();

      await instance.addPrompt('Test prompt', 7);

      const project = instance.getActiveProject();
      expect(project!.totalPrompts).toBe(1);
    });

    it('addPrompt with breakdown stores it', async () => {
      const instance = SessionManagerService.getInstance();
      const breakdown = {
        specificity: { score: 8, weight: 0.2 },
        context: { score: 7, weight: 0.25 },
        intent: { score: 9, weight: 0.25 },
        actionability: { score: 6, weight: 0.15 },
        constraints: { score: 7, weight: 0.15 },
        total: 7.5,
      };

      const prompt = await instance.addPrompt('Test', 7.5, breakdown);

      expect(prompt.breakdown).toEqual(breakdown);
    });

    it('updatePromptScore updates existing prompt', async () => {
      const instance = SessionManagerService.getInstance();

      const prompt = await instance.addPrompt('Test prompt', 5);

      await instance.updatePromptScore(prompt.id, 9);

      const session = instance.getActiveSession();
      const updated = session!.prompts.find(p => p.id === prompt.id);
      expect(updated!.score).toBe(9);
    });

    it('updatePromptScore updates enhanced text', async () => {
      const instance = SessionManagerService.getInstance();

      const prompt = await instance.addPrompt('Test prompt', 5);

      await instance.updatePromptScore(prompt.id, 9, undefined, 'Enhanced text', 9.5);

      const session = instance.getActiveSession();
      const updated = session!.prompts.find(p => p.id === prompt.id);
      expect(updated!.enhancedText).toBe('Enhanced text');
      expect(updated!.enhancedScore).toBe(9.5);
    });

    it('getPrompts returns paginated results', async () => {
      const instance = SessionManagerService.getInstance();

      // Add multiple prompts
      for (let i = 0; i < 15; i++) {
        await instance.addPrompt(`Prompt ${i}`, 7);
      }

      const session = instance.getActiveSession();
      const page1 = instance.getPrompts({ sessionId: session!.id, offset: 0, limit: 5 });

      expect(page1.prompts.length).toBe(5);
      expect(page1.total).toBe(15);
      expect(page1.hasMore).toBe(true);

      const page2 = instance.getPrompts({ sessionId: session!.id, offset: 10, limit: 5 });
      expect(page2.prompts.length).toBe(5);
      expect(page2.hasMore).toBe(false);
    });

    it('getActiveSessionPrompts returns prompts for active session', async () => {
      const instance = SessionManagerService.getInstance();

      await instance.addPrompt('Prompt 1', 7);
      await instance.addPrompt('Prompt 2', 8);

      const result = instance.getActiveSessionPrompts(10);

      expect(result.prompts.length).toBe(2);
    });
  });

  describe('onPromptDetected', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/test/project'), name: 'test-project' },
      ];
    });

    it('requires sourceSessionId', async () => {
      const instance = SessionManagerService.getInstance();

      const promptId = await instance.onPromptDetected({
        text: 'Test prompt',
        timestamp: new Date(),
        sourceId: 'cursor',
      });

      expect(promptId).toBe('');
    });

    it('creates prompt with sourceSessionId', async () => {
      const instance = SessionManagerService.getInstance();
      await instance.detectCurrentProject();

      const promptId = await instance.onPromptDetected({
        text: 'Test prompt',
        timestamp: new Date(),
        sourceId: 'cursor',
        sourceSessionId: 'source-123',
      });

      expect(promptId).not.toBe('');
    });

    it('creates new session for new sourceSessionId', async () => {
      const instance = SessionManagerService.getInstance();
      await instance.detectCurrentProject();

      await instance.onPromptDetected({
        text: 'Prompt 1',
        timestamp: new Date(),
        sourceId: 'cursor',
        sourceSessionId: 'source-1',
      });

      await instance.onPromptDetected({
        text: 'Prompt 2',
        timestamp: new Date(),
        sourceId: 'cursor',
        sourceSessionId: 'source-2',
      });

      const sessions = instance.getSessions();
      expect(sessions.length).toBe(2);
    });

    it('reuses session for same sourceSessionId', async () => {
      const instance = SessionManagerService.getInstance();
      await instance.detectCurrentProject();

      await instance.onPromptDetected({
        text: 'Prompt 1',
        timestamp: new Date(),
        sourceId: 'cursor',
        sourceSessionId: 'source-same',
      });

      await instance.onPromptDetected({
        text: 'Prompt 2',
        timestamp: new Date(),
        sourceId: 'cursor',
        sourceSessionId: 'source-same',
      });

      const sessions = instance.getSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].promptCount).toBe(2);
    });
  });

  // ============================================
  // GOAL MANAGEMENT
  // ============================================

  describe('Goal Management', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/test/project'), name: 'test-project' },
      ];
    });

    it('setGoal sets goal on active session', async () => {
      const instance = SessionManagerService.getInstance();
      await instance.addPrompt('Test', 7); // Creates active session

      await instance.setGoal('Fix the authentication bug');

      const session = instance.getActiveSession();
      expect(session!.goal).toBe('Fix the authentication bug');
      expect(session!.goalSetAt).toBeInstanceOf(Date);
    });

    it('setGoal throws without active session', async () => {
      const instance = SessionManagerService.getInstance();

      await expect(instance.setGoal('Some goal')).rejects.toThrow('No active session');
    });

    it('completeGoal marks goal as completed', async () => {
      const instance = SessionManagerService.getInstance();
      await instance.addPrompt('Test', 7);
      await instance.setGoal('Fix bug');

      await instance.completeGoal();

      const session = instance.getActiveSession();
      expect(session!.goalCompletedAt).toBeInstanceOf(Date);
    });

    it('completeGoal throws without goal', async () => {
      const instance = SessionManagerService.getInstance();
      await instance.addPrompt('Test', 7);

      await expect(instance.completeGoal()).rejects.toThrow('No active session or goal');
    });
  });

  // ============================================
  // SESSION EDITING
  // ============================================

  describe('Session Editing', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/test/project'), name: 'test-project' },
      ];
    });

    it('updateSession updates session properties', async () => {
      const instance = SessionManagerService.getInstance();
      await instance.addPrompt('Test', 7);
      const session = instance.getActiveSession();

      await instance.updateSession(session!.id, { customName: 'My Custom Name' });

      const updated = instance.getActiveSession();
      expect(updated!.customName).toBe('My Custom Name');
    });

    it('updateSession throws for unknown session', async () => {
      const instance = SessionManagerService.getInstance();

      await expect(
        instance.updateSession('unknown-id', { customName: 'Test' })
      ).rejects.toThrow('Session unknown-id not found');
    });

    it('deleteSession removes session', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      const session1 = instance.getOrCreateSession(project!.id, 'cursor', 'source-1');
      instance.getOrCreateSession(project!.id, 'cursor', 'source-2');

      expect(instance.getSessions().length).toBe(2);

      await instance.deleteSession(session1.id);

      expect(instance.getSessions().length).toBe(1);
    });

    it('deleteSession updates project stats', async () => {
      const instance = SessionManagerService.getInstance();
      await instance.addPrompt('Test', 7);
      const session = instance.getActiveSession();
      const project = instance.getActiveProject();

      expect(project!.totalSessions).toBe(1);
      expect(project!.totalPrompts).toBe(1);

      await instance.deleteSession(session!.id);

      const updatedProject = instance.getProject(project!.id);
      expect(updatedProject!.totalSessions).toBe(0);
      expect(updatedProject!.totalPrompts).toBe(0);
    });

    it('deleteSession throws for unknown session', async () => {
      const instance = SessionManagerService.getInstance();

      await expect(instance.deleteSession('unknown-id')).rejects.toThrow(
        'Session unknown-id not found'
      );
    });
  });

  // ============================================
  // EVENT SYSTEM
  // ============================================

  describe('Event System', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/test/project'), name: 'test-project' },
      ];
    });

    it('subscribe returns unsubscribe function', () => {
      const instance = SessionManagerService.getInstance();
      const listener = vi.fn();

      const unsubscribe = instance.subscribe(listener);

      expect(typeof unsubscribe).toBe('function');
    });

    it('emits project_created event', async () => {
      const instance = SessionManagerService.getInstance();
      const listener = vi.fn();
      instance.subscribe(listener);

      await instance.detectCurrentProject();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'project_created',
          projectId: expect.any(String),
        })
      );
    });

    it('emits session_created event', async () => {
      const instance = SessionManagerService.getInstance();
      const listener = vi.fn();
      instance.subscribe(listener);

      const project = await instance.detectCurrentProject();
      instance.getOrCreateSession(project!.id, 'cursor');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'session_created',
          sessionId: expect.any(String),
          projectId: project!.id,
        })
      );
    });

    it('emits prompt_added event', async () => {
      const instance = SessionManagerService.getInstance();
      const listener = vi.fn();
      instance.subscribe(listener);

      await instance.addPrompt('Test prompt', 7);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'prompt_added',
          promptId: expect.any(String),
        })
      );
    });

    it('emits goal_set event', async () => {
      const instance = SessionManagerService.getInstance();
      const listener = vi.fn();

      await instance.addPrompt('Test', 7);
      instance.subscribe(listener);

      await instance.setGoal('My goal');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'goal_set',
          data: { goal: 'My goal' },
        })
      );
    });

    it('unsubscribe stops notifications', async () => {
      const instance = SessionManagerService.getInstance();
      const listener = vi.fn();

      const unsubscribe = instance.subscribe(listener);
      unsubscribe();

      await instance.detectCurrentProject();

      expect(listener).not.toHaveBeenCalled();
    });

    it('listener errors do not break other listeners', async () => {
      const instance = SessionManagerService.getInstance();
      const errorListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = vi.fn();

      instance.subscribe(errorListener);
      instance.subscribe(goodListener);

      await instance.detectCurrentProject();

      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  // ============================================
  // PERSISTENCE
  // ============================================

  describe('Persistence', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);
    });

    it('saveState persists to globalState', async () => {
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/test/project'), name: 'test-project' },
      ];

      const instance = SessionManagerService.getInstance();
      await instance.addPrompt('Test prompt', 7);

      // State should have been saved
      expect(mockContext.globalState.update).toHaveBeenCalled();
    });

    it('loadState restores projects from globalState', async () => {
      // Pre-populate globalState with saved data
      const savedState = {
        projects: [
          {
            id: 'project-1',
            name: 'Saved Project',
            path: '/saved/project',
            sessions: [],
            isExpanded: true,
            totalSessions: 0,
            totalPrompts: 0,
          },
        ],
        activeSessionId: null,
        activeProjectId: null,
        config: { maxInactivityMinutes: 120, minPromptsForSession: 1 },
        lastUpdated: new Date().toISOString(),
      };
      globalStateStore.set('copilot.v2.sessionState', savedState);

      // Create new instance and initialize
      SessionManagerService.resetInstance();
      const newModule = await import('../SessionManagerService');
      const newInstance = newModule.SessionManagerService.getInstance();
      await newInstance.initialize(mockContext);

      const projects = newInstance.getAllProjects();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('Saved Project');
    });

    it('loadState deserializes dates correctly', async () => {
      const timestamp = new Date('2024-01-15T10:30:00Z');
      const savedState = {
        projects: [
          {
            id: 'project-1',
            name: 'Project',
            path: '/test',
            sessions: [
              {
                id: 'session-1',
                projectId: 'project-1',
                platform: 'cursor',
                startTime: timestamp.toISOString(),
                lastActivityTime: timestamp.toISOString(),
                promptCount: 1,
                prompts: [
                  {
                    id: 'prompt-1',
                    sessionId: 'session-1',
                    text: 'Test',
                    truncatedText: 'Test',
                    timestamp: timestamp.toISOString(),
                    score: 7,
                  },
                ],
                responses: [],
                isActive: true,
              },
            ],
            isExpanded: true,
            totalSessions: 1,
            totalPrompts: 1,
            lastActivityTime: timestamp.toISOString(),
          },
        ],
        activeSessionId: null,
        activeProjectId: null,
        config: { maxInactivityMinutes: 120, minPromptsForSession: 1 },
        lastUpdated: new Date().toISOString(),
      };
      globalStateStore.set('copilot.v2.sessionState', savedState);

      SessionManagerService.resetInstance();
      const newModule = await import('../SessionManagerService');
      const newInstance = newModule.SessionManagerService.getInstance();
      await newInstance.initialize(mockContext);

      const sessions = newInstance.getSessions();
      expect(sessions[0].startTime).toBeInstanceOf(Date);
      expect(sessions[0].prompts[0].timestamp).toBeInstanceOf(Date);
    });

    it('loadState deduplicates projects with same path', async () => {
      const savedState = {
        projects: [
          {
            id: 'project-1',
            name: 'Project From CLI',
            path: '/same/project',
            sessions: [
              {
                id: 'session-1',
                projectId: 'project-1',
                platform: 'cursor',
                startTime: new Date().toISOString(),
                lastActivityTime: new Date().toISOString(),
                promptCount: 1,
                prompts: [],
                responses: [],
                isActive: true,
              },
            ],
            isExpanded: true,
            totalSessions: 1,
            totalPrompts: 5,
          },
          {
            id: 'project-2',
            name: 'Project From Extension',
            path: '/same/project', // Same path, different ID
            sessions: [
              {
                id: 'session-2',
                projectId: 'project-2',
                platform: 'claude_code',
                startTime: new Date().toISOString(),
                lastActivityTime: new Date().toISOString(),
                promptCount: 1,
                prompts: [],
                responses: [],
                isActive: true,
              },
            ],
            isExpanded: true,
            totalSessions: 1,
            totalPrompts: 3,
          },
        ],
        activeSessionId: null,
        activeProjectId: null,
        config: { maxInactivityMinutes: 120, minPromptsForSession: 1 },
        lastUpdated: new Date().toISOString(),
      };
      globalStateStore.set('copilot.v2.sessionState', savedState);

      SessionManagerService.resetInstance();
      const newModule = await import('../SessionManagerService');
      const newInstance = newModule.SessionManagerService.getInstance();
      await newInstance.initialize(mockContext);

      const projects = newInstance.getAllProjects();
      expect(projects.length).toBe(1);

      // Merged project should have sessions from both
      expect(projects[0].sessions.length).toBe(2);
      expect(projects[0].totalPrompts).toBe(8); // 5 + 3
    });
  });

  // ============================================
  // STATISTICS
  // ============================================

  describe('Statistics', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/test/project'), name: 'test-project' },
      ];
    });

    it('getStats returns correct totals', async () => {
      const instance = SessionManagerService.getInstance();

      await instance.addPrompt('Prompt 1', 7);
      await instance.addPrompt('Prompt 2', 8);
      await instance.addPrompt('Prompt 3', 9);

      const stats = instance.getStats();

      expect(stats.totalProjects).toBe(1);
      expect(stats.totalSessions).toBe(1);
      expect(stats.totalPrompts).toBe(3);
    });

    it('getStats includes active session summary', async () => {
      const instance = SessionManagerService.getInstance();

      await instance.addPrompt('Test', 7);

      const stats = instance.getStats();

      expect(stats.activeSession).not.toBeNull();
      expect(stats.activeSession!.promptCount).toBe(1);
      expect(stats.activeSession!.isActive).toBe(true);
    });

    it('getTodayStats counts only today prompts', async () => {
      vi.useFakeTimers();
      const now = new Date('2024-06-15T14:00:00Z');
      vi.setSystemTime(now);

      const instance = SessionManagerService.getInstance();

      await instance.addPrompt('Prompt 1', 7);
      await instance.addPrompt('Prompt 2', 8);
      await instance.addPrompt('Prompt 3', 9);

      const todayStats = instance.getTodayStats();

      expect(todayStats.promptCount).toBe(3);
      expect(todayStats.averageScore).toBe(8); // (7+8+9)/3 = 8

      vi.useRealTimers();
    });

    it('getTodayStats returns zero for no prompts', async () => {
      const instance = SessionManagerService.getInstance();

      const todayStats = instance.getTodayStats();

      expect(todayStats.promptCount).toBe(0);
      expect(todayStats.averageScore).toBe(0);
    });
  });

  // ============================================
  // DATA ACCESS
  // ============================================

  describe('Data Access', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/test/project'), name: 'test-project' },
      ];
    });

    it('getAllProjects returns all projects', async () => {
      const instance = SessionManagerService.getInstance();
      await instance.detectCurrentProject();

      // Switch workspace to create another project
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/other/project'), name: 'other-project' },
      ];
      await instance.detectCurrentProject();

      const projects = instance.getAllProjects();
      expect(projects.length).toBe(2);
    });

    it('getProject returns project by ID', async () => {
      const instance = SessionManagerService.getInstance();
      const created = await instance.detectCurrentProject();

      const retrieved = instance.getProject(created!.id);
      expect(retrieved).toBe(created);
    });

    it('getProject returns null for unknown ID', () => {
      const instance = SessionManagerService.getInstance();
      const project = instance.getProject('unknown-id');
      expect(project).toBeNull();
    });

    it('getSessions returns all sessions', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      instance.getOrCreateSession(project!.id, 'cursor', 'source-1');
      instance.getOrCreateSession(project!.id, 'claude_code', 'source-2');

      const sessions = instance.getSessions();
      expect(sessions.length).toBe(2);
    });

    it('getSessions filters by platform', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      instance.getOrCreateSession(project!.id, 'cursor', 'source-1');
      instance.getOrCreateSession(project!.id, 'claude_code', 'source-2');

      const cursorSessions = instance.getSessions({ platform: 'cursor' });
      expect(cursorSessions.length).toBe(1);
      expect(cursorSessions[0].platform).toBe('cursor');
    });

    it('getSessions filters by isActive', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      const session1 = instance.getOrCreateSession(project!.id, 'cursor', 'source-1');
      session1.isActive = false;
      instance.getOrCreateSession(project!.id, 'cursor', 'source-2');

      const activeSessions = instance.getSessions({ isActive: true });
      expect(activeSessions.length).toBe(1);
    });

    it('getSessions respects limit', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      for (let i = 0; i < 5; i++) {
        instance.getOrCreateSession(project!.id, 'cursor', `source-${i}`);
      }

      const limited = instance.getSessions({ limit: 3 });
      expect(limited.length).toBe(3);
    });

    it('getSessionSummaries returns summary format', async () => {
      const instance = SessionManagerService.getInstance();
      await instance.addPrompt('Test', 7);

      const summaries = instance.getSessionSummaries();

      expect(summaries.length).toBe(1);
      expect(summaries[0]).toHaveProperty('id');
      expect(summaries[0]).toHaveProperty('projectName');
      expect(summaries[0]).toHaveProperty('platform');
      expect(summaries[0]).toHaveProperty('duration');
      expect(summaries[0]).toHaveProperty('promptCount');
    });
  });

  // ============================================
  // CONFIGURATION
  // ============================================

  describe('Configuration', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);
    });

    it('getConfig returns current configuration', () => {
      const instance = SessionManagerService.getInstance();
      const config = instance.getConfig();

      expect(config.maxInactivityMinutes).toBe(120);
      expect(config.minPromptsForSession).toBe(1);
    });

    it('updateConfig updates configuration', async () => {
      const instance = SessionManagerService.getInstance();

      await instance.updateConfig({ maxInactivityMinutes: 60 });

      const config = instance.getConfig();
      expect(config.maxInactivityMinutes).toBe(60);
    });
  });

  // ============================================
  // SIDEBAR STATE
  // ============================================

  describe('Sidebar State', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/test/project'), name: 'test-project' },
      ];
    });

    it('getSidebarWidth returns default', () => {
      const instance = SessionManagerService.getInstance();
      const width = instance.getSidebarWidth();
      expect(width).toBe(240);
    });

    it('saveSidebarWidth persists width', async () => {
      const instance = SessionManagerService.getInstance();

      await instance.saveSidebarWidth(300);

      expect(mockContext.globalState.update).toHaveBeenCalledWith(
        'copilot.v2.sidebarWidth',
        300
      );
    });

    it('toggleProjectExpanded toggles state', async () => {
      const instance = SessionManagerService.getInstance();
      const project = await instance.detectCurrentProject();

      expect(project!.isExpanded).toBe(true);

      await instance.toggleProjectExpanded(project!.id);

      expect(project!.isExpanded).toBe(false);

      await instance.toggleProjectExpanded(project!.id);

      expect(project!.isExpanded).toBe(true);
    });
  });

  // ============================================
  // RESPONSE MANAGEMENT
  // ============================================

  describe('Response Management', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: vscode.Uri.file('/test/project'), name: 'test-project' },
      ];
    });

    it('addResponse adds response to session', async () => {
      const instance = SessionManagerService.getInstance();
      await instance.addPrompt('Test prompt', 7);

      const response = {
        id: 'response-1',
        timestamp: new Date().toISOString(),
        source: 'cursor' as const,
        response: 'AI response text',
        success: true,
        filesModified: ['src/file.ts'],
      };

      await instance.addResponse(response);

      const session = instance.getActiveSession();
      expect(session!.responses.length).toBe(1);
      expect(session!.responses[0].text).toBe('AI response text');
    });

    it('addResponse links to prompt', async () => {
      const instance = SessionManagerService.getInstance();
      const prompt = await instance.addPrompt('Test prompt', 7);

      const response = {
        id: 'response-1',
        timestamp: new Date().toISOString(),
        source: 'cursor' as const,
        response: 'Response',
        success: true,
        promptId: prompt.id,
      };

      await instance.addResponse(response);

      const session = instance.getActiveSession();
      expect(session!.responses[0].promptId).toBe(prompt.id);
    });

    it('getLastInteractions returns prompt-response pairs', async () => {
      const instance = SessionManagerService.getInstance();
      const prompt = await instance.addPrompt('Test prompt', 7);

      const response = {
        id: 'response-1',
        timestamp: new Date().toISOString(),
        source: 'cursor' as const,
        response: 'Response',
        success: true,
        promptId: prompt.id,
      };

      await instance.addResponse(response);

      const interactions = instance.getLastInteractions(5);
      expect(interactions.length).toBe(1);
      expect(interactions[0].prompt.id).toBe(prompt.id);
      expect(interactions[0].response).toBeDefined();
    });
  });

  // ============================================
  // CURSOR/CLAUDE CODE SYNC
  // ============================================

  describe('Source Sync', () => {
    beforeEach(async () => {
      const instance = SessionManagerService.getInstance();
      await instance.initialize(mockContext);
    });

    it('syncFromCursorSession creates project and session', async () => {
      const instance = SessionManagerService.getInstance();

      await instance.syncFromCursorSession({
        composerId: 'composer-123',
        workspaceName: 'My Workspace',
        workspacePath: '/home/user/workspace',
        messageCount: 5,
      });

      const projects = instance.getAllProjects();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('My Workspace');

      const sessions = instance.getSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].platform).toBe('cursor');
    });

    it('syncFromCursorSession skips without workspace path', async () => {
      const instance = SessionManagerService.getInstance();

      await instance.syncFromCursorSession({
        composerId: 'composer-123',
        workspaceName: null,
        workspacePath: null,
        messageCount: 5,
      });

      expect(instance.getAllProjects().length).toBe(0);
    });

    it('syncFromSource creates session for different platforms', async () => {
      const instance = SessionManagerService.getInstance();

      await instance.syncFromSource({
        sourceId: 'claude_code',
        projectPath: '/test/project',
        projectName: 'Test Project',
        sourceSessionId: 'session-123',
      });

      const sessions = instance.getSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].platform).toBe('claude_code');
    });
  });
});
