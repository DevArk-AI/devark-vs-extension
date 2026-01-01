/**
 * SessionPersistenceService - Handles state persistence for SessionManager
 *
 * Responsibilities:
 * - Load/save session state to VS Code globalState
 * - Serialize/deserialize projects, sessions, prompts, responses
 * - Deduplicate projects by path on load
 * - Manage UI state (sidebar width)
 */

import type * as vscode from 'vscode';
import type {
  Project,
  Session,
  PromptRecord,
  ResponseRecord,
  SessionManagerState,
  SessionDetectionConfig,
  SerializedProject,
  SerializedSession,
  SerializedPromptRecord,
  SerializedResponseRecord,
} from '../types/session-types';
import { STORAGE_KEYS, DEFAULT_SESSION_DETECTION_CONFIG } from './types';
import { DEFAULT_SESSION_DETECTION_CONFIG as FALLBACK_CONFIG } from '../types/session-types';

interface PersistenceServiceDeps {
  context: vscode.ExtensionContext;
  projects: Map<string, Project>;
  config: SessionDetectionConfig;
}

interface LoadResult {
  loaded: boolean;
  deduplicated?: boolean;
  activeSessionId?: string | null;
  activeProjectId?: string | null;
  config?: SessionDetectionConfig;
}

export class SessionPersistenceService {
  private context: vscode.ExtensionContext;
  private projects: Map<string, Project>;
  private config: SessionDetectionConfig;

  constructor(deps: PersistenceServiceDeps) {
    this.context = deps.context;
    this.projects = deps.projects;
    this.config = deps.config;
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
   * Load state from storage
   */
  async loadState(): Promise<LoadResult> {
    try {
      const state = this.context.globalState.get<SessionManagerState>(STORAGE_KEYS.SESSION_STATE);
      if (!state || typeof state !== 'object' || !Array.isArray(state.projects)) {
        console.log('[SessionPersistenceService] No valid persisted state found');
        return { loaded: false };
      }

      // Deserialize projects with deduplication
      this.projects.clear();
      const projectsByNormalizedPath = new Map<string, Project>();
      let deduplicated = false;

      for (const serializedProject of state.projects) {
        const project = this.deserializeProject(serializedProject);

        // Generate normalized key for deduplication - use PATH ONLY
        const normalizedPath = project.path ? this.normalizePath(project.path) : project.id;
        const deduplicationKey = normalizedPath;

        const existingProject = projectsByNormalizedPath.get(deduplicationKey);

        if (existingProject) {
          // Merge duplicate project: combine sessions and stats
          deduplicated = true;
          console.log(`[SessionPersistenceService] Merging duplicate project: ${project.name}`);

          const existingSessionIds = new Set(existingProject.sessions.map(s => s.id));
          for (const session of project.sessions) {
            if (!existingSessionIds.has(session.id)) {
              session.projectId = existingProject.id;
              existingProject.sessions.push(session);
            }
          }

          existingProject.totalSessions = existingProject.sessions.length;
          existingProject.totalPrompts += project.totalPrompts;

          if (project.lastActivityTime &&
              (!existingProject.lastActivityTime ||
               project.lastActivityTime > existingProject.lastActivityTime)) {
            existingProject.lastActivityTime = project.lastActivityTime;
          }
        } else {
          projectsByNormalizedPath.set(deduplicationKey, project);
          this.projects.set(project.id, project);
        }
      }

      const loadedConfig = { ...(FALLBACK_CONFIG || DEFAULT_SESSION_DETECTION_CONFIG), ...state.config };

      console.log('[SessionPersistenceService] State loaded:', {
        projectsBeforeDedup: state.projects.length,
        projectsAfterDedup: this.projects.size,
      });

      return {
        loaded: true,
        deduplicated,
        activeSessionId: state.activeSessionId,
        activeProjectId: state.activeProjectId,
        config: loadedConfig,
      };
    } catch (error) {
      console.error('[SessionPersistenceService] Failed to load state:', error);
      this.projects.clear();
      return { loaded: false };
    }
  }

  /**
   * Save state to storage
   */
  async saveState(activeSessionId: string | null, activeProjectId: string | null): Promise<void> {
    try {
      const state: SessionManagerState = {
        projects: Array.from(this.projects.values()).map(p => this.serializeProject(p)),
        activeSessionId,
        activeProjectId,
        config: this.config,
        lastUpdated: new Date().toISOString(),
      };

      await this.context.globalState.update(STORAGE_KEYS.SESSION_STATE, state);
    } catch (error) {
      console.error('[SessionPersistenceService] Failed to save state:', error);
    }
  }

  /**
   * Serialize project for storage
   */
  serializeProject(project: Project): SerializedProject {
    return {
      ...project,
      sessions: project.sessions.map(s => this.serializeSession(s)),
      lastActivityTime: project.lastActivityTime?.toISOString(),
    };
  }

  /**
   * Deserialize project from storage
   */
  deserializeProject(serialized: SerializedProject): Project {
    return {
      ...serialized,
      sessions: serialized.sessions.map(s => this.deserializeSession(s)),
      lastActivityTime: serialized.lastActivityTime
        ? new Date(serialized.lastActivityTime)
        : undefined,
    };
  }

  /**
   * Serialize session for storage
   */
  serializeSession(session: Session): SerializedSession {
    return {
      ...session,
      startTime: session.startTime.toISOString(),
      lastActivityTime: session.lastActivityTime.toISOString(),
      goalSetAt: session.goalSetAt?.toISOString(),
      goalCompletedAt: session.goalCompletedAt?.toISOString(),
      prompts: session.prompts.map(p => this.serializePrompt(p)),
      responses: (session.responses || []).map(r => this.serializeResponse(r)),
    };
  }

  /**
   * Deserialize session from storage
   */
  deserializeSession(serialized: SerializedSession): Session {
    return {
      ...serialized,
      startTime: new Date(serialized.startTime),
      lastActivityTime: new Date(serialized.lastActivityTime),
      goalSetAt: serialized.goalSetAt ? new Date(serialized.goalSetAt) : undefined,
      goalCompletedAt: serialized.goalCompletedAt ? new Date(serialized.goalCompletedAt) : undefined,
      prompts: serialized.prompts.map(p => this.deserializePrompt(p)),
      responses: (serialized.responses || []).map(r => this.deserializeResponse(r)),
    };
  }

  /**
   * Serialize prompt for storage
   */
  serializePrompt(prompt: PromptRecord): SerializedPromptRecord {
    return {
      ...prompt,
      timestamp: prompt.timestamp.toISOString(),
    };
  }

  /**
   * Deserialize prompt from storage
   */
  deserializePrompt(serialized: SerializedPromptRecord): PromptRecord {
    return {
      ...serialized,
      timestamp: new Date(serialized.timestamp),
    };
  }

  /**
   * Serialize response for storage
   */
  serializeResponse(response: ResponseRecord): SerializedResponseRecord {
    return {
      ...response,
      timestamp: response.timestamp.toISOString(),
    };
  }

  /**
   * Deserialize response from storage
   */
  deserializeResponse(serialized: SerializedResponseRecord): ResponseRecord {
    return {
      ...serialized,
      timestamp: new Date(serialized.timestamp),
    };
  }

  /**
   * Save sidebar width
   */
  async saveSidebarWidth(width: number): Promise<void> {
    await this.context.globalState.update(STORAGE_KEYS.SIDEBAR_WIDTH, width);
  }

  /**
   * Get sidebar width
   */
  getSidebarWidth(): number {
    return this.context.globalState.get<number>(STORAGE_KEYS.SIDEBAR_WIDTH, 240);
  }
}
