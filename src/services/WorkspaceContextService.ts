/**
 * WorkspaceContextService - 3-Tier Context Gathering
 *
 * Provides workspace-level context that is NOT dependent on prompt text.
 * This supplements the existing prompt-based context extraction.
 *
 * Tiers:
 * - Tier 1: Project CLAUDE.md (tech stack, project summary)
 * - Tier 2: package.json dependencies (tech stack mapping)
 * - Tier 3: Open editor context (relevance-gated)
 *
 * Design:
 * - Singleton pattern (consistent with other services)
 * - Cached with FileSystemWatcher invalidation
 * - Performance budget: <100ms first call, <20ms cached
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getContextExtractor } from './ContextExtractor';

/**
 * Maximum length for project summary extraction
 */
const MAX_SUMMARY_LENGTH = 200;

/**
 * Relevant snippet from open editor with confidence level
 */
export interface RelevantSnippet {
  entityName: string;
  filePath: string;
  relevantCode: string;
  /** high = matched prompt, low = fallback */
  confidence: 'high' | 'low';
  /** Relevance score (0-100) for ranking snippets */
  score?: number;
}

/**
 * Workspace context gathered from project files
 */
export interface WorkspaceContext {
  /** Tech stack from CLAUDE.md + package.json */
  techStack: string[];
  /** First paragraph/description from CLAUDE.md */
  projectSummary?: string;
  /** Relevant snippets from all open tabs (sorted by relevance score) */
  relevantSnippets: RelevantSnippet[];
}

/**
 * Cached workspace data with invalidation support
 */
interface CachedWorkspaceData {
  claudeMdContent?: string;
  claudeMdTechStack?: string[];
  projectSummary?: string;
  packageJsonTechStack?: string[];
  lastUpdated: number;
}

/**
 * Map common npm packages to their tech stack names
 */
const PACKAGE_TO_TECH: Record<string, string> = {
  // Frameworks
  'react': 'React',
  'react-dom': 'React',
  'vue': 'Vue',
  '@vue/': 'Vue',
  'next': 'Next.js',
  'nuxt': 'Nuxt',
  'express': 'Express',
  'fastify': 'Fastify',
  'koa': 'Koa',
  'hono': 'Hono',
  'svelte': 'Svelte',
  '@sveltejs/kit': 'SvelteKit',
  'angular': 'Angular',
  '@angular/core': 'Angular',

  // Languages/Typing
  'typescript': 'TypeScript',
  '@types/': 'TypeScript',

  // Styling
  'tailwindcss': 'Tailwind CSS',
  'styled-components': 'Styled Components',
  '@emotion/': 'Emotion',
  'sass': 'Sass',

  // State Management
  'redux': 'Redux',
  '@reduxjs/toolkit': 'Redux Toolkit',
  'zustand': 'Zustand',
  'mobx': 'MobX',
  'jotai': 'Jotai',
  'recoil': 'Recoil',

  // Databases/ORMs
  'drizzle-orm': 'Drizzle ORM',
  'prisma': 'Prisma',
  '@prisma/client': 'Prisma',
  'typeorm': 'TypeORM',
  'mongoose': 'MongoDB',
  'mongodb': 'MongoDB',
  'pg': 'PostgreSQL',
  'mysql2': 'MySQL',
  'better-sqlite3': 'SQLite',
  'sql.js': 'SQLite',

  // Testing
  'vitest': 'Vitest',
  'jest': 'Jest',
  '@testing-library/': 'Testing Library',
  'playwright': 'Playwright',
  '@playwright/test': 'Playwright',
  'cypress': 'Cypress',

  // Build Tools
  'esbuild': 'esbuild',
  'vite': 'Vite',
  'webpack': 'Webpack',
  'rollup': 'Rollup',
  'turbo': 'Turborepo',

  // Cloud/Deployment
  'wrangler': 'Cloudflare Workers',
  '@cloudflare/': 'Cloudflare',
  'aws-sdk': 'AWS',
  '@aws-sdk/': 'AWS',
  'firebase': 'Firebase',
  'supabase': 'Supabase',
  '@supabase/': 'Supabase',

  // API/Data Fetching
  'graphql': 'GraphQL',
  '@apollo/client': 'Apollo GraphQL',
  'trpc': 'tRPC',
  '@trpc/': 'tRPC',
  'axios': 'Axios',
  'swr': 'SWR',
  '@tanstack/react-query': 'React Query',

  // VS Code Extension
  '@types/vscode': 'VS Code Extension',
  'vscode': 'VS Code Extension',
};

/**
 * WorkspaceContextService - Singleton for workspace context
 */
export class WorkspaceContextService {
  private static instance: WorkspaceContextService | null = null;

  private cache: CachedWorkspaceData | null = null;
  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private readonly CACHE_TTL_MS = 60000; // 1 minute
  private debug = false;

  private constructor() {
    this.setupFileWatcher();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): WorkspaceContextService {
    if (!WorkspaceContextService.instance) {
      WorkspaceContextService.instance = new WorkspaceContextService();
    }
    return WorkspaceContextService.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  public static reset(): void {
    if (WorkspaceContextService.instance) {
      WorkspaceContextService.instance.dispose();
      WorkspaceContextService.instance = null;
    }
  }

  /**
   * Enable or disable debug logging
   */
  public setDebug(enabled: boolean): void {
    this.debug = enabled;
  }

  /**
   * Setup file watcher to invalidate cache on CLAUDE.md or package.json changes
   */
  private setupFileWatcher(): void {
    try {
      // Watch for CLAUDE.md and package.json changes
      this.fileWatcher = vscode.workspace.createFileSystemWatcher(
        '**/{CLAUDE.md,package.json}',
        false, // create
        false, // change
        false  // delete
      );

      const invalidateCache = () => {
        if (this.debug) {
          console.log('[WorkspaceContext] Cache invalidated due to file change');
        }
        this.cache = null;
      };

      this.fileWatcher.onDidCreate(invalidateCache);
      this.fileWatcher.onDidChange(invalidateCache);
      this.fileWatcher.onDidDelete(invalidateCache);
    } catch (error) {
      console.warn('[WorkspaceContext] Failed to setup file watcher:', error);
    }
  }

  /**
   * Get workspace context, merging with prompt for relevance checking
   *
   * @param promptText - Current prompt for relevance gating (Tier 3)
   * @returns WorkspaceContext with tech stack, summary, and relevant snippets from all open tabs
   */
  public async getContext(promptText: string): Promise<WorkspaceContext> {
    const startTime = Date.now();

    // Check cache validity for workspace data only
    if (!this.cache || Date.now() - this.cache.lastUpdated >= this.CACHE_TTL_MS) {
      await this.loadWorkspaceData();
    }

    // Always scan open tabs (they change frequently, not cached)
    const relevantSnippets = await this.getRelevantOpenTabs(promptText);

    const result: WorkspaceContext = {
      techStack: this.getMergedTechStack(),
      projectSummary: this.cache?.projectSummary,
      relevantSnippets,
    };

    if (this.debug) {
      console.log(`[WorkspaceContext] Loaded in ${Date.now() - startTime}ms:`, {
        techStack: result.techStack.length,
        hasProjectSummary: !!result.projectSummary,
        snippetCount: relevantSnippets.length,
        snippetScores: relevantSnippets.map(s => `${s.entityName}:${s.score}`),
      });
    }

    return result;
  }

  /**
   * Load and cache workspace data from CLAUDE.md and package.json
   */
  private async loadWorkspaceData(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this.cache = { lastUpdated: Date.now() };
      return;
    }

    const [claudeMdResult, packageJsonResult] = await Promise.all([
      this.loadClaudeMd(workspaceFolder.uri),
      this.loadPackageJson(workspaceFolder.uri),
    ]);

    this.cache = {
      claudeMdContent: claudeMdResult.content,
      claudeMdTechStack: claudeMdResult.techStack,
      projectSummary: claudeMdResult.summary,
      packageJsonTechStack: packageJsonResult,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Load and parse CLAUDE.md for tech stack and project summary
   */
  private async loadClaudeMd(workspaceUri: vscode.Uri): Promise<{
    content?: string;
    techStack: string[];
    summary?: string;
  }> {
    try {
      const claudeMdPath = vscode.Uri.joinPath(workspaceUri, 'CLAUDE.md');
      const content = await vscode.workspace.fs.readFile(claudeMdPath);
      const text = new TextDecoder().decode(content);

      // Extract tech stack using existing patterns
      const contextExtractor = getContextExtractor();
      const techStack = contextExtractor.extractTechStack(text);

      // Extract project summary (first paragraph after # header)
      const summary = this.extractProjectSummary(text);

      return { content: text, techStack, summary };
    } catch {
      // CLAUDE.md doesn't exist - not an error
      return { techStack: [] };
    }
  }

  /**
   * Extract project summary from CLAUDE.md
   * Looks for first paragraph after main header or ## Project Overview section
   */
  private extractProjectSummary(content: string): string | undefined {
    const lines = content.split('\n');

    // Strategy 1: Look for "## Project Overview" or similar
    const overviewPatterns = [
      /^##\s*project\s*overview/i,
      /^##\s*overview/i,
      /^##\s*about/i,
      /^##\s*description/i,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      for (const pattern of overviewPatterns) {
        if (pattern.test(line)) {
          // Found section header, extract next non-empty paragraph
          const paragraph = this.extractNextParagraph(lines, i + 1);
          if (paragraph) return paragraph;
        }
      }
    }

    // Strategy 2: Get first paragraph after main # header
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('# ') && !line.startsWith('##')) {
        const paragraph = this.extractNextParagraph(lines, i + 1);
        if (paragraph) return paragraph;
      }
    }

    return undefined;
  }

  /**
   * Extract next non-empty paragraph starting from lineIndex
   */
  private extractNextParagraph(lines: string[], startIndex: number): string | undefined {
    let paragraph = '';
    let foundContent = false;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines before content
      if (!foundContent && line === '') continue;

      // Stop at next header or empty line after content
      if (line.startsWith('#') || (foundContent && line === '')) break;

      // Skip list items and code blocks for summary
      if (line.startsWith('-') || line.startsWith('*') || line.startsWith('```')) break;

      foundContent = true;
      paragraph += (paragraph ? ' ' : '') + line;

      // Limit summary length
      if (paragraph.length > MAX_SUMMARY_LENGTH) {
        paragraph = paragraph.substring(0, MAX_SUMMARY_LENGTH - 3) + '...';
        break;
      }
    }

    return paragraph || undefined;
  }

  /**
   * Load and parse package.json for dependencies
   */
  private async loadPackageJson(workspaceUri: vscode.Uri): Promise<string[]> {
    try {
      const packageJsonPath = vscode.Uri.joinPath(workspaceUri, 'package.json');
      const content = await vscode.workspace.fs.readFile(packageJsonPath);
      const text = new TextDecoder().decode(content);
      const pkg = JSON.parse(text);

      return this.extractTechFromPackageJson(pkg);
    } catch {
      // package.json doesn't exist or parse error - not critical
      return [];
    }
  }

  /**
   * Map package.json dependencies to tech stack names
   */
  private extractTechFromPackageJson(pkg: Record<string, unknown>): string[] {
    const deps = {
      ...(pkg.dependencies as Record<string, string> || {}),
      ...(pkg.devDependencies as Record<string, string> || {}),
    };

    const detected = new Set<string>();

    for (const dep of Object.keys(deps)) {
      // Check exact matches first
      if (PACKAGE_TO_TECH[dep]) {
        detected.add(PACKAGE_TO_TECH[dep]);
        continue;
      }

      // Check prefix matches (e.g., @types/, @vue/)
      for (const [pattern, tech] of Object.entries(PACKAGE_TO_TECH)) {
        if (pattern.endsWith('/') && dep.startsWith(pattern)) {
          detected.add(tech);
          break;
        }
      }
    }

    return Array.from(detected);
  }

  /**
   * Get merged tech stack from all sources (deduplicated)
   */
  private getMergedTechStack(): string[] {
    if (!this.cache) return [];

    const merged = new Set<string>([
      ...(this.cache.claudeMdTechStack || []),
      ...(this.cache.packageJsonTechStack || []),
    ]);

    return Array.from(merged);
  }

  /**
   * Performance constants for open tabs scanning
   */
  private readonly OPEN_TABS_CONFIG = {
    maxSnippets: 3,           // Maximum snippets to return
    maxTabsToScan: 15,        // Maximum tabs to scan
    maxFileSize: 100 * 1024,  // Skip files larger than 100KB
    timeoutMs: 300,           // Timeout for entire operation
    minScore: 10,             // Minimum score to include snippet (lowered from 30 to allow active tab fallback)
  };

  /**
   * Tier 3: Get relevant snippets from ALL open tabs (relevance-scored)
   * Scans all open tabs, scores them for relevance to the prompt,
   * and returns the top N most relevant snippets.
   */
  private async getRelevantOpenTabs(prompt: string): Promise<RelevantSnippet[]> {
    const startTime = Date.now();

    try {
      // Get all open text tabs
      const openTabs: { uri: vscode.Uri; isActive: boolean }[] = [];
      const activeEditor = vscode.window.activeTextEditor;
      const activeUri = activeEditor?.document.uri.toString();

      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          if (tab.input instanceof vscode.TabInputText) {
            openTabs.push({
              uri: tab.input.uri,
              isActive: tab.input.uri.toString() === activeUri,
            });
          }
        }
      }

      if (openTabs.length === 0) {
        return [];
      }

      if (this.debug) {
        console.log(`[WorkspaceContext] Scanning ${openTabs.length} open tabs`);
      }

      // Limit tabs to scan
      const tabsToScan = openTabs.slice(0, this.OPEN_TABS_CONFIG.maxTabsToScan);

      // Score all tabs in parallel with timeout
      const scoredSnippets = await Promise.race([
        this.scoreOpenTabs(tabsToScan, prompt),
        this.timeout<RelevantSnippet[]>(this.OPEN_TABS_CONFIG.timeoutMs, []),
      ]);

      // Filter by minimum score, sort by score descending, take top N
      const result = scoredSnippets
        .filter(s => (s.score || 0) >= this.OPEN_TABS_CONFIG.minScore)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, this.OPEN_TABS_CONFIG.maxSnippets);

      if (this.debug) {
        console.log(`[WorkspaceContext] Open tabs scan took ${Date.now() - startTime}ms, found ${result.length} relevant snippets`);
      }

      return result;
    } catch (error) {
      console.warn('[WorkspaceContext] Error scanning open tabs:', error);
      return [];
    }
  }

  /**
   * Score all open tabs for relevance to prompt
   */
  private async scoreOpenTabs(
    tabs: { uri: vscode.Uri; isActive: boolean }[],
    prompt: string
  ): Promise<RelevantSnippet[]> {
    const promptLower = prompt.toLowerCase();
    const snippets: RelevantSnippet[] = [];

    // Fix 4: Detect visual selection - user has code selected = highest priority
    const activeEditor = vscode.window.activeTextEditor;
    const hasVisualSelection = activeEditor?.selection && !activeEditor.selection.isEmpty;
    const visualSelectionUri = hasVisualSelection ? activeEditor.document.uri.toString() : null;

    if (this.debug && hasVisualSelection) {
      console.log('[WorkspaceContext] Visual selection detected in:', activeEditor.document.fileName);
    }

    // Process tabs in parallel
    const results = await Promise.all(
      tabs.map(async (tab) => {
        try {
          const document = await vscode.workspace.openTextDocument(tab.uri);
          const content = document.getText();

          // Skip large files
          if (content.length > this.OPEN_TABS_CONFIG.maxFileSize) {
            return null;
          }

          const filePath = tab.uri.fsPath;
          const fileName = path.basename(filePath);
          const fileNameWithoutExt = fileName.replace(/\.[^.]+$/, '');
          const ext = path.extname(filePath).slice(1);

          // Calculate relevance score
          let score = 0;
          let matchedEntity = fileName;
          let confidence: 'high' | 'low' = 'low';

          // +40: File name (without extension) mentioned in prompt
          if (promptLower.includes(fileNameWithoutExt.toLowerCase())) {
            score += 40;
            confidence = 'high';
          }

          // +35: Exported entity name mentioned in prompt
          const exports = this.extractExportedNames(content);
          const matchedExport = exports.find(e => promptLower.includes(e.toLowerCase()));
          if (matchedExport) {
            score += 35;
            matchedEntity = matchedExport;
            confidence = 'high';
          }

          // +20: File extension type mentioned in prompt
          if (ext && promptLower.includes(ext.toLowerCase())) {
            score += 20;
          }

          // +25: Active tab bonus (boosted from 10 to ensure active tab crosses threshold)
          if (tab.isActive) {
            score += 25;
          }

          // +50: Visual selection bonus - user has selected code in this file
          if (visualSelectionUri && tab.uri.toString() === visualSelectionUri) {
            score += 50;
            confidence = 'high';
          }

          // Only return if score > 0 (has some relevance)
          if (score === 0) {
            return null;
          }

          return {
            entityName: matchedEntity,
            filePath,
            relevantCode: this.extractRelevantCode(content, 500),
            confidence,
            score,
          } as RelevantSnippet;
        } catch {
          return null;
        }
      })
    );

    // Filter out nulls
    for (const result of results) {
      if (result) {
        snippets.push(result);
      }
    }

    return snippets;
  }

  /**
   * Create a timeout promise
   */
  private timeout<T>(ms: number, fallback: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(fallback), ms));
  }

  /**
   * Extract exported function/class/const names from file content
   */
  private extractExportedNames(content: string): string[] {
    const names: string[] = [];

    // Match: export function name, export const name, export class name
    const exportPatterns = [
      /export\s+(?:async\s+)?function\s+(\w+)/g,
      /export\s+const\s+(\w+)/g,
      /export\s+class\s+(\w+)/g,
      /export\s+default\s+(?:function\s+)?(\w+)/g,
    ];

    for (const pattern of exportPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && match[1].length > 2) {
          names.push(match[1]);
        }
      }
    }

    // Also check for React component patterns (const Name = () => or function Name())
    const componentPattern = /(?:export\s+)?(?:const|function)\s+([A-Z][a-zA-Z0-9]+)\s*[=:]/g;
    let match;
    while ((match = componentPattern.exec(content)) !== null) {
      if (match[1] && !names.includes(match[1])) {
        names.push(match[1]);
      }
    }

    return names;
  }

  /**
   * Extract relevant code, prioritizing beginning and limiting size
   */
  private extractRelevantCode(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content;

    // Try to cut at a reasonable boundary (end of line)
    const truncated = content.substring(0, maxChars);
    const lastNewline = truncated.lastIndexOf('\n');
    if (lastNewline > maxChars * 0.8) {
      return truncated.substring(0, lastNewline) + '\n// ...';
    }
    return truncated + '\n// ...';
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = null;
    }
    this.cache = null;
  }
}

/**
 * Get singleton instance (convenience function)
 */
export function getWorkspaceContextService(): WorkspaceContextService {
  return WorkspaceContextService.getInstance();
}
