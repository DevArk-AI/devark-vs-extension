/**
 * SmartSnippetService - Code Snippet Extraction for Contextual Prompts (Workstream A)
 *
 * Responsibilities:
 * - Extract entity names from prompts (files, components, functions)
 * - Find matching files in VS Code workspace
 * - Fetch relevant code snippets (max 50 lines each)
 * - Respect performance budget (500ms total)
 */

import * as vscode from 'vscode';
import { SmartSnippet } from './types/context-types';

/**
 * Entity types that can be extracted from prompts
 */
type EntityType = 'file' | 'component' | 'function' | 'class';

/**
 * Extracted entity from prompt text
 */
interface ExtractedEntity {
  name: string;
  type: EntityType;
  confidence: number;
}

/**
 * File match result
 */
interface FileMatch {
  entity: ExtractedEntity;
  filePath: string;
  uri: vscode.Uri;
}

/**
 * Entity extraction patterns
 */
const ENTITY_PATTERNS = {
  // File names with extensions
  file: /(?:^|[\s"'`/\\])([a-zA-Z_][\w-]*\.(?:ts|tsx|js|jsx|py|rs|go|java|cs|vue|svelte|css|scss|html|json|yaml|yml|md|sql))\b/gi,
  // PascalCase components (React, Vue, etc.)
  component: /\b([A-Z][a-zA-Z0-9]*(?:Component|Page|View|Modal|Button|Form|Card|List|Item|Header|Footer|Panel|Dialog|Drawer|Sidebar|Tab|Table)?)\b/g,
  // Function names with common prefixes
  function: /\b((?:use|get|set|is|has|can|should|will|fetch|load|save|update|delete|create|remove|add|handle|on|process)[A-Z][a-zA-Z0-9]*)\b/g,
  // Class declarations
  class: /\bclass\s+([A-Z][a-zA-Z0-9]*)/g,
};

/**
 * Common words to filter out from component matches
 */
const COMMON_WORDS = new Set([
  'The', 'This', 'That', 'These', 'Those', 'Here', 'There',
  'What', 'When', 'Where', 'Which', 'Who', 'How', 'Why',
  'Yes', 'No', 'Not', 'Can', 'Could', 'Would', 'Should',
  'May', 'Might', 'Must', 'Will', 'Shall',
  'Error', 'Warning', 'Info', 'Debug', 'Log',
  'String', 'Number', 'Boolean', 'Object', 'Array', 'Function',
  'Promise', 'Date', 'Map', 'Set', 'Error', 'RegExp',
  'Please', 'Help', 'Need', 'Want', 'Make', 'Just', 'Like',
  'Some', 'Any', 'All', 'Only', 'Also', 'Still', 'Even',
]);

/**
 * Performance budget constants (in ms)
 */
const PERFORMANCE_BUDGET = {
  entityExtraction: 50,
  fileSearch: 200,
  snippetFetch: 300,
  total: 500,
};

/**
 * Snippet limits
 */
const SNIPPET_LIMITS = {
  maxSnippets: 3,
  maxLinesPerSnippet: 50,
  maxFileSize: 100 * 1024, // 100KB
};

/**
 * SmartSnippetService - Extract and fetch code snippets for prompts
 */
export class SmartSnippetService {
  private static instance: SmartSnippetService | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): SmartSnippetService {
    if (!SmartSnippetService.instance) {
      SmartSnippetService.instance = new SmartSnippetService();
    }
    return SmartSnippetService.instance;
  }

  /**
   * Get code snippets for entities mentioned in a prompt
   * Respects performance budget with graceful degradation
   */
  public async getSnippetsForPrompt(prompt: string): Promise<SmartSnippet[]> {
    const startTime = Date.now();

    try {
      // Step 1: Extract entities from prompt (budget: 50ms)
      const entities = this.extractMentionedEntities(prompt);

      if (entities.length === 0) {
        console.log('[SmartSnippetService] No entities found in prompt, using active editor as fallback');

        // Fix 2: Active editor fallback - if no entities detected, use the active file
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          try {
            const document = activeEditor.document;
            const content = document.getText();

            // Skip large files
            if (content.length <= SNIPPET_LIMITS.maxFileSize) {
              const filePath = vscode.workspace.asRelativePath(document.uri);
              const fileName = filePath.split(/[/\\]/).pop() || filePath;
              const lines = content.split('\n');
              const relevantCode = this.extractFileOverview(lines);

              return [{
                entityName: fileName,
                filePath,
                relevantCode: relevantCode.slice(0, 1500),
                extractionReason: 'Active editor fallback (no entities in prompt)',
                lineCount: relevantCode.split('\n').length,
              }];
            }
          } catch (error) {
            console.warn('[SmartSnippetService] Failed to get active editor as fallback:', error);
          }
        }

        return [];
      }

      console.log(`[SmartSnippetService] Found ${entities.length} entities:`, entities.map(e => `${e.type}:${e.name}`).join(', '));

      // Step 2: Find files matching entities (budget: 200ms)
      const remainingBudget = PERFORMANCE_BUDGET.total - (Date.now() - startTime);
      const fileMatches = await this.findFilesForEntitiesWithTimeout(
        entities,
        Math.min(remainingBudget, PERFORMANCE_BUDGET.fileSearch)
      );

      if (fileMatches.length === 0) {
        return [];
      }

      // Step 3: Fetch relevant code (budget: 300ms)
      const snippetBudget = PERFORMANCE_BUDGET.total - (Date.now() - startTime);
      const snippets = await this.fetchRelevantCodeWithTimeout(
        fileMatches,
        Math.min(snippetBudget, PERFORMANCE_BUDGET.snippetFetch)
      );

      const elapsed = Date.now() - startTime;
      console.log(`[SmartSnippetService] Fetched ${snippets.length} snippets in ${elapsed}ms`);

      return snippets.slice(0, SNIPPET_LIMITS.maxSnippets);
    } catch (error) {
      console.warn('[SmartSnippetService] Error fetching snippets:', error);
      return [];
    }
  }

  /**
   * Get snippets from specific file paths (for coaching context)
   * Used by CoachingService to fetch snippets from files modified by the agent
   */
  public async getSnippetsFromFiles(filePaths: string[]): Promise<SmartSnippet[]> {
    if (!filePaths.length) return [];

    const startTime = Date.now();
    const snippets: SmartSnippet[] = [];
    const maxSnippets = SNIPPET_LIMITS.maxSnippets;

    for (const filePath of filePaths.slice(0, maxSnippets)) {
      try {
        const uri = await this.resolveFilePath(filePath);
        if (!uri) continue;

        const document = await vscode.workspace.openTextDocument(uri);
        const content = document.getText();

        // Skip large files
        if (content.length > SNIPPET_LIMITS.maxFileSize) {
          console.log(`[SmartSnippetService] Skipping large file: ${filePath}`);
          continue;
        }

        // Use extractFileOverview to get a meaningful snippet
        const lines = content.split('\n');
        const relevantCode = this.extractFileOverview(lines);

        snippets.push({
          entityName: this.getBasename(filePath),
          filePath: filePath,
          relevantCode: relevantCode.slice(0, 500), // Cap at 500 chars for coaching
          extractionReason: 'Modified by agent',
          lineCount: relevantCode.split('\n').length,
        });
      } catch (error) {
        console.warn(`[SmartSnippetService] Failed to read ${filePath}:`, error);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[SmartSnippetService] getSnippetsFromFiles: ${snippets.length} snippets in ${elapsed}ms`);

    return snippets;
  }

  /**
   * Resolve a file path to a VS Code Uri
   * Handles both absolute and relative paths
   */
  private async resolveFilePath(filePath: string): Promise<vscode.Uri | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    // Try as absolute path first
    try {
      const absoluteUri = vscode.Uri.file(filePath);
      await vscode.workspace.fs.stat(absoluteUri);
      return absoluteUri;
    } catch {
      // Not an absolute path, try relative
    }

    // Try relative to workspace folders
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        try {
          // Join with workspace folder path
          const fullPath = vscode.Uri.joinPath(folder.uri, filePath);
          await vscode.workspace.fs.stat(fullPath);
          return fullPath;
        } catch {
          // Continue to next folder
        }
      }
    }

    return null;
  }

  /**
   * Get basename from a file path (cross-platform)
   */
  private getBasename(filePath: string): string {
    // Handle both Windows and Unix paths
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] || filePath;
  }

  /**
   * Extract entity names from prompt text
   * Uses regex patterns - no async, must be fast
   */
  public extractMentionedEntities(prompt: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const seen = new Set<string>();

    // Extract file names (highest priority)
    const filePattern = new RegExp(ENTITY_PATTERNS.file.source, 'gi');
    let match;
    while ((match = filePattern.exec(prompt)) !== null) {
      const name = match[1];
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        entities.push({ name, type: 'file', confidence: 1.0 });
      }
    }

    // Extract component names
    const componentPattern = new RegExp(ENTITY_PATTERNS.component.source, 'g');
    while ((match = componentPattern.exec(prompt)) !== null) {
      const name = match[1];
      if (
        name.length > 2 &&
        !COMMON_WORDS.has(name) &&
        !seen.has(name.toLowerCase())
      ) {
        seen.add(name.toLowerCase());
        entities.push({ name, type: 'component', confidence: 0.8 });
      }
    }

    // Extract function names
    const functionPattern = new RegExp(ENTITY_PATTERNS.function.source, 'g');
    while ((match = functionPattern.exec(prompt)) !== null) {
      const name = match[1];
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        entities.push({ name, type: 'function', confidence: 0.7 });
      }
    }

    // Sort by confidence and limit
    return entities
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
  }

  /**
   * Find files matching extracted entities
   */
  private async findFilesForEntitiesWithTimeout(
    entities: ExtractedEntity[],
    timeoutMs: number
  ): Promise<FileMatch[]> {
    return Promise.race([
      this.findFilesForEntities(entities),
      this.timeout(timeoutMs, []),
    ]);
  }

  /**
   * Find files matching entities in workspace
   */
  private async findFilesForEntities(entities: ExtractedEntity[]): Promise<FileMatch[]> {
    const matches: FileMatch[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    for (const entity of entities) {
      if (matches.length >= SNIPPET_LIMITS.maxSnippets) {
        break;
      }

      try {
        let files: vscode.Uri[] = [];

        if (entity.type === 'file') {
          // Direct file search
          files = await vscode.workspace.findFiles(
            `**/${entity.name}`,
            '**/node_modules/**',
            5
          );
        } else {
          // Search for files containing the entity name
          const patterns = this.getSearchPatternsForEntity(entity);
          for (const pattern of patterns) {
            const found = await vscode.workspace.findFiles(
              pattern,
              '**/node_modules/**',
              3
            );
            files.push(...found);
            if (files.length > 0) break;
          }
        }

        // Add matches
        for (const uri of files.slice(0, 2)) {
          matches.push({
            entity,
            filePath: vscode.workspace.asRelativePath(uri),
            uri,
          });
        }
      } catch {
        // Continue on error
      }
    }

    return matches;
  }

  /**
   * Get search patterns for an entity
   */
  private getSearchPatternsForEntity(entity: ExtractedEntity): string[] {
    switch (entity.type) {
      case 'component':
        return [
          `**/${entity.name}.tsx`,
          `**/${entity.name}.jsx`,
          `**/${entity.name}.vue`,
          `**/${entity.name}.svelte`,
          `**/components/**/${entity.name}.*`,
        ];
      case 'function':
        return [
          `**/*${entity.name}*.ts`,
          `**/*${entity.name}*.js`,
          `**/hooks/**/*.ts`,
          `**/utils/**/*.ts`,
        ];
      case 'class':
        return [
          `**/${entity.name}.ts`,
          `**/${entity.name}.js`,
          `**/services/**/${entity.name}.*`,
          `**/models/**/${entity.name}.*`,
        ];
      default:
        return [`**/${entity.name}.*`];
    }
  }

  /**
   * Fetch relevant code from matched files
   */
  private async fetchRelevantCodeWithTimeout(
    matches: FileMatch[],
    timeoutMs: number
  ): Promise<SmartSnippet[]> {
    return Promise.race([
      this.fetchRelevantCode(matches),
      this.timeout(timeoutMs, []),
    ]);
  }

  /**
   * Fetch relevant code snippets from files
   */
  private async fetchRelevantCode(matches: FileMatch[]): Promise<SmartSnippet[]> {
    const snippets: SmartSnippet[] = [];

    for (const match of matches.slice(0, SNIPPET_LIMITS.maxSnippets)) {
      try {
        const document = await vscode.workspace.openTextDocument(match.uri);
        const text = document.getText();

        // Skip large files
        if (text.length > SNIPPET_LIMITS.maxFileSize) {
          continue;
        }

        const snippet = this.extractRelevantSnippet(
          text,
          match.entity,
          match.filePath
        );

        if (snippet) {
          snippets.push(snippet);
        }
      } catch {
        // Continue on error
      }
    }

    return snippets;
  }

  /**
   * Extract relevant portion of code from file
   */
  private extractRelevantSnippet(
    content: string,
    entity: ExtractedEntity,
    filePath: string
  ): SmartSnippet | null {
    const lines = content.split('\n');

    if (lines.length === 0) {
      return null;
    }

    let relevantCode: string;
    let extractionReason: string;

    // For components: try to find the component definition
    if (entity.type === 'component') {
      const componentStart = this.findComponentDefinition(lines, entity.name);
      if (componentStart >= 0) {
        relevantCode = this.extractLinesFrom(lines, componentStart, SNIPPET_LIMITS.maxLinesPerSnippet);
        extractionReason = `Component definition for ${entity.name}`;
      } else {
        // Fall back to first N lines
        relevantCode = this.extractLinesFrom(lines, 0, SNIPPET_LIMITS.maxLinesPerSnippet);
        extractionReason = `File containing ${entity.name}`;
      }
    }
    // For functions: find the function definition
    else if (entity.type === 'function') {
      const funcStart = this.findFunctionDefinition(lines, entity.name);
      if (funcStart >= 0) {
        relevantCode = this.extractLinesFrom(lines, funcStart, SNIPPET_LIMITS.maxLinesPerSnippet);
        extractionReason = `Function definition for ${entity.name}`;
      } else {
        relevantCode = this.extractLinesFrom(lines, 0, SNIPPET_LIMITS.maxLinesPerSnippet);
        extractionReason = `File mentioned in prompt`;
      }
    }
    // For files: extract imports + main logic
    else {
      relevantCode = this.extractFileOverview(lines);
      extractionReason = `File overview for ${entity.name}`;
    }

    const lineCount = relevantCode.split('\n').length;

    return {
      entityName: entity.name,
      filePath,
      relevantCode,
      extractionReason,
      lineCount,
    };
  }

  /**
   * Find component definition line
   */
  private findComponentDefinition(lines: string[], componentName: string): number {
    const patterns = [
      new RegExp(`(?:export\\s+)?(?:default\\s+)?function\\s+${componentName}`, 'i'),
      new RegExp(`(?:export\\s+)?const\\s+${componentName}\\s*=`, 'i'),
      new RegExp(`(?:export\\s+)?class\\s+${componentName}`, 'i'),
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of patterns) {
        if (pattern.test(lines[i])) {
          return i;
        }
      }
    }

    return -1;
  }

  /**
   * Find function definition line
   */
  private findFunctionDefinition(lines: string[], funcName: string): number {
    const patterns = [
      new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${funcName}`, 'i'),
      new RegExp(`(?:export\\s+)?const\\s+${funcName}\\s*=`, 'i'),
      new RegExp(`${funcName}\\s*[:=]\\s*(?:async\\s+)?(?:function|\\()`, 'i'),
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of patterns) {
        if (pattern.test(lines[i])) {
          return i;
        }
      }
    }

    return -1;
  }

  /**
   * Extract N lines starting from a position
   */
  private extractLinesFrom(lines: string[], start: number, count: number): string {
    return lines.slice(start, start + count).join('\n');
  }

  /**
   * Extract file overview (imports + exports + main)
   */
  private extractFileOverview(lines: string[]): string {
    const importLines: string[] = [];
    const exportLines: string[] = [];
    let mainStart = -1;

    for (let i = 0; i < lines.length && i < 100; i++) {
      const line = lines[i];

      if (line.match(/^import\s/)) {
        importLines.push(line);
      } else if (line.match(/^export\s(?!default)/)) {
        exportLines.push(line);
      } else if (
        mainStart < 0 &&
        !line.match(/^\s*$/) &&
        !line.match(/^\/[/*]/) &&
        !line.match(/^import\s/) &&
        !line.match(/^export\s/)
      ) {
        mainStart = i;
      }
    }

    // Build overview
    const parts: string[] = [];

    // Add imports summary
    if (importLines.length > 0) {
      parts.push(`// ${importLines.length} imports`);
      parts.push(...importLines.slice(0, 5));
      if (importLines.length > 5) {
        parts.push(`// ... ${importLines.length - 5} more imports`);
      }
      parts.push('');
    }

    // Add main content
    if (mainStart >= 0) {
      const mainLines = lines.slice(mainStart, mainStart + 30);
      parts.push(...mainLines);
    } else {
      parts.push(...lines.slice(0, SNIPPET_LIMITS.maxLinesPerSnippet));
    }

    return parts.join('\n').slice(0, 3000); // Cap at ~3KB
  }

  /**
   * Create a timeout promise
   */
  private timeout<T>(ms: number, fallback: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(fallback), ms));
  }
}

/**
 * Get SmartSnippetService singleton
 */
export function getSmartSnippetService(): SmartSnippetService {
  return SmartSnippetService.getInstance();
}
