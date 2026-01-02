/**
 * Claude Hook Installer
 *
 * Implements IHookInstaller for Claude Code.
 * Manages hooks in ~/.claude/settings.json
 */

import type { ClaudeSettingsWriter } from './claude-settings-writer';
import type {
  IHookInstaller,
  HookConfig,
  HookType,
  HookStatus,
  HooksStatus,
  HookInstallResult,
  HookStats,
} from '../../ports/hooks/hook-installer.interface';

interface ClaudeHookCommand {
  type: 'command';
  command: string;
  timeout?: number;
}

interface ClaudeHookConfig {
  matcher: string;
  hooks: ClaudeHookCommand[];
}

interface ClaudeUserPromptSubmitConfig {
  hooks: ClaudeHookCommand[];
}

const VALID_CLAUDE_HOOKS: HookType[] = ['SessionStart', 'PreCompact', 'SessionEnd', 'UserPromptSubmit', 'Stop'];

/**
 * Identifiers we consider "ours" inside Claude hook command strings.
 *
 * IMPORTANT:
 * - The current Claude hook installer uses `node ".../dist/claude-hooks/*.js"` which does NOT include "devark-sync".
 * - Older installs may have used the devark-sync symlink path.
 * So we match both families to keep installs idempotent and to clean up duplicates.
 */
const DEVARK_COMMAND_MARKERS = [
  'devark-sync',
  'devark-sync.js',
  'claude-hooks/user-prompt-submit.js',
  'claude-hooks/stop.js',
  'bin/devark-sync.js',
] as const;

export class ClaudeHookInstaller implements IHookInstaller {
  private currentConfig: Partial<HookConfig> = {};
  private disabledHooks: Set<HookType> = new Set();

  constructor(
    private readonly writer: ClaudeSettingsWriter,
    private readonly syncScriptPath: string,
    private readonly promptHookPath?: string,
    private readonly stopHookPath?: string
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
      if (!this.isValidHook(hookType)) {
        result.errors.push({
          hook: hookType,
          error: `Invalid hook type for Claude: ${hookType}`,
          recoverable: false,
        });
        result.success = false;
        continue;
      }

      try {
        await this.installHook(hookType, config);
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
      const settings = await this.writer.readGlobalSettings();

      if (settings.hooks && typeof settings.hooks === 'object') {
        const hooks = settings.hooks as Record<string, unknown>;

        for (const hookType of VALID_CLAUDE_HOOKS) {
          if (hooks[hookType]) {
            const filtered = this.filterDevArkHooks(hooks[hookType] as ClaudeHookConfig[]);
            if (filtered.length > 0) {
              hooks[hookType] = filtered;
            } else {
              delete hooks[hookType];
            }
          }
        }

        if (Object.keys(hooks).length === 0) {
          delete settings.hooks;
        }

        await this.writer.writeGlobalSettings(settings);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    this.currentConfig = {};
    this.disabledHooks.clear();

    return { success: errors.length === 0, errors };
  }

  async uninstallHook(hook: HookType): Promise<{ success: boolean; error?: string }> {
    const isInstalled = await this.isHookInstalled(hook);

    if (!isInstalled) {
      return { success: false, error: `Hook ${hook} is not installed` };
    }

    try {
      const settings = await this.writer.readGlobalSettings();

      if (settings.hooks && typeof settings.hooks === 'object') {
        const hooks = settings.hooks as Record<string, unknown>;

        if (hooks[hook]) {
          const filtered = this.filterDevArkHooks(hooks[hook] as ClaudeHookConfig[]);
          if (filtered.length > 0) {
            hooks[hook] = filtered;
          } else {
            delete hooks[hook];
          }
        }

        if (Object.keys(hooks).length === 0) {
          delete settings.hooks;
        }

        await this.writer.writeGlobalSettings(settings);
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
      const settings = await this.writer.readGlobalSettings();

      if (settings.hooks && typeof settings.hooks === 'object') {
        const settingsHooks = settings.hooks as Record<string, unknown>;

        for (const hookType of VALID_CLAUDE_HOOKS) {
          if (settingsHooks[hookType]) {
            const hookConfigs = settingsHooks[hookType] as ClaudeHookConfig[];
            const hasVibeLog = hookConfigs.some(config =>
              config.hooks?.some(h => this.isDevArkCommand(h.command))
            );

            if (hasVibeLog) {
              hasGlobalSettings = true;
              hooks.push({
                type: hookType,
                installed: true,
                enabled: !this.disabledHooks.has(hookType),
              });
            }
          }
        }
      }
    } catch {
      // Settings file doesn't exist or is invalid
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

  private isValidHook(hookType: HookType): boolean {
    return VALID_CLAUDE_HOOKS.includes(hookType);
  }

  private async installHook(hookType: HookType, config: HookConfig): Promise<void> {
    const settings = await this.writer.readGlobalSettings();

    if (!settings.hooks) {
      settings.hooks = {};
    }

    if (hookType === 'UserPromptSubmit') {
      const command = this.buildPromptHookCommand(config);
      const hookConfig: ClaudeUserPromptSubmitConfig = {
        hooks: [{
          type: 'command',
          command,
          ...(config.timeout ? { timeout: config.timeout } : {}),
        }],
      };

      const hooks = settings.hooks as Record<string, ClaudeUserPromptSubmitConfig[]>;

      if (hooks[hookType]) {
        hooks[hookType] = this.filterVibeLogUserPromptHooks(hooks[hookType]);
      }

      if (!hooks[hookType]) {
        hooks[hookType] = [];
      }
      hooks[hookType].push(hookConfig);
    } else if (hookType === 'Stop') {
      const command = this.buildStopHookCommand(config);
      const hookConfig: ClaudeHookConfig = {
        matcher: '*',
        hooks: [{
          type: 'command',
          command,
          ...(config.timeout ? { timeout: config.timeout } : {}),
        }],
      };

      const hooks = settings.hooks as Record<string, ClaudeHookConfig[]>;

      if (hooks[hookType]) {
        hooks[hookType] = this.filterDevArkHooks(hooks[hookType]);
      }

      if (!hooks[hookType]) {
        hooks[hookType] = [];
      }
      hooks[hookType].push(hookConfig);
    } else {
      const command = this.buildCommand(hookType, config);
      const hookConfig: ClaudeHookConfig = {
        matcher: '*',
        hooks: [{
          type: 'command',
          command,
          ...(config.timeout ? { timeout: config.timeout } : {}),
        }],
      };

      const hooks = settings.hooks as Record<string, ClaudeHookConfig[]>;

      if (hooks[hookType]) {
        hooks[hookType] = this.filterDevArkHooks(hooks[hookType]);
      }

      if (!hooks[hookType]) {
        hooks[hookType] = [];
      }
      hooks[hookType].push(hookConfig);
    }

    await this.writer.writeGlobalSettings(settings);
  }

  private buildCommand(hookType: HookType, config: HookConfig): string {
    const parts = [`node "${this.syncScriptPath}"`];
    parts.push(`--hook-trigger=${hookType.toLowerCase()}`);
    parts.push('--source=claude');
    parts.push('--silent');

    if (config.debug) {
      parts.push('--debug');
    }

    return parts.join(' ');
  }

  private buildPromptHookCommand(config: HookConfig): string {
    const scriptPath = this.promptHookPath || this.syncScriptPath;
    const parts = [`node "${scriptPath}"`];

    if (config.debug) {
      parts.push('--debug');
    }

    return parts.join(' ');
  }

  private buildStopHookCommand(config: HookConfig): string {
    const scriptPath = this.stopHookPath || this.syncScriptPath;
    const parts = [`node "${scriptPath}"`];

    if (config.debug) {
      parts.push('--debug');
    }

    return parts.join(' ');
  }

  private isDevArkCommand(command: string): boolean {
    const normalized = command.toLowerCase().replace(/\\/g, '/');
    return DEVARK_COMMAND_MARKERS.some((m) => normalized.includes(m));
  }

  private filterDevArkHooks(hookConfigs: ClaudeHookConfig[]): ClaudeHookConfig[] {
    return hookConfigs
      .map(config => ({
        ...config,
        hooks: config.hooks.filter(hook => !this.isDevArkCommand(hook.command)),
      }))
      .filter(config => config.hooks.length > 0);
  }

  private filterVibeLogUserPromptHooks(hookConfigs: ClaudeUserPromptSubmitConfig[]): ClaudeUserPromptSubmitConfig[] {
    return hookConfigs
      .map(config => ({
        ...config,
        hooks: config.hooks.filter(hook => !this.isDevArkCommand(hook.command)),
      }))
      .filter(config => config.hooks.length > 0);
  }
}
