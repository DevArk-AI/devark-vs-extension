/**
 * SuggestionHandler - Handles suggestion-related messages
 *
 * Responsibilities:
 * - Dismiss suggestions
 * - Handle "not now" for suggestions
 * - Apply suggestion actions
 * - Check for available suggestions
 */

import { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
import { SharedContext } from './shared-context';
import type { SuggestionType } from '../../services/SuggestionEngine';
import type { WebviewMessageData } from '../../shared/webview-protocol';

export class SuggestionHandler extends BaseMessageHandler {
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
      'v2DismissSuggestion',
      'v2NotNowSuggestion',
      'v2ApplySuggestion',
      'v2CheckSuggestions',
    ];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    switch (type) {
      case 'v2DismissSuggestion': {
        const d = data as WebviewMessageData<'v2DismissSuggestion'>;
        await this.handleDismissSuggestion(d.type);
        return true;
      }
      case 'v2NotNowSuggestion': {
        const d = data as WebviewMessageData<'v2NotNowSuggestion'>;
        await this.handleNotNowSuggestion(d.type);
        return true;
      }
      case 'v2ApplySuggestion': {
        const d = data as WebviewMessageData<'v2ApplySuggestion'>;
        await this.handleApplySuggestion(d.id);
        return true;
      }
      case 'v2CheckSuggestions':
        await this.handleCheckSuggestions();
        return true;
      default:
        return false;
    }
  }

  private async handleDismissSuggestion(suggestionType: string): Promise<void> {
    if (!suggestionType) return;

    const suggestionEngine = this.sharedContext.suggestionEngine;
    if (!suggestionEngine) {
      console.warn('[SuggestionHandler] SuggestionEngine not available');
      return;
    }

    suggestionEngine.handleDismiss(suggestionType as SuggestionType);
    this.send('v2SuggestionDismissed', { type: suggestionType });
  }

  private async handleNotNowSuggestion(suggestionType: string): Promise<void> {
    if (!suggestionType) return;

    const suggestionEngine = this.sharedContext.suggestionEngine;
    if (!suggestionEngine) {
      console.warn('[SuggestionHandler] SuggestionEngine not available');
      return;
    }

    suggestionEngine.handleNotNow(suggestionType as SuggestionType);
    this.send('v2SuggestionNotNow', { type: suggestionType });
  }

  private async handleApplySuggestion(suggestionId: string): Promise<void> {
    if (!suggestionId) {
      this.send('v2SuggestionApplied', { id: '', success: false, error: 'No suggestion ID provided' });
      return;
    }

    // Parse suggestion type from ID (format: "type-timestamp")
    const typeMatch = suggestionId.match(/^([a-z_]+)-/);
    if (!typeMatch) {
      this.send('v2SuggestionApplied', { id: suggestionId, success: false, error: 'Invalid suggestion ID format' });
      return;
    }

    const suggestionType = typeMatch[1] as SuggestionType;

    // Handle different suggestion types
    switch (suggestionType) {
      case 'set_goal': {
        // Trigger goal inference modal in UI
        const goalService = this.sharedContext.goalService;
        if (goalService) {
          const inference = goalService.inferGoal();
          this.send('v2SuggestionApplied', { id: suggestionId, success: true });
          // Also send goal inference to trigger the modal
          this.send('v2GoalInference', { inference });
        } else {
          this.send('v2SuggestionApplied', { id: suggestionId, success: false, error: 'Goal service not available' });
        }
        break;
      }

      case 'progress_check': {
        // Could mark goal as complete or trigger a break reminder
        const goalService = this.sharedContext.goalService;
        if (goalService) {
          const status = goalService.getGoalStatus();
          if (status.hasGoal) {
            goalService.completeGoal();
            this.send('v2GoalStatus', { goal: null, status: goalService.getGoalStatus() });
          }
        }
        this.send('v2SuggestionApplied', { id: suggestionId, success: true });
        break;
      }

      case 'add_context':
      case 'be_specific':
      case 'combine_prompts': {
        // These are informational - just acknowledge the apply action
        // The UI should show tips/examples
        this.send('v2SuggestionApplied', { id: suggestionId, success: true });
        break;
      }

      case 'resume_session': {
        // Resume previous session - UI handles this
        this.send('v2SuggestionApplied', { id: suggestionId, success: true });
        break;
      }

      default:
        this.send('v2SuggestionApplied', { id: suggestionId, success: false, error: `Unknown suggestion type: ${suggestionType}` });
    }
  }

  private async handleCheckSuggestions(): Promise<void> {
    const suggestionEngine = this.sharedContext.suggestionEngine;
    if (!suggestionEngine) {
      console.warn('[SuggestionHandler] SuggestionEngine not available');
      return;
    }

    const suggestion = suggestionEngine.checkSessionSuggestions();
    if (suggestion) {
      this.send('v2Suggestion', { suggestion });
    }
  }
}
