# Plan: Enrich Co-Pilot Coaching Context

## Problem
Coaching suggestions are superficial because the LLM receives minimal context:
- Generic system prompt
- No user prompt text
- No score breakdown
- Hardcoded `sessionDuration = 0`
- Tech stack defaults to 'unknown'
- No code snippets
- No conversation history

## Goal
Enrich the coaching prompt with:
1. Last captured agent response (full text)
2. Session goal (if set)
3. First user prompt in session
4. Last 3 conversation interactions
5. Code snippets from mentioned entities

## Data Availability Analysis

| Data Needed | Available? | Source |
|-------------|------------|--------|
| Last agent response | Yes | `CapturedResponse.response` (max 5000 chars) |
| Session goal | Yes | `GoalService.getGoalStatus()` |
| First user prompt | Yes | `session.prompts[0].text` |
| User prompts history | Yes | `session.prompts[]` |
| Agent responses history | **NO** | Not stored in session |
| Code snippets | Yes | `SmartSnippetService.getSnippetsForPrompt()` |
| Prompt score breakdown | Yes | `linkedPrompt` can carry score |

### Challenge: Conversation History
`PromptRecord[]` only stores user prompts, not agent responses.

**Decision**: Store agent responses in session to enable true conversation history.

---

## Implementation Plan

### Phase 1: Enrich CoachingService.buildCoachingPrompt()

**File**: `src/services/CoachingService.ts`

#### 1.1 Improve System Prompt (line 206)

Replace generic prompt with detailed coaching instructions:

```typescript
const COACHING_SYSTEM_PROMPT = `You are an expert coding coach analyzing a developer's AI-assisted coding session.

CRITICAL RULES:
1. NEVER give generic advice like "add tests" or "improve documentation"
2. ALWAYS reference specific files, functions, or code from the context provided
3. ALWAYS explain WHY the suggestion matters for THIS specific work
4. Make suggestions that build directly on what was just accomplished
5. If a goal is set, prioritize suggestions that advance the goal
6. Consider what the developer's prompt was trying to achieve

SUGGESTION QUALITY EXAMPLES:
- BAD: "Consider adding tests" (too generic)
- GOOD: "Write tests for the handleAuth function - specifically test the token expiration edge case you just implemented"

Each suggestion must include:
- Specific file or function to work on
- Clear, actionable first step
- Why this matters NOW based on the context`;
```

#### 1.2 Include Full Agent Response

Add the captured response text to the prompt:

```typescript
<agent_response>
<full_text>
${response.response.slice(0, 3000)}
</full_text>
<summary>${analysis.summary}</summary>
<outcome>${analysis.outcome}</outcome>
<files_modified>${analysis.entitiesModified.join(', ') || 'none'}</files_modified>
<tool_calls>${response.toolCalls?.map(t => t.name).join(', ') || 'none'}</tool_calls>
</agent_response>
```

#### 1.3 Include Original Prompt

Add the triggering prompt text:

```typescript
<triggering_prompt>
<text>${linkedPrompt?.prompt || 'N/A'}</text>
</triggering_prompt>
```

#### 1.4 Include Session History (First Prompt + Last 3 Interactions)

Use `getLastInteractions()` for prompt+response pairs:

```typescript
const sessionManager = getSessionManager();
const session = sessionManager.getActiveSession();
const lastInteractions = sessionManager.getLastInteractions(3);

// Build history XML
<session_history>
<first_prompt>${session?.prompts[0]?.text.slice(0, 500) || 'N/A'}</first_prompt>
<recent_interactions>
${lastInteractions.map((interaction, i) => `
<interaction index="${i + 1}">
<user_prompt>${interaction.prompt.text.slice(0, 400)}</user_prompt>
<agent_response>${interaction.response?.text.slice(0, 600) || 'No response captured'}</agent_response>
<files_modified>${interaction.response?.filesModified.join(', ') || 'none'}</files_modified>
</interaction>
`).join('')}
</recent_interactions>
</session_history>
```

#### 1.5 Fix Session Duration

Replace hardcoded `sessionDuration = 0`:

```typescript
const session = getSessionManager().getActiveSession();
const sessionDuration = session
  ? Math.round((Date.now() - session.startTime.getTime()) / 60000)
  : 0;
```

---

### Phase 2: Add Code Snippets (from modified files)

#### 2.1 Integrate SmartSnippetService

**Decision**: Extract snippets from files modified only (not prompt text).

```typescript
// In buildCoachingPrompt()
const snippetService = getSmartSnippetService();

// Use files modified by the agent response
const modifiedFiles = response.filesModified || [];
const snippets = await snippetService.getSnippetsFromFiles(modifiedFiles);
```

#### 2.2 Add Method to SmartSnippetService

**File**: `src/services/SmartSnippetService.ts`

Add new method to fetch snippets from specific file paths:

```typescript
/**
 * Get snippets from specific file paths (for coaching context)
 */
public async getSnippetsFromFiles(filePaths: string[]): Promise<SmartSnippet[]> {
  if (!filePaths.length) return [];

  const snippets: SmartSnippet[] = [];
  const maxSnippets = 3;
  const maxLinesPerSnippet = 50;

  for (const filePath of filePaths.slice(0, maxSnippets)) {
    try {
      const uri = await this.resolveFilePath(filePath);
      if (!uri) continue;

      const content = await this.readFileContent(uri);
      const snippet = this.extractRelevantSection(content, maxLinesPerSnippet);

      snippets.push({
        entityName: path.basename(filePath),
        filePath: filePath,
        relevantCode: snippet,
        extractionReason: 'Modified by agent',
        lineCount: snippet.split('\n').length,
      });
    } catch (error) {
      console.warn(`[SmartSnippetService] Failed to read ${filePath}:`, error);
    }
  }

  return snippets;
}
```

#### 2.2 Add Snippets to Prompt

```typescript
<code_context>
${snippets.length > 0 ? snippets.map(s => `
<snippet file="${s.filePath}" entity="${s.entityName}">
${s.relevantCode.slice(0, 500)}
</snippet>
`).join('') : '<no_relevant_code_found/>'}
</code_context>
```

---

### Phase 3: Store Agent Responses in Session

To enable true "last 3 interactions" (user prompt + agent response pairs).

#### 3.1 Add ResponseRecord Type

**File**: `src/services/types/session-types.ts`

```typescript
/**
 * Record of an agent response in the session
 */
export interface ResponseRecord {
  id: string;
  promptId: string;                    // Links to the PromptRecord that triggered this
  timestamp: Date;
  text: string;                        // Response text (truncated to 2000 chars)
  outcome: 'success' | 'partial' | 'error';
  filesModified: string[];
  toolCalls: string[];                 // Tool names used
  source: 'cursor' | 'claude_code';
}
```

#### 3.2 Update Session Interface

**File**: `src/services/types/session-types.ts`

Add `responses` array to Session:

```typescript
export interface Session {
  // ... existing fields
  prompts: PromptRecord[];
  responses: ResponseRecord[];         // NEW: Agent responses linked to prompts
}
```

#### 3.3 Add Method to SessionManagerService

**File**: `src/services/SessionManagerService.ts`

```typescript
/**
 * Add a response to the current session, linked to a prompt
 */
public addResponse(response: CapturedResponse, promptId?: string): void {
  const session = this.activeSession;
  if (!session) return;

  const responseRecord: ResponseRecord = {
    id: response.id,
    promptId: promptId || this.findMatchingPromptId(response),
    timestamp: new Date(response.timestamp),
    text: response.response.slice(0, 2000),
    outcome: this.mapOutcome(response),
    filesModified: response.filesModified || [],
    toolCalls: response.toolCalls?.map(t => t.name) || [],
    source: response.source,
  };

  session.responses.push(responseRecord);
  this.notifySessionUpdate();
}

/**
 * Get last N interactions (prompt + response pairs)
 */
public getLastInteractions(count: number): Array<{
  prompt: PromptRecord;
  response?: ResponseRecord;
}> {
  const session = this.activeSession;
  if (!session) return [];

  // Get last N prompts with their linked responses
  const recentPrompts = session.prompts.slice(-count);

  return recentPrompts.map(prompt => ({
    prompt,
    response: session.responses.find(r => r.promptId === prompt.id),
  }));
}
```

#### 3.4 Wire Up Response Storage

**File**: `src/services/HookBasedPromptService.ts`

When a response is detected, store it in session:

```typescript
// In handleNewResponseFile() or similar
private async handleNewResponse(response: CapturedResponse, linkedPrompt?: CapturedPrompt): void {
  // Store in session for history
  const sessionManager = getSessionManager();
  sessionManager.addResponse(response, linkedPrompt?.id);

  // Continue with coaching generation...
  this.emit('responseDetected', { response, linkedPrompt });
}
```


---

## Files to Modify

| File | Changes |
|------|---------|
| `src/services/types/session-types.ts` | Add ResponseRecord interface, update Session interface |
| `src/services/SessionManagerService.ts` | Add addResponse(), getLastInteractions() methods |
| `src/services/HookBasedPromptService.ts` | Wire up response storage when response detected |
| `src/services/SmartSnippetService.ts` | Add getSnippetsFromFiles() method |
| `src/services/CoachingService.ts` | Main changes - enrich buildCoachingPrompt(), improve system prompt |

---

## Final Enriched Prompt Structure

```xml
<coaching_request>

<current_response>
<full_text>[Last 3000 chars of agent response]</full_text>
<outcome>success|partial|error</outcome>
<files_modified>file1.ts, file2.ts</files_modified>
<tool_calls>Edit, Write, Bash</tool_calls>
</current_response>

<triggering_prompt>
<text>[The prompt that triggered this response]</text>
</triggering_prompt>

<session_goal>
<text>[User's session goal]</text>
<progress>45%</progress>
</session_goal>

<session_history>
<first_prompt>[What the user started with - session opening context]</first_prompt>
<recent_interactions>
  <interaction index="1">
    <user_prompt>[3rd most recent user prompt]</user_prompt>
    <agent_response>[Agent's response to that prompt]</agent_response>
    <files_modified>file1.ts</files_modified>
  </interaction>
  <interaction index="2">
    <user_prompt>[2nd most recent]</user_prompt>
    <agent_response>[Agent's response]</agent_response>
    <files_modified>file2.ts, file3.ts</files_modified>
  </interaction>
  <interaction index="3">
    <user_prompt>[Most recent - same as triggering_prompt]</user_prompt>
    <agent_response>[Same as current_response]</agent_response>
    <files_modified>file4.ts</files_modified>
  </interaction>
</recent_interactions>
</session_history>

<session_context>
<tech_stack>React, TypeScript, Express</tech_stack>
<recent_topics>authentication, database, api</recent_topics>
<session_duration>25 minutes</session_duration>
</session_context>

<code_context>
<snippet file="src/auth.ts">
[Code from modified files - max 500 chars per file]
</snippet>
</code_context>

<instructions>
[Detailed instructions for generating suggestions]
</instructions>

</coaching_request>
```

---

## Testing Strategy

1. **Manual Testing**:
   - Enable coaching, trigger a response
   - Check console logs for the enriched prompt
   - Verify suggestions are more specific

2. **Log the Full Prompt**:
   - Add `console.log('[CoachingService] Enriched prompt:', prompt)` temporarily
   - Verify all sections are populated

---

## Implementation Order

1. **Phase 3 first** - Add ResponseRecord and session storage (foundational)
2. **Phase 2** - Add SmartSnippetService.getSnippetsFromFiles()
3. **Phase 1** - Enrich CoachingService.buildCoachingPrompt()

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Code snippet source | Files modified only (from response.filesModified) |
| Conversation history | Store agent responses in session (ResponseRecord) |
| Include prompt scores | No - not important for coaching |
| Response truncation | 3000 chars for current, 600 chars for history entries |
| Prompt truncation | 500 chars for first prompt, 400 chars for history |
