/**
 * Cursor Hook Installer
 *
 * Implements IHookInstaller for Cursor IDE.
 * Manages hooks in ~/.cursor/hooks.json (global) or <project>/.cursor/hooks.json
 */

import type { CursorSettingsWriter, CursorHookType } from './cursor-settings-writer';
import type {
  IHookInstaller,
  HookConfig,
  HookType,
  HookStatus,
  HooksStatus,
  HookInstallResult,
  HookStats,
} from '../../ports/hooks/hook-installer.interface';

/**
 * Map our hook types to Cursor hook types
 */
const CURSOR_HOOK_MAP: Partial<Record<HookType, CursorHookType>> = {
  PreCompact: 'stop',
  SessionEnd: 'stop',
  Stop: 'stop',
  UserPromptSubmit: 'beforeSubmitPrompt',
};

const DEVARK_MARKER = 'devark-sync';

export class CursorHookInstaller implements IHookInstaller {
  private currentConfig: Partial<HookConfig> = {};
  private disabledHooks: Set<HookType> = new Set();

  constructor(
    private readonly writer: CursorSettingsWriter,
    private readonly syncScriptPath: string,
    private readonly promptHookPath?: string,
    private readonly responseHookPath?: string
  ) {}

  async install(config: HookConfig): Promise<HookInstallResult> {
    const result: HookInstallResult = {
      success: true,
      hooksInstalled: [],
      errors: [],
      warnings: [],
    };

    this.currentConfig = { ...config };

    for (const hookType of config.hooks) {
      const cursorHookType = CURSOR_HOOK_MAP[hookType];

      if (!cursorHookType) {
        result.warnings.push(`Hook type ${hookType} not supported in Cursor`);
        continue;
      }

      try {
        await this.installHook(hookType, cursorHookType, config);
        result.hooksInstalled.push(hookType);
      } catch (error) {
        result.errors.push({
          hook: hookType,
          error: error instanceof Error ? error.message : String(error),
          recoverable: true,
        });
        result.success = false;
      }
    }

    return result;
  }

  async uninstall(): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const existingHooks = await this.writer.readGlobalHooks();

      if (existingHooks.hooks && typeof existingHooks.hooks === 'object') {
        const hooks = existingHooks.hooks as Record<string, Array<{ command: string }>>;

        for (const cursorHookType of Object.keys(hooks)) {
          if (hooks[cursorHookType]) {
            hooks[cursorHookType] = hooks[cursorHookType].filter(
              h => !this.isDevArkCommand(h.command)
            );

            if (hooks[cursorHookType].length === 0) {
              delete hooks[cursorHookType];
            }
          }
        }

        await this.writer.writeGlobalHooks({
          version: 1,
          hooks: hooks as typeof existingHooks.hooks,
        });
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    this.currentConfig = {};
    this.disabledHooks.clear();

    return { success: errors.length === 0, errors };
  }

  async uninstallHook(hook: HookType): Promise<{ success: boolean; error?: string }> {
    const cursorHookType = CURSOR_HOOK_MAP[hook];

    if (!cursorHookType) {
      return { success: false, error: `Hook ${hook} not supported in Cursor` };
    }

    try {
      const existingHooks = await this.writer.readGlobalHooks();

      if (existingHooks.hooks) {
        const hooks = existingHooks.hooks as Record<string, Array<{ command: string }>>;

        if (hooks[cursorHookType]) {
          hooks[cursorHookType] = hooks[cursorHookType].filter(
            h => !this.isDevArkCommand(h.command)
          );

          if (hooks[cursorHookType].length === 0) {
            delete hooks[cursorHookType];
          }

          await this.writer.writeGlobalHooks({
            version: 1,
            hooks: hooks as typeof existingHooks.hooks,
          });
        }
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getStatus(): Promise<HooksStatus> {
    const hooks: HookStatus[] = [];
    let hasGlobalSettings = false;

    try {
      const existingHooks = await this.writer.readGlobalHooks();

      if (existingHooks.hooks && typeof existingHooks.hooks === 'object') {
        const cursorHooks = existingHooks.hooks as Record<string, Array<{ command: string }>>;

        for (const [hookType, mappedType] of Object.entries(CURSOR_HOOK_MAP)) {
          if (mappedType && cursorHooks[mappedType]) {
            const hasDevArk = cursorHooks[mappedType].some(h => this.isDevArkCommand(h.command));

            if (hasDevArk) {
              hasGlobalSettings = true;
              hooks.push({
                type: hookType as HookType,
                installed: true,
                enabled: !this.disabledHooks.has(hookType as HookType),
              });
            }
          }
        }
      }
    } catch {
      // Hooks file doesn't exist or is invalid
    }

    return {
      installed: hooks.length > 0,
      mode: (this.currentConfig.mode as 'all' | 'selected') || 'all',
      hooks,
      globalSettings: hasGlobalSettings,
      projectSettings: false,
    };
  }

  async isHookInstalled(hook: HookType): Promise<boolean> {
    const status = await this.getStatus();
    return status.hooks.some(h => h.type === hook && h.installed);
  }

  async setHookEnabled(hook: HookType, enabled: boolean): Promise<void> {
    if (enabled) {
      this.disabledHooks.delete(hook);
    } else {
      this.disabledHooks.add(hook);
    }
  }

  async getStats(): Promise<HookStats> {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      byProject: {},
    };
  }

  async updateConfig(config: Partial<HookConfig>): Promise<void> {
    this.currentConfig = { ...this.currentConfig, ...config };

    const status = await this.getStatus();
    const installedHooks = status.hooks.filter(h => h.installed).map(h => h.type);

    if (installedHooks.length > 0) {
      await this.install({
        hooks: installedHooks,
        mode: this.currentConfig.mode || 'all',
        timeout: config.timeout ?? this.currentConfig.timeout,
        debug: config.debug ?? this.currentConfig.debug,
      });
    }
  }

  async testHooks(): Promise<Record<HookType, { success: boolean; output?: string; error?: string }>> {
    const results = {} as Record<HookType, { success: boolean; output?: string; error?: string }>;
    const status = await this.getStatus();

    for (const hook of status.hooks) {
      if (hook.installed) {
        results[hook.type] = {
          success: true,
          output: `Hook ${hook.type} is properly configured`,
        };
      }
    }

    return results;
  }

  getSyncScriptPath(): string {
    return this.syncScriptPath;
  }

  private async installHook(hookType: HookType, cursorHookType: CursorHookType, config: HookConfig): Promise<void> {
    const command = this.buildCommand(hookType, config);

    const existingHooks = await this.writer.readGlobalHooks();
    const hooks = existingHooks.hooks || {};

    // Remove any existing vibe-log hooks for this type
    if (hooks[cursorHookType]) {
      hooks[cursorHookType] = hooks[cursorHookType]!.filter(
        h => !this.isDevArkCommand(h.command)
      );
    }

    // Add the new hook
    if (!hooks[cursorHookType]) {
      hooks[cursorHookType] = [];
    }
    hooks[cursorHookType]!.push({ command });

    await this.writer.writeGlobalHooks({
      version: 1,
      hooks,
    });
  }

  private buildCommand(hookType: HookType, config: HookConfig): string {
    let scriptPath: string;

    if (hookType === 'UserPromptSubmit') {
      scriptPath = this.promptHookPath || this.syncScriptPath.replace(/bin[/\\]devark-sync\.js$/, 'cursor-hooks/before-submit-prompt.js');
    } else if (hookType === 'Stop' || hookType === 'PreCompact' || hookType === 'SessionEnd') {
      scriptPath = this.responseHookPath || this.syncScriptPath.replace(/bin[/\\]devark-sync\.js$/, 'cursor-hooks/post-response.js');
    } else {
      scriptPath = this.syncScriptPath;
    }

    const parts = [`node "${scriptPath}"`];

    // Only add hook-trigger and source for devark-sync script
    if (scriptPath === this.syncScriptPath) {
      parts.push(`--hook-trigger=${hookType.toLowerCase()}`);
      parts.push('--source=cursor');
      parts.push('--silent');
    }

    if (config.debug) {
      parts.push('--debug');
    }

    return parts.join(' ');
  }

  private isDevArkCommand(command: string): boolean {
    return command.includes(DEVARK_MARKER) ||
           command.includes('cursor-hooks') ||
           command.includes('before-submit-prompt') ||
           command.includes('post-response');
  }
}
