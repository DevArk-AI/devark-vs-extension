# Context-Powered Prompt Analysis Plan (Enhanced)

## Problem
Context gathering returns `{techStack: 0, snippets: 0}` because it only extracts from **prompt text** via regex. Generic prompts like "help me fix the bug" yield zero context.

## Root Cause
- `extractTechStack()` - only regex matches in prompt text ("React", "TypeScript", etc.)
- `getSnippetsForPrompt()` - only if prompt mentions files/components ("foo.ts", "UserButton")
- **No workspace awareness** - ignores CLAUDE.md, package.json, open files

## Solution: 3-Tier Context Gathering

### Tier 1: Project CLAUDE.md (Highest Value)
**Read ONLY project-level CLAUDE.md** (not global ~/.claude/CLAUDE.md):
- `{workspace}/CLAUDE.md` - project-specific context

**Smart Extraction Strategy:**
1. **Tech Stack**: Run existing `TECH_PATTERNS` regex on full CLAUDE.md content
   - Already detects: TypeScript, React, Node.js, Express, etc.
   - No new parsing needed - reuse `ContextExtractor.extractTechStack()`

2. **Project Summary** (for PromptEnhancer context):
   - Extract first paragraph after `# ` header (project description)
   - Extract `## Architecture` section header content (50-100 chars)
   - This provides "what is this project" context

### Tier 2: package.json Dependencies
**Map dependencies to tech stack:**
```typescript
const PACKAGE_TO_TECH: Record<string, string> = {
  'react': 'React',
  'typescript': 'TypeScript',
  '@types/node': 'Node.js',
  'express': 'Express',
  'next': 'Next.js',
  'vue': 'Vue',
  'tailwindcss': 'Tailwind CSS',
  // ... common packages
};
```

### Tier 3: Open Editor Context (Relevance-Gated)
**Only include if relevant to prompt:**

```typescript
function isOpenFileRelevant(prompt: string, filePath: string, fileContent: string): boolean {
  const promptLower = prompt.toLowerCase();
  const fileName = path.basename(filePath);

  // Check 1: File name mentioned in prompt
  if (promptLower.includes(fileName.toLowerCase())) return true;

  // Check 2: Key entities from file appear in prompt
  const exports = extractExports(fileContent); // function names, class names
  if (exports.some(e => promptLower.includes(e.toLowerCase()))) return true;

  // Check 3: Prompt mentions file type/extension
  const ext = path.extname(filePath); // .tsx, .ts, .py
  if (promptLower.includes(ext.slice(1))) return true; // "tsx" in prompt

  return false;
}
```

**Fallback behavior**: If no snippets found AND no relevance match, still include open file as "current context" but mark it as low-confidence.

## What Context Is Actually USED

| Field | PromptScorer | PromptEnhancer | Priority |
|-------|--------------|----------------|----------|
| `codeSnippets` | NO | YES (2 snippets, 400 chars) | HIGH |
| `goal` | YES | YES | MEDIUM |
| `techStack` | YES | YES | HIGH |
| `recentTopics` | YES (3) | YES (5) | LOW |
| `sessionDuration` | NO | NO | SKIP |

**Key insight**: `codeSnippets` has highest impact (only enhancer uses it) but requires files to be found. Tech stack is used by both tools.

## Implementation Plan

### Step 1: Create WorkspaceContextService
**File**: `src/services/WorkspaceContextService.ts`

```typescript
interface WorkspaceContext {
  techStack: string[];           // From CLAUDE.md + package.json
  projectSummary?: string;       // First paragraph from CLAUDE.md
  relevantSnippet?: {            // Open file if relevant to prompt
    entityName: string;
    filePath: string;
    relevantCode: string;
    confidence: 'high' | 'low';  // high = matched prompt, low = fallback
  };
}
```

**Singleton pattern** (follow existing services)
**Cache CLAUDE.md and package.json** (invalidate on file change via FileSystemWatcher)

### Step 2: Modify gatherPromptContext()
**File**: `src/services/context-utils.ts`

```typescript
export async function gatherPromptContext(promptText: string, ...) {
  // EXISTING: Extract from prompt text (entities, prompt-based tech stack)
  const promptBasedContext = await contextExtractor.buildImprovementContext(promptText);

  // NEW: Get workspace context (cached, fast)
  const workspaceContext = await getWorkspaceContextService().getContext(promptText);

  // MERGE: Deduplicate tech stack, add relevant snippets
  const mergedTechStack = [...new Set([
    ...promptBasedContext.technical.techStack,
    ...workspaceContext.techStack
  ])];

  return {
    ...result,
    techStack: mergedTechStack,
    codeSnippets: workspaceContext.relevantSnippet
      ? [...result.codeSnippets, workspaceContext.relevantSnippet]
      : result.codeSnippets,
  };
}
```

### Step 3: Smart Context Extraction Methods

**A. Extract tech from CLAUDE.md (reuse existing):**
```typescript
// Reuse existing TECH_PATTERNS from ContextExtractor
const claudeMdTech = contextExtractor.extractTechStack(claudeMdContent);
```

**B. Extract tech from package.json:**
```typescript
const PACKAGE_TO_TECH: Record<string, string> = {
  'react': 'React', 'react-dom': 'React',
  'typescript': 'TypeScript', '@types/': 'TypeScript',
  'next': 'Next.js', 'express': 'Express',
  'vue': 'Vue', '@vue/': 'Vue',
  'tailwindcss': 'Tailwind CSS',
  'drizzle-orm': 'Drizzle ORM',
  'prisma': 'Prisma',
  'vitest': 'Vitest', 'jest': 'Jest',
  'esbuild': 'esbuild', 'vite': 'Vite',
};

function extractTechFromPackageJson(pkg: any): string[] {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.keys(deps)
    .map(dep => {
      for (const [pattern, tech] of Object.entries(PACKAGE_TO_TECH)) {
        if (dep.startsWith(pattern) || dep === pattern) return tech;
      }
      return null;
    })
    .filter(Boolean);
}
```

**C. Check open file relevance:**
```typescript
function getRelevantOpenFile(prompt: string): WorkspaceContext['relevantSnippet'] | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;

  const filePath = editor.document.uri.fsPath;
  const content = editor.document.getText();
  const fileName = path.basename(filePath);

  // High confidence: prompt mentions file/entities
  const promptLower = prompt.toLowerCase();
  if (promptLower.includes(fileName.toLowerCase().replace(/\.[^.]+$/, ''))) {
    return { entityName: fileName, filePath, relevantCode: content.slice(0, 500), confidence: 'high' };
  }

  // Check for exported names in prompt
  const exports = extractExportedNames(content);
  if (exports.some(e => promptLower.includes(e.toLowerCase()))) {
    return { entityName: exports[0], filePath, relevantCode: content.slice(0, 500), confidence: 'high' };
  }

  // Low confidence fallback: only if no other snippets found
  return { entityName: fileName, filePath, relevantCode: content.slice(0, 300), confidence: 'low' };
}
```

## Files to Modify

1. **NEW**: `src/services/WorkspaceContextService.ts` - workspace context singleton
2. **EDIT**: `src/services/context-utils.ts` - merge workspace context into gatherPromptContext()
3. **MINOR**: `src/extension.ts` - initialize WorkspaceContextService (optional, lazy init works)

## Performance Budget
- CLAUDE.md read: 50ms (cached after first read)
- package.json read: 20ms (cached)
- Open editor access: 5ms (sync VS Code API)
- Relevance check: 10ms
- Total added latency: <100ms on first call, <20ms cached

## Expected Results
After implementation, logs should show:
```
[WorkspaceContext] Loaded CLAUDE.md (2048 chars), package.json (45 deps)
[WorkspaceContext] Tech stack: TypeScript, React, Tailwind, esbuild, Vitest
[WorkspaceContext] Open file relevant: high confidence (prompt mentions "MessageHandler")
[V2MessageHandler] Context gathered: {techStack: 5, hasGoal: true, snippets: 1}
```

## Test Scenarios

| Prompt | Expected Context |
|--------|------------------|
| "help me fix this bug" | techStack from CLAUDE.md/package.json, open file as fallback (low confidence) |
| "fix the MessageHandler" | techStack + open file V2MessageHandler.ts (high confidence) - if that file is open |
| "add a React component" | techStack includes React, no snippet (unless React file open) |
| "refactor useGetData hook" | techStack + open file snippet (high confidence) - only if open file exports useGetData |

## How Context Layers Work Together

```
Prompt: "refactor useGetData hook"

┌─ Existing SmartSnippetService (unchanged) ─────────────────────┐
│ 1. Extract entities from prompt: ["useGetData"]                │
│ 2. Search workspace: vscode.workspace.findFiles('**/hooks/*')  │
│ 3. Find: src/hooks/useGetData.ts                               │
│ 4. Return code snippet from that file                          │
└────────────────────────────────────────────────────────────────┘
              ↓ If SmartSnippetService finds nothing...

┌─ NEW Tier 3: Open File Context (fallback/bonus) ───────────────┐
│ 1. Check activeTextEditor                                      │
│ 2. If open file is relevant (exports useGetData) → high conf   │
│ 3. If open file not relevant but no other snippets → low conf  │
└────────────────────────────────────────────────────────────────┘

Result: SmartSnippetService snippets + Tier 3 snippet (if relevant)
```

**Key insight**: Tier 3 is ADDITIVE, not replacement. It helps when:
- Prompt is generic ("fix this bug") - SmartSnippetService finds nothing, open file becomes context
- Prompt is specific but open file adds extra relevant context
