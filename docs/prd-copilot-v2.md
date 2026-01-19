# PRD: Vibe-Log Co-Pilot v2

## Overview

A redesigned Co-Pilot experience that transforms Vibe-Log from a passive "prompt grader" into an active developer companion. The new design organizes work by projects and sessions, provides actionable prompt scoring with clear explanations, and offers intelligent suggestions based on session context.

**Core Principles:**
- **Simplicity** - Clean, uncluttered UI that doesn't overwhelm
- **Added Value Upfront** - Users see immediate benefit without configuration
- **Support Agency, Don't Judge** - Help developers, don't tell them they're wrong
- **Developer Memory** - We're an extension of developer memory, not a supervisor

---

## Problem Statement

### Current State
The existing Co-Pilot is essentially a "prompt grader":
- Reactive, not proactive
- Scores prompts without meaningful context
- No organization of sessions or projects
- Flat list of recent prompts with no structure
- Users don't understand why they got a specific score

### Pain Points We're Solving
1. **Losing context** - Developers forget what they were doing after interruptions
2. **Poor prompts** - Vague prompts lead to poor AI responses and wasted cycles
3. **No visibility** - Can't see patterns in AI usage over time

---

## Design Principles

| Instead of... | We do... |
|--------------|----------|
| Judging direction | Showing breadcrumbs |
| "Your prompt is bad" | "Here's how to make it clearer" |
| Mandatory improvements | Opt-in suggestions |
| Knowing their intent | Surfacing their history |
| Interrupting flow | Ambient awareness |

---

## UI Architecture

### Layout Overview

The new design uses a **resizable sidebar** layout with three main tabs:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  VIBE-LOG                                                                    ⚙️     │
│  ───────────────────────────────────────────────────────────────────────────────────│
│  CO-PILOT              SUMMARIES              ACCOUNT                               │
│  ════════                                                                           │
├──────────────────────────┬──┬───────────────────────────────────────────────────────┤
│                        « │▐▐│                                                       │
│  📂 PROJECTS             │▐▐│  🟢 Connected          [ Dashboard ↗ ]                │
│                          │▐▐│                                                       │
│  ▼ vibe-log-cursor-ext   │▐▐│  ┌─ 📈 TODAY ────────────────────────────────────────┐│
│  │ 🟣 now·18    ACTIVE   │▐▐│  │  12 prompts · avg 5.2 · ↑0.8 vs usual · TOP 32%  ││
│  │ 🟠 1h·8               │▐▐│  └──────────────────────────────────────────────────┘│
│  │ 🟣 yday·6             │▐▐│                                                       │
│                          │▐▐├───────────────────────────────────────────────────────┤
│  ▶ vibe-log-react (3)    │▐▐│                                                       │
│  ▶ personal-site (1)     │▐▐│  💭 YOUR PROMPT                                       │
│                          │▐▐│  ┌──────────────────────────────────────────────────┐ │
│ ─────────────────────    │▐▐│  │ now add a button to the sidebar                  │ │
│                          │▐▐│  └──────────────────────────────────────────────────┘ │
│  🎯 GOAL                 │▐▐│                                                       │
│  ┌─────────────────────┐ │▐▐├───────────────────────────────────────────────────────┤
│  │ Design co-pilot UX  │ │▐▐│                                                       │
│  └─────────────────────┘ │▐▐│  📊 PROMPT SCORE                             4.8/10   │
│  [ ✓ Complete ]          │▐▐│  ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                          │▐▐│                                                       │
│ ─────────────────────    │▐▐│  WHY THIS SCORE?                                      │
│                          │▐▐│  ┌──────────────────────────────────────────────────┐ │
│  🕐 THIS SESSION         │▐▐│  │ ✅ Builds on session    ⚠️ Which button?         │ │
│                          │▐▐│  │ ✅ Clear action (add)   ⚠️ Where in sidebar?     │ │
│  "brainstorm" 3.2        │▐▐│  │                         ⚠️ What does it do?      │ │
│  "ascii mock" 4.5        │▐▐│  └──────────────────────────────────────────────────┘ │
│  "resizable"  5.1        │▐▐│                                                       │
│  "co-pilot"   4.8        │▐▐│  BREAKDOWN                              [ ℹ️ How? ]   │
│                          │▐▐│  Specificity   ███████░░░░░░░  5.0                    │
│ ─────────────────────    │▐▐│  Context       █████████████░  7.0                    │
│  18 prompts · avg 4.6    │▐▐│  Intent        ████████░░░░░░  5.5                    │
│                          │▐▐│  Actionability █████░░░░░░░░░  3.5                    │
│                          │▐▐│  Constraints   ███░░░░░░░░░░░  2.5                    │
│                          │▐▐│                                                       │
│                          │▐▐│  [ ✨ Improve ]                                       │
│                          │▐▐│                                                       │
│                          │▐▐├───────────────────────────────────────────────────────┤
│                          │▐▐│                                                       │
│                          │▐▐│  💡 CO-PILOT SUGGESTION                               │
│                          │▐▐│  ┌──────────────────────────────────────────────────┐ │
│                          │▐▐│  │ Your session established the sidebar has:        │ │
│                          │▐▐│  │ • Projects list (top)                            │ │
│                          │▐▐│  │ • Session history (bottom)                       │ │
│                          │▐▐│  │ • Drag handle (resize)                           │ │
│                          │▐▐│  │                                                  │ │
│                          │▐▐│  │ Specify where the button goes?                   │ │
│                          │▐▐│  │                                                  │ │
│                          │▐▐│  │ [ Add to prompt ]              [ Not now ]       │ │
│                          │▐▐│  └──────────────────────────────────────────────────┘ │
│                          │▐▐│                                                       │
└──────────────────────────┴──┴───────────────────────────────────────────────────────┘
```

---

## Feature Specifications

### 1. Resizable Sidebar

The sidebar can be resized by dragging the handle, with three main states:

#### Minimum Width (Icons Only)
```
┌──┬──┬───────────────────────────────────────────────────────────────────────────────┐
│  │▐▐│                                                                               │
│» │▐▐│  🟢 Connected          [ Dashboard ↗ ]                                        │
│  │▐▐│                                                                               │
│📂│▐▐│  ┌─ 📈 TODAY ────────────────────────────────────────────────────────────────┐│
│  │▐▐│  │  12 prompts · avg 5.2 · ↑0.8 vs usual · TOP 32%                          ││
│🟣│▐▐│  └──────────────────────────────────────────────────────────────────────────┘│
│🟠│▐▐│                                                                               │
│🟣│▐▐│                                                                               │
│  │▐▐│                          Main content gets more space                         │
│📁│▐▐│                                                                               │
│📁│▐▐│                                                                               │
│  │▐▐│                                                                               │
│──│▐▐│                                                                               │
│🎯│▐▐│                                                                               │
│  │▐▐│                                                                               │
│──│▐▐│                                                                               │
│🕐│▐▐│                                                                               │
│  │▐▐│                                                                               │
└──┴──┴───────────────────────────────────────────────────────────────────────────────┘
```

#### Medium Width (Default)
Shows project names, session counts, and truncated prompt history.

#### Maximum Width (Full Details)
Shows full session cards with timestamps, prompt counts, duration, and average scores.

**Interaction Behaviors:**

| Action | Behavior |
|--------|----------|
| Drag handle left | Shrink sidebar |
| Drag handle right | Expand sidebar |
| Click `«` button | Collapse to minimum |
| Click `»` button | Expand to default |
| Double-click handle | Toggle min/default |

**Persistence:**
- Sidebar width saved locally
- Remembered across sessions

---

### 2. Projects & Sessions Organization

#### Hierarchy
```
Project (detected from folder/repo name)
└── Session (grouped by tool + time proximity)
    └── Prompts (individual messages)
```

#### Detection Logic
- **Project** = git repo name or folder name
- **Session** = same project + same tool + within 2 hours
- **New session** if: different project, different tool, or >2h gap

#### Platform Icons

| Platform | Icon | Color |
|----------|------|-------|
| Cursor | 🟣 | Purple |
| Claude Code | 🟠 | Orange |
| VS Code | 🔵 | Blue (future) |
| Windsurf | ⚪ | Gray (future) |

#### Session Display Format
```
│  ▼ vibe-log-cursor-ext   │
│  │ 🟣 now·18    ACTIVE   │  ← Platform, time, prompt count
│  │ 🟠 1h·8               │
│  │ 🟣 yday·6             │
```

---

### 3. Prompt Score System

The score is prominently displayed with clear explanations of why.

#### Score Display
```
│  📊 PROMPT SCORE                             4.8/10   │
│  ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                                                       │
│  WHY THIS SCORE?                                      │
│  ┌──────────────────────────────────────────────────┐ │
│  │ ✅ Builds on session    ⚠️ Which button?         │ │
│  │ ✅ Clear action (add)   ⚠️ Where in sidebar?     │ │
│  │                         ⚠️ What does it do?      │ │
│  └──────────────────────────────────────────────────┘ │
```

#### Five Scoring Dimensions

| Dimension | Weight | What it measures |
|-----------|--------|------------------|
| **Specificity** | 20% | How concrete and precise is the request? |
| **Context** | 25% | Does the AI have enough background? |
| **Intent** | 25% | Is the goal clear and unambiguous? |
| **Actionability** | 15% | Can the AI act on this directly? |
| **Constraints** | 15% | Are boundaries/requirements defined? |

#### Breakdown Display
```
│  BREAKDOWN                              [ ℹ️ How? ]   │
│  Specificity   ███████░░░░░░░  5.0                    │
│  Context       █████████████░  7.0                    │
│  Intent        ████████░░░░░░  5.5                    │
│  Actionability █████░░░░░░░░░  3.5                    │
│  Constraints   ███░░░░░░░░░░░  2.5                    │
```

#### "How Scores Work" Modal
```
┌──────────────────────────────────────────────────────────────────┐
│  📊 HOW PROMPT SCORES WORK                              [ ✕ ]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  We analyze prompts across 5 dimensions that research shows      │
│  lead to better AI responses:                                    │
│                                                                  │
│  🎯 SPECIFICITY (20%)                                            │
│  How concrete and precise is the request?                        │
│  ❌ "fix the bug"                                                │
│  ✅ "fix the null pointer in UserAuth.ts line 42"                │
│                                                                  │
│  📚 CONTEXT (25%)                                                │
│  Does the AI have enough background to help?                     │
│  ❌ "add a feature"                                              │
│  ✅ "in our React app using Redux, add a logout button"          │
│                                                                  │
│  🎪 INTENT (25%)                                                 │
│  Is the goal clear and unambiguous?                              │
│  ❌ "deal with this code"                                        │
│  ✅ "refactor this function to improve readability"              │
│                                                                  │
│  ⚡ ACTIONABILITY (15%)                                          │
│  Can the AI act on this directly?                                │
│  ❌ "thoughts on authentication?"                                │
│  ✅ "implement JWT auth with refresh token rotation"             │
│                                                                  │
│  🚧 CONSTRAINTS (15%)                                            │
│  Are boundaries and requirements defined?                        │
│  ❌ "make it better"                                             │
│  ✅ "optimize for <100ms response, no external deps"             │
│                                                                  │
│  💡 Higher scores typically mean fewer back-and-forth cycles     │
│     and more accurate AI responses on the first try.             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

### 4. Daily Stats & Peer Comparison

#### Daily Stats Banner
```
│  ┌─ 📈 TODAY ────────────────────────────────────────┐│
│  │  12 prompts · avg 5.2 · ↑0.8 vs usual · TOP 32%  ││
│  └──────────────────────────────────────────────────┘│
```

Shows:
- Prompt count today
- Average score today
- Delta vs user's typical average
- Percentile ranking vs peers

#### Peer Comparison (Gamification)
```
│  🏆 HOW DO YOU COMPARE?                                │
│                                                        │
│       You   ████████████████████░░░░░░░░░░░   5.2     │
│       Avg   ███████████████░░░░░░░░░░░░░░░░   4.4     │
│                                                        │
│  You're in the TOP 32% of vibe-log users today!       │
│                                                        │
│  [ 🔓 See full leaderboard → ]  (Pro feature)         │
```

---

### 5. Session Goals (Optional)

Goals are inferred after 3 prompts, then user confirms.

#### Goal Inference Flow
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  💡 CO-PILOT DETECTED A THEME                                   │
│                                                                 │
│  Your last 3 prompts are about:                                 │
│  "Co-pilot UX design for the vibe-log extension"                │
│                                                                 │
│  Set this as your session goal?                                 │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Design co-pilot UX for vibe-log extension                   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                 [ ✏️ Edit ]                      │
│                                                                 │
│  Why set a goal?                                                │
│  • Get better context suggestions                               │
│  • See progress summary at session end                          │
│  • Help co-pilot understand what you're trying to achieve       │
│                                                                 │
│  [ Set Goal ]  [ Maybe Later ]  [ Don't ask again ]            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Goal in Sidebar
```
│  🎯 GOAL                 │
│  ┌─────────────────────┐ │
│  │ Design co-pilot UX  │ │
│  └─────────────────────┘ │
│  [ ✓ Complete ]          │
```

---

### 6. Co-Pilot Suggestions

Intelligent, non-intrusive suggestions based on session context.

#### Suggestion Types

| Trigger | Suggestion Type | Intrusiveness |
|---------|-----------------|---------------|
| Prompt < 4.0 score | "Add more context" | Inline |
| Same topic 3x | "Combine these?" | Toast |
| Session > 30 min | "Progress check" | Sidebar badge |
| Returning user | "Resume from..." | Modal |
| Vague words detected | "Be more specific" | Inline |
| No goal set (10 min in) | "Set a goal?" | Sidebar prompt |

#### Context-Based Suggestion
```
│  💡 CO-PILOT SUGGESTION                               │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Your session established the sidebar has:        │ │
│  │ • Projects list (top)                            │ │
│  │ • Session history (bottom)                       │ │
│  │ • Drag handle (resize)                           │ │
│  │                                                  │ │
│  │ Specify where the button goes?                   │ │
│  │                                                  │ │
│  │ [ Add to prompt ]              [ Not now ]       │ │
│  └──────────────────────────────────────────────────┘ │
```

#### Smart Throttling Rules
- Max 1 toast per 5 minutes
- Max 3 inline tips per session
- "Not now" = don't suggest same thing for 1 hour
- "Dismiss" 3x = disable that suggestion type

---

### 7. Session Context Extraction

The co-pilot automatically extracts and tracks:

#### What We Track
- **Tech Stack** - Detected from prompts (React, TypeScript, etc.)
- **Key Decisions** - Important choices made during session
- **Entities Mentioned** - Files, components, concepts
- **Session Stats** - Duration, prompt count, topics

#### How It's Used
- Inform suggestions
- Help with resume prompts
- Provide context for scoring
- Generate session summaries

---

## Additional Tabs

### SUMMARIES Tab

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  VIBE-LOG                                                                    ⚙️     │
│  ───────────────────────────────────────────────────────────────────────────────────│
│  CO-PILOT              SUMMARIES              ACCOUNT                               │
│                        ═════════                                                    │
├──────────────────────────┬──┬───────────────────────────────────────────────────────┤
│                          │▐▐│                                                       │
│  📂 PROJECTS             │▐▐│  📈 YOUR WEEK                          Dec 1-7, 2024  │
│                          │▐▐│                                                       │
│  ▼ vibe-log-cursor-ext   │▐▐│  ┌──────────────────────────────────────────────────┐ │
│  │ 🟣 now·18             │▐▐│  │                                                  │ │
│  │ 🟠 1h·8               │▐▐│  │   7 ┤                              ╭─╮           │ │
│  │ 🟣 yday·6             │▐▐│  │   6 ┤                        ╭─╮   │ │           │ │
│  │                       │▐▐│  │   5 ┤        ╭─╮      ╭─╮    │ │   │ │  ← Today  │ │
│  ▶ vibe-log-react (3)    │▐▐│  │   4 ┤  ╭─╮   │ │      │ │    │ │   │ │           │ │
│  ▶ personal-site (1)     │▐▐│  │   3 ┤  │ │   │ │      │ │    │ │   │ │           │ │
│                          │▐▐│  │   0 ┼──┴─┴───┴─┴──────┴─┴────┴─┴───┴─┴───        │ │
│                          │▐▐│  │      Mon   Tue  Wed   Thu   Fri   Sat   Sun      │ │
│                          │▐▐│  │                                                  │ │
│                          │▐▐│  └──────────────────────────────────────────────────┘ │
│                          │▐▐│                                                       │
│                          │▐▐│  ┌────────────┐ ┌────────────┐ ┌────────────┐        │
│                          │▐▐│  │ 47 prompts │ │ avg 5.1    │ │ 🔥 3 day   │        │
│                          │▐▐│  │ this week  │ │ ↑12% vs lw │ │ streak     │        │
│                          │▐▐│  └────────────┘ └────────────┘ └────────────┘        │
│                          │▐▐│                                                       │
│                          │▐▐│  ─────────────────────────────────────────────────── │
│                          │▐▐│                                                       │
│                          │▐▐│  🏆 HOW YOU COMPARE                                   │
│                          │▐▐│                                                       │
│                          │▐▐│  You    ████████████████████░░░░░░░░░░   5.1         │
│                          │▐▐│  Avg    ███████████████░░░░░░░░░░░░░░░   4.4         │
│                          │▐▐│                                                       │
│                          │▐▐│  You're in the TOP 28% this week!                    │
│                          │▐▐│                                                       │
│                          │▐▐│  [ 🔓 Full leaderboard → ] (Pro)                     │
│                          │▐▐│                                                       │
│                          │▐▐│  ─────────────────────────────────────────────────── │
│                          │▐▐│                                                       │
│                          │▐▐│  💡 INSIGHTS                                          │
│                          │▐▐│                                                       │
│                          │▐▐│  • Best scores on "UX design" prompts (+1.8)         │
│                          │▐▐│  • Improved most: Specificity (+0.9)                 │
│                          │▐▐│  • Tip: Your "Constraints" score is lowest           │
│                          │▐▐│                                                       │
└──────────────────────────┴──┴───────────────────────────────────────────────────────┘
```

### ACCOUNT Tab

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  VIBE-LOG                                                                    ⚙️     │
│  ───────────────────────────────────────────────────────────────────────────────────│
│  CO-PILOT              SUMMARIES              ACCOUNT                               │
│                                               ═══════                               │
├──────────────────────────┬──┬───────────────────────────────────────────────────────┤
│                          │▐▐│                                                       │
│  📂 PROJECTS             │▐▐│  👤 ACCOUNT                                           │
│                          │▐▐│                                                       │
│  ▼ vibe-log-cursor-ext   │▐▐│  ┌──────────────────────────────────────────────────┐ │
│  │ 🟣 now·18             │▐▐│  │                                                  │ │
│  │ 🟠 1h·8               │▐▐│  │  @daniel                                         │ │
│  │ 🟣 yday·6             │▐▐│  │  daniel@example.com                              │ │
│  │                       │▐▐│  │                                                  │ │
│  ▶ vibe-log-react (3)    │▐▐│  │  Plan: Free                    [ Upgrade → ]    │ │
│  ▶ personal-site (1)     │▐▐│  │                                                  │ │
│                          │▐▐│  └──────────────────────────────────────────────────┘ │
│                          │▐▐│                                                       │
│                          │▐▐│  ─────────────────────────────────────────────────── │
│                          │▐▐│                                                       │
│                          │▐▐│  ⚙️ SETTINGS                                          │
│                          │▐▐│                                                       │
│                          │▐▐│  Auto-sync sessions         [====○] On               │
│                          │▐▐│  Auto-analyze prompts       [====○] On               │
│                          │▐▐│  Co-pilot suggestions       [====○] On               │
│                          │▐▐│  Daily digest email         [○====] Off              │
│                          │▐▐│                                                       │
│                          │▐▐│  ─────────────────────────────────────────────────── │
│                          │▐▐│                                                       │
│                          │▐▐│  🔗 CONNECTED TOOLS                                   │
│                          │▐▐│                                                       │
│                          │▐▐│  🟣 Cursor              Connected    [ Disconnect ]  │
│                          │▐▐│  🟠 Claude Code         Connected    [ Disconnect ]  │
│                          │▐▐│  🔵 VS Code             Not setup    [ Connect → ]   │
│                          │▐▐│                                                       │
│                          │▐▐│  ─────────────────────────────────────────────────── │
│                          │▐▐│                                                       │
│                          │▐▐│  [ Log out ]                                         │
│                          │▐▐│                                                       │
└──────────────────────────┴──┴───────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Resizable sidebar component
- [ ] Collapsible sidebar state
- [ ] Projects/sessions data model
- [ ] Session detection logic (project + tool + time)

### Phase 2: Scoring
- [ ] 5-dimension scoring algorithm
- [ ] "Why this score" explanations
- [ ] Score breakdown display
- [ ] "How scores work" modal

### Phase 3: Daily Stats
- [ ] Daily prompt count + average
- [ ] Delta vs user's typical
- [ ] Peer percentile calculation
- [ ] Stats banner component

### Phase 4: Goals & Suggestions
- [ ] Goal inference from prompts
- [ ] Goal setting flow
- [ ] Context extraction
- [ ] Suggestion engine with throttling

### Phase 5: Summaries Tab
- [ ] Weekly chart
- [ ] Streak tracking
- [ ] Peer comparison
- [ ] Insights generation

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Daily active users | - | +30% |
| Prompts improved per session | - | 3+ |
| Average prompt score | - | 5.5+ |
| Session resume rate | - | 40%+ |
| Goal completion rate | - | 60%+ |

---

## Out of Scope (v2)

- Full leaderboard (Pro feature, future)
- VS Code / Windsurf integration
- Team/org features
- Custom scoring weights
- AI-powered goal suggestions

---

## Open Questions

1. How do we handle very long sessions (100+ prompts)? - load more button afte 10th prompt - loads 10 more prompts. 


---

## Appendix: Mental Model Shift

```
OLD: "Here's your score. Good luck."

NEW: "I've been watching your session. Here's what I think
     might help based on what you're trying to accomplish."
```

The key insight is that we're building a **Developer Memory** tool, not a **Developer Judge**.
