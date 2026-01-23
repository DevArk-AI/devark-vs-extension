/**
 * Score Explainer
 *
 * Generates human-readable explanations for prompt scores.
 * Analyzes prompts for good points and missing elements.
 * Provides actionable suggestions for improvement.
 */

import {
  ScoreBreakdownV2,
  ScoreExplanationV2,
  ExplanationPoint,
  ScoreDimension,
  DIMENSION_METADATA,
  SCORE_THRESHOLDS,
  getLowestDimension,
} from '../services/types/score-types';
import { SlashCommandInfo } from '../core/session/prompt-utils';

/**
 * Vague words that indicate low specificity
 */
const VAGUE_WORDS = [
  'something', 'stuff', 'thing', 'things', 'somehow',
  'maybe', 'perhaps', 'probably', 'kind of', 'sort of',
  'whatever', 'etc', 'and so on', 'similar',
  'good', 'better', 'best', 'nice', 'cool',
  'fix it', 'make it work', 'deal with',
];

/**
 * Action words that indicate clear intent
 */
const ACTION_WORDS = [
  'create', 'add', 'implement', 'build', 'develop',
  'fix', 'debug', 'resolve', 'repair',
  'update', 'modify', 'change', 'edit', 'refactor',
  'remove', 'delete', 'clean', 'optimize',
  'test', 'validate', 'verify', 'check',
  'explain', 'describe', 'document', 'clarify',
];

/**
 * Tech context indicators
 */
const TECH_INDICATORS = [
  'react', 'vue', 'angular', 'svelte',
  'typescript', 'javascript', 'python', 'rust', 'go',
  'api', 'database', 'sql', 'graphql', 'rest',
  'component', 'function', 'class', 'module',
  'file', 'directory', 'path', 'line',
  'error', 'bug', 'exception', 'issue',
];

/**
 * Constraint indicators
 */
const CONSTRAINT_INDICATORS = [
  'must', 'should', 'need to', 'has to', 'require',
  'without', 'no ', 'don\'t', 'avoid', 'except',
  'limit', 'max', 'min', 'only', 'exactly',
  'before', 'after', 'within', 'under',
  'compatible', 'support', 'work with',
];

/**
 * Common slash command patterns - prompts that could be replaced with slash commands
 */
const SLASH_COMMAND_PATTERNS: Array<{ pattern: RegExp; command: string; description: string }> = [
  { pattern: /^(?:please\s+)?(?:make\s+a\s+)?commit/i, command: '/commit', description: 'commit changes' },
  { pattern: /^(?:please\s+)?review\s+(?:the\s+)?(?:pr|pull\s*request)/i, command: '/review-pr', description: 'review pull requests' },
  { pattern: /^(?:please\s+)?(?:run\s+)?(?:the\s+)?tests?/i, command: '/test', description: 'run tests' },
  { pattern: /^(?:please\s+)?(?:create|make)\s+(?:a\s+)?(?:pr|pull\s*request)/i, command: '/pr', description: 'create pull requests' },
  { pattern: /^(?:please\s+)?(?:help|assist)/i, command: '/help', description: 'get help' },
];

/**
 * ScoreExplainer - Generates explanations for prompt scores
 */
export class ScoreExplainer {
  /**
   * Generate a full explanation for a scored prompt
   */
  public generateExplanation(
    prompt: string,
    breakdown: ScoreBreakdownV2
  ): ScoreExplanationV2 {
    const goodPoints = this.analyzeGoodPoints(prompt, breakdown);
    const missingElements = this.analyzeMissingElements(prompt, breakdown);
    const suggestions = this.generateSuggestions(prompt, breakdown, missingElements);

    return {
      goodPoints,
      missingElements,
      suggestions,
    };
  }

  /**
   * Analyze what the prompt does well
   */
  private analyzeGoodPoints(
    prompt: string,
    breakdown: ScoreBreakdownV2
  ): ExplanationPoint[] {
    const goodPoints: ExplanationPoint[] = [];
    const lowerPrompt = prompt.toLowerCase();

    // Check each dimension for good scores
    if (breakdown.specificity.score >= SCORE_THRESHOLDS.GOOD) {
      const hasFileRef = /\b(file|\.ts|\.js|\.py|\.tsx|\.jsx)\b/i.test(prompt);
      const hasLineRef = /line\s*\d+/i.test(prompt);

      if (hasFileRef || hasLineRef) {
        goodPoints.push({
          label: 'Specific location',
          description: 'References specific files or locations',
          dimension: 'specificity',
        });
      } else {
        goodPoints.push({
          label: 'Good detail level',
          dimension: 'specificity',
        });
      }
    }

    if (breakdown.context.score >= SCORE_THRESHOLDS.GOOD) {
      const hasTechContext = TECH_INDICATORS.some(t => lowerPrompt.includes(t));

      if (hasTechContext) {
        goodPoints.push({
          label: 'Tech context provided',
          description: 'Includes relevant technical background',
          dimension: 'context',
        });
      } else if (prompt.length > 100) {
        goodPoints.push({
          label: 'Rich context',
          description: 'Provides helpful background information',
          dimension: 'context',
        });
      }
    }

    if (breakdown.intent.score >= SCORE_THRESHOLDS.GOOD) {
      const hasAction = ACTION_WORDS.some(a => lowerPrompt.includes(a));

      if (hasAction) {
        goodPoints.push({
          label: 'Clear action',
          description: 'States what needs to be done',
          dimension: 'intent',
        });
      }
    }

    if (breakdown.actionability.score >= SCORE_THRESHOLDS.GOOD) {
      goodPoints.push({
        label: 'Actionable request',
        description: 'AI can act on this directly',
        dimension: 'actionability',
      });
    }

    if (breakdown.constraints.score >= SCORE_THRESHOLDS.GOOD) {
      const hasConstraints = CONSTRAINT_INDICATORS.some(c => lowerPrompt.includes(c));

      if (hasConstraints) {
        goodPoints.push({
          label: 'Clear boundaries',
          description: 'Defines requirements and constraints',
          dimension: 'constraints',
        });
      }
    }

    // Check for session context building
    if (prompt.includes('previous') || prompt.includes('earlier') ||
        prompt.includes('we discussed') || prompt.includes('from before')) {
      goodPoints.push({
        label: 'Builds on session',
        description: 'References previous context',
      });
    }

    return goodPoints;
  }

  /**
   * Analyze what's missing from the prompt
   */
  private analyzeMissingElements(
    prompt: string,
    breakdown: ScoreBreakdownV2
  ): ExplanationPoint[] {
    const missing: ExplanationPoint[] = [];
    const lowerPrompt = prompt.toLowerCase();

    // Check for low specificity
    if (breakdown.specificity.score < SCORE_THRESHOLDS.GOOD) {
      const hasVague = VAGUE_WORDS.some(v => lowerPrompt.includes(v));
      const isShort = prompt.length < 30;

      if (hasVague) {
        missing.push({
          label: 'Vague terms used',
          description: 'Replace vague words with specific details',
          dimension: 'specificity',
        });
      } else if (isShort) {
        missing.push({
          label: 'Too brief',
          description: 'Add more specific details',
          dimension: 'specificity',
        });
      } else {
        missing.push({
          label: 'Needs more specifics',
          dimension: 'specificity',
        });
      }
    }

    // Check for low context
    if (breakdown.context.score < SCORE_THRESHOLDS.GOOD) {
      const hasTechContext = TECH_INDICATORS.some(t => lowerPrompt.includes(t));

      if (!hasTechContext) {
        missing.push({
          label: 'Missing tech context',
          description: 'What framework/language/environment?',
          dimension: 'context',
        });
      } else {
        missing.push({
          label: 'Need more background',
          description: 'Add relevant project context',
          dimension: 'context',
        });
      }
    }

    // Check for low intent clarity
    if (breakdown.intent.score < SCORE_THRESHOLDS.GOOD) {
      const hasAction = ACTION_WORDS.some(a => lowerPrompt.includes(a));
      const hasQuestion = prompt.includes('?');

      if (!hasAction && !hasQuestion) {
        missing.push({
          label: 'Unclear goal',
          description: 'What do you want to achieve?',
          dimension: 'intent',
        });
      } else {
        missing.push({
          label: 'Ambiguous intent',
          description: 'Be more specific about the outcome',
          dimension: 'intent',
        });
      }
    }

    // Check for low actionability
    if (breakdown.actionability.score < SCORE_THRESHOLDS.GOOD) {
      const isTooAbstract = /\b(think|consider|thoughts|opinion|ideas)\b/i.test(prompt);

      if (isTooAbstract) {
        missing.push({
          label: 'Too abstract',
          description: 'Request concrete output',
          dimension: 'actionability',
        });
      } else {
        missing.push({
          label: 'Hard to act on',
          description: 'What should the AI produce?',
          dimension: 'actionability',
        });
      }
    }

    // Check for low constraints
    if (breakdown.constraints.score < SCORE_THRESHOLDS.GOOD) {
      const hasConstraints = CONSTRAINT_INDICATORS.some(c => lowerPrompt.includes(c));

      if (!hasConstraints) {
        missing.push({
          label: 'No constraints defined',
          description: 'What limitations or requirements?',
          dimension: 'constraints',
        });
      }
    }

    return missing;
  }

  /**
   * Generate actionable suggestions for improvement
   */
  private generateSuggestions(
    prompt: string,
    breakdown: ScoreBreakdownV2,
    missing: ExplanationPoint[]
  ): string[] {
    const suggestions: string[] = [];
    const lowestDim = getLowestDimension(breakdown);

    // Check if a slash command could be used instead
    const slashSuggestion = this.getSlashCommandSuggestion(prompt);
    if (slashSuggestion) {
      suggestions.push(slashSuggestion);
    }

    // Primary suggestion based on lowest dimension
    if (breakdown[lowestDim].score < SCORE_THRESHOLDS.GOOD) {
      suggestions.push(this.getSuggestionForDimension(lowestDim, prompt));
    }

    // Secondary suggestions based on missing elements
    for (const element of missing.slice(0, 2)) {
      if (element.dimension && element.dimension !== lowestDim) {
        const suggestion = this.getSuggestionForDimension(element.dimension, prompt);
        if (!suggestions.includes(suggestion)) {
          suggestions.push(suggestion);
        }
      }
    }

    // Add a general improvement suggestion if we don't have enough
    if (suggestions.length < 2 && breakdown.total < SCORE_THRESHOLDS.EXCELLENT) {
      if (prompt.length < 50) {
        suggestions.push('Add more detail about what you want to achieve');
      } else if (!prompt.includes('?') && !ACTION_WORDS.some(a => prompt.toLowerCase().includes(a))) {
        suggestions.push('Start with a clear action verb (create, fix, update, etc.)');
      }
    }

    // Limit to 3 suggestions
    return suggestions.slice(0, 3);
  }

  /**
   * Check if a prompt could benefit from using a slash command instead.
   * Returns a suggestion string if applicable, undefined otherwise.
   */
  private getSlashCommandSuggestion(prompt: string): string | undefined {
    const trimmed = prompt.trim();

    // Skip if prompt is too long (likely has more context than a simple command)
    if (trimmed.length > 100) {
      return undefined;
    }

    for (const { pattern, command, description } of SLASH_COMMAND_PATTERNS) {
      if (pattern.test(trimmed)) {
        return `Use "${command}" slash command for ${description} - it's faster and more reliable`;
      }
    }

    return undefined;
  }

  /**
   * Get a specific suggestion for a dimension
   */
  private getSuggestionForDimension(dimension: ScoreDimension, prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();

    switch (dimension) {
      case 'specificity':
        if (prompt.length < 30) {
          return 'Add specific file names, function names, or line numbers';
        }
        if (VAGUE_WORDS.some(v => lowerPrompt.includes(v))) {
          return 'Replace vague terms with concrete details';
        }
        return 'Be more specific about what exactly needs to change';

      case 'context':
        if (!TECH_INDICATORS.some(t => lowerPrompt.includes(t))) {
          return 'Mention the technology stack or framework you\'re using';
        }
        return 'Add relevant background about your project structure';

      case 'intent':
        if (!ACTION_WORDS.some(a => lowerPrompt.includes(a))) {
          return 'Start with a clear action verb (create, fix, refactor, etc.)';
        }
        return 'Clarify what specific outcome you want';

      case 'actionability':
        if (/\b(think|consider|thoughts)\b/i.test(prompt)) {
          return 'Request specific output (code, explanation, steps) instead of opinions';
        }
        return 'Describe what the AI should produce or change';

      case 'constraints':
        return 'Add requirements like performance limits, compatibility needs, or things to avoid';

      default:
        return 'Add more detail to improve this prompt';
    }
  }

  /**
   * Generate a quick one-line summary
   */
  public generateQuickSummary(breakdown: ScoreBreakdownV2): string {
    const total = breakdown.total;
    const lowest = getLowestDimension(breakdown);
    const lowestMeta = DIMENSION_METADATA[lowest];

    if (total >= SCORE_THRESHOLDS.EXCELLENT) {
      return 'Excellent prompt! Clear, specific, and actionable.';
    }

    if (total >= SCORE_THRESHOLDS.GOOD) {
      return `Good prompt. Consider improving ${lowestMeta.name.toLowerCase()} for better results.`;
    }

    if (total >= SCORE_THRESHOLDS.FAIR) {
      return `Could be clearer. Focus on adding more ${lowestMeta.name.toLowerCase()}.`;
    }

    return `Needs improvement. Add more ${lowestMeta.name.toLowerCase()} and detail.`;
  }

  /**
   * Generate explanation for slash commands.
   * Slash commands are power-user shortcuts that expand into full prompts,
   * so they deserve positive explanations instead of penalties.
   *
   * @param slashInfo - Information about the detected slash command
   * @param breakdown - Score breakdown (used for potential future enhancements)
   */
  public generateSlashCommandExplanation(
    slashInfo: SlashCommandInfo,
    breakdown: ScoreBreakdownV2
  ): ScoreExplanationV2 {
    const goodPoints: ExplanationPoint[] = [
      {
        label: 'Power-user shortcut',
        description: 'Slash commands are efficient shortcuts that expand into full prompts',
        dimension: 'actionability',
      },
      {
        label: 'Clear intent',
        description: `Command "/${slashInfo.commandName}" explicitly states the action`,
        dimension: 'intent',
      },
      {
        label: 'Actionable command',
        description: 'AI agents can execute this directly',
        dimension: 'actionability',
      },
    ];

    // Add extra good point if arguments are provided (correlates with higher specificity score)
    if (slashInfo.arguments && breakdown.specificity.score >= 9) {
      goodPoints.push({
        label: 'Context provided',
        description: `Arguments "${slashInfo.arguments}" add specificity`,
        dimension: 'specificity',
      });
    }

    return {
      goodPoints,
      missingElements: [],
      suggestions: ['Using slash commands is a best practice - they are faster and more reliable than natural language prompts'],
    };
  }
}

/**
 * Singleton instance
 */
let explainerInstance: ScoreExplainer | null = null;

/**
 * Get score explainer singleton
 */
export function getScoreExplainer(): ScoreExplainer {
  if (!explainerInstance) {
    explainerInstance = new ScoreExplainer();
  }
  return explainerInstance;
}
