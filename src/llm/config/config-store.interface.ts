/**
 * Abstraction for configuration storage backends.
 *
 * This interface decouples the LLM provider system from specific configuration
 * implementations (VSCode workspace settings, file system, environment variables, etc.).
 *
 * Benefits:
 * - Testability: Use FileConfigStore or in-memory implementations for tests
 * - Portability: Run outside VSCode (CLI, server, other editors)
 * - Flexibility: Swap backends without changing business logic
 */
export interface IConfigStore {
  /**
   * Retrieves a configuration value by key.
   *
   * @param key - Configuration key (e.g., 'activeProvider', 'providers.ollama.endpoint')
   * @param defaultValue - Value to return if key doesn't exist
   * @returns The configuration value or default
   *
   * @example
   * const activeProvider = store.get('activeProvider', 'ollama');
   */
  get<T>(key: string, defaultValue: T): T;

  /**
   * Retrieves all configuration as a flat key-value object.
   *
   * @returns All configuration values
   *
   * @example
   * const config = store.getAll();
   * // { activeProvider: 'ollama', providers: { ... } }
   */
  getAll(): Record<string, unknown>;

  /**
   * Updates a single configuration value.
   *
   * @param key - Configuration key to update
   * @param value - New value
   *
   * @example
   * await store.set('activeProvider', 'openrouter');
   */
  set(key: string, value: unknown): Promise<void>;

  /**
   * Replaces entire configuration with new values.
   *
   * @param config - New configuration object
   *
   * @example
   * await store.setAll({
   *   activeProvider: 'ollama',
   *   providers: { ollama: { endpoint: 'http://localhost:11434' } }
   * });
   */
  setAll(config: Record<string, unknown>): Promise<void>;

  /**
   * Registers a callback for configuration changes.
   *
   * @param callback - Function to call when configuration changes
   * @returns Disposable to unsubscribe from changes
   *
   * @example
   * const subscription = store.onConfigChange(config => {
   *   console.log('Config updated:', config);
   * });
   * // Later: subscription.dispose();
   */
  onConfigChange(callback: (config: Record<string, unknown>) => void): Disposable;
}

/**
 * Represents a subscription or resource that can be cleaned up.
 *
 * Compatible with VSCode's Disposable pattern but not dependent on it.
 */
export interface Disposable {
  /**
   * Releases resources and unsubscribes from events.
   */
  dispose(): void;
}
