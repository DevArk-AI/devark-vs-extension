# Implementation Plan: Response Capture & Coaching Display

## Overview

Enable the Co-Pilot to display coaching suggestions based on Claude/Cursor responses by:
1. Linking responses to their triggering prompts
2. Persisting response data alongside prompts
3. Routing coaching data to the webview UI

## Current State

```
WHAT WORKS:
- Hooks capture responses (post-response.js, stop.js)
- HookBasedPromptService reads response files
- CoachingService generates suggestions
- V2MessageHandler sends 'coachingUpdated' message

WHAT'S BROKEN:
- Responses not linked to prompts (no promptId)
- AppV2.tsx has no handler for 'coachingUpdated'
- Responses not persisted in PromptHistoryStore
- Coaching data disappears after generation
```

## Architecture After Implementation

```
User submits prompt
       ↓
beforeSubmitPrompt hook writes prompt-*.json
       ↓
HookBasedPromptService.handleNewPromptFile()
  - Stores prompt in lastPromptMap (keyed by conversationId/sessionId)
  - Saves to PromptHistoryStore with conversationId/generationId
       ↓
Claude/Cursor responds
       ↓
afterAgentResponse/stop hook writes response-*.json
       ↓
HookBasedPromptService.handleNewResponseFile()
  - Looks up linked prompt from lastPromptMap
  - Adds promptId to response
  - Updates PromptHistoryStore with responseId
  - Emits 'responseDetected' with full context
       ↓
CoachingService.processResponse(response, linkedPrompt)
  - Generates coaching with prompt context
  - Notifies listeners with promptId included
       ↓
V2MessageHandler subscription
  - Sends 'coachingUpdated' to webview
       ↓
AppV2.tsx handleMessage
  - case 'coachingUpdated' → dispatch SET_COACHING
       ↓
CoPilotView renders CoachingSection
  - Shows suggestions with "Use this prompt" buttons
```

---

## Implementation Steps

### Step 1: Add promptId to CapturedResponse

**File:** `src/services/types/response-types.ts`

```typescript
// Add after line 97 (end of CapturedResponse interface)

export interface CapturedResponse {
  // ... existing fields ...

  // Prompt linking (NEW)
  promptId?: string;           // ID of the prompt that triggered this response
  promptText?: string;         // Original prompt text (for context)
  promptTimestamp?: string;    // When the prompt was submitted
}
```

**Why:** Enables responses to reference their triggering prompt for coaching context.

---

### Step 2: Track Prompts for Response Linking

**File:** `src/services/HookBasedPromptService.ts`

#### 2a. Add prompt tracking map

```typescript
// Add after line 60 (class properties)
private lastPromptMap = new Map<string, CapturedPrompt>();
private readonly PROMPT_MAP_TTL = 5 * 60 * 1000; // 5 minutes
```

#### 2b. Store prompts when detected

```typescript
// In handleNewPromptFile() after parsing (around line 380)

// Store prompt for response linking
const linkKey = this.getPromptLinkKey(prompt);
if (linkKey) {
  this.lastPromptMap.set(linkKey, prompt);
  // Clean up old entries
  this.cleanupPromptMap();
}
```

#### 2c. Add helper methods

```typescript
// Add new methods

private getPromptLinkKey(prompt: CapturedPrompt): string | null {
  if (prompt.source === 'cursor') {
    // Cursor: use conversationId (generationId changes per response)
    return prompt.conversationId ? `cursor:${prompt.conversationId}` : null;
  } else {
    // Claude Code: use sessionId
    return prompt.sessionId ? `claude:${prompt.sessionId}` : null;
  }
}

private getResponseLinkKey(response: CapturedResponse): string | null {
  if (response.source === 'cursor') {
    return response.conversationId ? `cursor:${response.conversationId}` : null;
  } else {
    return response.sessionId ? `claude:${response.sessionId}` : null;
  }
}

private cleanupPromptMap(): void {
  const now = Date.now();
  for (const [key, prompt] of this.lastPromptMap.entries()) {
    const promptTime = new Date(prompt.timestamp).getTime();
    if (now - promptTime > this.PROMPT_MAP_TTL) {
      this.lastPromptMap.delete(key);
    }
  }
}
```

#### 2d. Link response to prompt in handleNewResponseFile()

```typescript
// In handleNewResponseFile() after parsing response (around line 620)

// Link response to its triggering prompt
const linkKey = this.getResponseLinkKey(response);
const linkedPrompt = linkKey ? this.lastPromptMap.get(linkKey) : null;

if (linkedPrompt) {
  response.promptId = linkedPrompt.id;
  response.promptText = linkedPrompt.prompt;
  response.promptTimestamp = linkedPrompt.timestamp;
  console.log(`[HookBasedPromptService] Linked response to prompt: ${linkedPrompt.id}`);
}

// Pass linked prompt to coaching service
this.emit('responseDetected', response, linkedPrompt);
```

---

### Step 3: Update PromptHistoryStore for Response Tracking

**File:** `src/storage/PromptHistoryStore.ts`

#### 3a. Extend AnalyzedPrompt interface

```typescript
// Add to AnalyzedPrompt interface (after line 38)

export interface AnalyzedPrompt {
  // ... existing fields ...

  // Linking fields (NEW)
  conversationId?: string;     // Cursor conversation ID
  generationId?: string;       // Cursor generation ID

  // Response tracking (NEW)
  responseId?: string;         // ID of response generated
  responseTimestamp?: string;  // When response was received
  responseOutcome?: 'success' | 'partial' | 'error';

  // Coaching data (NEW)
  coachingData?: {
    suggestions: Array<{
      id: string;
      type: string;
      title: string;
      suggestedPrompt: string;
    }>;
    analysis: {
      summary: string;
      outcome: string;
    };
  };
}
```

#### 3b. Add method to link response

```typescript
// Add new method

public linkResponse(promptId: string, responseData: {
  responseId: string;
  responseTimestamp: string;
  responseOutcome: 'success' | 'partial' | 'error';
  coachingData?: AnalyzedPrompt['coachingData'];
}): boolean {
  const prompts = this.getAll();
  const index = prompts.findIndex(p => p.id === promptId);

  if (index === -1) {
    console.warn(`[PromptHistoryStore] Prompt not found: ${promptId}`);
    return false;
  }

  prompts[index] = {
    ...prompts[index],
    ...responseData,
  };

  this.context.globalState.update(this.storageKey, prompts);
  return true;
}
```

---

### Step 4: Update CoachingService to Accept Prompt Context

**File:** `src/services/CoachingService.ts`

#### 4a. Update processResponse signature

```typescript
// Update method signature (line 68)

public async processResponse(
  response: CapturedResponse,
  linkedPrompt?: CapturedPrompt,  // NEW parameter
  options: CoachingOptions = {}
): Promise<CoachingResult> {
```

#### 4b. Include prompt in coaching data

```typescript
// Update CoachingData creation (around line 123)

this.currentCoaching = {
  analysis,
  suggestions,
  timestamp: new Date(),
  responseId: response.id,
  promptId: response.promptId,           // NEW
  promptText: linkedPrompt?.prompt,      // NEW
  source: response.source,               // NEW
};
```

---

### Step 5: Update CoachingData Type

**File:** `src/services/types/coaching-types.ts`

```typescript
// Update CoachingData interface

export interface CoachingData {
  analysis: ResponseAnalysis;
  suggestions: CoachingSuggestion[];
  timestamp: Date;
  responseId?: string;

  // Prompt linking (NEW)
  promptId?: string;
  promptText?: string;
  source?: 'cursor' | 'claude_code';
}
```

---

### Step 6: Wire Up Response Detection to Coaching

**File:** `src/services/HookBasedPromptService.ts`

```typescript
// In constructor or start(), subscribe CoachingService to responses

import { getCoachingService } from './CoachingService';

// In start() method, after setting up file watchers
const coachingService = getCoachingService();
this.on('responseDetected', async (response: CapturedResponse, linkedPrompt?: CapturedPrompt) => {
  try {
    await coachingService.processResponse(response, linkedPrompt);
  } catch (error) {
    console.error('[HookBasedPromptService] Coaching processing failed:', error);
  }
});
```

---

### Step 7: Add Message Handler in AppV2.tsx

**File:** `webview/menu/AppV2.tsx`

```typescript
// Add before line 768 (before the closing of switch statement)

        case 'coachingUpdated':
          console.log('[AppV2] Coaching updated:', message.data);
          if (message.data?.coaching) {
            dispatch({ type: 'SET_COACHING', payload: message.data.coaching });
          }
          break;

        case 'coachingStatus':
          console.log('[AppV2] Coaching status:', message.data);
          if (message.data?.coaching) {
            dispatch({ type: 'SET_COACHING', payload: message.data.coaching });
          }
          break;

        case 'responseDetected':
          console.log('[AppV2] Response detected:', message.data);
          // Optional: Show toast notification
          break;
```

---

### Step 8: Request Coaching Status on Panel Open

**File:** `webview/menu/AppV2.tsx`

```typescript
// Add to useEffect initial data requests (around line 786)

postMessage('getCoachingStatus'); // Get current coaching if any
```

---

### Step 9: Update webview types (if needed)

**File:** `webview/menu/state/types-v2.ts`

Verify these types exist (they should from exploration):

```typescript
export interface CoachingData {
  analysis: CoachingAnalysis;
  suggestions: CoachingSuggestion[];
  timestamp: Date;
  promptId?: string;      // Ensure this is added
  promptText?: string;    // Ensure this is added
  source?: string;        // Ensure this is added
}
```

---

## File Change Summary

| File | Changes | Priority |
|------|---------|----------|
| `src/services/types/response-types.ts` | Add `promptId`, `promptText`, `promptTimestamp` to `CapturedResponse` | HIGH |
| `src/services/HookBasedPromptService.ts` | Add `lastPromptMap`, link responses to prompts, emit with context | HIGH |
| `src/storage/PromptHistoryStore.ts` | Add linking fields to `AnalyzedPrompt`, add `linkResponse()` method | MEDIUM |
| `src/services/CoachingService.ts` | Accept `linkedPrompt` param, include in `CoachingData` | HIGH |
| `src/services/types/coaching-types.ts` | Add `promptId`, `promptText`, `source` to `CoachingData` | HIGH |
| `webview/menu/AppV2.tsx` | Add `coachingUpdated`, `coachingStatus` cases, request on init | HIGH |
| `webview/menu/state/types-v2.ts` | Verify/add prompt linking fields to `CoachingData` | LOW |

---

## Testing Plan

### Manual Testing

1. **Hook Installation Verified**
   - Run `Vibe Log: Install Cursor Hooks` command
   - Verify hooks appear in Cursor settings

2. **Prompt Detection**
   - Submit a prompt in Cursor
   - Verify console log: `[HookBasedPromptService] Stored prompt for linking: cursor:conv-xxx`

3. **Response Linking**
   - Wait for Claude to respond
   - Verify console log: `[HookBasedPromptService] Linked response to prompt: prompt-xxx`

4. **Coaching Display**
   - Open Co-Pilot tab
   - Verify CoachingSection shows suggestions
   - Click "Use this prompt" - verify it injects into composer

5. **Persistence**
   - Close and reopen VS Code
   - Verify prompt history shows response data

### Edge Cases

- Prompt submitted but response never comes (timeout cleanup)
- Multiple rapid prompts in same conversation
- Claude Code session with multiple prompts
- Response arrives before prompt file is processed (race condition)

---

## Future Enhancements (Out of Scope)

- Response quality scoring
- Prompt vs response comparison analysis
- Multi-turn conversation tracking
- Coaching suggestion effectiveness metrics
