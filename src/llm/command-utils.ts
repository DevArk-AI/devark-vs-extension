/**
 * Command Utility Functions
 *
 * Utilities for checking if commands are available in the system PATH.
 * Works on both Windows and Unix-like systems (Mac/Linux).
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if a command is available in the system PATH
 *
 * @param command - The command name to check (e.g., 'claude', 'cursor', 'ollama')
 * @returns Promise that resolves to true if command is available, false otherwise
 */
export async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // On Windows, use 'where' command
      // where returns exit code 0 if command is found, 1 if not found
      const { stdout } = await execAsync(`where ${command}`, {
        timeout: 5000,
        windowsHide: true,
      });

      // Check if stdout has a valid path (not empty)
      return stdout.trim().length > 0;
    } else {
      // On Unix-like systems (Mac, Linux), use 'which' command
      // which returns exit code 0 if command is found, 1 if not found
      const { stdout } = await execAsync(`which ${command}`, {
        timeout: 5000,
      });

      // Check if stdout has a valid path (not empty)
      return stdout.trim().length > 0;
    }
  } catch {
    // Command not found or error executing the check
    return false;
  }
}

/**
 * Get the full path to a command if it exists in PATH
 *
 * @param command - The command name to locate
 * @returns Promise that resolves to the full path if found, null otherwise
 */
export async function getCommandPath(command: string): Promise<string | null> {
  try {
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      const { stdout } = await execAsync(`where ${command}`, {
        timeout: 5000,
        windowsHide: true,
      });

      // where can return multiple paths, take the first one
      const paths = stdout.trim().split('\n');
      return paths[0] || null;
    } else {
      const { stdout } = await execAsync(`which ${command}`, {
        timeout: 5000,
      });

      return stdout.trim() || null;
    }
  } catch (error) {
    return null;
  }
}

/**
 * Check if multiple commands are available
 *
 * @param commands - Array of command names to check
 * @returns Promise that resolves to object mapping command names to availability
 */
export async function checkMultipleCommands(
  commands: string[]
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  await Promise.all(
    commands.map(async (cmd) => {
      results[cmd] = await isCommandAvailable(cmd);
    })
  );

  return results;
}
