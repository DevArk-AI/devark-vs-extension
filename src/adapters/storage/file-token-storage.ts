/**
 * FileTokenStorage - File-based token storage with AES-256-GCM encryption
 *
 * Stores authentication token in ~/.devark/config.json (encrypted).
 * Compatible with CLI token storage format.
 */

import crypto from 'crypto';
import type { ITokenStorage } from '../../ports/storage/token-storage.interface';
import type { IFileSystem } from '../../ports/readers/file-system.interface';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const MIN_TOKEN_LENGTH = 10;

interface ConfigFile {
  token?: string;
  apiUrl?: string;
  [key: string]: unknown;
}

export class FileTokenStorage implements ITokenStorage {
  private readonly fs: IFileSystem;
  private readonly configDir: string;
  private readonly configPath: string;
  private readonly keyPath: string;
  private cachedKey: Buffer | null = null;

  constructor(fs: IFileSystem) {
    this.fs = fs;
    this.configDir = this.fs.join(this.fs.homedir(), '.devark');
    this.configPath = this.fs.join(this.configDir, 'config.json');
    this.keyPath = this.fs.join(this.configDir, '.key');
  }

  async getToken(): Promise<string | null> {
    try {
      const config = await this.readConfig();
      if (!config.token) {
        return null;
      }

      return await this.decrypt(config.token);
    } catch {
      return null;
    }
  }

  async storeToken(token: string): Promise<void> {
    if (!token || typeof token !== 'string' || token.length < MIN_TOKEN_LENGTH) {
      throw new Error(`Token must be at least ${MIN_TOKEN_LENGTH} characters`);
    }

    await this.ensureConfigDir();
    const encrypted = await this.encrypt(token);

    const config = await this.readConfigSafe();
    config.token = encrypted;
    await this.writeConfig(config);
  }

  async clearToken(): Promise<void> {
    try {
      const config = await this.readConfigSafe();
      delete config.token;
      await this.writeConfig(config);
    } catch {
      // Ignore errors when clearing - file might not exist
    }
  }

  async hasToken(): Promise<boolean> {
    try {
      const config = await this.readConfig();
      return config.token !== undefined && config.token !== null;
    } catch {
      return false;
    }
  }

  // === Private Methods ===

  private async ensureConfigDir(): Promise<void> {
    const exists = await this.fs.exists(this.configDir);
    if (!exists) {
      await this.fs.mkdir(this.configDir);
    }
  }

  private async readConfig(): Promise<ConfigFile> {
    const content = await this.fs.readFile(this.configPath);
    return JSON.parse(content);
  }

  private async readConfigSafe(): Promise<ConfigFile> {
    try {
      return await this.readConfig();
    } catch {
      return {};
    }
  }

  private async writeConfig(config: ConfigFile): Promise<void> {
    await this.fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  private async getOrCreateKey(): Promise<Buffer> {
    // Use cached key if available
    if (this.cachedKey) {
      return this.cachedKey;
    }

    try {
      const keyData = await this.fs.readFile(this.keyPath);
      this.cachedKey = Buffer.from(keyData, 'hex');
      return this.cachedKey;
    } catch {
      // Generate new key if doesn't exist
      const key = crypto.randomBytes(KEY_LENGTH);
      await this.ensureConfigDir();
      await this.fs.writeFile(this.keyPath, key.toString('hex'));
      this.cachedKey = key;
      return key;
    }
  }

  private async encrypt(text: string): Promise<string> {
    const key = await this.getOrCreateKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted (all hex-encoded)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private async decrypt(encryptedData: string): Promise<string> {
    const key = await this.getOrCreateKey();

    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('Invalid encrypted data format');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
