# Implementation Plan: Add Cursor `stop` Hook for Enhanced Coaching Feedback

## Overview

Add Cursor's `stop` hook alongside the existing `afterAgentResponse` hook to capture final conversation state and stop reasons. This enables better coaching feedback by distinguishing intermediate responses (during conversation) from final outcomes (conversation complete).

**Key Strategy:**
- **Keep both hooks**: `afterAgentResponse` (intermediate) + `stop` (final)
- **Reuse script**: Single `post-response.js` detects which hook triggered it via `hook_event_name`
- **Capture final state**: Stop reason, loop count, aggregate conversation metrics

## Official Cursor Documentation

**Source:** https://cursor.com/docs/agent/hooks#stop

### Stop Hook Input Format
```json
{
  "status": "completed" | "aborted" | "error",
  "loop_count": 0,
  "conversation_id": "...",
  "generation_id": "...",
  "model": "...",
  "hook_event_name": "stop",
  "cursor_version": "...",
  "workspace_roots": [...],
  "user_email": "..."
}
```

### Key Difference from afterAgentResponse
- `afterAgentResponse`: Fires after each assistant message, **includes response text**
- `stop`: Fires when agent loop ends, **NO response text**, only status and loop_count

**Important:** The stop hook does NOT include the response text. The final response content comes from the last `afterAgentResponse` call. The stop hook only signals completion status.

## Implementation Steps

### STEP 1: Modify Hook Script

**File:** `src/cursor-hooks/post-response.js`

**Changes:**

1. **Update header comments** (lines 1-34):
```javascript
#!/usr/bin/env node
/**
 * Cursor afterAgentResponse & stop Hook
 *
 * This script handles BOTH Cursor hooks:
 * 1. afterAgentResponse - fires after each agent turn (has response text)
 * 2. stop - fires when agent loop ends (has status, no response text)
 *
 * Detection: Uses 'hook_event_name' field (base field for all Cursor hooks)
 *
 * Usage: Configure in ~/.cursor/hooks.json:
 * {
 *   "version": 1,
 *   "hooks": {
 *     "afterAgentResponse": [{ "command": "node /path/to/post-response.js" }],
 *     "stop": [{ "command": "node /path/to/post-response.js" }]
 *   }
 * }
 *
 * afterAgentResponse input: { response, conversation_id, generation_id, model, tool_calls, ... }
 * stop input: { status, loop_count, conversation_id, generation_id, model, ... }
 */
```

2. **Detect hook type** (after line 78, after `JSON.parse`):
```javascript
const input = JSON.parse(inputData);

// Detect which hook triggered this script
const hookType = input.hook_event_name || 'afterAgentResponse';
const isStopHook = hookType === 'stop';

debugLog(`Hook type detected: ${hookType}`);
debugLog(`Parsed input keys: ${Object.keys(input).join(', ')}`);
```

3. **Capture hook-specific data** (replace lines 84-106):
```javascript
// Build response data based on hook type
const responseData = {
  id: `cursor-response-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  timestamp: new Date().toISOString(),
  source: 'cursor',

  // Hook identification
  hookType: hookType,
  isFinal: isStopHook,

  // Stop-specific fields (only from stop hook)
  stopReason: isStopHook ? (input.status || 'error') : undefined,
  loopCount: isStopHook ? (input.loop_count || 0) : undefined,

  // Response content (only from afterAgentResponse - stop hook has no text)
  response: isStopHook ? '' : (input.response || input.text || '').substring(0, 5000),

  // Common Cursor fields (available in both hooks)
  conversationId: input.conversation_id,
  generationId: input.generation_id,
  model: input.model,
  workspaceRoots: input.workspace_roots || [],
  cursorVersion: input.cursor_version,
  userEmail: input.user_email,

  // Tool calls (only in afterAgentResponse)
  toolCalls: isStopHook ? [] : (input.tool_calls || []).slice(0, 10).map(tc => ({
    name: tc.name || tc.tool,
    arguments: tc.arguments || tc.params || {}
  })),

  // Files modified (only in afterAgentResponse)
  filesModified: isStopHook ? [] : (input.files_modified || []).slice(0, 20),

  // Success status
  success: isStopHook ? (input.status === 'completed') : (input.success !== false)
};
```

4. **Write differentiated output files** (replace lines 116-124):
```javascript
// Use different filename pattern for stop hook
const filePrefix = isStopHook ? 'cursor-response-final' : 'cursor-response';
const responseFile = path.join(vibeLogDir, `${filePrefix}-${Date.now()}.json`);
fs.writeFileSync(responseFile, JSON.stringify(responseData, null, 2));
debugLog(`Wrote ${isStopHook ? 'FINAL' : 'intermediate'} response file: ${responseFile}`);

// Update latest file (separate files for intermediate vs final)
const latestFileName = isStopHook ? 'latest-cursor-response-final.json' : 'latest-cursor-response.json';
const latestFile = path.join(vibeLogDir, latestFileName);
fs.writeFileSync(latestFile, JSON.stringify(responseData, null, 2));
debugLog(`Wrote latest file: ${latestFile}`);
```

---

### STEP 2: Update Response Types

**File:** `src/services/types/response-types.ts`

**Changes:**

1. **Update StopReason type** (replace line 27):
```typescript
/**
 * Stop reason - unified for both Cursor and Claude Code
 * Cursor uses: 'completed' | 'aborted' | 'error'
 * Claude Code uses: 'completed' | 'error' | 'cancelled'
 */
export type StopReason = 'completed' | 'aborted' | 'error' | 'cancelled';
```

2. **Extend CapturedResponse interface** (add after line 110, before closing brace):
```typescript
  // ========================================
  // Final Response Fields (Stop Hook)
  // ========================================

  /** Whether this is a final response (from stop hook) */
  isFinal?: boolean;

  /** Stop reason from Cursor stop hook: 'completed', 'aborted', 'error' */
  stopReason?: StopReason;

  /** Number of agent loop iterations (Cursor stop hook only) */
  loopCount?: number;

  /** Which hook triggered this capture */
  hookType?: 'afterAgentResponse' | 'stop' | 'Stop';

  /** User email from Cursor (available in all hooks) */
  userEmail?: string;
```

3. **Update RESPONSE_FILE_PATTERN** (replace line 128):
```typescript
/**
 * Response file pattern for file system watching
 * Matches:
 *   cursor-response-*.json (intermediate, afterAgentResponse)
 *   cursor-response-final-*.json (final, stop hook)
 *   claude-response-*.json (Claude Code)
 */
export const RESPONSE_FILE_PATTERN = /^(cursor-response(?:-final)?|claude-response)-\d+\.json$/;
```

4. **Update LATEST_RESPONSE_FILES** (replace lines 133-136):
```typescript
export const LATEST_RESPONSE_FILES = {
  cursor: 'latest-cursor-response.json',
  cursorFinal: 'latest-cursor-response-final.json',
  claude: 'latest-claude-response.json',
} as const;
```

5. **Update isLatestResponseFile** (replace lines 148-153):
```typescript
export function isLatestResponseFile(filename: string): boolean {
  return (
    filename === LATEST_RESPONSE_FILES.cursor ||
    filename === LATEST_RESPONSE_FILES.cursorFinal ||
    filename === LATEST_RESPONSE_FILES.claude
  );
}
```

6. **Update getSourceFromFilename** (replace lines 158-166):
```typescript
export function getSourceFromFilename(filename: string): 'cursor' | 'claude_code' | null {
  if (filename.startsWith('cursor-response-final-') || filename.startsWith('cursor-response-')) {
    return 'cursor';
  }
  if (filename.startsWith('claude-response-')) {
    return 'claude_code';
  }
  return null;
}
```

7. **Add isFinalResponseFile helper** (add after getSourceFromFilename):
```typescript
/**
 * Check if filename represents a final response (from stop hook)
 */
export function isFinalResponseFile(filename: string): boolean {
  return filename.includes('-response-final-');
}
```

8. **Add ConversationState type** (append to file):
```typescript
/**
 * Conversation state captured at stop hook
 * Aggregates data across entire conversation for coaching analysis
 */
export interface ConversationState {
  /** Conversation identifier */
  conversationId: string;

  /** When conversation started (first prompt timestamp) */
  startTime?: string;

  /** When conversation ended (stop hook timestamp) */
  endTime: string;

  /** Total duration in milliseconds */
  durationMs?: number;

  /** Number of user prompts in conversation */
  totalPrompts: number;

  /** Number of assistant responses (afterAgentResponse calls) */
  totalResponses: number;

  /** Final stop reason from Cursor */
  stopReason: StopReason;

  /** Agent loop iterations (from stop hook) */
  loopCount: number;

  /** All files modified during conversation (deduplicated) */
  filesModified: string[];

  /** All tools used during conversation (deduplicated) */
  toolsUsed: string[];
}
```

---

### STEP 3: Update HookBasedPromptService

**File:** `src/services/HookBasedPromptService.ts`

**Changes:**

1. **Add imports** (at top of file):
```typescript
import {
  CapturedResponse,
  ConversationState,
  StopReason,
  isFinalResponseFile
} from './types/response-types';
```

2. **Add conversation state tracking** (add as class properties):
```typescript
/**
 * Track conversation state for aggregating final coaching data
 * Key: 'cursor:{conversationId}' or 'claude:{sessionId}'
 */
private conversationStateMap: Map<string, {
  prompts: CapturedPrompt[];
  responses: CapturedResponse[];
  startTime?: Date;
}> = new Map();

/** TTL for conversation state (30 minutes) */
private readonly CONVERSATION_STATE_TTL = 30 * 60 * 1000;
```

3. **Update file watcher glob pattern** (in setupFileWatcher or similar):
```typescript
// Update glob pattern to include final response files
const pattern = '{prompt-*.json,claude-prompt-*.json,cursor-response-*.json,cursor-response-final-*.json,claude-response-*.json}';
```

4. **Track prompts in conversation state** (in handleNewFile, after emitting promptDetected):
```typescript
// Track prompt in conversation state for later aggregation
if (promptData.conversationId) {
  const linkKey = `cursor:${promptData.conversationId}`;
  let state = this.conversationStateMap.get(linkKey);

  if (!state) {
    state = {
      prompts: [],
      responses: [],
      startTime: new Date(promptData.timestamp)
    };
    this.conversationStateMap.set(linkKey, state);
  }

  state.prompts.push(promptData);
  this.cleanupConversationStateMap();
}
```

5. **Track intermediate responses** (in handleNewResponseFile, after processing):
```typescript
// Track intermediate responses for conversation state
if (response.conversationId && !response.isFinal) {
  const linkKey = `cursor:${response.conversationId}`;
  const state = this.conversationStateMap.get(linkKey);
  if (state) {
    state.responses.push(response);
  }
}
```

6. **Emit final response event** (in handleNewResponseFile, after responseDetected):
```typescript
// Handle final response from stop hook
if (response.isFinal) {
  console.log(`[HookBasedPromptService] Final response detected for conversation: ${response.conversationId}`);

  // Build aggregated conversation state
  const conversationState = this.buildConversationState(response);

  // Emit separate event for final responses
  this.emit('finalResponseDetected', {
    response,
    linkedPrompt,
    conversationState
  });

  // Notify webview
  this.notifyWebview('finalResponseDetected', {
    id: response.id,
    source: response.source,
    conversationId: response.conversationId,
    stopReason: response.stopReason,
    loopCount: response.loopCount,
    success: response.success,
    timestamp: response.timestamp,
    conversationState,
    linkedPromptId: linkedPrompt?.id,
    linkedPromptText: linkedPrompt?.prompt?.substring(0, 200),
  });

  // Clean up conversation state (conversation is complete)
  if (response.conversationId) {
    this.conversationStateMap.delete(`cursor:${response.conversationId}`);
  }
}
```

7. **Add buildConversationState method**:
```typescript
/**
 * Build aggregated conversation state from tracked prompts/responses
 * Called when stop hook fires
 */
private buildConversationState(finalResponse: CapturedResponse): ConversationState | null {
  const conversationId = finalResponse.conversationId;
  if (!conversationId) {
    return null;
  }

  const linkKey = `cursor:${conversationId}`;
  const state = this.conversationStateMap.get(linkKey);

  if (!state) {
    console.log(`[HookBasedPromptService] No conversation state found for: ${conversationId}`);
    // Return minimal state from just the final response
    return {
      conversationId,
      endTime: finalResponse.timestamp,
      totalPrompts: 0,
      totalResponses: 0,
      stopReason: finalResponse.stopReason || 'completed',
      loopCount: finalResponse.loopCount || 0,
      filesModified: [],
      toolsUsed: [],
    };
  }

  const endTime = new Date(finalResponse.timestamp);
  const durationMs = state.startTime
    ? endTime.getTime() - state.startTime.getTime()
    : undefined;

  // Aggregate files modified across all responses
  const filesModified = new Set<string>();
  state.responses.forEach(r => {
    r.filesModified?.forEach(f => filesModified.add(f));
  });

  // Aggregate tools used across all responses
  const toolsUsed = new Set<string>();
  state.responses.forEach(r => {
    r.toolCalls?.forEach(tc => toolsUsed.add(tc.name));
  });

  return {
    conversationId,
    startTime: state.startTime?.toISOString(),
    endTime: endTime.toISOString(),
    durationMs,
    totalPrompts: state.prompts.length,
    totalResponses: state.responses.length,
    stopReason: finalResponse.stopReason || 'completed',
    loopCount: finalResponse.loopCount || 0,
    filesModified: Array.from(filesModified),
    toolsUsed: Array.from(toolsUsed),
  };
}
```

8. **Add cleanup method**:
```typescript
/**
 * Clean up old conversation state entries (> 30 minutes)
 */
private cleanupConversationStateMap(): void {
  const now = Date.now();
  const toDelete: string[] = [];

  for (const [key, state] of this.conversationStateMap.entries()) {
    if (state.startTime && now - state.startTime.getTime() > this.CONVERSATION_STATE_TTL) {
      toDelete.push(key);
    }
  }

  toDelete.forEach(key => this.conversationStateMap.delete(key));

  if (toDelete.length > 0) {
    console.log(`[HookBasedPromptService] Cleaned up ${toDelete.length} old conversation states`);
  }
}
```

9. **Install stop hook** (in installHooks method, after afterAgentResponse):
```typescript
// Install stop hook (same script, different hook - script detects via hook_event_name)
if (!config.hooks.stop) {
  config.hooks.stop = [];
}

// Remove existing vibe-log hooks to prevent duplicates
config.hooks.stop = config.hooks.stop.filter(
  (h: any) => !h.command?.includes('vibe-log') && !h.command?.includes('post-response')
);

config.hooks.stop.push({
  command: `node "${responseHookPath}"`
});

console.log('[HookBasedPromptService] Installed 3 Cursor hooks: beforeSubmitPrompt, afterAgentResponse, stop');
```

10. **Update event types** (if using typed events):
```typescript
export type HookServiceEvent =
  | 'promptDetected'
  | 'responseDetected'
  | 'finalResponseDetected'
  | 'analysisComplete';
```

---

### STEP 4: Update V2MessageHandler

**File:** `src/panels/V2MessageHandler.ts`

**Changes:**

1. **Add import**:
```typescript
import { ConversationState } from '../services/types/response-types';
```

2. **Add final response listener** (after existing responseDetected listener):
```typescript
// Listen for final responses (from stop hook)
hookService.on('finalResponseDetected', async (data: {
  response: CapturedResponse;
  linkedPrompt?: CapturedPrompt;
  conversationState: ConversationState | null;
}) => {
  console.log('[V2MessageHandler] Final response detected:', data.response.id);

  this.sendMessage('finalResponseDetected', {
    id: data.response.id,
    source: data.response.source,
    stopReason: data.response.stopReason,
    loopCount: data.response.loopCount,
    success: data.response.success,
    conversationId: data.response.conversationId,
    timestamp: data.response.timestamp,
    conversationState: data.conversationState,
    linkedPromptId: data.linkedPrompt?.id,
    linkedPromptText: data.linkedPrompt?.prompt?.substring(0, 200),
  });

  // Future: Trigger comprehensive coaching analysis using conversationState
  // This could analyze the entire conversation flow for coaching insights
});
```

---

### STEP 5: Update Webview Types

**File:** `webview/menu/state/types-v2.ts`

**Changes:**

1. **Add ConversationState type** (or import from shared types):
```typescript
export interface ConversationState {
  conversationId: string;
  startTime?: string;
  endTime: string;
  durationMs?: number;
  totalPrompts: number;
  totalResponses: number;
  stopReason: 'completed' | 'aborted' | 'error' | 'cancelled';
  loopCount: number;
  filesModified: string[];
  toolsUsed: string[];
}
```

2. **Add finalResponseDetected message type** (in message types union):
```typescript
export interface FinalResponseDetectedMessage {
  type: 'finalResponseDetected';
  id: string;
  source: 'cursor' | 'claude_code';
  stopReason: string;
  loopCount: number;
  success: boolean;
  conversationId?: string;
  timestamp: string;
  conversationState: ConversationState | null;
  linkedPromptId?: string;
  linkedPromptText?: string;
}
```

---

## Testing Strategy

### Phase 1: Script Testing (Standalone)

```bash
# Test afterAgentResponse hook
echo '{"hook_event_name":"afterAgentResponse","response":"Hello world","conversation_id":"conv-123","model":"claude-3-5-sonnet"}' | node src/cursor-hooks/post-response.js

# Expected output file: cursor-response-{timestamp}.json
# Expected content: hookType="afterAgentResponse", isFinal=false, response="Hello world"

# Test stop hook
echo '{"hook_event_name":"stop","status":"completed","loop_count":3,"conversation_id":"conv-123","model":"claude-3-5-sonnet"}' | node src/cursor-hooks/post-response.js

# Expected output file: cursor-response-final-{timestamp}.json
# Expected content: hookType="stop", isFinal=true, stopReason="completed", loopCount=3, response=""
```

### Phase 2: Type Checking

```bash
npm run typecheck
```

### Phase 3: Integration Testing

1. Enable auto-analyze in extension
2. Verify `~/.cursor/hooks.json` contains all 3 hooks:
   ```json
   {
     "version": 1,
     "hooks": {
       "beforeSubmitPrompt": [...],
       "afterAgentResponse": [...],
       "stop": [...]
     }
   }
   ```
3. Run a Cursor composer session
4. Check `/tmp/vibe-log-hooks/` (or OS equivalent) for:
   - Multiple `cursor-response-*.json` files (intermediate)
   - One `cursor-response-final-*.json` file (when conversation ends)
5. Verify `finalResponseDetected` event fires in extension logs

---

## Critical Files Summary

**Files to Modify:**
| File | Changes |
|------|---------|
| `src/cursor-hooks/post-response.js` | Hook detection, differentiated output files |
| `src/services/types/response-types.ts` | New types, updated patterns and helpers |
| `src/services/HookBasedPromptService.ts` | Conversation tracking, stop hook installation, final events |
| `src/panels/V2MessageHandler.ts` | Final response event listener |
| `webview/menu/state/types-v2.ts` | Message types for webview |

**No Changes Needed:**
- `build.js` - Already copies post-response.js to dist/

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| File pattern collision | Defensive JSON parsing with try-catch |
| Memory leak from conversation state | 30-minute TTL cleanup on every new prompt |
| Stop hook never fires | Intermediate responses still captured; coaching works without final state |
| Old hooks remain installed | Filter removes existing vibe-log hooks before adding new |

---

## Benefits

- **Better coaching accuracy**: Know when conversation actually ended vs intermediate step
- **Aggregate metrics**: Total prompts, responses, duration, files modified
- **Stop reason tracking**: Distinguish completed vs aborted vs error
- **Loop count insight**: Understand agent iteration patterns
- **Backward compatible**: Existing functionality unchanged
