/**
 * FeedbackHandler - Handles user feedback submission
 *
 * Responsibilities:
 * - Submit feedback to DevArk cloud
 * - Uses authenticated endpoint if logged in, anonymous endpoint otherwise
 * - Track feedback submission analytics
 */

import { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
import { SharedContext } from './shared-context';
import { ExtensionState } from '../../extension-state';
import type { WebviewMessageData } from '../../shared/webview-protocol';
import { AnalyticsEvents } from '../../services/analytics-events';
import { DEFAULT_CONFIG } from '../../ports/storage/config-storage.interface';

function getBaseUrl(): string {
  return process.env.DEVARK_API_URL || DEFAULT_CONFIG.apiUrl;
}

export class FeedbackHandler extends BaseMessageHandler {
  constructor(
    messageSender: MessageSender,
    handlerContext: HandlerContext,
    _sharedContext: SharedContext
  ) {
    super(messageSender, handlerContext);
  }

  getHandledMessageTypes(): string[] {
    return ['submitFeedback'];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    switch (type) {
      case 'submitFeedback': {
        const d = data as WebviewMessageData<'submitFeedback'>;
        await this.handleSubmitFeedback(d.rating, d.message);
        return true;
      }
      default:
        return false;
    }
  }

  private async handleSubmitFeedback(rating: number, message?: string): Promise<void> {
    console.log(`[FeedbackHandler] Submitting feedback: ${rating} stars`);

    // Track analytics
    const analyticsService = ExtensionState.getAnalyticsService();
    analyticsService.track(AnalyticsEvents.FEEDBACK_SUBMITTED, {
      rating,
      has_message: !!message,
    });

    // Check if user is authenticated
    const authService = ExtensionState.getAuthService();
    const isAuthenticated = await authService.isAuthenticated();

    console.log(`[FeedbackHandler] isAuthenticated: ${isAuthenticated}`);

    // Submit to server (fire and forget)
    try {
      if (isAuthenticated) {
        // Authenticated: use apiClient (already has token configured)
        const apiClient = ExtensionState.getApiClient();
        console.log(`[FeedbackHandler] Sending authenticated via apiClient`);

        const result = await apiClient.submitFeedback(rating, message);
        if (result.success) {
          console.log('[FeedbackHandler] Authenticated feedback submitted successfully');
        } else {
          console.warn('[FeedbackHandler] Authenticated feedback failed');
        }
      } else {
        // Anonymous: use /api/feedback-anonymous directly
        const feedbackUrl = `${getBaseUrl()}/api/feedback-anonymous`;
        console.log(`[FeedbackHandler] Sending anonymous to: ${feedbackUrl}`);

        const anonymousId = process.env.VSCODE_MACHINE_ID || undefined;
        const extensionVersion = process.env.EXTENSION_VERSION || undefined;

        const response = await fetch(feedbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rating,
            message: message || undefined,
            source: 'vscode-extension',
            extensionVersion,
            anonymousId,
          }),
        });

        if (!response.ok) {
          console.warn('[FeedbackHandler] Anonymous feedback failed:', response.status);
        } else {
          console.log('[FeedbackHandler] Anonymous feedback submitted successfully');
        }
      }
    } catch (error) {
      console.warn('[FeedbackHandler] Failed to submit feedback:', error);
      // Don't throw - feedback is fire-and-forget
    }
  }
}
