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

**Race Condition Fix (Jan 2026):**
- Fixed bug where early prompts (before LLM provider fully initialized) would mark tracking as "done"
- Now checks `llmManager.getActiveProvider()` exists before attempting analysis
- Tracking maps only updated AFTER successful analysis (not before)
- Failed/skipped analyses will retry on next prompt instead of being blocked

**Cockpit Sessions Analysis on Load (Jan 2026):**
- Added `analyzeTopSessionsOnLoad()` to GoalService - analyzes top 3 cockpit sessions when extension loads
- Top 3 selection prioritizes: sessions with ≥2 prompts → active sessions → most recent
- Extracts `sessionTitle` from LLM and stores as `customName` for session naming
- Skips Claude Code sessions (their prompts are in JSONL files, not SessionManager)
- Called once from `CoPilotCoordinator.pushInitialData()` to avoid duplicate calls

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
- [x] Create new SessionsSidebar for SESSIONS tab
- [x] SESSIONS tab: Two-column layout (sidebar + content)
- [x] REPORTS tab: Keep as-is (simplification in Phase 6)
- [x] ACCOUNT tab: Keep as-is
- [x] Update tab navigation state

**Deliverable:** New tab structure working

**Notes:**
- `MainTab` type changed from `'copilot' | 'summaries' | 'account'` to `'sessions' | 'reports' | 'account'`
- Tab order changed to: Sessions, Reports, Account
- Default tab is now 'reports' (was 'summaries')
- All navigation and state management updated to use new tab names
- Removed old Sidebar component from sessions tab, replaced with SessionsSidebar
- **NEW SessionsSidebar component** (`webview/menu/components/v2/SessionsSidebar.tsx`):
  - Session title (customName > goal > platform label)
  - Message count and duration
  - Mini activity rings (40px) with ring data
  - Ring progress indicators (Goal/Context/Activity percentages)
  - Active status badge ("ACTIVE")
  - Grouped by Today/Yesterday/Earlier
  - Platform icon (Cursor/Claude Code)
  - Time ago display
- **NEW CSS styles** for `.vl-sessions-sidebar`, `.vl-session-list-item`, `.vl-sessions-layout`
- Sessions tab layout: `SessionsSidebar` (left) + `CoPilotView` (right)

---

### Phase 5: Session Cards Redesign
**Chat 5 - SESSIONS tab content**

- [x] Group by: Today, Yesterday, Earlier (done in Phase 4 SessionsSidebar)
- [x] Ring mini-view + name + duration (done in Phase 4 SessionsSidebar)


---

### Phase 6: Reports Simplification ✅
**Chat 6 - REPORTS tab content**

- [x] Daily Standup card with copy button
- [x] Weekly Insights card (patterns, not raw data)
- [x] Remove or collapse detailed breakdowns
- [x] Focus on actionable insights, not data dumps

**Deliverable:** Streamlined REPORTS tab

**Notes:**
- **Complete redesign**: Replaced tab-based period selector with dashboard-style layout
- **Three report cards**: Daily Standup + Weekly Insights + Monthly Insights
- **DailyStandupCard**: Shows "Yesterday I:" + "Today I plan to:" with Copy + Refresh buttons
- **WeeklyInsightsCard**: Shows date range, stats (time · sessions · features), and AI-generated insights with contextual icons (🔥 success, ⚠️ warning, 💡 tip)
- **MonthlyInsightsCard**: Shows month/year, stats with active days ratio, and AI insights
- **ViewFullReport**: Collapsible section with detailed breakdown (daily table, activity distribution, top projects)
- **Empty state cards**: Dashed border cards with individual "Generate X" buttons for each report type
- **Refresh buttons** (🔄): Each filled card has a refresh button with spinning animation while loading
- **Copy button**: Shows "Copied!" confirmation with checkmark icon
- **CloudCTA**: Promotes email delivery feature at bottom
- **CSS**: New `.vl-reports-view`, `.vl-report-card`, `.vl-insight-item`, `.vl-card-refresh-btn` classes with theme support
- Removed old period selector (Standup/Today/Week/Month tabs)
- Removed auto-load in favor of explicit generate buttons

---

### Phase 7: Tooltip UI Polish ✅
**Chat 7 - Improve ring tooltip clarity**

Current tooltip shows "Claude Code Session" as title with ring labels like "Goal Progress". Based on user feedback:

- [x] Change tooltip title to show the session's goal (not "Claude Code Session")
- [x] Remove redundant "Goal" label from progress ring - the percentage and description are enough
- [x] Move platform identifier ("Claude Code") to bottom of tooltip
- [x] Improve visual hierarchy for better scannability

**Current:**
```
┌─────────────────────────────┐
│ Claude Code Session         │
│ 3 prompts · Active          │
├─────────────────────────────┤
│ 🔴 Goal Progress            │
│    0% — Task completion     │
│ 🟢 Context                  │
│    10% — Token usage...     │
│ 🔵 Activity                 │
│    45% — Session engagement │
├─────────────────────────────┤
│ Goal: Implement Reports...  │
└─────────────────────────────┘
```

**Target:**
```
┌─────────────────────────────┐
│ Implement Reports tab...    │  ← Goal as title
│ 3 prompts · Active          │
├─────────────────────────────┤
│ 🔴 0% — Task completion     │  ← No "Goal Progress" label
│ 🟢 10% — Context used       │
│ 🔵 45% — Session activity   │
├─────────────────────────────┤
│ Claude Code                 │  ← Platform at bottom
└─────────────────────────────┘
```

**Deliverable:** Cleaner, more informative tooltip

**Notes (Jan 2026):**
- Tooltip title now shows: customName > goal > platform + "Session"
- Removed ring labels ("Goal Progress", "Context", "Activity") - color dots + values are sufficient
- Platform footer only appears when session has a goal/customName (avoids redundancy)
- Title has text overflow handling for long goals
- Simplified CSS by removing unused `.vl-ring-tooltip__ring-name` and `.vl-ring-tooltip__ring-info`

---

### Phase 8: Context Window Tracking (Optional/Future)
**Separate effort**

- [ ] Research token counting for Claude Code / Cursor sessions
- [ ] Add token usage tracking to session data
- [ ] Update context ring to use real token data
- [ ] Show warning when context is nearly full

**Deliverable:** Real context usage in rings

---

### Phase 9: LLM Provider Indicator in Reports ✅
**Chat 9 - Show which model analyzes reports**

Users need to know which LLM is generating their report insights. The selected provider is shown in the footer ("LLM: Claude Agent SDK") and can be changed via the provider dropdown.

- [x] Show "Analyzed by {provider}" label on each generated report card
- [x] Display provider name after report generation completes
- [x] Show model name when available (e.g., "Claude Agent SDK · claude-3-sonnet")
- [x] Created reusable `ReportCard` wrapper component with built-in footer

**Deliverable:** Users know which LLM generated each report

**Notes (Jan 2026):**
- Created `ReportCard` wrapper component that handles common card structure (header, content, footer)
- Footer shows "Analyzed by {provider} · {model}" when `providerInfo` is available
- All three card components (DailyStandupCard, WeeklyInsightsCard, MonthlyInsightsCard) now use ReportCard
- Provider info comes from `providerInfo?: { model: string; provider: string }` on summary data
- Footer only renders when providerInfo exists (graceful fallback for legacy data)
- Added CSS for `.vl-report-card-footer` and `.vl-provider-label`

---

## Library Choice

~~**Package:** `@jonasdoesthings/react-activity-rings`~~ (Replaced in Phase 3.5)

**Current Implementation:** Custom SVG (`ActivityRings.tsx`)
- Library's CSS injection failed in VS Code webview CSP environment
- Replaced with custom strokeDasharray/strokeDashoffset SVG implementation
- Concentric rings: Outer=Goal (red), Middle=Context (green), Inner=Activity (blue)
- Full theme support (light/dark/high-contrast)

---

## Files to Modify

```
src/copilot/
├── goal-progress-analyzer.ts    # DONE ✅ (Phase 3) - LLM-powered progress inference

webview/menu/
├── AppV2.tsx                    # DONE ✅ (Phase 2, 4) - Added RingsHeader, tab restructure, SessionsSidebar
├── state/
│   ├── types-v2.ts              # DONE ✅ (Phase 3, 4) - Updated tab types to sessions/reports/account
│   ├── initial-state.ts         # DONE ✅ (Phase 4) - Default tab changed to 'reports'
│   └── app-reducer.test.tsx     # DONE ✅ (Phase 4) - Updated tests for new tab names
├── components/
│   ├── v2/
│   │   ├── RingsHeader.tsx      # DONE ✅ (Phase 2) - rings section
│   │   ├── ActivityRings.tsx    # DONE ✅ (Phase 1, 3.5) - custom SVG ring visualization
│   │   ├── SessionRingCard.tsx  # DONE ✅ (Phase 1) - ring + label for header
│   │   ├── SessionsSidebar.tsx  # NEW ✅ (Phase 4) - Session list sidebar with ring info
│   │   ├── SessionCard.tsx      # MODIFY (Phase 5) - expandable cards
│   │   ├── CoPilotView.tsx      # Keep as-is (used in sessions tab content)
│   │   ├── SummariesView.tsx    # DONE ✅ (Phase 6, 9) - Dashboard with report cards + ReportCard wrapper
│   │   ├── Sidebar.tsx          # Original sidebar (not used, kept for reference)
│   │   └── index.ts             # DONE ✅ (Phase 1+2) - exports
│   └── styles/
│       └── redesign.css         # DONE ✅ (Phase 1, 2, 3.5, 4, 6, 9) - all UI styles
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

---

## Known Issues / Tech Debt

### V2MessageHandler "Unknown message type" warnings
The webview sends messages on init that V2MessageHandler doesn't recognize. These are handled by V1MessageHandler fallback but produce noisy console warnings:

```
[V2MessageHandler] Unknown message type: getCoachingStatus
[V2MessageHandler] Unknown message type: getResponseAnalysisStatus
[V2MessageHandler] Unknown message type: getSavedPrompts
[V2MessageHandler] Unknown message type: getProviders
[V2MessageHandler] Unknown message type: getFeatureModels
[V2MessageHandler] Unknown message type: getAvailableModelsForFeature
[V2MessageHandler] Unknown message type: getCloudStatus
```

**Fix options:**
1. Add these handlers to V2MessageHandler (proper fix)
2. Suppress the warning for known V1 message types (quick fix)
3. Route these messages directly to V1MessageHandler without warning
