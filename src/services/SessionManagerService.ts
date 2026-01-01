/**
 * SessionManagerService - Core Session Management for Co-Pilot V2
 *
 * Responsibilities:
 * - Detect projects from workspace folder / git repo
 * - Detect platform from active tool (Cursor, Claude Code, VS Code)
 * - Create and manage sessions based on activity patterns
 * - Session creation rules: different project, different tool, or >2h gap
 * - Persist sessions to extension storage
 * - Sync with cloud (via existing vibe-log API)
 *
 * Design Principles:
 * - Singleton pattern for global state management
 * - Event-driven architecture for UI updates
 * - Hybrid storage: globalState for metadata, filesystem for large data
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  Platform,
  Project,
  Session,
  PromptRecord,
  Interaction,
  ScoreBreakdown,
  SessionDetectionConfig,
  SessionFilterOptions,
  SessionSummary,
  SessionEvent,
  SessionEventCallback,
  PromptPaginationOptions,
  PaginatedPrompts,
  DEFAULT_SESSION_DETECTION_CONFIG,
  calculateSessionDuration,
} from './types/session-types';
import type { CapturedResponse } from './types/response-types';
import type { KnownSourceId } from '../adapters/prompt-detection/types';

// Internal services
import {
  SessionPersistenceService,
  ProjectDetectionService,
  SessionLifecycleService,
  PromptManagementService,
  ResponseManagementService,
} from './session-manager';

/**
 * Map source IDs to platform types
 */
const SOURCE_TO_PLATFORM: Record<string, Platform> = {
  cursor: 'cursor',
  claude_code: 'claude_code',
  vscode: 'vscode',
  windsurf: 'cursor', // Windsurf uses same platform type
  github_copilot: 'vscode',
  cody: 'vscode',
};

/**
 * Default prompts per page for pagination
 */
const DEFAULT_PROMPTS_PER_PAGE = 10;

/**
 * SessionManagerService - Singleton session management
 */
export class SessionManagerService {
  private static instance: SessionManagerService | null = null;

  private context: vscode.ExtensionContext | null = null;
  private projects: Map<string, Project> = new Map();
  private activeSessionId: string | null = null;
  private activeProjectId: string | null = null;
  private config: SessionDetectionConfig = DEFAULT_SESSION_DETECTION_CONFIG;
  private eventListeners: Set<SessionEventCallback> = new Set();
  private initialized: boolean = false;

  // Internal services
  private persistenceService: SessionPersistenceService | null = null;
  private projectService: ProjectDetectionService | null = null;
  private lifecycleService: SessionLifecycleService | null = null;
  private promptService: PromptManagementService | null = null;
  private responseService: ResponseManagementService | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): SessionManagerService {
    if (!SessionManagerService.instance) {
      SessionManagerService.instance = new SessionManagerService();
    }
    return SessionManagerService.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  public static resetInstance(): void {
    if (SessionManagerService.instance) {
      SessionManagerService.instance.dispose();
    }
    SessionManagerService.instance = null;
  }

  /**
   * Initialize with VS Code extension context
   */
  public async initialize(context: vscode.ExtensionContext): Promise<void> {
    if (this.initialized) {
      console.log('[SessionManager] Already initialized');
      return;
    }

    this.context = context;

    try {
      // Create internal services
      this.initializeServices();

      // Load persisted state
      await this.loadState();

      // Detect current project and platform
      const currentProject = await this.detectCurrentProject();
      const currentPlatform = this.detectCurrentPlatform();

      // Get or create active session
      if (currentProject) {
        const session = this.getOrCreateSession(currentProject.id, currentPlatform);
        this.activeSessionId = session.id;
        this.activeProjectId = currentProject.id;
      }

      this.initialized = true;
      console.log('[SessionManager] Initialized successfully', {
        projects: this.projects.size,
        activeProject: this.activeProjectId,
        activeSession: this.activeSessionId,
      });
    } catch (error) {
      console.error('[SessionManager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize internal services
   */
  private initializeServices(): void {
    if (!this.context) {
      throw new Error('Context not set');
    }

    // Bound methods for dependencies
    const emitEvent = this.emitEvent.bind(this);
    const saveState = this.saveState.bind(this);
    const getActiveSessionId = () => this.activeSessionId;
    const setActiveSessionId = (id: string | null) => { this.activeSessionId = id; };
    const getActiveProjectId = () => this.activeProjectId;
    const setActiveProjectId = (id: string | null) => { this.activeProjectId = id; };

    // Create persistence service
    this.persistenceService = new SessionPersistenceService({
      context: this.context,
      projects: this.projects,
      config: this.config,
    });

    // Create project detection service
    this.projectService = new ProjectDetectionService({
      projects: this.projects,
      emitEvent,
      saveState,
    });

    // Create session lifecycle service
    this.lifecycleService = new SessionLifecycleService({
      projects: this.projects,
      config: this.config,
      emitEvent,
      saveState,
      getActiveSessionId,
      setActiveSessionId,
      getActiveProjectId,
      setActiveProjectId,
    });

    // Create prompt management service (needs lifecycle for getActiveSession)
    this.promptService = new PromptManagementService({
      projects: this.projects,
      emitEvent,
      saveState,
      getActiveSession: () => this.lifecycleService!.getActiveSession(),
      getActiveProject: () => this.lifecycleService!.getActiveProject(),
    });

    // Create response management service
    this.responseService = new ResponseManagementService({
      projects: this.projects,
      emitEvent,
      saveState,
      getActiveSession: () => this.lifecycleService!.getActiveSession(),
    });
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.eventListeners.clear();
    this.projects.clear();
    this.activeSessionId = null;
    this.activeProjectId = null;
    this.initialized = false;

    // Clear internal services
    this.persistenceService = null;
    this.projectService = null;
    this.lifecycleService = null;
    this.promptService = null;
    this.responseService = null;
  }

  // ============================================
  // PROJECT DETECTION (delegates to ProjectDetectionService)
  // ============================================

  /**
   * Detect current project from workspace
   */
  public async detectCurrentProject(): Promise<Project | null> {
    if (!this.projectService) {
      console.warn('[SessionManager] Project service not initialized');
      return null;
    }
    return this.projectService.detectCurrentProject();
  }

  /**
   * Get or create a default project when no project is detected
   */
  private getOrCreateDefaultProject(): Project {
    if (!this.projectService) {
      throw new Error('Project service not initialized');
    }
    return this.projectService.getOrCreateDefaultProject();
  }

  // ============================================
  // PLATFORM DETECTION
  // ============================================

  /**
   * Detect current platform/tool
   */
  public detectCurrentPlatform(): Platform {
    // Check environment for Cursor
    if (this.isCursorIDE()) {
      return 'cursor';
    }

    // Check for Claude Code (would need specific detection)
    // For now, check if claude CLI extension is active
    if (this.isClaudeCodeActive()) {
      return 'claude_code';
    }

    // Default to vscode
    return 'vscode';
  }

  /**
   * Check if running in Cursor IDE
   */
  private isCursorIDE(): boolean {
    // Check app name
    const appName = vscode.env.appName;
    if (appName?.toLowerCase().includes('cursor')) {
      return true;
    }

    // Check environment variable
    if (process.env.CURSOR_SESSION_ID) {
      return true;
    }

    // Check for Cursor-specific folders
    const configPath = process.env.XDG_CONFIG_HOME || process.env.HOME || '';
    if (configPath.toLowerCase().includes('cursor')) {
      return true;
    }

    return false;
  }

  /**
   * Check if Claude Code is active
   */
  private isClaudeCodeActive(): boolean {
    // Check for Claude Code extension or terminal
    const terminals = vscode.window.terminals;
    for (const terminal of terminals) {
      if (terminal.name.toLowerCase().includes('claude')) {
        return true;
      }
    }

    // Check environment
    if (process.env.CLAUDE_CODE_SESSION) {
      return true;
    }

    return false;
  }

  // ============================================
  // SESSION MANAGEMENT (delegates to SessionLifecycleService)
  // ============================================

  /**
   * Get or create a session for the current project and platform
   */
  public getOrCreateSession(projectId: string, platform: Platform, sourceSessionId?: string): Session {
    if (!this.lifecycleService) {
      throw new Error('Lifecycle service not initialized');
    }
    return this.lifecycleService.getOrCreateSession(projectId, platform, sourceSessionId);
  }

  /**
   * Get active session
   */
  public getActiveSession(): Session | null {
    if (!this.lifecycleService) return null;
    return this.lifecycleService.getActiveSession();
  }

  /**
   * Get active project
   */
  public getActiveProject(): Project | null {
    if (!this.lifecycleService) return null;
    return this.lifecycleService.getActiveProject();
  }

  /**
   * Find a session by its source session ID
   */
  private findSessionBySourceId(sourceSessionId: string): Session | null {
    if (!this.lifecycleService) return null;
    return this.lifecycleService.findSessionBySourceId(sourceSessionId);
  }

  /**
   * Mark a session as read
   */
  public async markSessionAsRead(sessionId: string): Promise<void> {
    if (!this.lifecycleService) return;
    return this.lifecycleService.markSessionAsRead(sessionId);
  }

  /**
   * Switch to a different session
   */
  public async switchSession(sessionId: string): Promise<Session | null> {
    if (!this.lifecycleService) return null;
    return this.lifecycleService.switchSession(sessionId);
  }

  /**
   * End current session
   */
  public async endCurrentSession(): Promise<void> {
    if (!this.lifecycleService) return;
    return this.lifecycleService.endCurrentSession();
  }

  // ============================================
  // CURSOR SESSION INTEGRATION
  // ============================================

  /**
   * Sync session data from Cursor's active composer
   * Called by AutoAnalyzeService when new prompts are detected
   */
  public async syncFromCursorSession(cursorData: {
    composerId: string;
    workspaceName: string | null;
    workspacePath: string | null;
    messageCount: number;
    files?: string[];
  }): Promise<void> {
    if (!cursorData.workspacePath || !this.projectService) {
      return;
    }

    try {
      // Check if project with same path already exists
      let project = this.projectService.findProjectByPath(cursorData.workspacePath);

      if (!project) {
        // Create a new project
        const projectName = cursorData.workspaceName || path.basename(cursorData.workspacePath);
        const projectId = this.projectService.generateProjectId(projectName, cursorData.workspacePath);
        project = this.projectService.createProject(projectId, projectName, cursorData.workspacePath);
        this.projects.set(projectId, project);
        this.emitEvent({ type: 'project_created', projectId, timestamp: new Date() });
        console.log(`[SessionManager] Created project from Cursor: ${projectName}`);
      }

      const projectId = project.id;

      // Get or create session for Cursor platform
      const session = this.getOrCreateSession(projectId, 'cursor', cursorData.composerId);

      // Update active session/project
      this.activeSessionId = session.id;
      this.activeProjectId = projectId;

      // Update session activity
      session.lastActivityTime = new Date();
      project.lastActivityTime = session.lastActivityTime;

      // Store Cursor-specific metadata
      if (!session.metadata) {
        session.metadata = {};
      }
      session.metadata.cursorComposerId = cursorData.composerId;
      session.metadata.cursorMessageCount = cursorData.messageCount;
      session.metadata.files = cursorData.files;

      await this.saveState();

      this.emitEvent({
        type: 'session_activity',
        sessionId: session.id,
        projectId,
        timestamp: new Date(),
      });

      console.log(`[SessionManager] Synced Cursor session: ${project.name} (${cursorData.messageCount} messages)`);
    } catch (error) {
      console.error('[SessionManager] Failed to sync from Cursor session:', error);
    }
  }

  /**
   * Update active session with new prompt from Cursor
   * Called when AutoAnalyzeService detects a new prompt
   */
  public async onCursorPromptDetected(promptData: {
    text: string;
    timestamp: Date;
    sessionId?: string;
  }): Promise<void> {
    const session = this.getActiveSession();
    if (!session) {
      console.warn('[SessionManager] No active session for Cursor prompt');
      return;
    }

    const project = this.projects.get(session.projectId);
    if (!project || !this.promptService) {
      return;
    }

    await this.promptService.addPromptToSession(
      session,
      project,
      promptData.text,
      0,
      undefined,
      { timestamp: promptData.timestamp, truncateLength: 200 }
    );
  }

  // ============================================
  // UNIFIED SOURCE INTEGRATION (New Architecture)
  // ============================================

  /**
   * Sync session data from any prompt source (Cursor, Claude Code, Windsurf, etc.)
   * Called by UnifiedPromptDetectionService when prompts are detected
   */
  public async syncFromSource(sourceData: {
    sourceId: KnownSourceId | string;
    projectPath: string;
    projectName?: string;
    sourceSessionId?: string;
  }): Promise<void> {
    if (!this.projectService) {
      return;
    }

    try {
      const { sourceId, projectPath, projectName: providedName, sourceSessionId } = sourceData;

      // FIRST: Check if session with this sourceSessionId already exists in ANY project
      // This prevents creating duplicate empty sessions when switching between projects
      if (sourceSessionId) {
        const existingSession = this.findSessionBySourceId(sourceSessionId);
        if (existingSession) {
          // Just update the existing session's activity time
          existingSession.lastActivityTime = new Date();
          const existingProject = this.projects.get(existingSession.projectId);
          if (existingProject) {
            existingProject.lastActivityTime = existingSession.lastActivityTime;
          }
          await this.saveState();
          return;
        }
      }

      // Check if project with same path already exists
      let project = this.projectService.findProjectByPath(projectPath);

      if (!project) {
        // Create a new project
        const projectName = providedName || path.basename(projectPath);
        const projectId = this.projectService.generateProjectId(projectName, projectPath);
        project = this.projectService.createProject(projectId, projectName, projectPath);
        this.projects.set(projectId, project);
        this.emitEvent({ type: 'project_created', projectId, timestamp: new Date() });
        console.log(`[SessionManager] Created project from ${sourceId}: ${projectName}`);
      }

      const projectId = project.id;

      // Map source ID to platform
      const platform = SOURCE_TO_PLATFORM[sourceId] || 'vscode';

      // Get or create session for this platform
      const session = this.getOrCreateSession(projectId, platform, sourceSessionId);

      // Update active session/project
      this.activeSessionId = session.id;
      this.activeProjectId = projectId;

      // Update session activity
      session.lastActivityTime = new Date();
      project.lastActivityTime = session.lastActivityTime;

      // Store source-specific metadata
      if (!session.metadata) {
        session.metadata = {};
      }
      session.metadata.sourceId = sourceId;
      session.metadata.sourceSessionId = sourceSessionId;

      await this.saveState();

      this.emitEvent({
        type: 'session_activity',
        sessionId: session.id,
        projectId,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error(`[SessionManager] Failed to sync from source:`, error);
    }
  }

  /**
   * Add prompt from any source to the active session
   * Called by UnifiedPromptDetectionService when a new prompt is detected
   */
  public async onPromptDetected(promptData: {
    id?: string;
    text: string;
    timestamp: Date;
    sourceId: KnownSourceId | string;
    sourceSessionId?: string;
  }): Promise<string> {
    if (!promptData.sourceSessionId) {
      return '';
    }

    let session = this.findSessionBySourceId(promptData.sourceSessionId);

    if (!session) {
      const project = await this.detectCurrentProject() || this.getOrCreateDefaultProject();
      session = this.getOrCreateSession(project.id, this.detectCurrentPlatform(), promptData.sourceSessionId);
    }

    if (session.id !== this.activeSessionId) {
      session.hasUnreadActivity = true;
    }

    const project = this.projects.get(session.projectId);
    if (!project || !this.promptService) {
      return '';
    }

    const prompt = await this.promptService.addPromptToSession(
      session,
      project,
      promptData.text,
      0,
      undefined,
      { id: promptData.id, timestamp: promptData.timestamp, truncateLength: 200 }
    );

    return prompt.id;
  }

  // ============================================
  // PROMPT MANAGEMENT (delegates to PromptManagementService)
  // ============================================

  /**
   * Add a prompt to the active session
   */
  public async addPrompt(
    text: string,
    score: number,
    breakdown?: ScoreBreakdown,
  ): Promise<PromptRecord> {
    // Ensure we have an active session
    let session = this.getActiveSession();

    if (!session) {
      // Auto-detect and create session
      const project = await this.detectCurrentProject();
      const platform = this.detectCurrentPlatform();

      if (!project) {
        throw new Error('No workspace detected');
      }

      session = this.getOrCreateSession(project.id, platform);
      this.activeSessionId = session.id;
      this.activeProjectId = project.id;
    }

    // Check if session has gone stale
    if (this.lifecycleService && !this.lifecycleService.isSessionStillActive(session)) {
      session.isActive = false;
      this.emitEvent({
        type: 'session_ended',
        sessionId: session.id,
        projectId: session.projectId,
        timestamp: new Date(),
      });

      session = this.getOrCreateSession(session.projectId, session.platform);
      this.activeSessionId = session.id;
    }

    // Delegate to prompt service
    if (!this.promptService) {
      throw new Error('Prompt service not initialized');
    }
    return this.promptService.addPrompt(text, score, breakdown);
  }

  /**
   * Update an existing prompt's score and breakdown
   */
  public async updatePromptScore(
    promptId: string,
    score: number,
    breakdown?: ScoreBreakdown,
    enhancedText?: string,
    enhancedScore?: number
  ): Promise<void> {
    if (!this.promptService) return;
    return this.promptService.updatePromptScore(promptId, score, breakdown, enhancedText, enhancedScore);
  }

  /**
   * Get prompts with pagination
   */
  public getPrompts(options: PromptPaginationOptions): PaginatedPrompts {
    if (!this.promptService) {
      return { prompts: [], total: 0, hasMore: false, offset: options.offset, limit: options.limit };
    }
    return this.promptService.getPrompts(options);
  }

  /**
   * Get prompts for active session
   */
  public getActiveSessionPrompts(limit: number = DEFAULT_PROMPTS_PER_PAGE): PaginatedPrompts {
    if (!this.promptService) {
      return { prompts: [], total: 0, hasMore: false, offset: 0, limit };
    }
    return this.promptService.getActiveSessionPrompts(limit);
  }

  // ============================================
  // RESPONSE MANAGEMENT (delegates to ResponseManagementService)
  // ============================================

  /**
   * Add a response to the current session
   */
  public async addResponse(response: CapturedResponse, promptId?: string): Promise<void> {
    if (!this.responseService) return;
    return this.responseService.addResponse(response, promptId);
  }

  /**
   * Get last N interactions (prompt + response pairs)
   */
  public getLastInteractions(count: number): Interaction[] {
    if (!this.responseService) return [];
    return this.responseService.getLastInteractions(count);
  }

  // ============================================
  // GOAL MANAGEMENT (delegates to SessionLifecycleService)
  // ============================================

  /**
   * Set goal for current session
   */
  public async setGoal(goal: string): Promise<void> {
    if (!this.lifecycleService) {
      throw new Error('Lifecycle service not initialized');
    }
    return this.lifecycleService.setGoal(goal);
  }

  /**
   * Mark goal as completed
   */
  public async completeGoal(): Promise<void> {
    if (!this.lifecycleService) {
      throw new Error('Lifecycle service not initialized');
    }
    return this.lifecycleService.completeGoal();
  }

  // ============================================
  // SESSION EDITING (delegates to SessionLifecycleService)
  // ============================================

  /**
   * Update session properties
   */
  public async updateSession(sessionId: string, updates: Partial<Session>): Promise<void> {
    if (!this.lifecycleService) {
      throw new Error('Lifecycle service not initialized');
    }
    return this.lifecycleService.updateSession(sessionId, updates);
  }

  /**
   * Delete a session
   */
  public async deleteSession(sessionId: string): Promise<void> {
    if (!this.lifecycleService) {
      throw new Error('Lifecycle service not initialized');
    }
    return this.lifecycleService.deleteSession(sessionId);
  }

  // ============================================
  // DATA ACCESS
  // ============================================

  /**
   * Get all projects
   */
  public getAllProjects(): Project[] {
    return Array.from(this.projects.values());
  }

  /**
   * Get project by ID
   */
  public getProject(projectId: string): Project | null {
    return this.projects.get(projectId) || null;
  }

  /**
   * Find project by path (case-insensitive, normalized)
   */
  public findProjectByPath(projectPath: string): Project | null {
    if (!this.projectService) return null;
    return this.projectService.findProjectByPath(projectPath);
  }

  /**
   * Get sessions with filter
   */
  public getSessions(filter?: SessionFilterOptions): Session[] {
    let sessions: Session[] = [];

    // Collect sessions from projects
    for (const project of this.projects.values()) {
      if (filter?.projectId && project.id !== filter.projectId) {
        continue;
      }

      for (const session of project.sessions) {
        if (filter?.platform && session.platform !== filter.platform) {
          continue;
        }
        if (filter?.isActive !== undefined && session.isActive !== filter.isActive) {
          continue;
        }
        if (filter?.dateRange) {
          const sessionTime = session.startTime.getTime();
          if (
            sessionTime < filter.dateRange.start.getTime() ||
            sessionTime > filter.dateRange.end.getTime()
          ) {
            continue;
          }
        }
        sessions.push(session);
      }
    }

    // Sort by last activity (most recent first)
    sessions.sort((a, b) => b.lastActivityTime.getTime() - a.lastActivityTime.getTime());

    // Apply limit
    if (filter?.limit) {
      sessions = sessions.slice(0, filter.limit);
    }

    return sessions;
  }

  /**
   * Get session summaries for UI display
   */
  public getSessionSummaries(filter?: SessionFilterOptions): SessionSummary[] {
    return this.getSessions(filter).map(session => {
      const project = this.projects.get(session.projectId);
      return {
        id: session.id,
        projectName: project?.name || 'Unknown',
        platform: session.platform,
        startTime: session.startTime,
        duration: calculateSessionDuration(session),
        promptCount: session.promptCount,
        averageScore: session.averageScore || 0,
        isActive: session.isActive,
        goal: session.goal,
      };
    });
  }

  // ============================================
  // EVENT SYSTEM
  // ============================================

  /**
   * Subscribe to session events
   */
  public subscribe(callback: SessionEventCallback): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  /**
   * Emit event to all listeners
   */
  private emitEvent(event: SessionEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[SessionManager] Event listener error:', error);
      }
    }
  }

  // ============================================
  // PERSISTENCE (delegates to SessionPersistenceService)
  // ============================================

  /**
   * Load state from storage
   */
  private async loadState(): Promise<void> {
    if (!this.persistenceService) return;

    const result = await this.persistenceService.loadState();

    if (result.loaded) {
      this.activeSessionId = result.activeSessionId ?? null;
      this.activeProjectId = result.activeProjectId ?? null;
      if (result.config) {
        this.config = result.config;
      }

      // If deduplication occurred, save the cleaned state
      if (result.deduplicated) {
        await this.saveState();
      }
    }
  }

  /**
   * Save state to storage
   */
  private async saveState(): Promise<void> {
    if (!this.persistenceService) return;
    await this.persistenceService.saveState(this.activeSessionId, this.activeProjectId);
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  /**
   * Update session detection config
   */
  public async updateConfig(config: Partial<SessionDetectionConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    await this.saveState();
  }

  /**
   * Get current config
   */
  public getConfig(): SessionDetectionConfig {
    return { ...this.config };
  }

  // ============================================
  // SIDEBAR STATE (delegates to SessionPersistenceService)
  // ============================================

  /**
   * Save sidebar width
   */
  public async saveSidebarWidth(width: number): Promise<void> {
    if (!this.persistenceService) return;
    await this.persistenceService.saveSidebarWidth(width);
  }

  /**
   * Get sidebar width
   */
  public getSidebarWidth(): number {
    if (!this.persistenceService) return 240;
    return this.persistenceService.getSidebarWidth();
  }

  /**
   * Toggle project expansion state
   */
  public async toggleProjectExpanded(projectId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (project) {
      project.isExpanded = !project.isExpanded;
      await this.saveState();
    }
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get statistics for current state
   */
  public getStats(): {
    totalProjects: number;
    totalSessions: number;
    totalPrompts: number;
    activeSession: SessionSummary | null;
  } {
    let totalSessions = 0;
    let totalPrompts = 0;

    for (const project of this.projects.values()) {
      totalSessions += project.sessions.length;
      totalPrompts += project.totalPrompts;
    }

    const activeSession = this.getActiveSession();
    const activeProject = activeSession
      ? this.projects.get(activeSession.projectId)
      : null;

    return {
      totalProjects: this.projects.size,
      totalSessions,
      totalPrompts,
      activeSession: activeSession
        ? {
            id: activeSession.id,
            projectName: activeProject?.name || 'Unknown',
            platform: activeSession.platform,
            startTime: activeSession.startTime,
            duration: calculateSessionDuration(activeSession),
            promptCount: activeSession.promptCount,
            averageScore: activeSession.averageScore || 0,
            isActive: activeSession.isActive,
            goal: activeSession.goal,
          }
        : null,
    };
  }

  /**
   * Get today's prompts count and average score
   */
  public getTodayStats(): { promptCount: number; averageScore: number } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalScore = 0;
    let count = 0;

    for (const project of this.projects.values()) {
      for (const session of project.sessions) {
        for (const prompt of session.prompts) {
          if (prompt.timestamp >= today) {
            totalScore += prompt.score;
            count++;
          }
        }
      }
    }

    return {
      promptCount: count,
      averageScore: count > 0 ? Math.round((totalScore / count) * 10) / 10 : 0,
    };
  }
}

// Export singleton getter
export function getSessionManager(): SessionManagerService {
  return SessionManagerService.getInstance();
}
