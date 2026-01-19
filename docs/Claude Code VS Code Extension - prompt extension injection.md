# Claude Code VS Code Extension Prompt Injection

## Current State (Already Implemented)

Source detection is already working:

- **HookBasedPromptService**: Detects `source: 'claude_code'` from filename pattern `claude-prompt-*`
- **V2MessageHandler.handleUseImprovedPrompt()**: Routes to correct injector based on `source` parameter
- **CoPilotView.tsx**: Passes `source: state.currentAnalysis.source` when "Use this prompt" is clicked

## What Needs Enhancement

Currently `injectIntoClaudeCode()` only copies to clipboard with a notification. We need to upgrade it to use focus + paste like Cursor.

## Claude Code Commands (Reverse Engineered)

- `claude-vscode.focus` - Focuses the input field (key command)
- `claude-vscode.newConversation` - Creates a new conversation
- `claude-vscode.editor.open` - Opens Claude in a new tab

## Implementation Strategy

**Flow:**

1. Check if Claude Code extension is installed via `vscode.extensions.getExtension('anthropic.claude-code')`
2. Save current clipboard content
3. Write prompt to clipboard
4. Try `claude-vscode.focus` to focus the active conversation's input
5. If focus fails (no active conversation), fallback to `claude-vscode.newConversation`
6. Wait for UI to render (~150ms)
7. Execute paste command
8. Restore original clipboard content

## File to Modify

### [src/cursor-integration/chat-injector.ts](src/cursor-integration/chat-injector.ts)

Update `injectIntoClaudeCode()` method:

```typescript
async injectIntoClaudeCode(prompt: string): Promise<boolean> {
  // Check if Claude Code extension is installed
  const claudeCodeExt = vscode.extensions.getExtension('anthropic.claude-code');
  
  if (!claudeCodeExt) {
    // Fallback: copy to clipboard only
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage('Prompt copied! Claude Code extension not found.');
    return true;
  }

  const previousClipboard = await vscode.env.clipboard.readText();

  try {
    await vscode.env.clipboard.writeText(prompt);

    // Try to focus existing conversation first
    let success = await this.tryCommand('claude-vscode.focus');
    
    // Fallback: open new conversation if no active one
    if (!success) {
      console.log('[ChatInjector] No active Claude Code conversation, creating new one');
      success = await this.tryCommand('claude-vscode.newConversation');
    }

    if (!success) {
      throw new Error('Could not focus or create Claude Code conversation');
    }

    await new Promise(resolve => setTimeout(resolve, 150));
    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');

    this.restoreClipboardAsync(previousClipboard);
    vscode.window.showInformationMessage('Prompt injected into Claude Code');
    return true;
  } catch (error) {
    this.restoreClipboardAsync(previousClipboard);
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showWarningMessage('Could not inject - prompt copied to clipboard');
    return false;
  }
}
```

## Fallback Chain Summary

| Step | Action | If Fails |

|------|--------|----------|

| 1 | Check Claude Code extension installed | Copy to clipboard only |

| 2 | `claude-vscode.focus` (active conversation) | Try step 3 |

| 3 | `claude-vscode.newConversation` (new conversation) | Copy to clipboard |

| 4 | Paste into input | Copy to clipboard |

## No Additional Changes Needed

- **Source detection**: Already working via filename pattern
- **V2MessageHandler**: Already routes `source === 'claude_code'` to `injectIntoClaudeCode()`
- **Webview**: Already passes source metadata