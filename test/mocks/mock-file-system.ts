/**
 * Mock File System
 *
 * In-memory file system for testing without touching real files.
 */

import type {
  IFileSystem,
  FileStats,
  DirectoryEntry,
} from '../../src/ports/readers/file-system.interface';

export class MockFileSystem implements IFileSystem {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();
  private stats: Map<string, FileStats> = new Map();
  private symlinks: Map<string, string> = new Map();
  private permissions: Map<string, number> = new Map();

  constructor() {
    // Initialize with root and home directory
    this.directories.add('/');
    this.directories.add('/home');
    this.directories.add('/home/user');
  }

  // === Setup Methods (for tests) ===

  /**
   * Add a file to the mock filesystem
   */
  addFile(path: string, content: string, mtime?: Date): void {
    this.files.set(path, content);
    this.stats.set(path, {
      isFile: true,
      isDirectory: false,
      size: content.length,
      mtime: mtime ?? new Date(),
      ctime: new Date(),
    });
    // Ensure parent directories exist
    this.ensureParentDirs(path);
  }

  /**
   * Add a directory to the mock filesystem
   */
  addDirectory(path: string): void {
    this.directories.add(path);
    this.stats.set(path, {
      isFile: false,
      isDirectory: true,
      size: 0,
      mtime: new Date(),
      ctime: new Date(),
    });
    this.ensureParentDirs(path);
  }

  /**
   * Add a symlink to the mock filesystem
   */
  addSymlink(path: string, target: string): void {
    this.symlinks.set(path, target);
    this.stats.set(path, {
      isFile: false,
      isDirectory: false,
      size: 0,
      mtime: new Date(),
      ctime: new Date(),
    });
    this.ensureParentDirs(path);
  }

  /**
   * Clear all files and directories
   */
  clear(): void {
    this.files.clear();
    this.directories.clear();
    this.stats.clear();
    this.symlinks.clear();
    this.directories.add('/');
    this.directories.add('/home');
    this.directories.add('/home/user');
  }

  /**
   * Get all files (for assertions)
   */
  getFiles(): Map<string, string> {
    return new Map(this.files);
  }

  /**
   * Get all directories (for assertions)
   */
  getDirectories(): Set<string> {
    return new Set(this.directories);
  }

  private ensureParentDirs(path: string): void {
    const parts = path.split('/').filter(Boolean);
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
      current += '/' + parts[i];
      this.directories.add(current);
    }
  }

  // === IFileSystem Implementation ===

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return content;
  }

  async readFileHead(path: string, bytes: number): Promise<Buffer> {
    const content = await this.readFile(path);
    return Buffer.from(content.slice(0, bytes));
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.addFile(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.directories.has(path) || this.symlinks.has(path);
  }

  async stat(path: string): Promise<FileStats> {
    const stats = this.stats.get(path);
    if (!stats) {
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
    }
    return stats;
  }

  async readdir(path: string): Promise<DirectoryEntry[]> {
    if (!this.directories.has(path)) {
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    }

    const entries: DirectoryEntry[] = [];
    const prefix = path.endsWith('/') ? path : path + '/';

    // Find files in this directory
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix)) {
        const relativePath = filePath.slice(prefix.length);
        if (!relativePath.includes('/')) {
          entries.push({
            name: relativePath,
            path: filePath,
            isFile: true,
            isDirectory: false,
          });
        }
      }
    }

    // Find subdirectories
    for (const dirPath of this.directories) {
      if (dirPath.startsWith(prefix) && dirPath !== path) {
        const relativePath = dirPath.slice(prefix.length);
        if (!relativePath.includes('/')) {
          entries.push({
            name: relativePath,
            path: dirPath,
            isFile: false,
            isDirectory: true,
          });
        }
      }
    }

    return entries;
  }

  async mkdir(path: string): Promise<void> {
    this.addDirectory(path);
  }

  async unlink(path: string): Promise<void> {
    if (this.symlinks.has(path)) {
      this.symlinks.delete(path);
      this.stats.delete(path);
      return;
    }
    if (!this.files.has(path)) {
      throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
    }
    this.files.delete(path);
    this.stats.delete(path);
  }

  homedir(): string {
    return '/home/user';
  }

  join(...segments: string[]): string {
    return segments
      .join('/')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '') || '/';
  }

  dirname(filePath: string): string {
    const parts = filePath.split('/');
    parts.pop();
    return parts.join('/') || '/';
  }

  basename(filePath: string): string {
    const parts = filePath.split('/');
    return parts[parts.length - 1] || '';
  }

  async symlink(target: string, path: string): Promise<void> {
    this.addSymlink(path, target);
  }

  async readlink(path: string): Promise<string> {
    const target = this.symlinks.get(path);
    if (target === undefined) {
      throw new Error(`EINVAL: invalid argument, readlink '${path}'`);
    }
    return target;
  }

  async isSymlink(path: string): Promise<boolean> {
    return this.symlinks.has(path);
  }

  async chmod(path: string, mode: number): Promise<void> {
    this.permissions.set(path, mode);
  }

  getPermissions(path: string): number | undefined {
    return this.permissions.get(path);
  }
}
