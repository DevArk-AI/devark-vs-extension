/**
 * Hook Adapters
 *
 * Hook installers and settings writers for Claude Code and Cursor.
 */

// Hook installers (implement IHookInstaller)
export { ClaudeHookInstaller } from './claude-hook-installer';
export { CursorHookInstaller } from './cursor-hook-installer';

// Settings writers (low-level)
export { JsonSettingsWriter } from './json-settings-writer';
export { ClaudeSettingsWriter } from './claude-settings-writer';
export { CursorSettingsWriter } from './cursor-settings-writer';
export type {
  CursorHookType,
  CursorHookCommand,
  CursorHooksConfig,
} from './cursor-settings-writer';

// Hook file processor
export { HookFileProcessor } from './hook-file-processor';
export type { HookFileProcessorConfig } from './hook-file-processor';
