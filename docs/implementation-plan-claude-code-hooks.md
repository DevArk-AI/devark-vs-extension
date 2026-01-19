# Claude Code UserPromptSubmit Hook Integration Plan

## Goal
Add Claude Code hooks support for auto-detecting prompts in real-time, mirroring the existing Cursor `beforeSubmitPrompt` hook implementation. Sessions will be displayed in a unified project view alongside Cursor sessions.

## User Requirements
- **Hook**: `UserPromptSubmit` only (captures prompts when submitted)
- **Display**: Unified project view with platform icons to distinguish source

---

## Files to Modify/Create

### 1. NEW: `src/claude-hooks/user-prompt-submit.js`
Node.js script executed by Claude Code when a prompt is submitted.

**Why separate from Cursor's script?** Claude Code and Cursor pass different JSON structures:
- Cursor: `{prompt, attachments, conversation_id, cursor_version, workspace_roots, user_email}`
- Claude Code: `{session_id, transcript_path, cwd, hook_event_name, prompt}`

Keeping separate scripts makes debugging easier and follows the existing `src/cursor-hooks/` pattern.

**Input (stdin from Claude Code)**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "User's prompt text"
}
```

**Output**: Writes to `os.tmpdir()/vibe-log-hooks/claude-prompt-*.json` with:
- `source: 'claude_code'` field for identification
- Same structure as Cursor prompts for unified processing
- Returns `{continue: true}` to never block submission

---

### 2. MODIFY: `src/ports/hooks/hook-installer.interface.ts`
Add `UserPromptSubmit` to the `HookType` union:
```typescript
export type HookType = 'SessionStart' | 'SessionEnd' | 'PreCompact' | 'Stop' | 'UserPromptSubmit';
```

---

### 3. MODIFY: `src/services/hook-service.ts`

**Changes**:
1. Add `UserPromptSubmit` to `VALID_CLAUDE_HOOKS` array (line ~40)
2. Add constructor parameter for Claude prompt hook script path
3. Update `installClaudeHook` to handle `UserPromptSubmit` without matcher (Claude Code docs specify no matcher for this hook type)
4. Add `buildCommandForClaudeHook` method to use correct script

**Key change - UserPromptSubmit format differs**:
```typescript
// UserPromptSubmit doesn't need a matcher
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [{ "type": "command", "command": "node /path/to/script.js" }]
      }
    ]
  }
}
```

---

### 4. MODIFY: `src/services/HookBasedPromptService.ts`

**Changes**:
1. Update `CapturedPrompt` interface - add `source?: 'cursor' | 'claude_code'` field
2. Update file watcher pattern: `'{prompt-*.json,claude-prompt-*.json}'`
3. Update `checkForNewPrompts` to match both file prefixes
4. Update `handleNewPromptFile` to detect source from filename
5. Update `checkHooksInstalled` to check `~/.claude/settings.json` for `UserPromptSubmit`

---

### 5. MODIFY: `build.js`

Add `copyClaudeCodeHooks()` function (mirror of `copyCursorHooks()`):
```javascript
function copyClaudeCodeHooks() {
  const hooksDir = path.join(__dirname, 'dist', 'claude-hooks');
  const hookSource = path.join(__dirname, 'src', 'claude-hooks', 'user-prompt-submit.js');
  const hookDest = path.join(hooksDir, 'user-prompt-submit.js');
  // ... copy logic
}
```

Call in `main()` after `copyCursorHooks()`.

---

### 6. MODIFY: `src/di/container.ts`

Pass Claude prompt hook script path to `HookService` constructor:
```typescript
const claudePromptHookPath = path.join(context.extensionUri.fsPath, 'dist', 'claude-hooks', 'user-prompt-submit.js');
```

---

### 7. MODIFY: `src/panels/V2MessageHandler.ts`

**Dynamic Hook Management Based on Auto-Analyze Toggle**:

When auto-analyze is **enabled**:
- Install `UserPromptSubmit` hook
- Start watching for prompt files

When auto-analyze is **disabled**:
- Uninstall `UserPromptSubmit` hook (remove from `~/.claude/settings.json`)
- Stop watching for prompt files

```typescript
// In handleToggleAutoAnalyze:
if (enabled) {
  await hookService.install({ hooks: ['UserPromptSubmit'], mode: 'all' });
  this.hookBasedPromptService.start();
} else {
  await hookService.uninstallHook('UserPromptSubmit');
  this.hookBasedPromptService.stop();
}
```

This ensures hooks are only active when needed and respects user preference.

---

## Implementation Order

1. **Create hook script**: `src/claude-hooks/user-prompt-submit.js`
2. **Update types**: `src/ports/hooks/hook-installer.interface.ts`
3. **Update HookService**: Add UserPromptSubmit support
4. **Update HookBasedPromptService**: Watch for both prompt sources
5. **Update build.js**: Copy Claude hooks script
6. **Update DI container**: Pass script path
7. **Update V2MessageHandler**: Install UserPromptSubmit hook

---

## Testing Checklist

- [ ] Build succeeds (`npm run compile`)
- [ ] `~/.claude/settings.json` contains UserPromptSubmit config after enabling auto-analyze
- [ ] `~/.claude/settings.json` does NOT contain UserPromptSubmit after disabling auto-analyze
- [ ] Claude Code prompt appears in `os.tmpdir()/vibe-log-hooks/` with `claude-` prefix
- [ ] HookBasedPromptService picks up Claude Code prompts
- [ ] Prompt analysis works with `source: 'claude_code'`
- [ ] Webview shows Claude Code prompts with correct icon
- [ ] Toggle auto-analyze ON installs hook + starts watching
- [ ] Toggle auto-analyze OFF uninstalls hook + stops watching

---

## Critical Files Summary

| File | Action |
|------|--------|
| `src/claude-hooks/user-prompt-submit.js` | CREATE |
| `src/ports/hooks/hook-installer.interface.ts` | ADD type |
| `src/services/hook-service.ts` | ADD support |
| `src/services/HookBasedPromptService.ts` | UPDATE patterns |
| `build.js` | ADD copy function |
| `src/di/container.ts` | PASS script path |
| `src/panels/V2MessageHandler.ts` | ADD hook to install |
