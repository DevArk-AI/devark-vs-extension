# Vibe-Log Co-Pilot Extension Redesign

## Design Principles

- **Simplicity** - Single purpose per screen, minimal cognitive load
- **Value-first** - Show benefits before asking for setup
- **Conversion-focused** - Clear path from local to cloud
- **Developer-friendly** - Direct copy, no fluff

## Tagline

**FOCUS. DISCOVER. GROW. SHIP.**

---

## Screen 1: First-Time Setup (Onboarding)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                    ┌──────────────────┐                            │
│                    │    VIBE-LOG      │                            │
│                    │     LOGO   │                            │
│                    └──────────────────┘                            │
│                                                                     │
│                  FOCUS. DISCOVER. GROW. SHIP.                      │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  WHAT YOU GET                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  1. PROMPT SMARTER                                          │   │
│  │     Score prompts in real time.                             │   │
│  │     Get instant rewrites that work better.                  │   │
│  │                                                              │   │
│  │  2. UNDERSTAND YOUR PATTERNS                                │   │
│  │     See what you built today.                               │   │
│  │     Track prompt quality trends.                            │   │
│  │                                                              │   │
│  │  3. PREP YOUR STANDUPS                                      │   │
│  │     Yesterday's work, summarized. Ready for standup.        │   │
│  │     [Get cloud sync ->]                                     │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  SELECT YOUR LLM                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ● Cursor CLI                                [Auto-detect]  │   │
│  │    Your Cursor subscription                                 │   │
│  │                                                              │   │
│  │  ○ Ollama                                                   │   │
│  │    Free, local, private                                     │   │
│  │                                                              │   │
│  │  ○ Claude Code CLI                                          │   │
│  │    Your Claude subscription                                 │   │
│  │                                                              │   │
│  │  ○ Cloud API                                                │   │
│  │    Needs API key                                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [x] Auto-analyze my Cursor prompts                         │   │
│  │  [x] Generate daily session summary                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│                          [Start]                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Screen 1a: Cursor CLI Selected (Default)

When Cursor CLI is selected and auto-detect succeeds:

```
│  SELECT YOUR LLM                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ● Cursor CLI                                   Connected   │   │
│  │    Your Cursor subscription                                 │   │
│  │    Model: claude-3.5-sonnet                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
```

When Cursor CLI auto-detect fails:

```
│  SELECT YOUR LLM                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ● Cursor CLI                              Not detected     │   │
│  │    Your Cursor subscription                                 │   │
│  │                                                              │   │
│  │    Cursor not found. Make sure Cursor is installed          │   │
│  │    and you're logged in.                                    │   │
│  │                                                              │   │
│  │    [Retry]  [Use different provider]                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
```

### Screen 1b: Ollama Selected

```
│  SELECT YOUR LLM                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ● Ollama                                       Connected   │   │
│  │    Free, local, private                                     │   │
│  │                                                              │   │
│  │    Model: [llama3.2              ▼]                         │   │
│  │                                                              │   │
│  │    Available: llama3.2, codellama, mistral                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
```

When Ollama not running:

```
│  SELECT YOUR LLM                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ● Ollama                                    Not running    │   │
│  │    Free, local, private                                     │   │
│  │                                                              │   │
│  │    Start Ollama to continue.                                │   │
│  │    Run: ollama serve                                        │   │
│  │                                                              │   │
│  │    [Retry]  [Install Ollama ->]                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
```

### Screen 1c: Claude Code CLI Selected

```
│  SELECT YOUR LLM                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ● Claude Code CLI                              Connected   │   │
│  │    Your Claude subscription                                 │   │
│  │    Model: claude-3.5-sonnet                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
```

When Claude Code not authenticated:

```
│  SELECT YOUR LLM                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ● Claude Code CLI                         Not logged in    │   │
│  │    Your Claude subscription                                 │   │
│  │                                                              │   │
│  │    Run: claude login                                        │   │
│  │                                                              │   │
│  │    [Retry]  [Use different provider]                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
```

### Screen 1d: Cloud API Selected

```
│  SELECT YOUR LLM                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ● Cloud API                                                │   │
│  │    Needs API key                                            │   │
│  │                                                              │   │
│  │    Provider: [OpenRouter         ▼]                         │   │
│  │                                                              │   │
│  │    API Key:                                                 │   │
│  │    [sk-or-v1-*************************]          [Verify]   │   │
│  │                                                              │   │
│  │    Model: [claude-3.5-sonnet     ▼]                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
```

Cloud API provider dropdown options:

- OpenRouter
- AWS Bedrock
- Anthropic API
- Google Vertex AI

---

## Screen 2: Main View - Not Authenticated (No Auto-sync shown)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│                                             [Settings] │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   [CO-PILOT]    [SUMMARIES]                                        │
│   ──────────                                                       │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Cloud: Not connected            [Connect to Vibe-Log ->]   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Auto-analyze:  [ON]                              Analyzed: 0 today │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Paste a prompt to test it out...                            │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Improve]                                                         │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  RECENT PROMPTS                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │     Start coding in Cursor to see your prompts              │   │
│  │     scored here.                                            │   │
│  │                                                              │   │
│  │     Or paste one above to test it out.                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  LLM: [Cursor CLI ▲]                                  [Connected]  │
├─────────────────────────────────────────────────────────────────────┤
│  Today's Summary: No sessions yet                           [View] │
└─────────────────────────────────────────────────────────────────────┘
```

---

## LLM Drop-Up Selector (When clicking LLM in footer)

```
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  SELECT LLM                                                 │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  ● Cursor CLI                                   Connected   │   │
│  │  ○ Ollama (llama3.2)                           Connected   │   │
│  │  ○ Claude Code CLI                             Connected   │   │
│  │  ○ OpenRouter                              Not configured   │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  [+ Configure more providers]                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  LLM: [Cursor CLI ▲]                                  [Connected]  │
├─────────────────────────────────────────────────────────────────────┤
```

---

## Screen 2b: Main View - Cloud Authenticated (Auto-sync shown)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│                                             [Settings] │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   [CO-PILOT]    [SUMMARIES]                                        │
│   ──────────                                                       │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Cloud: Connected as @devuser              [Open Dashboard] │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Auto-sync: Off                  [Set up - 30 sec]          │   │
│  │  Never lose a session. Track across all your tools.         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Auto-analyze:  [ON]                            Analyzed: 47 today │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Paste a prompt to test it out...                            │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Improve]                                                         │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  RECENT PROMPTS                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  "Fix the auth timeout bug in..."        8.2/10    2m ago   │   │
│  │  "Add unit tests for UserService"        7.5/10    8m ago   │   │
│  │  "refactor this"                         2.1/10   15m ago   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                              [View all prompts]    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  LLM: [Cursor CLI ▲]                                  [Connected]  │
├─────────────────────────────────────────────────────────────────────┤
│  Today: 4h 23m coded, avg 6.2/10                            [View] │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Screen 3: Score + Improved Inline (No Second Click)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│                                             [Settings] │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   [CO-PILOT]    [SUMMARIES]                                        │
│   ──────────                                                       │
│                                                                     │
│  Auto-analyze:  [ON]                            Analyzed: 48 today │
│                                                                     │
│  ORIGINAL                                                 4.2/10   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Fix the bug in the authentication module                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Quick wins: +Be specific +Add file path +Expected behavior        │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  IMPROVED                                                 8.7/10   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Fix the login timeout bug in src/auth/login.ts where        │   │
│  │ users get logged out after 5 minutes instead of 30.         │   │
│  │ The session token expiry might use seconds not ms.          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Copy improved]  [Use this]  [Try another]                        │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  RECENT PROMPTS                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  "Fix the bug in the auth..."            4.2/10    now      │   │
│  │  "Fix the auth timeout bug in..."        8.2/10    5m ago   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  LLM: [Cursor CLI ▲]                                  [Connected]  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Screen 4: Summaries Tab - Today

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│                                             [Settings] │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   [CO-PILOT]    [SUMMARIES]                                        │
│                 ───────────                                        │
│                                                                     │
│  PERIOD                                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [Today]  [This Week]  [This Month]                         │   │
│  │  ───────                                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  December 2, 2024                                                  │
│                                                                     │
│  QUICK STATS                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Prompts analyzed    47        Avg score    6.2/10          │   │
│  │  Time coding         4h 23m    Files        12              │   │
│  │  Sessions            3         Best prompt  8.8/10          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  WHAT YOU WORKED ON                                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  - Authentication timeout fixes (src/auth/)                 │   │
│  │  - UserService unit tests                                   │   │
│  │  - API caching implementation                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  SUGGESTED FOCUS FOR TOMORROW                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Based on today's work:                                     │   │
│  │  - Complete auth timeout testing                            │   │
│  │  - Review API caching edge cases                            │   │
│  │  - Add integration tests for UserService                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│                                                   [Copy as text]   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  LLM: [Cursor CLI ▲]                                  [Connected]  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Screen 4b: Summaries Tab - No Sessions Today (Show Yesterday)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│                                             [Settings] │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   [CO-PILOT]    [SUMMARIES]                                        │
│                 ───────────                                        │
│                                                                     │
│  PERIOD                                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [Today]  [This Week]  [This Month]                         │   │
│  │  ───────                                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  December 3, 2024                                                  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │     No sessions found for today.                            │   │
│  │     Showing yesterday's summary.                            │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  YESTERDAY (December 2)                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Prompts: 47    Avg score: 6.2/10    Time: 4h 23m           │   │
│  │                                                              │   │
│  │  Worked on:                                                 │   │
│  │  - Authentication timeout fixes                             │   │
│  │  - UserService unit tests                                   │   │
│  │  - API caching implementation                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  SUGGESTED FOCUS FOR TODAY                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Based on yesterday's work:                                 │   │
│  │  - Complete auth timeout testing                            │   │
│  │  - Review API caching edge cases                            │   │
│  │  - Add integration tests for UserService                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│                                               [Start coding ->]    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  LLM: [Cursor CLI ▲]                                  [Connected]  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Screen 4c: Summaries Tab - Monday (Friday + Weekend)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│                                             [Settings] │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   [CO-PILOT]    [SUMMARIES]                                        │
│                 ───────────                                        │
│                                                                     │
│  PERIOD                                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [Today]  [This Week]  [This Month]                         │   │
│  │  ───────                                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Monday, December 2, 2024                                          │
│                                                                     │
│  FRIDAY + WEEKEND RECAP                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  Friday, Nov 29                                             │   │
│  │  Prompts: 52    Avg: 6.8/10    Time: 5h 12m                 │   │
│  │  - API refactoring complete                                 │   │
│  │  - Bug fixes in payment module                              │   │
│  │                                                              │   │
│  │  Saturday, Nov 30                                           │   │
│  │  Prompts: 8     Avg: 7.2/10    Time: 1h 05m                 │   │
│  │  - Minor documentation updates                              │   │
│  │                                                              │   │
│  │  Sunday, Dec 1                                              │   │
│  │  No sessions                                                │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  SUGGESTED FOCUS FOR THIS WEEK                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Based on Friday's work:                                    │   │
│  │  - Test the API refactoring changes                         │   │
│  │  - Complete payment module review                           │   │
│  │  - Deploy documentation updates                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│                                               [Start the week ->]  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  LLM: [Cursor CLI ▲]                                  [Connected]  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Screen 4d: Summaries Tab - This Week (Local Report via vibe-log-cli)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│                                             [Settings] │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   [CO-PILOT]    [SUMMARIES]                                        │
│                 ───────────                                        │
│                                                                     │
│  PERIOD                                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [Today]  [This Week]  [This Month]                         │   │
│  │           ───────────                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  THIS WEEK (Nov 25 - Dec 1)                                        │
│  Generated from local sessions via vibe-log-cli                    │
│                                                                     │
│  QUICK STATS                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Total time coding    18h 45m                               │   │
│  │  Prompts analyzed     234                                   │   │
│  │  Avg score            6.4/10 (+0.3 vs last week)            │   │
│  │  Sessions             12                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  DAILY BREAKDOWN                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Mon    3h 12m    42 prompts    6.2 avg                     │   │
│  │  Tue    4h 05m    51 prompts    6.8 avg                     │   │
│  │  Wed    2h 30m    28 prompts    5.9 avg                     │   │
│  │  Thu    4h 45m    58 prompts    6.5 avg                     │   │
│  │  Fri    3h 08m    47 prompts    6.2 avg                     │   │
│  │  Sat    1h 05m     8 prompts    7.2 avg                     │   │
│  │  Sun      -        -             -                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  TOP PROJECTS                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  vibe-log-extension     8h 30m    102 prompts               │   │
│  │  api-service            6h 15m     78 prompts               │   │
│  │  docs-site              4h 00m     54 prompts               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Want deeper insights? Drill-down by project, compare       │   │
│  │  weeks, and get AI-powered recommendations.                 │   │
│  │                                                              │   │
│  │  [Get detailed reports on Vibe-Log Cloud ->]                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│                                                   [Copy as text]   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  LLM: [Cursor CLI ▲]                                  [Connected]  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Screen 4e: Summaries Tab - This Month (Local Report via vibe-log-cli)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│                                             [Settings] │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   [CO-PILOT]    [SUMMARIES]                                        │
│                 ───────────                                        │
│                                                                     │
│  PERIOD                                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [Today]  [This Week]  [This Month]                         │   │
│  │                        ────────────                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  NOVEMBER 2024                                                     │
│  Generated from local sessions via vibe-log-cli                    │
│                                                                     │
│  QUICK STATS                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Total time coding    72h 15m                               │   │
│  │  Prompts analyzed     892                                   │   │
│  │  Avg score            6.1/10 (+0.2 vs Oct)                  │   │
│  │  Sessions             48                                    │   │
│  │  Active days          22 / 30                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  WEEKLY BREAKDOWN                                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Week 1    16h 30m    198 prompts    5.8 avg                │   │
│  │  Week 2    19h 45m    241 prompts    6.2 avg                │   │
│  │  Week 3    17h 15m    219 prompts    6.0 avg                │   │
│  │  Week 4    18h 45m    234 prompts    6.4 avg                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  PROMPT QUALITY TREND                                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  8|                                    ___                  │   │
│  │  6|  ___    ___    ___    ___    ___ /                      │   │
│  │  4|                                                          │   │
│  │   └──────────────────────────────────────────────────────   │   │
│  │    W1     W2     W3     W4                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Want deeper insights? Drill-down by project, compare       │   │
│  │  months, and get AI-powered recommendations.                │   │
│  │                                                              │   │
│  │  [Get detailed reports on Vibe-Log Cloud ->]                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│                                                   [Copy as text]   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  LLM: [Cursor CLI ▲]                                  [Connected]  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Screen 5: Loading State (Generating Summary)

Note: Spinner is a Vibe-Log logo pulsing like a heartbeat

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│  GENERATING SUMMARY                                    │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                                                                     │
│                                                                     │
│                                                                     │
│                                                                     │
│                    ┌───────────────────────┐                       │
│                    │                       │                       │
│                    │    ┌──────────┐       │                       │
│                    │    │ VIBE-LOG │       │                       │
│                    │    │  ♥ ♥ ♥   │       │  <- pulsing heart    │
│                    │    └──────────┘       │                       │
│                    │                       │                       │
│                    └───────────────────────┘                       │
│                                                                     │
│                    Analyzing sessions...                           │
│                                                                     │
│                    ━━━━━━━━━━━━━░░░░░░░░░░░  65%                   │
│                                                                     │
│                    Reviewing 47 prompts                            │
│                                                                     │
│                                                                     │
│                                                                     │
│                                                     [Cancel]        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Screen 6: Settings (Cloud Not Connected)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│  SETTINGS                                       [x]   │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PROMPT ANALYSIS                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Auto-analyze Cursor prompts            [====ON====]        │   │
│  │  Scores prompts as you code                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  LLM PROVIDER                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Current: Cursor CLI                           [Connected]  │   │
│  │                                                              │   │
│  │  [Change provider]                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  CLOUD SYNC                                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Status: Not connected                                      │   │
│  │                                                              │   │
│  │  [Connect to Vibe-Log]                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  DATA                                                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Local prompts: 234                                         │   │
│  │  Local sessions: 18                                         │   │
│  │                                                              │   │
│  │  [Clear local data]                                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Screen 6b: Settings (Cloud Connected - Shows Auto-sync)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│  SETTINGS                                       [x]   │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PROMPT ANALYSIS                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Auto-analyze Cursor prompts            [====ON====]        │   │
│  │  Scores prompts as you code                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  LLM PROVIDER                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Current: Cursor CLI                           [Connected]  │   │
│  │                                                              │   │
│  │  [Change provider]                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  CLOUD SYNC                                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Status: Connected as @devuser               [Disconnect]   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  AUTO-SYNC HOOKS                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Status: Not installed                                      │   │
│  │  Track sessions automatically when you code.                │   │
│  │                                                              │   │
│  │  [Set up auto-sync]                                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  DATA                                                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Local prompts: 234          Synced: 189                    │   │
│  │  Local sessions: 18          Synced: 15                     │   │
│  │                                                              │   │
│  │  [Clear local data]  [Sync now]                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Screen 7: Change Provider

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│  SELECT LLM                                     [x]   │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  BUILT-IN (Uses your existing subscriptions)                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ● Cursor CLI                                   Connected   │   │
│  │    Your Cursor subscription                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ○ Claude Code CLI                         Not configured   │   │
│  │    Your Claude subscription                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  LOCAL (Free, private)                                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ○ Ollama                                      Not running  │   │
│  │    Free, local, private                                     │   │
│  │    Model: [llama3.2              ▼]                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  CLOUD API (Requires API key)                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ○ OpenRouter                              Not configured   │   │
│  │    [Enter API key...]                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ○ AWS Bedrock                             Not configured   │   │
│  │    [Configure credentials...]                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ○ Anthropic API                           Not configured   │   │
│  │    [Enter API key...]                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│                                              [Save]  [Cancel]      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Screen 8: Hook Setup (Simplified)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│  SET UP AUTO-SYNC                               [x]   │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Track sessions automatically when you code.                       │
│                                                                     │
│  STEP 1: SELECT TOOLS TO TRACK                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  [x] Cursor                                       Detected  │   │
│  │                                                              │   │
│  │  [x] Claude Code                                  Detected  │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  STEP 2: SELECT PROJECTS TO TRACK                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  [x] All projects                                           │   │
│  │                                                              │   │
│  │  Or select specific:                                        │   │
│  │  [ ] vibe-log-extension                                     │   │
│  │  [ ] api-service                                            │   │
│  │  [ ] docs-site                                              │   │
│  │  [ ] Add project path...                                    │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Your code stays private. Only session metadata is synced.         │
│                                                                     │
│                                             [Done]  [Cancel]       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Screen 8b: Hook Setup Success

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│  AUTO-SYNC READY                                [x]   │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                                                                     │
│                                                                     │
│                    ┌───────────────────────┐                       │
│                    │                       │                       │
│                    │         [✓]          │                       │
│                    │                       │                       │
│                    │   Hooks installed!    │                       │
│                    │                       │                       │
│                    └───────────────────────┘                       │
│                                                                     │
│                    Tracking:                                       │
│                    - Cursor          Installed                     │
│                    - Claude Code     Installed                     │
│                                                                     │
│                    Projects: All                                   │
│                                                                     │
│                    Sessions will sync automatically.               │
│                                                                     │
│                                                                     │
│                                                    [Done]          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Screen 9: Cloud Connect

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│  CONNECT TO CLOUD                               [x]   │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Get more from your coding data.                                   │
│                                                                     │
│  WHAT YOU GET                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  - Daily standup email                                      │   │
│  │    Yesterday's work, summarized                             │   │
│  │                                                              │   │
│  │  - Weekly summaries                                         │   │
│  │    Track patterns over time                                 │   │
│  │                                                              │   │
│  │  - Cross-device history                                     │   │
│  │    Access from anywhere                                     │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │                 [Sign in with GitHub]                       │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│                                                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Status Bar Integration

```
┌─────────────────────────────────────────────────────────────────────┐
│ VS Code Status Bar (bottom of editor)                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ... other items ...   │ VL 6.2 │ 47 │ Cursor ▲ │                  │
│                        └────────┴────┴──────────┘                  │
│                            │      │       │                        │
│                         Avg     Count   Provider                   │
│                        score   today    (click for drop-up)        │
│                                                                     │
│  Click to open Co-Pilot panel                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## User Flow Summary

```
┌─────────────────┐
│  First Launch   │
│   (Screen 1)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Select LLM     │────▶│  Provider       │
│  (1a/1b/1c/1d)  │     │  Config Modal   │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Main View      │
│ (Screen 2/2b)   │◀──────────────────────────┐
│                 │                           │
│  [CO-PILOT]     │                           │
│  [SUMMARIES]    │                           │
└────────┬────────┘                           │
         │                                    │
    ┌────┴────┬──────────┬──────────┐        │
    ▼         ▼          ▼          ▼        │
┌───────┐ ┌───────┐ ┌─────────┐ ┌────────┐  │
│ Enter │ │ Click │ │ Click   │ │ Click  │  │
│Prompt │ │Summary│ │Settings │ │Connect │  │
│       │ │  Tab  │ │         │ │        │  │
└───┬───┘ └───┬───┘ └────┬────┘ └───┬────┘  │
    │         │          │          │        │
    ▼         ▼          ▼          ▼        │
┌───────┐ ┌───────┐ ┌─────────┐ ┌────────┐  │
│Score +│ │Summary│ │Settings │ │Cloud   │  │
│Improve│ │Tab    │ │(Scr 6)  │ │Connect │  │
│(Scr 3)│ │(Scr 4)│ └────┬────┘ │(Scr 9) │  │
└───────┘ └───────┘      │      └────────┘  │
                         │                   │
                         ▼                   │
                  ┌─────────┐               │
                  │Change   │               │
                  │Provider │               │
                  │(Screen 7)│               │
                  └─────────┘               │
                         │                   │
                         └───────────────────┘
```

---

## Component Inventory

| Component | Location | Purpose |
|-----------|----------|---------|
| Logo | Top-left header | Brand identity |
| Tab bar | Below header | CO-PILOT / SUMMARIES navigation |
| Cloud status bar | Top of content | Show connection state, CTA |
| Auto-sync banner | Below cloud (if authenticated) | Promote hooks setup |
| Toggle switch | Main view | Enable/disable auto-analyze |
| Prompt input | Center | Manual prompt testing |
| Score + Improved display | Below input | Real-time feedback with improvement |
| Recent prompts list | Below score | History and context |
| LLM drop-up selector | Footer | Quick switch between configured providers |
| Summary bar | Bottom | Daily stats, quick actions |

---

## LLM Drop-Up Selector Behavior

**Trigger:** Click on "LLM: [Provider ▲]" in footer

**Shows:**

- All configured/connected providers
- Connection status for each
- "[+ Configure more providers]" link to Settings

**Behavior:**

- Selecting a provider switches immediately
- Drop-up closes after selection
- Footer updates to show new provider

---

## Loading Animation Spec

**Vibe-Log Heartbeat Spinner:**

```
Frame 1:    Frame 2:    Frame 3:    Frame 4:
┌──────┐   ┌──────┐    ┌──────┐    ┌──────┐
│ VL   │   │ VL   │    │ VL   │    │ VL   │
│  ♡   │   │  ♥   │    │  ♥♥  │    │  ♡   │
└──────┘   └──────┘    └──────┘    └──────┘
 small      medium      large       small
```

CSS animation: `pulse` with scale transform 1.0 -> 1.2 -> 1.0, duration 800ms, ease-in-out

---

## Color Legend (VS Code Theme Variables)

| Element | Variable |
|---------|----------|
| Score good (8+) | `#4ade80` (green) |
| Score medium (5-7) | `#fbbf24` (yellow) |
| Score low (<5) | `#f87171` (red) |
| Connected | `#4ade80` (green dot) |
| Not connected | `#f87171` (red dot) |
| CTA buttons | `--vscode-button-background` |
| Secondary buttons | `--vscode-button-secondaryBackground` |
| Active tab | `--vscode-tab-activeBackground` |
| Inactive tab | `transparent` |

---

## Implementation Priority

1. **Phase 1: Core UI**
   - Screen 1 (Onboarding)
   - Screen 2/2b (Main view with tabs)
   - Screen 3 (Score + Improve inline)
   - LLM drop-up selector
   - Status bar integration
   - Heartbeat spinner animation

2. **Phase 2: Summaries Tab**
   - Screen 4 (Today's summary)
   - Screen 4b (No sessions - yesterday fallback)
   - Screen 4c (Monday - weekend recap)
   - Screen 4d (Weekly view - vibe-log-cli report)
   - Screen 4e (Monthly view - vibe-log-cli report)
   - Screen 5 (Loading state)
   - Cloud drill-down CTA

3. **Phase 3: Cloud Integration**
   - Screen 9 (Cloud connect)
   - Screen 8 (Hook setup - simplified)
   - Screen 8b (Hook success)
   - Auto-sync status display

4. **Phase 4: Settings & Providers**
   - Screen 6/6b (Settings)
   - Screen 7 (Provider selection)
   - All provider configurations

---

## Summary of All Changes

| # | Change |
|---|--------|
| 1 | Tagline: "FOCUS. DISCOVER. GROW. SHIP." |
| 2 | Tab structure (CO-PILOT / SUMMARIES) on all main screens |
| 3 | Auto-sync only shown when cloud is authenticated |
| 4 | Screen 3 shows original + improved inline (no double click) |
| 5 | No sessions today -> show yesterday + suggested focus |
| 6 | Monday -> shows Friday + weekend recap |
| 7 | Added loading state with heartbeat spinner |
| 8 | Added "Suggested Focus for Tomorrow" in daily summary |
| 9 | Added Summaries tab with Today/Week/Month views |
| 10 | Weekly/monthly summaries based on vibe-log-cli local report |
| 11 | Replaced "Email summary" with cloud drill-down CTA |
| 12 | Auto-sync hooks hidden when cloud not connected |
| 13 | Hook setup: Select tools -> Select projects -> Done/Cancel |
| 14 | Removed path references from hook setup |
| 15 | Cloud connect: Removed team insights, Google sign-in |
| 16 | Heartbeat logo spinner for loading states |
| 17 | LLM footer is now a drop-up selector for quick provider switching |
