/**
 * ProjectDetectionService Tests (TDD)
 *
 * Tests for project detection:
 * - Git repository name extraction
 * - URL parsing (SSH and HTTPS)
 * - Project ID generation (deterministic)
 * - Path normalization
 * - Project creation
 * - Finding projects by path
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectDetectionService } from '../ProjectDetectionService';
import type { Project } from '../../types/session-types';

// Mock vscode module
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
    Uri: {
      file: (p: string) => createMockUri(p),
    },
  };
});

import * as vscode from 'vscode';

describe('ProjectDetectionService', () => {
  let service: ProjectDetectionService;
  let projects: Map<string, Project>;
  let emitEvent: ReturnType<typeof vi.fn>;
  let saveState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    projects = new Map();
    emitEvent = vi.fn();
    saveState = vi.fn().mockResolvedValue(undefined);

    // Reset vscode mocks
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
    vi.mocked(vscode.workspace.fs.stat).mockRejectedValue(new Error('Not found'));
    vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('Not found'));

    service = new ProjectDetectionService({
      projects,
      emitEvent,
      saveState,
    });
  });

  describe('extractRepoNameFromUrl', () => {
    it('should extract repo name from HTTPS URL', () => {
      const url = 'https://github.com/user/repo-name.git';
      expect(service.extractRepoNameFromUrl(url)).toBe('user/repo-name');
    });

    it('should extract repo name from HTTPS URL without .git', () => {
      const url = 'https://github.com/user/repo-name';
      expect(service.extractRepoNameFromUrl(url)).toBe('user/repo-name');
    });

    it('should extract repo name from SSH URL', () => {
      const url = 'git@github.com:user/repo-name.git';
      expect(service.extractRepoNameFromUrl(url)).toBe('user/repo-name');
    });

    it('should extract repo name from SSH URL without .git', () => {
      const url = 'git@github.com:user/repo-name';
      expect(service.extractRepoNameFromUrl(url)).toBe('user/repo-name');
    });

    it('should handle GitLab URLs', () => {
      const url = 'git@gitlab.com:company/project.git';
      expect(service.extractRepoNameFromUrl(url)).toBe('company/project');
    });

    it('should return null for invalid URLs', () => {
      expect(service.extractRepoNameFromUrl('not-a-url')).toBeNull();
      expect(service.extractRepoNameFromUrl('')).toBeNull();
    });
  });

  describe('normalizePath', () => {
    it('should convert to lowercase', () => {
      expect(service.normalizePath('/Users/Test/Project')).toBe('/users/test/project');
    });

    it('should convert backslashes to forward slashes', () => {
      expect(service.normalizePath('C:\\Users\\Test\\Project')).toBe('c:/users/test/project');
    });

    it('should remove trailing slashes', () => {
      expect(service.normalizePath('/users/test/project/')).toBe('/users/test/project');
    });

    it('should trim whitespace', () => {
      expect(service.normalizePath('  /users/test  ')).toBe('/users/test');
    });
  });

  describe('generateProjectId', () => {
    it('should generate deterministic ID for same path', () => {
      const id1 = service.generateProjectId('project', '/users/test/project');
      const id2 = service.generateProjectId('project', '/users/test/project');
      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different paths', () => {
      const id1 = service.generateProjectId('project', '/users/test/project-a');
      const id2 = service.generateProjectId('project', '/users/test/project-b');
      expect(id1).not.toBe(id2);
    });

    it('should ignore name parameter (use path only)', () => {
      const id1 = service.generateProjectId('name-a', '/users/test/project');
      const id2 = service.generateProjectId('name-b', '/users/test/project');
      expect(id1).toBe(id2);
    });

    it('should normalize paths before hashing', () => {
      const id1 = service.generateProjectId('project', '/Users/Test/Project');
      const id2 = service.generateProjectId('project', '/users/test/project');
      expect(id1).toBe(id2);
    });

    it('should return ID starting with "project-"', () => {
      const id = service.generateProjectId('test', '/users/test/project');
      expect(id).toMatch(/^project-[a-z0-9]+$/);
    });
  });

  describe('createProject', () => {
    it('should create project with correct properties', () => {
      const project = service.createProject('proj-123', 'my-project', '/users/test/my-project');

      expect(project.id).toBe('proj-123');
      expect(project.name).toBe('my-project');
      expect(project.path).toBe('/users/test/my-project');
      expect(project.sessions).toEqual([]);
      expect(project.isExpanded).toBe(true);
      expect(project.totalSessions).toBe(0);
      expect(project.totalPrompts).toBe(0);
      expect(project.lastActivityTime).toBeUndefined();
    });
  });

  describe('findProjectByPath', () => {
    it('should find existing project by exact path', () => {
      const project: Project = {
        id: 'proj-1',
        name: 'test',
        path: '/users/test/project',
        sessions: [],
        isExpanded: true,
        totalSessions: 0,
        totalPrompts: 0,
      };
      projects.set('proj-1', project);

      const found = service.findProjectByPath('/users/test/project');
      expect(found).toBe(project);
    });

    it('should find project with case-insensitive path matching', () => {
      const project: Project = {
        id: 'proj-1',
        name: 'test',
        path: '/users/test/project',
        sessions: [],
        isExpanded: true,
        totalSessions: 0,
        totalPrompts: 0,
      };
      projects.set('proj-1', project);

      const found = service.findProjectByPath('/Users/Test/Project');
      expect(found).toBe(project);
    });

    it('should return null when no project matches', () => {
      const found = service.findProjectByPath('/nonexistent/path');
      expect(found).toBeNull();
    });

    it('should handle projects without path', () => {
      const project: Project = {
        id: 'proj-1',
        name: 'test',
        sessions: [],
        isExpanded: true,
        totalSessions: 0,
        totalPrompts: 0,
      };
      projects.set('proj-1', project);

      const found = service.findProjectByPath('/users/test/project');
      expect(found).toBeNull();
    });
  });

  describe('detectCurrentProject', () => {
    it('should return null when no workspace folder', async () => {
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;

      const result = await service.detectCurrentProject();
      expect(result).toBeNull();
    });

    it('should return null when workspace folders empty', async () => {
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [];

      const result = await service.detectCurrentProject();
      expect(result).toBeNull();
    });

    it('should return existing project if path matches', async () => {
      const existingProject: Project = {
        id: 'proj-1',
        name: 'existing',
        path: '/users/test/project',
        sessions: [],
        isExpanded: true,
        totalSessions: 0,
        totalPrompts: 0,
      };
      projects.set('proj-1', existingProject);

      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: { fsPath: '/users/test/project' }, name: 'project' },
      ];

      const result = await service.detectCurrentProject();
      expect(result).toBe(existingProject);
      expect(emitEvent).not.toHaveBeenCalled(); // No new project created
    });

    it('should create new project when no existing match', async () => {
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: { fsPath: '/users/test/new-project' }, name: 'new-project' },
      ];

      const result = await service.detectCurrentProject();

      expect(result).not.toBeNull();
      expect(result!.name).toBe('new-project');
      expect(result!.path).toBe('/users/test/new-project');
      expect(projects.size).toBe(1);
      expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'project_created',
      }));
      expect(saveState).toHaveBeenCalled();
    });

    it('should use git repo name when available', async () => {
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: { fsPath: '/users/test/my-folder' }, name: 'my-folder' },
      ];

      // Mock git directory exists
      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({} as never);

      // Mock git config with remote origin
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from('[remote "origin"]\n\turl = git@github.com:myorg/actual-repo-name.git') as never
      );

      const result = await service.detectCurrentProject();

      expect(result).not.toBeNull();
      expect(result!.name).toBe('myorg/actual-repo-name');
    });

    it('should fall back to folder name when git fails', async () => {
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: { fsPath: '/users/test/my-folder' }, name: 'my-folder' },
      ];

      // Mock git directory does not exist
      vi.mocked(vscode.workspace.fs.stat).mockRejectedValue(new Error('Not found'));

      const result = await service.detectCurrentProject();

      expect(result).not.toBeNull();
      expect(result!.name).toBe('my-folder');
    });
  });

  describe('getOrCreateDefaultProject', () => {
    it('should return existing project if one exists', () => {
      const existingProject: Project = {
        id: 'proj-1',
        name: 'existing',
        sessions: [],
        isExpanded: true,
        totalSessions: 0,
        totalPrompts: 0,
      };
      projects.set('proj-1', existingProject);

      const result = service.getOrCreateDefaultProject();
      expect(result).toBe(existingProject);
    });

    it('should create default project when none exist', () => {
      expect(projects.size).toBe(0);

      const result = service.getOrCreateDefaultProject();

      expect(result.id).toBe('default-project');
      expect(result.name).toBe('Default Project');
      expect(projects.size).toBe(1);
    });
  });
});
