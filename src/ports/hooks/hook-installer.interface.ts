/**
 * Hook Installer Interface
 *
 * Contract for installing/managing hooks in Claude Code and Cursor.
 * Implementations:
 * - ClaudeHookInstaller: Writes to ~/.claude/settings.json and .claude/settings.local.json
 * - CursorHookInstaller: Writes to .cursor/hooks.json
 */

/**
 * Hook types supported by the system
 */
export type HookType = 'SessionStart' | 'SessionEnd' | 'PreCompact' | 'Stop' | 'UserPromptSubmit';

/**
 * Hook installation mode
 */
export type HookMode = 'all' | 'selected';

/**
 * Hook configuration
 */
export interface HookConfig {
  hooks: HookType[];
  mode: HookMode;
  timeout?: number;        // Timeout in seconds (default: 30)
  debug?: boolean;         // Enable debug output
  syncScriptPath?: string; // Path to the sync script
}

/**
 * Status of a single hook
 */
export interface HookStatus {
  type: HookType;
  installed: boolean;
  enabled: boolean;
  version?: string;
  lastExecution?: Date;
  executionCount?: number;
  successRate?: number;
}

/**
 * Overall hooks status
 */
export interface HooksStatus {
  installed: boolean;
  mode: HookMode;
  hooks: HookStatus[];
  globalSettings: boolean;   // Installed in global settings
  projectSettings: boolean;  // Installed in project settings
  version?: string;
}

/**
 * Hook installation result
 */
export interface HookInstallResult {
  success: boolean;
  hooksInstalled: HookType[];
  errors: HookInstallError[];
  warnings: string[];
}

/**
 * Hook installation error
 */
export interface HookInstallError {
  hook: HookType;
  error: string;
  recoverable: boolean;
}

/**
 * Hook execution statistics
 */
export interface HookStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;  // in milliseconds
  lastExecution?: Date;
  byProject: Record<string, {
    executions: number;
    lastExecution: Date;
  }>;
}

export interface IHookInstaller {
  /**
   * Install hooks with the given configuration
   * @param config Hook configuration
   */
  install(config: HookConfig): Promise<HookInstallResult>;

  /**
   * Uninstall all hooks
   */
  uninstall(): Promise<{ success: boolean; errors: string[] }>;

  /**
   * Uninstall a specific hook
   * @param hook The hook type to uninstall
   */
  uninstallHook(hook: HookType): Promise<{ success: boolean; error?: string }>;

  /**
   * Get the current hooks status
   */
  getStatus(): Promise<HooksStatus>;

  /**
   * Check if a specific hook is installed
   * @param hook The hook type
   */
  isHookInstalled(hook: HookType): Promise<boolean>;

  /**
   * Enable/disable a hook without uninstalling
   * @param hook The hook type
   * @param enabled Whether to enable or disable
   */
  setHookEnabled(hook: HookType, enabled: boolean): Promise<void>;

  /**
   * Get hook execution statistics
   */
  getStats(): Promise<HookStats>;

  /**
   * Update hook configuration
   * @param config Partial configuration to update
   */
  updateConfig(config: Partial<HookConfig>): Promise<void>;

  /**
   * Test hooks without actually syncing data
   * @returns Test results for each hook
   */
  testHooks(): Promise<Record<HookType, { success: boolean; output?: string; error?: string }>>;

  /**
   * Get the path to the sync script
   */
  getSyncScriptPath(): string;
}

/**
 * Settings writer interface (lower-level)
 * Used by hook installers to write to settings files
 */
export interface ISettingsWriter {
  /**
   * Read the current settings
   * @param path Settings file path
   */
  read(path: string): Promise<Record<string, unknown>>;

  /**
   * Write settings to file
   * @param path Settings file path
   * @param settings Settings to write
   */
  write(path: string, settings: Record<string, unknown>): Promise<void>;

  /**
   * Merge new settings with existing
   * @param path Settings file path
   * @param settings Settings to merge
   */
  merge(path: string, settings: Record<string, unknown>): Promise<void>;

  /**
   * Check if settings file exists
   * @param path Settings file path
   */
  exists(path: string): Promise<boolean>;

  /**
   * Create settings file with initial content
   * @param path Settings file path
   * @param settings Initial settings
   */
  create(path: string, settings: Record<string, unknown>): Promise<void>;
}
