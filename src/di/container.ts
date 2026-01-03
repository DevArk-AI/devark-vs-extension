/**
 * DI Container
 *
 * Factory function to create all extension services with proper wiring.
 * This is the composition root - all dependencies are assembled here.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { ExtensionServices } from './types';

// Adapters
import { VSCodeTokenStorage } from '../adapters/storage/vscode-secret-storage';
import { FileSyncStateStorage } from '../adapters/storage/file-sync-state';
import { NodeFileSystem } from '../adapters/readers/node-filesystem';
import { FetchHttpClient } from '../adapters/network/fetch-http-client';
import { DevArkApiClient } from '../adapters/network/devark-api-client';
import { ClaudeSessionReader } from '../adapters/readers/claude-session-reader';
import { CursorSessionReader } from '../cursor-integration/session-reader';
import { ClaudeSettingsWriter } from '../adapters/hooks/claude-settings-writer';
import { CursorSettingsWriter } from '../adapters/hooks/cursor-settings-writer';
import { ClaudeHookInstaller } from '../adapters/hooks/claude-hook-installer';
import { CursorHookInstaller } from '../adapters/hooks/cursor-hook-installer';

// Services
import { AuthService } from '../services/auth-service';
import { SyncService } from '../services/sync-service';
import { SymlinkManager } from '../bin/symlink-manager';
import { SecureConfigStore } from '../llm/config/secure-config-store';
import { AnalyticsService } from '../services/analytics-service';

/**
 * Get the path to the sync script based on the extension's installation path.
 * @param extensionUri The extension's URI
 */
function getSyncScriptPath(extensionUri: vscode.Uri): string {
  // The sync script is bundled to dist/bin/devark-sync.js
  return path.join(extensionUri.fsPath, 'dist', 'bin', 'devark-sync.js');
}

/**
 * Get the path to the Claude Code prompt hook script.
 * @param extensionUri The extension's URI
 */
function getClaudePromptHookPath(extensionUri: vscode.Uri): string {
  // The Claude hook script is bundled to dist/claude-hooks/user-prompt-submit.js
  return path.join(extensionUri.fsPath, 'dist', 'claude-hooks', 'user-prompt-submit.js');
}

/**
 * Get the path to the Claude Code stop hook script.
 * @param extensionUri The extension's URI
 */
function getClaudeStopHookPath(extensionUri: vscode.Uri): string {
  // The Claude hook script is bundled to dist/claude-hooks/stop.js
  return path.join(extensionUri.fsPath, 'dist', 'claude-hooks', 'stop.js');
}

/**
 * Get the path to the Cursor prompt hook script.
 * @param extensionUri The extension's URI
 */
function getCursorPromptHookPath(extensionUri: vscode.Uri): string {
  return path.join(extensionUri.fsPath, 'dist', 'cursor-hooks', 'before-submit-prompt.js');
}

/**
 * Get the path to the Cursor response hook script.
 * @param extensionUri The extension's URI
 */
function getCursorResponseHookPath(extensionUri: vscode.Uri): string {
  return path.join(extensionUri.fsPath, 'dist', 'cursor-hooks', 'post-response.js');
}

/**
 * Create all extension services.
 *
 * This is the composition root where all dependencies are wired together.
 * Call this once during extension activation.
 *
 * @param context The VS Code extension context
 * @returns All extension services
 */
export function createExtensionServices(
  context: vscode.ExtensionContext
): ExtensionServices {
  // File system adapter
  const fs = new NodeFileSystem();

  // Token storage - uses VS Code SecretStorage (OS-level encryption, syncs across devices)
  const tokenStorage = new VSCodeTokenStorage(context.secrets);

  // Secure config store for API keys
  const secureConfigStore = new SecureConfigStore(context.secrets);

  // HTTP client
  const httpClient = new FetchHttpClient();

  // API client (token is set by AuthService when needed)
  const serverUrl = process.env.DEVARK_API_URL;
  const apiClient = new DevArkApiClient(httpClient, serverUrl);

  // Auth service
  const authService = new AuthService(tokenStorage, apiClient);

  // Sync state storage (file-based, local)
  const syncState = new FileSyncStateStorage(fs);

  // Session readers
  const claudeSessionReader = new ClaudeSessionReader(fs);
  const cursorSessionReader = new CursorSessionReader();

  // Sync service (supports both Claude and Cursor)
  const syncService = new SyncService({
    claudeReader: claudeSessionReader,
    cursorReader: cursorSessionReader,
    apiClient,
    syncState,
    authService,
  });

  // Hook writers
  const claudeWriter = new ClaudeSettingsWriter(fs);
  const cursorWriter = new CursorSettingsWriter(fs);

  // Symlink manager for devark-sync script
  const syncScriptPath = getSyncScriptPath(context.extensionUri);
  const symlinkManager = new SymlinkManager(fs, syncScriptPath);

  // Hook script paths
  const claudePromptHookPath = getClaudePromptHookPath(context.extensionUri);
  const claudeStopHookPath = getClaudeStopHookPath(context.extensionUri);
  const cursorPromptHookPath = getCursorPromptHookPath(context.extensionUri);
  const cursorResponseHookPath = getCursorResponseHookPath(context.extensionUri);

  // Hook installers (implement IHookInstaller)
  const claudeHookInstaller = new ClaudeHookInstaller(
    claudeWriter,
    symlinkManager.getSymlinkPath(),
    claudePromptHookPath,
    claudeStopHookPath
  );

  const cursorHookInstaller = new CursorHookInstaller(
    cursorWriter,
    symlinkManager.getSymlinkPath(),
    cursorPromptHookPath,
    cursorResponseHookPath
  );

  // Analytics service
  const analyticsService = new AnalyticsService();

  return {
    authService,
    syncService,
    symlinkManager,
    tokenStorage,
    apiClient,
    claudeSessionReader,
    cursorSessionReader,
    claudeHookInstaller,
    cursorHookInstaller,
    secureConfigStore,
    analyticsService,
  };
}
