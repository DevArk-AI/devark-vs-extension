# Phase 4: Coaching Feedback Loop

## Problem
Currently, we generate coaching suggestions but have no way to know:
- Which suggestions users actually use
- Whether suggestions were helpful
- Which suggestion types perform best
- How to improve suggestions over time

## Goal
Create a feedback loop that:
1. Tracks when users act on suggestions (click "Use Prompt")
2. Tracks when users dismiss suggestions
3. Detects if a suggestion led to successful work
4. Uses feedback to improve future suggestions

---

## Implementation Plan

### 4.1 Add Suggestion Tracking Types

**File**: `src/services/types/coaching-types.ts`

```typescript
/**
 * Tracks user interaction with a suggestion
 */
export interface SuggestionFeedback {
  suggestionId: string;
  type: CoachingSuggestion['type'];
  action: 'used' | 'dismissed' | 'ignored' | 'followed_up';
  timestamp: Date;
  // Did the user's next prompt match the suggestion?
  promptMatched?: boolean;
  // Was the resulting response successful?
  resultOutcome?: 'success' | 'partial' | 'error';
  // Time between suggestion and action
  responseTimeMs?: number;
}

/**
 * Aggregated coaching stats for a session
 */
export interface CoachingStats {
  totalSuggestions: number;
  suggestionsUsed: number;
  suggestionsDismissed: number;
  suggestionsIgnored: number;
  avgResponseTimeMs: number;
  successRate: number; // % of used suggestions that led to success
  byType: Record<CoachingSuggestion['type'], {
    count: number;
    usedCount: number;
    successCount: number;
  }>;
}
```

### 4.2 Add Feedback Tracking to CoachingService

**File**: `src/services/CoachingService.ts`

```typescript
// Add to CoachingService class
private feedbackHistory: SuggestionFeedback[] = [];
private readonly MAX_FEEDBACK_HISTORY = 100;

/**
 * Record when user uses a suggestion
 */
public recordSuggestionUsed(suggestionId: string): void {
  const suggestion = this.findSuggestion(suggestionId);
  if (!suggestion) return;

  const feedback: SuggestionFeedback = {
    suggestionId,
    type: suggestion.type,
    action: 'used',
    timestamp: new Date(),
    responseTimeMs: Date.now() - (this.currentCoaching?.timestamp.getTime() || 0),
  };

  this.feedbackHistory.push(feedback);
  this.trimFeedbackHistory();

  // Store pending feedback to correlate with next response
  this.pendingFeedback = feedback;

  console.log('[CoachingService] Suggestion used:', suggestionId);
}

/**
 * Record when user dismisses a suggestion
 */
public recordSuggestionDismissed(suggestionId: string): void {
  const suggestion = this.findSuggestion(suggestionId);
  if (!suggestion) return;

  this.feedbackHistory.push({
    suggestionId,
    type: suggestion.type,
    action: 'dismissed',
    timestamp: new Date(),
    responseTimeMs: Date.now() - (this.currentCoaching?.timestamp.getTime() || 0),
  });

  this.trimFeedbackHistory();
}

/**
 * Correlate previous suggestion with response outcome
 */
private correlateFeedbackWithResponse(response: CapturedResponse): void {
  if (!this.pendingFeedback) return;

  const feedback = this.pendingFeedback;
  feedback.resultOutcome = response.success ? 'success' : 'error';

  // Check if the user's prompt matched the suggestion
  if (response.promptText && this.currentCoaching) {
    const usedSuggestion = this.currentCoaching.suggestions.find(
      s => s.id === feedback.suggestionId
    );
    if (usedSuggestion) {
      feedback.promptMatched = this.promptMatchesSuggestion(
        response.promptText,
        usedSuggestion.suggestedPrompt
      );
    }
  }

  this.pendingFeedback = null;
}

/**
 * Get coaching effectiveness stats
 */
public getCoachingStats(): CoachingStats {
  const stats: CoachingStats = {
    totalSuggestions: this.feedbackHistory.length,
    suggestionsUsed: 0,
    suggestionsDismissed: 0,
    suggestionsIgnored: 0,
    avgResponseTimeMs: 0,
    successRate: 0,
    byType: {} as any,
  };

  // Aggregate stats
  let totalResponseTime = 0;
  let usedWithOutcome = 0;
  let successfulUses = 0;

  for (const fb of this.feedbackHistory) {
    if (fb.action === 'used') {
      stats.suggestionsUsed++;
      if (fb.resultOutcome) {
        usedWithOutcome++;
        if (fb.resultOutcome === 'success') successfulUses++;
      }
    } else if (fb.action === 'dismissed') {
      stats.suggestionsDismissed++;
    } else {
      stats.suggestionsIgnored++;
    }

    if (fb.responseTimeMs) {
      totalResponseTime += fb.responseTimeMs;
    }

    // By type
    if (!stats.byType[fb.type]) {
      stats.byType[fb.type] = { count: 0, usedCount: 0, successCount: 0 };
    }
    stats.byType[fb.type].count++;
    if (fb.action === 'used') stats.byType[fb.type].usedCount++;
    if (fb.resultOutcome === 'success') stats.byType[fb.type].successCount++;
  }

  stats.avgResponseTimeMs = this.feedbackHistory.length > 0
    ? totalResponseTime / this.feedbackHistory.length
    : 0;
  stats.successRate = usedWithOutcome > 0
    ? successfulUses / usedWithOutcome
    : 0;

  return stats;
}
```

### 4.3 Use Feedback to Improve Suggestions

**Update buildCoachingPrompt() to include feedback context:**

```typescript
// Add to buildCoachingPrompt()
const stats = this.getCoachingStats();

// Add feedback context to prompt
const feedbackContextXml = `
<coaching_feedback>
<recent_usage>
<suggestions_used>${stats.suggestionsUsed}</suggestions_used>
<suggestions_dismissed>${stats.suggestionsDismissed}</suggestions_dismissed>
<success_rate>${Math.round(stats.successRate * 100)}%</success_rate>
</recent_usage>
<type_effectiveness>
${Object.entries(stats.byType)
  .filter(([_, data]) => data.count > 0)
  .map(([type, data]) => `<type name="${type}" used="${data.usedCount}" success="${data.successCount}" total="${data.count}"/>`)
  .join('\n')}
</type_effectiveness>
<guidance>
- Prioritize suggestion types with higher success rates
- Avoid types the user frequently dismisses
- Match the style of suggestions the user tends to use
</guidance>
</coaching_feedback>`;
```

### 4.4 Wire Up Feedback in UI

**File**: `src/panels/V2MessageHandler.ts`

Add handlers for feedback events:

```typescript
case 'suggestionUsed':
  this.handleSuggestionUsed(data?.suggestionId);
  break;

case 'suggestionDismissed':
  this.handleSuggestionDismissed(data?.suggestionId);
  break;

private handleSuggestionUsed(suggestionId?: string): void {
  if (!suggestionId) return;
  const coachingService = getCoachingService();
  coachingService.recordSuggestionUsed(suggestionId);
}

private handleSuggestionDismissed(suggestionId?: string): void {
  if (!suggestionId) return;
  const coachingService = getCoachingService();
  coachingService.recordSuggestionDismissed(suggestionId);
}
```

### 4.5 Persist Feedback Across Sessions

**File**: `src/services/CoachingService.ts`

```typescript
private readonly FEEDBACK_STORAGE_KEY = 'copilot.coaching.feedback';

private async loadFeedbackHistory(): Promise<void> {
  if (!this.context) return;

  const stored = this.context.globalState.get<SuggestionFeedback[]>(
    this.FEEDBACK_STORAGE_KEY
  );

  if (stored) {
    this.feedbackHistory = stored.map(fb => ({
      ...fb,
      timestamp: new Date(fb.timestamp),
    }));
  }
}

private async saveFeedbackHistory(): Promise<void> {
  if (!this.context) return;

  await this.context.globalState.update(
    this.FEEDBACK_STORAGE_KEY,
    this.feedbackHistory
  );
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/services/types/coaching-types.ts` | Add SuggestionFeedback, CoachingStats interfaces |
| `src/services/CoachingService.ts` | Add feedback tracking methods, persistence |
| `src/panels/V2MessageHandler.ts` | Add feedback event handlers |
| `webview/menu/components/v2/CoachingSuggestion.tsx` | Emit feedback events on click |

---

## Success Metrics

- Track suggestion usage rate (target: >30% of suggestions used)
- Track success rate (target: >70% of used suggestions lead to success)
- Identify low-performing suggestion types to improve
- A/B test different prompt strategies
