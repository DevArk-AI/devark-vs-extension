/**
 * Node.js Filesystem Adapter
 *
 * Implements IFileSystem using Node.js fs/promises module.
 * This is the production implementation for actual file operations.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type {
  IFileSystem,
  FileStats,
  DirectoryEntry,
} from '../../ports/readers/file-system.interface';

export class NodeFileSystem implements IFileSystem {
  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async readFileHead(filePath: string, bytes: number): Promise<Buffer> {
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
      return buffer.slice(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async stat(filePath: string): Promise<FileStats> {
    const stats = await fs.stat(filePath);
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtime,
      ctime: stats.ctime,
    };
  }

  async readdir(dirPath: string): Promise<DirectoryEntry[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
    }));
  }

  async mkdir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  async unlink(filePath: string): Promise<void> {
    await fs.unlink(filePath);
  }

  homedir(): string {
    return os.homedir();
  }

  join(...segments: string[]): string {
    return path.join(...segments);
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  basename(filePath: string): string {
    return path.basename(filePath);
  }

  async symlink(target: string, linkPath: string): Promise<void> {
    await fs.symlink(target, linkPath);
  }

  async readlink(linkPath: string): Promise<string> {
    return fs.readlink(linkPath);
  }

  async isSymlink(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.lstat(filePath);
      return stats.isSymbolicLink();
    } catch {
      return false;
    }
  }

  async chmod(filePath: string, mode: number): Promise<void> {
    await fs.chmod(filePath, mode);
  }

  async copyFile(src: string, dest: string): Promise<void> {
    await fs.copyFile(src, dest);
  }
}
