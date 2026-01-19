# Next Session: Implement Claude Code Response Capture for Co-Pilot Coaching

## Problem Statement

The co-pilot currently analyzes user prompts but cannot see Claude's responses. This means:
1. Users can't get coaching based on what Claude actually replied
2. The coaching loop is incomplete - we only see one side of the conversation
3. We can't provide suggestions like "Claude addressed X but missed Y, consider asking..."

## Research Findings (Previous Session)

### Claude Code Has a Stop Hook

Claude Code supports a **Stop hook** that fires when the agent completes. The hook already exists in our codebase:

**Location**: `src/claude-hooks/stop.js`

The Stop hook:
- Fires when Claude Code agent stops (completed, error, or cancelled)
- Receives via stdin: `session_id`, `transcript_path`, `stop_reason`, `last_assistant_message`, `tool_results`
- Writes response data to `/tmp/vibe-log-hooks/claude-response-*.json`

### Current State

1. **Stop hook exists** but only installed by VS Code extension, not CLI
2. **Response files are written** to temp directory
3. **No one reads these files** for coaching purposes
4. **CoachingService exists** but only works for Cursor (not Claude Code)

## Architecture Options

### Option A: Watch Temp Files (Quick)

Monitor `/tmp/vibe-log-hooks/claude-response-*.json` for new response files.

```
Stop Hook fires → Writes JSON → File watcher detects → CoachingService processes
```

### Option B: Watch JSONL Transcript Directly (Elegant)

Monitor `~/.claude/projects/<project>/*.jsonl` for new assistant messages.

```
Claude writes to JSONL → File watcher detects new lines → Parse assistant messages → Coach
```

### Option C: Unified Hook Service (Recommended)

Extend `HookBasedPromptService.ts` to also handle Claude Code responses (currently only handles Cursor).

## Key Files

### Existing Infrastructure

```
src/claude-hooks/stop.js              - Stop hook script (writes response files)
src/services/HookBasedPromptService.ts - Watches for prompt/response files (Cursor only)
src/services/CoachingService.ts       - Generates coaching suggestions
src/services/ResponseAnalyzer.ts      - Analyzes responses (heuristics, no LLM)
```

### Stop Hook Output Format

```typescript
// Written to /tmp/vibe-log-hooks/claude-response-*.json
interface ClaudeResponseData {
  id: string;
  timestamp: string;
  source: 'claude_code';
  response: string;           // Claude's response text (truncated to 5000 chars)
  sessionId: string;
  transcriptPath: string;
  cwd: string;
  reason: 'completed' | 'error' | 'cancelled';
  toolResults: Array<{ tool: string; result: string }>;
  success: boolean;
  workspaceRoots: string[];
}
```

### HookBasedPromptService Events

```typescript
// Events emitted (currently Cursor-only, needs Claude Code support)
'responseDetected' → CapturedResponse
'newPromptsDetected' → CapturedPrompt[]
'analysisComplete' → PromptAnalysis
```

## Implementation Plan

### Step 1: Extend HookBasedPromptService for Claude Code

File: `src/services/HookBasedPromptService.ts`

Add detection for Claude Code response files:
- Watch pattern: `claude-response-*.json` (in addition to `cursor-response-*.json`)
- Parse the response data
- Emit `responseDetected` event with normalized `CapturedResponse`

### Step 2: Normalize Response Format

File: `src/services/types/response-types.ts`

Ensure `CapturedResponse` interface works for both Cursor and Claude Code:

```typescript
interface CapturedResponse {
  id: string;
  timestamp: Date;
  source: 'cursor' | 'claude_code';
  response: string;
  success: boolean;
  toolCalls?: ToolCall[];
  filesModified?: string[];
  sessionId?: string;
}
```

### Step 3: Wire CoachingService to Claude Code Responses

File: `src/services/CoachingService.ts`

Currently listens to Cursor responses. Extend to:
1. Subscribe to `responseDetected` from HookBasedPromptService
2. Filter for `source === 'claude_code'`
3. Generate coaching suggestions based on response content
4. Show toast notification or update sidebar

### Step 4: Install Stop Hook from Extension

File: `src/services/hook-service.ts`

Ensure Stop hook is installed when extension activates:
- Check if Claude Code is detected
- Install `stop.js` hook in `~/.claude/settings.json`
- Similar to how we install `user-prompt-submit.js`

## Testing Plan

1. Start Claude Code session
2. Submit a prompt and wait for response
3. Verify stop.js writes to `/tmp/vibe-log-hooks/`
4. Verify HookBasedPromptService detects the file
5. Verify CoachingService generates suggestion
6. Verify toast notification appears

## File Locations Summary

```
TO MODIFY:
src/services/HookBasedPromptService.ts  - Add Claude Code response detection
src/services/CoachingService.ts         - Handle Claude Code responses
src/services/hook-service.ts            - Install Stop hook

REFERENCE (already working):
src/claude-hooks/stop.js                - Stop hook implementation
src/services/types/response-types.ts    - Response type definitions
src/services/ResponseAnalyzer.ts        - Response analysis logic
```

## Quick Start Commands

```bash
# Check if stop hook is being called
tail -f /tmp/vibe-log-hooks/debug.log

# Check for response files
ls -la /tmp/vibe-log-hooks/claude-response-*.json

# View latest response
cat /tmp/vibe-log-hooks/latest-claude-response.json
```
