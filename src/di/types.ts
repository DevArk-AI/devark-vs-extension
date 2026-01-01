/**
 * DI Container Types
 *
 * Type definitions for the extension's dependency injection container.
 * Defines the services available to the extension.
 */

import type { AuthService } from '../services/auth-service';
import type { SyncService } from '../services/sync-service';
import type { SymlinkManager } from '../bin/symlink-manager';
import type { ITokenStorage } from '../ports/storage/token-storage.interface';
import type { IApiClient } from '../ports/network/api-client.interface';
import type { ISessionReader } from '../ports/readers/session-reader.interface';
import type { IHookInstaller } from '../ports/hooks/hook-installer.interface';
import type { CursorSessionReader } from '../cursor-integration/session-reader';
import type { SecureConfigStore } from '../llm/config/secure-config-store';

/**
 * Extension services container interface.
 * Holds all the CLI-free services for the extension.
 */
export interface ExtensionServices {
  /** Authentication service for login/logout/token management */
  authService: AuthService;

  /** Session sync service for uploading sessions */
  syncService: SyncService;

  /** Manages the devark-sync symlink for hooks */
  symlinkManager: SymlinkManager;

  /** Direct token storage access (for extension commands) */
  tokenStorage: ITokenStorage;

  /** Direct API client access (for extension commands) */
  apiClient: IApiClient;

  /** Claude Code session reader (implements ISessionReader) */
  claudeSessionReader: ISessionReader;

  /** Cursor session reader (implements ISessionReader) */
  cursorSessionReader: CursorSessionReader;

  /** Claude Code hook installer (implements IHookInstaller) */
  claudeHookInstaller: IHookInstaller;

  /** Cursor hook installer (implements IHookInstaller) */
  cursorHookInstaller: IHookInstaller;

  /** Secure storage for API keys */
  secureConfigStore: SecureConfigStore;
}
