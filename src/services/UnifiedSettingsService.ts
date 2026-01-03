/**
 * Unified Settings Service
 *
 * THE SOLE GATEWAY to vscode.workspace configuration.
 * All settings access across the extension goes through this service.
 *
 * Provides:
 * - Type-safe configuration keys for handlers (get/set with SettingKey)
 * - Raw access for SettingsManager (getRaw/setRaw)
 * - Change notifications
 * - Consistent scope handling
 */

import * as vscode from 'vscode';
import type { SettingKey, SettingValue } from './settings-types';

/**
 * Configuration scope for settings updates
 */
export type SettingScope = 'global' | 'workspace';

/**
 * Callback for setting change events
 */
export type SettingChangeCallback<T extends SettingKey = SettingKey> = (
  value: SettingValue<T> | undefined
) => void;

/**
 * Interface for settings service
 */
export interface IUnifiedSettingsService {
  /**
   * Read a setting value with compile-time type safety
   * @param key - Setting key (type-safe)
   * @returns Setting value or undefined
   */
  get<T extends SettingKey>(key: T): SettingValue<T> | undefined;

  /**
   * Read a setting with fallback default
   */
  getWithDefault<T extends SettingKey>(
    key: T,
    defaultValue: SettingValue<T>
  ): SettingValue<T>;

  /**
   * Update a single setting
   * @param key - Setting key
   * @param value - New value
   * @param scope - 'global' (user) or 'workspace' (project)
   */
  set<T extends SettingKey>(
    key: T,
    value: SettingValue<T>,
    scope?: SettingScope
  ): Promise<void>;

  /**
   * Update multiple settings atomically
   */
  setMultiple(
    updates: Partial<Record<SettingKey, unknown>>,
    scope?: SettingScope
  ): Promise<void>;

  /**
   * Listen for changes to a specific setting
   * @returns Disposable to stop listening
   */
  onChange<T extends SettingKey>(
    key: T,
    callback: SettingChangeCallback<T>
  ): vscode.Disposable;

  /**
   * Listen for any setting changes
   */
  onAnyChange(
    callback: (key: SettingKey, value: unknown) => void
  ): vscode.Disposable;

  /**
   * Check if user has customized a setting
   */
  hasCustomValue(key: SettingKey): boolean;

  /**
   * Reset a setting to default
   */
  reset(key: SettingKey): Promise<void>;

  /**
   * Reset all settings to defaults
   */
  resetAll(): Promise<void>;

  /**
   * Low-level raw access for SettingsManager
   * @param section - Config section (e.g., 'devark.llm')
   * @param key - Config key within section
   * @param defaultValue - Default value if not set
   */
  getRaw<T>(section: string, key: string, defaultValue: T): T;

  /**
   * Low-level raw set for SettingsManager
   * @param section - Config section (e.g., 'devark.llm')
   * @param key - Config key within section
   * @param value - Value to set
   * @param scope - Configuration target scope
   */
  setRaw(section: string, key: string, value: unknown, scope?: SettingScope): Promise<void>;

  /**
   * Listen for raw config changes (for SettingsManager)
   */
  onRawChange(
    section: string,
    callback: () => void
  ): vscode.Disposable;

  /**
   * Dispose the service
   */
  dispose(): void;
}

/**
 * Default values for settings
 */
const DEFAULTS: Partial<Record<SettingKey, unknown>> = {
  'llm.activeProvider': 'ollama',
  'llm.timeout': 30000,
  'llm.providers': {},
  'llm.featureModels.enabled': false,
  'llm.featureModels.summaries': '',
  'llm.featureModels.promptScoring': '',
  'llm.featureModels.promptImprovement': '',
  'onboarding.completed': false,
  'autoAnalyze.enabled': false,
  'detection.useHooks': true,
};

/**
 * Implementation of unified settings service
 */
export class UnifiedSettingsService implements IUnifiedSettingsService {
  private listeners: Map<SettingKey, Set<SettingChangeCallback>> = new Map();
  private anyChangeListeners: Set<(key: SettingKey, value: unknown) => void> = new Set();
  private rawChangeListeners: Map<string, Set<() => void>> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.setupVSCodeChangeListener();
  }

  get<T extends SettingKey>(key: T): SettingValue<T> | undefined {
    const configKey = this.mapSettingKeyToConfigKey(key);

    if (key.startsWith('llm.')) {
      const config = vscode.workspace.getConfiguration('devark.llm');
      const llmKey = configKey.replace('llm.', '');
      return config.get(llmKey) as SettingValue<T>;
    } else {
      const config = vscode.workspace.getConfiguration('devark');
      return config.get(configKey) as SettingValue<T>;
    }
  }

  getWithDefault<T extends SettingKey>(
    key: T,
    defaultValue: SettingValue<T>
  ): SettingValue<T> {
    const value = this.get(key);
    return value !== undefined ? value : defaultValue;
  }

  async set<T extends SettingKey>(
    key: T,
    value: SettingValue<T>,
    scope: SettingScope = 'global'
  ): Promise<void> {
    const configTarget =
      scope === 'workspace' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    const configKey = this.mapSettingKeyToConfigKey(key);

    if (key.startsWith('llm.')) {
      const config = vscode.workspace.getConfiguration('devark.llm');
      const llmKey = configKey.replace('llm.', '');
      await config.update(llmKey, value, configTarget);
    } else {
      const config = vscode.workspace.getConfiguration('devark');
      await config.update(configKey, value, configTarget);
    }

    // Notify listeners
    this.notifyListeners(key, value);
  }

  async setMultiple(
    updates: Partial<Record<SettingKey, unknown>>,
    scope: SettingScope = 'global'
  ): Promise<void> {
    for (const [key, value] of Object.entries(updates)) {
      await this.set(key as SettingKey, value as any, scope);
    }
  }

  onChange<T extends SettingKey>(
    key: T,
    callback: SettingChangeCallback<T>
  ): vscode.Disposable {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback as any);

    return {
      dispose: () => {
        this.listeners.get(key)?.delete(callback as any);
      },
    };
  }

  onAnyChange(
    callback: (key: SettingKey, value: unknown) => void
  ): vscode.Disposable {
    this.anyChangeListeners.add(callback);

    return {
      dispose: () => {
        this.anyChangeListeners.delete(callback);
      },
    };
  }

  hasCustomValue(key: SettingKey): boolean {
    const value = this.get(key);
    const defaultValue = DEFAULTS[key];

    if (value === undefined) return false;
    if (defaultValue === undefined) return true;

    // Deep compare for objects
    if (typeof value === 'object' && typeof defaultValue === 'object') {
      return JSON.stringify(value) !== JSON.stringify(defaultValue);
    }

    return value !== defaultValue;
  }

  async reset(key: SettingKey): Promise<void> {
    const configKey = this.mapSettingKeyToConfigKey(key);

    if (key.startsWith('llm.')) {
      const config = vscode.workspace.getConfiguration('devark.llm');
      const llmKey = configKey.replace('llm.', '');
      await config.update(llmKey, undefined, vscode.ConfigurationTarget.Global);
    } else {
      const config = vscode.workspace.getConfiguration('devark');
      await config.update(configKey, undefined, vscode.ConfigurationTarget.Global);
    }

    this.notifyListeners(key, undefined);
  }

  async resetAll(): Promise<void> {
    const allSettings: SettingKey[] = [
      'llm.providers',
      'llm.activeProvider',
      'llm.timeout',
      'llm.featureModels.enabled',
      'llm.featureModels.summaries',
      'llm.featureModels.promptScoring',
      'llm.featureModels.promptImprovement',
      'onboarding.completed',
      'autoAnalyze.enabled',
      'detection.useHooks',
    ];

    for (const setting of allSettings) {
      await this.reset(setting);
    }
  }

  /**
   * Low-level raw access for SettingsManager
   */
  getRaw<T>(section: string, key: string, defaultValue: T): T {
    const config = vscode.workspace.getConfiguration(section);
    return config.get<T>(key, defaultValue);
  }

  /**
   * Low-level raw set for SettingsManager
   */
  async setRaw(section: string, key: string, value: unknown, scope: SettingScope = 'global'): Promise<void> {
    const config = vscode.workspace.getConfiguration(section);
    const configTarget =
      scope === 'workspace' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await config.update(key, value, configTarget);
  }

  /**
   * Listen for raw config changes (for SettingsManager)
   */
  onRawChange(section: string, callback: () => void): vscode.Disposable {
    if (!this.rawChangeListeners.has(section)) {
      this.rawChangeListeners.set(section, new Set());
    }
    this.rawChangeListeners.get(section)!.add(callback);

    return {
      dispose: () => {
        this.rawChangeListeners.get(section)?.delete(callback);
      },
    };
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.listeners.clear();
    this.anyChangeListeners.clear();
    this.rawChangeListeners.clear();
  }

  /**
   * Setup VSCode configuration change listener
   */
  private setupVSCodeChangeListener(): void {
    const listener = vscode.workspace.onDidChangeConfiguration((e) => {
      // Filter for vibelog settings
      if (!e.affectsConfiguration('devark')) return;

      // Check all settings that might have changed
      const allSettings: SettingKey[] = [
        'onboarding.completed',
        'autoAnalyze.enabled',
        'detection.useHooks',
        'llm.providers',
        'llm.activeProvider',
        'llm.timeout',
        'llm.featureModels.enabled',
        'llm.featureModels.summaries',
        'llm.featureModels.promptScoring',
        'llm.featureModels.promptImprovement',
      ];

      for (const setting of allSettings) {
        const configKey = this.mapSettingKeyToConfigKey(setting);
        const fullKey = setting.startsWith('llm.') ? `devark.llm.${configKey.replace('llm.', '')}` : `devark.${configKey}`;
        if (e.affectsConfiguration(fullKey)) {
          const value = this.get(setting);
          this.notifyListeners(setting, value);
        }
      }

      // Notify raw change listeners
      if (e.affectsConfiguration('devark.llm')) {
        this.rawChangeListeners.get('devark.llm')?.forEach((cb) => {
          try {
            cb();
          } catch (error) {
            console.error('Error in raw change listener:', error);
          }
        });
      }
    });

    this.disposables.push(listener);
  }

  /**
   * Notify all listeners of a setting change
   */
  private notifyListeners(key: SettingKey, value: unknown): void {
    // Notify specific listeners
    this.listeners.get(key)?.forEach((callback) => {
      try {
        callback(value as any);
      } catch (error) {
        console.error(`Error in settings listener for ${key}:`, error);
      }
    });

    // Notify any-change listeners
    this.anyChangeListeners.forEach((callback) => {
      try {
        callback(key, value);
      } catch (error) {
        console.error(`Error in settings any-change listener for ${key}:`, error);
      }
    });
  }

  /**
   * Map setting key to VSCode configuration key
   * E.g., 'onboarding.completed' -> 'onboardingCompleted'
   */
  private mapSettingKeyToConfigKey(key: string): string {
    // For dotted keys, VSCode uses camelCase for the first part after the dot
    if (key === 'onboarding.completed') return 'onboardingCompleted';
    if (key === 'autoAnalyze.enabled') return 'autoAnalyze';
    if (key === 'detection.useHooks') return 'useHookBasedDetection';

    // For llm.* settings, keep the dot notation
    return key;
  }
}
