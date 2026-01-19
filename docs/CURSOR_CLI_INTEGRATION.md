# Cursor CLI Integration

## Overview

This document describes the integration of `cursor-agent` CLI as an LLM provider in the vibe-log VSCode extension. This allows the extension to use Cursor's AI models locally for analysis, similar to how `vibe-log-cli` uses Claude Agent SDK.

## Background

### What is cursor-agent?

`cursor-agent` is Cursor's CLI tool that allows headless (non-interactive) execution of AI prompts. It's documented at https://cursor.com/docs/cli/headless

**Installation:**
```bash
curl https://cursor.com/install -fsS | bash
```

**Authentication:**
```bash
cursor-agent login  # Opens browser for authentication
cursor-agent status # Check login status
```

### Key Discovery: How cursor-agent Works

Through testing, we discovered:

1. **No API key required** - Uses browser-based authentication, not `CURSOR_API_KEY` env var
2. **Prompt as argument** - Prompt must be passed as command argument, not stdin
3. **Model rate limits** - Default model may hit `resource_exhausted` error, use `--model auto`
4. **JSON output** - Use `--output-format json` or `--output-format stream-json`

**Working command:**
```bash
cursor-agent -p --model auto --output-format json "Your prompt here"
```

**JSON response structure:**
```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 17301,
  "session_id": "uuid",
  "result": "The AI response text"
}
```

## Implementation

### Files Modified

#### 1. `src/llm/provider-types.ts`

Added `PromptDeliveryMethod` enum to support different CLI tools:

```typescript
export enum PromptDeliveryMethod {
  /** Send prompt via stdin (e.g., Claude Code CLI) */
  STDIN = 'stdin',
  /** Pass prompt as command argument (e.g., Cursor CLI) */
  ARGUMENT = 'argument'
}
```

Added `promptDelivery` field to `CLIConfig` interface:

```typescript
export interface CLIConfig {
  command: string;
  args: string[];
  outputFormat: 'stream-json' | 'json' | 'text';
  env?: Record<string, string>;
  promptDelivery?: PromptDeliveryMethod;  // NEW
}
```

#### 2. `src/llm/providers/cli-provider-base.ts`

Updated `generateCompletion()` to handle both stdin and argument-based prompt delivery:

```typescript
async generateCompletion(options: CompletionOptions): Promise<CompletionResponse> {
  const prompt = this.buildPrompt(options);
  let args = this.buildArgs(options);

  // If prompt delivery is ARGUMENT, add prompt to args
  const useArgumentDelivery = this.cliConfig.promptDelivery === PromptDeliveryMethod.ARGUMENT;
  if (useArgumentDelivery) {
    args = [...args, prompt];
  }

  // ... spawn process ...

  // Send prompt to stdin (unless using argument delivery)
  if (!useArgumentDelivery && child.stdin) {
    child.stdin.write(prompt);
    child.stdin.end();
  } else if (child.stdin) {
    child.stdin.end();  // Close stdin for argument-based delivery
  }
}
```

#### 3. `src/llm/providers/cursor-cli-provider.ts`

Completely rewrote the provider:

**Before (broken):**
- Required `CURSOR_API_KEY` environment variable
- Sent prompt via stdin
- No model fallback for rate limits

**After (working):**
- Uses browser login (checks via `cursor-agent status`)
- Passes prompt as command argument
- Defaults to `--model auto` to avoid rate limits
- Proper login status checking

Key changes:

```typescript
@RegisterProvider(METADATA)
export class CursorCLIProvider extends CLIProviderBase {
  constructor(config: { model?: string; enabled?: boolean }) {
    super(
      'cursor-cli',
      { ...config, model: config.model || 'auto' },
      {
        command: 'cursor-agent',
        args: ['-p', '--model', config.model || 'auto', '--output-format', 'stream-json'],
        outputFormat: 'stream-json',
        promptDelivery: PromptDeliveryMethod.ARGUMENT,  // KEY CHANGE
        env: {},
      },
      {
        requiresApiKey: false,  // Uses browser login
      }
    );
  }

  // Check login status instead of API key
  private async checkLoginStatus(): Promise<{ loggedIn: boolean; email?: string }> {
    // Runs: cursor-agent status
    // Parses: "✓ Logged in as email@example.com"
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const loginStatus = await this.checkLoginStatus();
    if (!loginStatus.loggedIn) {
      return {
        success: false,
        error: 'Not logged in to Cursor. Run "cursor-agent login" to authenticate.'
      };
    }
    return super.testConnection();
  }
}
```

#### 4. `package.json`

Updated configuration schema:

```json
{
  "vibelog.llm.providers.cursor-cli": {
    "type": "object",
    "description": "Cursor CLI provider (local, uses browser login)",
    "properties": {
      "enabled": {
        "type": "boolean",
        "default": false,
        "description": "Enable Cursor CLI provider (requires 'cursor-agent login' via browser)"
      },
      "model": {
        "type": "string",
        "default": "auto",
        "enum": ["auto", "sonnet-4.5", "opus-4.5", "gpt-5", "gpt-5.1", "gemini-3-pro", "grok"],
        "description": "Cursor model to use (auto recommended to avoid rate limits)"
      }
    }
  }
}
```

## Usage

### Prerequisites

1. Install cursor-agent CLI
2. Login via browser: `cursor-agent login`
3. Verify: `cursor-agent status` should show "Logged in as ..."

### Enable in Extension

1. Open VSCode/Cursor settings
2. Search for "vibelog"
3. Set `vibelog.llm.activeProvider` to `cursor-cli`
4. Optionally configure model in `vibelog.llm.providers.cursor-cli.model`

### Test Connection

Run command: "Vibe Log: Test LLM Connection"

Should show: `cursor-agent CLI (your@email.com)` if successful.

## Comparison: Claude Code CLI vs Cursor CLI

| Feature | Claude Code CLI | Cursor CLI |
|---------|-----------------|------------|
| Command | `claude` | `cursor-agent` |
| Auth | API key or OAuth | Browser login |
| Prompt delivery | stdin | command argument |
| Output format | stream-json | stream-json |
| Rate limits | Per API key | Per account, use `--model auto` |
| Cost tracking | Yes (`total_cost_usd`) | No |

## Testing

### Manual Test

```bash
# Check login
cursor-agent status

# Test prompt
cursor-agent -p --model auto --output-format json "Say hello"

# Expected output:
# {"type":"result","subtype":"success","result":"Hello!","duration_ms":...}
```

### In Extension

1. Set provider to `cursor-cli`
2. Open Co-Pilot tab
3. Enter a prompt for analysis
4. Should use cursor-agent for AI completion

## Troubleshooting

### "Not logged in to Cursor"

Run `cursor-agent login` and complete browser authentication.

### "resource_exhausted" error

The default model is rate-limited. The provider now defaults to `--model auto` which should avoid this.

### "Command 'cursor-agent' not found"

Install cursor-agent:
```bash
curl https://cursor.com/install -fsS | bash
```

Then ensure `~/.local/bin` is in your PATH.

## Future Improvements

1. **Streaming support** - Currently waits for full response, could stream chunks
2. **Session resumption** - Use `session_id` to continue conversations
3. **Model selection UI** - Dynamic model list from cursor-agent
4. **Cost estimation** - Track usage even without explicit cost data

---

**Date:** 2025-12-04
**Author:** Claude (via Claude Code)
**Related:** vibe-log-cli uses similar pattern with Claude Agent SDK
