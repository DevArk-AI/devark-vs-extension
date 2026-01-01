/**
 * ContextWeightCalculator - Dynamic Context Weighting (Workstream A)
 *
 * Responsibilities:
 * - Calculate dynamic weights for context sources
 * - Adjust based on available context
 * - Handle edge cases (no goal, first prompt, repeated topics)
 */

import { ContextWeights, ContextWeightInput } from './types/context-types';

/**
 * Default weights for balanced context
 */
const DEFAULT_WEIGHTS: ContextWeights = {
  goal: 0.33,
  history: 0.33,
  technical: 0.34,
};

/**
 * Weight configurations for different scenarios
 */
const WEIGHT_SCENARIOS = {
  // No goal set - redistribute to history and tech
  noGoal: {
    goal: 0,
    history: 0.50,
    technical: 0.50,
  },
  // First prompt - no history, boost tech
  firstPrompt: {
    goal: 0.33,
    history: 0,
    technical: 0.67,
  },
  // First prompt without goal
  firstPromptNoGoal: {
    goal: 0,
    history: 0,
    technical: 1.0,
  },
  // With repeated topic - boost history for continuity
  repeatedTopic: {
    goal: 0.20,
    history: 0.50,
    technical: 0.30,
  },
} as const;

/**
 * ContextWeightCalculator - Calculate dynamic context weights
 */
export class ContextWeightCalculator {
  private static instance: ContextWeightCalculator | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): ContextWeightCalculator {
    if (!ContextWeightCalculator.instance) {
      ContextWeightCalculator.instance = new ContextWeightCalculator();
    }
    return ContextWeightCalculator.instance;
  }

  /**
   * Calculate dynamic weights based on available context
   *
   * Rules:
   * 1. Base: 33/33/34 (goal/history/technical)
   * 2. No goal set -> redistribute to history (50%) + tech (50%)
   * 3. First prompt -> no history, boost tech (67%)
   * 4. Repeated topic -> boost history for continuity (50%)
   */
  public calculateWeights(input: ContextWeightInput): ContextWeights {
    const { hasGoal, promptCount, hasTechStack, repeatedTopic } = input;

    // Start with default weights
    let weights = { ...DEFAULT_WEIGHTS };

    // First prompt - no history context available
    if (promptCount === 0) {
      if (hasGoal) {
        weights = { ...WEIGHT_SCENARIOS.firstPrompt };
      } else {
        weights = { ...WEIGHT_SCENARIOS.firstPromptNoGoal };
      }
      return this.normalizeWeights(weights);
    }

    // No goal set - redistribute goal weight
    if (!hasGoal) {
      weights = { ...WEIGHT_SCENARIOS.noGoal };
    }

    // Repeated topic - boost history for continuity
    if (repeatedTopic) {
      // Boost history weight
      weights.history = Math.min(0.50, weights.history + 0.15);
      // Normalize others
      const remaining = 1 - weights.history;
      weights.goal = hasGoal ? remaining * 0.4 : 0;
      weights.technical = hasGoal ? remaining * 0.6 : remaining;
    }

    // If no tech stack detected, reduce technical weight
    if (!hasTechStack && weights.technical > 0) {
      const reduction = weights.technical * 0.3;
      weights.technical -= reduction;
      // Redistribute to other non-zero weights
      if (hasGoal) {
        weights.goal += reduction * 0.4;
        weights.history += reduction * 0.6;
      } else {
        weights.history += reduction;
      }
    }

    return this.normalizeWeights(weights);
  }

  /**
   * Get explanation for weight distribution
   */
  public explainWeights(input: ContextWeightInput, weights: ContextWeights): string {
    const parts: string[] = [];

    if (input.promptCount === 0) {
      parts.push('First prompt - prioritizing technical context');
    }

    if (!input.hasGoal) {
      parts.push('No goal set - history and tech weighted higher');
    }

    if (input.repeatedTopic) {
      parts.push(`Topic "${input.repeatedTopic}" repeated - boosting history`);
    }

    if (!input.hasTechStack) {
      parts.push('Limited tech context detected');
    }

    if (parts.length === 0) {
      parts.push('Balanced context weighting');
    }

    parts.push(
      `Weights: goal=${(weights.goal * 100).toFixed(0)}%, ` +
      `history=${(weights.history * 100).toFixed(0)}%, ` +
      `tech=${(weights.technical * 100).toFixed(0)}%`
    );

    return parts.join('. ');
  }

  /**
   * Get the dominant context type
   */
  public getDominantContext(weights: ContextWeights): 'goal' | 'history' | 'technical' {
    if (weights.goal >= weights.history && weights.goal >= weights.technical) {
      return 'goal';
    }
    if (weights.history >= weights.technical) {
      return 'history';
    }
    return 'technical';
  }

  /**
   * Check if weights are balanced (within 15% of each other)
   */
  public isBalanced(weights: ContextWeights): boolean {
    const values = [weights.goal, weights.history, weights.technical].filter(v => v > 0);
    if (values.length < 2) return true;

    const max = Math.max(...values);
    const min = Math.min(...values);
    return (max - min) <= 0.15;
  }

  /**
   * Normalize weights to sum to 1.0
   */
  private normalizeWeights(weights: ContextWeights): ContextWeights {
    const total = weights.goal + weights.history + weights.technical;

    if (total === 0) {
      return { ...DEFAULT_WEIGHTS };
    }

    if (Math.abs(total - 1) < 0.001) {
      return weights;
    }

    return {
      goal: weights.goal / total,
      history: weights.history / total,
      technical: weights.technical / total,
    };
  }
}

/**
 * Get ContextWeightCalculator singleton
 */
export function getContextWeightCalculator(): ContextWeightCalculator {
  return ContextWeightCalculator.getInstance();
}
