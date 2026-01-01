/**
 * Node.js Sync Filesystem Adapter
 *
 * Implements ISyncFileSystem using Node.js sync fs module.
 * Used by HookFileProcessor for hook file operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DirectoryEntry } from '../../ports/readers/file-system.interface';
import type { ISyncFileSystem } from '../../ports/readers/sync-file-system.interface';

export class NodeSyncFileSystem implements ISyncFileSystem {
  existsSync(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  mkdirSync(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  readFileSync(filePath: string): string {
    return fs.readFileSync(filePath, 'utf8');
  }

  unlinkSync(filePath: string): void {
    fs.unlinkSync(filePath);
  }

  readdirSync(dirPath: string): DirectoryEntry[] {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
    }));
  }

  basename(filePath: string): string {
    return path.basename(filePath);
  }

  join(...segments: string[]): string {
    return path.join(...segments);
  }
}
