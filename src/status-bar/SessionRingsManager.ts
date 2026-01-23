/**
 * SessionRingsManager - Session Progress Rings in VS Code Status Bar
 *
 * Shows up to 3 session progress rings in the status bar, each with:
 * - Progress circle icon showing goal completion
 * - Rich tooltip with session details and metrics
 * - Click to expand session in extension
 *
 * Layout: [○] [◐] [●]  5.8 | 3 | N/A
 *          ↑   ↑   ↑
 *         Session rings (most recent 3)
 */

import * as vscode from 'vscode';
import type { Session } from '../services/types/session-types';
import { getSessionManager } from '../services/SessionManagerService';

/**
 * Progress circle unicode characters for different fill levels
 */
const PROGRESS_ICONS = {
  empty: '○',      // 0-10%
  quarter: '◔',    // 11-35%
  half: '◑',       // 36-65%
  threeQuarter: '◕', // 66-90%
  full: '●',       // 91-100%
} as const;

// Ring colors match the webview ActivityRings component:
// Goal: #e06c75 (red), Context: #98c379 (green), Quality: #61afef (blue)

/**
 * Get progress icon based on percentage (0-100)
 */
function getProgressIcon(progress: number): string {
  if (progress <= 10) return PROGRESS_ICONS.empty;
  if (progress <= 35) return PROGRESS_ICONS.quarter;
  if (progress <= 65) return PROGRESS_ICONS.half;
  if (progress <= 90) return PROGRESS_ICONS.threeQuarter;
  return PROGRESS_ICONS.full;
}

// VS Code theme icons for future use:
// $(circle-outline), $(circle-slash), $(circle-large-outline), $(pass-filled)

/**
 * Platform labels for display
 */
const PLATFORM_LABELS: Record<string, string> = {
  claude_code: 'Claude Code',
  cursor: 'Cursor',
  vscode: 'VS Code',
};

/**
 * Session data needed for status bar display
 */
interface SessionRingData {
  id: string;
  name: string;
  goalProgress: number;
  contextProgress: number;
  qualityScore: number;
  promptCount: number;
  isActive: boolean;
  platform: string;
  goal?: string;
}

/**
 * Extract ring data from a session
 */
function extractRingData(session: Session): SessionRingData {
  const goalProgress = session.goalProgress ?? 0;
  const contextProgress = (session.tokenUsage?.contextUtilization ?? 0) * 100;
  const qualityScore = session.averageScore ?? 0;

  // Get display name: customName > goal > platform (no truncation - show full title)
  const name = session.customName || session.goal || PLATFORM_LABELS[session.platform] || 'Session';

  return {
    id: session.id,
    name,
    goalProgress,
    contextProgress,
    qualityScore,
    promptCount: session.promptCount,
    isActive: session.isActive,
    platform: session.platform,
    goal: session.goal,
  };
}

/**
 * Build rich MarkdownString tooltip for a session ring
 * Shows full session information without truncation
 */
function buildTooltip(data: SessionRingData): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportThemeIcons = true;

  // Platform label
  const platformLabel = PLATFORM_LABELS[data.platform] || data.platform;

  // Header with platform and status
  const statusIcon = data.isActive ? '$(pulse)' : '$(circle-outline)';
  const statusText = data.isActive ? 'Active' : 'Idle';
  md.appendMarkdown(`$(symbol-misc) **${platformLabel}** · ${statusIcon} ${statusText}\n\n`);

  // Session title - full, no truncation
  md.appendMarkdown(`### ${data.name}\n\n`);

  // Goal if different from name
  if (data.goal && data.goal !== data.name) {
    md.appendMarkdown(`*Goal: ${data.goal}*\n\n`);
  }

  // Separator
  md.appendMarkdown('---\n\n');

  // Stats summary
  md.appendMarkdown(`**${data.promptCount}** prompts\n\n`);

  // Ring metrics - visual progress bars
  const goalBar = getProgressBar(data.goalProgress);
  const contextBar = getProgressBar(data.contextProgress);
  const qualityBar = getProgressBar(data.qualityScore * 10);

  md.appendMarkdown(`**Goal Completion**\n\n`);
  md.appendMarkdown(`${goalBar} **${Math.round(data.goalProgress)}%**\n\n`);

  md.appendMarkdown(`**Context Used**\n\n`);
  md.appendMarkdown(`${contextBar} **${Math.round(data.contextProgress)}%**\n\n`);

  md.appendMarkdown(`**Prompt Quality**\n\n`);
  md.appendMarkdown(`${qualityBar} **${data.qualityScore.toFixed(1)}/10**\n\n`);

  // Separator
  md.appendMarkdown('---\n\n');

  // Action link
  md.appendMarkdown(`[$(link-external) **Open in DevArk**](command:devark.openSession?${encodeURIComponent(JSON.stringify({ sessionId: data.id }))})`);

  return md;
}

/**
 * Generate a text-based progress bar
 */
function getProgressBar(progress: number): string {
  const filled = Math.round(progress / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * SessionRingsManager - Manages session progress rings in the status bar
 */
export class SessionRingsManager {
  private ringItems: vscode.StatusBarItem[] = [];
  private sessions: SessionRingData[] = [];
  private unsubscribe: (() => void) | null = null;
  private updateDebounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Create 3 status bar items for session rings
    // Main DevArk item is at priority 100
    // Use priorities 99, 98, 97 to place rings immediately to the RIGHT of main item
    // Lower priority = more to the right on Right-aligned items
    // Layout: [main 4.0|1|Claude] [○] [○] [○]
    for (let i = 0; i < 3; i++) {
      const item = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        99 - i // Priority 99, 98, 97 (immediately right of main item at 100)
      );
      this.ringItems.push(item);
    }
  }

  /**
   * Initialize the manager and start listening to session updates
   */
  public initialize(): void {
    // Initial update
    this.updateSessions();

    // Subscribe to session events
    try {
      const sessionManager = getSessionManager();
      this.unsubscribe = sessionManager.subscribe(() => {
        // Debounce updates to avoid flickering
        if (this.updateDebounceTimer) {
          clearTimeout(this.updateDebounceTimer);
        }
        this.updateDebounceTimer = setTimeout(() => {
          this.updateSessions();
        }, 500);
      });
    } catch (error) {
      console.error('[SessionRingsManager] Failed to subscribe to session events:', error);
    }
  }

  /**
   * Update sessions from SessionManagerService
   */
  private updateSessions(): void {
    try {
      const sessionManager = getSessionManager();
      const allSessions = sessionManager.getSessions({ limit: 10 });

      // Sort by: active first, then by lastActivityTime
      const sorted = [...allSessions].sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return b.lastActivityTime.getTime() - a.lastActivityTime.getTime();
      });

      // Take top 3
      const topSessions = sorted.slice(0, 3);
      this.sessions = topSessions.map(extractRingData);

      this.render();
    } catch (error) {
      console.error('[SessionRingsManager] Failed to update sessions:', error);
    }
  }

  /**
   * Render the status bar items
   */
  private render(): void {
    for (let i = 0; i < this.ringItems.length; i++) {
      const item = this.ringItems[i];
      const sessionData = this.sessions[i];

      if (sessionData) {
        // Show session ring
        const icon = getProgressIcon(sessionData.goalProgress);
        item.text = icon;
        item.tooltip = buildTooltip(sessionData);
        item.command = {
          command: 'devark.openSession',
          title: 'Open Session',
          arguments: [{ sessionId: sessionData.id }],
        };

        // Color based on activity status
        if (sessionData.isActive) {
          item.backgroundColor = undefined;
          item.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
        } else {
          item.backgroundColor = undefined;
          item.color = undefined;
        }

        item.show();
      } else {
        // Hide unused ring slots
        item.hide();
      }
    }
  }

  /**
   * Force refresh of session data
   */
  public refresh(): void {
    this.updateSessions();
  }

  /**
   * Show all ring items
   */
  public show(): void {
    this.render();
  }

  /**
   * Hide all ring items
   */
  public hide(): void {
    this.ringItems.forEach((item) => item.hide());
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.updateDebounceTimer) {
      clearTimeout(this.updateDebounceTimer);
      this.updateDebounceTimer = null;
    }
    this.ringItems.forEach((item) => item.dispose());
    this.ringItems = [];
  }
}

/**
 * Create and register the session rings manager
 */
export function createSessionRingsManager(
  context: vscode.ExtensionContext
): SessionRingsManager {
  const manager = new SessionRingsManager();

  // Initialize after a short delay to ensure SessionManager is ready
  setTimeout(() => {
    manager.initialize();
  }, 1000);

  // Add to subscriptions for cleanup
  context.subscriptions.push({
    dispose: () => manager.dispose(),
  });

  return manager;
}
