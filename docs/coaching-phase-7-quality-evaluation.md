# Phase 7: Coaching Quality Evaluation System

## Problem
We have no way to systematically evaluate coaching quality:
- Are suggestions actually specific (not generic)?
- Do suggestions reference real code/files from context?
- Are suggestions actionable and well-formatted?
- How do different LLM providers compare?

## Goal
Create an evaluation framework that:
1. Automatically scores coaching suggestions on quality dimensions
2. Detects generic/low-quality suggestions
3. Enables A/B testing of prompt variations
4. Provides quality dashboards for monitoring

---

## Implementation Plan

### 7.1 Add Quality Evaluation Types

**File**: `src/services/types/coaching-types.ts`

```typescript
/**
 * Quality dimensions for coaching suggestions
 */
export interface CoachingQualityScore {
  // Does the suggestion reference specific files/functions from context?
  specificity: number; // 0-10

  // Is the suggestion actionable (has a clear next step)?
  actionability: number; // 0-10

  // Does the suggested prompt look ready to use?
  promptQuality: number; // 0-10

  // Does the suggestion align with the context (relevant to what was done)?
  contextRelevance: number; // 0-10

  // Is the suggestion NOT generic (doesn't match common patterns)?
  nonGeneric: number; // 0-10

  // Overall weighted score
  overall: number; // 0-10
}

/**
 * Quality evaluation result for a coaching session
 */
export interface CoachingQualityEvaluation {
  coachingId: string;
  timestamp: Date;
  suggestions: Array<{
    suggestionId: string;
    type: CoachingSuggestion['type'];
    score: CoachingQualityScore;
    flags: QualityFlag[];
  }>;
  overallScore: number;
  passesThreshold: boolean;
}

/**
 * Quality flags for suggestions
 */
export type QualityFlag =
  | 'generic_test_suggestion'     // "Add tests" without specifics
  | 'generic_doc_suggestion'      // "Add documentation" without specifics
  | 'no_file_reference'           // Doesn't mention any file from context
  | 'prompt_too_vague'            // Suggested prompt is too short/vague
  | 'missing_reasoning'           // No reasoning provided
  | 'context_mismatch'            // Suggestion doesn't match context
  | 'excellent_specificity'       // Positive flag: very specific
  | 'actionable_first_step';      // Positive flag: clear next step

/**
 * Configuration for quality evaluation
 */
export interface QualityEvaluationConfig {
  enabled: boolean;
  minScoreThreshold: number;      // Minimum overall score to pass
  evaluateAllSuggestions: boolean;
  logLowQuality: boolean;
  blockLowQuality: boolean;       // Don't show suggestions below threshold
}

export const DEFAULT_QUALITY_CONFIG: QualityEvaluationConfig = {
  enabled: true,
  minScoreThreshold: 5.0,
  evaluateAllSuggestions: true,
  logLowQuality: true,
  blockLowQuality: false,
};
```

### 7.2 Create CoachingQualityEvaluator

**File**: `src/services/CoachingQualityEvaluator.ts`

```typescript
import type {
  CoachingSuggestion,
  CoachingQualityScore,
  CoachingQualityEvaluation,
  QualityFlag,
  QualityEvaluationConfig,
  ResponseAnalysis,
} from './types/coaching-types';
import { DEFAULT_QUALITY_CONFIG } from './types/coaching-types';

/**
 * Generic suggestion patterns to detect
 */
const GENERIC_PATTERNS = {
  test: [
    /^add tests?$/i,
    /^write tests?$/i,
    /^consider adding tests?$/i,
    /test the (code|changes|implementation)$/i,
  ],
  documentation: [
    /^add documentation$/i,
    /^document the code$/i,
    /^improve documentation$/i,
    /^add comments$/i,
  ],
  refactor: [
    /^refactor the code$/i,
    /^clean up the code$/i,
    /^improve code quality$/i,
  ],
};

export class CoachingQualityEvaluator {
  private static instance: CoachingQualityEvaluator | null = null;
  private config: QualityEvaluationConfig;

  private constructor() {
    this.config = DEFAULT_QUALITY_CONFIG;
  }

  public static getInstance(): CoachingQualityEvaluator {
    if (!CoachingQualityEvaluator.instance) {
      CoachingQualityEvaluator.instance = new CoachingQualityEvaluator();
    }
    return CoachingQualityEvaluator.instance;
  }

  /**
   * Evaluate quality of coaching suggestions
   */
  public evaluate(
    suggestions: CoachingSuggestion[],
    context: {
      filesModified: string[];
      analysis: ResponseAnalysis;
      promptText?: string;
    }
  ): CoachingQualityEvaluation {
    const evaluatedSuggestions = suggestions.map(s => {
      const score = this.scoreSuggestion(s, context);
      const flags = this.detectFlags(s, score, context);
      return {
        suggestionId: s.id,
        type: s.type,
        score,
        flags,
      };
    });

    const overallScore = evaluatedSuggestions.length > 0
      ? evaluatedSuggestions.reduce((sum, s) => sum + s.score.overall, 0) / evaluatedSuggestions.length
      : 0;

    return {
      coachingId: `eval-${Date.now()}`,
      timestamp: new Date(),
      suggestions: evaluatedSuggestions,
      overallScore,
      passesThreshold: overallScore >= this.config.minScoreThreshold,
    };
  }

  /**
   * Score a single suggestion
   */
  private scoreSuggestion(
    suggestion: CoachingSuggestion,
    context: {
      filesModified: string[];
      analysis: ResponseAnalysis;
    }
  ): CoachingQualityScore {
    const specificity = this.scoreSpecificity(suggestion, context);
    const actionability = this.scoreActionability(suggestion);
    const promptQuality = this.scorePromptQuality(suggestion);
    const contextRelevance = this.scoreContextRelevance(suggestion, context);
    const nonGeneric = this.scoreNonGeneric(suggestion);

    // Weighted average
    const overall =
      specificity * 0.25 +
      actionability * 0.20 +
      promptQuality * 0.20 +
      contextRelevance * 0.20 +
      nonGeneric * 0.15;

    return {
      specificity,
      actionability,
      promptQuality,
      contextRelevance,
      nonGeneric,
      overall,
    };
  }

  /**
   * Score specificity (references to actual files/functions)
   */
  private scoreSpecificity(
    suggestion: CoachingSuggestion,
    context: { filesModified: string[] }
  ): number {
    let score = 5; // Base score

    const text = `${suggestion.title} ${suggestion.description} ${suggestion.suggestedPrompt}`;

    // Check for file references
    const fileReferences = context.filesModified.filter(f => text.includes(f));
    score += Math.min(fileReferences.length * 1.5, 3);

    // Check for function/class name patterns
    const codePatterns = text.match(/\b[a-z][a-zA-Z0-9]*(?:Function|Handler|Service|Component|Controller)\b/g);
    if (codePatterns && codePatterns.length > 0) {
      score += 1;
    }

    // Check for specific line numbers or code snippets
    if (text.match(/line \d+/i) || text.match(/```/)) {
      score += 1;
    }

    return Math.min(10, score);
  }

  /**
   * Score actionability (clear next step)
   */
  private scoreActionability(suggestion: CoachingSuggestion): number {
    let score = 5;

    // Has a suggested prompt
    if (suggestion.suggestedPrompt && suggestion.suggestedPrompt.length > 20) {
      score += 2;
    }

    // Suggested prompt is specific (not just a few words)
    if (suggestion.suggestedPrompt && suggestion.suggestedPrompt.length > 50) {
      score += 1;
    }

    // Title starts with an action verb
    const actionVerbs = /^(add|create|write|implement|fix|update|refactor|test|check|verify)/i;
    if (actionVerbs.test(suggestion.title)) {
      score += 1;
    }

    // Description explains why
    if (suggestion.description && suggestion.description.length > 30) {
      score += 1;
    }

    return Math.min(10, score);
  }

  /**
   * Score prompt quality
   */
  private scorePromptQuality(suggestion: CoachingSuggestion): number {
    const prompt = suggestion.suggestedPrompt || '';
    let score = 5;

    // Length check
    if (prompt.length < 20) {
      score -= 2;
    } else if (prompt.length > 100) {
      score += 2;
    }

    // Contains specific context (file names, function names)
    if (prompt.match(/\.(ts|tsx|js|jsx|py|go|rs|java)\b/)) {
      score += 1;
    }

    // Contains specific action words
    const specificActions = /\b(specifically|focus on|make sure|ensure|handle|edge case)\b/i;
    if (specificActions.test(prompt)) {
      score += 1;
    }

    // Not just a generic command
    const genericCommands = /^(do this|make it work|fix this|help me)\b/i;
    if (genericCommands.test(prompt)) {
      score -= 2;
    }

    return Math.max(0, Math.min(10, score));
  }

  /**
   * Score context relevance
   */
  private scoreContextRelevance(
    suggestion: CoachingSuggestion,
    context: { analysis: ResponseAnalysis }
  ): number {
    let score = 5;

    const text = `${suggestion.title} ${suggestion.description}`.toLowerCase();
    const topics = context.analysis.topicsAddressed.map(t => t.toLowerCase());

    // Check topic overlap
    for (const topic of topics) {
      if (text.includes(topic)) {
        score += 1;
      }
    }

    // Check modified entities mentioned
    for (const entity of context.analysis.entitiesModified) {
      if (text.includes(entity.toLowerCase())) {
        score += 1;
      }
    }

    // Align suggestion type with outcome
    if (context.analysis.outcome === 'error' && suggestion.type === 'error_prevention') {
      score += 1;
    }
    if (context.analysis.outcome === 'success' && suggestion.type === 'follow_up') {
      score += 1;
    }

    return Math.min(10, score);
  }

  /**
   * Score non-generic (penalty for generic suggestions)
   */
  private scoreNonGeneric(suggestion: CoachingSuggestion): number {
    let score = 10; // Start high, penalize for generic patterns

    const title = suggestion.title.toLowerCase();
    const type = suggestion.type;

    // Check against generic patterns
    const patterns = GENERIC_PATTERNS[type as keyof typeof GENERIC_PATTERNS];
    if (patterns) {
      for (const pattern of patterns) {
        if (pattern.test(title)) {
          score -= 4;
          break;
        }
      }
    }

    // Penalize very short titles
    if (suggestion.title.length < 15) {
      score -= 2;
    }

    // Penalize missing details
    if (!suggestion.reasoning || suggestion.reasoning.length < 20) {
      score -= 1;
    }

    return Math.max(0, score);
  }

  /**
   * Detect quality flags
   */
  private detectFlags(
    suggestion: CoachingSuggestion,
    score: CoachingQualityScore,
    context: { filesModified: string[] }
  ): QualityFlag[] {
    const flags: QualityFlag[] = [];

    // Negative flags
    if (score.nonGeneric < 5) {
      if (suggestion.type === 'test') {
        flags.push('generic_test_suggestion');
      } else if (suggestion.type === 'documentation') {
        flags.push('generic_doc_suggestion');
      }
    }

    if (score.specificity < 5) {
      const text = `${suggestion.title} ${suggestion.description} ${suggestion.suggestedPrompt}`;
      const hasFileRef = context.filesModified.some(f => text.includes(f));
      if (!hasFileRef) {
        flags.push('no_file_reference');
      }
    }

    if (score.promptQuality < 4) {
      flags.push('prompt_too_vague');
    }

    if (!suggestion.reasoning || suggestion.reasoning.length < 10) {
      flags.push('missing_reasoning');
    }

    if (score.contextRelevance < 4) {
      flags.push('context_mismatch');
    }

    // Positive flags
    if (score.specificity >= 8) {
      flags.push('excellent_specificity');
    }

    if (score.actionability >= 8) {
      flags.push('actionable_first_step');
    }

    return flags;
  }

  /**
   * Log quality evaluation for monitoring
   */
  public logEvaluation(evaluation: CoachingQualityEvaluation): void {
    if (!this.config.logLowQuality) return;

    const lowQuality = evaluation.suggestions.filter(
      s => s.score.overall < this.config.minScoreThreshold
    );

    if (lowQuality.length > 0) {
      console.warn('[CoachingQuality] Low quality suggestions detected:', {
        overallScore: evaluation.overallScore,
        lowQuality: lowQuality.map(s => ({
          type: s.type,
          score: s.score.overall,
          flags: s.flags,
        })),
      });
    }
  }

  /**
   * Filter suggestions based on quality
   */
  public filterByQuality(
    suggestions: CoachingSuggestion[],
    evaluation: CoachingQualityEvaluation
  ): CoachingSuggestion[] {
    if (!this.config.blockLowQuality) {
      return suggestions;
    }

    return suggestions.filter((s, i) => {
      const evalResult = evaluation.suggestions[i];
      return evalResult && evalResult.score.overall >= this.config.minScoreThreshold;
    });
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<QualityEvaluationConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export function getCoachingQualityEvaluator(): CoachingQualityEvaluator {
  return CoachingQualityEvaluator.getInstance();
}
```

### 7.3 Integrate Quality Evaluation into CoachingService

**File**: `src/services/CoachingService.ts`

```typescript
// In generateSuggestions(), after parsing suggestions:

import { getCoachingQualityEvaluator } from './CoachingQualityEvaluator';

// After parsing suggestions from LLM response
const suggestions = this.parseSuggestions(result.text, minConfidence, maxSuggestions);

// Evaluate quality
const qualityEvaluator = getCoachingQualityEvaluator();
const evaluation = qualityEvaluator.evaluate(suggestions, {
  filesModified: response.filesModified || [],
  analysis,
  promptText: linkedPrompt?.prompt,
});

// Log evaluation
qualityEvaluator.logEvaluation(evaluation);

// Optionally filter low-quality suggestions
const filteredSuggestions = qualityEvaluator.filterByQuality(suggestions, evaluation);

// Store evaluation for analytics
this.lastEvaluation = evaluation;

return filteredSuggestions;
```

### 7.4 Add Quality Dashboard Component

**File**: `webview/menu/components/v2/QualityDashboard.tsx`

```tsx
import { useState, useEffect } from 'react';
import { BarChart, AlertTriangle, CheckCircle } from 'lucide-react';

interface QualityStats {
  avgScore: number;
  passRate: number;
  commonFlags: Array<{ flag: string; count: number }>;
  recentEvaluations: Array<{
    timestamp: string;
    score: number;
    passed: boolean;
  }>;
}

export function QualityDashboard() {
  const [stats, setStats] = useState<QualityStats | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    postMessage('getQualityStats');

    const handler = (event: MessageEvent) => {
      if (event.data.type === 'qualityStats') {
        setStats(event.data.data);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (!stats) return null;

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full"
      >
        <div className="flex items-center gap-2">
          <BarChart className="w-4 h-4" />
          <span className="text-sm font-medium">Coaching Quality</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {stats.avgScore.toFixed(1)}/10
          </span>
          {stats.passRate >= 0.8 ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/50 p-2 rounded">
              <div className="text-muted-foreground">Pass Rate</div>
              <div className="font-medium">{Math.round(stats.passRate * 100)}%</div>
            </div>
            <div className="bg-muted/50 p-2 rounded">
              <div className="text-muted-foreground">Avg Score</div>
              <div className="font-medium">{stats.avgScore.toFixed(1)}/10</div>
            </div>
          </div>

          {stats.commonFlags.length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1">Common Issues</div>
              <div className="space-y-1">
                {stats.commonFlags.slice(0, 3).map((f, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{f.flag.replace(/_/g, ' ')}</span>
                    <span className="text-muted-foreground">{f.count}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Files to Create/Modify

| File | Changes |
|------|---------|
| `src/services/types/coaching-types.ts` | Add quality evaluation types |
| `src/services/CoachingQualityEvaluator.ts` | New service (create) |
| `src/services/CoachingService.ts` | Integrate quality evaluation |
| `src/panels/V2MessageHandler.ts` | Handle quality stats requests |
| `webview/menu/components/v2/QualityDashboard.tsx` | New component (create) |

---

## Success Metrics

- Average quality score should be >7/10
- Pass rate should be >80%
- Generic suggestion rate should be <10%
- File reference rate should be >70%
