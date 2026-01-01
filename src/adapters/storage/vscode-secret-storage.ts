/**
 * VSCodeTokenStorage - VS Code SecretStorage-based token storage
 *
 * Implements ITokenStorage using VS Code's SecretStorage API.
 * Tokens are encrypted and stored securely using the OS credential manager
 * (Keychain on macOS, Credential Manager on Windows, libsecret on Linux).
 *
 * Benefits over file-based storage:
 * - OS-level encryption
 * - Syncs across machines via VS Code Settings Sync
 * - No file management needed
 */

import type { ITokenStorage } from '../../ports/storage/token-storage.interface';

/**
 * VS Code SecretStorage interface (subset we use)
 * Using a type instead of importing vscode to keep adapter testable
 */
export interface SecretStorage {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

export class VSCodeTokenStorage implements ITokenStorage {
  private readonly KEY = 'devark.auth.token';

  constructor(private readonly secrets: SecretStorage) {}

  async getToken(): Promise<string | null> {
    const token = await this.secrets.get(this.KEY);
    return token ?? null;
  }

  async storeToken(token: string): Promise<void> {
    await this.secrets.store(this.KEY, token);
  }

  async clearToken(): Promise<void> {
    await this.secrets.delete(this.KEY);
  }

  async hasToken(): Promise<boolean> {
    const token = await this.secrets.get(this.KEY);
    return token !== undefined && token !== null && token !== '';
  }
}
