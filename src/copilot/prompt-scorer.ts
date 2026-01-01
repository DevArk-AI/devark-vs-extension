/**
 * Prompt Scorer
 *
 * Analyzes and scores user prompts for AI interactions.
 * Provides detailed feedback on clarity, specificity, context,
 * and actionability with improvement suggestions.
 *
 * V2 adds 5-dimension scoring with weighted breakdown:
 * - Specificity (20%) - How concrete and precise
 * - Context (25%) - Background information provided
 * - Intent (25%) - Goal clarity (maps from clarity)
 * - Actionability (15%) - Can AI act directly
 * - Constraints (15%) - Boundaries and requirements
 *
 * Now extends BaseCopilotTool for common functionality.
 */

import { BaseCopilotTool, ProgressCallback, PromptContext } from './base-copilot-tool';
import { ILLMProvider } from '../llm/interfaces';
import {
  ScoreBreakdownV2,
  ScoreExplanationV2,
  createScoreBreakdown,
} from '../services/types/score-types';
import { getScoreExplainer } from './score-explainer';

/**
 * Legacy score breakdown for backward compatibility
 */
export interface PromptScore {
  /** Overall score (0-100) - average of individual scores * 10 */
  overall: number;

  /** Clarity score (0-10) - how clear and unambiguous */
  clarity: number;

  /** Specificity score (0-10) - level of detail provided */
  specificity: number;

  /** Context score (0-10) - relevant background information */
  context: number;

  /** Actionability score (0-10) - how easily AI can act on it */
  actionability: number;

  /** List of specific suggestions for improvement */
  suggestions: string[];
}

/**
 * Enhanced V2 score with 5-dimension breakdown
 */
export interface PromptScoreV2 extends PromptScore {
  /** Full 5-dimension breakdown */
  breakdown: ScoreBreakdownV2;

  /** Human-readable explanation */
  explanation: ScoreExplanationV2;

  /** Constraints score (0-10) - NEW in V2 */
  constraints: number;

  /** Intent score (0-10) - maps from clarity */
  intent: number;
}

/**
 * Service for analyzing and scoring AI prompts
 */
export class PromptScorer extends BaseCopilotTool<string, PromptScore> {
  private explainer = getScoreExplainer();

  constructor(provider: ILLMProvider) {
    super(provider);
  }

  /**
   * Score a user prompt and provide feedback (legacy 4-dimension)
   * @deprecated Use scorePromptV2() for full 5-dimension breakdown with explanation.
   * This method is kept for backward compatibility when only basic scoring is needed
   * (e.g., scoring enhanced prompts where breakdown display is not needed).
   * @param context Optional context for more targeted scoring
   */
  public async scorePrompt(userPrompt: string, onProgress?: ProgressCallback, context?: PromptContext): Promise<PromptScore> {
    try {
      // Validate first
      if (!userPrompt || userPrompt.trim().length === 0) {
        return this.getMinimalScore('Prompt is empty or contains only whitespace');
      }

      return await this.execute(userPrompt, onProgress, context);
    } catch (error) {
      console.error('[PromptScorer] Scoring failed:', error);

      // Return fallback score
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.getFallbackScore(userPrompt, errorMessage);
    }
  }

  /**
   * Score a user prompt with full 5-dimension V2 breakdown
   * @param context Optional context for more targeted scoring
   */
  public async scorePromptV2(userPrompt: string, onProgress?: ProgressCallback, context?: PromptContext): Promise<PromptScoreV2> {
    try {
      // Validate first
      if (!userPrompt || userPrompt.trim().length === 0) {
        return this.getMinimalScoreV2('Prompt is empty or contains only whitespace');
      }

      // Get legacy score first
      const legacyScore = await this.execute(userPrompt, onProgress, context);

      // Convert to V2 format with 5 dimensions
      return this.convertToV2Score(userPrompt, legacyScore);
    } catch (error) {
      console.error('[PromptScorer] V2 Scoring failed:', error);

      // Return fallback score
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.getFallbackScoreV2(userPrompt, errorMessage);
    }
  }

  /**
   * Convert legacy score to V2 format
   */
  private convertToV2Score(prompt: string, legacy: PromptScore): PromptScoreV2 {
    // Derive constraints score from other dimensions
    // If prompt is action-oriented with specifics, constraints are likely present
    const constraintsScore = this.estimateConstraintsScore(prompt, legacy);

    // Create 5-dimension breakdown
    const breakdown = createScoreBreakdown({
      specificity: legacy.specificity,
      context: legacy.context,
      intent: legacy.clarity, // clarity maps to intent
      actionability: legacy.actionability,
      constraints: constraintsScore,
    });

    // Generate explanation
    const explanation = this.explainer.generateExplanation(prompt, breakdown);

    return {
      ...legacy,
      intent: legacy.clarity,
      constraints: constraintsScore,
      breakdown,
      explanation,
    };
  }

  /**
   * Estimate constraints score based on prompt analysis
   */
  private estimateConstraintsScore(prompt: string, _legacy: PromptScore): number {

    // Check for explicit constraint indicators
    const hasLimits = /\b(must|should|need|require|limit|max|min|only|exactly|without|no |avoid|don't)\b/i.test(prompt);
    const hasPerformance = /\b(fast|slow|performance|efficient|optimize|ms|seconds|memory)\b/i.test(prompt);
    const hasCompatibility = /\b(compatible|support|work with|version|browser|device)\b/i.test(prompt);
    const hasBoundaries = /\b(before|after|within|under|between|range)\b/i.test(prompt);

    let score = 3; // Base score

    if (hasLimits) score += 2;
    if (hasPerformance) score += 2;
    if (hasCompatibility) score += 1.5;
    if (hasBoundaries) score += 1.5;

    // Bonus for detailed prompts
    if (prompt.length > 100) score += 1;

    // Cap at 10
    return Math.min(10, Math.round(score));
  }

  protected getToolName(): string {
    return 'PromptScorer';
  }

  protected buildPrompt(userPrompt: string, context?: PromptContext): string {
    const systemPrompt = `You are a prompt quality analyzer. Your task is to evaluate AI prompts and provide constructive feedback.

Scoring Criteria:
1. Clarity (0-10): Is the request clear and unambiguous? Are there confusing or vague parts?
2. Specificity (0-10): Is there enough detail? Are requirements well-defined?
3. Context (0-10): Is relevant background information provided? Does the AI have what it needs?
4. Actionability (0-10): Can the AI take concrete action? Is it clear what output is expected?

For each score:
- 0-3: Poor (major issues present)
- 4-6: Adequate (some improvements needed)
- 7-8: Good (minor improvements possible)
- 9-10: Excellent (professional quality)

You MUST respond with valid JSON in this exact format:
{
  "clarity": <number 0-10>,
  "specificity": <number 0-10>,
  "context": <number 0-10>,
  "actionability": <number 0-10>,
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
}

Provide 2-4 specific, actionable suggestions for improvement. Be constructive and helpful.`;

    // Build context hints for more targeted scoring
    let contextHints = '';
    if (context) {
      const hints: string[] = [];
      if (context.techStack?.length) {
        hints.push(`Note: User is working with ${context.techStack.join(', ')}.`);
      }
      if (context.goal) {
        hints.push(`Note: User's current goal is "${context.goal}".`);
      }
      if (context.recentTopics?.length) {
        hints.push(`Note: User has already discussed: ${context.recentTopics.slice(0, 3).join(', ')}.`);
      }

      // Add session correspondence for continuity awareness
      if (context.firstInteractions?.length) {
        const firstEx = context.firstInteractions[0];
        if (firstEx?.prompt) {
          hints.push(`Note: Session started with: "${firstEx.prompt.slice(0, 100)}..."`);
          if (firstEx.response) {
            hints.push(`Initial response addressed: ${firstEx.filesModified?.join(', ') || 'general discussion'}`);
          }
        }
      }

      if (context.lastInteractions?.length) {
        const recentContext = context.lastInteractions
          .filter((i) => i?.prompt)
          .map((i, idx) =>
            `[${idx + 1}] User: "${i.prompt.slice(0, 80)}..." → AI: ${i.response ? `responded (${i.filesModified?.length || 0} files)` : 'no response yet'}`
          ).join('\n');
        if (recentContext) {
          hints.push(`Recent conversation:\n${recentContext}`);
        }
      }

      if (hints.length > 0) {
        contextHints = `\n\nContext for evaluation:\n${hints.join('\n')}`;
      }
    }

    return `${systemPrompt}${contextHints}

Analyze this AI prompt and score it on four criteria (0-10 each):

Prompt to analyze:
"${userPrompt}"

Evaluate the prompt and return your scores in JSON format.`;
  }

  protected parseResponse(content: string): PromptScore {
    const parsed = this.parseJSON<any>(content);

    // Validate required fields
    const clarity = this.validateScore(parsed.clarity, 'clarity');
    const specificity = this.validateScore(parsed.specificity, 'specificity');
    const context = this.validateScore(parsed.context, 'context');
    const actionability = this.validateScore(parsed.actionability, 'actionability');

    // Calculate overall score
    const overall = Math.round(
      ((clarity + specificity + context + actionability) / 4) * 10
    );

    // Validate suggestions
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s: any) => typeof s === 'string')
      : [];

    return {
      overall,
      clarity,
      specificity,
      context,
      actionability,
      suggestions: suggestions.length > 0
        ? suggestions
        : ['Consider adding more specific details to your prompt'],
    };
  }

  /**
   * Validate a score value
   */
  private validateScore(value: any, name: string): number {
    const score = Number(value);

    if (isNaN(score)) {
      throw new Error(`Invalid ${name} score: not a number`);
    }

    if (score < 0 || score > 10) {
      throw new Error(`Invalid ${name} score: must be between 0 and 10`);
    }

    return score;
  }

  /**
   * Generate a minimal score for empty/invalid prompts
   */
  private getMinimalScore(reason: string): PromptScore {
    return {
      overall: 0,
      clarity: 0,
      specificity: 0,
      context: 0,
      actionability: 0,
      suggestions: [reason, 'Please provide a clear, specific prompt'],
    };
  }

  /**
   * Generate a fallback score when AI scoring fails
   */
  private getFallbackScore(userPrompt: string, _error: string): PromptScore {
    // Simple heuristic scoring based on prompt characteristics
    const length = userPrompt.trim().length;
    const hasQuestion = /\?/.test(userPrompt);
    const hasContext = length > 50;
    const hasSpecifics = /\b(file|function|class|component|feature|bug|error|implement|create|add|fix|update|refactor)\b/i.test(userPrompt);

    // Basic scoring heuristics
    const clarity = hasQuestion ? 6 : 5;
    const specificity = hasSpecifics ? 6 : 4;
    const context = hasContext ? 6 : 4;
    const actionability = hasQuestion && hasSpecifics ? 7 : 5;

    const overall = Math.round(((clarity + specificity + context + actionability) / 4) * 10);

    return {
      overall,
      clarity,
      specificity,
      context,
      actionability,
      suggestions: [
        'AI scoring unavailable - using basic heuristics',
        length < 20 ? 'Add more details to your prompt' : '',
        !hasQuestion ? 'Consider phrasing as a clear question or instruction' : '',
        !hasSpecifics ? 'Include specific technical terms or requirements' : '',
        !hasContext ? 'Provide relevant context or background information' : '',
      ].filter(s => s !== ''),
    };
  }

  /**
   * Generate a minimal V2 score for empty/invalid prompts
   */
  private getMinimalScoreV2(reason: string): PromptScoreV2 {
    const breakdown = createScoreBreakdown({
      specificity: 0,
      context: 0,
      intent: 0,
      actionability: 0,
      constraints: 0,
    });

    return {
      overall: 0,
      clarity: 0,
      specificity: 0,
      context: 0,
      actionability: 0,
      intent: 0,
      constraints: 0,
      suggestions: [reason, 'Please provide a clear, specific prompt'],
      breakdown,
      explanation: {
        goodPoints: [],
        missingElements: [{ label: 'Empty prompt', description: reason }],
        suggestions: ['Please provide a clear, specific prompt'],
      },
    };
  }

  /**
   * Generate a fallback V2 score when AI scoring fails
   */
  private getFallbackScoreV2(userPrompt: string, error: string): PromptScoreV2 {
    const legacyScore = this.getFallbackScore(userPrompt, error);
    return this.convertToV2Score(userPrompt, legacyScore);
  }
}
