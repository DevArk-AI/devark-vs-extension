/**
 * Token Storage Interface
 *
 * Contract for storing and retrieving authentication tokens.
 * Implementations:
 * - FileTokenStorage: Stores token in ~/.devark/ (shared with CLI)
 * - VSCodeSecretStorage: Uses VS Code's SecretStorage API (more secure in extension)
 */

export interface ITokenStorage {
  /**
   * Retrieve the stored authentication token
   * @returns The token string, or null if not stored
   */
  getToken(): Promise<string | null>;

  /**
   * Store an authentication token securely
   * @param token The token to store
   */
  storeToken(token: string): Promise<void>;

  /**
   * Clear the stored token (logout)
   */
  clearToken(): Promise<void>;

  /**
   * Check if a token exists without retrieving it
   * Useful for quick auth status checks
   */
  hasToken(): Promise<boolean>;
}
