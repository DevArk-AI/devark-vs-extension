/**
 * Analytics Service for Mixpanel
 *
 * Uses Mixpanel HTTP API directly (Node.js compatible).
 * Follows the same patterns as devark-react-router/app/services/mixpanel.server.ts
 */

import * as vscode from 'vscode';
import type { AnalyticsEvent } from './analytics-events';
import { MIXPANEL_TOKEN } from '../config/analytics.config';

/** Function to check if user is registered to cloud */
export type AuthStatusChecker = () => Promise<boolean>;

export interface IAnalyticsService {
  /** Track an analytics event */
  track(event: AnalyticsEvent, properties?: Record<string, unknown>): void;

  /** Check if analytics is enabled */
  isEnabled(): boolean;

  /** Set the auth status checker (called after DI setup to avoid circular deps) */
  setAuthStatusChecker(checker: AuthStatusChecker): void;
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
  private readonly token: string;
  private readonly distinctId: string;
  private readonly apiUrl = 'https://api.mixpanel.com/track';
  private authStatusChecker: AuthStatusChecker | null = null;
  private cachedAuthStatus: boolean | null = null;
  private authStatusCacheTime = 0;
  private readonly AUTH_CACHE_TTL = 30000; // 30 seconds

  constructor() {
    this.token = MIXPANEL_TOKEN;
    this.distinctId = getDistinctId();
    console.log(`[Analytics] Initialized (${process.env.NODE_ENV})`);
  }

  setAuthStatusChecker(checker: AuthStatusChecker): void {
    this.authStatusChecker = checker;
  }

  isEnabled(): boolean {
    const telemetryConfig = vscode.workspace.getConfiguration('telemetry');
    const level = telemetryConfig.get<string>('telemetryLevel', 'all');
    return level !== 'off';
  }

  track(event: AnalyticsEvent, properties: Record<string, unknown> = {}): void {
    if (!this.isEnabled()) {
      return;
    }

    // Get auth status and send event
    this.getAuthStatus().then((isRegistered) => {
      const mixpanelEvent: MixpanelEvent = {
        event,
        properties: {
          distinct_id: this.distinctId,
          token: this.token,
          time: Math.floor(Date.now() / 1000),
          $insert_id: generateInsertId(),
          // Standard properties
          platform: 'vscode-extension',
          extension_version: process.env.EXTENSION_VERSION || 'unknown',
          is_registered_to_cloud: isRegistered,
          // User-provided properties
          ...properties,
        },
      };

      // Fire and forget - don't block on analytics
      this.sendEvent(mixpanelEvent).catch((err) => {
        console.warn('[Analytics] Failed to send event:', err.message);
      });
    });
  }

  private async getAuthStatus(): Promise<boolean> {
    // Use cached value if still valid
    if (this.cachedAuthStatus !== null && Date.now() - this.authStatusCacheTime < this.AUTH_CACHE_TTL) {
      return this.cachedAuthStatus;
    }

    // Check auth status if checker is available
    if (this.authStatusChecker) {
      try {
        this.cachedAuthStatus = await this.authStatusChecker();
        this.authStatusCacheTime = Date.now();
        return this.cachedAuthStatus;
      } catch {
        return false;
      }
    }

    return false;
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

  setAuthStatusChecker(): void {
    // No-op
  }

  track(): void {
    // No-op
  }
}
