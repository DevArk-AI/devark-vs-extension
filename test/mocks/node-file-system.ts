/**
 * Node.js File System Implementation
 *
 * Real file system implementation for functional/integration tests
 * that need to access actual files on disk.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { IFileSystem, FileStats, DirectoryEntry } from '../../src/ports/readers/file-system.interface';

export class NodeFileSystem implements IFileSystem {
  async readFile(filePath: string): Promise<string> {
    return fs.promises.readFile(filePath, 'utf-8');
  }

  async readFileHead(filePath: string, bytes: number): Promise<Buffer> {
    const fd = await fs.promises.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(bytes);
      const { bytesRead } = await fd.read(buffer, 0, bytes, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await fd.close();
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.promises.writeFile(filePath, content, 'utf-8');
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async stat(filePath: string): Promise<FileStats> {
    const stats = await fs.promises.stat(filePath);
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtime,
      ctime: stats.ctime,
    };
  }

  async readdir(dirPath: string): Promise<DirectoryEntry[]> {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
    }));
  }

  async mkdir(dirPath: string): Promise<void> {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }

  async unlink(filePath: string): Promise<void> {
    await fs.promises.unlink(filePath);
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
    await fs.promises.symlink(target, linkPath);
  }

  async readlink(linkPath: string): Promise<string> {
    return fs.promises.readlink(linkPath);
  }

  async isSymlink(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.lstat(filePath);
      return stats.isSymbolicLink();
    } catch {
      return false;
    }
  }

  async chmod(filePath: string, mode: number): Promise<void> {
    await fs.promises.chmod(filePath, mode);
  }

  async copyFile(src: string, dest: string): Promise<void> {
    await fs.promises.copyFile(src, dest);
  }
}
