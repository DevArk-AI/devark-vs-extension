# Daily Standup Prep - Implementation Plan

## Summary
Add a "Standup" period button as the FIRST option in the Reports tab. Shows previous workday data with morning briefing framing, weekend activity highlighting, and suggested focus for today.

## Requirements
- First tab in period selector (before Today/Week/Month/Custom)
- Morning greeting based on time of day
- Previous workday's data (Friday on Monday)
- Weekend activity highlighted as "Bonus Weekend Work" if user coded
- Content sections: framed summary box at top, worked on, business outcomes (detailed), suggested focus
- NO: prompt quality, QuickStats, SessionSourcesDisplay
- Requires clicking "Analyze" button
- DailyStandupCTA banner at bottom
- Copy button works same as other summaries

---

## Files to Modify

### 1. `webview/menu/state/types-v2.ts`
**Changes:**
- Line 11: Add `'standup'` to `SummaryPeriod` type
  ```typescript
  export type SummaryPeriod = 'standup' | 'today' | 'week' | 'month' | 'custom';
  ```
- Add `StandupSummary` interface (after line ~450):
  ```typescript
  export interface StandupSummary {
    previousWorkday: DailySummary;
    previousWorkdayDate: Date;
    weekendActivity?: {
      hasSaturday: boolean;
      hasSunday: boolean;
      totalMinutes: number;
      projectsWorkedOn: string[];
    };
    totalSessions: number;
    totalTimeCoding: number;
    sessionsBySource?: SessionsBySource;
    suggestedFocusForToday: string[];
    source?: 'ai' | 'fallback';
    providerInfo?: { model: string; provider: string };
    error?: SummaryError;
  }
  ```
- Add action type to `ActionV2` union:
  ```typescript
  | { type: 'SET_STANDUP_SUMMARY'; payload: StandupSummary | null }
  ```

### 2. `webview/menu/state/initial-state.ts`
**Changes:**
- Add `standupSummary: null` to initial state

### 3. `webview/menu/state/app-reducer.ts`
**Changes:**
- Add reducer case:
  ```typescript
  case 'SET_STANDUP_SUMMARY':
    return { ...state, standupSummary: action.payload };
  ```

### 4. `src/shared/webview-protocol.ts`
**Changes:**
- Update `getSummary` message data type to include `'standup'`:
  ```typescript
  { type: 'getSummary'; data: { period: 'standup' | 'today' | 'week' | 'month' | 'custom'; ... } }
  ```

### 5. `webview/menu/components/v2/SummariesView.tsx`
**Changes:**

**A. Period Selector (lines 138-157):**
Add Standup button FIRST:
```typescript
<button
  className={`vl-period-btn ${state.summaryPeriod === 'standup' ? 'active' : ''}`}
  onClick={() => handlePeriodChange('standup')}
>
  Standup
</button>
```

**B. Update imports (line 16):**
Add `StandupSummary` to type imports

**C. Update hasData check (line 123):**
Add standup condition:
```typescript
(state.summaryPeriod === 'standup' && state.standupSummary !== null) ||
```

**D. Update handleAnalyze (line 60):**
Add standup case:
```typescript
if (state.summaryPeriod === 'standup') {
  send('getSummary', { period: 'standup' });
} else if (state.summaryPeriod === 'custom' && ...) {
```

**E. Add StandupPrepView component** (new function, after TodaySummaryView):
- Morning greeting (Good morning/afternoon/evening based on hour)
- Weekend highlight section (green gradient, Sparkles icon, shows Sat/Sun if applicable)
- Previous workday header with day name and date
- Reuse: WorkedOnSection, BusinessOutcomesSection, SuggestedFocus
- New: OutcomesSummaryBox - framed box at top with "2 Features | 1 Bug Fix | 1 Refactor"
- DailyStandupCTA at bottom

**F. Update handleCopyAsText (line 106):**
Add standup case with `formatStandupSummaryAsText()`

**G. Add formatStandupSummaryAsText helper:**
Format for clipboard: greeting, previous workday stats, worked on, weekend bonus (if any), focus for today

**H. Update getPeriodLabel helper:**
Add `case 'standup': return 'Standup Prep';`

### 6. `webview/menu/AppV2.tsx`
**Changes:**
- Update `summaryData` message handler to handle `type: 'standup'`:
  ```typescript
  if (message.data.type === 'standup') {
    dispatch({ type: 'SET_STANDUP_SUMMARY', payload: message.data.summary });
  }
  ```

### 7. `src/panels/handlers/summary-handler.ts`
**Changes:**

**A. Update handleGetSummary routing:**
Add standup case before today:
```typescript
if (period === 'standup') {
  await this.generateStandupSummary();
}
```

**B. Add generateStandupSummary method:**
- Calculate previous workday date:
  - Monday: Friday (3 days ago)
  - Sunday: Friday (2 days ago)
  - Other days: Yesterday
- Calculate weekend dates if Monday/Sunday
- Fetch previous workday sessions
- Fetch weekend sessions if applicable
- Build StandupSummary with:
  - Previous workday data
  - Weekend activity (if any sessions found)
  - Combined suggested focus (merge yesterday's focus + new recommendations, dedupe)
- Send progress updates during loading
- Handle fallback when no LLM available

**C. Add generateEmptyStandupSummary helper:**
Returns empty standup summary when no sessions found

---

## Implementation Order

1. **Types** (`types-v2.ts`) - Add StandupSummary interface, update SummaryPeriod
2. **Initial state** (`initial-state.ts`) - Add standupSummary: null
3. **Reducer** (`app-reducer.ts`) - Add SET_STANDUP_SUMMARY case
4. **Protocol** (`webview-protocol.ts`) - Update getSummary period type
5. **Backend** (`summary-handler.ts`) - Implement generateStandupSummary
6. **UI** (`SummariesView.tsx`) - Add button, view, copy support
7. **Message handling** (`AppV2.tsx`) - Handle standup type

---

## StandupPrepView Component Structure

```
+------------------------------------------+
| Good morning! Here's your standup prep   |
| for Monday.                              |
+------------------------------------------+

+------------------------------------------+
| 2 Features | 1 Bug Fix | 1 Refactor     |  (framed summary box - at top)
+------------------------------------------+

+------------------------------------------+
| [Sparkles] Bonus Weekend Work!           |  (green highlight, only if weekend activity)
| You also coded Saturday & Sunday (2h 30m)|
| - project-a                              |
| - project-b                              |
+------------------------------------------+

## Friday's Work (Jan 10)

### Worked On
- Feature X implementation
- Bug fix for Y

### Business Outcomes (detailed)
[Existing BusinessOutcomesSection component]

### Focus for Today
- Continue Feature X
- Review PR #123

[DailyStandupCTA: Set up daily emails]
```

---

## Workday Logic

| Today    | Previous Workday | Weekend Check |
|----------|------------------|---------------|
| Monday   | Friday (-3 days) | Sat + Sun     |
| Sunday   | Friday (-2 days) | Saturday      |
| Saturday | Friday (-1 day)  | None          |
| Tue-Fri  | Yesterday        | None          |
