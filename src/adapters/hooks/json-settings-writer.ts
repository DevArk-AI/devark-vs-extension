/**
 * JSON Settings Writer
 *
 * Generic JSON file reader/writer implementing ISettingsWriter.
 * Used as the foundation for Claude and Cursor settings writers.
 */

import type { IFileSystem } from '../../ports/readers/file-system.interface';
import type { ISettingsWriter } from '../../ports/hooks/hook-installer.interface';

export class JsonSettingsWriter implements ISettingsWriter {
  constructor(private readonly fs: IFileSystem) {}

  /**
   * Read settings from a JSON file.
   * Returns empty object if file doesn't exist or is empty.
   * Throws if file exists but contains invalid JSON.
   */
  async read(path: string): Promise<Record<string, unknown>> {
    try {
      const content = await this.fs.readFile(path);
      // Handle empty file (0 bytes) - treat same as non-existent
      if (!content || content.trim() === '') {
        return {};
      }
      return JSON.parse(content);
    } catch (error: unknown) {
      // File doesn't exist - return empty object
      if (this.isFileNotFoundError(error)) {
        return {};
      }
      // Invalid JSON or other error - rethrow
      throw error;
    }
  }

  /**
   * Write settings to a JSON file.
   * Creates parent directories if needed.
   * Overwrites existing file.
   */
  async write(path: string, settings: Record<string, unknown>): Promise<void> {
    // Ensure parent directory exists
    const dir = this.fs.dirname(path);
    await this.fs.mkdir(dir);

    // Write with pretty formatting (2-space indent)
    const content = JSON.stringify(settings, null, 2);
    await this.fs.writeFile(path, content);
  }

  /**
   * Check if a settings file exists.
   */
  async exists(path: string): Promise<boolean> {
    return this.fs.exists(path);
  }

  /**
   * Create a new settings file.
   * Throws if file already exists.
   */
  async create(path: string, settings: Record<string, unknown>): Promise<void> {
    if (await this.exists(path)) {
      throw new Error('File already exists');
    }

    await this.write(path, settings);
  }

  /**
   * Merge new settings into existing file.
   * Creates file if it doesn't exist.
   * Deep merges objects, replaces arrays and primitives.
   */
  async merge(path: string, settings: Record<string, unknown>): Promise<void> {
    const existing = await this.read(path);
    const merged = this.deepMerge(existing, settings);
    await this.write(path, merged);
  }

  /**
   * Deep merge two objects.
   * - Objects are recursively merged
   * - Arrays and primitives are replaced (not merged)
   */
  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        this.isPlainObject(sourceValue) &&
        this.isPlainObject(targetValue)
      ) {
        // Both are objects - recurse
        result[key] = this.deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else {
        // Replace (arrays, primitives, null, etc.)
        result[key] = sourceValue;
      }
    }

    return result;
  }

  /**
   * Check if value is a plain object (not array, null, etc.)
   */
  private isPlainObject(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    );
  }

  /**
   * Check if error is a file-not-found error
   */
  private isFileNotFoundError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('ENOENT');
    }
    return false;
  }
}
