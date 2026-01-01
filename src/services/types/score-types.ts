/**
 * Score Types for Co-Pilot V2
 *
 * Enhanced 5-dimension scoring system with:
 * - Specificity (20%) - How concrete and precise
 * - Context (25%) - Background information provided
 * - Intent (25%) - Goal clarity and unambiguity
 * - Actionability (15%) - Can AI act directly
 * - Constraints (15%) - Boundaries and requirements defined
 */

/**
 * Score dimension weights - must total 1.0
 */
export const SCORE_DIMENSION_WEIGHTS = {
  specificity: 0.20,
  context: 0.25,
  intent: 0.25,
  actionability: 0.15,
  constraints: 0.15,
} as const;

export type ScoreDimension = keyof typeof SCORE_DIMENSION_WEIGHTS;

/**
 * Score thresholds for categorization
 */
export const SCORE_THRESHOLDS = {
  EXCELLENT: 8,
  GOOD: 6,
  FAIR: 4,
  POOR: 0,
} as const;

/**
 * Individual dimension score with weight
 */
export interface DimensionScoreV2 {
  /** Score value 0-10 */
  score: number;
  /** Weight for weighted average */
  weight: number;
  /** Short explanation for this dimension */
  feedback?: string;
}

/**
 * Full 5-dimension score breakdown
 */
export interface ScoreBreakdownV2 {
  /** Specificity: How concrete and precise is the request? */
  specificity: DimensionScoreV2;
  /** Context: Does the AI have enough background to help? */
  context: DimensionScoreV2;
  /** Intent: Is the goal clear and unambiguous? */
  intent: DimensionScoreV2;
  /** Actionability: Can the AI act on this directly? */
  actionability: DimensionScoreV2;
  /** Constraints: Are boundaries and requirements defined? */
  constraints: DimensionScoreV2;
  /** Weighted total score 0-10 */
  total: number;
}

/**
 * Score explanation for UI display
 */
export interface ScoreExplanationV2 {
  /** Things the prompt does well (checkmarks) */
  goodPoints: ExplanationPoint[];
  /** Things that could be improved (warnings) */
  missingElements: ExplanationPoint[];
  /** Actionable improvement suggestions */
  suggestions: string[];
}

/**
 * Individual explanation point
 */
export interface ExplanationPoint {
  /** Short label (e.g., "Clear action", "Missing context") */
  label: string;
  /** Longer description if needed */
  description?: string;
  /** Which dimension this relates to */
  dimension?: ScoreDimension;
}

/**
 * Complete scored prompt result
 */
export interface ScoredPromptV2 {
  /** Original prompt text */
  prompt: string;
  /** Full score breakdown */
  breakdown: ScoreBreakdownV2;
  /** Human-readable explanation */
  explanation: ScoreExplanationV2;
  /** Enhanced version of the prompt (optional) */
  enhancedPrompt?: string;
  /** Score of enhanced version */
  enhancedScore?: number;
  /** Timestamp of scoring */
  scoredAt: Date;
  /** Model used for scoring */
  model?: string;
}

/**
 * Dimension metadata for display
 */
export interface DimensionMetadata {
  name: string;
  icon: string;
  description: string;
  weight: number;
  examples: {
    bad: string;
    good: string;
  };
}

/**
 * Metadata for all dimensions
 */
export const DIMENSION_METADATA: Record<ScoreDimension, DimensionMetadata> = {
  specificity: {
    name: 'Specificity',
    icon: '🎯',
    description: 'How concrete and precise is the request?',
    weight: SCORE_DIMENSION_WEIGHTS.specificity,
    examples: {
      bad: 'fix the bug',
      good: 'fix the null pointer in UserAuth.ts line 42',
    },
  },
  context: {
    name: 'Context',
    icon: '📚',
    description: 'Does the AI have enough background to help?',
    weight: SCORE_DIMENSION_WEIGHTS.context,
    examples: {
      bad: 'add a feature',
      good: 'in our React app using Redux, add a logout button',
    },
  },
  intent: {
    name: 'Intent',
    icon: '🎪',
    description: 'Is the goal clear and unambiguous?',
    weight: SCORE_DIMENSION_WEIGHTS.intent,
    examples: {
      bad: 'deal with this code',
      good: 'refactor this function to improve readability',
    },
  },
  actionability: {
    name: 'Actionability',
    icon: '⚡',
    description: 'Can the AI act on this directly?',
    weight: SCORE_DIMENSION_WEIGHTS.actionability,
    examples: {
      bad: 'thoughts on authentication?',
      good: 'implement JWT auth with refresh token rotation',
    },
  },
  constraints: {
    name: 'Constraints',
    icon: '🚧',
    description: 'Are boundaries and requirements defined?',
    weight: SCORE_DIMENSION_WEIGHTS.constraints,
    examples: {
      bad: 'make it better',
      good: 'optimize for <100ms response, no external deps',
    },
  },
};

/**
 * Utility Functions
 */

/**
 * Calculate weighted total from individual scores
 */
export function calculateWeightedTotal(
  scores: Record<ScoreDimension, number>
): number {
  let total = 0;
  for (const [dimension, weight] of Object.entries(SCORE_DIMENSION_WEIGHTS)) {
    total += scores[dimension as ScoreDimension] * weight;
  }
  return Math.round(total * 10) / 10;
}

/**
 * Create a score breakdown from individual scores
 */
export function createScoreBreakdown(
  scores: Record<ScoreDimension, number>,
  feedback?: Partial<Record<ScoreDimension, string>>
): ScoreBreakdownV2 {
  return {
    specificity: {
      score: scores.specificity,
      weight: SCORE_DIMENSION_WEIGHTS.specificity,
      feedback: feedback?.specificity,
    },
    context: {
      score: scores.context,
      weight: SCORE_DIMENSION_WEIGHTS.context,
      feedback: feedback?.context,
    },
    intent: {
      score: scores.intent,
      weight: SCORE_DIMENSION_WEIGHTS.intent,
      feedback: feedback?.intent,
    },
    actionability: {
      score: scores.actionability,
      weight: SCORE_DIMENSION_WEIGHTS.actionability,
      feedback: feedback?.actionability,
    },
    constraints: {
      score: scores.constraints,
      weight: SCORE_DIMENSION_WEIGHTS.constraints,
      feedback: feedback?.constraints,
    },
    total: calculateWeightedTotal(scores),
  };
}

/**
 * Get score category label
 */
export function getScoreCategory(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (score >= SCORE_THRESHOLDS.EXCELLENT) return 'excellent';
  if (score >= SCORE_THRESHOLDS.GOOD) return 'good';
  if (score >= SCORE_THRESHOLDS.FAIR) return 'fair';
  return 'poor';
}

/**
 * Get score color for UI
 */
export function getScoreColor(score: number): string {
  if (score >= SCORE_THRESHOLDS.EXCELLENT) return 'var(--score-excellent, #22c55e)';
  if (score >= SCORE_THRESHOLDS.GOOD) return 'var(--score-good, #84cc16)';
  if (score >= SCORE_THRESHOLDS.FAIR) return 'var(--score-fair, #eab308)';
  return 'var(--score-poor, #ef4444)';
}

/**
 * Get lowest scoring dimension
 */
export function getLowestDimension(breakdown: ScoreBreakdownV2): ScoreDimension {
  const dimensions: ScoreDimension[] = ['specificity', 'context', 'intent', 'actionability', 'constraints'];
  let lowest: ScoreDimension = 'specificity';
  let lowestScore = breakdown.specificity.score;

  for (const dim of dimensions) {
    if (breakdown[dim].score < lowestScore) {
      lowestScore = breakdown[dim].score;
      lowest = dim;
    }
  }

  return lowest;
}

/**
 * Get highest scoring dimension
 */
export function getHighestDimension(breakdown: ScoreBreakdownV2): ScoreDimension {
  const dimensions: ScoreDimension[] = ['specificity', 'context', 'intent', 'actionability', 'constraints'];
  let highest: ScoreDimension = 'specificity';
  let highestScore = breakdown.specificity.score;

  for (const dim of dimensions) {
    if (breakdown[dim].score > highestScore) {
      highestScore = breakdown[dim].score;
      highest = dim;
    }
  }

  return highest;
}

/**
 * Convert legacy 4-dimension score to 5-dimension
 */
export function convertLegacyScore(legacy: {
  clarity: number;
  specificity: number;
  context: number;
  actionability: number;
}): ScoreBreakdownV2 {
  // Map legacy dimensions to new 5-dimension system
  // clarity maps to intent
  // specificity stays
  // context stays
  // actionability stays
  // constraints is derived (average of others minus 1)
  const constraintsScore = Math.max(0,
    Math.round((legacy.clarity + legacy.specificity + legacy.context + legacy.actionability) / 4 - 1)
  );

  return createScoreBreakdown({
    specificity: legacy.specificity,
    context: legacy.context,
    intent: legacy.clarity,
    actionability: legacy.actionability,
    constraints: constraintsScore,
  });
}
