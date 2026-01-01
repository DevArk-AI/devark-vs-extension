/**
 * ContextManager - Manage co-pilot context based on active Cursor chat
 *
 * Responsibilities:
 * 1. Store current chat context (messages, files, workspace)
 * 2. Provide context for co-pilot prompt enhancement
 * 3. Sync with LLMManager when active chat changes
 * 4. Expose context for webview display
 */

import * as vscode from 'vscode';
import { ActiveComposerDetector, ActiveComposerInfo } from './active-composer-detector';
import { CursorSessionReader } from './session-reader';
import type { MessageData } from './types';

export interface ChatContext {
  composerId: string;
  workspaceName: string;
  workspacePath?: string;
  recentMessages: MessageData[];
  files: string[];
  lastUpdated: Date;
}

export interface CoPilotContext {
  // Summary for co-pilot prompt injection
  summary: string;
  // Recent conversation for context
  recentConversation: string;
  // Files being discussed
  relevantFiles: string[];
  // Workspace info
  workspace: string;
}

export type ContextChangeHandler = (context: ChatContext | null) => void;

export class ContextManager implements vscode.Disposable {
  private reader: CursorSessionReader;
  private detector: ActiveComposerDetector;

  // Current context
  private currentContext: ChatContext | null = null;

  // Configuration
  private readonly MAX_RECENT_MESSAGES = 10;

  // Event handlers
  private onContextChangedHandlers: ContextChangeHandler[] = [];

  // Disposables
  private disposables: vscode.Disposable[] = [];

  constructor(reader: CursorSessionReader) {
    this.reader = reader;
    this.detector = new ActiveComposerDetector(reader);
  }

  /**
   * Initialize and start context tracking
   */
  async initialize(): Promise<void> {
    console.log('[ContextManager] Initializing...');

    // Subscribe to active composer changes
    this.disposables.push(
      this.detector.onActiveComposerChanged((info) => {
        this.handleActiveComposerChange(info);
      })
    );

    // Start the detector
    this.detector.startMonitoring();

    console.log('[ContextManager] Initialized');
  }

  /**
   * Get current chat context
   */
  getCurrentContext(): ChatContext | null {
    return this.currentContext;
  }

  /**
   * Get context formatted for co-pilot prompt enhancement
   */
  getCoPilotContext(): CoPilotContext | null {
    if (!this.currentContext) {
      return null;
    }

    const userMessages = this.currentContext.recentMessages.filter(m => m.role === 'user');
    const assistantMessages = this.currentContext.recentMessages.filter(m => m.role === 'assistant');

    // Build recent conversation summary
    const recentConversation = this.buildConversationSummary(
      this.currentContext.recentMessages
    );

    // Build summary for prompt injection
    const summary = this.buildContextSummary(userMessages, assistantMessages);

    return {
      summary,
      recentConversation,
      relevantFiles: this.currentContext.files,
      workspace: this.currentContext.workspaceName
    };
  }

  /**
   * Get context as a formatted string for prompt injection
   */
  getContextForPrompt(): string {
    const context = this.getCoPilotContext();
    if (!context) {
      return '';
    }

    const parts: string[] = [];

    if (context.workspace) {
      parts.push(`Working in: ${context.workspace}`);
    }

    if (context.relevantFiles.length > 0) {
      parts.push(`Files discussed: ${context.relevantFiles.slice(0, 5).join(', ')}`);
    }

    if (context.recentConversation) {
      parts.push(`Recent context:\n${context.recentConversation}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Get the active composer detector for external use
   */
  getActiveComposerDetector(): ActiveComposerDetector {
    return this.detector;
  }

  /**
   * Register a handler for context changes
   */
  onContextChanged(handler: ContextChangeHandler): vscode.Disposable {
    this.onContextChangedHandlers.push(handler);

    return {
      dispose: () => {
        const index = this.onContextChangedHandlers.indexOf(handler);
        if (index > -1) {
          this.onContextChangedHandlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Force refresh of current context
   */
  refresh(): void {
    const composerId = this.detector.getCurrentComposerId();
    if (composerId) {
      this.updateContext(composerId);
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    console.log('[ContextManager] Disposing...');
    this.detector.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.currentContext = null;
    this.onContextChangedHandlers = [];
  }

  // ========================================
  // PRIVATE METHODS
  // ========================================

  /**
   * Handle active composer change event
   */
  private handleActiveComposerChange(info: ActiveComposerInfo | null): void {
    if (!info) {
      console.log('[ContextManager] No active composer');
      this.clearContext();
      return;
    }

    console.log(`[ContextManager] Active composer changed to: ${info.composerId}`);
    this.updateContext(info.composerId);
  }

  /**
   * Update context for a given composer
   */
  private updateContext(composerId: string): void {
    const session = this.reader.getCursorSessionById(composerId);
    if (!session) {
      console.warn(`[ContextManager] Session ${composerId} not found`);
      return;
    }

    // Get recent messages
    const messages = this.reader.getAllMessagesForSession(composerId);
    const recentMessages = messages.slice(-this.MAX_RECENT_MESSAGES);

    // Extract files from messages and session
    const files = this.extractFilesFromContext(recentMessages, session.fileContext);

    this.currentContext = {
      composerId,
      workspaceName: session.workspaceName,
      workspacePath: session.workspacePath,
      recentMessages,
      files,
      lastUpdated: new Date()
    };

    console.log(
      `[ContextManager] Context updated: ${recentMessages.length} messages, ${files.length} files`
    );

    this.notifyHandlers();
  }

  /**
   * Clear current context
   */
  private clearContext(): void {
    this.currentContext = null;
    this.notifyHandlers();
  }

  /**
   * Notify all registered handlers
   */
  private notifyHandlers(): void {
    for (const handler of this.onContextChangedHandlers) {
      try {
        handler(this.currentContext);
      } catch (error) {
        console.error('[ContextManager] Handler error:', error);
      }
    }
  }

  /**
   * Build a conversation summary for context
   */
  private buildConversationSummary(messages: MessageData[]): string {
    if (messages.length === 0) {
      return '';
    }

    // Take last few messages
    const recent = messages.slice(-5);

    return recent
      .map(m => {
        const role = m.role === 'user' ? 'User' : 'Assistant';
        // Truncate long messages
        const content = m.content.length > 200
          ? m.content.substring(0, 200) + '...'
          : m.content;
        return `${role}: ${content}`;
      })
      .join('\n\n');
  }

  /**
   * Build a brief context summary
   */
  private buildContextSummary(
    userMessages: MessageData[],
    assistantMessages: MessageData[]
  ): string {
    const parts: string[] = [];

    // Summarize what user is working on
    if (userMessages.length > 0) {
      const lastUserMessage = userMessages[userMessages.length - 1];
      const truncated = lastUserMessage.content.substring(0, 150);
      parts.push(`Current task: ${truncated}${lastUserMessage.content.length > 150 ? '...' : ''}`);
    }

    // Message count
    parts.push(`Conversation: ${userMessages.length} prompts, ${assistantMessages.length} responses`);

    return parts.join('. ');
  }

  /**
   * Extract file references from messages and session context
   */
  private extractFilesFromContext(
    messages: MessageData[],
    sessionFiles?: string[]
  ): string[] {
    const files = new Set<string>();

    // Add session-level files
    if (sessionFiles) {
      for (const file of sessionFiles) {
        files.add(file);
      }
    }

    // Extract file patterns from messages
    const filePatterns = [
      /`([^`]+\.[a-z]{2,4})`/gi,           // `filename.ext`
      /\b(\w+\/[\w./]+\.[a-z]{2,4})\b/gi,  // path/to/file.ext
      /@([^\s]+\.[a-z]{2,4})/gi            // @filename.ext (Cursor mentions)
    ];

    for (const message of messages) {
      for (const pattern of filePatterns) {
        let match;
        while ((match = pattern.exec(message.content)) !== null) {
          const file = match[1];
          if (file && this.looksLikeFilePath(file)) {
            files.add(file);
          }
        }
      }
    }

    return Array.from(files).slice(0, 20); // Limit to 20 files
  }

  /**
   * Check if a string looks like a file path
   */
  private looksLikeFilePath(str: string): boolean {
    // Common code file extensions
    const extensions = [
      '.ts', '.tsx', '.js', '.jsx', '.json', '.md',
      '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h',
      '.css', '.scss', '.html', '.vue', '.svelte',
      '.yaml', '.yml', '.toml', '.xml', '.sql'
    ];

    const lower = str.toLowerCase();
    return extensions.some(ext => lower.endsWith(ext));
  }
}
