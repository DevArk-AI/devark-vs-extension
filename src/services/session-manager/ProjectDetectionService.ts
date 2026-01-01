/**
 * ProjectDetectionService - Handles project detection for SessionManager
 *
 * Responsibilities:
 * - Detect current project from workspace folder
 * - Extract git repository name
 * - Parse git URLs (SSH and HTTPS)
 * - Generate stable project IDs based on path
 * - Create and find projects
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { Project, SessionEvent } from '../types/session-types';

interface ProjectDetectionDeps {
  projects: Map<string, Project>;
  emitEvent: (event: SessionEvent) => void;
  saveState: () => Promise<void>;
}

export class ProjectDetectionService {
  private projects: Map<string, Project>;
  private emitEvent: (event: SessionEvent) => void;
  private saveState: () => Promise<void>;

  constructor(deps: ProjectDetectionDeps) {
    this.projects = deps.projects;
    this.emitEvent = deps.emitEvent;
    this.saveState = deps.saveState;
  }

  /**
   * Detect current project from workspace
   */
  async detectCurrentProject(): Promise<Project | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      console.log('[ProjectDetectionService] No workspace folder detected');
      return null;
    }

    const workspaceFolder = workspaceFolders[0];
    const folderPath = workspaceFolder.uri.fsPath;
    const folderName = workspaceFolder.name;

    // Check if project with same path already exists
    let project = this.findProjectByPath(folderPath);
    if (project) {
      console.log(`[ProjectDetectionService] Found existing project: ${project.name}`);
      return project;
    }

    // No existing project - create a new one
    const gitRepoName = await this.getGitRepoName(folderPath);
    const projectName = gitRepoName || folderName;
    const projectId = this.generateProjectId(projectName, folderPath);

    project = this.createProject(projectId, projectName, folderPath);
    this.projects.set(projectId, project);
    this.emitEvent({ type: 'project_created', projectId, timestamp: new Date() });
    await this.saveState();

    return project;
  }

  /**
   * Get git repository name from folder
   */
  async getGitRepoName(folderPath: string): Promise<string | null> {
    try {
      const gitPath = path.join(folderPath, '.git');
      const gitUri = vscode.Uri.file(gitPath);

      try {
        await vscode.workspace.fs.stat(gitUri);
      } catch {
        return null;
      }

      const gitConfigPath = path.join(gitPath, 'config');
      const gitConfigUri = vscode.Uri.file(gitConfigPath);

      try {
        const configContent = await vscode.workspace.fs.readFile(gitConfigUri);
        const configText = Buffer.from(configContent).toString('utf8');

        const remoteMatch = configText.match(/\[remote "origin"\][^[]*url\s*=\s*(.+)/);
        if (remoteMatch) {
          const url = remoteMatch[1].trim();
          const repoName = this.extractRepoNameFromUrl(url);
          if (repoName) return repoName;
        }
      } catch {
        // Config read failed
      }

      return path.basename(folderPath);
    } catch (error) {
      console.warn('[ProjectDetectionService] Git detection failed:', error);
      return null;
    }
  }

  /**
   * Extract repo name from git URL
   */
  extractRepoNameFromUrl(url: string): string | null {
    if (!url) return null;

    // Handle SSH URLs: git@github.com:user/repo.git
    const sshMatch = url.match(/git@[^:]+:([^/]+\/[^/]+?)(?:\.git)?$/);
    if (sshMatch) {
      return sshMatch[1].replace(/\.git$/, '');
    }

    // Handle HTTPS URLs: https://github.com/user/repo.git
    const httpsMatch = url.match(/https?:\/\/[^/]+\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
      return httpsMatch[1].replace(/\.git$/, '');
    }

    return null;
  }

  /**
   * Normalize path for consistent project ID generation
   */
  normalizePath(inputPath: string): string {
    return inputPath
      .toLowerCase()
      .replace(/\\/g, '/')
      .replace(/\/+$/, '')
      .trim();
  }

  /**
   * Generate stable project ID based ONLY on path
   */
  generateProjectId(_name: string, projectPath: string): string {
    const normalizedPath = this.normalizePath(projectPath);
    const pathHash = this.hashString(normalizedPath);
    return `project-${pathHash}`;
  }

  /**
   * Simple string hash
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).slice(0, 8);
  }

  /**
   * Create a new project
   */
  createProject(id: string, name: string, projectPath?: string): Project {
    return {
      id,
      name,
      path: projectPath,
      sessions: [],
      isExpanded: true,
      totalSessions: 0,
      totalPrompts: 0,
      lastActivityTime: undefined,
    };
  }

  /**
   * Find project by path (case-insensitive)
   */
  findProjectByPath(projectPath: string): Project | null {
    const normalizedPath = this.normalizePath(projectPath);
    for (const project of this.projects.values()) {
      if (project.path && this.normalizePath(project.path) === normalizedPath) {
        return project;
      }
    }
    return null;
  }

  /**
   * Get or create a default project when no project is detected
   */
  getOrCreateDefaultProject(): Project {
    const existingProject = Array.from(this.projects.values())[0];
    if (existingProject) return existingProject;

    const defaultProject = this.createProject('default-project', 'Default Project', '');
    this.projects.set(defaultProject.id, defaultProject);
    return defaultProject;
  }
}
