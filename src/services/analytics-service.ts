/**
 * Analytics Service for Mixpanel
 *
 * Uses Mixpanel HTTP API directly (Node.js compatible).
 * Follows the same patterns as devark-react-router/app/services/mixpanel.server.ts
 */

import type { AnalyticsEvent } from './analytics-events';

export interface IAnalyticsService {
  /** Track an analytics event */
  track(event: AnalyticsEvent, properties?: Record<string, unknown>): void;

  /** Check if analytics is enabled */
  isEnabled(): boolean;
}

interface MixpanelEvent {
  event: string;
  properties: {
    distinct_id: string;
    token: string;
    time: number;
    $insert_id: string;
    [key: string]: unknown;
  };
}

/**
 * Generate a unique insert ID for event deduplication.
 */
function generateInsertId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Get or generate a distinct ID for anonymous tracking.
 * Uses a persistent ID stored in the extension's global state.
 */
function getDistinctId(): string {
  // Use a combination of machine-like identifiers for anonymous tracking
  // This will be consistent per VS Code installation
  const machineId =
    process.env.VSCODE_MACHINE_ID ||
    `anon-${Math.random().toString(36).substring(2, 15)}`;
  return machineId;
}

export class AnalyticsService implements IAnalyticsService {
  private readonly token: string | undefined;
  private readonly distinctId: string;
  private readonly apiUrl = 'https://api.mixpanel.com/track';

  constructor(token?: string) {
    this.token = token || process.env.MIXPANEL_TOKEN;
    this.distinctId = getDistinctId();

    if (this.token) {
      console.log('[Analytics] Initialized with Mixpanel tracking');
    } else {
      console.log('[Analytics] No token configured, tracking disabled');
    }
  }

  isEnabled(): boolean {
    return !!this.token && this.token !== 'placeholder-mixpanel-token';
  }

  track(event: AnalyticsEvent, properties: Record<string, unknown> = {}): void {
    if (!this.isEnabled()) {
      return;
    }

    const mixpanelEvent: MixpanelEvent = {
      event,
      properties: {
        distinct_id: this.distinctId,
        token: this.token!,
        time: Math.floor(Date.now() / 1000),
        $insert_id: generateInsertId(),
        // Standard properties
        platform: 'vscode-extension',
        extension_version: process.env.EXTENSION_VERSION || 'unknown',
        // User-provided properties
        ...properties,
      },
    };

    // Fire and forget - don't block on analytics
    this.sendEvent(mixpanelEvent).catch((err) => {
      console.warn('[Analytics] Failed to send event:', err.message);
    });
  }

  private async sendEvent(event: MixpanelEvent): Promise<void> {
    const payload = Buffer.from(JSON.stringify([event])).toString('base64');

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/plain',
      },
      body: `data=${payload}`,
    });

    if (!response.ok) {
      throw new Error(`Mixpanel API error: ${response.status}`);
    }

    const result = await response.text();
    if (result !== '1') {
      throw new Error(`Mixpanel rejected event: ${result}`);
    }
  }
}

/**
 * No-op analytics service for when tracking is disabled.
 */
export class NoOpAnalyticsService implements IAnalyticsService {
  isEnabled(): boolean {
    return false;
  }

  track(): void {
    // No-op
  }
}
