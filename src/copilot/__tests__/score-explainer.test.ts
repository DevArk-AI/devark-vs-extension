/**
 * Tests for score-explainer module
 */

import { describe, it, expect } from 'vitest';
import { getScoreExplainer } from '../score-explainer';
import { createScoreBreakdown } from '../../services/types/score-types';

describe('ScoreExplainer', () => {
  const explainer = getScoreExplainer();

  describe('slash command suggestions', () => {
    // Helper to generate explanation and extract suggestions
    const getSuggestions = (prompt: string): string[] => {
      const breakdown = createScoreBreakdown({
        specificity: 5,
        context: 5,
        intent: 5,
        actionability: 5,
        constraints: 5,
      });
      const explanation = explainer.generateExplanation(prompt, breakdown);
      return explanation.suggestions;
    };

    it('should suggest /commit for commit-related prompts', () => {
      const suggestions = getSuggestions('commit my changes');
      expect(suggestions.some(s => s.includes('/commit'))).toBe(true);
    });

    it('should suggest /commit for "please commit" prompts', () => {
      const suggestions = getSuggestions('please commit');
      expect(suggestions.some(s => s.includes('/commit'))).toBe(true);
    });

    it('should suggest /commit for "make a commit" prompts', () => {
      const suggestions = getSuggestions('make a commit');
      expect(suggestions.some(s => s.includes('/commit'))).toBe(true);
    });

    it('should suggest /review-pr for PR review prompts', () => {
      const suggestions = getSuggestions('review the pr');
      expect(suggestions.some(s => s.includes('/review-pr'))).toBe(true);
    });

    it('should suggest /review-pr for pull request review prompts', () => {
      const suggestions = getSuggestions('review the pull request');
      expect(suggestions.some(s => s.includes('/review-pr'))).toBe(true);
    });

    it('should suggest /test for test-related prompts', () => {
      const suggestions = getSuggestions('run the tests');
      expect(suggestions.some(s => s.includes('/test'))).toBe(true);
    });

    it('should suggest /pr for PR creation prompts', () => {
      const suggestions = getSuggestions('create a pull request');
      expect(suggestions.some(s => s.includes('/pr'))).toBe(true);
    });

    it('should suggest /help for help prompts', () => {
      const suggestions = getSuggestions('please help');
      expect(suggestions.some(s => s.includes('/help'))).toBe(true);
    });

    it('should NOT suggest slash commands for long detailed prompts', () => {
      const longPrompt = 'I need you to commit my changes but first make sure to run the linter and fix any issues, then create a detailed commit message that describes all the authentication changes we made including the new JWT token validation';
      const suggestions = getSuggestions(longPrompt);
      expect(suggestions.some(s => s.includes('/commit'))).toBe(false);
    });

    it('should NOT suggest slash commands for unrelated prompts', () => {
      const suggestions = getSuggestions('add a new button to the header');
      expect(suggestions.some(s => s.includes('/commit'))).toBe(false);
      expect(suggestions.some(s => s.includes('/test'))).toBe(false);
      expect(suggestions.some(s => s.includes('/pr'))).toBe(false);
    });
  });

  describe('generateSlashCommandExplanation', () => {
    it('should generate positive explanation for slash commands', () => {
      const breakdown = createScoreBreakdown({
        specificity: 9,
        context: 8,
        intent: 10,
        actionability: 10,
        constraints: 8,
      });

      const explanation = explainer.generateSlashCommandExplanation(
        { isSlashCommand: true, commandName: 'commit' },
        breakdown
      );

      expect(explanation.goodPoints.length).toBeGreaterThan(0);
      expect(explanation.missingElements).toEqual([]);
      expect(explanation.suggestions).toHaveLength(1);
      expect(explanation.suggestions[0]).toContain('best practice');
    });

    it('should add context good point when arguments are provided', () => {
      const breakdown = createScoreBreakdown({
        specificity: 9,
        context: 8,
        intent: 10,
        actionability: 10,
        constraints: 8,
      });

      const explanation = explainer.generateSlashCommandExplanation(
        { isSlashCommand: true, commandName: 'work-on-item', arguments: 'VIB-123' },
        breakdown
      );

      expect(explanation.goodPoints.some(p => p.label === 'Context provided')).toBe(true);
    });
  });
});
