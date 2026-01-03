/**
 * Extension State Manager
 *
 * Centralized state management for the extension.
 * Replaces scattered singleton patterns with a single source of truth.
 *
 * Benefits:
 * - Single initialization point
 * - Proper lifecycle management
 * - Easier testing (can reset state)
 * - Clear dependency injection
 */

import * as vscode from 'vscode';
import { LLMManager } from './llm/llm-manager';
import type { StatusBarManager } from './status-bar/StatusBarManager';
import type { ExtensionServices } from './di/types';
import type { IUnifiedSettingsService } from './services/UnifiedSettingsService';

/**
 * Detect if the extension is running in Cursor IDE vs VS Code
 *
 * Cursor is a fork of VS Code, so we detect it by checking:
 * 1. The app name contains 'Cursor'
 * 2. Cursor-specific environment variables exist
 * 3. Cursor's database path exists
 */
export function isCursorIDE(): boolean {
  // Method 1: Check VS Code app name (most reliable)
  const appName = vscode.env.appName.toLowerCase();
  if (appName.includes('cursor')) {
    return true;
  }

  // Method 2: Check for Cursor-specific environment variable
  if (process.env.CURSOR_CHANNEL || process.env.CURSOR_API_KEY) {
    return true;
  }

  return false;
}

/**
 * Get the editor type name for display purposes
 */
export function getEditorName(): 'Cursor' | 'VS Code' {
  return isCursorIDE() ? 'Cursor' : 'VS Code';
}

export class ExtensionState {
  private static _llmManager: LLMManager | null = null;
  private static _statusBarManager: StatusBarManager | null = null;
  private static _services: ExtensionServices | null = null;
  private static _unifiedSettingsService: IUnifiedSettingsService | null = null;

  /**
   * Set the LLM Manager instance
   */
  static setLLMManager(manager: LLMManager): void {
    this._llmManager = manager;
  }

  /**
   * Get the LLM Manager instance
   * @throws Error if LLM Manager has not been initialized
   */
  static getLLMManager(): LLMManager {
    if (!this._llmManager) {
      throw new Error('LLMManager not initialized. Call setLLMManager() first.');
    }
    return this._llmManager;
  }

  /**
   * Set the Status Bar Manager instance
   */
  static setStatusBarManager(manager: StatusBarManager): void {
    this._statusBarManager = manager;
  }

  /**
   * Get the Status Bar Manager instance (or null if not set)
   */
  static getStatusBarManager(): StatusBarManager | null {
    return this._statusBarManager;
  }

  /**
   * Set the Unified Settings Service instance
   */
  static setUnifiedSettingsService(service: IUnifiedSettingsService): void {
    this._unifiedSettingsService = service;
  }

  /**
   * Get the Unified Settings Service instance
   * @throws Error if UnifiedSettingsService has not been initialized
   */
  static getUnifiedSettingsService(): IUnifiedSettingsService {
    if (!this._unifiedSettingsService) {
      throw new Error('UnifiedSettingsService not initialized. Call setUnifiedSettingsService() first.');
    }
    return this._unifiedSettingsService;
  }

  /**
   * Check if UnifiedSettingsService is available (without throwing)
   */
  static hasUnifiedSettingsService(): boolean {
    return this._unifiedSettingsService !== null;
  }

  // === CLI-free Services (new architecture) ===

  /**
   * Set the extension services container
   */
  static setServices(services: ExtensionServices): void {
    this._services = services;
  }

  /**
   * Get the extension services container
   * @throws Error if services have not been initialized
   */
  static getServices(): ExtensionServices {
    if (!this._services) {
      throw new Error('Extension services not initialized. Call setServices() first.');
    }
    return this._services;
  }

  /**
   * Check if services are available (without throwing)
   */
  static hasServices(): boolean {
    return this._services !== null;
  }

  /**
   * Get the AuthService instance
   */
  static getAuthService() {
    return this.getServices().authService;
  }

  /**
   * Get the SyncService instance
   */
  static getSyncService() {
    return this.getServices().syncService;
  }

  /**
   * Get the Claude hook installer (implements IHookInstaller)
   */
  static getClaudeHookInstaller() {
    return this.getServices().claudeHookInstaller;
  }

  /**
   * Get the Cursor hook installer (implements IHookInstaller)
   */
  static getCursorHookInstaller() {
    return this.getServices().cursorHookInstaller;
  }

  /**
   * Get the Claude session reader (implements ISessionReader)
   */
  static getClaudeSessionReader() {
    return this.getServices().claudeSessionReader;
  }

  /**
   * Get the Cursor session reader (implements ISessionReader)
   */
  static getCursorSessionReader() {
    return this.getServices().cursorSessionReader;
  }

  /**
   * Get the SecureConfigStore for API key storage
   */
  static getSecureConfigStore() {
    return this.getServices().secureConfigStore;
  }

  /**
   * Get the API client for direct API calls
   */
  static getApiClient() {
    return this.getServices().apiClient;
  }

  /**
   * Get the Analytics service for Mixpanel tracking
   */
  static getAnalyticsService() {
    return this.getServices().analyticsService;
  }

  /**
   * Reset all state (useful for testing and deactivation)
   */
  static reset(): void {
    this._llmManager = null;
    this._statusBarManager = null;
    this._services = null;
    if (this._unifiedSettingsService) {
      this._unifiedSettingsService.dispose();
      this._unifiedSettingsService = null;
    }
  }

  /**
   * Check if state is initialized
   */
  static isInitialized(): boolean {
    return this._llmManager !== null && this._services !== null;
  }
}
