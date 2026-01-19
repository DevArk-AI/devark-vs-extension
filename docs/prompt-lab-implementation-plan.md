# Prompt Lab Implementation Plan

## Overview

Add a **Prompt Lab** feature - a standalone sandbox for testing and improving prompts, isolated from auto-detected session prompts. Includes saved prompts library and rename functionality.

## Requirements Summary

1. **Prompt Lab toggle** - Next to PROJECTS header in sidebar with `flask-conical` icon
2. **Prompt Lab view** - Cloud status, input box, "Analyze and Improve" button
3. **Same analysis behavior** - Full parallel LLM analysis (score + enhance + score enhanced)
4. **Isolated from auto-detection** - Never updates from auto-captured prompts
5. **Remove manual input from CoPilotView** - Lines 178-197 in CoPilotView.tsx
6. **Save prompts** - Global library + per-project with tags/folders
7. **Rename sessions/prompts** - Inline editing + right-click context menu
8. **Delete sessions** - Delete individual sessions via context menu

---

## Files to Create

### 1. `src/storage/SavedPromptsStore.ts` (NEW)
Persistence layer for saved prompts library.

```typescript
interface SavedPrompt {
  id: string;
  text: string;
  name?: string;
  tags: string[];
  folder?: string;
  projectId?: string; // null = global
  createdAt: Date;
  lastModifiedAt: Date;
  lastScore?: number;
}
```

Methods: `savePrompt()`, `updatePrompt()`, `deletePrompt()`, `getByProject()`, `getByTag()`, `search()`

### 2. `webview/menu/components/v2/PromptLabView.tsx` (NEW)
Main Prompt Lab component with:
- Cloud status badge (Vibe-Log sync status)
- Textarea input for prompt
- "Analyze and Improve" button
- Progressive results display (reuse PromptScore, ScoreBreakdown)
- Save button for prompts
- Saved prompts library grid

### 3. `webview/menu/components/v2/SavedPromptsLibrary.tsx` (NEW)
Grid of saved prompts with:
- Filter by tags/folders/project
- Search functionality
- Click to load into input

### 4. `webview/menu/components/v2/SavedPromptCard.tsx` (NEW)
Individual prompt card with:
- Name, truncated text, tags
- Right-click context menu (rename, delete)
- Double-click to edit name

### 5. `webview/menu/components/v2/InlineEditInput.tsx` (NEW)
Reusable inline editor component for rename functionality.

### 6. `webview/menu/components/v2/ContextMenu.tsx` (NEW)
Right-click context menu component for sessions and prompts.

---

## Files to Modify

### 1. `webview/menu/components/v2/Sidebar.tsx`

**Location**: Lines 108-140 (PROJECTS section header)

**Changes**:
- Add `FlaskConical` icon import from lucide-react
- Add `sidebarMode` state: `'projects' | 'prompt-lab'`
- Replace section header with toggle buttons for PROJECTS / PROMPT LAB
- Conditionally render projects list OR PromptLabView based on mode

```tsx
// New header structure (replace lines 108-112)
<div className="vl-sidebar-section-header vl-sidebar-mode-header">
  <button className={`vl-mode-btn ${sidebarMode === 'projects' ? 'active' : ''}`}
    onClick={() => setSidebarMode('projects')}>
    <Folder size={14} />
    {showLabels && <span>PROJECTS</span>}
  </button>
  <button className={`vl-mode-btn ${sidebarMode === 'prompt-lab' ? 'active' : ''}`}
    onClick={() => setSidebarMode('prompt-lab')}>
    <FlaskConical size={14} />
    {showLabels && <span>PROMPT LAB</span>}
  </button>
</div>
```

### 2. `webview/menu/components/v2/CoPilotView.tsx`

**Change**: DELETE lines 178-197 (prompt input section)

The "Paste a prompt to test it out..." textarea moves to Prompt Lab.

### 3. `webview/menu/state/types-v2.ts`

**Add State**:
```typescript
interface AppStateV2 {
  // ... existing
  sidebarMode: 'projects' | 'prompt-lab';
  promptLab: {
    currentPrompt: string;
    isAnalyzing: boolean;
    isEnhancing: boolean;
    isScoringEnhanced: boolean;
    currentAnalysis: AnalyzedPrompt | null;
    savedPrompts: SavedPrompt[];
    selectedTags: string[];
    selectedFolder?: string;
  };
}

interface Session {
  // ... existing
  customName?: string; // For rename feature
}
```

**Add Actions**:
```typescript
| { type: 'SET_SIDEBAR_MODE'; payload: 'projects' | 'prompt-lab' }
| { type: 'SET_PROMPT_LAB_PROMPT'; payload: string }
| { type: 'START_PROMPT_LAB_ANALYSIS' }
| { type: 'PROMPT_LAB_SCORE_RECEIVED'; payload: ScoreData }
| { type: 'PROMPT_LAB_ENHANCED_READY'; payload: { improvedVersion: string } }
| { type: 'PROMPT_LAB_ENHANCED_SCORE_READY'; payload: { improvedScore: number } }
| { type: 'SET_SAVED_PROMPTS'; payload: SavedPrompt[] }
| { type: 'ADD_SAVED_PROMPT'; payload: SavedPrompt }
| { type: 'DELETE_SAVED_PROMPT'; payload: string }
| { type: 'RENAME_SESSION'; payload: { sessionId: string; customName: string } }
| { type: 'DELETE_SESSION'; payload: { sessionId: string } }
```

### 4. `webview/menu/AppV2.tsx`

**Add Reducer Cases** (after line 417):
- Handle all new Prompt Lab actions
- Keep Prompt Lab state completely separate from CoPilot state

**Add Message Handlers** (in useEffect around line 730):
```typescript
case 'promptLabScoreReceived':
  dispatch({ type: 'PROMPT_LAB_SCORE_RECEIVED', payload: message.data });
  break;
case 'promptLabEnhancedReady':
  dispatch({ type: 'PROMPT_LAB_ENHANCED_READY', payload: message.data });
  break;
// etc.
```

### 5. `src/panels/V2MessageHandler.ts`

**Add Message Handlers** (in handleMessage switch):
```typescript
case 'analyzePromptLabPrompt':
  await this.handleAnalyzePromptLabPrompt(data?.prompt);
  break;
case 'savePromptToLibrary':
  await this.handleSavePromptToLibrary(data);
  break;
case 'getSavedPrompts':
  await this.handleGetSavedPrompts();
  break;
case 'deleteSavedPrompt':
  await this.handleDeleteSavedPrompt(data?.id);
  break;
case 'renameSession':
  await this.handleRenameSession(data?.sessionId, data?.customName);
  break;
case 'renamePrompt':
  await this.handleRenamePrompt(data?.promptId, data?.name);
  break;
case 'deleteSession':
  await this.handleDeleteSession(data?.sessionId);
  break;
```

**Implement Handler Methods**:
- `handleAnalyzePromptLabPrompt()` - Same logic as `handleAnalyzePrompt()` but sends to `promptLab*` message types
- `handleSavePromptToLibrary()` - Save via SavedPromptsStore
- `handleRenameSession()` - Update session via SessionManagerService
- `handleDeleteSession()` - Delete session via SessionManagerService, emit event to refresh UI

### 6. `src/services/SessionManagerService.ts`

**Add Methods**:
```typescript
public async updateSession(sessionId: string, updates: Partial<Session>): Promise<void> {
  // Find session across all projects and update
  // Emit 'session_updated' event
}

public async deleteSession(sessionId: string): Promise<void> {
  // Find session across all projects
  // Remove from project's sessions array
  // If active session, clear activeSessionId
  // Save state
  // Emit 'session_deleted' event
}
```

### 7. `webview/menu/styles/redesign.css`

**Add CSS**:
```css
/* Sidebar Mode Toggle */
.vl-sidebar-mode-header { display: flex; gap: 4px; }
.vl-mode-btn { flex: 1; opacity: 0.6; }
.vl-mode-btn.active { opacity: 1; background: var(--vscode-button-secondaryBackground); }

/* Prompt Lab View */
.vl-prompt-lab-view { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.vl-prompt-lab-input { min-height: 80px; resize: vertical; }
.vl-prompt-lab-analyze-btn { /* Primary button styles */ }

/* Saved Prompts */
.vl-saved-prompts-library { margin-top: 16px; }
.vl-saved-prompt-card { /* Card styles with hover */ }

/* Context Menu */
.vl-context-menu { position: absolute; z-index: 1000; }

/* Inline Edit */
.vl-inline-edit-input { width: 100%; }
```

---

## Implementation Order

### Step 1: Backend Foundation
1. Create `SavedPromptsStore.ts`
2. Add `customName` to Session types
3. Add `updateSession()` and `deleteSession()` to SessionManagerService

### Step 2: State Management
1. Extend `types-v2.ts` with Prompt Lab state and actions
2. Add reducer cases in `AppV2.tsx`
3. Add initial state for promptLab

### Step 3: Prompt Lab UI
1. Create `PromptLabView.tsx` with input + analyze button
2. Modify `Sidebar.tsx` to add toggle and render PromptLabView
3. Add CSS styles

### Step 4: Analysis Integration
1. Add `analyzePromptLabPrompt` handler in V2MessageHandler
2. Add message handlers in AppV2.tsx for Prompt Lab responses
3. Display progressive results in PromptLabView

### Step 5: Saved Prompts
1. Create `SavedPromptsLibrary.tsx` and `SavedPromptCard.tsx`
2. Add save button to PromptLabView results
3. Add handlers for save/load/delete

### Step 6: Rename & Delete Features
1. Create `InlineEditInput.tsx` and `ContextMenu.tsx`
2. Add rename/delete handlers to V2MessageHandler
3. Add context menu to session items in Sidebar
4. Add inline edit to prompt cards

### Step 7: Cleanup
1. Remove prompt input from CoPilotView.tsx (lines 178-197)
2. Test isolation (verify auto-detected prompts don't update Prompt Lab)
3. Test all flows end-to-end

---

## Message Protocol

### Webview -> Extension
| Message | Data | Purpose |
|---------|------|---------|
| `analyzePromptLabPrompt` | `{ prompt: string }` | Analyze prompt in Prompt Lab |
| `savePromptToLibrary` | `{ text, name?, tags?, folder?, projectId? }` | Save prompt |
| `getSavedPrompts` | - | Load saved prompts |
| `deleteSavedPrompt` | `{ id }` | Delete saved prompt |
| `renameSession` | `{ sessionId, customName }` | Rename session |
| `renamePrompt` | `{ promptId, name }` | Rename saved prompt |
| `deleteSession` | `{ sessionId }` | Delete single session |

### Extension -> Webview
| Message | Data | Purpose |
|---------|------|---------|
| `promptLabScoreReceived` | `{ score, breakdown, explanation }` | Original score ready |
| `promptLabEnhancedReady` | `{ improvedVersion }` | Enhanced text ready |
| `promptLabEnhancedScoreReady` | `{ improvedScore }` | Enhanced score ready |
| `savedPromptsLoaded` | `{ prompts, tags, folders }` | Saved prompts list |
| `sessionRenamed` | `{ sessionId, customName }` | Session rename confirmed |
| `sessionDeleted` | `{ sessionId }` | Session delete confirmed |

---

## Key Design Decisions

1. **Isolation**: Prompt Lab has completely separate state (`state.promptLab`) from CoPilot (`state.currentPrompt`, `state.currentAnalysis`)

2. **Sidebar Mode Toggle**: Not a new main tab - toggles the sidebar content between Projects and Prompt Lab

3. **Reuse Components**: PromptScore, ScoreBreakdown, ContextBadge can be reused in PromptLabView

4. **Storage**: SavedPromptsStore uses VS Code globalState (same pattern as PromptHistoryStore)

5. **Rename UX**: Double-click for inline edit + right-click context menu (both supported)

6. **Delete Session**: Confirmation dialog before deletion, handles active session edge case

---

## ASCII Mockups

### Projects Mode (Default)
```
┌─────────────────────────────────────────────────────────────────┐
│  VIBE-LOG                                                        │
├─────────────────────────────────────────────────────────────────┤
│  [CO-PILOT]  [SUMMARIES]  [ACCOUNT]                             │
├──────────────┬──────────────────────────────────────────────────┤
│  SIDEBAR     │  MAIN CONTENT (Auto-Captured Prompts View)       │
│              │                                                   │
│  ┌───────────┤  ┌─ Cloud: Connected as @user ─────────────────┐ │
│  │[📁PROJECTS]│  └───────────────────────────────────────────-─┘ │
│  │[🧪PROMPT  ]│                                                   │
│  │   LAB     │  [Auto-analyze: ON]   Analyzed: 5 today           │
│  └───────────┤                                                   │
│              │  ┌─ COACH ───────────────────────────────────────┐│
│  📁 project-1│  │  💡 Try adding more context to your prompt   ││
│    └ 🟣 s1   │  └───────────────────────────────────────────────┘│
│    └ 🟣 s2   │                                                   │
│  📁 project-2│  ── Auto-captured results appear here ──          │
│              │                                                   │
│  ─────────── │  Your Prompt: "Add authentication to..."          │
│  GOAL        │  [Score: 7.2/10]                                  │
│  Add auth    │                                                   │
│              │  Improved:                                        │
│  ─────────── │  "Implement JWT authentication with..."           │
│  THIS SESSION│  [Score: 8.9/10]  [Use This] [Copy]               │
│  • prompt 1  │                                                   │
│  • prompt 2  │                                                   │
└──────────────┴──────────────────────────────────────────────────┘
```

### Prompt Lab Mode (Toggle Active)
```
┌─────────────────────────────────────────────────────────────────┐
│  VIBE-LOG                                                        │
├─────────────────────────────────────────────────────────────────┤
│  [CO-PILOT]  [SUMMARIES]  [ACCOUNT]                             │
├──────────────┬──────────────────────────────────────────────────┤
│  SIDEBAR     │  MAIN CONTENT (Prompt Lab View)                  │
│              │                                                   │
│  ┌───────────┤  ┌─ Cloud: Connected as @user ─────────────────┐ │
│  │[📁PROJECTS]│  └───────────────────────────────────────────-─┘ │
│  │[🧪PROMPT  ]│ ◄── ACTIVE                                       │
│  │   LAB     │  ┌───────────────────────────────────────────────┐│
│  └───────────┤  │ Enter a prompt to test and improve...         ││
│              │  │                                               ││
│  ─────────── │  │                                               ││
│  SAVED       │  └───────────────────────────────────────────────┘│
│  PROMPTS     │                                                   │
│  ─────────── │  [🔬 Analyze and Improve]                         │
│  ┌─────────┐ │                                                   │
│  │ My API  │ │  ── Analysis Results ──                           │
│  │ #api    │ │  Your Prompt Score: 6.5/10                        │
│  └─────────┘ │  [Breakdown: Specificity 7 | Context 5 | ...]     │
│  ┌─────────┐ │                                                   │
│  │ Debug   │ │  Improved Version:                                │
│  │ #debug  │ │  ┌───────────────────────────────────────────────┐│
│  └─────────┘ │  │ Enhanced prompt text appears here...          ││
│  ┌─────────┐ │  └───────────────────────────────────────────────┘│
│  │ Refactor│ │  Score: 8.2/10  [💾 Save] [📋 Copy] [Use This]    │
│  │ #code   │ │                                                   │
│  └─────────┘ │                                                   │
│              │                                                   │
│  [+ New]     │                                                   │
└──────────────┴──────────────────────────────────────────────────┘
```

### Sidebar Content by Mode

| Mode | Sidebar Shows |
|------|---------------|
| **Projects** | Toggle → PROJECTS list → GOAL → THIS SESSION |
| **Prompt Lab** | Toggle → SAVED PROMPTS library |

### Sidebar Toggle Detail
```
COLLAPSED (icons only):
┌────────┐
│  📁    │  <-- Click for Projects
│  🧪    │  <-- Click for Prompt Lab
└────────┘

EXPANDED (with labels):
┌──────────────────────────┐
│ [📁 PROJECTS][🧪 PROMPT LAB] │
│    ↑ active    ↑ inactive    │
└──────────────────────────┘
```

### Session Context Menu (Right-Click)
```
  📁 my-project
    └ 🟣 Session 1      <-- Right-click
         │
         ▼
      ┌──────────────┐
      │ ✏️ Rename    │
      │ 🗑️ Delete    │
      └──────────────┘
```

### Saved Prompt Card with Context Menu
```
┌─────────────────────────┐
│  My API Auth Prompt     │  <-- Double-click to rename
│  "Add authentication.." │
│  #api  #security        │
└─────────────────────────┘
         │ Right-click
         ▼
      ┌──────────────┐
      │ ✏️ Rename    │
      │ 📋 Copy      │
      │ 🗑️ Delete    │
      └──────────────┘
```

### Inline Rename UX
```
Before:
┌─────────────────────────┐
│  My API Auth Prompt     │
└─────────────────────────┘

After double-click:
┌─────────────────────────┐
│ [My API Auth Prompt   ] │  <-- Input, auto-focused
└─────────────────────────┘
  Enter = save, Esc = cancel
```

### Delete Confirmation Dialog
```
┌─────────────────────────────────┐
│  Delete Session?                │
│                                 │
│  Are you sure you want to       │
│  delete "Session 1"?            │
│  This will remove all prompts.  │
│                                 │
│  [Cancel]  [🗑️ Delete]          │
└─────────────────────────────────┘
```
