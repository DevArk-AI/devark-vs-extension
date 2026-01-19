# Session Organization Fix - Implementation Plan

## Problem
When prompts/responses are detected (from hooks or polling), they appear in the current active session instead of their correct historical session. Users can't see which sessions have new activity.

## Root Cause
`SessionManagerService.onPromptDetected()` (line 715) always uses `getActiveSession()` and ignores the `sourceSessionId` (Cursor composer ID or Claude Code session ID) that could route prompts to their correct sessions.

## Requirements
1. **Route prompts to correct sessions** based on sourceSessionId
2. **Appendable historical sessions** - new prompts can be added to historical sessions if they match the same source ID
3. **Dot indicator** - show a simple dot on sessions with unread activity
4. **Background load** - historical data loads in background, routed to correct sessions
5. **Response polling** - responses from CoachingService also need correct session routing

---

## Implementation Steps

### Step 1: Add `hasUnreadActivity` and `sourceSessionId` to Session Types

**File: `src/services/types/session-types.ts`**
- Add `hasUnreadActivity?: boolean` to `Session` interface (after line 114)
- Add `sourceSessionId?: string` to `Session.metadata` interface (line 124) - this stores the Claude Code session_id or Cursor conversation_id

**File: `webview/menu/state/types-v2.ts`**
- Add `hasUnreadActivity?: boolean` to `Session` interface (after line 45)

---

### Step 2: Add Session Routing in SessionManagerService

**File: `src/services/SessionManagerService.ts`**

1. **Add `findSessionBySourceId()` method** (after line 472):
```typescript
private findSessionBySourceId(sourceSessionId: string): Session | null {
  for (const project of this.projects.values()) {
    for (const session of project.sessions) {
      const sessionSourceId = session.metadata?.sourceSessionId || session.metadata?.cursorComposerId;
      if (sessionSourceId === sourceSessionId) {
        return session;
      }
    }
  }
  return null;
}
```

2. **Update `onPromptDetected()` signature** (line 708):
   - Add `sourceSessionId?: string` to parameter object

3. **Update `onPromptDetected()` routing logic** (replace lines 714-719):
```typescript
// STRICT: sourceSessionId is REQUIRED - discard prompts without it
if (!promptData.sourceSessionId) {
  console.warn('[SessionManager] Discarding prompt - no sourceSessionId provided');
  return '';
}

// Find existing session by sourceSessionId, or create new one
let session = this.findSessionBySourceId(promptData.sourceSessionId);

if (!session) {
  // sourceSessionId not found in history - create new session for it
  console.log('[SessionManager] Creating new session for sourceSessionId:', promptData.sourceSessionId);
  const project = this.detectCurrentProject() || this.getOrCreateDefaultProject();
  session = this.createSession(project.id, this.detectCurrentPlatform(), promptData.sourceSessionId);
}

// Mark as unread if not the currently viewed session
const isCurrentlyViewed = session.id === this.activeSessionId;
if (!isCurrentlyViewed) {
  session.hasUnreadActivity = true;
}
```

4. **Add `markSessionAsRead()` method**:
```typescript
public async markSessionAsRead(sessionId: string): Promise<void> {
  for (const project of this.projects.values()) {
    const session = project.sessions.find(s => s.id === sessionId);
    if (session && session.hasUnreadActivity) {
      session.hasUnreadActivity = false;
      await this.saveState();
      this.emitEvent({
        type: 'session_updated',
        sessionId,
        projectId: project.id,
        timestamp: new Date(),
        data: { hasUnreadActivity: false },
      });
      return;
    }
  }
}
```

5. **Update `switchSession()` to auto-clear unread** (line 485):
   - After setting `this.activeSessionId = sessionId;`, add:
   ```typescript
   if (session.hasUnreadActivity) {
     session.hasUnreadActivity = false;
   }
   ```

---

### Step 3: Pass sourceSessionId Through Detection Chain

**File: `src/services/UnifiedPromptDetectionService.ts`**
- In `syncWithSessionManager()` (around line 348), update call to `onPromptDetected()`:
```typescript
const promptId = await sessionManager.onPromptDetected({
  id: prompt.id,
  text: prompt.text,
  timestamp: prompt.timestamp,
  sourceId: prompt.source.id as KnownSourceId,
  sourceSessionId: prompt.context?.sourceSessionId,  // ADD THIS
});
```

---

### Step 4: Add UI Handler for markSessionAsRead

**File: `src/panels/V2MessageHandler.ts`**

1. **Add case in handleMessage switch** (around line 765):
```typescript
case 'markSessionAsRead':
  await this.handleMarkSessionAsRead(data?.sessionId);
  break;
```

2. **Add handler method**:
```typescript
private async handleMarkSessionAsRead(sessionId?: string): Promise<void> {
  if (!sessionId) return;
  await this.sessionManagerService.markSessionAsRead(sessionId);
  await this.handleV2GetSessionList();
}
```

---

### Step 5: Add Dot Indicator to Sidebar UI

**File: `webview/menu/components/v2/Sidebar.tsx`**
- In `SessionItem` component (around line 356), add dot indicator before closing `</button>`:
```tsx
{session.hasUnreadActivity && !isActive && (
  <span className="vl-session-unread-dot" title="New activity" />
)}
```

**File: `webview/menu/styles/redesign.css`**
- Add CSS for unread dot:
```css
.vl-session-unread-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--vscode-notificationsInfoIcon-foreground, #3794ff);
  margin-left: auto;
  flex-shrink: 0;
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/services/types/session-types.ts` | Add `hasUnreadActivity` to Session |
| `webview/menu/state/types-v2.ts` | Add `hasUnreadActivity` to Session |
| `src/services/SessionManagerService.ts` | Add routing logic + `findSessionBySourceId()` + `markSessionAsRead()` |
| `src/services/UnifiedPromptDetectionService.ts` | Pass `sourceSessionId` to `onPromptDetected()` |
| `src/panels/V2MessageHandler.ts` | Add `markSessionAsRead` handler |
| `webview/menu/components/v2/Sidebar.tsx` | Add dot indicator |
| `webview/menu/styles/redesign.css` | Add dot styles |

---

## Data Flow After Fix

```
Hook/Polling → Adapter → DetectedPrompt { context.sourceSessionId }
                              ↓
              UnifiedPromptDetectionService.handleDetectedPrompt()
                              ↓
              onPromptDetected({ sourceSessionId })
                              ↓
              findSessionBySourceId() → correct session
                              ↓
              Mark hasUnreadActivity if not active
                              ↓
              UI shows dot indicator on session
```

---

## Edge Cases

1. **No sourceSessionId (missing)**: **DISCARD the prompt** - don't show, don't add to any session
2. **sourceSessionId not found in history**: **CREATE new session** for this sourceSessionId and add the prompt there
3. **Session is currently active**: Don't mark as unread
4. **User switches to session**: Auto-clear unread flag

## Source IDs Being Captured

The hooks already capture native IDs:
- **Claude Code**: `session_id` from `input.session_id` → stored as `sourceSessionId`
- **Cursor**: `conversation_id` from `input.conversation_id` → stored as `sourceSessionId`

These are passed through adapters:
- `claude-code-adapter.ts:335` → `sourceSessionId: hookData.sessionId`
- `cursor-adapter.ts:344` → `sourceSessionId: hookData.conversationId`

The problem is `UnifiedPromptDetectionService` doesn't pass it to `onPromptDetected()`.
