/**
 * Sync File System Interface
 *
 * Synchronous file operations for hook file processing.
 * Used by HookFileProcessor for reading/writing hook temp files.
 */

import type { DirectoryEntry } from './file-system.interface';

export interface ISyncFileSystem {
  existsSync(path: string): boolean;
  mkdirSync(path: string): void;
  readFileSync(path: string): string;
  unlinkSync(path: string): void;
  readdirSync(path: string): DirectoryEntry[];
  basename(path: string): string;
  join(...segments: string[]): string;
}
