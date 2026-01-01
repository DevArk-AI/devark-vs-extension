/**
 * StatusBarManager - VS Code Status Bar Integration
 *
 * Shows in the status bar:
 * - Average score today
 * - Prompt count today
 * - Active LLM provider
 *
 * Format: VL 6.2 | 47 | Cursor
 * Click to open Co-Pilot panel
 */

import * as vscode from 'vscode';
import type { LLMManager } from '../llm/llm-manager';

export interface StatusBarState {
  avgScore: number;
  promptCount: number;
  provider: string;
  isConnected: boolean;
}

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private state: StatusBarState = {
    avgScore: 0,
    promptCount: 0,
    provider: 'Not configured',
    isConnected: false,
  };

  constructor(private llmManager: LLMManager) {
    // Create status bar item with high priority (appears on the left)
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );

    // Set command to open Co-Pilot panel when clicked
    this.statusBarItem.command = 'devark.showMenu';
    this.statusBarItem.tooltip = 'Open Vibe-Log Co-Pilot';

    // Initial render
    this.render();
  }

  /**
   * Show the status bar item
   */
  public show(): void {
    this.statusBarItem.show();
  }

  /**
   * Hide the status bar item
   */
  public hide(): void {
    this.statusBarItem.hide();
  }

  /**
   * Update the average score
   */
  public updateScore(avgScore: number, promptCount: number): void {
    this.state.avgScore = avgScore;
    this.state.promptCount = promptCount;
    this.render();
  }

  /**
   * Increment the prompt count and update average
   */
  public addPromptScore(score: number): void {
    const totalScore = this.state.avgScore * this.state.promptCount + score;
    this.state.promptCount += 1;
    this.state.avgScore = totalScore / this.state.promptCount;
    this.render();
  }

  /**
   * Update the active provider display
   */
  public updateProvider(provider: string, isConnected: boolean): void {
    this.state.provider = provider;
    this.state.isConnected = isConnected;
    this.render();
  }

  /**
   * Refresh provider status from LLM manager
   */
  public refreshProviderStatus(): void {
    const provider = this.llmManager.getActiveProvider();
    if (provider) {
      const info = this.llmManager.getActiveProviderInfo();
      this.updateProvider(info?.type || 'Unknown', true);
    } else {
      this.updateProvider('Not configured', false);
    }
  }

  /**
   * Reset daily stats (call at midnight or on demand)
   */
  public resetDailyStats(): void {
    this.state.avgScore = 0;
    this.state.promptCount = 0;
    this.render();
  }

  /**
   * Get current state for persistence
   */
  public getState(): StatusBarState {
    return { ...this.state };
  }

  /**
   * Restore state from persistence
   */
  public restoreState(state: Partial<StatusBarState>): void {
    this.state = { ...this.state, ...state };
    this.render();
  }

  /**
   * Render the status bar item with current state
   */
  private render(): void {
    const { avgScore, promptCount, provider, isConnected } = this.state;

    // Build the status bar text
    // Format: $(vibe-log-icon) 6.2 | 47 | Cursor
    const parts: string[] = ['$(vibe-log-icon)'];

    // Show score if we have prompts analyzed
    if (promptCount > 0) {
      const scoreDisplay = avgScore.toFixed(1);
      parts.push(scoreDisplay);
    } else {
      parts.push('-.-');
    }

    // Add separator and prompt count
    parts.push('|');
    parts.push(promptCount.toString());

    // Add separator and provider
    parts.push('|');
    parts.push(this.getProviderShortName(provider));

    this.statusBarItem.text = parts.join(' ');

    // Update tooltip with more details
    const tooltipLines = [
      'Vibe-Log Co-Pilot',
      '─────────────────',
      `Average Score: ${promptCount > 0 ? avgScore.toFixed(1) + '/10' : 'No data'}`,
      `Prompts Today: ${promptCount}`,
      `Provider: ${provider} ${isConnected ? '(Connected)' : '(Disconnected)'}`,
      '',
      'Click to open',
    ];
    this.statusBarItem.tooltip = tooltipLines.join('\n');

    // Update color based on connection status
    if (!isConnected && provider !== 'Not configured') {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
    } else {
      this.statusBarItem.backgroundColor = undefined;
    }
  }

  /**
   * Get short name for provider display
   */
  private getProviderShortName(provider: string): string {
    const shortNames: Record<string, string> = {
      'cursor-cli': 'Cursor',
      'claude-agent-sdk': 'Claude',
      ollama: 'Ollama',
      openrouter: 'Cloud',
      'Not configured': 'N/A',
    };
    return shortNames[provider] || provider.substring(0, 8);
  }

  /**
   * Dispose of the status bar item
   */
  public dispose(): void {
    this.statusBarItem.dispose();
  }
}

/**
 * Create and register the status bar manager
 */
export function createStatusBarManager(
  context: vscode.ExtensionContext,
  llmManager: LLMManager
): StatusBarManager {
  const manager = new StatusBarManager(llmManager);

  // Restore state from workspace storage
  const savedState = context.workspaceState.get<StatusBarState>('devark.statusBarState');
  if (savedState) {
    // Check if it's a new day, reset if so
    const lastUpdate = context.workspaceState.get<string>('devark.statusBarLastUpdate');
    const today = new Date().toDateString();

    if (lastUpdate === today) {
      manager.restoreState(savedState);
    } else {
      // New day, reset stats but keep provider info
      manager.restoreState({
        provider: savedState.provider,
        isConnected: savedState.isConnected,
      });
    }
  }

  // Refresh provider status
  manager.refreshProviderStatus();

  // Show the status bar
  manager.show();

  // Add to subscriptions for cleanup
  context.subscriptions.push({
    dispose: () => {
      // Save state before disposing
      context.workspaceState.update('devark.statusBarState', manager.getState());
      context.workspaceState.update('devark.statusBarLastUpdate', new Date().toDateString());
      manager.dispose();
    },
  });

  return manager;
}
