/**
 * ContextWeightCalculator Unit Tests
 *
 * Tests for dynamic context weight calculation including:
 * - Default weights
 * - Weight adjustments based on context
 * - Normalization
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  ContextWeightCalculator,
  getContextWeightCalculator,
} from '../ContextWeightCalculator';
import { ContextWeightInput } from '../types/context-types';

describe('ContextWeightCalculator', () => {
  let calculator: ContextWeightCalculator;

  beforeEach(() => {
    // Reset singleton for each test
    (ContextWeightCalculator as any).instance = null;
    calculator = getContextWeightCalculator();
  });

  describe('calculateWeights', () => {
    test('should return balanced weights for default input', () => {
      const input: ContextWeightInput = {
        hasGoal: true,
        promptCount: 5,
        hasTechStack: true,
      };

      const weights = calculator.calculateWeights(input);

      // Should be roughly balanced (33/33/34)
      expect(weights.goal).toBeCloseTo(0.33, 1);
      expect(weights.history).toBeCloseTo(0.33, 1);
      expect(weights.technical).toBeCloseTo(0.34, 1);

      // Total should be 1.0
      expect(weights.goal + weights.history + weights.technical).toBeCloseTo(1.0, 5);
    });

    test('should redistribute weights when no goal is set', () => {
      const input: ContextWeightInput = {
        hasGoal: false,
        promptCount: 5,
        hasTechStack: true,
      };

      const weights = calculator.calculateWeights(input);

      expect(weights.goal).toBe(0);
      expect(weights.history).toBeCloseTo(0.5, 1);
      expect(weights.technical).toBeCloseTo(0.5, 1);
      expect(weights.goal + weights.history + weights.technical).toBeCloseTo(1.0, 5);
    });

    test('should boost technical weight for first prompt', () => {
      const input: ContextWeightInput = {
        hasGoal: true,
        promptCount: 0,
        hasTechStack: true,
      };

      const weights = calculator.calculateWeights(input);

      expect(weights.goal).toBeCloseTo(0.33, 1);
      expect(weights.history).toBe(0);
      expect(weights.technical).toBeCloseTo(0.67, 1);
      expect(weights.goal + weights.history + weights.technical).toBeCloseTo(1.0, 5);
    });

    test('should set technical to 100% for first prompt without goal', () => {
      const input: ContextWeightInput = {
        hasGoal: false,
        promptCount: 0,
        hasTechStack: true,
      };

      const weights = calculator.calculateWeights(input);

      expect(weights.goal).toBe(0);
      expect(weights.history).toBe(0);
      expect(weights.technical).toBe(1.0);
    });

    test('should boost history weight for repeated topic', () => {
      const input: ContextWeightInput = {
        hasGoal: true,
        promptCount: 5,
        hasTechStack: true,
        repeatedTopic: 'authentication',
      };

      const weights = calculator.calculateWeights(input);

      // History should be boosted
      expect(weights.history).toBeGreaterThanOrEqual(0.4);
      expect(weights.goal + weights.history + weights.technical).toBeCloseTo(1.0, 5);
    });

    test('should reduce technical weight when no tech stack detected', () => {
      const inputWithTech: ContextWeightInput = {
        hasGoal: true,
        promptCount: 5,
        hasTechStack: true,
      };

      const inputWithoutTech: ContextWeightInput = {
        hasGoal: true,
        promptCount: 5,
        hasTechStack: false,
      };

      const weightsWithTech = calculator.calculateWeights(inputWithTech);
      const weightsWithoutTech = calculator.calculateWeights(inputWithoutTech);

      expect(weightsWithoutTech.technical).toBeLessThan(weightsWithTech.technical);
      expect(weightsWithoutTech.goal + weightsWithoutTech.history + weightsWithoutTech.technical).toBeCloseTo(1.0, 5);
    });

    test('should handle repeated topic with no goal', () => {
      const input: ContextWeightInput = {
        hasGoal: false,
        promptCount: 5,
        hasTechStack: true,
        repeatedTopic: 'debugging',
      };

      const weights = calculator.calculateWeights(input);

      expect(weights.goal).toBe(0);
      expect(weights.history).toBeGreaterThan(0.3);
      expect(weights.technical).toBeGreaterThan(0);
      expect(weights.goal + weights.history + weights.technical).toBeCloseTo(1.0, 5);
    });
  });

  describe('explainWeights', () => {
    test('should explain first prompt scenario', () => {
      const input: ContextWeightInput = {
        hasGoal: true,
        promptCount: 0,
        hasTechStack: true,
      };
      const weights = calculator.calculateWeights(input);

      const explanation = calculator.explainWeights(input, weights);

      expect(explanation).toContain('First prompt');
      expect(explanation).toContain('technical');
    });

    test('should explain no goal scenario', () => {
      const input: ContextWeightInput = {
        hasGoal: false,
        promptCount: 5,
        hasTechStack: true,
      };
      const weights = calculator.calculateWeights(input);

      const explanation = calculator.explainWeights(input, weights);

      expect(explanation).toContain('No goal');
    });

    test('should explain repeated topic scenario', () => {
      const input: ContextWeightInput = {
        hasGoal: true,
        promptCount: 5,
        hasTechStack: true,
        repeatedTopic: 'authentication',
      };
      const weights = calculator.calculateWeights(input);

      const explanation = calculator.explainWeights(input, weights);

      expect(explanation).toContain('authentication');
      expect(explanation).toContain('repeated');
    });

    test('should include weight percentages', () => {
      const input: ContextWeightInput = {
        hasGoal: true,
        promptCount: 5,
        hasTechStack: true,
      };
      const weights = calculator.calculateWeights(input);

      const explanation = calculator.explainWeights(input, weights);

      expect(explanation).toContain('%');
      expect(explanation).toContain('goal=');
      expect(explanation).toContain('history=');
      expect(explanation).toContain('tech=');
    });
  });

  describe('getDominantContext', () => {
    test('should identify goal as dominant', () => {
      const weights = { goal: 0.5, history: 0.25, technical: 0.25 };

      const dominant = calculator.getDominantContext(weights);

      expect(dominant).toBe('goal');
    });

    test('should identify history as dominant', () => {
      const weights = { goal: 0.2, history: 0.5, technical: 0.3 };

      const dominant = calculator.getDominantContext(weights);

      expect(dominant).toBe('history');
    });

    test('should identify technical as dominant', () => {
      const weights = { goal: 0.2, history: 0.2, technical: 0.6 };

      const dominant = calculator.getDominantContext(weights);

      expect(dominant).toBe('technical');
    });

    test('should handle ties by preferring goal', () => {
      const weights = { goal: 0.4, history: 0.4, technical: 0.2 };

      const dominant = calculator.getDominantContext(weights);

      expect(dominant).toBe('goal');
    });
  });

  describe('isBalanced', () => {
    test('should return true for balanced weights', () => {
      const weights = { goal: 0.33, history: 0.33, technical: 0.34 };

      const isBalanced = calculator.isBalanced(weights);

      expect(isBalanced).toBe(true);
    });

    test('should return false for unbalanced weights', () => {
      const weights = { goal: 0.6, history: 0.2, technical: 0.2 };

      const isBalanced = calculator.isBalanced(weights);

      expect(isBalanced).toBe(false);
    });

    test('should return true when one weight is zero', () => {
      const weights = { goal: 0.5, history: 0, technical: 0.5 };

      const isBalanced = calculator.isBalanced(weights);

      expect(isBalanced).toBe(true);
    });
  });

  describe('singleton pattern', () => {
    test('should return same instance', () => {
      const instance1 = getContextWeightCalculator();
      const instance2 = getContextWeightCalculator();

      expect(instance1).toBe(instance2);
    });
  });
});
