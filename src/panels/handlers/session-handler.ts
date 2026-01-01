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

export class SessionHandler extends BaseMessageHandler {
  private sharedContext: SharedContext;

  constructor(
    messageSender: MessageSender,
    handlerContext: HandlerContext,
    sharedContext: SharedContext
  ) {
    super(messageSender, handlerContext);
    this.sharedContext = sharedContext;
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
      } else {
        console.warn('[SessionHandler] Session not found:', sessionId);
        this.send('error', { operation: 'switchSession', message: 'Session not found' });
      }
    } catch (error) {
      console.error('[SessionHandler] Failed to switch session:', error);
      this.send('error', { operation: 'switchSession', message: error instanceof Error ? error.message : 'Failed to switch session' });
    }
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
      if (!sessionManagerService) {
        this.send('v2SessionList', { sessions: [], projects: [] });
        return;
      }
      const options: { limit?: number; projectId?: string } = {};
      if (data?.limit) options.limit = data.limit;
      if (data?.projectId) options.projectId = data.projectId;

      const allSessions = sessionManagerService.getSessions(options);
      // Filter out empty sessions (0 prompts) - they provide no value to the user
      const sessions = allSessions.filter(s => s.promptCount > 0);

      // Also filter sessions inside each project before sending to webview
      const allProjects = sessionManagerService.getAllProjects();
      const projects = allProjects.map(p => ({
        ...p,
        sessions: p.sessions.filter(s => s.promptCount > 0)
      }));

      this.send('v2SessionList', { sessions, projects });
    } catch (error) {
      console.error('[SessionHandler] Failed to get session list:', error);
      this.send('v2SessionList', { sessions: [], projects: [] });
    }
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
      if (!sessionManagerService) {
        this.send('v2Prompts', { prompts: [], total: 0, hasMore: false, offset: 0, limit: 20 });
        return;
      }
      // If no sessionId provided, get prompts from active session
      const activeSession = sessionManagerService.getActiveSession();
      const sessionId = data?.sessionId || activeSession?.id;

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
