# Context-Powered Prompt Analysis Plan

## Goal
Make **both Prompt Lab AND auto-captured prompts** more powerful by automatically injecting relevant context into LLM calls for scoring and enhancement. Currently, both paths operate in complete isolation - all context infrastructure exists but isn't wired up.

## Scope
- **Prompt Lab** (`PromptLabView.tsx`) - Manual prompt testing
- **Auto-captured prompts** (`HookBasedPromptService.ts`) - Real-time Cursor/Claude Code detection

## User Decisions
- **UI Approach**: Auto Mode (Smart) - no user selector, just works behind the scenes
- **Context Sources**: All - tech stack, goal, code snippets, AND session history

---

## Implementation Phases

### Phase 1: Core Context Infrastructure

**1.1 Define PromptContext Interface**

File: `src/copilot/base-copilot-tool.ts`

Add new interface for context passing:
```typescript
export interface PromptContext {
  goal?: string | null;
  techStack?: string[];
  recentTopics?: string[];  // Already-addressed topics
  codeSnippets?: Array<{
    entityName: string;
    filePath: string;
    relevantCode: string;
  }>;
  sessionDuration?: number;
}
```

**1.2 Modify BaseCopilotTool**

File: `src/copilot/base-copilot-tool.ts`

- Add optional `context` parameter to `execute()` method (line 44)
- Change `buildPrompt()` signature to accept context (line 75)
- Pass context through the call chain

```typescript
async execute(input: TInput, onProgress?: ProgressCallback, context?: PromptContext): Promise<TOutput>

protected abstract buildPrompt(input: TInput, context?: PromptContext): string;
```

---

### Phase 2: Enhance LLM Prompts with Context

**2.1 Update PromptEnhancer**

File: `src/copilot/prompt-enhancer.ts`

Add context parameter to public API:
```typescript
public async enhancePrompt(
  userPrompt: string,
  level: EnhancementLevel = 'medium',
  onProgress?: ProgressCallback,
  context?: PromptContext  // NEW
): Promise<EnhancedPrompt>
```

Modify `buildPrompt()` (line 93) to inject context:
```typescript
protected buildPrompt(input: EnhancementInput, context?: PromptContext): string {
  // ... existing base prompt ...

  let contextSection = '';
  if (context) {
    const parts: string[] = [];

    if (context.goal) {
      parts.push(`USER'S SESSION GOAL: ${context.goal}`);
    }
    if (context.techStack?.length) {
      parts.push(`TECH STACK: ${context.techStack.join(', ')}`);
    }
    if (context.recentTopics?.length) {
      parts.push(`TOPICS ALREADY DISCUSSED: ${context.recentTopics.slice(0, 5).join(', ')}`);
    }
    if (context.codeSnippets?.length) {
      parts.push('RELEVANT CODE:\n' + context.codeSnippets
        .slice(0, 2)
        .map(s => `// ${s.filePath}\n${s.relevantCode.slice(0, 400)}`)
        .join('\n\n'));
    }

    if (parts.length > 0) {
      contextSection = `\n\nCONTEXT (use to make enhancement more relevant):\n${parts.join('\n\n')}`;
    }
  }

  return `${basePrompt}${contextSection}...`;
}
```

**2.2 Update PromptScorer**

File: `src/copilot/prompt-scorer.ts`

Similar changes:
- Add `context?: PromptContext` parameter to `scorePromptV2()`
- Modify `buildPrompt()` to add context hints for scoring:

```typescript
// Add to buildPrompt():
let contextHints = '';
if (context?.techStack?.length) {
  contextHints += `\nNote: User is working with ${context.techStack.join(', ')}.`;
}
if (context?.goal) {
  contextHints += `\nNote: User's current goal is "${context.goal}".`;
}
```

---

### Phase 3: Wire Context Gathering in V2MessageHandler

**3.1 Add Context Gathering Method**

File: `src/panels/V2MessageHandler.ts`

Add new private method:
```typescript
private async gatherPromptLabContext(prompt: string): Promise<PromptContext | undefined> {
  try {
    const startTime = Date.now();
    const contextExtractor = getContextExtractor();

    // Use existing buildImprovementContext() - already built!
    const improvementContext = await Promise.race([
      contextExtractor.buildImprovementContext(prompt),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)) // 1200ms timeout
    ]);

    if (!improvementContext) {
      console.log('[PromptLab] Context gathering timed out');
      return undefined;
    }

    const result: PromptContext = {
      techStack: improvementContext.technical.techStack,
      goal: improvementContext.goal.text,
      recentTopics: improvementContext.recentHistory.alreadyAskedAbout,
      sessionDuration: improvementContext.recentHistory.sessionDuration,
      codeSnippets: improvementContext.technical.codeSnippets.map(s => ({
        entityName: s.entityName,
        filePath: s.filePath,
        relevantCode: s.relevantCode,
      })),
    };

    console.log(`[PromptLab] Context gathered in ${Date.now() - startTime}ms:`, {
      techStack: result.techStack?.length || 0,
      hasGoal: !!result.goal,
      snippets: result.codeSnippets?.length || 0,
    });

    return result;
  } catch (error) {
    console.warn('[PromptLab] Context gathering failed:', error);
    return undefined;
  }
}
```

**3.2 Modify handleAnalyzePromptLabPrompt()**

File: `src/panels/V2MessageHandler.ts` (line 3306)

Wire in context gathering:
```typescript
private async handleAnalyzePromptLabPrompt(prompt: string, regenerate: boolean = false): Promise<void> {
  // NEW: Gather context automatically
  const context = await this.gatherPromptLabContext(prompt);

  // Send context info to UI for transparency
  if (context) {
    this.sendMessage('promptLabContextUsed', {
      goal: context.goal,
      techStack: context.techStack || [],
      snippetCount: context.codeSnippets?.length || 0,
      topicsCount: context.recentTopics?.length || 0,
    });
  }

  // Pass context to scoring and enhancement
  const scorer = new PromptScorer(llmManager);
  const enhancer = new PromptEnhancer(llmManager);

  const scorePromise = scorer.scorePromptV2(prompt, undefined, context);  // Pass context
  const enhancePromise = enhancer.enhancePrompt(prompt, enhancementLevel, undefined, context);  // Pass context

  // ... rest unchanged ...
}
```

---

### Phase 3B: Wire Context in HookBasedPromptService (Auto-Captured)

**3B.1 Add Context Gathering to HookBasedPromptService**

File: `src/services/HookBasedPromptService.ts`

Add import at top:
```typescript
import { getContextExtractor } from './ContextExtractor';
import type { PromptContext } from '../copilot/base-copilot-tool';
```

Add context gathering method:
```typescript
private async gatherAutoAnalyzeContext(prompt: CapturedPrompt): Promise<PromptContext | undefined> {
  try {
    const startTime = Date.now();
    const contextExtractor = getContextExtractor();

    const improvementContext = await Promise.race([
      contextExtractor.buildImprovementContext(prompt.prompt),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200))
    ]);

    if (!improvementContext) {
      console.log('[HookBasedPromptService] Context gathering timed out');
      return undefined;
    }

    const result: PromptContext = {
      techStack: improvementContext.technical.techStack,
      goal: improvementContext.goal.text,
      recentTopics: improvementContext.recentHistory.alreadyAskedAbout,
      sessionDuration: improvementContext.recentHistory.sessionDuration,
      codeSnippets: improvementContext.technical.codeSnippets.map(s => ({
        entityName: s.entityName,
        filePath: s.filePath,
        relevantCode: s.relevantCode,
      })),
    };

    console.log(`[HookBasedPromptService] Context gathered in ${Date.now() - startTime}ms`);
    return result;
  } catch (error) {
    console.warn('[HookBasedPromptService] Context gathering failed:', error);
    return undefined;
  }
}
```

**3B.2 Modify analyzePrompt()**

File: `src/services/HookBasedPromptService.ts` (line 497)

Update to gather and pass context:
```typescript
private async analyzePrompt(prompt: CapturedPrompt): Promise<void> {
  console.log('[HookBasedPromptService] Analyzing prompt:', prompt.id);

  // NEW: Gather context automatically
  const context = await this.gatherAutoAnalyzeContext(prompt);

  // ... existing notifyWebview code ...

  const scorer = new PromptScorer(llmManager);
  const enhancer = new PromptEnhancer(llmManager);

  // Pass context to both
  const scorePromise = scorer.scorePromptV2(prompt.prompt, undefined, context);  // Add context
  const enhancePromise = enhancer.enhancePrompt(prompt.prompt, 'medium', undefined, context);  // Add context

  // ... rest unchanged ...
}
```

---

### Phase 4: UI Transparency (Optional Context Preview)

**4.1 Add Context Preview to PromptLabView**

File: `webview/menu/components/v2/PromptLabView.tsx`

Add small collapsible section showing what context was used:
```tsx
// Add state for context info
const [contextUsed, setContextUsed] = useState<{
  goal?: string;
  techStack: string[];
  snippetCount: number;
} | null>(null);

// Handle new message in useEffect
case 'promptLabContextUsed':
  setContextUsed(message.data);
  break;

// Add UI element (collapsible, below analyze button)
{contextUsed && (
  <div className="vl-context-badge-row">
    <span className="vl-context-badge">
      {contextUsed.techStack.length > 0 && `${contextUsed.techStack.slice(0, 3).join(', ')}`}
      {contextUsed.goal && ` | Goal set`}
      {contextUsed.snippetCount > 0 && ` | ${contextUsed.snippetCount} snippets`}
    </span>
  </div>
)}
```

**4.2 Add Types**

File: `webview/menu/state/types-v2.ts`

```typescript
// Add to PromptLabState
lastContextUsed?: {
  goal?: string;
  techStack: string[];
  snippetCount: number;
  topicsCount: number;
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/copilot/base-copilot-tool.ts` | Add `PromptContext` interface, modify `execute()` and `buildPrompt()` signatures |
| `src/copilot/prompt-enhancer.ts` | Add context param to `enhancePrompt()`, inject context into LLM prompt |
| `src/copilot/prompt-scorer.ts` | Add context param to `scorePromptV2()`, add context hints to scoring |
| `src/panels/V2MessageHandler.ts` | Add `gatherPromptLabContext()`, wire into `handleAnalyzePromptLabPrompt()` |
| `src/services/HookBasedPromptService.ts` | Add `gatherAutoAnalyzeContext()`, wire into `analyzePrompt()` |
| `webview/menu/components/v2/PromptLabView.tsx` | Add context preview badge |
| `webview/menu/state/types-v2.ts` | Add `lastContextUsed` to PromptLabState |

---

## Performance Budget

| Operation | Budget | Strategy |
|-----------|--------|----------|
| Total context gathering | 1200ms | `Promise.race()` with timeout |
| Snippet extraction | 300ms | Max 3 snippets, 50 lines each |
| File search | 200ms | VS Code `findFiles` with exclusions |
| Entity extraction | 50ms | Regex only, no async |

**Graceful Degradation**: If context gathering fails or times out, proceed with raw prompt (current behavior).

---

## Testing Checklist

- [ ] Build succeeds after all changes
- [ ] Prompt Lab works with context (enhancements are more relevant)
- [ ] Prompt Lab still works without context (graceful degradation)
- [ ] Auto-captured prompts work with context (CoPilot tab)
- [ ] Auto-captured prompts still work without context (fallback)
- [ ] Context is gathered when workspace is open
- [ ] Tech stack detected from prompt content
- [ ] Goal passed if set in session
- [ ] Code snippets extracted for mentioned files
- [ ] Context preview shows in Prompt Lab UI
- [ ] Performance stays under 1200ms for context gathering

---

## Implementation Order

1. **Phase 1**: Add `PromptContext` interface and modify base tool signatures
2. **Phase 2**: Update `PromptEnhancer` and `PromptScorer` to use context in LLM prompts
3. **Phase 3**: Wire context gathering in `V2MessageHandler` (Prompt Lab)
4. **Phase 3B**: Wire context gathering in `HookBasedPromptService` (Auto-captured)
5. **Phase 4**: Add UI transparency badge to Prompt Lab
6. **Test**: Build and test both paths end-to-end

Total estimated effort: 5-7 hours
