# Plan 5: UI Redesign - Cockpit with Activity Rings

> **Instructions**: Each chat session should complete one phase. After completing a phase, update this plan to mark tasks as done and note any deviations or decisions made.

## Overview

Redesign the DevArk VS Code extension UI from a tab-based dashboard to a **cockpit-style interface** with always-visible session rings (inspired by Apple Health Activity Rings).

## Design Decision

**Option B: Fixed Rings + Tabs**
- Top: 3 session rings always visible (the "cockpit")
- Below: Tabs for detailed views (SESSIONS, REPORTS, ACCOUNT)
- Rings are the product identity - never hidden

## New Layout

```
┌─────────────────────────────────────────┐
│  ◆ DEVARK                          ⚙️   │
├─────────────────────────────────────────┤
│                                         │
│      ◐◑◐        ◐○◑        ○○○         │  ← Always visible
│    auth-feat   bug-fix    cleanup       │
│      26m         3m        idle         │
│                                         │
├─────────────────────────────────────────┤
│  SESSIONS    REPORTS    ACCOUNT         │  ← Tabs
├─────────────────────────────────────────┤
│                                         │
│  [Tab content]                          │
│                                         │
├─────────────────────────────────────────┤
│  ✓ Claude Agent SDK    ☁️ @danny        │
└─────────────────────────────────────────┘
```

## Ring Meanings

Each session shows 3 concentric rings (Apple Health style):

| Ring | Meaning | Data Source | Full = |
|------|---------|-------------|--------|
| 🔴 Outer | Goal progress | `goalProgress.after` | Task complete |
| 🟢 Middle | Context remaining | Token tracking (TBD) | Context nearly full |
| 🔵 Inner | Session activity | `promptCount`, `duration` | Active/healthy |

## Data Availability

| Metric | Status | Source |
|--------|--------|--------|
| Goal progress (0-100%) | 🔄 Phase 3 | LLM inference from first prompt vs responses |
| Message count | ✅ Have | `Session.promptCount` |
| Duration | ✅ Have | `Session.duration`, timestamps |
| Is active | ✅ Have | `Session.isActive` |
| Context/token usage | ❌ Future | Not currently tracked (Phase 7)

---

## Implementation Phases

### Phase 1: Activity Rings Component ✅
**Chat 1 - Standalone rings**

- [x] Install `@jonasdoesthings/react-activity-rings`
- [x] Create wrapper `ActivityRings` component
- [x] Configure 3 rings: Goal (red), Context (green), Activity (blue)
- [x] Map session data to ring values (0-1 scale)
- [x] Add hover tooltip with stats
- [x] Style to match VS Code themes (light/dark/high-contrast)
- [x] Create `SessionRingCard` - ring + label + session name + duration

**Deliverable:** Working ring component with theming

---

### Phase 2: Rings Header Section ✅
**Chat 2 - Fixed header with 3 rings**

- [x] Create `RingsHeader` component
- [x] Show top 3 most recent active sessions
- [x] Fetch session data (reuse existing session state)
- [x] Map session data to ring fill values:
  - Goal ring: `goalProgress.after || 0` (via SessionRingCard)
  - Activity ring: derive from `promptCount` + `isActive` (via SessionRingCard)
  - Context ring: placeholder based on prompt count (via SessionRingCard)
- [x] Handle empty state (no sessions)
- [x] Handle 1-2 sessions (show placeholders for missing)
- [x] Click ring → navigate to session in CO-PILOT tab (will update to SESSIONS in Phase 4)

**Deliverable:** Working header, integrated with session data

**Notes:**
- Reused `SessionRingCard` for ring data mapping (DRY)
- Coaching data only available for active session; other sessions show rings without goal progress
- Navigation goes to `copilot` tab (renamed to `sessions` in Phase 4)

---

### Phase 3: Goal Progress Inference (LLM-powered) ✅
**Chat 3 - Make the goal ring meaningful**

The outer ring (goal progress) is the hero metric. Use local LLM to infer progress.

- [x] Add `goalProgress?: number` (0-100) to Session interface
- [x] Create `GoalProgressAnalyzer` CoPilot tool in `src/copilot/`
- [x] Design LLM prompt:
  - Input: First user prompt (the intent/goal) + first few lines of each AI response
  - Output: Progress percentage (0-100) with brief reasoning
- [x] Implement sampling strategy (limit tokens sent to LLM)
- [x] Decide trigger: on session select? on demand? periodic?
- [x] Store goalProgress on Session (persist to storage)
- [x] Update SessionRingCard to use `session.goalProgress`
- [x] Handle missing data gracefully (show empty ring, not error)

**Deliverable:** Goal ring shows real LLM-inferred progress

**Notes:**
- **Auto-trigger**: Analyzes goal progress automatically when:
  - Session has prompts but no goalProgress yet (after 2 prompts)
  - Every 3 prompts after that
  - With 30-second debounce to avoid excessive LLM calls
- Manual trigger also available via `v2AnalyzeGoalProgress` message
- GoalProgressAnalyzer samples up to 8 interactions (first, middle samples, last)
- Truncates prompts to 500 chars, response previews to 300 chars
- Stores progress directly on Session, persists with storage
- SessionRingCard falls back: coaching progress → session.goalProgress → 0
- Progress updates are pushed to webview automatically via callback

**Tooltip Implementation - DONE ✅:**
- Added rich hover tooltip to SessionRingCard showing:
  - Ring name with color indicator and percentage
  - Brief explanation of what each ring measures (Goal Progress, Context, Activity)
  - Goal context when available
- CSS-based tooltip with proper light/dark/high-contrast theme support
- Tooltip appears on hover over the ring card

---

### Phase 3.5: Fix Ring Visualization ✅
**Pre-requisite before Phase 4**

- [x] Investigate why only inner ring renders visually
- [x] Test with different fill values to confirm library behavior
- [x] Either fix library configuration or implement custom 3-ring SVG
- [x] Ensure all 3 rings (Goal/Context/Activity) display correctly
- [x] Rings should be concentric (nested) like Apple Health rings

**Notes:**
- Root cause: Library's CSS injection failed in VS Code webview CSP environment
- Fix: Replaced `@jonasdoesthings/react-activity-rings` with custom SVG implementation
- Custom implementation uses strokeDasharray/strokeDashoffset technique for progress arcs
- All three rings now render correctly as concentric circles (Apple Health style)
- Rings: Inner=Activity (blue), Middle=Context (green), Outer=Goal (red)

---

### Phase 4: Tab Restructure ✅
**Chat 4 - Replace current tabs**

- [x] Rename tabs: CO-PILOT → SESSIONS, SUMMARIES → REPORTS
- [x] Remove sidebar from SESSIONS tab (sessions now shown in rings header)
- [x] SESSIONS tab: Session list with expandable cards
- [x] REPORTS tab: Daily standup + weekly insights (simplify current view)
- [x] ACCOUNT tab: Keep mostly as-is, clean up
- [x] Update tab navigation state

**Deliverable:** New tab structure working

**Notes:**
- `MainTab` type changed from `'copilot' | 'summaries' | 'account'` to `'sessions' | 'reports' | 'account'`
- Tab order changed to: Sessions, Reports, Account
- Default tab is now 'reports' (was 'summaries')
- All navigation and state management updated to use new tab names
- **NEW SessionsSidebar component** added with:
  - Session title (customName > goal > platform label)
  - Message count and duration
  - Ring progress indicators (Goal/Context/Activity percentages)
  - Active status badge
  - Grouped by Today/Yesterday/Earlier
  - Mini activity rings for visual identification

---

### Phase 5: Session Cards Redesign
**Chat 5 - SESSIONS tab content**

- [ ] Create new `SessionCard` component (expandable)
- [ ] Collapsed: ring mini-view + name + duration + goal preview
- [ ] Expanded: full stats, goal editor, activity log
- [ ] Group by: Today, Yesterday, Earlier
- [ ] "Mark Complete" and "New Session" actions

**Deliverable:** Complete SESSIONS tab

---

### Phase 6: Reports Simplification
**Chat 6 - REPORTS tab content**

- [ ] Daily Standup card with copy button
- [ ] Weekly Insights card (patterns, not raw data)
- [ ] Remove or collapse detailed breakdowns
- [ ] Focus on actionable insights, not data dumps

**Deliverable:** Streamlined REPORTS tab

---

### Phase 7: Context Window Tracking (Optional/Future)
**Separate effort**

- [ ] Research token counting for Claude Code / Cursor sessions
- [ ] Add token usage tracking to session data
- [ ] Update context ring to use real token data
- [ ] Show warning when context is nearly full

**Deliverable:** Real context usage in rings

---

## Library Choice

**Package:** `@jonasdoesthings/react-activity-rings`

```bash
npm install @jonasdoesthings/react-activity-rings
```

- Apple-style Activity Rings for React
- 1.2 KiB minzipped (tiny)
- MIT license
- v1.2.0

This gives us the exact Apple Health ring look without custom SVG work.

---

## Files to Modify

```
src/copilot/
├── goal-progress-analyzer.ts    # DONE ✅ (Phase 3) - LLM-powered progress inference

webview/menu/
├── AppV2.tsx                    # DONE ✅ (Phase 2, 4) - Added RingsHeader, tab restructure
├── state/types-v2.ts            # DONE ✅ (Phase 3, 4) - Updated tab types to sessions/reports/account
├── components/
│   ├── v2/
│   │   ├── RingsHeader.tsx      # DONE ✅ (Phase 2) - rings section
│   │   ├── ActivityRings.tsx    # DONE ✅ (Phase 1) - ring visualization
│   │   ├── SessionRingCard.tsx  # DONE ✅ (Phase 1) - ring + label
│   │   ├── SessionCard.tsx      # MODIFY - expandable cards
│   │   ├── CoPilotView.tsx      # Keep as-is (renamed in tab labels, not file)
│   │   ├── SummariesView.tsx    # Keep as-is (renamed to REPORTS in tab labels)
│   │   ├── SessionsSidebar.tsx  # NEW ✅ (Phase 4) - Session list sidebar with ring info
│   │   ├── Sidebar.tsx          # Original sidebar (not used in sessions tab)
│   │   └── index.ts             # DONE ✅ (Phase 1+2) - exports
│   └── styles/
│       └── redesign.css         # DONE ✅ (Phase 1+2) - ring + header styles
```

---

## Success Criteria

1. Rings are **always visible** at top of extension
2. User can **glance** to see session status without clicking
3. **Goal progress** is visually prominent
4. Extension feels like a **cockpit**, not a dashboard
5. Works in light, dark, and high-contrast themes

---

## Out of Scope (This Plan)

- Real token/context tracking (separate effort)
- Prompt scoring/feedback UI (keep existing, don't redesign)
- Cloud sync improvements
- Onboarding flow changes
