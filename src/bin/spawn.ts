/**
 * Spawn utilities for background process execution
 *
 * Pattern copied from vibe-log-cli/src/utils/spawn.ts
 */

import { spawn, SpawnOptions } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

const VIBE_LOG_DIR = path.join(os.homedir(), '.devark');
const LOCK_FILE = path.join(VIBE_LOG_DIR, 'upload.lock');
const LOG_FILE = path.join(VIBE_LOG_DIR, 'upload.log');
const LOCK_STALE_MS = 5 * 60 * 1000; // 5 minutes

async function ensureVibeLogDir(): Promise<void> {
  await fs.mkdir(VIBE_LOG_DIR, { recursive: true });
}

/**
 * Spawn a detached process that runs in the background
 */
export async function spawnDetached(
  command: string,
  args: string[]
): Promise<void> {
  await ensureVibeLogDir();

  const spawnOptions: SpawnOptions = {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    env: { ...process.env, VIBE_LOG_OUTPUT: LOG_FILE },
  };

  // Windows-specific detachment
  if (process.platform === 'win32') {
    spawnOptions.shell = true;
    spawnOptions.windowsHide = true;
  }

  const child = spawn(command, args, spawnOptions);
  child.unref();
}

/**
 * Check if a sync process is already running
 */
export async function isUploadRunning(): Promise<boolean> {
  try {
    const stats = await fs.stat(LOCK_FILE);
    const lockAge = Date.now() - stats.mtimeMs;

    // Stale lock - clean up
    if (lockAge > LOCK_STALE_MS) {
      await fs.unlink(LOCK_FILE).catch(() => {});
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Create lock file for sync process
 */
export async function createUploadLock(): Promise<void> {
  await ensureVibeLogDir();
  await fs.writeFile(LOCK_FILE, process.pid.toString());
}

/**
 * Remove lock file
 */
export async function removeUploadLock(): Promise<void> {
  await fs.unlink(LOCK_FILE).catch(() => {});
}
