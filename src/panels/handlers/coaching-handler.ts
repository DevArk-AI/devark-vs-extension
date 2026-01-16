/**
 * CoachingHandler - Handles coaching system messages (Workstream D)
 *
 * Responsibilities:
 * - Use/dismiss coaching suggestions
 * - Get coaching status
 * - Get coaching for specific prompts
 */

import * as vscode from 'vscode';
import { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
import { SharedContext } from './shared-context';
import { getCoachingService } from '../../services/CoachingService';
import type { CoachingSuggestion } from '../../services/types/coaching-types';
import type { WebviewMessageData } from '../../shared/webview-protocol';
import { getNotificationService } from '../../services/NotificationService';

export class CoachingHandler extends BaseMessageHandler {
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
      'useCoachingSuggestion',
      'dismissCoachingSuggestion',
      'getCoachingStatus',
      'getCoachingForPrompt',
    ];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    switch (type) {
      case 'useCoachingSuggestion': {
        const d = data as WebviewMessageData<'useCoachingSuggestion'>;
        await this.handleUseCoachingSuggestion(d.suggestion as CoachingSuggestion);
        return true;
      }
      case 'dismissCoachingSuggestion': {
        const d = data as WebviewMessageData<'dismissCoachingSuggestion'>;
        await this.handleDismissCoachingSuggestion(d.id);
        return true;
      }
      case 'getCoachingStatus':
        await this.handleGetCoachingStatus();
        return true;
      case 'getCoachingForPrompt': {
        const d = data as WebviewMessageData<'getCoachingForPrompt'>;
        await this.handleGetCoachingForPrompt(d.promptId);
        return true;
      }
      default:
        return false;
    }
  }

  /**
   * Handle using a coaching suggestion - injects the suggested prompt
   */
  private async handleUseCoachingSuggestion(suggestion: CoachingSuggestion): Promise<void> {
    if (!suggestion?.suggestedPrompt) return;

    const coachingService = getCoachingService();
    const currentCoaching = coachingService.getCurrentCoaching();
    const source = currentCoaching?.source;
    const prompt = suggestion.suggestedPrompt;
    const chatInjector = this.sharedContext.chatInjector;

    // Route to the injector based on the source the prompt came from
    if (source === 'cursor') {
      if (chatInjector) {
        const success = await chatInjector.injectIntoCursor(prompt);
        if (!success) {
          await vscode.env.clipboard.writeText(prompt);
          getNotificationService().warn('Could not inject - prompt copied to clipboard');
        }
      } else {
        await vscode.env.clipboard.writeText(prompt);
        getNotificationService().info('Prompt copied to clipboard');
      }
    } else if (source === 'claude_code') {
      if (chatInjector) {
        await chatInjector.injectIntoClaudeCode(prompt);
      } else {
        await vscode.env.clipboard.writeText(prompt);
        getNotificationService().info('Prompt copied to clipboard');
      }
    } else {
      // Source unknown - fallback to clipboard
      await vscode.env.clipboard.writeText(prompt);
      getNotificationService().info('Prompt copied to clipboard');
    }

    // Dismiss the suggestion
    coachingService.dismissSuggestion(suggestion.id);

    // Update webview
    this.send('coachingUpdated', {
      coaching: coachingService.getCurrentCoaching(),
    });
  }

  /**
   * Handle dismissing a coaching suggestion
   */
  private async handleDismissCoachingSuggestion(id: string): Promise<void> {
    if (!id) return;

    const coachingService = getCoachingService();
    coachingService.dismissSuggestion(id);

    // Update webview
    this.send('coachingUpdated', {
      coaching: coachingService.getCurrentCoaching(),
    });
  }

  /**
   * Get current coaching status
   */
  private async handleGetCoachingStatus(): Promise<void> {
    const coachingService = getCoachingService();
    const state = coachingService.getState();

    this.send('coachingStatus', {
      coaching: state.currentCoaching,
      isListening: state.isListening,
      onCooldown: state.onCooldown,
    });
  }

  /**
   * Get coaching for a specific prompt (used when navigating prompt history)
   */
  private async handleGetCoachingForPrompt(promptId: string): Promise<void> {
    if (!promptId) {
      this.send('coachingUpdated', { coaching: null });
      return;
    }

    const coachingService = getCoachingService();

    // Set the current prompt context so subsequent getCurrentCoaching calls return this prompt's coaching
    coachingService.setCurrentPromptId(promptId);

    // Get coaching for this specific prompt
    const coaching = await coachingService.getCoachingForPrompt(promptId);

    console.log('[CoachingHandler] Getting coaching for prompt:', promptId, coaching ? 'found' : 'not found');
    if (coaching) {
      console.log('[CoachingHandler] Coaching details:', {
        suggestions: coaching.suggestions?.length ?? 0,
        promptId: coaching.promptId,
        responseId: coaching.responseId,
      });
    }

    this.send('coachingUpdated', { coaching });
  }
}
