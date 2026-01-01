/**
 * CLI Argument Parser for devark-sync script
 *
 * Parses command-line arguments passed by hooks.
 */

export type HookTrigger = 'sessionstart' | 'precompact' | 'sessionend' | 'stop';
export type SessionSource = 'claude' | 'cursor';

export interface SyncCliArgs {
  hookTrigger?: HookTrigger;
  source?: SessionSource;
  silent: boolean;
  debug: boolean;
  force: boolean;
  project?: string;
  test: boolean;
}

const VALID_HOOK_TRIGGERS: HookTrigger[] = ['sessionstart', 'precompact', 'sessionend', 'stop'];
const VALID_SOURCES: SessionSource[] = ['claude', 'cursor'];

export function parseArgs(args: string[]): SyncCliArgs {
  const result: SyncCliArgs = {
    silent: false,
    debug: false,
    force: false,
    test: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--hook-trigger=')) {
      const value = arg.slice('--hook-trigger='.length).toLowerCase() as HookTrigger;
      if (!VALID_HOOK_TRIGGERS.includes(value)) {
        throw new Error(`Invalid hook trigger: ${value}`);
      }
      result.hookTrigger = value;
    } else if (arg.startsWith('--source=')) {
      const value = arg.slice('--source='.length).toLowerCase() as SessionSource;
      if (!VALID_SOURCES.includes(value)) {
        throw new Error(`Invalid source: ${value}`);
      }
      result.source = value;
    } else if (arg === '--silent') {
      result.silent = true;
    } else if (arg === '--debug' || arg === '--verbose') {
      result.debug = true;
    } else if (arg === '--force') {
      result.force = true;
    } else if (arg.startsWith('--project=')) {
      result.project = arg.slice('--project='.length);
    } else if (arg === '--test') {
      result.test = true;
    }
  }

  return result;
}
