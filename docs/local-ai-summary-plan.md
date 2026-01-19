# Local-First AI Summary Implementation Plan (Revised with Refactoring)

## Problem Statement

The VS Code extension's "Today's Summary" currently uses basic local parsing (no AI) in `V2MessageHandler.parseDailySummary()`, resulting in superficial insights like:
- Generic "X files edited" statements
- Cookie-cutter suggestions ("Continue work on [project]")
- No intelligent analysis of what was actually accomplished

## Current State Analysis

### What Already Exists ✅
- **LLM Manager** (`src/llm/llm-manager.ts`) - Provider registry, initialization, switching
- **Provider Registry** - Dynamic provider discovery via decorators
- **Existing Providers**:
  - `cursor-cli-provider.ts` - Cursor CLI detection
  - `claude-code-cli-provider.ts` - Claude Code CLI detection
  - `ollama-provider.ts` - Ollama local server
  - `openrouter-provider.ts` - API-based cloud provider
- **Settings Manager** - Configuration management
- **Onboarding Flow** - Provider detection and selection

### What Needs Refactoring ⚠️
- Provider detection logic scattered in `V2MessageHandler`
- No service layer for provider status checking
- Onboarding logic mixed with message handling
- Hard to test and reuse

### What's Missing ❌
- Summary prompt builder
- LLM execution for summaries
- Integration with daily summary flow

## Solution Architecture

### REVISED Architecture (With Refactoring)

```
┌─────────────────────────────────────────────────────────────────────┐
│                   devark-vs-extension                         │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  EXISTING (Reuse - No Changes)                             │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │  LLM Manager                                       │   │   │
│  │  │  - Provider registry                               │   │   │
│  │  │  - initialize()                                    │   │   │
│  │  │  - getAvailableProviders()                         │   │   │
│  │  │  - generateCompletion()                            │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  │                                                             │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │  Providers (Already Implemented)                   │   │   │
│  │  │  - CursorCLIProvider                               │   │   │
│  │  │  - ClaudeCodeCLIProvider                           │   │   │
│  │  │  - OllamaProvider                                  │   │   │
│  │  │  - OpenRouterProvider                              │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  NEW SERVICES (Phase 0 - Refactoring)                     │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │  ProviderDetectionService                          │   │   │
│  │  │  - detectAll(): Promise<ProviderStatus[]>          │   │   │
│  │  │  - detectOne(id): Promise<ProviderStatus>          │   │   │
│  │  │  - getCached(): ProviderStatus[]                   │   │   │
│  │  │  - clearCache()                                    │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  │                      ↓ uses                                │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │  SummaryService                                    │   │   │
│  │  │  - generateDailySummary(sessions, date)            │   │   │
│  │  │  - buildPrompt(context)                            │   │   │
│  │  │  - parseAIResponse(response)                       │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  REFACTORED (Phase 0)                                      │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │  V2MessageHandler (Simplified)                     │   │   │
│  │  │  - handleGetProviders() → uses DetectionService    │   │   │
│  │  │  - handleDetectProviders() → uses DetectionService │   │   │
│  │  │  - handleGenerateSummary() → uses SummaryService   │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  EXTERNAL (No Changes)                                     │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │  vibe-log-cli (imported as library)               │   │   │
│  │  │  - readClaudeSessions()                            │   │   │
│  │  │  - auth/logout                                     │   │   │
│  │  │  - config management                               │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation Plan (Parallel-Friendly)

### Phase 0: Refactoring Foundation (MUST DO FIRST)

These tasks extract existing logic into services for reusability.

#### Task 0.1: Extract ProviderDetectionService 🔄
**Can run in parallel with:** Task 0.2
**Dependencies:** None
**Time:** 2 hours

**Files to create:**
- `src/services/ProviderDetectionService.ts`

**What to do:**
1. Create service interface:
```typescript
export interface ProviderStatus {
  id: string;
  name: string;
  type: 'cli' | 'local' | 'cloud';
  status: 'connected' | 'available' | 'not-detected' | 'not-running' | 'not-configured';
  model?: string;
  availableModels?: string[];
}

export class ProviderDetectionService {
  constructor(private llmManager: LLMManager) {}

  async detectAll(): Promise<ProviderStatus[]>
  async detectOne(providerId: string): Promise<ProviderStatus>
  getCached(): ProviderStatus[]
  clearCache(): void
}
```

2. Extract logic from `V2MessageHandler.handleGetProviders()` (lines 238-301)
3. Extract logic from `V2MessageHandler.getProviderStatus()` (lines 1210-1270)
4. Add 30-second cache to avoid repeated CLI calls

**Acceptance criteria:**
- ✅ Service can detect all providers
- ✅ Service caches results for 30 seconds
- ✅ Returns same format as current code
- ✅ All provider types work (CLI, local, cloud)

**Test file:** `src/services/ProviderDetectionService.test.ts`

---

#### Task 0.2: Create SummaryService 📝
**Can run in parallel with:** Task 0.1, Task 0.3
**Dependencies:** None (uses existing LLMManager)
**Time:** 2 hours

**Files to create:**
- `src/services/SummaryService.ts`
- `src/services/prompts/daily-summary-prompt.ts`

**What to do:**
1. Create summary service:
```typescript
export interface SummaryContext {
  sessions: any[];
  date: Date;
  userInstructions?: string;
}

export interface AISummaryResult {
  accomplishments: string[];
  suggestedFocus: string[];
  insights?: string;
}

export class SummaryService {
  constructor(private llmManager: LLMManager) {}

  async generateDailySummary(context: SummaryContext): Promise<AISummaryResult>
  buildPrompt(context: SummaryContext): string
  parseAIResponse(response: string): AISummaryResult
}
```

2. Extract prompt building logic (will be created new)
3. Reuse existing `LLMManager.generateCompletion()` for LLM calls

**Acceptance criteria:**
- ✅ Service builds proper prompt from session data
- ✅ Service calls LLM via existing LLMManager
- ✅ Service parses JSON response correctly
- ✅ Handles errors gracefully (returns fallback)

**Test file:** `src/services/SummaryService.test.ts`

---

#### Task 0.3: Refactor V2MessageHandler 🔧
**Can run in parallel with:** Task 0.2
**Dependencies:** Task 0.1 (needs ProviderDetectionService)
**Time:** 1 hour

**Files to modify:**
- `src/panels/V2MessageHandler.ts`

**What to do:**
1. Inject `ProviderDetectionService` in constructor
2. Replace `handleGetProviders()` to use service:
```typescript
private async handleGetProviders(): Promise<void> {
  const providers = await this.providerDetectionService.detectAll();
  this.sendMessage('providersUpdate', { providers, active: ... });
}
```

3. Replace `handleDetectProviders()` to use service:
```typescript
private async handleDetectProviders(): Promise<void> {
  this.providerDetectionService.clearCache();
  await this.handleGetProviders();
}
```

4. Remove helper methods: `getProviderStatus()`, `getProviderType()`, `getProviderDescription()`

**Acceptance criteria:**
- ✅ Onboarding still works
- ✅ Provider detection still works
- ✅ Code is 50% shorter in V2MessageHandler
- ✅ All tests pass

---

### Phase 1: Summary Infrastructure (After Phase 0)

These tasks add the missing pieces for AI summaries.

#### Task 1.1: Create Summary Prompt Builder 📋
**Can run in parallel with:** Task 1.2
**Dependencies:** None
**Time:** 1 hour

**Files to create:**
- `src/services/prompts/daily-summary-prompt.ts`

**What to do:**
1. Create prompt template:
```typescript
export function buildDailySummaryPrompt(context: SummaryContext): string {
  // Format sessions for LLM
  const sessionsSummary = formatSessions(context.sessions);

  return `You are analyzing a developer's coding sessions from ${context.date}.

Sessions Data:
${sessionsSummary}

Instructions:
1. Identify what was actually accomplished
2. Provide specific, actionable suggestions
3. Be concise but insightful

Output Format (JSON only):
{
  "accomplishments": ["...", "...", "..."],
  "suggestedFocus": ["...", "...", "..."],
  "insights": "..."
}`;
}

export const SYSTEM_PROMPT = `You are an expert software development analyst...`;
```

**Acceptance criteria:**
- ✅ Prompt includes session data (duration, files, languages)
- ✅ Prompt asks for structured JSON output
- ✅ Prompt includes custom instructions if provided
- ✅ Output format is clear and parseable

**Test file:** `src/services/prompts/daily-summary-prompt.test.ts`

---

#### Task 1.2: Add Summary Types ⚙️
**Can run in parallel with:** Task 1.1
**Dependencies:** None
**Time:** 30 minutes

**Files to modify:**
- `src/services/SummaryService.ts` (add interfaces)

**What to do:**
1. Add type definitions:
```typescript
export interface SummaryContext {
  sessions: ClaudeSession[];
  date: Date;
  userInstructions?: string;
}

export interface AISummaryResult {
  accomplishments: string[];
  suggestedFocus: string[];
  insights?: string;
}

export interface DailySummary {
  date: Date;
  promptsAnalyzed: number;
  avgScore: number;
  timeCoding: number;
  filesWorkedOn: number;
  sessions: number;
  workedOn: string[];
  suggestedFocus: string[];
  insights?: string;
}
```

**Acceptance criteria:**
- ✅ Types match existing data structures
- ✅ Compatible with current UI expectations
- ✅ Includes optional insights field

---

### Phase 2: Integration (After Phase 0 + 1)

#### Task 2.1: Integrate SummaryService into V2MessageHandler 🔗
**Can run in parallel with:** None (must be sequential)
**Dependencies:** Task 0.2, Task 0.3, Task 1.1, Task 1.2
**Time:** 2 hours

**Files to modify:**
- `src/panels/V2MessageHandler.ts`

**What to do:**
1. Inject `SummaryService` in constructor
2. Update `handleGenerateSummary()` to use service:
```typescript
private async handleGenerateSummary(type: string): Promise<void> {
  try {
    // Show progress
    this.sendMessage('loadingProgress', { progress: 10, message: 'Detecting LLM...' });

    // Get sessions from vibe-log-cli
    const sessions = await this.getLocalSessions(this.cliWrapper, 1);

    if (!sessions || sessions.length === 0) {
      this.sendEmptySummary();
      return;
    }

    // Generate summary via service
    const result = await this.summaryService.generateDailySummary({
      sessions,
      date: new Date(),
      userInstructions: await this.getUserCustomInstructions()
    });

    // Convert to UI format
    const summary = this.convertToUISummary(result, sessions);

    this.sendMessage('summaryData', { type, summary });
  } catch (error) {
    // Fallback to basic parsing
    this.generateFallbackSummary();
  }
}
```

3. Add fallback method for when LLM fails
4. Add conversion method from `AISummaryResult` to `DailySummary`

**Acceptance criteria:**
- ✅ Summaries view shows AI-generated insights
- ✅ Loading progress works
- ✅ Fallback to basic parsing on error
- ✅ Shows which provider was used
- ✅ No breaking changes to existing UI

---

#### Task 2.2: Update CLI Wrapper Integration 🔌
**Can run in parallel with:** None (must be after 2.1)
**Dependencies:** Task 2.1
**Time:** 1 hour

**Files to modify:**
- `src/panels/V2MessageHandler.ts`

**What to do:**
1. Ensure `getLocalSessions()` works correctly
2. Add custom instructions fetching:
```typescript
private async getUserCustomInstructions(): Promise<string | undefined> {
  try {
    const config = await this.cliWrapper.config.getAll();
    return config.customInstructions;
  } catch {
    return undefined;
  }
}
```

3. Test with vibe-log-cli session reading

**Acceptance criteria:**
- ✅ Sessions are read from local vibe-log-cli
- ✅ Custom instructions are included if set
- ✅ Works with 0 sessions (shows empty state)
- ✅ Works with multiple sessions

---

### Phase 3: Testing & Polish

#### Task 3.1: End-to-End Testing 🧪
**Dependencies:** All previous tasks
**Time:** 2 hours

**Test scenarios:**
1. **With Claude Code CLI:**
   - ✅ Detects Claude Code
   - ✅ Generates AI summary
   - ✅ Shows "Using Claude Code CLI" in loading

2. **With Cursor CLI:**
   - ✅ Detects Cursor
   - ✅ Generates AI summary
   - ✅ Shows "Using Cursor CLI" in loading

3. **With Ollama:**
   - ✅ Detects Ollama
   - ✅ Generates AI summary
   - ✅ Shows "Using Ollama" in loading

4. **No LLM Available:**
   - ✅ Falls back to basic parsing
   - ✅ Shows "Using basic analysis"
   - ✅ Still shows summary (just less detailed)

5. **With Custom Instructions:**
   - ✅ Includes custom instructions in prompt
   - ✅ Summary respects custom format

6. **Error Handling:**
   - ✅ LLM timeout → fallback
   - ✅ Invalid JSON response → fallback
   - ✅ No sessions → empty state

---

## Parallel Work Streams

### Stream 1: Service Extraction (2-3 hours)
1. Task 0.1: ProviderDetectionService
2. Task 0.3: Refactor V2MessageHandler (depends on 0.1)

### Stream 2: Summary Infrastructure (1.5 hours)
1. Task 0.2: SummaryService
2. Task 1.1: Summary Prompt Builder
3. Task 1.2: Summary Types

### Stream 3: Integration (3 hours, sequential after Streams 1+2)
1. Task 2.1: Integrate SummaryService
2. Task 2.2: CLI Wrapper Integration
3. Task 3.1: E2E Testing

**Total parallel time: ~3 hours** (if 2 people work on Stream 1 and Stream 2)
**Total sequential time: ~9 hours** (if 1 person does everything)

---

## Files Summary

### New Files (8 files)
1. `src/services/ProviderDetectionService.ts` - Provider detection service
2. `src/services/ProviderDetectionService.test.ts` - Tests
3. `src/services/SummaryService.ts` - Summary generation service
4. `src/services/SummaryService.test.ts` - Tests
5. `src/services/prompts/daily-summary-prompt.ts` - Prompt templates
6. `src/services/prompts/daily-summary-prompt.test.ts` - Tests

### Modified Files (1 file)
1. `src/panels/V2MessageHandler.ts` - Simplified to use services

### No Changes Needed
- `src/llm/llm-manager.ts` - Already perfect, reuse as-is
- `src/llm/providers/*.ts` - Already implemented
- `vibe-log-cli/*` - Keep as-is

---

## Benefits of This Refactored Approach

### 1. Reusability
- `ProviderDetectionService` used by both onboarding AND summaries
- `SummaryService` can be used for daily/weekly/monthly summaries

### 2. Testability
- Each service has isolated unit tests
- Mock dependencies easily
- Test onboarding and summaries independently

### 3. Maintainability
- Clear separation of concerns
- V2MessageHandler is just a router (50% less code)
- Easy to add new summary types

### 4. No Duplication
- Provider detection logic in ONE place
- LLM execution logic in ONE place
- Reuses existing LLMManager

### 5. Parallel Development
- Multiple developers can work simultaneously
- Clear task boundaries
- No merge conflicts (different files)

---

## Success Criteria

- ✅ Extension detects local LLMs via existing infrastructure
- ✅ Uses best available LLM for summary generation
- ✅ Graceful fallback to basic parsing
- ✅ Shows intelligent, context-aware insights
- ✅ Custom instructions integrated into prompts
- ✅ No breaking changes to existing features
- ✅ Code is more testable and maintainable
- ✅ Services are reusable for future features

---

## Migration Path

### For Existing Code
1. Phase 0 refactoring is **backward compatible**
   - Onboarding still works the same
   - No API changes
   - Just moves code into services

2. Phase 1 adds **new capabilities**
   - Doesn't break existing summaries
   - Adds AI enhancement

3. Phase 2 integrates **seamlessly**
   - Falls back to old logic on error
   - Progressive enhancement

### For Future Features
Once refactored, new features become easy:
- Weekly AI summaries → Reuse `SummaryService`
- Monthly insights → Reuse `SummaryService`
- Auto-analyze prompts → Reuse `ProviderDetectionService`
- CLI hooks → Reuse `ProviderDetectionService`

---

## Research Notes

### Already Researched ✅
- LLM Manager architecture (exists, works)
- Provider registry pattern (exists, works)
- Onboarding flow (exists, just needs refactoring)

### Still Need to Verify ⚠️
- Cursor CLI command syntax (low priority, already have fallback)
- Ollama model preferences for code summaries
- Optimal prompt format for different providers

---

## Next Steps

### Immediate (Start Here)
1. **Task 0.1** (Stream 1): Extract ProviderDetectionService
2. **Task 0.2** (Stream 2): Create SummaryService
3. Run both in parallel Claude Code sessions

### After That
1. **Task 0.3**: Refactor V2MessageHandler
2. **Task 1.1 + 1.2**: Add prompt builder and types
3. **Task 2.1 + 2.2**: Integration
4. **Task 3.1**: Testing

### Timeline
- **Week 1**: Phase 0 (Refactoring) - 4 hours
- **Week 1**: Phase 1 (Infrastructure) - 2 hours
- **Week 2**: Phase 2 (Integration) - 3 hours
- **Week 2**: Phase 3 (Testing) - 2 hours

**Total: ~11 hours** (can be done in 2-3 work sessions with parallel development)
