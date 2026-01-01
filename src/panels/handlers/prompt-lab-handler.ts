/**
 * PromptLabHandler - Handles Prompt Lab feature messages
 *
 * Prompt Lab allows users to:
 * - Analyze prompts in isolation (not auto-captured)
 * - Save prompts to a library for reuse
 * - Organize prompts with tags and folders
 * - Regenerate enhancements for variety
 */

import * as vscode from 'vscode';
import { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
import { SharedContext } from './shared-context';
import { ExtensionState } from '../../extension-state';
import { generateSavedPromptId, type SavedPrompt } from '../../storage/SavedPromptsStore';
import type { AnalyzedPrompt } from '../../storage/PromptHistoryStore';
import { gatherPromptContext } from '../../services/context-utils';
import type { WebviewMessageData } from '../../shared/webview-protocol';

export class PromptLabHandler extends BaseMessageHandler {
  private sharedContext: SharedContext;

  constructor(
    messageSender: MessageSender,
    handlerContext: HandlerContext,
    sharedContext: SharedContext
  ) {
    super(messageSender, handlerContext);
    this.sharedContext = sharedContext;
  }

  getHandledMessageTypes(): string[] {
    return [
      'analyzePromptLabPrompt',
      'savePromptToLibrary',
      'getSavedPrompts',
      'deleteSavedPrompt',
      'renamePrompt',
    ];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    switch (type) {
      case 'analyzePromptLabPrompt': {
        const d = data as WebviewMessageData<'analyzePromptLabPrompt'>;
        await this.handleAnalyzePromptLabPrompt(d.prompt, d.regenerate);
        return true;
      }
      case 'savePromptToLibrary': {
        const d = data as WebviewMessageData<'savePromptToLibrary'>;
        await this.handleSavePromptToLibrary(d);
        return true;
      }
      case 'getSavedPrompts':
        await this.handleGetSavedPrompts();
        return true;
      case 'deleteSavedPrompt': {
        const d = data as WebviewMessageData<'deleteSavedPrompt'>;
        await this.handleDeleteSavedPrompt(d.id);
        return true;
      }
      case 'renamePrompt': {
        const d = data as WebviewMessageData<'renamePrompt'>;
        await this.handleRenamePrompt(d.id, d.name);
        return true;
      }
      default:
        return false;
    }
  }

  /**
   * Analyze a prompt from Prompt Lab (isolated from auto-detection)
   * Reuses the same parallel analysis pattern as auto-captured prompts
   * When regenerate is true, uses aggressive enhancement for varied results
   */
  private async handleAnalyzePromptLabPrompt(prompt: string, regenerate: boolean = false): Promise<void> {
    const llmManager = ExtensionState.getLLMManager();
    if (!llmManager) {
      vscode.window.showErrorMessage('No LLM provider configured');
      return;
    }

    const activeProvider = llmManager.getActiveProvider();
    if (!activeProvider) {
      vscode.window.showErrorMessage('No active LLM provider');
      return;
    }

    try {
      const { PromptScorer } = await import('../../copilot/prompt-scorer');
      const { PromptEnhancer } = await import('../../copilot/prompt-enhancer');

      const scorer = new PromptScorer(llmManager);
      const enhancer = new PromptEnhancer(llmManager);
      const promptId = Date.now().toString();

      // Use aggressive enhancement when regenerating for varied results
      const enhancementLevel = regenerate ? 'aggressive' : 'medium';

      // Gather context automatically
      const context = await gatherPromptContext(prompt, '[PromptLab]');

      // Send context info to UI for transparency
      if (context) {
        this.send('promptLabContextUsed', {
          goal: context.goal,
          techStack: context.techStack || [],
          snippetCount: context.codeSnippets?.length || 0,
          topicsCount: context.recentTopics?.length || 0,
        });
      }

      // FIRE LLM CALLS IN PARALLEL - Stream results as they arrive

      // 1. FIRE: Score prompt (skip on regenerate - score stays same)
      const scorePromise = regenerate
        ? Promise.resolve(null)
        : scorer.scorePromptV2(prompt, undefined, context).then((result) => {
            console.log(`[PromptLabHandler] Score ready: ${result.overall / 10}`);

            this.send('promptLabScoreReceived', {
              promptId,
              score: result.overall / 10,
              categoryScores: {
                clarity: result.clarity,
                specificity: result.specificity,
                context: result.context,
                actionability: result.actionability,
              },
              breakdown: result.breakdown,
              explanation: result.explanation,
            });
            return result;
          });

      // 2. FIRE: Enhance prompt (stream result when ready, then score enhanced)
      const enhancePromise = enhancer.enhancePrompt(prompt, enhancementLevel, undefined, context).then(async (result) => {
        console.log(`[PromptLabHandler] Enhancement ready`);

        this.send('promptLabEnhancedReady', {
          promptId,
          improvedVersion: result.enhanced,
        });

        const enhScore = await scorer.scorePrompt(result.enhanced);
        console.log(`[PromptLabHandler] Enhanced score ready: ${enhScore.overall / 10}`);

        this.send('promptLabEnhancedScoreReady', {
          promptId,
          improvedScore: enhScore.overall / 10,
        });
        return { enhanced: result, enhancedScore: enhScore };
      });

      // Wait for all to complete
      const [scoreResult, enhanceResult] = await Promise.all([
        scorePromise.catch(() => null),
        enhancePromise.catch(() => null),
      ]);

      // Guard: For initial analysis, need score; for regenerate, only need enhancement
      if (!regenerate && !scoreResult) {
        console.error('[PromptLabHandler] Scoring failed');
        vscode.window.showErrorMessage('Prompt Lab analysis failed: Scoring did not complete');
        return;
      }

      if (!enhanceResult) {
        console.error('[PromptLabHandler] Enhancement failed');
        vscode.window.showErrorMessage('Prompt Lab analysis failed: Enhancement did not complete');
        return;
      }

      // Create analyzed prompt object (same structure as auto-capture)
      const analyzedPrompt: AnalyzedPrompt = {
        id: promptId,
        text: prompt,
        truncatedText: prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt,
        score: scoreResult ? scoreResult.overall / 10 : 0,
        timestamp: new Date(),
        categoryScores: scoreResult ? {
          clarity: scoreResult.clarity,
          specificity: scoreResult.specificity,
          context: scoreResult.context,
          actionability: scoreResult.actionability,
        } : undefined,
        quickWins: scoreResult?.suggestions?.slice(0, 3).map((s: string) => s.split(' ').slice(0, 3).join(' ')),
        improvedVersion: enhanceResult.enhanced?.enhanced,
        improvedScore: enhanceResult.enhancedScore ? enhanceResult.enhancedScore.overall / 10 : undefined,
        breakdown: scoreResult?.breakdown,
        explanation: scoreResult?.explanation,
      };

      // Send final complete analysis
      this.send('promptLabAnalysisComplete', {
        prompt: analyzedPrompt,
        isRegenerate: regenerate,
      });
    } catch (error) {
      console.error('[PromptLabHandler] Analysis failed:', error);
      vscode.window.showErrorMessage(
        `Prompt Lab analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Save a prompt to the library
   */
  private async handleSavePromptToLibrary(data: WebviewMessageData<'savePromptToLibrary'>): Promise<void> {
    const savedPromptsStore = this.sharedContext.savedPromptsStore;
    if (!savedPromptsStore || !data.text) {
      return;
    }

    try {
      const prompt: SavedPrompt = {
        id: generateSavedPromptId(),
        text: data.text,
        name: data.name,
        tags: data.tags || [],
        createdAt: new Date(),
        lastModifiedAt: new Date(),
        lastScore: data.lastScore,
        improvedVersion: data.improvedVersion,
        improvedScore: data.improvedScore,
        lastAnalyzedAt: data.lastAnalyzedAt ? new Date(data.lastAnalyzedAt as unknown as string) : new Date(),
      };

      await savedPromptsStore.savePrompt(prompt);
      await this.handleGetSavedPrompts();
      vscode.window.showInformationMessage('Prompt saved to library');
    } catch (error) {
      console.error('[PromptLabHandler] Save prompt failed:', error);
      vscode.window.showErrorMessage(
        error instanceof Error ? error.message : 'Failed to save prompt'
      );
    }
  }

  /**
   * Get all saved prompts
   */
  private async handleGetSavedPrompts(): Promise<void> {
    const savedPromptsStore = this.sharedContext.savedPromptsStore;
    if (!savedPromptsStore) {
      return;
    }

    const prompts = savedPromptsStore.getAll();
    const tags = savedPromptsStore.getAllTags();
    const folders = savedPromptsStore.getAllFolders();

    this.send('savedPromptsLoaded', {
      prompts,
      tags,
      folders,
    });
  }

  /**
   * Delete a saved prompt
   */
  private async handleDeleteSavedPrompt(id: string): Promise<void> {
    const savedPromptsStore = this.sharedContext.savedPromptsStore;
    if (!savedPromptsStore) {
      this.send('error', { operation: 'deletePrompt', message: 'Saved prompts store not initialized' });
      return;
    }
    if (!id) return;

    try {
      await savedPromptsStore.deletePrompt(id);
      await this.handleGetSavedPrompts();
    } catch (error) {
      console.error('[PromptLabHandler] Delete prompt failed:', error);
      this.send('error', { operation: 'deletePrompt', message: error instanceof Error ? error.message : 'Failed to delete prompt' });
    }
  }

  /**
   * Rename a saved prompt
   */
  private async handleRenamePrompt(promptId: string, name: string): Promise<void> {
    const savedPromptsStore = this.sharedContext.savedPromptsStore;
    if (!savedPromptsStore) {
      this.send('error', { operation: 'renamePrompt', message: 'Saved prompts store not initialized' });
      return;
    }
    if (!promptId || !name) return;

    try {
      await savedPromptsStore.updatePrompt(promptId, { name });
      await this.handleGetSavedPrompts();
    } catch (error) {
      console.error('[PromptLabHandler] Rename prompt failed:', error);
      this.send('error', { operation: 'renamePrompt', message: error instanceof Error ? error.message : 'Failed to rename prompt' });
    }
  }
}
