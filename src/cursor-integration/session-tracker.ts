/**
 * Session Tracker
 *
 * In-memory tracker for:
 * - Active Cursor sessions
 * - Prompt history per session
 * - Analysis queue
 *
 * Works in conjunction with:
 * - CursorSessionReader (reads from SQLite)
 * - CoPilotStorageManager (persists analyses)
 */

import { CursorSession, PromptData, PromptStatus, AnalysisQueueItem } from './types';

/**
 * Session Tracker
 */
export class SessionTracker {
  // In-memory state
  private sessions: Map<string, CursorSession> = new Map();
  private prompts: Map<string, PromptData[]> = new Map(); // sessionId -> prompts
  private analysisQueue: AnalysisQueueItem[] = [];

  // Configuration
  private maxPromptsPerSession: number = 50; // Keep last 50 prompts per session

  /**
   * SESSIONS
   */

  /**
   * Add or update a session
   */
  addSession(session: CursorSession): void {
    this.sessions.set(session.sessionId, session);

    // Initialize prompt array if needed
    if (!this.prompts.has(session.sessionId)) {
      this.prompts.set(session.sessionId, []);
    }

    console.log('[Session Tracker] Session added/updated:', session.sessionId);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): CursorSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get all sessions
   */
  getAllSessions(): CursorSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get active sessions (status === 'active')
   */
  getActiveSessions(): CursorSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  /**
   * Get current session (most recently active)
   */
  getCurrentSession(): CursorSession | null {
    const sessions = this.getAllSessions();
    if (sessions.length === 0) return null;

    // Sort by last activity (most recent first)
    sessions.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());

    return sessions[0];
  }

  /**
   * Update session metadata
   */
  updateSession(sessionId: string, updates: Partial<CursorSession>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn('[Session Tracker] Cannot update unknown session:', sessionId);
      return;
    }

    const updated = { ...session, ...updates };
    this.sessions.set(sessionId, updated);
    console.log('[Session Tracker] Session updated:', sessionId);
  }

  /**
   * Remove session
   */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.prompts.delete(sessionId);
    console.log('[Session Tracker] Session removed:', sessionId);
  }

  /**
   * PROMPTS
   */

  /**
   * Add prompt to a session
   */
  addPrompt(sessionId: string, prompt: PromptData): void {
    // Ensure session exists
    let session = this.sessions.get(sessionId);
    if (!session) {
      console.warn('[Session Tracker] Adding prompt to unknown session:', sessionId);
      // Create a minimal session entry
      session = {
        sessionId,
        workspaceName: 'Unknown',
        startTime: new Date(),
        lastActivity: new Date(),
        promptCount: 0,
        status: 'active'
      };
      this.sessions.set(sessionId, session);
    }

    // Add prompt to session's prompt list
    let prompts = this.prompts.get(sessionId) || [];
    prompts.push(prompt);

    // Trim if exceeds max
    if (prompts.length > this.maxPromptsPerSession) {
      prompts = prompts.slice(-this.maxPromptsPerSession);
    }

    this.prompts.set(sessionId, prompts);

    // Update session metadata
    session.lastActivity = prompt.timestamp;
    session.promptCount = prompts.length;
    this.sessions.set(sessionId, session);

    console.log('[Session Tracker] Prompt added to session:', sessionId, 'Total:', prompts.length);
  }

  /**
   * Get all prompts for a session
   */
  getSessionPrompts(sessionId: string): PromptData[] {
    return this.prompts.get(sessionId) || [];
  }

  /**
   * Get prompt by ID (searches all sessions)
   */
  getPromptById(promptId: string): PromptData | null {
    for (const prompts of this.prompts.values()) {
      const prompt = prompts.find(p => p.id === promptId);
      if (prompt) return prompt;
    }
    return null;
  }

  /**
   * Update prompt status
   */
  updatePromptStatus(promptId: string, status: PromptStatus, analysisId?: string): void {
    for (const [sessionId, prompts] of this.prompts.entries()) {
      const index = prompts.findIndex(p => p.id === promptId);
      if (index >= 0) {
        prompts[index] = {
          ...prompts[index],
          status,
          analysisId
        };
        this.prompts.set(sessionId, prompts);
        console.log('[Session Tracker] Prompt status updated:', promptId, status);
        return;
      }
    }
    console.warn('[Session Tracker] Cannot update unknown prompt:', promptId);
  }

  /**
   * Get all prompts across all sessions
   */
  getAllPrompts(): PromptData[] {
    const allPrompts: PromptData[] = [];
    for (const prompts of this.prompts.values()) {
      allPrompts.push(...prompts);
    }
    return allPrompts;
  }

  /**
   * Get recent prompts (across all sessions)
   */
  getRecentPrompts(limit: number = 10): PromptData[] {
    const allPrompts = this.getAllPrompts();
    allPrompts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return allPrompts.slice(0, limit);
  }

  /**
   * ANALYSIS QUEUE
   */

  /**
   * Add prompt to analysis queue
   */
  queueForAnalysis(promptId: string, priority: number = 5): void {
    // Check if already queued
    const exists = this.analysisQueue.find(item => item.promptId === promptId);
    if (exists) {
      console.log('[Session Tracker] Prompt already queued:', promptId);
      return;
    }

    const item: AnalysisQueueItem = {
      promptId,
      priority,
      addedAt: new Date(),
      retryCount: 0
    };

    this.analysisQueue.push(item);

    // Sort by priority (higher first)
    this.analysisQueue.sort((a, b) => b.priority - a.priority);

    console.log('[Session Tracker] Prompt queued for analysis:', promptId, 'Queue size:', this.analysisQueue.length);
  }

  /**
   * Get next prompt from analysis queue
   */
  dequeueForAnalysis(): string | null {
    const item = this.analysisQueue.shift();
    if (!item) return null;

    console.log('[Session Tracker] Dequeued prompt for analysis:', item.promptId);
    return item.promptId;
  }

  /**
   * Requeue a failed analysis
   */
  requeueForAnalysis(promptId: string): void {
    const item = this.analysisQueue.find(i => i.promptId === promptId);
    if (item) {
      item.retryCount++;
      item.priority = Math.max(1, item.priority - 1); // Lower priority on retry
      console.log('[Session Tracker] Prompt requeued:', promptId, 'Retry:', item.retryCount);
    } else {
      // Add back to queue with lower priority
      this.queueForAnalysis(promptId, 3);
    }
  }

  /**
   * Remove prompt from queue
   */
  removeFromQueue(promptId: string): void {
    const index = this.analysisQueue.findIndex(i => i.promptId === promptId);
    if (index >= 0) {
      this.analysisQueue.splice(index, 1);
      console.log('[Session Tracker] Prompt removed from queue:', promptId);
    }
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.analysisQueue.length;
  }

  /**
   * Check if queue is empty
   */
  isQueueEmpty(): boolean {
    return this.analysisQueue.length === 0;
  }

  /**
   * UTILITIES
   */

  /**
   * Clear all data (for testing/debugging)
   */
  clear(): void {
    this.sessions.clear();
    this.prompts.clear();
    this.analysisQueue = [];
    console.log('[Session Tracker] All data cleared');
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    totalPrompts: number;
    queueSize: number;
  } {
    return {
      totalSessions: this.sessions.size,
      activeSessions: this.getActiveSessions().length,
      totalPrompts: this.getAllPrompts().length,
      queueSize: this.analysisQueue.length
    };
  }

  /**
   * Sync with sessions from database
   * Updates in-memory state with database sessions
   */
  syncWithDatabaseSessions(dbSessions: CursorSession[]): void {
    console.log('[Session Tracker] Syncing with database sessions:', dbSessions.length);

    for (const dbSession of dbSessions) {
      // Update or add session
      const existing = this.sessions.get(dbSession.sessionId);

      if (!existing || dbSession.lastActivity > existing.lastActivity) {
        this.sessions.set(dbSession.sessionId, dbSession);

        // Initialize prompt array if needed
        if (!this.prompts.has(dbSession.sessionId)) {
          this.prompts.set(dbSession.sessionId, []);
        }
      }
    }

    // Remove sessions that no longer exist in database (optional - commented out for now)
    // const dbSessionIds = new Set(dbSessions.map(s => s.sessionId));
    // for (const sessionId of this.sessions.keys()) {
    //   if (!dbSessionIds.has(sessionId)) {
    //     this.removeSession(sessionId);
    //   }
    // }

    console.log('[Session Tracker] Sync complete. Total sessions:', this.sessions.size);
  }

  /**
   * Remove old prompts from memory (keeps last N per session)
   */
  trimPromptHistory(): void {
    let totalTrimmed = 0;

    for (const [sessionId, prompts] of this.prompts.entries()) {
      if (prompts.length > this.maxPromptsPerSession) {
        const trimmed = prompts.length - this.maxPromptsPerSession;
        const kept = prompts.slice(-this.maxPromptsPerSession);
        this.prompts.set(sessionId, kept);
        totalTrimmed += trimmed;
      }
    }

    if (totalTrimmed > 0) {
      console.log('[Session Tracker] Trimmed', totalTrimmed, 'old prompts from memory');
    }
  }

  /**
   * Set max prompts per session
   */
  setMaxPromptsPerSession(max: number): void {
    this.maxPromptsPerSession = max;
    console.log('[Session Tracker] Max prompts per session set to:', max);
  }
}
