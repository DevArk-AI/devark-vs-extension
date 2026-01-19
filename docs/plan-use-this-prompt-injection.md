# Plan: "Use this prompt" to Inject into Cursor/Claude Code Input

## Goal
Change the "Use this prompt" button to **programmatically inject** the improved prompt directly into Cursor's composer input or Claude Code, auto-detecting which tool based on the captured prompt source.

## Current State
- Button is in `webview/menu/components/v2/CoPilotView.tsx` (lines 75-80, 299-305)
- Currently only updates local webview state via `dispatch({ type: 'SET_CURRENT_PROMPT' })`
- No message sent to extension backend
- Prompt stays in sidebar textarea, never reaches Cursor/Claude Code

## Discovered Working Approach (Reverse Engineered)

**Source**: [Cursor Forum - Command for passing prompt](https://forum.cursor.com/t/a-command-for-passing-a-prompt-to-the-chat/138049)

The clipboard + command chain technique works in production extensions:

```typescript
async function injectIntoCursor(prompt: string): Promise<void> {
  // 1. Save current clipboard
  const previousClipboard = await vscode.env.clipboard.readText();

  // 2. Write prompt to clipboard
  await vscode.env.clipboard.writeText(prompt);

  // 3. Open/focus chat (options below)
  await vscode.commands.executeCommand("composer.newAgentChat"); // New session
  // OR: await vscode.commands.executeCommand("aichat.newchataction"); // Existing chat

  // 4. Wait for UI rendering
  await new Promise(resolve => setTimeout(resolve, 100));

  // 5. Paste clipboard into input
  await vscode.commands.executeCommand("editor.action.clipboardPasteAction");

  // 6. Restore clipboard async
  setTimeout(async () => {
    await vscode.env.clipboard.writeText(previousClipboard);
  }, 300);
}
```

## Key Cursor Commands Discovered

| Command | Behavior |
|---------|----------|
| `composer.newAgentChat` | Opens NEW agent chat session |
| `aichat.newchataction` | Adds to CURRENT/existing chat |
| `aichat.insertselectionintochat` | Opens new chat with selection |
| `composer.createNew` | Creates new composer |
| `workbench.action.chat.open` | Opens chat panel |

## Session Targeting Limitation

- **No session ID targeting**: Cannot programmatically focus a specific composer by session ID
- **Best effort**: Use `aichat.newchataction` to add to the currently visible chat (likely the same one that captured the prompt)
- **Alternative**: Open new session with `composer.newAgentChat` (guaranteed clean slate)

## Implementation Plan

### Step 1: Create ChatInjector utility class
**File**: `src/cursor-integration/chat-injector.ts` (NEW)

```typescript
import * as vscode from 'vscode';

export class ChatInjector {
  /**
   * Inject prompt into Cursor's chat input with fallback strategy
   * Primary: Try existing chat (aichat.newchataction)
   * Fallback: Open new agent chat (composer.newAgentChat)
   */
  async injectIntoCursor(prompt: string): Promise<boolean> {
    // 1. Save current clipboard
    const previousClipboard = await vscode.env.clipboard.readText();

    try {
      // 2. Write prompt to clipboard
      await vscode.env.clipboard.writeText(prompt);

      // 3. Try existing chat first (best effort for session continuity)
      let success = await this.tryCommand('aichat.newchataction');

      // 4. Fallback to new agent chat if existing chat command fails
      if (!success) {
        console.log('[ChatInjector] Existing chat failed, trying new agent chat');
        success = await this.tryCommand('composer.newAgentChat');
      }

      if (!success) {
        throw new Error('Both chat commands failed');
      }

      // 5. Wait for UI rendering
      await new Promise(resolve => setTimeout(resolve, 150));

      // 6. Paste clipboard into input
      await vscode.commands.executeCommand('editor.action.clipboardPasteAction');

      // 7. Restore clipboard async (don't block)
      this.restoreClipboardAsync(previousClipboard);

      return true;
    } catch (error) {
      console.error('[ChatInjector] Failed to inject:', error);
      // Restore clipboard on failure too
      this.restoreClipboardAsync(previousClipboard);
      return false;
    }
  }

  private async tryCommand(command: string): Promise<boolean> {
    try {
      await vscode.commands.executeCommand(command);
      return true;
    } catch (error) {
      console.warn(`[ChatInjector] Command ${command} failed:`, error);
      return false;
    }
  }

  private restoreClipboardAsync(previousClipboard: string): void {
    setTimeout(async () => {
      if (previousClipboard) {
        await vscode.env.clipboard.writeText(previousClipboard);
      }
    }, 500);
  }

  /**
   * For Claude Code - clipboard + notification (no injection API available)
   */
  async injectIntoClaudeCode(prompt: string): Promise<boolean> {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage(
      'Prompt copied! Paste into Claude Code terminal (Ctrl+V / Cmd+V)'
    );
    return true;
  }
}
```

### Step 2: Add message handler in extension
**File**: `src/panels/V2MessageHandler.ts`

Add new message type `useImprovedPrompt`:
```typescript
case 'useImprovedPrompt':
  await this.handleUseImprovedPrompt(data?.prompt, data?.source, data?.sessionId);
  break;
```

Add handler method:
```typescript
import { ChatInjector } from '../cursor-integration/chat-injector';

private chatInjector = new ChatInjector();

private async handleUseImprovedPrompt(
  prompt: string,
  source: 'cursor' | 'claude_code' | undefined,
  sessionId?: string
): Promise<void> {
  if (!prompt) return;

  if (source === 'cursor' || isCursorIDE()) {
    // Inject directly into Cursor composer (tries existing chat, falls back to new)
    const success = await this.chatInjector.injectIntoCursor(prompt);
    if (success) {
      vscode.window.showInformationMessage('Prompt injected into Cursor chat');
    } else {
      // Final fallback: just copy
      await vscode.env.clipboard.writeText(prompt);
      vscode.window.showWarningMessage('Could not inject - prompt copied to clipboard');
    }
  } else if (source === 'claude_code') {
    // Claude Code: clipboard + notification (no injection API available)
    await this.chatInjector.injectIntoClaudeCode(prompt);
  } else {
    // Unknown source: copy to clipboard
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage('Prompt copied to clipboard');
  }
}
```

### Step 3: Update webview button handler
**File**: `webview/menu/components/v2/CoPilotView.tsx`

Change `handleUseThis` to send message to extension:
```typescript
const handleUseThis = () => {
  if (state.currentAnalysis?.improvedVersion) {
    // Send to extension for injection into Cursor/Claude Code
    postMessage('useImprovedPrompt', {
      prompt: state.currentAnalysis.improvedVersion,
      source: state.currentAnalysis.source, // 'cursor' or 'claude_code'
      sessionId: state.currentAnalysis.sessionId // For context
    });

    // Keep local state update for UI feedback
    dispatch({ type: 'SET_CURRENT_PROMPT', payload: state.currentAnalysis.improvedVersion });
  }
};
```

### Step 4: Add source/sessionId to analysisComplete message
**File**: `src/services/HookBasedPromptService.ts` (around line 388-410)

The `analysisComplete` message is missing source/sessionId. Add them:
```typescript
const analyzedPrompt = {
  id: prompt.id,
  text: prompt.prompt,
  // ... existing fields ...
  source: prompt.source,           // ADD THIS
  sessionId: prompt.sessionId,     // ADD THIS
};
```

### Step 5: Update types to include source metadata
**File**: `webview/menu/state/types-v2.ts`

Add source/sessionId to PromptAnalysis type:
```typescript
interface PromptAnalysis {
  // existing fields...
  source?: 'cursor' | 'claude_code';
  sessionId?: string;
}
```

### Step 6: Preserve source in AppV2 reducer
**File**: `webview/menu/AppV2.tsx`

Ensure `ANALYSIS_COMPLETE` action preserves source/sessionId from payload (should work automatically if types are correct).

## Files to Modify

| File | Change |
|------|--------|
| `src/cursor-integration/chat-injector.ts` | **NEW** - ChatInjector class for clipboard+command injection |
| `src/panels/V2MessageHandler.ts` | Add `useImprovedPrompt` handler using ChatInjector |
| `src/services/HookBasedPromptService.ts` | Add `source` and `sessionId` to analysisComplete message |
| `webview/menu/components/v2/CoPilotView.tsx` | Change `handleUseThis` to send message with source/sessionId |
| `webview/menu/state/types-v2.ts` | Add `source` and `sessionId` to PromptAnalysis type |
| `webview/menu/AppV2.tsx` | Ensure reducer preserves source metadata |

## User Experience Flow

### For Cursor:
1. User submits prompt in Cursor composer
2. Hook captures prompt with source='cursor' + sessionId metadata
3. Extension analyzes and shows improved version with score
4. User clicks "Use this"
5. Extension:
   - Saves clipboard
   - Writes prompt to clipboard
   - **Tries `aichat.newchataction`** (existing chat - best effort for session continuity)
   - **Falls back to `composer.newAgentChat`** if existing chat fails
   - Waits 150ms for UI
   - Pastes clipboard into input
   - Restores original clipboard
6. **Prompt appears directly in Cursor chat input** - ready to submit
7. Brief notification: "Prompt injected into Cursor chat"

### For Claude Code:
1. User submits prompt in Claude Code terminal
2. Hook captures prompt with source='claude_code'
3. Extension analyzes and shows improved version
4. User clicks "Use this"
5. Prompt copied to clipboard + notification to paste
6. User pastes manually (no injection API available for Claude Code CLI)

## Technical Notes

- **Fallback strategy**: Try existing chat first (`aichat.newchataction`), fall back to new agent chat (`composer.newAgentChat`), final fallback is clipboard copy
- **Clipboard restoration**: Previous clipboard content is restored after 500ms delay
- **UI delay**: 150ms wait between opening chat and pasting ensures Cursor UI is ready
- **Error handling**: Each command wrapped in try/catch; failure triggers next fallback
- **Command availability**: `aichat.newchataction` and `composer.newAgentChat` are Cursor-specific; will fail gracefully in VS Code

## Future Enhancements (Out of Scope)
- Auto-submit after injection (user might want to review first)
- Session-specific targeting if Cursor adds API
- Claude Code terminal injection if API becomes available
