/**
 * Claude Settings Writer
 *
 * Claude-specific settings writer with path helpers for:
 * - Global settings: ~/.claude/settings.json
 * - Project local settings: ~/.claude/projects/{encoded-path}/.claude/settings.local.json
 */

import type { IFileSystem } from '../../ports/readers/file-system.interface';
import type { ISettingsWriter } from '../../ports/hooks/hook-installer.interface';
import { JsonSettingsWriter } from './json-settings-writer';

export class ClaudeSettingsWriter implements ISettingsWriter {
  private readonly jsonWriter: JsonSettingsWriter;

  constructor(private readonly fs: IFileSystem) {
    this.jsonWriter = new JsonSettingsWriter(fs);
  }

  // =========================================
  // Path Helpers
  // =========================================

  /**
   * Get path to global Claude settings file.
   * ~/.claude/settings.json
   */
  getGlobalSettingsPath(): string {
    return this.fs.join(this.fs.homedir(), '.claude', 'settings.json');
  }

  /**
   * Get path to project-local Claude settings file.
   * ~/.claude/projects/{encoded-path}/.claude/settings.local.json
   */
  getProjectLocalSettingsPath(projectDir: string): string {
    const encoded = ClaudeSettingsWriter.encodeProjectPath(projectDir);
    return this.fs.join(
      this.fs.homedir(),
      '.claude',
      'projects',
      encoded,
      '.claude',
      'settings.local.json'
    );
  }

  /**
   * Encode a project path for use in Claude's project directory structure.
   * Replaces slashes with dashes and removes leading dash.
   *
   * Example: /Users/danny/dev -> Users-danny-dev
   */
  static encodeProjectPath(projectDir: string): string {
    return projectDir.replace(/\//g, '-').replace(/^-/, '');
  }

  // =========================================
  // Global Settings Methods
  // =========================================

  /**
   * Read global settings.
   * Returns empty object if file doesn't exist.
   */
  async readGlobalSettings(): Promise<Record<string, unknown>> {
    return this.jsonWriter.read(this.getGlobalSettingsPath());
  }

  /**
   * Write global settings.
   * Overwrites existing file.
   */
  async writeGlobalSettings(settings: Record<string, unknown>): Promise<void> {
    return this.jsonWriter.write(this.getGlobalSettingsPath(), settings);
  }

  /**
   * Merge into global settings.
   * Creates file if it doesn't exist.
   */
  async mergeGlobalSettings(settings: Record<string, unknown>): Promise<void> {
    return this.jsonWriter.merge(this.getGlobalSettingsPath(), settings);
  }

  /**
   * Check if global settings file exists.
   */
  async globalSettingsExist(): Promise<boolean> {
    return this.jsonWriter.exists(this.getGlobalSettingsPath());
  }

  // =========================================
  // Project Settings Methods
  // =========================================

  /**
   * Read project-local settings.
   * Returns empty object if file doesn't exist.
   */
  async readProjectSettings(projectDir: string): Promise<Record<string, unknown>> {
    return this.jsonWriter.read(this.getProjectLocalSettingsPath(projectDir));
  }

  /**
   * Write project-local settings.
   * Overwrites existing file.
   */
  async writeProjectSettings(
    projectDir: string,
    settings: Record<string, unknown>
  ): Promise<void> {
    return this.jsonWriter.write(
      this.getProjectLocalSettingsPath(projectDir),
      settings
    );
  }

  /**
   * Merge into project-local settings.
   * Creates file if it doesn't exist.
   */
  async mergeProjectSettings(
    projectDir: string,
    settings: Record<string, unknown>
  ): Promise<void> {
    return this.jsonWriter.merge(
      this.getProjectLocalSettingsPath(projectDir),
      settings
    );
  }

  /**
   * Check if project-local settings file exists.
   */
  async projectSettingsExist(projectDir: string): Promise<boolean> {
    return this.jsonWriter.exists(this.getProjectLocalSettingsPath(projectDir));
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
