/**
 * Goal Progress Analyzer
 *
 * LLM-powered tool to infer goal completion progress from session data.
 * Analyzes the first user prompt (intent/goal) against AI responses
 * to estimate how much of the original goal has been accomplished.
 *
 * Used by the Activity Rings UI to show meaningful goal progress.
 */

import { BaseCopilotTool, ProgressCallback, PromptContext } from './base-copilot-tool';
import { ILLMProvider } from '../llm/interfaces';
import type { Session, PromptRecord, ResponseRecord } from '../services/types/session-types';

/**
 * Input for goal progress analysis
 */
export interface GoalProgressInput {
  /** The session to analyze */
  session: Session;
  /** Optional explicit goal (if not set on session) */
  explicitGoal?: string;
}

/**
 * Output from goal progress analysis
 */
export interface GoalProgressOutput {
  /** Progress percentage 0-100 */
  progress: number;
  /** Brief reasoning for the progress estimate */
  reasoning: string;
  /** Inferred goal if none was set */
  inferredGoal?: string;
  /** Short descriptive title for the session (3-6 words) */
  sessionTitle?: string;
  /** Key accomplishments detected */
  accomplishments?: string[];
  /** Remaining work detected */
  remaining?: string[];
}

/**
 * Truncated interaction for LLM prompt building
 */
interface TruncatedInteraction {
  promptText: string;
  responsePreview: string;
  filesModified: string[];
  outcome: string;
  completionSignals: string[];
}

/**
 * GoalProgressAnalyzer - Infers goal completion progress from session data
 */
export class GoalProgressAnalyzer extends BaseCopilotTool<GoalProgressInput, GoalProgressOutput> {
  private static readonly MAX_PROMPT_LENGTH = 500;
  private static readonly MAX_RESPONSE_PREVIEW = 300;
  private static readonly MAX_INTERACTIONS = 8;

  constructor(provider: ILLMProvider) {
    super(provider);
  }

  protected getToolName(): string {
    return 'GoalProgressAnalyzer';
  }

  /**
   * Analyze goal progress for a session
   */
  public async analyzeProgress(
    session: Session,
    explicitGoal?: string,
    onProgress?: ProgressCallback
  ): Promise<GoalProgressOutput> {
    // Handle empty sessions
    if (session.promptCount === 0 || session.prompts.length === 0) {
      return {
        progress: 0,
        reasoning: 'Session has no prompts yet.',
      };
    }

    return this.execute({ session, explicitGoal }, onProgress);
  }

  protected validateInput(input: GoalProgressInput): void {
    if (!input.session) {
      throw new Error('GoalProgressAnalyzer: Session is required');
    }
  }

  protected buildPrompt(input: GoalProgressInput, _context?: PromptContext): string {
    const { session, explicitGoal } = input;
    const goal = explicitGoal || session.goal;

    // Get first prompt as the original intent
    const firstPrompt = session.prompts[0];
    const firstPromptText = this.truncateText(firstPrompt.text, GoalProgressAnalyzer.MAX_PROMPT_LENGTH);

    // Build interaction summaries
    const interactions = this.buildInteractionSummaries(session);

    // Build the prompt
    return `Analyze the progress of this coding session toward its goal.

## Session Goal
${goal ? `Explicit goal: "${goal}"` : 'No explicit goal set. Infer the goal from the first prompt.'}

## First Prompt (Original Intent)
"${firstPromptText}"

## Session Activity (${session.promptCount} total prompts, showing key interactions)
${this.formatInteractions(interactions)}

## Session Stats
- Duration: ${this.formatDuration(session)}
- Total prompts: ${session.promptCount}
- Active: ${session.isActive ? 'Yes (in progress)' : 'No (completed/idle)'}

## Instructions
Analyze the session and estimate goal completion progress. Consider:
1. What was the original intent/goal?
2. What has been accomplished based on the responses?
3. What remains to be done?
4. Is the task complete, partially complete, or just started?

Also generate a short, descriptive title for this session (3-6 words) that captures what the developer is working on. Examples: "Auth Login Flow", "Fix API Timeout Bug", "Refactor User Service", "Add Dark Mode".

Respond with JSON:
{
  "progress": <number 0-100>,
  "reasoning": "<brief 1-2 sentence explanation>",
  "sessionTitle": "<short 3-6 word title for the session>",
  "inferredGoal": "<goal if none was set, null otherwise>",
  "accomplishments": ["<key accomplishment 1>", ...],
  "remaining": ["<remaining task 1>", ...]
}

## Progress Estimation Guidelines
- 0-20%: Just started, exploring the problem
- 20-50%: Making progress, some work done
- 50-80%: Significant progress, core work complete
- 80-95%: Nearly complete, finishing touches
- 100%: Fully complete, goal achieved

IMPORTANT: When you see "Completion signals" in interactions, use them as evidence:
- git_push: Code pushed to remote - strong completion indicator
- pr_created: Pull request created/merged - task is complete
- tests_passed: All tests passing - quality verified
- build_success: Build completed - code compiles
- committed: Code committed locally

If the LAST interaction shows git_push or pr_created, and the work matches the goal, progress should be 95-100%.

JSON response:`;
  }

  protected parseResponse(response: string): GoalProgressOutput {
    try {
      const parsed = this.parseJSON<GoalProgressOutput>(response);

      // Validate and clamp progress
      const progress = Math.max(0, Math.min(100, Math.round(parsed.progress || 0)));

      return {
        progress,
        reasoning: parsed.reasoning || 'Unable to determine progress.',
        sessionTitle: parsed.sessionTitle || undefined,
        inferredGoal: parsed.inferredGoal || undefined,
        accomplishments: parsed.accomplishments || [],
        remaining: parsed.remaining || [],
      };
    } catch (error) {
      console.error('[GoalProgressAnalyzer] Failed to parse response:', error);
      return this.getFallbackOutput();
    }
  }

  /**
   * Build truncated interaction summaries for the LLM
   */
  private buildInteractionSummaries(session: Session): TruncatedInteraction[] {
    const interactions: TruncatedInteraction[] = [];

    // Always include first interaction
    if (session.prompts.length > 0) {
      interactions.push(this.buildInteraction(session.prompts[0], session.responses));
    }

    // Sample middle interactions if we have many
    const middleCount = Math.min(
      GoalProgressAnalyzer.MAX_INTERACTIONS - 2,
      session.prompts.length - 2
    );

    if (middleCount > 0 && session.prompts.length > 2) {
      const step = Math.floor((session.prompts.length - 2) / middleCount);
      for (let i = 1; i <= middleCount; i++) {
        const idx = Math.min(i * step, session.prompts.length - 2);
        interactions.push(this.buildInteraction(session.prompts[idx], session.responses));
      }
    }

    // Always include last interaction if different from first
    if (session.prompts.length > 1) {
      const lastPrompt = session.prompts[session.prompts.length - 1];
      interactions.push(this.buildInteraction(lastPrompt, session.responses));
    }

    return interactions;
  }

  /**
   * Build a single truncated interaction
   */
  private buildInteraction(
    prompt: PromptRecord,
    responses: ResponseRecord[]
  ): TruncatedInteraction {
    // Find matching response
    const response = responses.find(r => r.promptId === prompt.id);

    return {
      promptText: this.truncateText(prompt.text, GoalProgressAnalyzer.MAX_PROMPT_LENGTH),
      responsePreview: response
        ? this.truncateText(response.text, GoalProgressAnalyzer.MAX_RESPONSE_PREVIEW)
        : '(no response)',
      filesModified: response?.filesModified || [],
      outcome: response?.outcome || 'unknown',
      completionSignals: this.detectCompletionSignals(response),
    };
  }

  /**
   * Detect completion signals from a response
   */
  private detectCompletionSignals(response: ResponseRecord | undefined): string[] {
    if (!response?.text) return [];

    const text = response.text;
    const hasBash = response.toolCalls?.some(t => t.toLowerCase() === 'bash');
    const signals: string[] = [];

    // Git push (requires Bash tool)
    if (hasBash && /git\s+push|pushed\s+to|push.*remote/i.test(text)) {
      signals.push('git_push');
    }
    // PR/MR creation
    if (/pr\s+(created|opened|merged)|pull\s+request\s+(created|opened|merged)/i.test(text)) {
      signals.push('pr_created');
    }
    // Tests passing
    if (/all\s+tests\s+pass|tests\s+passed|test.*complete/i.test(text)) {
      signals.push('tests_passed');
    }
    // Build success
    if (/build\s+(successful|complete)|compiled\s+successfully|no\s+errors/i.test(text)) {
      signals.push('build_success');
    }
    // Commit (requires Bash tool, weaker signal)
    if (hasBash && /git\s+commit|committed/i.test(text)) {
      signals.push('committed');
    }

    return signals;
  }

  /**
   * Format interactions for the prompt
   */
  private formatInteractions(interactions: TruncatedInteraction[]): string {
    if (interactions.length === 0) {
      return '(no interactions recorded)';
    }

    return interactions
      .map((int, idx) => {
        const filesStr = int.filesModified.length > 0
          ? `\n   Files: ${int.filesModified.slice(0, 5).join(', ')}${int.filesModified.length > 5 ? ` (+${int.filesModified.length - 5} more)` : ''}`
          : '';

        const signalsStr = int.completionSignals.length > 0
          ? `\n   Completion signals: ${int.completionSignals.join(', ')}`
          : '';

        return `${idx + 1}. Prompt: "${int.promptText}"
   Response (${int.outcome}): ${int.responsePreview}${filesStr}${signalsStr}`;
      })
      .join('\n\n');
  }

  /**
   * Format session duration
   */
  private formatDuration(session: Session): string {
    const diffMs = session.lastActivityTime.getTime() - session.startTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return '<1 minute';
    if (diffMins < 60) return `${diffMins} minutes`;

    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  /**
   * Truncate text with ellipsis
   */
  private truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    const cleaned = text.trim().replace(/\s+/g, ' ');
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.slice(0, maxLength - 3) + '...';
  }

  /**
   * Fallback output when parsing fails
   */
  private getFallbackOutput(): GoalProgressOutput {
    return {
      progress: 0,
      reasoning: 'Unable to analyze goal progress.',
    };
  }
}
