# GitHub Copilot Full Platform Integration Plan

## Executive Summary

This plan outlines full platform support for GitHub Copilot in the Vibe-Log extension, covering:
1. **Session Reading** - Extract chat history from Copilot's JSON storage
2. **Real-time Prompt Detection** - File system watching for live prompts
3. **Sync to Vibe-Log API** - Session upload and analysis
4. **GitHub Copilot CLI as LLM Provider** - Use Copilot CLI for AI scoring/summaries

---

## Part 1: GitHub Copilot Session Reading

### Storage Discovery

GitHub Copilot Chat stores sessions as **JSON files** (not SQLite like Cursor):

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%\Code\User\workspaceStorage\<hash>\chatSessions\*.json` |
| macOS | `~/Library/Application Support/Code/User/workspaceStorage/<hash>/chatSessions/*.json` |
| Linux | `~/.config/Code/User/workspaceStorage/<hash>/chatSessions/*.json` |

### Session JSON Format

```json
{
  "version": 3,
  "sessionId": "3f6046ac-03c5-42c1-a0d9-547c09453f83",
  "requesterUsername": "username",
  "responderUsername": "GitHub Copilot",
  "creationDate": 1755673068274,
  "lastMessageDate": 1762288157141,
  "customTitle": "Session title",
  "requests": [
    {
      "requestId": "request_xxx",
      "message": {
        "text": "@workspace /explain Write an explanation...",
        "parts": [...]
      },
      "variableData": {
        "variables": [
          { "kind": "file", "uri": {...}, "range": {...} }
        ]
      },
      "response": [{ "value": "The response text..." }],
      "timestamp": 1762288157141,
      "modelId": "copilot/gpt-5-mini"
    }
  ]
}
```

### Implementation: CopilotSessionReader

**File:** `src/adapters/readers/copilot-session-reader.ts`

```typescript
export class CopilotSessionReader implements ISessionReader {
  readonly tool: ToolType = 'github_copilot';

  getCapabilities(): ReaderCapabilities {
    return {
      supportsIncrementalSync: true,
      supportsProjectFiltering: true,
      supportsModelTracking: true,    // modelId available
      supportsPlanningMode: false,
    };
  }

  async readSessions(options?: SessionReadOptions): Promise<SessionReaderResult> {
    const chatSessionsDir = this.getChatSessionsPath();
    const files = await glob('*.json', { cwd: chatSessionsDir });

    const sessions = await Promise.all(
      files.map(f => this.parseSessionFile(path.join(chatSessionsDir, f)))
    );

    return { sessions, errors: [] };
  }

  private parseSessionFile(filePath: string): SessionData {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return {
      sessionId: raw.sessionId,
      tool: 'github_copilot',
      startedAt: new Date(raw.creationDate),
      endedAt: new Date(raw.lastMessageDate),
      messages: raw.requests.map(r => ({
        role: 'user',
        content: r.message.text,
        timestamp: r.timestamp,
        response: r.response?.[0]?.value,
        model: r.modelId
      })),
      projectPath: this.extractProjectPath(raw),
      filesChanged: this.extractFiles(raw)
    };
  }
}
```

---

## Part 2: Real-time Prompt Detection

### Detection Strategy: File System Watching

Unlike Cursor (SQLite polling) or Claude Code (hooks), Copilot detection uses **VS Code file system watcher**:

```typescript
// Watch for new/modified session files
const watcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(
    workspaceStoragePath,
    '**/chatSessions/*.json'
  )
);

watcher.onDidChange(uri => this.onSessionUpdated(uri));
watcher.onDidCreate(uri => this.onSessionCreated(uri));
```

### Implementation: CopilotPromptAdapter

**File:** `src/adapters/prompt-detection/copilot-adapter.ts`

```typescript
export class CopilotPromptAdapter implements PromptSourceAdapter {
  readonly source: PromptSource = KNOWN_SOURCES.github_copilot;

  private watcher: vscode.FileSystemWatcher | null = null;
  private lastMessageIds: Map<string, string> = new Map();

  async start(): Promise<void> {
    const pattern = '**/chatSessions/*.json';
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.watcher.onDidChange(uri => this.checkForNewMessages(uri));
    this.watcher.onDidCreate(uri => this.checkForNewMessages(uri));
  }

  private async checkForNewMessages(uri: vscode.Uri): Promise<void> {
    const session = JSON.parse(await fs.readFile(uri.fsPath, 'utf-8'));
    const lastRequest = session.requests[session.requests.length - 1];

    const lastKnownId = this.lastMessageIds.get(session.sessionId);
    if (lastRequest.requestId !== lastKnownId) {
      this.lastMessageIds.set(session.sessionId, lastRequest.requestId);

      this.emitPromptDetected({
        id: lastRequest.requestId,
        text: lastRequest.message.text,
        timestamp: new Date(lastRequest.timestamp),
        source: this.source,
        context: {
          projectPath: this.extractWorkspacePath(session),
          files: this.extractFiles(lastRequest.variableData),
          model: lastRequest.modelId
        }
      });
    }
  }
}
```

### Hook Integration Gap Analysis

| Tool | Hook Method | Vibe-Log Integration |
|------|------------|---------------------|
| Cursor | `beforeSubmitPrompt` in `.cursor/hooks.json` | External script writes to temp |
| Claude Code | `UserPromptSubmit` in `~/.claude/settings.json` | External script writes to temp |
| **GitHub Copilot** | **No external hook API** | Must use file watching |

**Key Insight:** GitHub Copilot does NOT support external hook scripts. The file watcher approach is the only viable method for real-time detection.

---

## Part 3: Sync to Vibe-Log API

### Data Transformation

**File:** `src/core/session/copilot-transformer.ts`

```typescript
export function transformCopilotSession(session: CopilotSession): VibeLogSession {
  return {
    tool: 'github_copilot',
    timestamp: new Date(session.creationDate).toISOString(),
    startedAt: session.creationDate,
    endedAt: session.lastMessageDate,
    durationSeconds: Math.floor((session.lastMessageDate - session.creationDate) / 1000),

    messageSummary: session.requests.map(r => ({
      role: 'user' as const,
      content: sanitizeMessage(r.message.text),
      timestamp: r.timestamp
    })),

    projectPath: extractProjectPath(session),
    projectName: extractProjectName(session),
    filesChanged: extractFilesFromVariables(session),

    // Copilot-specific metadata
    metadata: {
      copilotSessionId: session.sessionId,
      modelId: session.requests[0]?.modelId,
      username: session.requesterUsername
    }
  };
}
```

### Sync Service Integration

Update `SyncService` to handle Copilot sessions:

```typescript
// In src/services/SyncService.ts
async syncCopilotSessions(): Promise<SyncResult> {
  const reader = new CopilotSessionReader();
  const { sessions } = await reader.readSessions({
    since: this.getLastSyncTimestamp('github_copilot')
  });

  const transformed = sessions.map(transformCopilotSession);
  return this.uploadSessions(transformed);
}
```

---

## Part 4: GitHub Copilot CLI as LLM Provider

### Overview

GitHub Copilot CLI can be used as a local LLM provider for prompt scoring and session summaries, similar to `claude-code-cli` and `cursor-cli` providers.

### CLI Capabilities

| Feature | Support |
|---------|---------|
| Command | `copilot` (GitHub CLI extension) |
| Interactive Mode | `copilot` (starts REPL) |
| Programmatic Mode | `copilot -p "prompt"` or `--prompt` |
| Streaming | Yes (JSON events) |
| Model Selection | Via `/model` command |
| Auth | GitHub OAuth (browser-based) |

### Implementation: CopilotCLIProvider

**File:** `src/llm/providers/copilot-cli-provider.ts`

```typescript
import { CLIProviderBase } from './cli-provider-base';
import { RegisterProvider } from '../decorators';
import { PromptDeliveryMethod, ProviderType } from '../provider-types';

@RegisterProvider({
  id: 'copilot-cli',
  displayName: 'GitHub Copilot CLI',
  description: 'Use GitHub Copilot CLI for AI analysis',
  requiresAuth: true,
  authMethod: 'browser',
  isLocal: true,
  supportsStreaming: true,
  defaultModel: 'claude-sonnet-4',
})
export class CopilotCLIProvider extends CLIProviderBase {
  constructor(config: { model?: string } = {}) {
    super(
      'copilot-cli',
      config,
      {
        command: 'copilot',
        args: ['--prompt'],
        promptDelivery: PromptDeliveryMethod.ARGUMENT,
        env: {}
      },
      {
        type: ProviderType.CLI,
        requiresApiKey: false,
        isLocal: true,
        supportsStreaming: true
      }
    );
  }

  /**
   * Build CLI arguments for Copilot
   */
  protected buildArgs(options: CompletionOptions): string[] {
    const args: string[] = [];

    // Copilot CLI uses -p or --prompt for single prompts
    args.push('-p');

    return args;
  }

  /**
   * Check if GitHub Copilot CLI is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.runCommand(['--version']);
      return result.includes('copilot');
    } catch {
      return false;
    }
  }

  /**
   * Test connection by running a minimal prompt
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // Check if command exists
      const available = await isCommandAvailable('copilot');
      if (!available) {
        return {
          success: false,
          error: 'GitHub Copilot CLI not found. Install with: gh extension install github/gh-copilot'
        };
      }

      // Quick test prompt
      await this.generateCompletion({
        prompt: 'Say "test"',
        maxTokens: 10
      });

      return {
        success: true,
        details: {
          endpoint: 'CLI: copilot',
          model: this._model
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
```

### Provider Registration

**File:** `src/extension.ts` (add import)

```typescript
// Import providers to trigger @RegisterProvider decorator
import './llm/providers/ollama-provider';
import './llm/providers/openrouter-provider';
import './llm/providers/anthropic-provider';
import './llm/providers/claude-code-cli-provider';
import './llm/providers/cursor-cli-provider';
import './llm/providers/copilot-cli-provider';  // NEW
```

### VS Code Configuration

**File:** `package.json` (contributes.configuration)

```json
{
  "vibelog.llm.provider": {
    "type": "string",
    "enum": ["ollama", "openrouter", "anthropic", "claude-code-cli", "cursor-cli", "copilot-cli"],
    "default": "ollama",
    "description": "Active LLM provider for AI features"
  }
}
```

---

## Part 5: Implementation Phases

### Phase 1: Session Reader (3 files)
1. `src/adapters/readers/copilot-session-reader.ts` - Parse JSON sessions
2. `src/adapters/readers/copilot-path-resolver.ts` - Platform-specific paths
3. `src/core/session/copilot-transformer.ts` - Transform to Vibe-Log format

### Phase 2: Prompt Detection (2 files)
1. `src/adapters/prompt-detection/copilot-adapter.ts` - File watcher adapter
2. Update `src/adapters/prompt-detection/types.ts` - Add `github_copilot` source

### Phase 3: CLI LLM Provider (2 files)
1. `src/llm/providers/copilot-cli-provider.ts` - CLI provider implementation
2. Update `package.json` - Add provider enum value

### Phase 4: Integration (3 files)
1. Update `src/di/container.ts` - Wire up services
2. Update `src/extension.ts` - Register provider
3. Update `src/panels/V2MessageHandler.ts` - Handle Copilot messages

### Phase 5: Testing
1. Unit tests for session reader
2. Unit tests for transformer
3. Integration tests for file watcher
4. Manual testing of CLI provider

---

## Part 6: Key Differences from Cursor/Claude

| Aspect | Cursor | Claude Code | GitHub Copilot |
|--------|--------|-------------|----------------|
| **Session Storage** | SQLite | JSONL | JSON files |
| **Detection Method** | DB polling + hooks | Hooks only | File watching |
| **Hook Support** | External scripts | External scripts | **None** |
| **CLI Provider** | `cursor` | `claude` | `copilot` |
| **Auth Method** | Browser OAuth | Browser OAuth | GitHub OAuth |
| **Model Tracking** | No | Yes | Yes |

---

## Part 7: Files to Create/Modify

### New Files
```
src/adapters/readers/copilot-session-reader.ts
src/adapters/readers/copilot-path-resolver.ts
src/adapters/prompt-detection/copilot-adapter.ts
src/core/session/copilot-transformer.ts
src/llm/providers/copilot-cli-provider.ts
src/__tests__/copilot-session-reader.test.ts
src/__tests__/copilot-transformer.test.ts
```

### Modified Files
```
src/adapters/prompt-detection/types.ts          # Add github_copilot source
src/di/container.ts                             # Wire up services
src/extension.ts                                # Register provider
src/panels/V2MessageHandler.ts                  # Handle messages
package.json                                    # Add provider enum
```

---

## Part 8: Risk Assessment

### Low Risk
- Session reading (standard JSON parsing)
- Data transformation (follows existing patterns)
- CLI provider (extends proven base class)

### Medium Risk
- File watcher reliability across platforms
- Detecting active workspace from session files

### Mitigations
- Implement debouncing for file watcher events
- Fall back to session ID extraction from file paths
- Add comprehensive error handling and logging

---

## Appendix: Related Resources

- [GitHub Copilot Extension](vscode:extension/github.copilot-chat)
- [SpecStory Integration](https://github.com/specstoryai/getspecstory)
- [Community Discussion on Chat History](https://github.com/community/community/discussions/129888)
- [Copilot CLI Documentation](https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli)

---

## Appendix: Storage Paths Reference

### Chat Sessions
```
Windows:  %APPDATA%\Code\User\workspaceStorage\<hash>\chatSessions\*.json
macOS:    ~/Library/Application Support/Code/User/workspaceStorage/<hash>/chatSessions/*.json
Linux:    ~/.config/Code/User/workspaceStorage/<hash>/chatSessions/*.json
```

### Additional Storage (for future reference)
```
chatEditingSessions/<id>/     # Agent mode editing sessions
local-index.1.db              # Workspace semantic index (SQLite)
workspace-chunks.db           # Semantic search chunks
commandEmbeddings.json        # 11MB embeddings cache
```
