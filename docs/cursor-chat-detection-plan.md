# Cursor Chat Detection & Co-pilot Context Plan

**Created:** 2025-12-04
**Status:** Phases 1-3 COMPLETE. Phase 4 (workspace databases) pending.

---

## Goal

1. Auto-detect new messages in Cursor chats
2. Detect which chat is currently highlighted/selected by user
3. Update co-pilot context based on active chat

---

## Current State (Already Exists)

| Component | Location | Status |
|-----------|----------|--------|
| `CursorSessionReader` | `src/cursor-integration/session-reader.ts` | Connects to Cursor SQLite DB |
| `SessionTracker` | `src/cursor-integration/session-tracker.ts` | In-memory state management |
| `AutoAnalyzeService` | `src/services/AutoAnalyzeService.ts` | File watcher + polling |
| Database connection | `cursorDiskKV` table | Working |

**Gap:** Creates mock prompts (lines 306-316) instead of extracting real message content.

---

## Cursor's Database Architecture

**Location:**
- Windows: `%APPDATA%\Roaming\Cursor\User\globalStorage\state.vscdb`
- macOS: `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`

**Table:** `cursorDiskKV`
**Key pattern:** `composerData:<composerId>`

**Message formats (varies by Cursor version):**
```typescript
// Format 1: Inline array
{ messages: [{role: 'user', content: '...'}] }

// Format 2: Transitional (separate keys)
bubbleId:{composerId}:{index} -> {role, content, timestamp}

// Format 3: Conversation array
{ conversation: [...], conversationHistory: [...] }
```

---

## Implementation Phases

### Phase 1: Extract Real Messages (HIGH PRIORITY)

**Files to modify:**

1. **`src/cursor-integration/types.ts`**
   ```typescript
   export interface MessageData {
     id: string;
     role: 'user' | 'assistant';
     content: string;
     timestamp: string;
     metadata?: Record<string, unknown>;
   }
   ```

2. **`src/cursor-integration/session-reader.ts`**
   - Add `getSessionMessages(sessionId: string): MessageData[]`
   - Add `getBubbleMessages(composerId: string): MessageData[]`
   - Add `getAllMessagesForSession(sessionId: string): MessageData[]`

3. **`src/services/AutoAnalyzeService.ts`**
   - Replace mock prompts (lines 305-316) with real content
   - Track message IDs (not just counts) for accurate new message detection

---

### Phase 2: Detect Active Composer (MEDIUM PRIORITY)

**New file:** `src/cursor-integration/active-composer-detector.ts`

```typescript
export class ActiveComposerDetector {
  private currentComposerId: string | null = null;
  onActiveComposerChanged: ((id: string | null) => void) | null = null;

  startMonitoring(): void {
    // Monitor vscode.window.onDidChangeActiveTextEditor
    // Match workspace to known sessions
    // Use VS Code context keys if available
  }

  getCurrentComposerId(): string | null {
    return this.currentComposerId;
  }
}
```

**Research needed:** Run `Developer: Inspect Context Keys` in Cursor to find context keys like `inComposer`, `activeComposerId`.

---

### Phase 3: Dynamic Co-pilot Context (MEDIUM PRIORITY)

**New file:** `src/cursor-integration/context-manager.ts`

- Store current chat context (last N messages, files, workspace)
- Expose `getCurrentChatContext()` for co-pilot prompts
- Sync with `LLMManager` when active chat changes
- Update webview to show "Monitoring: [Chat Name]"

---

### Phase 4: Workspace Databases (LOW PRIORITY)

- Scan `workspaceStorage/<hash>/state.vscdb` for project-specific chats
- Merge with global storage queries

---

## Technical Notes

- **Database locking:** Cursor may lock DB; implement retry with WAL mode
- **Dual detection:** Keep file watcher (fast) + polling (reliable fallback)
- **Format detection:** Auto-detect by inspecting JSON structure
- **Performance:** Cache parsed sessions, re-parse only on timestamp change

---

## Implementation Status

- [x] Add MessageData interface to types.ts
- [x] Add getSessionMessages() to session-reader.ts
- [x] Add getBubbleMessages() for transitional format
- [x] Add getAllMessagesForSession() unified method
- [x] Replace mock prompts in AutoAnalyzeService
- [x] Create ActiveComposerDetector class
- [x] Create ContextManager for co-pilot context
- [x] Integrate active composer detection with AutoAnalyzeService

**Phase 4 (Workspace Databases):** Still pending - low priority

---

## Quick Start Tomorrow

```bash
# Resume from this plan
cd C:\vibelog\vibe-log-cursor-extentstion
# Start with Phase 1, Task 1: Add MessageData interface
```
