import * as fs from 'fs';
import * as path from 'path';
import { IConfigStore, Disposable } from './config-store.interface';

/**
 * File-based configuration implementation of IConfigStore.
 *
 * Stores configuration in a JSON file on disk. Ideal for:
 * - Unit tests (no VSCode dependency)
 * - CLI tools
 * - Server environments
 * - Standalone applications
 *
 * @example
 * const store = new FileConfigStore('/path/to/config.json');
 * const activeProvider = store.get('activeProvider', 'ollama');
 * await store.set('activeProvider', 'openrouter');
 */
export class FileConfigStore implements IConfigStore {
  /**
   * Creates a new file-based configuration store.
   *
   * If the file doesn't exist, it will be created on first write.
   *
   * @param configPath - Absolute path to JSON configuration file
   */
  constructor(private configPath: string) {}

  /**
   * Retrieves a configuration value from the JSON file.
   *
   * @param key - Configuration key
   * @param defaultValue - Fallback value if key doesn't exist or file is missing
   * @returns Configuration value or default
   */
  get<T>(key: string, defaultValue: T): T {
    const config = this.loadConfig();
    return (config[key] as T) ?? defaultValue;
  }

  /**
   * Updates a single configuration value in the JSON file.
   *
   * Reads existing config, merges the new value, and writes back.
   *
   * @param key - Configuration key
   * @param value - New value
   */
  async set(key: string, value: unknown): Promise<void> {
    const config = this.loadConfig();
    config[key] = value;
    await this.saveConfig(config);
  }

  /**
   * Retrieves all configuration from the JSON file.
   *
   * @returns All configuration keys and values
   */
  getAll(): Record<string, unknown> {
    return this.loadConfig();
  }

  /**
   * Replaces entire configuration file with new values.
   *
   * @param newConfig - New configuration object
   */
  async setAll(newConfig: Record<string, unknown>): Promise<void> {
    await this.saveConfig(newConfig);
  }

  /**
   * Subscribes to configuration file changes.
   *
   * Uses fs.watch to detect file modifications.
   *
   * @param callback - Function to call when file changes
   * @returns Disposable to stop watching
   */
  onConfigChange(callback: (config: Record<string, unknown>) => void): Disposable {
    let watcher: fs.FSWatcher | null = null;

    try {
      // Ensure directory exists before watching
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Create file if it doesn't exist
      if (!fs.existsSync(this.configPath)) {
        fs.writeFileSync(this.configPath, '{}', 'utf8');
      }

      watcher = fs.watch(this.configPath, (eventType) => {
        // Only fire callback on actual content changes
        if (eventType === 'change') {
          callback(this.loadConfig());
        }
      });
    } catch (error) {
      console.error('Failed to watch config file:', error);
    }

    return {
      dispose: () => {
        if (watcher) {
          watcher.close();
        }
      }
    };
  }

  /**
   * Loads configuration from disk.
   *
   * Handles missing files and corrupt JSON gracefully.
   *
   * @returns Configuration object or empty object if file doesn't exist
   */
  private loadConfig(): Record<string, unknown> {
    try {
      if (!fs.existsSync(this.configPath)) {
        return {};
      }

      const content = fs.readFileSync(this.configPath, 'utf8');

      // Handle empty files
      if (!content.trim()) {
        return {};
      }

      return JSON.parse(content);
    } catch (error) {
      // Log error but return empty config to avoid breaking consumers
      console.error(`Failed to load config from ${this.configPath}:`, error);
      return {};
    }
  }

  /**
   * Saves configuration to disk.
   *
   * Creates parent directories if needed. Uses atomic write pattern
   * (write to temp file, then rename) to prevent corruption.
   *
   * @param config - Configuration object to save
   */
  private async saveConfig(config: Record<string, unknown>): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      // Atomic write: write to temp file first
      const tempPath = `${this.configPath}.tmp`;
      const content = JSON.stringify(config, null, 2);

      await fs.promises.writeFile(tempPath, content, 'utf8');

      // Rename temp file to actual config (atomic on most filesystems)
      await fs.promises.rename(tempPath, this.configPath);
    } catch (error) {
      throw new Error(`Failed to save config to ${this.configPath}: ${error}`);
    }
  }
}
