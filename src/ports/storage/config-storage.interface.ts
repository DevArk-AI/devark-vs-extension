/**
 * Config Storage Interface
 *
 * Contract for storing and retrieving user configuration.
 * Implementations:
 * - FileConfigStorage: Stores config in ~/.devark/config.json
 * - VSCodeConfigStorage: Uses VS Code's workspace/user settings
 */

/**
 * Extension configuration options
 */
export interface ExtensionConfig {
  // API settings
  apiUrl?: string;

  // Sync settings
  autoSync?: boolean;
  syncInterval?: number;  // in minutes

  // Privacy settings
  sanitizePaths?: boolean;
  sanitizeCredentials?: boolean;

  // UI settings
  showStatusBar?: boolean;
  showNotifications?: boolean;

  // Hook settings
  hooksEnabled?: boolean;
  hookTimeout?: number;  // in seconds

  // Custom instructions (for standups/reports)
  customInstructions?: string;
}

export interface IConfigStorage {
  /**
   * Get a specific configuration value
   * @param key The configuration key
   * @returns The value or undefined if not set
   */
  get<K extends keyof ExtensionConfig>(key: K): Promise<ExtensionConfig[K] | undefined>;

  /**
   * Set a configuration value
   * @param key The configuration key
   * @param value The value to set
   */
  set<K extends keyof ExtensionConfig>(key: K, value: ExtensionConfig[K]): Promise<void>;

  /**
   * Get all configuration values
   * @returns The complete configuration object
   */
  getAll(): Promise<ExtensionConfig>;

  /**
   * Set multiple configuration values at once
   * @param config Partial configuration to merge
   */
  setAll(config: Partial<ExtensionConfig>): Promise<void>;

  /**
   * Reset configuration to defaults
   */
  reset(): Promise<void>;

  /**
   * Check if configuration exists
   */
  exists(): Promise<boolean>;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<ExtensionConfig> = {
  apiUrl: 'https://app.devark.dev',
  autoSync: true,
  syncInterval: 30,
  sanitizePaths: true,
  sanitizeCredentials: true,
  showStatusBar: true,
  showNotifications: true,
  hooksEnabled: true,
  hookTimeout: 30,
  customInstructions: '',
};
