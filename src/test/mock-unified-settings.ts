/**
 * Mock UnifiedSettingsService for testing
 *
 * Provides an in-memory implementation without depending on VSCode APIs.
 * Useful for unit tests that need to test settings behavior in isolation.
 */

import type { IUnifiedSettingsService, SettingScope, SettingChangeCallback } from '../services/UnifiedSettingsService';
import type { SettingKey, SettingValue } from '../services/settings-types';
import * as vscode from 'vscode';

/**
 * Mock implementation of UnifiedSettingsService
 */
export class MockUnifiedSettingsService implements IUnifiedSettingsService {
  private settings: Map<SettingKey, any> = new Map();
  private rawSettings: Map<string, any> = new Map();
  private listeners: Map<SettingKey, Set<SettingChangeCallback>> = new Map();
  private anyChangeListeners: Set<(key: SettingKey, value: unknown) => void> = new Set();
  private rawChangeListeners: Map<string, Set<() => void>> = new Map();

  constructor(initialSettings: Partial<Record<SettingKey, any>> = {}) {
    // Initialize with provided settings
    for (const [key, value] of Object.entries(initialSettings)) {
      this.settings.set(key as SettingKey, value);
    }
  }

  get<T extends SettingKey>(key: T): SettingValue<T> | undefined {
    return this.settings.get(key);
  }

  getWithDefault<T extends SettingKey>(
    key: T,
    defaultValue: SettingValue<T>
  ): SettingValue<T> {
    const value = this.settings.get(key);
    return value !== undefined ? value : defaultValue;
  }

  async set<T extends SettingKey>(
    key: T,
    value: SettingValue<T>,
    scope?: SettingScope
  ): Promise<void> {
    // scope is unused in the mock - we just store all settings in memory
    void scope;
    this.settings.set(key, value);
    this.notifyListeners(key, value);
  }

  async setMultiple(
    updates: Partial<Record<SettingKey, unknown>>,
    scope?: SettingScope
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
    return this.settings.has(key);
  }

  async reset(key: SettingKey): Promise<void> {
    this.settings.delete(key);
    this.notifyListeners(key, undefined);
  }

  async resetAll(): Promise<void> {
    const keys = Array.from(this.settings.keys());
    this.settings.clear();
    for (const key of keys) {
      this.notifyListeners(key, undefined);
    }
  }

  getRaw<T>(section: string, key: string, defaultValue: T): T {
    const fullKey = `${section}.${key}`;
    const value = this.rawSettings.get(fullKey);
    return value !== undefined ? value : defaultValue;
  }

  async setRaw(section: string, key: string, value: unknown): Promise<void> {
    const fullKey = `${section}.${key}`;
    this.rawSettings.set(fullKey, value);
    // Notify raw change listeners
    this.rawChangeListeners.get(section)?.forEach((cb) => {
      try { cb(); } catch (e) { console.error(e); }
    });
  }

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
    this.listeners.clear();
    this.anyChangeListeners.clear();
    this.rawChangeListeners.clear();
  }

  /**
   * Helper method to simulate setting changes (for testing)
   */
  simulateChange<T extends SettingKey>(key: T, value: SettingValue<T> | undefined): void {
    if (value !== undefined) {
      this.settings.set(key, value);
    } else {
      this.settings.delete(key);
    }
    this.notifyListeners(key, value);
  }

  /**
   * Get all settings (for testing)
   */
  getAllSettings(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of this.settings) {
      result[key] = value;
    }
    return result;
  }

  private notifyListeners(key: SettingKey, value: unknown): void {
    this.listeners.get(key)?.forEach((callback) => {
      try {
        callback(value as any);
      } catch (error) {
        console.error(`Error in mock settings listener for ${key}:`, error);
      }
    });

    this.anyChangeListeners.forEach((callback) => {
      try {
        callback(key, value);
      } catch (error) {
        console.error(`Error in mock any-change listener for ${key}:`, error);
      }
    });
  }
}
