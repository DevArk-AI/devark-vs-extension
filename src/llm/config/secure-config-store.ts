import * as vscode from 'vscode';

/**
 * Secure storage for sensitive configuration values like API keys.
 *
 * Uses VSCode's SecretStorage API which:
 * - Encrypts secrets at rest
 * - Integrates with OS credential managers (Keychain, Credential Manager, etc.)
 * - Never stores secrets in plaintext settings.json
 *
 * @example
 * const secureStore = new SecureConfigStore(context.secrets);
 * await secureStore.setApiKey('openrouter', 'sk-or-v1-...');
 * const key = await secureStore.getApiKey('openrouter');
 */
export class SecureConfigStore {
  constructor(private secrets: vscode.SecretStorage) {}

  /**
   * Stores an API key securely for a provider.
   *
   * @param provider - Provider name (e.g., 'openrouter')
   * @param value - API key to store
   */
  async setApiKey(provider: string, value: string): Promise<void> {
    await this.secrets.store(`devark.${provider}.apiKey`, value);
  }

  /**
   * Retrieves an API key for a provider.
   *
   * @param provider - Provider name (e.g., 'openrouter')
   * @returns API key or undefined if not set
   */
  async getApiKey(provider: string): Promise<string | undefined> {
    return await this.secrets.get(`devark.${provider}.apiKey`);
  }

  /**
   * Deletes an API key for a provider.
   *
   * @param provider - Provider name (e.g., 'openrouter')
   */
  async deleteApiKey(provider: string): Promise<void> {
    await this.secrets.delete(`devark.${provider}.apiKey`);
  }
}
