/**
 * SessionHandler - Handles session management and daily stats messages
 *
 * Responsibilities:
 * - Get/switch active session
 * - List sessions and projects
 * - Get prompts for sessions
 * - Daily stats
 * - Rename/delete sessions
 */

import { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
import { SharedContext } from './shared-context';
import { getCoachingService } from '../../services/CoachingService';
import type { WebviewMessageData } from '../../shared/webview-protocol';
import type { UnifiedSession } from '../../services/UnifiedSessionService';
import type { Session, Project, Platform, PromptRecord } from '../../services/types/session-types';
import type { Message } from '../../types/message.types';
import * as crypto from 'crypto';

export class SessionHandler extends BaseMessageHandler {
  private sharedContext: SharedContext;

  /**
   * Cache for goal progress and title data that can be applied to sessions from any source.
   * Key: session ID (or sourceSessionId for cross-source matching)
   * Value: { progress: number, goal?: string, customName?: string }
   * This allows goal data to persist across session list refreshes and be applied
   * to sessions from UnifiedSessionService (which don't store goal data).
   */
  private goalProgressCache: Map<string, { progress: number; goal?: string; customName?: string }> = new Map();

  constructor(
    messageSender: MessageSender,
    handlerContext: HandlerContext,
    sharedContext: SharedContext
  ) {
    super(messageSender, handlerContext);
    this.sharedContext = sharedContext;
  }

  /**
   * Update the goal progress cache for a session.
   * Called when goal progress is analyzed.
   */
  public updateGoalProgressCache(sessionId: string, progress: number, goal?: string, customName?: string): void {
    this.goalProgressCache.set(sessionId, { progress, goal, customName });
  }

  /**
   * Extract the base session ID for cross-source matching.
   * UnifiedSessionService IDs: "claude-<originalId>"
   * SessionManagerService IDs: "<timestamp>-<random>" with metadata.sourceSessionId
   */
  private getSourceSessionId(session: Session): string | undefined {
    // For hook-captured sessions, check metadata.sourceSessionId
    if (session.metadata?.sourceSessionId) {
      return session.metadata.sourceSessionId;
    }
    // For UnifiedSessionService sessions, the ID is "claude-<originalId>"
    // Extract the originalId part
    if (session.id.startsWith('claude-')) {
      return session.id.substring(7); // Remove "claude-" prefix
    }
    return undefined;
  }

  getHandledMessageTypes(): string[] {
    return [
      'v2GetActiveSession',
      'switchSession',
      'markSessionAsRead',
      'v2GetSessionList',
      'v2GetPrompts',
      'loadMorePrompts',
      'v2GetDailyStats',
      'renameSession',
      'deleteSession',
    ];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    switch (type) {
      case 'v2GetActiveSession':
        await this.handleV2GetActiveSession();
        return true;
      case 'switchSession': {
        const d = data as WebviewMessageData<'switchSession'>;
        await this.handleSwitchSession(d.sessionId);
        return true;
      }
      case 'markSessionAsRead': {
        const d = data as WebviewMessageData<'markSessionAsRead'>;
        await this.handleMarkSessionAsRead(d.sessionId);
        return true;
      }
      case 'v2GetSessionList':
        await this.handleV2GetSessionList();
        return true;
      case 'v2GetPrompts': {
        const d = data as WebviewMessageData<'v2GetPrompts'>;
        await this.handleV2GetPrompts(d);
        return true;
      }
      case 'loadMorePrompts': {
        const d = data as { sessionId?: string; currentCount?: number } | undefined;
        await this.handleLoadMorePrompts(d);
        return true;
      }
      case 'v2GetDailyStats':
        await this.handleV2GetDailyStats();
        return true;
      case 'renameSession': {
        const d = data as WebviewMessageData<'renameSession'>;
        await this.handleRenameSession(d.sessionId, d.name);
        return true;
      }
      case 'deleteSession': {
        const d = data as WebviewMessageData<'deleteSession'>;
        await this.handleDeleteSession(d.sessionId);
        return true;
      }
      default:
        return false;
    }
  }

  private async handleV2GetActiveSession(): Promise<void> {
    try {
      const sessionManagerService = this.sharedContext.sessionManagerService;
      if (!sessionManagerService) {
        this.send('v2ActiveSession', { sessionId: null, session: null, project: null, goal: null });
        return;
      }
      const session = sessionManagerService.getActiveSession();
      const project = session
        ? sessionManagerService.getProject(session.projectId)
        : null;

      this.send('v2ActiveSession', {
        sessionId: session?.id || null,
        session,
        project,
        goal: session?.goal || null,
      });
    } catch (error) {
      console.error('[SessionHandler] Failed to get active session:', error);
      this.send('v2ActiveSession', { sessionId: null, session: null, project: null, goal: null });
    }
  }

  private async handleSwitchSession(sessionId: string): Promise<void> {
    if (!sessionId) {
      console.warn('[SessionHandler] switchSession called without sessionId');
      return;
    }

    try {
      // Check if this is a Claude session (ID starts with 'claude-')
      if (this.isClaudeSession(sessionId)) {
        await this.handleSwitchClaudeSession(sessionId);
        return;
      }

      const sessionManagerService = this.sharedContext.sessionManagerService;
      if (!sessionManagerService) {
        this.send('error', { operation: 'switchSession', message: 'Session service not initialized' });
        return;
      }
      const session = await sessionManagerService.switchSession(sessionId);
      if (session) {
        const project = sessionManagerService.getProject(session.projectId);
        this.send('v2ActiveSession', {
          sessionId: session.id,
          session,
          project,
          goal: session.goal || null,
        });
        // Also refresh prompts for the new session
        await this.handleV2GetPrompts({ sessionId });

        // Auto-select the first (most recent) prompt to display in main view
        const prompts = sessionManagerService.getPrompts({
          sessionId,
          offset: 0,
          limit: 1,
        });
        if (prompts.prompts.length > 0) {
          const firstPrompt = prompts.prompts[0];
          // VIB-44: Include enhanced prompt data (map backend names to frontend names)
          this.send('v2PromptAutoSelected', {
            prompt: {
              ...firstPrompt,
              timestamp: firstPrompt.timestamp instanceof Date
                ? firstPrompt.timestamp.toISOString()
                : firstPrompt.timestamp,
              // Map backend field names to frontend expected names
              improvedVersion: firstPrompt.enhancedText,
              improvedScore: firstPrompt.enhancedScore,
            },
          });
        } else {
          // No prompts in session - clear the main view
          this.send('v2PromptAutoSelected', { prompt: null });
        }

        // Refresh session list so unread flags clear in UI
        await this.handleV2GetSessionList();

        // Update coaching for the new session's first prompt
        const coachingService = getCoachingService();
        if (prompts.prompts.length > 0) {
          const firstPromptId = prompts.prompts[0].id;
          // Set current prompt context and try to get coaching for it
          coachingService.setCurrentPromptId(firstPromptId);
          const coaching = await coachingService.getCoachingForPrompt(firstPromptId);
          this.send('coachingUpdated', { coaching });
        } else {
          // No prompts in session - clear coaching
          coachingService.setCurrentPromptId(null);
          this.send('coachingUpdated', { coaching: null });
        }

        // Trigger goal analysis if session needs it
        this.triggerGoalAnalysisIfNeeded(session);
      } else {
        console.warn('[SessionHandler] Session not found:', sessionId);
        this.send('error', { operation: 'switchSession', message: 'Session not found' });
      }
    } catch (error) {
      console.error('[SessionHandler] Failed to switch session:', error);
      this.send('error', { operation: 'switchSession', message: error instanceof Error ? error.message : 'Failed to switch session' });
    }
  }

  /**
   * Check if session ID is a Claude Code session
   */
  private isClaudeSession(sessionId: string): boolean {
    return sessionId.startsWith('claude-');
  }

  /**
   * Trigger goal analysis for a session if needed.
   * Conditions: has prompts, no goal, no goalProgress yet
   */
  private async triggerGoalAnalysisIfNeeded(session: Session): Promise<void> {
    // Don't analyze if no prompts
    if (session.promptCount < 1) return;

    // Don't analyze if already has goal or goalProgress
    if (session.goal || session.goalProgress !== undefined) return;

    const goalService = this.sharedContext.goalService;
    if (!goalService) {
      return;
    }

    console.log(`[SessionHandler] Triggering goal analysis for session ${session.id}`);
    // Fire and forget - analysis will push updates via callback
    goalService.analyzeGoalProgress(session.id).catch(error => {
      console.error('[SessionHandler] Goal analysis failed:', error);
    });
  }

  /**
   * Handle switching to a Claude Code session
   * Fetches session details and shows the last user message
   */
  private async handleSwitchClaudeSession(sessionId: string): Promise<void> {
    const unifiedSessionService = this.sharedContext.unifiedSessionService;
    if (!unifiedSessionService?.isReady()) {
      this.send('error', { operation: 'switchSession', message: 'Claude session service not available' });
      return;
    }

    try {
      // Fetch session details (includes messages)
      const details = await unifiedSessionService.getSessionDetails(sessionId);
      if (!details) {
        this.send('error', { operation: 'switchSession', message: 'Claude session not found' });
        return;
      }

      // Find the session in our merged list to get project info
      const result = await unifiedSessionService.getUnifiedSessions({
        sources: ['claude_code'],
        since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        minPromptCount: 1,
      });
      const unifiedSession = result.sessions.find(s => s.id === sessionId);

      // Build a Session object for the UI
      const projectId = unifiedSession?.workspacePath
        ? this.generateProjectId(unifiedSession.workspacePath)
        : 'unknown';

      const session: Session = {
        id: sessionId,
        projectId,
        platform: 'claude_code',
        startTime: unifiedSession?.startTime || new Date(),
        lastActivityTime: unifiedSession?.endTime || new Date(),
        promptCount: this.countActualUserPrompts(details.messages),
        prompts: [],
        responses: [],
        isActive: false,
        totalDuration: unifiedSession?.duration,
        metadata: {
          files: details.fileContext || [],
        },
      };

      const project: Project = {
        id: projectId,
        name: unifiedSession?.workspaceName || 'Claude Session',
        path: unifiedSession?.workspacePath,
        sessions: [session],
        isExpanded: true,
        totalSessions: 1,
        totalPrompts: session.promptCount,
        lastActivityTime: session.lastActivityTime,
      };

      this.send('v2ActiveSession', {
        sessionId: session.id,
        session,
        project,
        goal: null,
      });

      // Get the last user message to display
      const lastUserMessage = this.getLastUserMessage(details.messages);
      if (lastUserMessage) {
        const prompt = this.convertMessageToPrompt(lastUserMessage, sessionId);
        this.send('v2PromptAutoSelected', {
          prompt: {
            ...prompt,
            timestamp: prompt.timestamp instanceof Date
              ? prompt.timestamp.toISOString()
              : prompt.timestamp,
          },
        });

        // Send prompts list with just the last message
        const totalPrompts = this.countActualUserPrompts(details.messages);
        this.send('v2Prompts', {
          prompts: [prompt],
          total: totalPrompts,
          hasMore: totalPrompts > 1,
          offset: 0,
          limit: 1,
        });
      } else {
        this.send('v2PromptAutoSelected', { prompt: null });
        this.send('v2Prompts', {
          prompts: [],
          total: 0,
          hasMore: false,
          offset: 0,
          limit: 20,
        });
      }

      // Clear coaching for Claude sessions (not scored)
      const coachingService = getCoachingService();
      coachingService.setCurrentPromptId(null);
      this.send('coachingUpdated', { coaching: null });

      // Trigger goal analysis if session needs it
      this.triggerGoalAnalysisIfNeeded(session);

    } catch (error) {
      console.error('[SessionHandler] Failed to switch to Claude session:', error);
      this.send('error', { operation: 'switchSession', message: error instanceof Error ? error.message : 'Failed to load Claude session' });
    }
  }

  /**
   * Get the last actual user prompt from a messages array
   * Filters out tool results which also have role 'user'
   */
  private getLastUserMessage(messages: Message[]): Message | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'user' && this.isActualUserPrompt(msg.content)) {
        return msg;
      }
    }
    return null;
  }

  /**
   * Check if message content is an actual user prompt (not tool result)
   * Tool results contain [Tool result] or [Tool: ...] markers
   */
  private isActualUserPrompt(content: string): boolean {
    // Skip empty content
    if (!content || content.trim().length === 0) {
      return false;
    }
    // Skip tool results (these are machine-generated, not user prompts)
    if (content.startsWith('[Tool result]') || content.startsWith('[Tool:')) {
      return false;
    }
    // Skip if content is mostly tool markers
    const toolMarkerPattern = /^\s*\[Tool[^\]]*\]\s*$/;
    if (toolMarkerPattern.test(content)) {
      return false;
    }
    return true;
  }

  /**
   * Count actual user prompts in a messages array (excludes tool results)
   */
  private countActualUserPrompts(messages: Message[]): number {
    return messages.filter(m => m.role === 'user' && this.isActualUserPrompt(m.content)).length;
  }

  /**
   * Convert a Message to a PromptRecord for display
   */
  private convertMessageToPrompt(message: Message, sessionId: string): PromptRecord {
    const truncatedText = message.content.length > 100
      ? message.content.substring(0, 97) + '...'
      : message.content;

    return {
      id: `${sessionId}-${message.timestamp.getTime()}`,
      sessionId,
      text: message.content,
      truncatedText,
      timestamp: message.timestamp,
      score: 0, // Claude sessions aren't scored
    };
  }

  private async handleMarkSessionAsRead(sessionId: string): Promise<void> {
    if (!sessionId) return;
    const sessionManagerService = this.sharedContext.sessionManagerService;
    if (!sessionManagerService) return;
    await sessionManagerService.markSessionAsRead(sessionId);
    await this.handleV2GetSessionList();
  }

  private async handleV2GetSessionList(data?: { limit?: number; projectId?: string }): Promise<void> {
    try {
      const sessionManagerService = this.sharedContext.sessionManagerService;
      const unifiedSessionService = this.sharedContext.unifiedSessionService;

      // Get hook-captured projects
      let hookProjects: Project[] = [];

      if (sessionManagerService) {
        const options: { limit?: number; projectId?: string } = {};
        if (data?.limit) options.limit = data.limit;
        if (data?.projectId) options.projectId = data.projectId;

        const allProjects = sessionManagerService.getAllProjects();
        hookProjects = allProjects.map(p => ({
          ...p,
          sessions: p.sessions.filter(s => s.promptCount > 0)
        }));

        // Populate goalProgressCache from hook-captured sessions
        // This ensures goal data persists and can be applied to sessions from any source
        // Note: We merge with existing cache entries to preserve previously set values
        for (const project of hookProjects) {
          for (const session of project.sessions) {
            // Cache by session ID - merge with existing entry
            if (session.goalProgress !== undefined || session.goal || session.customName) {
              const existingEntry = this.goalProgressCache.get(session.id);
              this.goalProgressCache.set(session.id, {
                // Prefer existing progress if session has undefined, else use session's value
                progress: session.goalProgress ?? existingEntry?.progress ?? 0,
                // Prefer session's goal if defined, else keep existing
                goal: session.goal ?? existingEntry?.goal,
                // Prefer session's customName if defined, else keep existing
                customName: session.customName ?? existingEntry?.customName,
              });
            }
            // Also cache by sourceSessionId for cross-source matching
            const sourceId = this.getSourceSessionId(session);
            if (sourceId && (session.goalProgress !== undefined || session.goal || session.customName)) {
              const existingEntry = this.goalProgressCache.get(sourceId);
              this.goalProgressCache.set(sourceId, {
                progress: session.goalProgress ?? existingEntry?.progress ?? 0,
                goal: session.goal ?? existingEntry?.goal,
                customName: session.customName ?? existingEntry?.customName,
              });
            }
          }
        }
      }

      // Get Claude Code sessions from UnifiedSessionService
      let claudeProjects: Project[] = [];
      if (unifiedSessionService?.isReady()) {
        try {
          // Fetch last 90 days of sessions
          const result = await unifiedSessionService.getUnifiedSessions({
            sources: ['claude_code'],
            since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            minPromptCount: 1,
          });
          claudeProjects = this.buildProjectsFromUnifiedSessions(result.sessions);
        } catch (error) {
          console.error('[SessionHandler] Failed to fetch Claude sessions:', error);
        }
      }

      // Merge projects from both sources
      const mergedProjects = this.mergeProjects(hookProjects, claudeProjects);

      // Apply goal data cache to all sessions
      // This ensures sessions from UnifiedSessionService get goal data if available
      for (const project of mergedProjects) {
        for (const session of project.sessions) {
          // Try to find cached data by session ID first
          let cached = this.goalProgressCache.get(session.id);

          // If not found, try by sourceSessionId for cross-source matching
          if (!cached) {
            const sourceId = this.getSourceSessionId(session);
            if (sourceId) {
              cached = this.goalProgressCache.get(sourceId);
            }
          }

          // Apply cached data if found
          if (cached) {
            if (cached.progress !== undefined && cached.progress > 0) {
              session.goalProgress = cached.progress;
            }
            if (cached.goal && !session.goal) {
              session.goal = cached.goal;
            }
            if (cached.customName && !session.customName) {
              session.customName = cached.customName;
            }
          }
        }
      }

      // Flatten sessions for the sessions list
      const allMergedSessions = mergedProjects.flatMap(p => p.sessions);

      this.send('v2SessionList', { sessions: allMergedSessions, projects: mergedProjects });
    } catch (error) {
      console.error('[SessionHandler] Failed to get session list:', error);
      this.send('v2SessionList', { sessions: [], projects: [] });
    }
  }


  /**
   * Convert UnifiedSession to the Session type used by the webview
   */
  private convertUnifiedToSession(unified: UnifiedSession, projectId: string): Session {
    return {
      id: unified.id,
      projectId,
      platform: unified.source as Platform,
      startTime: unified.startTime,
      lastActivityTime: unified.endTime,
      promptCount: unified.promptCount,
      prompts: [],
      responses: [],
      isActive: unified.status === 'active',
      totalDuration: unified.duration,
      // Goal-related fields: Claude Code sessions don't have goal tracking
      // Explicitly set to undefined to distinguish from "0% progress"
      goal: undefined,
      goalProgress: undefined,
      customName: undefined,
      // Token usage for context window tracking
      tokenUsage: unified.tokenUsage ? {
        totalTokens: unified.tokenUsage.totalTokens,
        contextUtilization: unified.tokenUsage.contextUtilization,
      } : undefined,
      metadata: {
        files: unified.fileContext,
      },
    };
  }

  /**
   * Generate a stable project ID from workspace path
   */
  private generateProjectId(workspacePath: string): string {
    const normalizedPath = workspacePath.toLowerCase().replace(/\\/g, '/');
    return crypto.createHash('md5').update(normalizedPath).digest('hex').substring(0, 12);
  }

  /**
   * Build Project objects from UnifiedSessions, grouped by workspace path
   */
  private buildProjectsFromUnifiedSessions(sessions: UnifiedSession[]): Project[] {
    const projectMap = new Map<string, Project>();

    for (const session of sessions) {
      const workspacePath = session.workspacePath || 'unknown';
      const projectId = this.generateProjectId(workspacePath);

      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, {
          id: projectId,
          name: session.workspaceName,
          path: session.workspacePath,
          sessions: [],
          isExpanded: true,
          totalSessions: 0,
          totalPrompts: 0,
          lastActivityTime: undefined,
        });
      }

      const project = projectMap.get(projectId)!;
      const convertedSession = this.convertUnifiedToSession(session, projectId);
      project.sessions.push(convertedSession);
      project.totalSessions++;
      project.totalPrompts += session.promptCount;

      // Update lastActivityTime to the most recent
      const sessionEnd = session.endTime;
      if (!project.lastActivityTime || sessionEnd > project.lastActivityTime) {
        project.lastActivityTime = sessionEnd;
      }
    }

    // Sort sessions within each project by startTime (most recent first)
    for (const project of projectMap.values()) {
      project.sessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    }

    return Array.from(projectMap.values());
  }

  /**
   * Merge projects from hook-captured and Claude sessions.
   * Deduplicates by matching workspace paths.
   */
  private mergeProjects(hookProjects: Project[], claudeProjects: Project[]): Project[] {
    // Create a map of hook projects by normalized path
    const hookProjectsByPath = new Map<string, Project>();
    for (const p of hookProjects) {
      if (p.path) {
        const normalizedPath = p.path.toLowerCase().replace(/\\/g, '/');
        hookProjectsByPath.set(normalizedPath, p);
      }
    }

    // Track which Claude projects were merged
    const mergedClaudeProjectIds = new Set<string>();

    // Merge Claude sessions into existing hook projects where paths match
    for (const claudeProject of claudeProjects) {
      if (!claudeProject.path) continue;
      const normalizedPath = claudeProject.path.toLowerCase().replace(/\\/g, '/');
      const existingProject = hookProjectsByPath.get(normalizedPath);

      if (existingProject) {
        // Merge Claude sessions into existing project
        // Avoid duplicates by checking session IDs
        const existingSessionIds = new Set(existingProject.sessions.map(s => s.id));
        for (const claudeSession of claudeProject.sessions) {
          if (!existingSessionIds.has(claudeSession.id)) {
            existingProject.sessions.push(claudeSession);
            existingProject.totalSessions++;
            existingProject.totalPrompts += claudeSession.promptCount;
          }
        }
        // Update lastActivityTime if Claude has more recent activity
        if (claudeProject.lastActivityTime && (!existingProject.lastActivityTime || claudeProject.lastActivityTime > existingProject.lastActivityTime)) {
          existingProject.lastActivityTime = claudeProject.lastActivityTime;
        }
        // Re-sort sessions by startTime
        existingProject.sessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
        mergedClaudeProjectIds.add(claudeProject.id);
      }
    }

    // Add Claude projects that weren't merged into existing projects
    const unmergedClaudeProjects = claudeProjects.filter(p => !mergedClaudeProjectIds.has(p.id));

    // Combine and sort all projects by lastActivityTime
    const allProjects = [...hookProjects, ...unmergedClaudeProjects];
    allProjects.sort((a, b) => {
      const aTime = a.lastActivityTime?.getTime() || 0;
      const bTime = b.lastActivityTime?.getTime() || 0;
      return bTime - aTime;
    });

    return allProjects;
  }

  private async handleLoadMorePrompts(data?: { sessionId?: string; currentCount?: number }): Promise<void> {
    // Delegate to handleV2GetPrompts with offset = currentCount
    await this.handleV2GetPrompts({
      sessionId: data?.sessionId,
      offset: data?.currentCount || 0,
      limit: 20,
    });
  }

  private async handleV2GetPrompts(data?: { sessionId?: string; offset?: number; limit?: number }): Promise<void> {
    try {
      const sessionManagerService = this.sharedContext.sessionManagerService;
      const sessionId = data?.sessionId || sessionManagerService?.getActiveSession()?.id;

      if (!sessionId) {
        this.send('v2Prompts', {
          prompts: [],
          total: 0,
          hasMore: false,
          offset: 0,
          limit: data?.limit || 20,
        });
        return;
      }

      // Handle Claude sessions separately
      if (this.isClaudeSession(sessionId)) {
        await this.handleGetClaudePrompts(sessionId, data?.offset || 0, data?.limit || 20);
        return;
      }

      if (!sessionManagerService) {
        this.send('v2Prompts', { prompts: [], total: 0, hasMore: false, offset: 0, limit: 20 });
        return;
      }

      const paginatedPrompts = sessionManagerService.getPrompts({
        sessionId,
        offset: data?.offset || 0,
        limit: data?.limit || 20,
      });

      this.send('v2Prompts', paginatedPrompts);
    } catch (error) {
      console.error('[SessionHandler] Failed to get prompts:', error);
      this.send('v2Prompts', {
        prompts: [],
        total: 0,
        hasMore: false,
        offset: 0,
        limit: 20,
      });
    }
  }

  /**
   * Get prompts for a Claude Code session
   * Shows the last user message (most recent first)
   */
  private async handleGetClaudePrompts(sessionId: string, offset: number, limit: number): Promise<void> {
    const unifiedSessionService = this.sharedContext.unifiedSessionService;
    if (!unifiedSessionService?.isReady()) {
      this.send('v2Prompts', { prompts: [], total: 0, hasMore: false, offset, limit });
      return;
    }

    try {
      const details = await unifiedSessionService.getSessionDetails(sessionId);
      if (!details) {
        this.send('v2Prompts', { prompts: [], total: 0, hasMore: false, offset, limit });
        return;
      }

      // Filter to actual user prompts (not tool results) and reverse to get most recent first
      const userMessages = details.messages
        .filter(m => m.role === 'user' && this.isActualUserPrompt(m.content))
        .reverse();

      const total = userMessages.length;

      // Apply pagination
      const paginatedMessages = userMessages.slice(offset, offset + limit);
      const prompts = paginatedMessages.map(m => this.convertMessageToPrompt(m, sessionId));

      this.send('v2Prompts', {
        prompts,
        total,
        hasMore: offset + limit < total,
        offset,
        limit,
      });
    } catch (error) {
      console.error('[SessionHandler] Failed to get Claude prompts:', error);
      this.send('v2Prompts', { prompts: [], total: 0, hasMore: false, offset, limit });
    }
  }

  private async handleV2GetDailyStats(): Promise<void> {
    try {
      const dailyStatsService = this.sharedContext.dailyStatsService;
      if (!dailyStatsService) {
        this.send('v2DailyStats', { stats: null, error: 'Stats service not initialized' });
        return;
      }
      const stats = dailyStatsService.getDailyStats();
      this.send('v2DailyStats', { stats });
    } catch (error) {
      console.error('[SessionHandler] Failed to get daily stats:', error);
      this.send('v2DailyStats', { stats: null, error: 'Failed to load stats' });
    }
  }

  private async handleRenameSession(sessionId: string, customName: string): Promise<void> {
    if (!sessionId || !customName) {
      this.send('error', { operation: 'renameSession', message: 'Session ID and name are required' });
      return;
    }

    try {
      const sessionManagerService = this.sharedContext.sessionManagerService;
      if (!sessionManagerService) {
        this.send('error', { operation: 'renameSession', message: 'Session service not initialized' });
        return;
      }
      await sessionManagerService.updateSession(sessionId, { customName });
      this.send('sessionRenamed', { sessionId, customName });
    } catch (error) {
      console.error('[SessionHandler] Rename session failed:', error);
      this.send('error', { operation: 'renameSession', message: error instanceof Error ? error.message : 'Failed to rename session' });
    }
  }

  private async handleDeleteSession(sessionId: string): Promise<void> {
    if (!sessionId) {
      this.send('error', { operation: 'deleteSession', message: 'Session ID is required' });
      return;
    }

    try {
      const sessionManagerService = this.sharedContext.sessionManagerService;
      if (!sessionManagerService) {
        this.send('error', { operation: 'deleteSession', message: 'Session service not initialized' });
        return;
      }
      await sessionManagerService.deleteSession(sessionId);
      this.send('sessionDeleted', { sessionId });
      await this.handleV2GetSessionList(); // Fixed: Added missing await
    } catch (error) {
      console.error('[SessionHandler] Delete session failed:', error);
      this.send('error', { operation: 'deleteSession', message: error instanceof Error ? error.message : 'Failed to delete session' });
    }
  }
}
