/**
 * SessionLifecycleService - Manages session lifecycle for SessionManager
 *
 * Responsibilities:
 * - Create and retrieve sessions
 * - Check session activity status
 * - Switch between sessions
 * - Goal management (set/complete)
 * - Session editing and deletion
 */

import type {
  Project,
  Session,
  SessionEvent,
  SessionDetectionConfig,
  Platform,
} from '../types/session-types';
import { generateId } from '../types/session-types';

interface SessionLifecycleDeps {
  projects: Map<string, Project>;
  config: SessionDetectionConfig;
  emitEvent: (event: SessionEvent) => void;
  saveState: () => Promise<void>;
  getActiveSessionId: () => string | null;
  setActiveSessionId: (id: string | null) => void;
  getActiveProjectId: () => string | null;
  setActiveProjectId: (id: string | null) => void;
}

export class SessionLifecycleService {
  private projects: Map<string, Project>;
  private config: SessionDetectionConfig;
  private emitEvent: (event: SessionEvent) => void;
  private saveState: () => Promise<void>;
  private getActiveSessionId: () => string | null;
  private setActiveSessionId: (id: string | null) => void;
  private getActiveProjectId: () => string | null;
  private setActiveProjectId: (id: string | null) => void;

  constructor(deps: SessionLifecycleDeps) {
    this.projects = deps.projects;
    this.config = deps.config;
    this.emitEvent = deps.emitEvent;
    this.saveState = deps.saveState;
    this.getActiveSessionId = deps.getActiveSessionId;
    this.setActiveSessionId = deps.setActiveSessionId;
    this.getActiveProjectId = deps.getActiveProjectId;
    this.setActiveProjectId = deps.setActiveProjectId;
  }

  /**
   * Check if session is still active (within inactivity window)
   */
  isSessionStillActive(session: Session): boolean {
    const now = new Date();
    const lastActivity = session.lastActivityTime;
    const diffMinutes = (now.getTime() - lastActivity.getTime()) / 60000;
    return diffMinutes <= this.config.maxInactivityMinutes;
  }

  /**
   * Create a new session
   */
  createSession(projectId: string, platform: Platform, sourceSessionId?: string): Session {
    const now = new Date();
    const effectiveSourceSessionId = sourceSessionId || `generated-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session: Session = {
      id: generateId(),
      projectId,
      platform,
      startTime: now,
      lastActivityTime: now,
      promptCount: 0,
      prompts: [],
      responses: [],
      isActive: true,
      metadata: { sourceSessionId: effectiveSourceSessionId },
    };

    return session;
  }

  /**
   * Get or create a session for the current project and platform
   */
  getOrCreateSession(projectId: string, platform: Platform, sourceSessionId?: string): Session {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Find active session for this platform
    const activeSession = project.sessions.find(s => {
      if (s.platform !== platform || !s.isActive || !this.isSessionStillActive(s)) {
        return false;
      }

      if (sourceSessionId) {
        const sessionSourceId = s.metadata?.sourceSessionId || s.metadata?.cursorComposerId;
        if (sessionSourceId !== sourceSessionId) {
          return false;
        }
      }

      return true;
    });

    if (activeSession) {
      return activeSession;
    }

    // Close any stale active sessions for this platform
    project.sessions
      .filter(s => s.platform === platform && s.isActive)
      .forEach(s => {
        s.isActive = false;
        this.emitEvent({ type: 'session_ended', sessionId: s.id, projectId, timestamp: new Date() });
      });

    // Create new session
    const newSession = this.createSession(projectId, platform, sourceSessionId);
    project.sessions.unshift(newSession);
    project.totalSessions++;

    this.emitEvent({
      type: 'session_created',
      sessionId: newSession.id,
      projectId,
      timestamp: new Date(),
    });

    this.saveState();
    return newSession;
  }

  /**
   * Get active session
   */
  getActiveSession(): Session | null {
    const activeSessionId = this.getActiveSessionId();
    const activeProjectId = this.getActiveProjectId();

    if (!activeSessionId || !activeProjectId) {
      return null;
    }

    const project = this.projects.get(activeProjectId);
    if (!project) return null;

    return project.sessions.find(s => s.id === activeSessionId) || null;
  }

  /**
   * Get active project
   */
  getActiveProject(): Project | null {
    const activeProjectId = this.getActiveProjectId();
    if (!activeProjectId) return null;
    return this.projects.get(activeProjectId) || null;
  }

  /**
   * Find a session by its source session ID
   */
  findSessionBySourceId(sourceSessionId: string): Session | null {
    for (const project of this.projects.values()) {
      for (const session of project.sessions) {
        const sessionSourceId = session.metadata?.sourceSessionId || session.metadata?.cursorComposerId;
        if (sessionSourceId === sourceSessionId) {
          return session;
        }
      }
    }
    return null;
  }

  /**
   * Mark a session as read
   */
  async markSessionAsRead(sessionId: string): Promise<void> {
    for (const project of this.projects.values()) {
      const session = project.sessions.find(s => s.id === sessionId);
      if (session && session.hasUnreadActivity) {
        session.hasUnreadActivity = false;
        await this.saveState();
        this.emitEvent({
          type: 'session_updated',
          sessionId,
          projectId: project.id,
          timestamp: new Date(),
          data: { hasUnreadActivity: false },
        });
        return;
      }
    }
  }

  /**
   * Switch to a different session
   */
  async switchSession(sessionId: string): Promise<Session | null> {
    for (const [projectId, project] of this.projects) {
      const session = project.sessions.find(s => s.id === sessionId);
      if (session) {
        this.setActiveSessionId(sessionId);
        this.setActiveProjectId(projectId);

        if (session.hasUnreadActivity) {
          session.hasUnreadActivity = false;
        }

        await this.saveState();
        return session;
      }
    }
    return null;
  }

  /**
   * End current session
   */
  async endCurrentSession(): Promise<void> {
    const session = this.getActiveSession();
    if (session) {
      session.isActive = false;
      this.emitEvent({
        type: 'session_ended',
        sessionId: session.id,
        projectId: this.getActiveProjectId() || undefined,
        timestamp: new Date(),
      });
      this.setActiveSessionId(null);
      await this.saveState();
    }
  }

  /**
   * Set goal for current session
   */
  async setGoal(goal: string): Promise<void> {
    const session = this.getActiveSession();
    if (!session) {
      throw new Error('No active session');
    }

    session.goal = goal;
    session.goalSetAt = new Date();
    session.goalCompletedAt = undefined;

    this.emitEvent({
      type: 'goal_set',
      sessionId: session.id,
      projectId: session.projectId,
      timestamp: new Date(),
      data: { goal },
    });

    await this.saveState();
  }

  /**
   * Mark goal as completed
   */
  async completeGoal(): Promise<void> {
    const session = this.getActiveSession();
    if (!session || !session.goal) {
      throw new Error('No active session or goal');
    }

    session.goalCompletedAt = new Date();

    this.emitEvent({
      type: 'goal_completed',
      sessionId: session.id,
      projectId: session.projectId,
      timestamp: new Date(),
    });

    await this.saveState();
  }

  /**
   * Update session properties
   */
  async updateSession(sessionId: string, updates: Partial<Session>): Promise<void> {
    for (const [projectId, project] of this.projects) {
      const session = project.sessions.find(s => s.id === sessionId);
      if (session) {
        // Exclude protected fields
        const { id: _id, projectId: _pid, prompts: _prompts, ...safeUpdates } = updates;

        // Mutate in place
        Object.assign(session, safeUpdates);

        await this.saveState();

        this.emitEvent({
          type: 'session_updated',
          sessionId,
          projectId,
          timestamp: new Date(),
          data: updates,
        });

        return;
      }
    }

    throw new Error(`Session ${sessionId} not found`);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    for (const [projectId, project] of this.projects) {
      const sessionIndex = project.sessions.findIndex(s => s.id === sessionId);
      if (sessionIndex !== -1) {
        const session = project.sessions[sessionIndex];

        project.totalSessions = Math.max(0, project.totalSessions - 1);
        project.totalPrompts = Math.max(0, project.totalPrompts - session.promptCount);

        project.sessions.splice(sessionIndex, 1);

        if (this.getActiveSessionId() === sessionId) {
          this.setActiveSessionId(null);
          if (project.sessions.length > 0) {
            this.setActiveSessionId(project.sessions[0].id);
          }
        }

        if (project.sessions.length > 0) {
          project.lastActivityTime = project.sessions[0].lastActivityTime;
        } else {
          project.lastActivityTime = undefined;
        }

        await this.saveState();

        this.emitEvent({
          type: 'session_deleted',
          sessionId,
          projectId,
          timestamp: new Date(),
        });

        return;
      }
    }

    throw new Error(`Session ${sessionId} not found`);
  }
}
