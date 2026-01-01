/**
 * Cursor Settings Writer
 *
 * Cursor-specific settings writer for managing hooks in .cursor/hooks.json.
 *
 * Cursor supports hooks at two levels:
 * - Global/user-level: ~/.cursor/hooks.json (recommended to avoid double-firing)
 * - Project-level: <project>/.cursor/hooks.json
 *
 * Different hook types: stop, beforeSubmitPrompt, afterFileEdit, etc.
 * Format: {"version": 1, "hooks": {"stop": [{"command": "..."}]}}
 *
 * @see https://blog.gitbutler.com/cursor-hooks-deep-dive
 */

import * as os from 'os';
import type { IFileSystem } from '../../ports/readers/file-system.interface';
import type { ISettingsWriter } from '../../ports/hooks/hook-installer.interface';
import { JsonSettingsWriter } from './json-settings-writer';

/**
 * Available Cursor hook types
 */
export type CursorHookType =
  | 'stop'
  | 'beforeSubmitPrompt'
  | 'beforeShellExecution'
  | 'beforeReadFile'
  | 'afterFileEdit'
  | 'beforeMCPExecution';

/**
 * Cursor hook command
 */
export interface CursorHookCommand {
  command: string;
}

/**
 * Cursor hooks configuration
 */
export interface CursorHooksConfig {
  version?: number;
  hooks?: Partial<Record<CursorHookType, CursorHookCommand[]>>;
}

export class CursorSettingsWriter implements ISettingsWriter {
  private readonly jsonWriter: JsonSettingsWriter;

  constructor(private readonly fs: IFileSystem) {
    this.jsonWriter = new JsonSettingsWriter(fs);
  }

  // =========================================
  // Path Helpers
  // =========================================

  /**
   * Get path to global/user-level hooks.json file.
   * Located at ~/.cursor/hooks.json
   */
  getGlobalHooksPath(): string {
    return this.fs.join(os.homedir(), '.cursor', 'hooks.json');
  }

  /**
   * Get path to project hooks.json file.
   * Located at <project>/.cursor/hooks.json
   */
  getProjectHooksPath(projectDir: string): string {
    // Remove trailing slash if present
    const cleanPath = projectDir.endsWith('/')
      ? projectDir.slice(0, -1)
      : projectDir;

    return this.fs.join(cleanPath, '.cursor', 'hooks.json');
  }

  // =========================================
  // Global Hooks Methods (Recommended)
  // =========================================

  /**
   * Read global/user-level hooks.
   * Returns empty object if file doesn't exist.
   */
  async readGlobalHooks(): Promise<CursorHooksConfig> {
    return this.jsonWriter.read(this.getGlobalHooksPath()) as Promise<CursorHooksConfig>;
  }

  /**
   * Write global/user-level hooks.
   * Overwrites existing file.
   */
  async writeGlobalHooks(config: CursorHooksConfig): Promise<void> {
    return this.jsonWriter.write(
      this.getGlobalHooksPath(),
      config as Record<string, unknown>
    );
  }

  /**
   * Check if global hooks file exists.
   */
  async globalHooksExist(): Promise<boolean> {
    return this.jsonWriter.exists(this.getGlobalHooksPath());
  }

  // =========================================
  // Project Hooks Methods
  // =========================================

  /**
   * Read project hooks.
   * Returns empty object if file doesn't exist.
   */
  async readProjectHooks(projectDir: string): Promise<CursorHooksConfig> {
    return this.jsonWriter.read(
      this.getProjectHooksPath(projectDir)
    ) as Promise<CursorHooksConfig>;
  }

  /**
   * Write project hooks.
   * Overwrites existing file.
   */
  async writeProjectHooks(
    projectDir: string,
    config: CursorHooksConfig
  ): Promise<void> {
    return this.jsonWriter.write(
      this.getProjectHooksPath(projectDir),
      config as Record<string, unknown>
    );
  }

  /**
   * Merge into project hooks.
   * Creates file if it doesn't exist.
   */
  async mergeProjectHooks(
    projectDir: string,
    config: CursorHooksConfig
  ): Promise<void> {
    return this.jsonWriter.merge(
      this.getProjectHooksPath(projectDir),
      config as Record<string, unknown>
    );
  }

  /**
   * Check if project hooks file exists.
   */
  async projectHooksExist(projectDir: string): Promise<boolean> {
    return this.jsonWriter.exists(this.getProjectHooksPath(projectDir));
  }

  // =========================================
  // ISettingsWriter Implementation
  // (delegates to JsonSettingsWriter)
  // =========================================

  async read(path: string): Promise<Record<string, unknown>> {
    return this.jsonWriter.read(path);
  }

  async write(path: string, settings: Record<string, unknown>): Promise<void> {
    return this.jsonWriter.write(path, settings);
  }

  async merge(path: string, settings: Record<string, unknown>): Promise<void> {
    return this.jsonWriter.merge(path, settings);
  }

  async exists(path: string): Promise<boolean> {
    return this.jsonWriter.exists(path);
  }

  async create(path: string, settings: Record<string, unknown>): Promise<void> {
    return this.jsonWriter.create(path, settings);
  }
}
