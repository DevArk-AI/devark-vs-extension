/**
 * Configuration Store Abstraction Layer
 *
 * Provides pluggable configuration backends for the LLM provider system.
 *
 * NOTE: VSCodeConfigStore has been removed. All vscode settings access
 * now goes through UnifiedSettingsService, which is the sole gateway
 * to vscode.workspace.getConfiguration.
 *
 * Available implementations:
 * - FileConfigStore: Uses JSON file on disk (for tests)
 *
 * @example
 * // In unit tests
 * import { FileConfigStore } from './config';
 * const store = new FileConfigStore('/tmp/test-config.json');
 */

export * from './config-store.interface';
export * from './file-config-store';
