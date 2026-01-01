import { IConfigStore, Disposable } from '../config/config-store.interface';

/**
 * Mock Config Store for testing
 *
 * Provides an in-memory implementation of IConfigStore for unit tests.
 * Allows setting and getting configuration without touching VSCode settings.
 */
export class MockConfigStore implements IConfigStore {
  private config: Record<string, unknown> = {};
  private changeCallbacks: Array<(config: any) => void> = [];

  /**
   * Get a configuration value
   */
  get<T>(key: string, defaultValue: T): T {
    const value = this.config[key];
    return (value !== undefined ? value : defaultValue) as T;
  }

  /**
   * Get all configuration values
   */
  getAll(): Record<string, unknown> {
    return { ...this.config };
  }

  /**
   * Set a configuration value
   */
  async set(key: string, value: unknown): Promise<void> {
    this.config[key] = value;
    this.notifyChange();
  }

  /**
   * Set multiple configuration values at once
   */
  async setAll(newConfig: Record<string, unknown>): Promise<void> {
    this.config = { ...newConfig };
    this.notifyChange();
  }

  /**
   * Register a callback for configuration changes
   */
  onConfigChange(callback: (config: any) => void): Disposable {
    this.changeCallbacks.push(callback);
    return {
      dispose: () => {
        const index = this.changeCallbacks.indexOf(callback);
        if (index > -1) {
          this.changeCallbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Notify all listeners of configuration changes
   */
  private notifyChange(): void {
    const config = this.getAll();
    for (const callback of this.changeCallbacks) {
      callback(config);
    }
  }

  // Test helpers

  /**
   * Reset the store to empty state
   */
  reset(): void {
    this.config = {};
    this.changeCallbacks = [];
  }

  /**
   * Set initial config for tests
   */
  setInitialConfig(config: Record<string, unknown>): void {
    this.config = { ...config };
  }

  /**
   * Get number of registered change listeners
   */
  getListenerCount(): number {
    return this.changeCallbacks.length;
  }
}

/**
 * Helper to create a mock config store with common test settings
 */
export function createMockConfigStoreWithDefaults(): MockConfigStore {
  const store = new MockConfigStore();

  // Set some sensible defaults for LLM settings
  store.setInitialConfig({
    'llm.activeProvider': 'ollama',
    'llm.ollama.baseUrl': 'http://localhost:11434',
    'llm.ollama.model': 'llama3.1:latest',
    'llm.openrouter.apiKey': '',
    'llm.openrouter.model': 'test/mock-model'
  });

  return store;
}

/**
 * Mock SecureConfigStore for testing
 *
 * Provides an in-memory implementation of SecureConfigStore for unit tests.
 * Returns dummy API keys for testing purposes.
 */
export class MockSecureConfigStore {
  private keys: Map<string, string> = new Map();

  async setApiKey(provider: string, value: string): Promise<void> {
    this.keys.set(provider, value);
  }

  async getApiKey(provider: string): Promise<string | undefined> {
    return this.keys.get(provider);
  }

  async deleteApiKey(provider: string): Promise<void> {
    this.keys.delete(provider);
  }

  // Test helper: set initial API keys
  setInitialKeys(keys: Record<string, string>): void {
    for (const [provider, key] of Object.entries(keys)) {
      this.keys.set(provider, key);
    }
  }

  reset(): void {
    this.keys.clear();
  }
}

/**
 * Create a mock SecureConfigStore with default test API keys
 */
export function createMockSecureConfigStore(): MockSecureConfigStore {
  const store = new MockSecureConfigStore();
  store.setInitialKeys({
    openrouter: 'test-openrouter-api-key',
  });
  return store;
}
