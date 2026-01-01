/**
 * SymlinkManager
 *
 * Manages the devark-sync symlink that hooks use to call the sync script.
 * Creates a symlink at ~/.devark/devark-sync pointing to the extension's
 * compiled sync script.
 *
 * On Windows, symlinks require elevated permissions or Developer Mode.
 * Falls back to copying the file if symlink creation fails.
 */

import type { IFileSystem } from '../ports/readers/file-system.interface';

export class SymlinkManager {
  private readonly symlinkDir: string;
  private readonly symlinkPath: string;
  private usedCopyFallback = false;

  constructor(
    private readonly fs: IFileSystem,
    private readonly scriptPath: string
  ) {
    this.symlinkDir = this.fs.join(this.fs.homedir(), '.devark');
    this.symlinkPath = this.fs.join(this.symlinkDir, 'devark-sync');
  }

  /**
   * Get the path where the symlink will be created
   */
  getSymlinkPath(): string {
    return this.symlinkPath;
  }

  /**
   * Get the path to the extension's sync script
   */
  getScriptPath(): string {
    return this.scriptPath;
  }

  /**
   * Ensure the symlink exists and points to the correct script.
   * Creates the ~/.devark directory if needed.
   * On Windows, falls back to copying if symlink creation fails.
   * @returns The symlink path
   * @throws If the script doesn't exist
   */
  async ensureSymlink(): Promise<string> {
    // Verify the script exists
    const scriptExists = await this.fs.exists(this.scriptPath);
    if (!scriptExists) {
      throw new Error(`Script not found: ${this.scriptPath}`);
    }

    // Ensure directory exists
    const dirExists = await this.fs.exists(this.symlinkDir);
    if (!dirExists) {
      await this.fs.mkdir(this.symlinkDir);
    }

    // Remove existing file/symlink if present
    const exists = await this.fs.exists(this.symlinkPath);
    if (exists) {
      await this.fs.unlink(this.symlinkPath);
    }

    // Try to create symlink first
    try {
      await this.fs.symlink(this.scriptPath, this.symlinkPath);
      this.usedCopyFallback = false;
      console.log('[SymlinkManager] Created symlink successfully');
    } catch (symlinkError) {
      // Symlink failed (common on Windows without Developer Mode)
      // Fall back to copying the file
      console.log('[SymlinkManager] Symlink failed, falling back to file copy:', symlinkError);
      try {
        await this.fs.copyFile(this.scriptPath, this.symlinkPath);
        this.usedCopyFallback = true;
        console.log('[SymlinkManager] Copied script successfully');
      } catch (copyError) {
        throw new Error(`Failed to create symlink or copy script: ${copyError}`);
      }
    }

    // Ensure script is executable (both source and target)
    try {
      await this.fs.chmod(this.scriptPath, 0o755);
      await this.fs.chmod(this.symlinkPath, 0o755);
    } catch {
      // chmod may fail on Windows, that's OK
    }

    return this.symlinkPath;
  }

  /**
   * Check if we're using a copy instead of a symlink
   */
  isUsingCopyFallback(): boolean {
    return this.usedCopyFallback;
  }

  /**
   * Check if the symlink/copy exists and is valid
   */
  async isSymlinkValid(): Promise<boolean> {
    try {
      // Check if the file exists at the symlink path
      const exists = await this.fs.exists(this.symlinkPath);
      if (!exists) {
        return false;
      }

      // Check if it's a symlink
      const isLink = await this.fs.isSymlink(this.symlinkPath);

      if (isLink) {
        // For symlinks, verify it points to the correct target
        const target = await this.fs.readlink(this.symlinkPath);
        if (target !== this.scriptPath) {
          return false;
        }
      }
      // For copies, we just need to verify the file exists (already checked above)

      // Check if the source script still exists
      const targetExists = await this.fs.exists(this.scriptPath);
      return targetExists;
    } catch {
      return false;
    }
  }

  /**
   * Remove the symlink if it exists
   */
  async removeSymlink(): Promise<void> {
    try {
      const exists = await this.fs.exists(this.symlinkPath);
      if (exists) {
        await this.fs.unlink(this.symlinkPath);
      }
    } catch {
      // Ignore errors - symlink might not exist
    }
  }
}
