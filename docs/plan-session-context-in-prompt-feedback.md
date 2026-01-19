# Plan: Incorporate Session Correspondence into Prompt Feedback

## Problem Statement

The Co-Pilot prompt feedback system has infrastructure for session context but underutilizes it:
1. **PromptContext interface** is too simple - missing prompt+response correspondence
2. **Some code paths skip context entirely** (prompt-analysis-handler, UnifiedPromptDetectionService, AutoAnalyzeService)
3. **Rich context data is gathered but NOT passed through** to the scorer/enhancer
4. **Context integration in Scorer is shallow** - just adds notes, doesn't influence scoring

## User Requirements

1. **Include correspondence** (prompt + response pairs):
   - First 3 messages (session start context/objective)
   - Last 3 messages (recent continuity)
2. **Include session goal** (text only, no progress tracking)
3. Goal text is already supported in `PromptContext` - just ensure it's passed through

## Existing Pattern: CoachingService (lines 350-366)

The `CoachingService` already implements this pattern well:
```typescript
const lastInteractions = sessionManager.getLastInteractions(3);
const firstPromptText = session?.prompts[session.prompts.length - 1]?.text;

// Formats as XML with prompt + response pairs
const interactionsXml = lastInteractions.map((interaction) => `
<interaction>
<user_prompt>${interaction.prompt.text}</user_prompt>
<agent_response>${interaction.response?.text || 'No response'}</agent_response>
<files_modified>${interaction.response?.filesModified.join(', ') || 'none'}</files_modified>
</interaction>`);
```

## Implementation Plan

### Step 1: Extend PromptContext Interface

**File:** `src/copilot/base-copilot-tool.ts` (lines 27-37)

Add interaction history:
```typescript
export interface PromptContext {
  // Existing fields
  goal?: string | null;
  techStack?: string[];
  recentTopics?: string[];
  codeSnippets?: Array<{...}>;
  sessionDuration?: number;

  // NEW: Session correspondence (prompt + response pairs)
  firstInteractions?: Array<{
    prompt: string;
    response?: string;
    filesModified?: string[];
  }>;
  lastInteractions?: Array<{
    prompt: string;
    response?: string;
    filesModified?: string[];
  }>;
}
```

### Step 2: Add Helper Functions in context-utils.ts

**File:** `src/services/context-utils.ts`

Add functions to extract interactions from session:
```typescript
import { getSessionManager } from './SessionManagerService';

interface InteractionContext {
  prompt: string;
  response?: string;
  filesModified?: string[];
}

function getFirstInteractions(count: number): InteractionContext[] {
  const session = getSessionManager().getActiveSession();
  if (!session || session.prompts.length === 0) return [];

  // Prompts are stored newest-first, so get from end for earliest
  const firstPrompts = session.prompts.slice(-count).reverse();
  return firstPrompts.map(p => {
    const response = session.responses?.find(r => r.promptId === p.id);
    return {
      prompt: p.text.slice(0, 400),
      response: response?.text.slice(0, 600),
      filesModified: response?.filesModified,
    };
  });
}

function getLastInteractions(count: number): InteractionContext[] {
  const sessionManager = getSessionManager();
  const interactions = sessionManager.getLastInteractions(count);
  return interactions.map(i => ({
    prompt: i.prompt.text.slice(0, 400),
    response: i.response?.text.slice(0, 600),
    filesModified: i.response?.filesModified,
  }));
}
```

### Step 3: Update gatherPromptContext

**File:** `src/services/context-utils.ts` (lines 108-114)

Add interaction context to the result:
```typescript
const result: PromptContext = {
  // Existing
  techStack: mergedTechStack,
  goal: improvementContext.goal.text,
  recentTopics: improvementContext.recentHistory.alreadyAskedAbout,
  sessionDuration: improvementContext.recentHistory.sessionDuration,
  codeSnippets: snippets,

  // NEW: Add correspondence
  firstInteractions: getFirstInteractions(3),
  lastInteractions: getLastInteractions(3),
};
```

### Step 4: Fix Code Paths Missing Context

#### 4a. prompt-analysis-handler.ts (lines 102-131)

**Current:**
```typescript
const scorePromise = scorer.scorePromptV2(prompt).then((result) => {
// ...
const enhancePromise = enhancer.enhancePrompt(prompt, 'medium').then(async (result) => {
```

**Fix:**
```typescript
import { gatherPromptContext } from '../../services/context-utils';

// Before scoring, gather context
const context = await gatherPromptContext(prompt, '[PromptAnalysisHandler]');

const scorePromise = scorer.scorePromptV2(prompt, undefined, context).then((result) => {
// ...
const enhancePromise = enhancer.enhancePrompt(prompt, 'medium', undefined, context).then(async (result) => {
```

#### 4b. UnifiedPromptDetectionService.ts (line 395)

**Current:**
```typescript
const scorePromise = scorer.scorePromptV2(prompt.text).then(async (result) => {
```

**Fix:**
```typescript
import { gatherPromptContext } from './context-utils';

const context = await gatherPromptContext(prompt.text, '[UnifiedPromptDetection]');
const scorePromise = scorer.scorePromptV2(prompt.text, undefined, context).then(async (result) => {
```

#### 4c. AutoAnalyzeService.ts (line 607)

**Current:**
```typescript
const scorePromise = scorer.scorePromptV2(prompt.userPrompt);
```

**Fix:**
```typescript
import { gatherPromptContext } from './context-utils';

const context = await gatherPromptContext(prompt.userPrompt, '[AutoAnalyze]');
const scorePromise = scorer.scorePromptV2(prompt.userPrompt, undefined, context);
```

### Step 5: Enhance PromptScorer Context Integration

**File:** `src/copilot/prompt-scorer.ts` (lines 210-226)

Enhance the context hints to include correspondence:
```typescript
// Existing hints (goal, techStack, recentTopics)...

// NEW: Add session correspondence
if (context.firstInteractions?.length) {
  const firstEx = context.firstInteractions[0];
  hints.push(`Session started with: "${firstEx.prompt.slice(0, 100)}..."`);
  if (firstEx.response) {
    hints.push(`Initial response addressed: ${firstEx.filesModified?.join(', ') || 'general discussion'}`);
  }
}

if (context.lastInteractions?.length) {
  const recentContext = context.lastInteractions.map((i, idx) =>
    `[${idx+1}] User: "${i.prompt.slice(0, 80)}..." → AI: ${i.response ? `responded (${i.filesModified?.length || 0} files)` : 'no response yet'}`
  ).join('\n');
  hints.push(`Recent conversation:\n${recentContext}`);
}
```

### Step 6: Enhance PromptEnhancer Context Integration

**File:** `src/copilot/prompt-enhancer.ts` (lines 144-166)

Add correspondence to enhancement context:
```typescript
// NEW: Session correspondence for better enhancement suggestions
if (context.firstInteractions?.length) {
  const firstStr = context.firstInteractions.map((i, idx) =>
    `${idx+1}. User: "${i.prompt.slice(0, 200)}"\n   AI: ${i.response?.slice(0, 200) || 'N/A'}`
  ).join('\n');
  parts.push(`SESSION START (first ${context.firstInteractions.length} exchanges):\n${firstStr}`);
}

if (context.lastInteractions?.length) {
  const lastStr = context.lastInteractions.map((i, idx) =>
    `${idx+1}. User: "${i.prompt.slice(0, 200)}"\n   AI: ${i.response?.slice(0, 200) || 'N/A'}\n   Files: ${i.filesModified?.join(', ') || 'none'}`
  ).join('\n');
  parts.push(`RECENT EXCHANGES (last ${context.lastInteractions.length}):\n${lastStr}`);
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/copilot/base-copilot-tool.ts` | Add `firstInteractions`, `lastInteractions` to PromptContext |
| `src/services/context-utils.ts` | Add helper functions, pass interactions to PromptContext |
| `src/panels/handlers/prompt-analysis-handler.ts` | Add context gathering before scoring/enhancing |
| `src/services/UnifiedPromptDetectionService.ts` | Add context gathering |
| `src/services/AutoAnalyzeService.ts` | Add context gathering |
| `src/copilot/prompt-scorer.ts` | Include correspondence in LLM prompt hints |
| `src/copilot/prompt-enhancer.ts` | Include correspondence in enhancement context |

## Testing Strategy

1. **Unit tests:** Update existing scorer/enhancer tests to include interaction context
2. **Integration test:** Verify context flows through all code paths
3. **Manual test:** Start a session, send multiple prompts with responses, verify feedback references earlier exchanges

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Context gathering adds latency | Already has 2s timeout with graceful degradation |
| LLM prompt too long with history | Truncate prompts to 400 chars, responses to 600 chars |
| No responses captured yet | Handle gracefully with "N/A" or "no response yet" |

## Success Criteria

1. Prompt feedback references earlier exchanges when relevant
2. Enhancement suggestions consider conversation continuity
3. All code paths (hook-based, manual, auto-analyze) pass context
4. First 3 + Last 3 interactions included in scoring context
5. Session goal (when set) is incorporated into feedback and suggestions
