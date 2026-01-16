/**
 * SavedPromptsStore - Persistent Storage for Saved Prompts Library
 *
 * Uses VS Code's globalState for persistence across sessions.
 * Features:
 * - Max 500 prompts stored
 * - Global and per-project prompts
 * - Tags and folders for organization
 * - Search functionality
 */

import * as vscode from 'vscode';
import { getNotificationService } from '../services/NotificationService';

export interface SavedPrompt {
  id: string;
  text: string;
  name?: string;
  tags: string[];
  folder?: string;
  projectId?: string; // null/undefined = global library
  createdAt: Date;
  lastModifiedAt: Date;
  lastScore?: number;
  improvedVersion?: string;
  improvedScore?: number;
  lastAnalyzedAt?: Date;
}

// Serializable version for storage
interface SerializedSavedPrompt extends Omit<SavedPrompt, 'createdAt' | 'lastModifiedAt' | 'lastAnalyzedAt'> {
  createdAt: string;
  lastModifiedAt: string;
  lastAnalyzedAt?: string;
}

export class SavedPromptsStore {
  private static readonly STORAGE_KEY = 'devark.savedPrompts';
  private static readonly MAX_PROMPTS = 500;
  private static readonly WARN_THRESHOLD = 400;

  private context: vscode.ExtensionContext;
  private cache: SavedPrompt[] | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Initialize and load prompts from storage
   */
  public async initialize(): Promise<void> {
    await this.loadFromStorage();
  }

  /**
   * Get all saved prompts
   */
  public getAll(): SavedPrompt[] {
    return this.cache || [];
  }

  /**
   * Get prompts by project (null for global)
   */
  public getByProject(projectId?: string): SavedPrompt[] {
    return this.getAll().filter(p => p.projectId === projectId);
  }

  /**
   * Get global prompts (not associated with any project)
   */
  public getGlobal(): SavedPrompt[] {
    return this.getAll().filter(p => !p.projectId);
  }

  /**
   * Get prompts by tag
   */
  public getByTag(tag: string): SavedPrompt[] {
    return this.getAll().filter(p => p.tags.includes(tag));
  }

  /**
   * Get prompts by folder
   */
  public getByFolder(folder: string): SavedPrompt[] {
    return this.getAll().filter(p => p.folder === folder);
  }

  /**
   * Get all unique tags
   */
  public getAllTags(): string[] {
    const tags = new Set<string>();
    for (const prompt of this.getAll()) {
      for (const tag of prompt.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }

  /**
   * Get all unique folders
   */
  public getAllFolders(): string[] {
    const folders = new Set<string>();
    for (const prompt of this.getAll()) {
      if (prompt.folder) {
        folders.add(prompt.folder);
      }
    }
    return Array.from(folders).sort();
  }

  /**
   * Search prompts by text query
   */
  public search(query: string): SavedPrompt[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(p =>
      p.text.toLowerCase().includes(lowerQuery) ||
      (p.name && p.name.toLowerCase().includes(lowerQuery)) ||
      p.tags.some(t => t.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get a single prompt by ID
   */
  public getById(id: string): SavedPrompt | undefined {
    return this.getAll().find(p => p.id === id);
  }

  /**
   * Save a new prompt
   */
  public async savePrompt(prompt: SavedPrompt): Promise<void> {
    const prompts = this.getAll();

    // Check capacity
    if (prompts.length >= SavedPromptsStore.MAX_PROMPTS) {
      throw new Error(`Maximum saved prompts limit (${SavedPromptsStore.MAX_PROMPTS}) reached. Please delete some prompts.`);
    }

    // Warn if approaching limit
    if (prompts.length >= SavedPromptsStore.WARN_THRESHOLD) {
      getNotificationService().warn(
        `You have ${prompts.length} saved prompts. Maximum is ${SavedPromptsStore.MAX_PROMPTS}.`
      );
    }

    // Add to beginning
    prompts.unshift(prompt);

    this.cache = prompts;
    await this.saveToStorage();
  }

  /**
   * Update an existing prompt
   */
  public async updatePrompt(id: string, updates: Partial<SavedPrompt>): Promise<void> {
    const prompts = this.getAll();
    const index = prompts.findIndex(p => p.id === id);

    if (index === -1) {
      throw new Error(`Prompt with id ${id} not found`);
    }

    prompts[index] = {
      ...prompts[index],
      ...updates,
      lastModifiedAt: new Date(),
    };

    this.cache = prompts;
    await this.saveToStorage();
  }

  /**
   * Delete a prompt
   */
  public async deletePrompt(id: string): Promise<void> {
    const prompts = this.getAll();
    const filtered = prompts.filter(p => p.id !== id);

    if (filtered.length === prompts.length) {
      throw new Error(`Prompt with id ${id} not found`);
    }

    this.cache = filtered;
    await this.saveToStorage();
  }

  /**
   * Delete multiple prompts
   */
  public async deletePrompts(ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const prompts = this.getAll();
    this.cache = prompts.filter(p => !idSet.has(p.id));
    await this.saveToStorage();
  }

  /**
   * Clear all saved prompts
   */
  public async clearAll(): Promise<void> {
    this.cache = [];
    await this.saveToStorage();
  }

  /**
   * Get count of saved prompts
   */
  public getCount(): number {
    return this.getAll().length;
  }

  /**
   * Check if approaching storage limit
   */
  public isNearLimit(): boolean {
    return this.getCount() >= SavedPromptsStore.WARN_THRESHOLD;
  }

  /**
   * Load prompts from VS Code storage
   */
  private async loadFromStorage(): Promise<void> {
    const serialized = this.context.globalState.get<SerializedSavedPrompt[]>(
      SavedPromptsStore.STORAGE_KEY,
      []
    );

    // Deserialize dates
    this.cache = serialized.map(p => ({
      ...p,
      createdAt: new Date(p.createdAt),
      lastModifiedAt: new Date(p.lastModifiedAt),
      lastAnalyzedAt: p.lastAnalyzedAt ? new Date(p.lastAnalyzedAt) : undefined,
    }));
  }

  /**
   * Save prompts to VS Code storage
   */
  private async saveToStorage(): Promise<void> {
    if (!this.cache) {
      return;
    }

    // Serialize dates
    const serialized: SerializedSavedPrompt[] = this.cache.map(p => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      lastModifiedAt: p.lastModifiedAt.toISOString(),
      lastAnalyzedAt: p.lastAnalyzedAt?.toISOString(),
    }));

    await this.context.globalState.update(SavedPromptsStore.STORAGE_KEY, serialized);
  }
}

/**
 * Generate a unique ID for saved prompts
 */
export function generateSavedPromptId(): string {
  return `sp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
