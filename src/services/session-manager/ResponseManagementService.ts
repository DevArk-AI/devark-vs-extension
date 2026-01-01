/**
 * ResponseManagementService - Manages responses for SessionManager
 *
 * Responsibilities:
 * - Add responses to sessions
 * - Map response outcomes
 * - Link responses to prompts
 * - Get interactions (prompt+response pairs)
 */

import type {
  Session,
  ResponseRecord,
  SessionEvent,
  Interaction,
} from '../types/session-types';
import type { CapturedResponse } from '../types/response-types';
import { MAX_PROMPTS_PER_SESSION } from './types';

interface ResponseManagementDeps {
  projects: Map<string, unknown>;
  emitEvent: (event: SessionEvent) => void;
  saveState: () => Promise<void>;
  getActiveSession: () => Session | null;
}

export class ResponseManagementService {
  private emitEvent: (event: SessionEvent) => void;
  private saveState: () => Promise<void>;
  private getActiveSession: () => Session | null;

  constructor(deps: ResponseManagementDeps) {
    this.emitEvent = deps.emitEvent;
    this.saveState = deps.saveState;
    this.getActiveSession = deps.getActiveSession;
  }

  /**
   * Map CapturedResponse to outcome type
   */
  mapResponseOutcome(response: CapturedResponse): 'success' | 'partial' | 'error' {
    if (!response.success) {
      return 'error';
    }
    if (response.reason === 'cancelled' || response.stopReason === 'aborted') {
      return 'partial';
    }
    return 'success';
  }

  /**
   * Find the most recent prompt ID to link with the response
   */
  findMatchingPromptId(response: CapturedResponse, session: Session): string {
    if (response.promptId) {
      return response.promptId;
    }

    if (session.prompts.length > 0) {
      return session.prompts[0].id;
    }

    return '';
  }

  /**
   * Add a response to the current session
   */
  async addResponse(response: CapturedResponse, promptId?: string): Promise<void> {
    const session = this.getActiveSession();
    if (!session) {
      console.warn('[ResponseManagementService] No active session for response');
      return;
    }

    const outcome = this.mapResponseOutcome(response);

    const responseRecord: ResponseRecord = {
      id: response.id,
      promptId: promptId || this.findMatchingPromptId(response, session),
      timestamp: new Date(response.timestamp),
      text: (response.response || '').slice(0, 2000),
      outcome,
      filesModified: response.filesModified || [],
      toolCalls: response.toolCalls?.map(t => t.name) || [],
      source: response.source,
    };

    // Initialize responses array if missing
    if (!session.responses) {
      session.responses = [];
    }

    session.responses.unshift(responseRecord);

    // Keep responses within limit
    if (session.responses.length > MAX_PROMPTS_PER_SESSION) {
      session.responses = session.responses.slice(0, MAX_PROMPTS_PER_SESSION);
    }

    this.emitEvent({
      type: 'response_added',
      sessionId: session.id,
      promptId: responseRecord.promptId,
      responseId: responseRecord.id,
      projectId: session.projectId,
      timestamp: responseRecord.timestamp,
    });

    await this.saveState();
    console.log(`[ResponseManagementService] Response added, linked to prompt: ${responseRecord.promptId}`);
  }

  /**
   * Get last N interactions (prompt + response pairs)
   */
  getLastInteractions(count: number): Interaction[] {
    const session = this.getActiveSession();
    if (!session) return [];

    const recentPrompts = session.prompts.slice(-count);
    const responses = session.responses || [];

    return recentPrompts.map(prompt => ({
      prompt,
      response: responses.find(r => r.promptId === prompt.id),
    }));
  }
}
