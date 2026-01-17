/**
 * AuthService
 *
 * Orchestrates authentication flow using injected ports.
 * Handles login, logout, and auth status checks.
 */

import type { ITokenStorage } from '../ports/storage/token-storage.interface';
import type { IApiClient } from '../ports/network/api-client.interface';

export interface AuthLoginResult {
  authUrl: string;
  waitForCompletion: () => Promise<boolean>;
}

export interface AuthUser {
  userId: string;
  username?: string;
}

export class AuthService {
  private pendingAuthToken: string | null = null;

  constructor(
    private readonly tokenStorage: ITokenStorage,
    private readonly apiClient: IApiClient
  ) {}

  /**
   * Check if user has valid authentication.
   * Returns true only if token exists AND is valid on server.
   */
  async isAuthenticated(): Promise<boolean> {
    const hasToken = await this.tokenStorage.hasToken();
    if (!hasToken) {
      return false;
    }

    return this.verifyToken();
  }

  /**
   * Start OAuth login flow.
   * Returns auth URL to open in browser and SSE-based completion waiter.
   */
  async startLogin(): Promise<AuthLoginResult> {
    const result = await this.apiClient.createAuthSession();
    this.pendingAuthToken = result.token;

    return {
      authUrl: result.authUrl,
      waitForCompletion: () => this.waitForAuthWithSSE(),
    };
  }

  /**
   * Wait for auth completion using SSE (Server-Sent Events).
   * This matches the CLI's implementation for proper token retrieval.
   */
  private async waitForAuthWithSSE(): Promise<boolean> {
    if (!this.pendingAuthToken) {
      return false;
    }

    const sessionId = this.pendingAuthToken;
    const baseUrl = this.apiClient.getBaseUrl();
    const sseUrl = `${baseUrl}/api/auth/cli/stream/${sessionId}`;

    console.log('[AuthService] Connecting to SSE:', sseUrl);

    try {
      const apiToken = await this.streamSSE(sseUrl);

      // Store the API token (not the sessionId!)
      await this.tokenStorage.storeToken(apiToken);
      this.apiClient.setToken(apiToken);
      this.pendingAuthToken = null;

      return true;
    } catch (error) {
      console.error('[AuthService] SSE auth failed:', error);
      return false;
    }
  }

  /**
   * Connect to SSE endpoint and wait for success message with token.
   */
  private streamSSE(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error('Authentication timed out'));
      }, 5 * 60 * 1000); // 5 minute timeout

      fetch(url, {
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            clearTimeout(timeoutId);
            reject(new Error(`SSE connection failed: ${response.status}`));
            return;
          }

          const reader = response.body?.getReader();
          if (!reader) {
            clearTimeout(timeoutId);
            reject(new Error('No response body'));
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();

                // Skip heartbeats and comments
                if (trimmed.startsWith(':') || trimmed === '') {
                  continue;
                }

                // Parse data messages
                if (trimmed.startsWith('data: ')) {
                  const data = trimmed.substring(6);

                  try {
                    const parsed = JSON.parse(data);

                    switch (parsed.status) {
                      case 'success':
                        clearTimeout(timeoutId);
                        if (parsed.token) {
                          resolve(parsed.token);
                        } else {
                          reject(new Error('No token in success response'));
                        }
                        return;

                      case 'error':
                        clearTimeout(timeoutId);
                        reject(new Error(parsed.message || 'Authentication failed'));
                        return;

                      case 'expired':
                        clearTimeout(timeoutId);
                        reject(new Error('Authentication session expired'));
                        return;

                      case 'timeout':
                        clearTimeout(timeoutId);
                        reject(new Error('Authentication timed out'));
                        return;

                      case 'pending':
                        // Continue waiting
                        break;
                    }
                  } catch (parseError) {
                    console.error('[AuthService] Failed to parse SSE data:', parseError);
                  }
                }
              }
            }
          } catch (readError) {
            clearTimeout(timeoutId);
            reject(readError);
          }
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Clear stored credentials (logout).
   */
  async logout(): Promise<void> {
    await this.tokenStorage.clearToken();
    this.apiClient.setToken(null);
  }

  /**
   * Get current user info if authenticated.
   * Returns null if not authenticated.
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    const hasToken = await this.tokenStorage.hasToken();
    if (!hasToken) {
      return null;
    }

    try {
      const result = await this.apiClient.verifyToken();
      if (!result.valid || !result.userId) {
        return null;
      }
      return { userId: result.userId, username: result.user?.name };
    } catch {
      return null;
    }
  }

  /**
   * Verify token with server.
   * Returns false if no token or token invalid.
   */
  async verifyToken(): Promise<boolean> {
    const hasToken = await this.tokenStorage.hasToken();
    if (!hasToken) {
      return false;
    }

    try {
      const token = await this.tokenStorage.getToken();
      if (token) {
        this.apiClient.setToken(token);
      }
      const result = await this.apiClient.verifyToken();
      return result.valid;
    } catch {
      return false;
    }
  }

  /**
   * Get the stored token (for use by other services).
   */
  async getToken(): Promise<string | null> {
    return this.tokenStorage.getToken();
  }
}
