/**
 * ActiveComposerDetector - Detect which Cursor chat/composer is currently active
 *
 * Detection strategies:
 * 1. Monitor workspace folder changes
 * 2. Match active workspace to known sessions
 * 3. Track most recently modified session per workspace
 * 4. Use VS Code context keys if available (future enhancement)
 */

import * as vscode from 'vscode';
import { CursorSessionReader } from './session-reader';
import type { MessageData } from './types';

// Set to true to enable verbose logging
const DEBUG_ACTIVE_COMPOSER = false;

export interface ActiveComposerInfo {
  composerId: string;
  workspaceName: string;
  workspacePath?: string;
  lastActivity: Date;
  messageCount: number;
}

export type ActiveComposerChangeHandler = (info: ActiveComposerInfo | null) => void;

export class ActiveComposerDetector implements vscode.Disposable {
  private reader: CursorSessionReader;
  private currentComposerId: string | null = null;
  private currentComposerInfo: ActiveComposerInfo | null = null;

  // Event handlers
  private onActiveComposerChangedHandlers: ActiveComposerChangeHandler[] = [];

  // Subscriptions
  private disposables: vscode.Disposable[] = [];

  // Workspace to session mapping
  private workspaceSessionMap: Map<string, string> = new Map();

  // Polling timer for session activity changes
  private activityPollTimer: NodeJS.Timeout | null = null;
  private readonly ACTIVITY_POLL_INTERVAL = 3000; // 3 seconds

  constructor(reader: CursorSessionReader) {
    this.reader = reader;
  }

  /**
   * Start monitoring for active composer changes
   */
  startMonitoring(): void {
    if (DEBUG_ACTIVE_COMPOSER) console.log('[ActiveComposer] Starting monitoring...');

    // Initial scan of sessions
    this.updateWorkspaceSessionMap();

    // Monitor workspace folder changes
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        if (DEBUG_ACTIVE_COMPOSER) console.log('[ActiveComposer] Workspace folders changed');
        this.detectActiveComposer();
      })
    );

    // Monitor active text editor changes (might indicate composer focus)
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.detectActiveComposer();
      })
    );

    // Monitor window focus changes
    this.disposables.push(
      vscode.window.onDidChangeWindowState((e) => {
        if (e.focused) {
          if (DEBUG_ACTIVE_COMPOSER) console.log('[ActiveComposer] Window focused, checking for active composer');
          this.detectActiveComposer();
        }
      })
    );

    // Start polling for session activity changes
    this.activityPollTimer = setInterval(() => {
      this.pollForActivityChanges();
    }, this.ACTIVITY_POLL_INTERVAL);

    // Initial detection
    this.detectActiveComposer();

    if (DEBUG_ACTIVE_COMPOSER) console.log('[ActiveComposer] Monitoring started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (DEBUG_ACTIVE_COMPOSER) console.log('[ActiveComposer] Stopping monitoring...');

    if (this.activityPollTimer) {
      clearInterval(this.activityPollTimer);
      this.activityPollTimer = null;
    }

    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];

    if (DEBUG_ACTIVE_COMPOSER) console.log('[ActiveComposer] Monitoring stopped');
  }

  /**
   * Register a handler for active composer changes
   */
  onActiveComposerChanged(handler: ActiveComposerChangeHandler): vscode.Disposable {
    this.onActiveComposerChangedHandlers.push(handler);

    return {
      dispose: () => {
        const index = this.onActiveComposerChangedHandlers.indexOf(handler);
        if (index > -1) {
          this.onActiveComposerChangedHandlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Get current active composer ID
   */
  getCurrentComposerId(): string | null {
    return this.currentComposerId;
  }

  /**
   * Get full info about current active composer
   */
  getCurrentComposerInfo(): ActiveComposerInfo | null {
    return this.currentComposerInfo;
  }

  /**
   * Get the latest messages from the active composer
   */
  getActiveComposerMessages(limit: number = 10): MessageData[] {
    if (!this.currentComposerId) {
      return [];
    }

    const messages = this.reader.getAllMessagesForSession(this.currentComposerId);
    // Return last N messages
    return messages.slice(-limit);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stopMonitoring();
    this.workspaceSessionMap.clear();
    this.onActiveComposerChangedHandlers = [];
  }

  // ========================================
  // PRIVATE METHODS
  // ========================================

  /**
   * Update mapping of workspace paths to session IDs
   * With error handling for database issues
   */
  private updateWorkspaceSessionMap(): void {
    try {
      const sessions = this.reader.getActiveSessions();
      this.workspaceSessionMap.clear();

      for (const session of sessions) {
        if (session.workspacePath) {
          // Normalize path for consistent matching
          const normalizedPath = this.normalizePath(session.workspacePath);
          this.workspaceSessionMap.set(normalizedPath, session.sessionId);
        }
      }

      if (DEBUG_ACTIVE_COMPOSER) console.log(`[ActiveComposer] Mapped ${this.workspaceSessionMap.size} workspaces to sessions`);
    } catch (error) {
      // Don't propagate errors from database issues - just log and continue
      if (DEBUG_ACTIVE_COMPOSER) console.warn('[ActiveComposer] Failed to update workspace session map:', error);
    }
  }

  /**
   * Detect which composer is currently active
   */
  private detectActiveComposer(): void {
    // Strategy 1: Match current workspace to known sessions
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (workspaceFolders && workspaceFolders.length > 0) {
      const currentWorkspacePath = this.normalizePath(workspaceFolders[0].uri.fsPath);

      // Check if we have a session for this workspace
      const sessionId = this.workspaceSessionMap.get(currentWorkspacePath);

      if (sessionId && sessionId !== this.currentComposerId) {
        if (DEBUG_ACTIVE_COMPOSER) console.log(`[ActiveComposer] Found session ${sessionId} for workspace ${currentWorkspacePath}`);
        this.setActiveComposer(sessionId);
        return;
      }
    }

    // Strategy 2: Use most recently active session
    this.detectByMostRecentActivity();
  }

  /**
   * Detect active composer by most recent activity
   */
  private detectByMostRecentActivity(): void {
    const sessions = this.reader.getActiveSessions();

    if (sessions.length === 0) {
      if (this.currentComposerId !== null) {
        this.clearActiveComposer();
      }
      return;
    }

    // Sessions are already sorted by lastActivity (most recent first)
    const mostRecentSession = sessions[0];

    // Check if this is a recent session (within last 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (mostRecentSession.lastActivity.getTime() > fiveMinutesAgo) {
      if (mostRecentSession.sessionId !== this.currentComposerId) {
        if (DEBUG_ACTIVE_COMPOSER) {
          console.log(
            `[ActiveComposer] Most recent session: ${mostRecentSession.sessionId} (${mostRecentSession.workspaceName})`
          );
        }
        this.setActiveComposer(mostRecentSession.sessionId);
      }
    }
  }

  /**
   * Poll for session activity changes
   * With error handling for database issues
   */
  private pollForActivityChanges(): void {
    try {
      // Refresh workspace map
      this.updateWorkspaceSessionMap();

      // Check if current composer is still the most active
      if (this.currentComposerId) {
        let session;
        try {
          session = this.reader.getCursorSessionById(this.currentComposerId);
        } catch (error) {
          // Database error - don't clear current composer, just skip this poll
          if (DEBUG_ACTIVE_COMPOSER) console.warn('[ActiveComposer] Failed to get session by ID:', error);
          return;
        }

        if (!session) {
          if (DEBUG_ACTIVE_COMPOSER) console.log('[ActiveComposer] Current session no longer exists');
          this.detectActiveComposer();
          return;
        }

        // Update current composer info with latest data
        let messages;
        try {
          messages = this.reader.getAllMessagesForSession(this.currentComposerId);
        } catch (error) {
          // Database error - use empty messages array
          if (DEBUG_ACTIVE_COMPOSER) console.warn('[ActiveComposer] Failed to get messages:', error);
          messages = [];
        }

        const newInfo: ActiveComposerInfo = {
          composerId: session.sessionId,
          workspaceName: session.workspaceName,
          workspacePath: session.workspacePath,
          lastActivity: session.lastActivity,
          messageCount: messages.length
        };

        // Check if message count changed (new activity)
        if (this.currentComposerInfo && newInfo.messageCount !== this.currentComposerInfo.messageCount) {
          if (DEBUG_ACTIVE_COMPOSER) {
            console.log(
              `[ActiveComposer] Message count changed: ${this.currentComposerInfo.messageCount} -> ${newInfo.messageCount}`
            );
          }
          this.currentComposerInfo = newInfo;
          this.notifyHandlers();
        }
      } else {
        // No current composer, try to detect one
        this.detectActiveComposer();
      }
    } catch (error) {
      // Catch-all for any unexpected errors during polling
      if (DEBUG_ACTIVE_COMPOSER) console.error('[ActiveComposer] Error during poll:', error);
    }
  }

  /**
   * Set the active composer
   */
  private setActiveComposer(sessionId: string): void {
    const session = this.reader.getCursorSessionById(sessionId);

    if (!session) {
      if (DEBUG_ACTIVE_COMPOSER) console.warn(`[ActiveComposer] Session ${sessionId} not found`);
      return;
    }

    this.currentComposerId = sessionId;

    const messages = this.reader.getAllMessagesForSession(sessionId);
    this.currentComposerInfo = {
      composerId: sessionId,
      workspaceName: session.workspaceName,
      workspacePath: session.workspacePath,
      lastActivity: session.lastActivity,
      messageCount: messages.length
    };

    if (DEBUG_ACTIVE_COMPOSER) console.log(`[ActiveComposer] Active composer set to: ${sessionId} (${session.workspaceName})`);
    this.notifyHandlers();
  }

  /**
   * Clear active composer
   */
  private clearActiveComposer(): void {
    if (DEBUG_ACTIVE_COMPOSER) console.log('[ActiveComposer] Clearing active composer');
    this.currentComposerId = null;
    this.currentComposerInfo = null;
    this.notifyHandlers();
  }

  /**
   * Notify all registered handlers of the change
   */
  private notifyHandlers(): void {
    for (const handler of this.onActiveComposerChangedHandlers) {
      try {
        handler(this.currentComposerInfo);
      } catch (error) {
        console.error('[ActiveComposer] Handler error:', error);
      }
    }
  }

  /**
   * Normalize a file path for consistent matching
   */
  private normalizePath(filePath: string): string {
    // Convert to lowercase on Windows
    const normalized = process.platform === 'win32'
      ? filePath.toLowerCase()
      : filePath;

    // Remove trailing slashes
    return normalized.replace(/[/\\]+$/, '');
  }
}
