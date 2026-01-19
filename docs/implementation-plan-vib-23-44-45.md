# Implementation Plan: VIB-23, VIB-44, and VIB-45

## Executive Summary

This plan addresses three related data persistence and UI state management issues in the Vibe-Log VSCode Extension:

1. **VIB-23**: Store historical prompt scores locally (Low priority)
2. **VIB-44**: Store last improved/enhanced prompt (Medium priority)
3. **VIB-45**: Sidebar session name should be goal name (Medium priority)

All three issues involve persisting data across session switches and ensuring the UI displays previously computed/set data.

---

## Codebase Analysis

### Current Storage Architecture

The extension has **three storage layers**:

1. **CoPilotStorageManager** (`src/copilot/storage.ts`)
   - Filesystem storage for analyses and coaching data
   - VS Code globalState for sessions and settings
   - Memory cache (L1) with disk fallback (L2)
   - Already supports: `saveCoaching`, `loadCoaching`, `saveAnalysis`, `loadAnalysis`

2. **SessionManagerService** (`src/services/SessionManagerService.ts`)
   - Central session and prompt tracking
   - Persists via `SessionPersistenceService`
   - **PromptRecord** already has `enhancedText` and `enhancedScore` fields
   - Sessions already have `goal` field

3. **PromptHistoryStore** (`src/storage/PromptHistoryStore.ts`)
   - VS Code globalState for prompt analysis history
   - Already stores: `score`, `breakdown`, `improvedVersion`, `improvedScore`
   - Limited to 100 prompts, 30-day retention

### Key Finding: Data Already Exists, Retrieval/Display Is Broken

**VIB-23 (Prompt Scores):**
- `PromptRecord` in `session-types.ts` already has `score` and `breakdown` fields
- `PromptManagementService.updatePromptScore()` already updates these fields
- **Problem**: Scores are not being synced between PromptHistoryStore and SessionManagerService

**VIB-44 (Improved Prompt):**
- `PromptRecord` already has `enhancedText` and `enhancedScore` fields
- **Problem**: Enhanced prompts are not being saved/restored when switching sessions

**VIB-45 (Session Name = Goal):**
- Session already has `goal` field
- **Problem**: `getSessionDisplayName()` doesn't consider goal as display name

---

## Recommended Implementation Order

### Phase 1: VIB-23 - Store Historical Prompt Scores Locally
**Priority**: Low but foundational - fixes the infrastructure that VIB-44 also needs

### Phase 2: VIB-44 - Store Last Improved Prompt
**Priority**: Medium - builds on VIB-23 infrastructure

### Phase 3: VIB-45 - Sidebar Session Name Should Be Goal Name
**Priority**: Medium - independent UI change

---

## Phase 1: VIB-23 - Store Historical Prompt Scores Locally

### Root Cause Analysis
The prompt scoring pipeline saves to `PromptHistoryStore` but the session-based prompt list comes from `SessionManagerService.prompts[]`. These are two separate storage locations, and scores are not being synced between them properly.

### Implementation Steps

#### Step 1.1: Verify Prompt ID Consistency

File: `src/panels/handlers/prompt-analysis-handler.ts`
- Prompt IDs are generated differently in different places
- Ensure the same prompt ID is used in both SessionManager and PromptHistoryStore

#### Step 1.2: Bridge PromptHistoryStore and SessionManager

File: `src/services/HookBasedPromptService.ts`
- Get prompt ID from `SessionManagerService.onPromptDetected()` return value
- Pass this ID to the scoring/enhancement pipeline
- After scoring, call `SessionManagerService.updatePromptScore()` with correct ID

#### Step 1.3: Update Prompt Analysis Handler

File: `src/panels/handlers/prompt-analysis-handler.ts`
- Accept existing `promptId` from caller (auto-analyze flow)
- Use that ID when saving to `PromptHistoryStore`
- Call `SessionManagerService.updatePromptScore(promptId, score, breakdown)`

### Test Scenarios
1. Analyze a prompt manually via Prompt Lab
2. Switch to a different session and back
3. Verify the prompt history shows the correct score
4. Restart the extension and verify scores persist

---

## Phase 2: VIB-44 - Store Last Improved Prompt

### Root Cause Analysis
When switching sessions:
1. `CoPilotView` state (`currentAnalysis`) is reset
2. The previous improved version is lost (only in React state)
3. `PromptRecord.enhancedText`/`enhancedScore` fields exist but aren't populated/retrieved

### Implementation Steps

#### Step 2.1: Ensure Enhanced Prompt Is Saved

File: `src/panels/handlers/prompt-analysis-handler.ts`

After enhancement completes, call:
```typescript
sessionManagerService.updatePromptScore(
  promptId,
  scoreResult.overall / 10,
  scoreResult.breakdown,
  enhanceResult.enhanced.enhanced,  // enhancedText
  enhanceResult.enhancedScore?.overall / 10  // enhancedScore
);
```

#### Step 2.2: Restore Enhanced Prompt on Session Switch

File: `src/panels/handlers/session-handler.ts`

In `handleSwitchSession()`, when auto-selecting first prompt:
1. Check if `firstPrompt.enhancedText` exists
2. Send full prompt data including enhanced version to webview

#### Step 2.3: Update CoPilotView to Restore Enhanced Prompt

File: `webview/menu/components/v2/CoPilotView.tsx`

When `state.currentAnalysis` changes:
1. Check if prompt has `improvedVersion`
2. Update `editedImprovedPrompt` state to match

### Test Scenarios
1. Analyze a prompt, wait for enhancement to complete
2. Switch to a different session
3. Switch back to the original session
4. Verify "IMPROVED" section shows the previously generated improvement
5. Restart extension and verify improved prompt persists

---

## Phase 3: VIB-45 - Sidebar Session Name Should Be Goal Name

### Root Cause Analysis
`ActiveSessionSwitcher.tsx` function `getSessionDisplayName()` only checks:
1. `session.customName` (user-set name)
2. Falls back to `session.projectName`

It does NOT check `session.goal`.

### Implementation Steps

#### Step 3.1: Update getSessionDisplayName Function

File: `webview/menu/components/v2/ActiveSessionSwitcher.tsx`

```typescript
function getSessionDisplayName(session: ActiveSession): string {
  // Priority: 1) customName, 2) goal, 3) projectName
  const name = session.customName || session.goal;

  if (name) {
    const truncated = name.length > 30 ? name.substring(0, 27) + '...' : name;
    return `${truncated} (${session.projectName})`;
  }

  return session.projectName;
}
```

#### Step 3.2: Trigger Session List Refresh on Goal Set

File: `src/panels/handlers/goals-handler.ts`

When goal is set via `v2SetGoal`:
1. After saving the goal, trigger a session list refresh
2. Emit `v2SessionList` update so sidebar refreshes

### Test Scenarios
1. Create a new session with no goal
2. Set a goal via the goal input
3. Verify sidebar updates to show goal as session name
4. Clear the goal - verify sidebar falls back to project name
5. Set a `customName` - verify it takes priority over goal

---

## Files to Modify Summary

### VIB-23 (Prompt Scores)
| File | Change |
|------|--------|
| `src/services/HookBasedPromptService.ts` | Pass prompt ID to scoring pipeline |
| `src/panels/handlers/prompt-analysis-handler.ts` | Accept existing promptId, call updatePromptScore |
| `src/panels/CoPilotCoordinator.ts` | Wire prompt ID through analysis flow |

### VIB-44 (Improved Prompt)
| File | Change |
|------|--------|
| `src/panels/handlers/prompt-analysis-handler.ts` | Call updatePromptScore with enhanced text |
| `src/panels/handlers/session-handler.ts` | Include enhanced data in v2PromptAutoSelected |
| `webview/menu/components/v2/CoPilotView.tsx` | Restore enhanced prompt from persisted data |

### VIB-45 (Session Name = Goal)
| File | Change |
|------|--------|
| `webview/menu/components/v2/ActiveSessionSwitcher.tsx` | Update getSessionDisplayName to use goal |
| `src/panels/handlers/goals-handler.ts` | Trigger session list refresh on goal set |

---

## Critical Code References

- **`src/services/session-manager/PromptManagementService.ts:152-195`** - `updatePromptScore()` method
- **`src/panels/handlers/prompt-analysis-handler.ts`** - Orchestrates prompt analysis
- **`webview/menu/components/v2/ActiveSessionSwitcher.tsx:94-106`** - `getSessionDisplayName()`
- **`src/panels/handlers/session-handler.ts:142-173`** - `handleSwitchSession()`
- **`src/services/types/session-types.ts`** - `PromptRecord` interface definition
