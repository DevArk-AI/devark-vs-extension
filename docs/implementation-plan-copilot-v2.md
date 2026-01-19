# Implementation Plan: Co-Pilot v2

## Overview

This plan is designed for **parallel execution by 2+ Claude Code instances**. Work is divided into independent streams that can be developed simultaneously with minimal merge conflicts.

**Reference:** `docs/prd-copilot-v2.md`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EXTENSION HOST                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │ SessionManager  │  │ ScoringService  │  │ SuggestionEngine   │ │
│  │ (projects/      │  │ (5-dimension    │  │ (context-aware     │ │
│  │  sessions)      │  │  scoring)       │  │  suggestions)      │ │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘ │
│           │                    │                      │            │
│           └────────────────────┼──────────────────────┘            │
│                                │                                    │
│                    ┌───────────▼───────────┐                       │
│                    │   V2MessageHandler    │                       │
│                    │   (webview bridge)    │                       │
│                    └───────────┬───────────┘                       │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │      WEBVIEW (React)    │
                    │  ┌───────────────────┐  │
                    │  │   AppV2.tsx       │  │
                    │  │   ├─ Sidebar      │  │
                    │  │   ├─ CoPilotView  │  │
                    │  │   ├─ Summaries    │  │
                    │  │   └─ Account      │  │
                    │  └───────────────────┘  │
                    └─────────────────────────┘
```

---

## Parallel Execution Streams

### Stream A: UI Components (Frontend Focus)
**Owner:** Claude Instance 1
**Directory:** `webview/menu/components/v2/`

### Stream B: Backend Services (Extension Host Focus)
**Owner:** Claude Instance 2
**Directory:** `src/services/`, `src/copilot/`

### Shared Interface Contract
Both streams work against shared type definitions in:
- `webview/menu/state/types-v2.ts` (webview types)
- `src/panels/V2MessageHandler.ts` (message protocol)

---

## Stream A: UI Components

### A1. Resizable Sidebar Component
**Files to create/modify:**
- `webview/menu/components/v2/Sidebar.tsx` (NEW)
- `webview/menu/components/v2/SidebarResizeHandle.tsx` (NEW)
- `webview/menu/components/v2/hooks/useSidebarResize.ts` (NEW)

**Tasks:**
```
A1.1 Create Sidebar container component
     - Three width states: min (60px), default (240px), max (400px)
     - Collapse/expand button (« / »)
     - Persist width to localStorage

A1.2 Create SidebarResizeHandle component
     - Drag handle with visual feedback
     - Double-click to toggle min/default
     - Cursor change on hover

A1.3 Create useSidebarResize hook
     - Mouse event handling for drag
     - Width constraints (min/max)
     - localStorage persistence
```

**Acceptance Criteria:**
- [ ] Sidebar resizes smoothly with drag
- [ ] Double-click toggles collapse
- [ ] Width persists across sessions
- [ ] Collapsed state shows only icons

---

### A2. Projects & Sessions List
**Files to create/modify:**
- `webview/menu/components/v2/ProjectsList.tsx` (NEW)
- `webview/menu/components/v2/SessionCard.tsx` (NEW)
- `webview/menu/components/v2/PromptHistoryList.tsx` (NEW)

**Tasks:**
```
A2.1 Create ProjectsList component
     - Collapsible project groups
     - Platform icons (🟣 Cursor, 🟠 Claude)
     - Session count badges

A2.2 Create SessionCard component
     - Platform icon + time + prompt count
     - ACTIVE indicator for current session
     - Click to switch session context

A2.3 Create PromptHistoryList component
     - Show last 10 prompts with scores
     - "Load more" button (loads 10 more)
     - Truncated prompt text with tooltip
```

**Acceptance Criteria:**
- [ ] Projects expand/collapse
- [ ] Platform icons display correctly
- [ ] Active session highlighted
- [ ] Load more pagination works

---

### A3. Score Display Components
**Files to create/modify:**
- `webview/menu/components/v2/PromptScore.tsx` (NEW)
- `webview/menu/components/v2/ScoreBreakdown.tsx` (NEW)
- `webview/menu/components/v2/ScoreBar.tsx` (NEW)
- `webview/menu/components/v2/HowScoresWorkModal.tsx` (NEW)

**Tasks:**
```
A3.1 Create PromptScore component
     - Large score display (X.X / 10)
     - Visual progress bar
     - "Why this score?" section with ✅/⚠️ items

A3.2 Create ScoreBreakdown component
     - 5 dimension bars (Specificity, Context, Intent, Actionability, Constraints)
     - Score value next to each bar
     - Brief explanation text

A3.3 Create HowScoresWorkModal component
     - Modal with detailed explanations
     - Good/bad examples for each dimension
     - Triggered by "ℹ️ How?" link
```

**Acceptance Criteria:**
- [ ] Score displays prominently
- [ ] Why section shows good/bad points
- [ ] Breakdown shows all 5 dimensions
- [ ] Modal explains scoring system

---

### A4. Daily Stats Banner
**Files to create/modify:**
- `webview/menu/components/v2/DailyStatsBanner.tsx` (NEW)
- `webview/menu/components/v2/PeerComparison.tsx` (NEW)

**Tasks:**
```
A4.1 Create DailyStatsBanner component
     - Prompt count today
     - Average score
     - Delta vs usual (↑/↓)
     - Percentile rank (TOP X%)

A4.2 Create PeerComparison component
     - "You vs Avg" bar comparison
     - Percentile text
     - Pro feature teaser for leaderboard
```

**Acceptance Criteria:**
- [ ] Stats update in real-time
- [ ] Delta shows improvement/decline
- [ ] Percentile displays correctly

---

### A5. Goal & Suggestions UI
**Files to create/modify:**
- `webview/menu/components/v2/SessionGoal.tsx` (NEW)
- `webview/menu/components/v2/GoalInferenceModal.tsx` (NEW)
- `webview/menu/components/v2/CoPilotSuggestion.tsx` (NEW)

**Tasks:**
```
A5.1 Create SessionGoal component (sidebar)
     - Goal text display
     - Edit button
     - "Complete" button

A5.2 Create GoalInferenceModal component
     - "We detected a theme" message
     - Editable goal text
     - Set Goal / Maybe Later / Don't ask buttons

A5.3 Create CoPilotSuggestion component
     - Context-aware suggestion card
     - "Add to prompt" / "Not now" buttons
     - Dismissible
```

**Acceptance Criteria:**
- [ ] Goal displays in sidebar
- [ ] Inference modal triggers after 3 prompts
- [ ] Suggestions are dismissible
- [ ] "Not now" respects throttling

---

### A6. Summaries Tab
**Files to modify:**
- `webview/menu/components/v2/SummariesView.tsx` (MODIFY)

**Tasks:**
```
A6.1 Add weekly chart component
     - Bar chart for daily scores
     - "Today" indicator

A6.2 Add stats cards
     - Prompts this week
     - Avg score + delta
     - Streak counter

A6.3 Add peer comparison section
     - You vs Avg bars
     - Percentile rank
     - Pro teaser

A6.4 Add insights section
     - Best performing prompt types
     - Most improved dimension
     - Tip for lowest dimension
```

---

### A7. Account Tab Updates
**Files to modify:**
- `webview/menu/components/v2/AccountView.tsx` (MODIFY)

**Tasks:**
```
A7.1 Add settings toggles
     - Auto-sync sessions
     - Auto-analyze prompts
     - Co-pilot suggestions
     - Daily digest email

A7.2 Add connected tools section
     - Platform icons with status
     - Connect/Disconnect buttons
```

---

## Stream B: Backend Services

### B1. Session Manager Service
**Files to create/modify:**
- `src/services/SessionManagerService.ts` (NEW)
- `src/services/types/session-types.ts` (NEW)

**Tasks:**
```
B1.1 Create session data model
     interface Project {
       id: string;
       name: string;  // from git repo or folder
       sessions: Session[];
     }

     interface Session {
       id: string;
       projectId: string;
       platform: 'cursor' | 'claude_code' | 'vscode';
       startTime: Date;
       lastActivityTime: Date;
       prompts: PromptRecord[];
       goal?: string;
       isActive: boolean;
     }

     interface PromptRecord {
       id: string;
       text: string;
       timestamp: Date;
       score: number;
       breakdown: ScoreBreakdown;
     }

B1.2 Implement session detection logic
     - Detect project from workspace folder / git repo
     - Detect platform from active tool
     - Create new session if: different project, different tool, or >2h gap

B1.3 Implement session persistence
     - Store sessions in extension storage
     - Load on extension activation
     - Sync with cloud (existing vibe-log API)

B1.4 Implement prompt grouping
     - Add prompts to active session
     - Track prompt history per session
     - Pagination support (10 prompts per page)
```

**Acceptance Criteria:**
- [ ] Sessions auto-created on activity
- [ ] Projects detected from workspace
- [ ] Platform detected correctly
- [ ] Sessions persist across restarts

---

### B2. Enhanced Scoring Service
**Files to create/modify:**
- `src/copilot/prompt-scorer.ts` (MODIFY)
- `src/copilot/score-explainer.ts` (NEW)
- `src/services/types/score-types.ts` (NEW)

**Tasks:**
```
B2.1 Implement 5-dimension scoring
     interface ScoreBreakdown {
       specificity: { score: number; weight: 0.20 };
       context: { score: number; weight: 0.25 };
       intent: { score: number; weight: 0.25 };
       actionability: { score: number; weight: 0.15 };
       constraints: { score: number; weight: 0.15 };
       total: number;
     }

B2.2 Create score explanation generator
     - Analyze prompt for good points (✅)
     - Analyze prompt for missing elements (⚠️)
     - Return structured explanation

B2.3 Update existing scorer to return breakdown
     - Modify prompt-scorer.ts to return ScoreBreakdown
     - Ensure backward compatibility
```

**Acceptance Criteria:**
- [ ] All 5 dimensions scored
- [ ] Weights applied correctly
- [ ] Explanations generated
- [ ] Existing functionality preserved

---

### B3. Daily Stats Service
**Files to create/modify:**
- `src/services/DailyStatsService.ts` (NEW)
- `src/services/PeerComparisonService.ts` (NEW)

**Tasks:**
```
B3.1 Implement daily stats tracking
     - Count prompts per day
     - Calculate daily average score
     - Track user's historical average
     - Calculate delta vs typical

B3.2 Implement peer comparison
     - Fetch aggregate stats from vibe-log API
     - Calculate percentile rank
     - Cache results (refresh every 5 min)

B3.3 Add API endpoints (if needed)
     - GET /api/stats/daily - user's daily stats
     - GET /api/stats/percentile - peer comparison
```

**Acceptance Criteria:**
- [ ] Daily stats calculated correctly
- [ ] Delta shows vs historical average
- [ ] Percentile fetched from backend
- [ ] Results cached appropriately

---

### B4. Goal & Suggestion Engine
**Files to create/modify:**
- `src/services/GoalService.ts` (NEW)
- `src/services/SuggestionEngine.ts` (NEW)
- `src/services/ContextExtractor.ts` (NEW)

**Tasks:**
```
B4.1 Implement goal inference
     - Analyze last 3 prompts for common theme
     - Generate suggested goal text
     - Trigger inference modal after 3 prompts

B4.2 Implement suggestion engine
     Triggers:
     - Prompt < 4.0 score → "Add more context"
     - Same topic 3x → "Combine these?"
     - Session > 30 min → "Progress check"
     - Returning user → "Resume from..."
     - Vague words detected → "Be more specific"
     - No goal set (10 min) → "Set a goal?"

B4.3 Implement throttling
     - Max 1 toast per 5 minutes
     - Max 3 inline tips per session
     - "Not now" = 1 hour cooldown
     - "Dismiss" 3x = disable suggestion type

B4.4 Implement context extraction
     - Extract tech stack from prompts
     - Track key decisions
     - Identify entities (files, components)
     - Store in session context
```

**Acceptance Criteria:**
- [ ] Goals inferred after 3 prompts
- [ ] Suggestions trigger appropriately
- [ ] Throttling prevents spam
- [ ] Context extracted and stored

---

### B5. Message Handler Updates
**Files to modify:**
- `src/panels/V2MessageHandler.ts` (MODIFY)

**Tasks:**
```
B5.1 Add new message types
     // From webview
     'getSessions'
     'getProjects'
     'switchSession'
     'setGoal'
     'completeGoal'
     'dismissSuggestion'
     'getDailyStats'
     'getPeerComparison'
     'setSidebarWidth'
     'loadMorePrompts'

     // To webview
     'sessionsUpdated'
     'projectsUpdated'
     'scoreUpdated'
     'suggestionTriggered'
     'dailyStatsUpdated'
     'goalInferenceReady'

B5.2 Wire up services to handlers
     - Connect SessionManagerService
     - Connect DailyStatsService
     - Connect SuggestionEngine
     - Connect GoalService
```

---

### B6. Storage Updates
**Files to modify:**
- `src/copilot/storage.ts` (MODIFY)
- `src/storage/PromptHistoryStore.ts` (MODIFY)

**Tasks:**
```
B6.1 Add session storage
     - Store sessions by project
     - Store prompt history per session
     - Store goals per session

B6.2 Add preference storage
     - Sidebar width
     - Suggestion dismissals
     - Throttle timestamps

B6.3 Add stats storage
     - Daily stats cache
     - Peer comparison cache
```

---

## Shared Tasks (Either Stream)

### S1. Type Definitions
**Files to create/modify:**
- `webview/menu/state/types-v2.ts` (MODIFY)

**Tasks:**
```
S1.1 Add session types
S1.2 Add score types
S1.3 Add suggestion types
S1.4 Add stats types
S1.5 Add message types for webview ↔ extension
```

---

## Integration Points

### Sync Points (Require Coordination)

| Point | Stream A Task | Stream B Task | Interface |
|-------|---------------|---------------|-----------|
| 1 | A2 (ProjectsList) | B1 (SessionManager) | `types-v2.ts: Project, Session` |
| 2 | A3 (ScoreDisplay) | B2 (ScoringService) | `types-v2.ts: ScoreBreakdown` |
| 3 | A4 (DailyStats) | B3 (DailyStatsService) | `types-v2.ts: DailyStats` |
| 4 | A5 (Suggestions) | B4 (SuggestionEngine) | `types-v2.ts: Suggestion` |
| 5 | All UI | B5 (MessageHandler) | Message protocol |

### Recommended Sync Schedule

```
Day 1: Both streams define types together (S1)
       Then work independently

Day 2: Sync on Session types (Point 1)
       A: Start A1, A2
       B: Start B1, B2

Day 3: Sync on Score types (Point 2)
       A: Continue A2, Start A3
       B: Continue B2, Start B3

Day 4: Sync on Stats types (Point 3)
       A: Continue A3, Start A4
       B: Continue B3, Start B4

Day 5: Sync on Suggestion types (Point 4)
       A: Continue A4, Start A5
       B: Continue B4, Start B5

Day 6: Integration testing
       Both streams test end-to-end
```

---

## File Ownership (Avoid Conflicts)

### Stream A Owns:
```
webview/menu/components/v2/Sidebar.tsx
webview/menu/components/v2/SidebarResizeHandle.tsx
webview/menu/components/v2/hooks/useSidebarResize.ts
webview/menu/components/v2/ProjectsList.tsx
webview/menu/components/v2/SessionCard.tsx
webview/menu/components/v2/PromptHistoryList.tsx
webview/menu/components/v2/PromptScore.tsx
webview/menu/components/v2/ScoreBreakdown.tsx
webview/menu/components/v2/ScoreBar.tsx
webview/menu/components/v2/HowScoresWorkModal.tsx
webview/menu/components/v2/DailyStatsBanner.tsx
webview/menu/components/v2/PeerComparison.tsx
webview/menu/components/v2/SessionGoal.tsx
webview/menu/components/v2/GoalInferenceModal.tsx
webview/menu/components/v2/CoPilotSuggestion.tsx
webview/menu/components/v2/SummariesView.tsx (modify)
webview/menu/components/v2/AccountView.tsx (modify)
```

### Stream B Owns:
```
src/services/SessionManagerService.ts
src/services/DailyStatsService.ts
src/services/PeerComparisonService.ts
src/services/GoalService.ts
src/services/SuggestionEngine.ts
src/services/ContextExtractor.ts
src/services/types/session-types.ts
src/services/types/score-types.ts
src/copilot/prompt-scorer.ts (modify)
src/copilot/score-explainer.ts
src/copilot/storage.ts (modify)
src/storage/PromptHistoryStore.ts (modify)
src/panels/V2MessageHandler.ts (modify)
```

### Shared (Coordinate Changes):
```
webview/menu/state/types-v2.ts
webview/menu/AppV2.tsx (layout changes)
```

---

## Execution Commands

### Stream A (UI Focus)
```bash
# Terminal 1 - Claude Instance 1
cd C:\vibelog\vibe-log-cursor-extentstion

# Start with:
"Implement Stream A from docs/implementation-plan-copilot-v2.md.
Focus on UI components in webview/menu/components/v2/.
Start with A1 (Resizable Sidebar), then A2 (Projects List).
Do NOT modify files owned by Stream B."
```

### Stream B (Backend Focus)
```bash
# Terminal 2 - Claude Instance 2
cd C:\vibelog\vibe-log-cursor-extentstion

# Start with:
"Implement Stream B from docs/implementation-plan-copilot-v2.md.
Focus on services in src/services/ and src/copilot/.
Start with B1 (SessionManager), then B2 (Scoring).
Do NOT modify files owned by Stream A."
```

---

## Testing Strategy

### Unit Tests (Per Stream)
- Stream A: Component tests with React Testing Library
- Stream B: Service tests with Jest

### Integration Tests (After Sync)
- End-to-end message flow tests
- UI + Service integration tests

### Manual Testing Checklist
- [ ] Sidebar resizes correctly
- [ ] Projects/sessions display
- [ ] Scores show with breakdown
- [ ] Daily stats update
- [ ] Goals can be set
- [ ] Suggestions appear and dismiss
- [ ] Summaries tab works
- [ ] Account settings work

---

## Rollback Plan

If integration fails:
1. Both streams revert to pre-integration commit
2. Identify interface mismatch
3. Update shared types
4. Re-integrate

---

## Success Criteria

### MVP (Week 1)
- [ ] Resizable sidebar works
- [ ] Projects/sessions display
- [ ] Score with breakdown shows
- [ ] Daily stats banner works

### Full Release (Week 2)
- [ ] Goals feature complete
- [ ] Suggestions engine working
- [ ] Summaries tab complete
- [ ] All settings functional
