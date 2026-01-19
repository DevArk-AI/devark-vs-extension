# Co-Pilot View UX Redesign

## Overview

This document outlines the UX redesign for the Co-Pilot view in the Vibe-Log VS Code extension. The redesign addresses key usability issues and creates a clearer information hierarchy.

## Problem Statement

The current Co-Pilot view has several UX issues:

1. **Redundant Information**: The agent's response is echoed verbatim ("Agent completed: Done! Committed and pushed") when the user already saw this in their IDE
2. **Unclear Feature Separation**: Two distinct features (Coach and Prompt Feedback) are mixed together without clear boundaries
3. **Prompt Displayed Multiple Times**: The user's prompt appears in 3 places (Coach suggestion, Your Prompt section, Improved section)
4. **No Insightful Metadata**: The status doesn't show useful information like files modified
5. **Excessive Scrolling**: 7 separate sections require significant scrolling
6. **Cluttered Sidebar**: Historical prompts list adds noise without clear value
7. **Cloud Status Placement**: Account/cloud status takes prime real estate at top

## Two Distinct Features

The Co-Pilot view contains **two separate features** that serve different purposes:

### Feature 1: COACH (Forward-Looking)
- **Purpose**: Suggests the user's NEXT ACTION based on what the AI agent just completed
- **Temporal Direction**: Future ("What should I do next?")
- **User Intent**: Keep coding, stay in flow

### Feature 2: PROMPT FEEDBACK (Backward-Looking)
- **Purpose**: Analyzes how well the user wrote their PREVIOUS prompt
- **Temporal Direction**: Past ("How well did I prompt?")
- **User Intent**: Learn and improve prompting skills

These features are conceptually different but both relate to the same prompt/response cycle.

---

## Proposed Design

### Full Screen - Default State (Prompt Feedback Collapsed)

```
┌─────────────────────────────────────────────────────────────────┐
│  🎯 Goal: "Improve coach section UX"                    [Edit] │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  🔵 Auto-analyze: ON                       Analyzed: 5 today   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  🎓 COACH                                           ⏰ 2m ago   │
│                                                                 │
│  LAST RESPONSE                                                  │
│  ✓ Success  •  Modified: CoachingSection.tsx, types.ts         │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ⚡ NEXT STEP                                                   │
│  Write integration test for SummaryService                     │
│                                                                 │
│  "Write an integration test for SummaryService.generateSummary │
│   that: (1) mocks a session with real example data..."         │
│                                                                 │
│  [Use this prompt]  [Not now]  [+ 2 more ▾]                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  📊 PROMPT FEEDBACK              5.5/10  ━━━━━░    [Expand ▾]  │
│  ─────────────────────────────────────────────────────────────  │
│  ✅ Good detail  ✅ Clear action  ⚠️ Need more background       │
└─────────────────────────────────────────────────────────────────┘








┌─────────────────────────────────────────────────────────────────┐
│  ☁️ Connected to Vibe-Log                    [Open Dashboard]   │
└─────────────────────────────────────────────────────────────────┘
```

### Full Screen - Expanded State (Prompt Feedback Open)

```
┌─────────────────────────────────────────────────────────────────┐
│  🎯 Goal: "Improve coach section UX"                    [Edit] │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  🔵 Auto-analyze: ON                       Analyzed: 5 today   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  🎓 COACH                                           ⏰ 2m ago   │
│                                                                 │
│  LAST RESPONSE                                                  │
│  ✓ Success  •  Modified: CoachingSection.tsx, types.ts         │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ⚡ NEXT STEP                                                   │
│  Write integration test for SummaryService                     │
│                                                                 │
│  "Write an integration test for SummaryService.generateSummary │
│   that: (1) mocks a session with real example data..."         │
│                                                                 │
│  [Use this prompt]  [Not now]  [+ 2 more ▾]                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  📊 PROMPT FEEDBACK              5.5/10  ━━━━━░   [Collapse ▴] │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  YOUR PROMPT                                                    │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ "Let's analyze the UX of our coach section and identify  │ │
│  │  improvement opportunities. The main issues are..."       │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ✅ Good detail  ✅ Clear action  ⚠️ Need more background       │
│                                                                 │
│  BREAKDOWN                                  (?) How scores work │
│  ─────────────────────────────────────────────────────────────  │
│  Specificity    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  6.0   │
│  Context        ━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░  4.0   │
│  Intent         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  6.0   │
│  Actionability  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  6.0   │
│  Constraints    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  6.0   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  IMPROVED                                              7.2/10  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ "Analyze the UX of our coach section interface and       │ │
│  │  identify improvement opportunities.                      │ │
│  │                                                           │ │
│  │  Issues to Address:                                       │ │
│  │  1. Unclear component structure and hierarchy..."         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [⚡ Use this prompt]  [📋 Copy]  [🔄 Try another]             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  ☁️ Connected to Vibe-Log                    [Open Dashboard]   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Changes

### 1. Remove Historical Prompts from Sidebar

**Before:**
```
┌─ SIDEBAR ────────────────────┐
│  Recent Prompts              │
│  ├─ "Add validation to..."   │
│  ├─ "Fix the bug in..."      │
│  ├─ "Refactor the..."        │
│  └─ "Write tests for..."     │
└──────────────────────────────┘
```

**After:**
```
┌─ SIDEBAR ────────────────────┐
│  (Historical prompts removed)│
│  (Cleaner, focused view)     │
└──────────────────────────────┘
```

**Rationale:**
- Historical prompts add clutter without clear actionable value
- Users can access history through the dashboard if needed
- Keeps focus on current task and next steps

### 2. Move Cloud Status to Bottom Status Bar

**Before (Top of view):**
```
┌─────────────────────────────────────────────────────────────────┐
│  ACCOUNT                                                        │
│  ● Cloud: Not connected                [Connect to Vibe-Log →] │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  🔵 Auto-analyze: ON                       Analyzed: 5 today   │
└─────────────────────────────────────────────────────────────────┘
... rest of content ...
```

**After (Bottom status bar):**
```
┌─────────────────────────────────────────────────────────────────┐
│  🎯 Goal: "Improve coach section UX"                    [Edit] │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  🔵 Auto-analyze: ON                       Analyzed: 5 today   │
└─────────────────────────────────────────────────────────────────┘
... main content ...
┌─────────────────────────────────────────────────────────────────┐
│  ☁️ Connected to Vibe-Log                    [Open Dashboard]   │
└─────────────────────────────────────────────────────────────────┘
```

**Status Bar Variants:**
```
☁️ Connected to Vibe-Log                         [Open Dashboard]
● Not connected                              [Connect to Vibe-Log]
⟳ Syncing...                                     [Open Dashboard]
⚠️ Sync error                                           [Retry]
```

**Rationale:**
- Cloud status is important but not the primary focus
- Moving to bottom keeps it accessible without taking prime real estate
- Goal banner is more relevant context for coaching
- Follows VS Code pattern of status info at bottom

---

## Component Breakdown

### 1. Goal Banner (Top)
```
┌─────────────────────────────────────────────────────────────────┐
│  🎯 Goal: "Improve coach section UX"                    [Edit] │
└─────────────────────────────────────────────────────────────────┘
```
- Shows the current session goal
- Provides context for all coaching suggestions
- Editable by user

### 2. Auto-Analyze Toggle
```
┌─────────────────────────────────────────────────────────────────┐
│  🔵 Auto-analyze: ON                       Analyzed: 5 today   │
└─────────────────────────────────────────────────────────────────┘
```
- Toggle for automatic prompt analysis
- Shows daily stats

### 3. Coach Section
```
┌─────────────────────────────────────────────────────────────────┐
│  🎓 COACH                                           ⏰ 2m ago   │
│                                                                 │
│  LAST RESPONSE                                                  │
│  ✓ Success  •  Modified: CoachingSection.tsx, types.ts         │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ⚡ NEXT STEP                                                   │
│  Write integration test for SummaryService                     │
│                                                                 │
│  "Write an integration test for SummaryService.generateSummary │
│   that: (1) mocks a session with real example data..."         │
│                                                                 │
│  [Use this prompt]  [Not now]  [+ 2 more ▾]                    │
└─────────────────────────────────────────────────────────────────┘
```

**Structure:**
- **Header**: "COACH" + timestamp
- **LAST RESPONSE**: Compact status line with outcome + files modified
- **Divider**: Visual separation between past and future
- **NEXT STEP**: Suggested action title (prominent)
- **Prompt**: Ready-to-use prompt text
- **Actions**: Primary and secondary buttons

**Status Line Variants:**
```
✓ Success  •  Modified: CoachingSection.tsx, types.ts
✓ Success  •  Created: auth-service.ts  •  Modified: index.ts
✓ Success  •  5 files changed
⚠ Partial  •  Modified: api.ts  •  Tests failing
✗ Blocked  •  Missing dependency: @types/node
```

### 4. Prompt Feedback Section (Collapsible)

**Collapsed State:**
```
┌─────────────────────────────────────────────────────────────────┐
│  📊 PROMPT FEEDBACK              5.5/10  ━━━━━░    [Expand ▾]  │
│  ─────────────────────────────────────────────────────────────  │
│  ✅ Good detail  ✅ Clear action  ⚠️ Need more background       │
└─────────────────────────────────────────────────────────────────┘
```

**Expanded State:**
- Shows original prompt (single location - no redundancy)
- Score breakdown by dimension
- Improved prompt version
- Action buttons

### 5. Cloud Status Bar (Bottom)
```
┌─────────────────────────────────────────────────────────────────┐
│  ☁️ Connected to Vibe-Log                    [Open Dashboard]   │
└─────────────────────────────────────────────────────────────────┘
```
- Sticky at bottom of view
- Shows connection status
- Quick access to dashboard

---

## Visual Hierarchy

```
┌─ 🎯 GOAL ────────────────────────────────────────┐  Level 1: Context
└──────────────────────────────────────────────────┘
┌─ AUTO-ANALYZE ───────────────────────────────────┐  Level 2: Settings
└──────────────────────────────────────────────────┘
┌─ 🎓 COACH ───────────────────────────────────────┐
│  LAST RESPONSE (compact)                         │  Level 3: Action
│  NEXT STEP (prominent)                           │  (Primary Focus)
│  [Use this prompt]                               │
└──────────────────────────────────────────────────┘
┌─ 📊 PROMPT FEEDBACK ─────────────────────────────┐
│  Score + quick tips (collapsed by default)       │  Level 4: Learning
└──────────────────────────────────────────────────┘  (Secondary)
┌─ ☁️ STATUS BAR ──────────────────────────────────┐
│  Cloud status + dashboard link                   │  Level 5: Status
└──────────────────────────────────────────────────┘  (Bottom)
```

---

## User Flows

### Flow A: "Keep Coding" (Most Common)
```
User submits prompt
        ↓
AI agent responds
        ↓
Coach generates next step suggestion
        ↓
┌─────────────────────────────────────┐
│ User sees COACH section             │
│ - Glances at status (✓ Success)     │
│ - Reads NEXT STEP suggestion        │
│ - Clicks [Use this prompt]          │
└─────────────────────────────────────┘
        ↓
Prompt injected into editor
        ↓
User continues coding

(Prompt Feedback ignored - stays collapsed)
```

### Flow B: "Improve My Prompting"
```
User submits prompt
        ↓
AI agent responds
        ↓
User wants to learn
        ↓
┌─────────────────────────────────────┐
│ User scrolls to PROMPT FEEDBACK     │
│ - Clicks [Expand]                   │
│ - Reviews score breakdown           │
│ - Reads improved version            │
│ - Clicks [Use improved prompt]      │
└─────────────────────────────────────┘
        ↓
User learns from feedback
```

---

## Comparison: Current vs Proposed

| Aspect | Current | Proposed |
|--------|---------|----------|
| **Sections** | 7 separate sections | 4 focused sections + status bar |
| **Prompt display** | 3 times | 1 time (in Feedback only) |
| **Agent response** | "Done! Committed and pushed" (echo) | ✓ Success • Modified: files (insightful) |
| **Coach value** | Unclear purpose | Clear: LAST RESPONSE → NEXT STEP |
| **Feedback default** | Expanded (takes space) | Collapsed (on-demand) |
| **Historical prompts** | Shown in sidebar | Removed (access via dashboard) |
| **Cloud status** | Top of view | Bottom status bar |
| **Scroll required** | ~800px | ~400px default |
| **Primary action** | Ambiguous (multiple buttons) | Clear: [Use this prompt] |

---

## Implementation Plan

### Phase 1: Coach Section Redesign
1. Remove "Agent completed: [summary]" line
2. Add "LAST RESPONSE" subtitle with compact status
3. Add "NEXT STEP" subtitle for suggestion
4. Extract files modified from response analysis
5. Display status variants (Success/Partial/Blocked)

### Phase 2: Prompt Feedback Collapse
1. Make Prompt Feedback section collapsible
2. Default to collapsed state
3. Show score + quick tips in collapsed header
4. Remember user preference (expand/collapse)

### Phase 3: Layout Consolidation
1. Remove redundant prompt displays
2. Move prompt text exclusively to Feedback section
3. Update Coach to reference suggestion only
4. Add Goal banner at top

### Phase 4: Remove Historical Prompts
1. Remove PromptHistoryList from sidebar
2. Remove related state management
3. Update sidebar layout
4. Ensure history accessible via dashboard

### Phase 5: Move Cloud Status to Bottom
1. Create new CloudStatusBar component
2. Remove AccountBanner from top
3. Add sticky positioning at bottom
4. Implement status variants (connected/disconnected/syncing/error)

### Phase 6: Polish
1. Add visual dividers between sections
2. Implement status line variants
3. Add expand/collapse animations
4. Update styling for visual hierarchy

---

## Files to Modify

| File | Changes |
|------|---------|
| `webview/menu/components/v2/CoPilotView.tsx` | Restructure layout, add collapsible sections |
| `webview/menu/components/v2/CoachingSection.tsx` | Remove echo, add status line, add subtitles |
| `webview/menu/components/v2/PromptFeedback.tsx` | New component for collapsible feedback |
| `webview/menu/components/v2/PromptScore.tsx` | Extract to be embeddable in header |
| `webview/menu/components/v2/CloudStatusBar.tsx` | New component for bottom status |
| `webview/menu/components/v2/Sidebar.tsx` | Remove historical prompts list |
| `webview/menu/components/v2/PromptHistoryList.tsx` | Remove or deprecate |
| `src/services/CoachingService.ts` | Extract files modified from response |
| `src/shared/webview-protocol.ts` | Add new message types if needed |

---

## Success Metrics

1. **Reduced scroll distance**: Target < 400px for default view
2. **Faster time to action**: User can act on Coach within 2 seconds
3. **Clear feature separation**: User understands Coach vs Feedback distinction
4. **No redundancy**: Prompt appears exactly once
5. **Insightful status**: Users find file list useful
6. **Cleaner sidebar**: Reduced visual noise
7. **Appropriate status placement**: Cloud status visible but not distracting

---

## Appendix: Status Line Data Source

The status line data comes from `CoachingData.analysis`:

```typescript
interface ResponseAnalysis {
  outcome: 'success' | 'partial' | 'blocked' | 'error';
  entitiesModified: string[];  // Files created/modified
  toolsUsed: string[];
  // ...
}
```

Map to display:
- `outcome: 'success'` → `✓ Success`
- `outcome: 'partial'` → `⚠ Partial`
- `outcome: 'blocked'` → `✗ Blocked`
- `outcome: 'error'` → `✗ Error`
- `entitiesModified` → `Modified: file1.ts, file2.ts`
