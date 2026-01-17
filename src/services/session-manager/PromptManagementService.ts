/**
 * PromptManagementService - Manages prompts for SessionManager
 *
 * Responsibilities:
 * - Add prompts to sessions
 * - Update prompt scores
 * - Paginated prompt retrieval
 * - Calculate average scores
 */

import type {
  Project,
  Session,
  PromptRecord,
  ScoreBreakdown,
  SessionEvent,
  PromptPaginationOptions,
  PaginatedPrompts,
} from '../types/session-types';
import { generateId, truncateText } from '../types/session-types';
import { MAX_PROMPTS_PER_SESSION } from './types';
import { getGoalService } from '../GoalService';

const DEFAULT_PROMPTS_PER_PAGE = 10;
const DEFAULT_TRUNCATE_LENGTH = 100;

export interface AddPromptOptions {
  id?: string;
  timestamp?: Date;
  truncateLength?: number;
}

interface PromptManagementDeps {
  projects: Map<string, Project>;
  emitEvent: (event: SessionEvent) => void;
  saveState: () => Promise<void>;
  getActiveSession: () => Session | null;
  getActiveProject: () => Project | null;
}

export class PromptManagementService {
  private projects: Map<string, Project>;
  private emitEvent: (event: SessionEvent) => void;
  private saveState: () => Promise<void>;
  private getActiveSession: () => Session | null;
  private getActiveProject: () => Project | null;

  constructor(deps: PromptManagementDeps) {
    this.projects = deps.projects;
    this.emitEvent = deps.emitEvent;
    this.saveState = deps.saveState;
    this.getActiveSession = deps.getActiveSession;
    this.getActiveProject = deps.getActiveProject;
  }

  /**
   * Calculate average score for prompts
   */
  calculateAverageScore(prompts: PromptRecord[]): number {
    if (prompts.length === 0) return 0;
    const sum = prompts.reduce((acc, p) => acc + p.score, 0);
    return Math.round((sum / prompts.length) * 10) / 10;
  }

  /**
   * Add a prompt to the active session
   */
  async addPrompt(
    text: string,
    score: number,
    breakdown?: ScoreBreakdown,
    options?: AddPromptOptions,
  ): Promise<PromptRecord> {
    const session = this.getActiveSession();
    const project = this.getActiveProject();

    if (!session || !project) {
      throw new Error('No workspace detected');
    }

    return this.addPromptToSession(session, project, text, score, breakdown, options);
  }

  /**
   * Add a prompt to a specific session (used by facade for non-active session cases)
   */
  async addPromptToSession(
    session: Session,
    project: Project,
    text: string,
    score: number,
    breakdown?: ScoreBreakdown,
    options?: AddPromptOptions,
  ): Promise<PromptRecord> {
    const truncateLength = options?.truncateLength ?? DEFAULT_TRUNCATE_LENGTH;
    const timestamp = options?.timestamp ?? new Date();

    // Create prompt record
    const prompt: PromptRecord = {
      id: options?.id ?? generateId(),
      sessionId: session.id,
      text,
      truncatedText: truncateText(text, truncateLength),
      timestamp,
      score,
      breakdown,
    };

    // Add to session (most recent first)
    session.prompts.unshift(prompt);
    session.promptCount++;
    session.lastActivityTime = prompt.timestamp;

    console.log('[PromptManagementService] Prompt ADDED to session', {
      promptId: prompt.id,
      sessionId: session.id,
      promptCount: session.promptCount,
      promptsArrayLength: session.prompts.length,
      textPreview: prompt.text?.substring(0, 50),
    });

    // Update project stats
    project.totalPrompts++;
    project.lastActivityTime = prompt.timestamp;

    // Trim if exceeds max
    if (session.prompts.length > MAX_PROMPTS_PER_SESSION) {
      session.prompts = session.prompts.slice(0, MAX_PROMPTS_PER_SESSION);
    }

    // Calculate average score
    session.averageScore = this.calculateAverageScore(session.prompts);

    // Emit event
    this.emitEvent({
      type: 'prompt_added',
      sessionId: session.id,
      promptId: prompt.id,
      projectId: session.projectId,
      timestamp: prompt.timestamp,
      data: { score },
    });

    // Save state
    await this.saveState();

    // Trigger goal progress analysis check (non-blocking)
    try {
      console.log(`[PromptManagementService] 📝 Prompt added to session ${session.id}, triggering goal progress check...`);
      getGoalService().onPromptAdded(session.id);
    } catch (error) {
      // Don't fail prompt add if goal service has issues
      console.warn('[PromptManagementService] Goal progress check failed:', error);
    }

    return prompt;
  }

  /**
   * Update an existing prompt's score and breakdown
   */
  async updatePromptScore(
    promptId: string,
    score: number,
    breakdown?: ScoreBreakdown,
    enhancedText?: string,
    enhancedScore?: number
  ): Promise<void> {
    // Find prompt across all sessions
    for (const project of this.projects.values()) {
      for (const session of project.sessions) {
        const prompt = session.prompts.find(p => p.id === promptId);
        if (prompt) {
          prompt.score = score;
          prompt.breakdown = breakdown;

          if (enhancedText !== undefined) {
            prompt.enhancedText = enhancedText;
          }
          if (enhancedScore !== undefined) {
            prompt.enhancedScore = enhancedScore;
          }

          // Recalculate session average score
          session.averageScore = this.calculateAverageScore(session.prompts);

          // Emit update event
          this.emitEvent({
            type: 'prompt_updated',
            sessionId: session.id,
            promptId,
            projectId: session.projectId,
            timestamp: new Date(),
            data: { score },
          });

          // Save state
          await this.saveState();
          return;
        }
      }
    }

    console.warn(`[PromptManagementService] Prompt ${promptId} not found`);
  }

  /**
   * Get prompts with pagination
   */
  getPrompts(options: PromptPaginationOptions): PaginatedPrompts {
    const { sessionId, offset, limit } = options;

    // Find session
    let prompts: PromptRecord[] = [];
    for (const project of this.projects.values()) {
      const session = project.sessions.find(s => s.id === sessionId);
      if (session) {
        prompts = session.prompts;
        break;
      }
    }

    const total = prompts.length;
    const paginatedPrompts = prompts.slice(offset, offset + limit);

    return {
      prompts: paginatedPrompts,
      total,
      hasMore: offset + limit < total,
      offset,
      limit,
    };
  }

  /**
   * Get prompts for active session
   */
  getActiveSessionPrompts(limit: number = DEFAULT_PROMPTS_PER_PAGE): PaginatedPrompts {
    const session = this.getActiveSession();
    if (!session) {
      return { prompts: [], total: 0, hasMore: false, offset: 0, limit };
    }
    return this.getPrompts({ sessionId: session.id, offset: 0, limit });
  }
}
