/**
 * ConfigService
 *
 * Manages extension configuration with defaults.
 * Provides typed access to configuration values.
 */

import type {
  IConfigStorage,
  ExtensionConfig,
} from '../ports/storage/config-storage.interface';
import { DEFAULT_CONFIG } from '../ports/storage/config-storage.interface';

export class ConfigService {
  constructor(private readonly storage: IConfigStorage) {}

  /**
   * Get complete config with defaults applied.
   */
  async getConfig(): Promise<Required<ExtensionConfig>> {
    const stored = await this.storage.getAll();
    return { ...DEFAULT_CONFIG, ...stored };
  }

  /**
   * Get a single config value (with default fallback).
   */
  async get<K extends keyof ExtensionConfig>(
    key: K
  ): Promise<Required<ExtensionConfig>[K]> {
    const value = await this.storage.get(key);
    if (value !== undefined) {
      return value as Required<ExtensionConfig>[K];
    }
    return DEFAULT_CONFIG[key];
  }

  /**
   * Set a single config value.
   */
  async set<K extends keyof ExtensionConfig>(
    key: K,
    value: ExtensionConfig[K]
  ): Promise<void> {
    await this.storage.set(key, value);
  }

  /**
   * Update multiple config values at once.
   * Preserves existing values not specified in the update.
   */
  async update(config: Partial<ExtensionConfig>): Promise<void> {
    await this.storage.setAll(config);
  }

  /**
   * Reset configuration to defaults.
   */
  async reset(): Promise<void> {
    await this.storage.reset();
  }

  /**
   * Check if this is first run (no config exists).
   */
  async isFirstRun(): Promise<boolean> {
    const exists = await this.storage.exists();
    return !exists;
  }

  /**
   * Get the API URL (convenience method).
   */
  async getApiUrl(): Promise<string> {
    return this.get('apiUrl');
  }
}
