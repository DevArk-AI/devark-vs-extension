# Next Session: Implement Progressive UI Handlers for Streaming Analysis

## Context

We've implemented a parallel LLM call architecture that fires 3 calls simultaneously and streams results to the UI as they arrive. The backend is complete, but the webview needs handlers for the new streaming messages.

## What Was Done (Previous Session)

Modified these files to fire parallel LLM calls and stream results:
- `src/panels/V2MessageHandler.ts` (lines 1006-1099)
- `src/services/UnifiedPromptDetectionService.ts` (lines 389-513)

## New Messages Being Sent (Need UI Handlers)

### 1. `enhancedPromptReady`
Sent when the enhanced/improved prompt is ready (before its score is calculated).

```typescript
this.sendMessage('enhancedPromptReady', {
  promptId: string,
  improvedVersion: string,  // The enhanced prompt text
});
```

### 2. `enhancedScoreReady`
Sent when the enhanced prompt has been scored.

```typescript
this.sendMessage('enhancedScoreReady', {
  promptId: string,
  improvedScore: number,  // 0-10 scale
});
```

### 3. `v2GoalInference` (already exists but now fires in parallel)
Sent when goal inference completes.

```typescript
this.sendMessage('v2GoalInference', {
  suggestedGoal: string,
  confidence: number,
  detectedTheme: string,
});
```

## Existing Messages (Already Handled)

These messages already have handlers:
- `scoreReceived` - Initial prompt score
- `analysisComplete` - Final complete analysis with all data

## Task: Add Progressive UI Updates

### Files to Modify

1. **`webview/menu/state/types-v2.ts`** - Add new action types
2. **`webview/menu/state/reducer-v2.ts`** - Add reducer cases
3. **`webview/menu/AppV2.tsx`** - Handle incoming messages
4. **`webview/menu/components/v2/CoPilotView.tsx`** - Show progressive updates

### Desired UX Flow

```
User submits prompt
    │
    ▼
┌─────────────────────────────────────┐
│ Analyzing prompt...                 │  ← Show loading state
│ ⏳ Scoring                          │
│ ⏳ Enhancing                        │
│ ⏳ Detecting goal                   │
└─────────────────────────────────────┘
    │
    ▼ (scoreReceived arrives first)
┌─────────────────────────────────────┐
│ Score: 72/100                       │  ← Show score immediately
│ ✅ Scoring complete                 │
│ ⏳ Enhancing...                     │
│ ⏳ Detecting goal...                │
└─────────────────────────────────────┘
    │
    ▼ (enhancedPromptReady arrives)
┌─────────────────────────────────────┐
│ Score: 72/100                       │
│ Improved version ready!             │  ← Show enhanced prompt
│ [View Improved Prompt]              │
│ ⏳ Scoring improved version...      │
│ ✅ Goal: "Implement auth flow"      │  ← Goal arrived
└─────────────────────────────────────┘
    │
    ▼ (enhancedScoreReady arrives)
┌─────────────────────────────────────┐
│ Score: 72/100 → 89/100              │  ← Show improvement delta
│ [Use Improved Prompt]               │
└─────────────────────────────────────┘
```

### Implementation Steps

1. **Add state for progressive loading**:
```typescript
interface AnalysisState {
  isScoring: boolean;
  isEnhancing: boolean;
  isInferringGoal: boolean;
  score: number | null;
  enhancedPrompt: string | null;
  enhancedScore: number | null;
  inferredGoal: GoalInference | null;
}
```

2. **Add reducer cases**:
```typescript
case 'ENHANCED_PROMPT_READY':
  return { ...state, enhancedPrompt: action.payload.improvedVersion, isEnhancing: false };

case 'ENHANCED_SCORE_READY':
  return { ...state, enhancedScore: action.payload.improvedScore };

case 'GOAL_INFERENCE_READY':
  return { ...state, inferredGoal: action.payload, isInferringGoal: false };
```

3. **Handle messages in AppV2.tsx**:
```typescript
case 'enhancedPromptReady':
  dispatch({ type: 'ENHANCED_PROMPT_READY', payload: message.data });
  break;

case 'enhancedScoreReady':
  dispatch({ type: 'ENHANCED_SCORE_READY', payload: message.data });
  break;
```

4. **Update CoPilotView.tsx** to show progressive states

### Key Files Reference

- Message handler: `src/panels/V2MessageHandler.ts`
- Webview entry: `webview/menu/AppV2.tsx`
- State types: `webview/menu/state/types-v2.ts`
- Reducer: `webview/menu/state/reducer-v2.ts`
- CoPilot UI: `webview/menu/components/v2/CoPilotView.tsx`

### Testing

After implementation:
1. Open the extension in VS Code/Cursor
2. Submit a prompt for analysis
3. Watch for progressive updates in the UI
4. Verify: Score appears first, then enhanced prompt, then enhanced score
5. Verify: Goal inference appears when ready

## Notes

- The backend is complete and tested (`npm run typecheck` passes)
- Focus on the webview React components
- Follow existing patterns in the codebase for message handling
- Use the existing `isEnhancing` state pattern as reference
