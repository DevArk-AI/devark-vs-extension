/**
 * Shared utility for gathering prompt context
 * Used by both Prompt Lab (V2MessageHandler) and auto-captured prompts (HookBasedPromptService)
 *
 * Context sources (3-tier model):
 * - Tier 1: Project CLAUDE.md (tech stack, project summary)
 * - Tier 2: package.json dependencies (tech stack mapping)
 * - Tier 3: Open editor context (relevance-gated)
 * - Tier 4: Session correspondence (first/last interactions)
 * - Existing: Prompt text analysis + SmartSnippetService
 */

import * as path from 'path';
import { getContextExtractor } from './ContextExtractor';
import { getWorkspaceContextService } from './WorkspaceContextService';
import { getSessionManager } from './SessionManagerService';
import type { PromptContext, InteractionContext } from '../copilot/base-copilot-tool';

/**
 * Timeout for context gathering in milliseconds.
 * Set to 2000ms to allow sufficient time for:
 * - Tech stack detection from workspace (CLAUDE.md, package.json)
 * - Code snippet extraction from open files
 * - Goal and session history lookup
 * - Slow filesystems or large projects
 */
export const CONTEXT_GATHERING_TIMEOUT_MS = 2000;

/** Max characters for prompt text in interaction context */
const MAX_PROMPT_LENGTH = 400;
/** Max characters for response text in interaction context */
const MAX_RESPONSE_LENGTH = 600;
/** Number of interactions to capture from session start (objective context) */
const FIRST_INTERACTIONS_COUNT = 3;
/** Number of interactions to capture from recent history (continuity context) */
const LAST_INTERACTIONS_COUNT = 3;

/**
 * Get the first N interactions from the current session (session start context)
 * Prompts are stored newest-first, so we need to get from the end of the array.
 */
function getFirstInteractions(count: number): InteractionContext[] {
  try {
    const sessionManager = getSessionManager();
    const session = sessionManager.getActiveSession();
    if (!session || session.prompts.length === 0) return [];

    // Prompts stored newest-first, get from end for earliest prompts
    const firstPrompts = session.prompts.slice(-count).reverse();
    const responses = session.responses || [];

    return firstPrompts
      .filter((p) => p && p.text && p.text.trim().length > 0) // Skip empty prompts
      .map((p) => {
        const response = responses.find((r) => r.promptId === p.id);
        return {
          prompt: p.text.slice(0, MAX_PROMPT_LENGTH),
          response: response?.text?.slice(0, MAX_RESPONSE_LENGTH),
          filesModified: response?.filesModified,
        };
      });
  } catch (error) {
    console.warn('[context-utils] Failed to get first interactions:', error);
    return [];
  }
}

/**
 * Get the last N interactions from the current session (recent continuity)
 * Uses SessionManager.getLastInteractions which returns most recent prompts.
 */
function getLastInteractions(count: number): InteractionContext[] {
  try {
    const sessionManager = getSessionManager();
    const interactions = sessionManager.getLastInteractions(count);

    return interactions
      .filter((i) => i && i.prompt && i.prompt.text && i.prompt.text.trim().length > 0)
      .map((i) => ({
        prompt: i.prompt.text.slice(0, MAX_PROMPT_LENGTH),
        response: i.response?.text?.slice(0, MAX_RESPONSE_LENGTH),
        filesModified: i.response?.filesModified,
      }));
  } catch (error) {
    console.warn('[context-utils] Failed to get last interactions:', error);
    return [];
  }
}

/**
 * Gather context for prompt analysis.
 * Uses buildImprovementContext() with timeout for graceful degradation.
 *
 * @param promptText - The prompt text to gather context for
 * @param logPrefix - Prefix for console logs (e.g., '[V2MessageHandler]')
 * @returns PromptContext if successful, undefined if timeout or error
 */
export async function gatherPromptContext(
  promptText: string,
  logPrefix: string = '[ContextUtils]'
): Promise<PromptContext | undefined> {
  try {
    const startTime = Date.now();
    const contextExtractor = getContextExtractor();
    const workspaceContextService = getWorkspaceContextService();

    // Gather context from multiple sources in parallel
    const [improvementContext, workspaceContext] = await Promise.race([
      Promise.all([
        contextExtractor.buildImprovementContext(promptText),
        workspaceContextService.getContext(promptText),
      ]),
      new Promise<[null, null]>((resolve) =>
        setTimeout(() => resolve([null, null]), CONTEXT_GATHERING_TIMEOUT_MS)
      ),
    ]);

    if (!improvementContext) {
      console.log(`${logPrefix} Context gathering timed out after ${CONTEXT_GATHERING_TIMEOUT_MS}ms`);
      return undefined;
    }

    // Merge tech stack from all sources (deduplicated)
    const mergedTechStack = [
      ...new Set([
        ...(improvementContext.technical.techStack || []),
        ...(workspaceContext?.techStack || []),
      ]),
    ];

    // Build snippets array from prompt-based extraction
    const snippets = improvementContext.technical.codeSnippets.map((s) => ({
      entityName: s.entityName,
      filePath: s.filePath,
      relevantCode: s.relevantCode,
    }));

    // Track seen file paths for deduplication
    const seenPaths = new Set(snippets.map((s) => path.normalize(s.filePath)));
    const seenEntities = new Set(snippets.map((s) => s.entityName.toLowerCase()));

    // Add workspace snippets from all open tabs (up to 3, already sorted by score)
    if (workspaceContext?.relevantSnippets?.length) {
      for (const wsSnippet of workspaceContext.relevantSnippets) {
        const normalizedPath = path.normalize(wsSnippet.filePath);
        const entityLower = wsSnippet.entityName.toLowerCase();

        // Skip duplicates
        if (seenPaths.has(normalizedPath) || seenEntities.has(entityLower)) {
          continue;
        }

        // Add high confidence snippets, or low confidence if we have few snippets
        if (wsSnippet.confidence === 'high' || snippets.length < 3) {
          snippets.push({
            entityName: wsSnippet.entityName,
            filePath: wsSnippet.filePath,
            relevantCode: wsSnippet.relevantCode,
          });
          seenPaths.add(normalizedPath);
          seenEntities.add(entityLower);
        }

        // Cap total snippets at 6 (3 from SmartSnippet + 3 from open tabs)
        if (snippets.length >= 6) {
          break;
        }
      }
    }

    // Get session correspondence (first N + last N interactions)
    const firstInteractions = getFirstInteractions(FIRST_INTERACTIONS_COUNT);
    const lastInteractions = getLastInteractions(LAST_INTERACTIONS_COUNT);

    const result: PromptContext = {
      techStack: mergedTechStack,
      goal: improvementContext.goal.text,
      recentTopics: improvementContext.recentHistory.alreadyAskedAbout,
      sessionDuration: improvementContext.recentHistory.sessionDuration,
      codeSnippets: snippets,
      firstInteractions,
      lastInteractions,
    };

    console.log(`${logPrefix} Context gathered in ${Date.now() - startTime}ms:`, {
      techStack: result.techStack?.length || 0,
      techStackSources: {
        prompt: improvementContext.technical.techStack?.length || 0,
        workspace: workspaceContext?.techStack?.length || 0,
      },
      hasGoal: !!result.goal,
      snippets: result.codeSnippets?.length || 0,
      snippetSources: {
        fromPromptEntities: improvementContext.technical.codeSnippets?.length || 0,
        fromOpenTabs: workspaceContext?.relevantSnippets?.length || 0,
      },
      firstInteractions: firstInteractions.length,
      lastInteractions: lastInteractions.length,
    });

    return result;
  } catch (error) {
    console.warn(`${logPrefix} Context gathering failed:`, error);
    return undefined;
  }
}
