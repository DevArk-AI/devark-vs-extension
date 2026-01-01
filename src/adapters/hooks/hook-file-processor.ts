/**
 * Hook File Processor
 *
 * Consolidated hook file handling logic for:
 * - HookBasedPromptService (prompts + responses)
 * - ClaudeCodeAdapter (claude-prompt-*.json)
 * - CursorAdapter (prompt-*.json)
 */

import type { ISyncFileSystem } from '../../ports/readers/sync-file-system.interface';
import { safeJSONParse, hasRequiredFields } from '../../core/utils/safe-json';

export interface HookFileProcessorConfig {
  hookDir: string;
  filePrefix: string;
  fileSuffix: string;
  skipFiles: string[];
  additionalPrefixes?: string[];
  maxProcessedIds?: number;
  logContext: string;
}

export class HookFileProcessor<T = unknown> {
  private processedIds = new Set<string>();
  private readonly maxProcessedIds: number;

  constructor(
    private readonly fs: ISyncFileSystem,
    private readonly config: HookFileProcessorConfig
  ) {
    this.maxProcessedIds = config.maxProcessedIds ?? 200;
  }

  ensureHookDir(): void {
    if (!this.fs.existsSync(this.config.hookDir)) {
      this.fs.mkdirSync(this.config.hookDir);
      console.log(`[${this.config.logContext}] Created hook directory:`, this.config.hookDir);
    }
  }

  shouldSkip(filename: string): boolean {
    return this.config.skipFiles.includes(filename);
  }

  matchesPattern(filename: string): boolean {
    const prefixes = [this.config.filePrefix, ...(this.config.additionalPrefixes || [])];
    return prefixes.some(p => filename.startsWith(p)) && filename.endsWith(this.config.fileSuffix);
  }

  wasProcessed(identifier: string): boolean {
    return this.processedIds.has(identifier);
  }

  markProcessed(identifier: string): void {
    this.processedIds.add(identifier);
    if (this.processedIds.size > this.maxProcessedIds) {
      const idsArray = Array.from(this.processedIds);
      this.processedIds = new Set(idsArray.slice(-this.maxProcessedIds));
    }
  }

  readFile(filePath: string): string | null {
    try {
      return this.fs.readFileSync(filePath);
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return null;
      }
      console.error(`[${this.config.logContext}] Error reading file:`, error);
      return null;
    }
  }

  parseData(content: string, filename: string, requiredFields: string[]): T | null {
    const parseResult = safeJSONParse<T>(content, {
      attemptRecovery: true,
      logErrors: true,
      context: `${this.config.logContext}:${filename}`,
      validate: (data) => hasRequiredFields(data, requiredFields),
    });

    if (!parseResult.success || !parseResult.data) {
      console.error(
        `[${this.config.logContext}] Failed to parse:`,
        parseResult.error?.message || 'Unknown error'
      );
      return null;
    }

    return parseResult.data;
  }

  deleteFile(filePath: string): void {
    try {
      this.fs.unlinkSync(filePath);
    } catch {
      // Ignore - file may already be deleted
    }
  }

  listMatchingFiles(): string[] {
    if (!this.fs.existsSync(this.config.hookDir)) {
      return [];
    }
    try {
      const entries = this.fs.readdirSync(this.config.hookDir);
      return entries
        .filter((e) => e.isFile && this.matchesPattern(e.name))
        .map((e) => e.path);
    } catch {
      return [];
    }
  }

  getBasename(filePath: string): string {
    return this.fs.basename(filePath);
  }

  clearProcessedIds(): void {
    this.processedIds.clear();
  }

  getProcessedCount(): number {
    return this.processedIds.size;
  }
}
