# LLM Architecture Documentation

## Architecture Overview

The Vibe Log extension uses a modular, provider-agnostic architecture for integrating Large Language Models. This design allows developers to easily add new providers, switch between them, and build LLM-powered features without coupling to specific APIs.

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                     Extension Entry Point                    │
│                      (extension.ts)                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Co-Pilot Features                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Session    │  │    Prompt    │  │    Prompt    │     │
│  │ Summarizer   │  │    Scorer    │  │  Enhancer    │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                       LLM Manager                            │
│  • Provider initialization & management                      │
│  • Provider switching                                        │
│  • Unified completion interface                             │
│  • Error handling & fallbacks                               │
└────────────────────────────┬────────────────────────────────┘
                             │
                   ┌─────────┴─────────┐
                   ▼                   ▼
       ┌───────────────────┐ ┌───────────────────┐
       │ Ollama Provider   │ │OpenRouter Provider│
       │  • Local models   │ │  • Cloud API      │
       │  • HTTP API       │ │  • Multi-provider │
       │  • Streaming      │ │  • Cost tracking  │
       └─────────┬─────────┘ └─────────┬─────────┘
                 │                     │
                 ▼                     ▼
       ┌───────────────────┐ ┌───────────────────┐
       │  Local Ollama     │ │   OpenRouter      │
       │  (localhost:11434)│ │   (openrouter.ai) │
       └───────────────────┘ └───────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Files |
|-----------|---------------|-------|
| **LLM Manager** | Manages provider lifecycle, switches providers, provides unified API | `llm/llm-manager.ts` |
| **Settings Manager** | Reads/writes VSCode configuration, validates settings | `llm/settings-manager.ts` |
| **Providers** | Implement provider-specific API calls and streaming | `llm/providers/*.ts` |
| **Services** | Use LLM Manager to implement features like summarization | `copilot/*.ts` |

### Data Flow

1. **Initialization:**
   ```
   Extension activates
     → LLM Manager reads settings
     → Creates provider instances
     → Tests connections
     → Sets active provider
   ```

2. **Feature Request:**
   ```
   User triggers feature (e.g., summarize session)
     → Service builds prompt
     → Calls LLM Manager.generateCompletion()
     → LLM Manager routes to active provider
     → Provider makes API call
     → Response flows back to service
     → UI displays result
   ```

3. **Provider Switch:**
   ```
   User changes settings
     → Settings change event fires
     → LLM Manager reinitializes
     → New provider becomes active
     → Future requests use new provider
   ```

### Integration Points

The architecture integrates with VSCode through:

- **Configuration API**: `vscode.workspace.getConfiguration('vibelog.llm')`
- **Webview API**: Co-Pilot panel for UI
- **Extension API**: Commands and activation events
- **Output Channel**: Logging and debugging

---

## Components

### LLM Manager (`src/llm/llm-manager.ts`)

The LLM Manager is the central orchestrator for all LLM operations. It implements the **Singleton pattern** to ensure consistent state across the extension.

#### Key Responsibilities

1. **Provider Lifecycle:**
   - Initializes providers based on configuration
   - Manages provider instances in a Map
   - Handles provider switching
   - Cleans up resources on disposal

2. **Unified Interface:**
   - Provides single API for completions (streaming and non-streaming)
   - Abstracts provider-specific details
   - Handles errors consistently

3. **Validation:**
   - Validates configuration before initialization
   - Tests provider connections
   - Returns helpful error messages

#### Public API

```typescript
class LLMManager {
  // Initialization
  async initialize(): Promise<void>
  async reinitialize(): Promise<void>
  isInitialized(): boolean
  dispose(): void

  // Provider Management
  getActiveProvider(): LLMProvider | null
  getProvider(type: LLMProviderType): LLMProvider | null
  async switchProvider(type: LLMProviderType): Promise<void>
  getConfiguredProviders(): LLMProviderType[]
  hasProvider(type: LLMProviderType): boolean

  // Testing
  async testAllProviders(): Promise<ProviderTestResults>

  // Completions
  async generateCompletion(options: CompletionOptions): Promise<CompletionResponse>
  async *streamCompletion(options: CompletionOptions): AsyncGenerator<StreamChunk>
  async listModels(): Promise<ModelInfo[]>

  // Status
  getActiveProviderInfo(): {...} | null
  getStatusSummary(): string
}

// Singleton access
function getLLMManager(): LLMManager
function resetLLMManager(): void
```

#### Usage Example

```typescript
import { getLLMManager } from './llm/llm-manager';

// Initialize on extension activation
const llmManager = getLLMManager();
await llmManager.initialize();

// Generate completion
const response = await llmManager.generateCompletion({
  prompt: 'Summarize this session',
  systemPrompt: 'You are a coding session analyst',
  temperature: 0.3,
  maxTokens: 500,
});

console.log(response.text);
```

#### Error Handling

The LLM Manager throws descriptive errors for common issues:

```typescript
// No provider configured
throw new Error(
  'LLM configuration is invalid:\n<errors>\n\n' +
  'Please configure the LLM settings in VSCode...'
);

// Provider unavailable
throw new Error(
  `Provider '${type}' is not accessible. ` +
  `Please check your configuration and ensure the provider is running.`
);
```

---

### Settings Manager (`src/llm/settings-manager.ts`)

Manages VSCode workspace configuration with type-safe access and validation.

#### Configuration Schema

All settings live under the `vibelog.llm` namespace:

```typescript
interface LLMProviderConfig {
  provider: 'ollama' | 'openrouter';
  ollama?: OllamaConfig;
  openrouter?: OpenRouterConfig;
}

interface OllamaConfig {
  endpoint: string;  // Default: "http://localhost:11434"
  model: string;     // Default: "codellama:7b"
}

interface OpenRouterConfig {
  apiKey: string;    // Required for OpenRouter
  model: string;     // Default: "anthropic/claude-3.5-sonnet"
  siteUrl?: string;  // Optional for ranking
  siteName?: string; // Optional for ranking
}
```

#### Public API

```typescript
class SettingsManager {
  // Getters
  getProvider(): LLMProviderType
  getOllamaConfig(): OllamaConfig
  getOpenRouterConfig(): OpenRouterConfig
  getConfig(): LLMProviderConfig

  // Setters
  async setProvider(provider: LLMProviderType): Promise<void>
  async setOllamaEndpoint(endpoint: string): Promise<void>
  async setOllamaModel(model: string): Promise<void>
  async setOpenRouterApiKey(apiKey: string): Promise<void>
  async setOpenRouterModel(model: string): Promise<void>

  // Validation
  validateConfig(): ConfigValidationResult

  // Change Listeners
  onConfigChange(callback: (config: LLMProviderConfig) => void): Disposable

  // Utilities
  hasCustomValue(settingKey: string): boolean
  async resetSetting(settingKey: string): Promise<void>
  async resetAll(): Promise<void>
  getConfigSummary(): string
}
```

#### Validation Logic

The Settings Manager validates configuration comprehensively:

```typescript
validateConfig(): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Provider validation
  if (!['ollama', 'openrouter'].includes(provider)) {
    errors.push('Invalid provider');
  }

  // Ollama validation
  if (provider === 'ollama') {
    if (!endpoint) errors.push('Ollama endpoint is required');
    if (!model) errors.push('Ollama model is required');
    // URL format validation...
  }

  // OpenRouter validation
  if (provider === 'openrouter') {
    if (!apiKey) errors.push('OpenRouter API key is required');
    if (apiKey.length < 10) errors.push('API key appears invalid');
    if (!model) errors.push('OpenRouter model is required');
  }

  return { valid: errors.length === 0, errors, warnings };
}
```

#### Usage Example

```typescript
import { SettingsManager } from './llm/settings-manager';

const settings = new SettingsManager();

// Get current config
const config = settings.getConfig();
console.log(`Using ${config.provider} provider`);

// Validate
const validation = settings.validateConfig();
if (!validation.valid) {
  console.error('Configuration errors:', validation.errors);
}

// Listen for changes
const disposable = settings.onConfigChange((newConfig) => {
  console.log('Settings changed:', newConfig);
  // Reinitialize LLM Manager...
});
```

---

### Providers (`src/llm/providers/`)

Providers implement the `LLMProvider` interface, which defines the contract for all LLM providers.

#### LLMProvider Interface

```typescript
interface LLMProvider {
  // Identity
  readonly type: LLMProviderType;
  readonly model: string;

  // Connection
  isAvailable(): Promise<boolean>;
  testConnection(): Promise<ConnectionTestResult>;

  // Models
  listModels(): Promise<ModelInfo[]>;

  // Completions
  generateCompletion(options: CompletionOptions): Promise<CompletionResponse>;
  streamCompletion(options: CompletionOptions): AsyncGenerator<StreamChunk>;
}
```

#### OllamaProvider Implementation

**File:** `src/llm/providers/ollama-provider.ts`

The Ollama provider connects to a local Ollama instance via HTTP.

**Key Features:**
- Supports both streaming and non-streaming completions
- NDJSON parsing for streaming responses
- Comprehensive error handling with helpful messages
- Token usage tracking

**API Endpoints Used:**
- `GET /api/version` - Check if server is running
- `GET /api/tags` - List installed models
- `POST /api/generate` - Generate completions (streaming or non-streaming)

**Example Implementation:**

```typescript
export class OllamaProvider implements LLMProvider {
  public readonly type: LLMProviderType = 'ollama';
  private readonly endpoint: string;
  private readonly _model: string;

  constructor(config: OllamaConfig) {
    this.endpoint = config.endpoint.replace(/\/$/, '');
    this._model = config.model;
  }

  async generateCompletion(options: CompletionOptions): Promise<CompletionResponse> {
    const requestBody = {
      model: this._model,
      prompt: options.prompt,
      system: options.systemPrompt,
      stream: false,
      options: {
        temperature: options.temperature,
        num_predict: options.maxTokens,
        stop: options.stop,
      },
    };

    const response = await fetch(`${this.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000),
    });

    const data = await response.json();

    return {
      text: data.response,
      model: this._model,
      provider: 'ollama',
      timestamp: new Date(),
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    };
  }
}
```

**Streaming Implementation:**

```typescript
async *streamCompletion(options: CompletionOptions): AsyncGenerator<StreamChunk> {
  // Set stream: true in request
  const requestBody = { ...options, stream: true };

  const response = await fetch(`${this.endpoint}/api/generate`, {...});
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      const data = JSON.parse(line);
      yield {
        text: data.response,
        isComplete: data.done,
        model: this._model,
        provider: 'ollama',
      };

      if (data.done) return;
    }
  }
}
```

#### OpenRouterProvider Implementation

**File:** `src/llm/providers/openrouter-provider.ts`

The OpenRouter provider connects to OpenRouter's unified API, providing access to multiple LLM providers.

**Key Features:**
- Supports Claude, GPT-4, Llama, Gemini, and more
- Automatic cost calculation
- Rate limit handling
- SSE (Server-Sent Events) streaming
- Authentication via API key

**API Endpoints Used:**
- `GET /api/v1/models` - List available models
- `POST /api/v1/chat/completions` - Generate completions (OpenAI-compatible)

**Headers Required:**
```typescript
{
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': siteUrl || 'https://github.com/vibelog/vibe-log',
  'X-Title': siteName || 'VibeLog VSCode Extension',
}
```

**Example Implementation:**

```typescript
export class OpenRouterProvider implements LLMProvider {
  public readonly type: LLMProviderType = 'openrouter';
  private readonly apiKey: string;
  private readonly _model: string;
  private readonly endpoint = 'https://openrouter.ai/api/v1';

  async generateCompletion(options: CompletionOptions): Promise<CompletionResponse> {
    const messages = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: options.prompt });

    const requestBody = {
      model: this._model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stop: options.stop,
      stream: false,
    };

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    const cost = this.calculateCost(this._model, data.usage);

    return {
      text: data.choices[0].message.content,
      model: this._model,
      provider: 'openrouter',
      timestamp: new Date(),
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      cost,
    };
  }
}
```

**Cost Calculation:**

```typescript
private calculateCost(model: string, usage: {
  prompt_tokens: number;
  completion_tokens: number;
}): { amount: number; currency: string } {
  const pricing: Record<string, { prompt: number; completion: number }> = {
    'anthropic/claude-3.5-sonnet': { prompt: 3.0, completion: 15.0 },
    'openai/gpt-4-turbo': { prompt: 10.0, completion: 30.0 },
    // ... more models
  };

  const modelPricing = pricing[model] || { prompt: 1.0, completion: 2.0 };
  const promptCost = (usage.prompt_tokens / 1_000_000) * modelPricing.prompt;
  const completionCost = (usage.completion_tokens / 1_000_000) * modelPricing.completion;

  return {
    amount: promptCost + completionCost,
    currency: 'USD',
  };
}
```

---

### Services (`src/copilot/`)

Services use the LLM Manager to implement specific features.

#### SessionSummarizer

**File:** `src/copilot/session-summarizer.ts`

Generates concise 2-3 sentence summaries of coding sessions.

**Key Features:**
- Structured prompt building
- Low temperature (0.3) for consistency
- Fallback summaries if LLM fails
- Token usage tracking

**Usage Example:**

```typescript
import { getLLMManager } from '../llm/llm-manager';
import { SessionSummarizer } from '../copilot/session-summarizer';

const llmManager = getLLMManager();
await llmManager.initialize();

const summarizer = new SessionSummarizer(llmManager);

const sessionData = {
  duration: 3600,
  filesChanged: ['src/api.ts', 'src/types.ts'],
  commands: ['npm test', 'git commit'],
  projectName: 'my-project',
  tool: 'cursor',
  timestamp: new Date().toISOString(),
};

const summary = await summarizer.summarizeSession(sessionData);
console.log(summary);
// "Worked on API endpoint implementation in my-project for 60 minutes.
//  Modified 2 TypeScript files and ran tests. Committed changes to git."
```

**Prompt Structure:**

```typescript
private getSystemPrompt(): string {
  return `You are a coding session analyst. Your task is to analyze coding sessions
and provide clear, concise summaries.

When summarizing a session:
1. Identify the main task or objective based on files modified and commands run
2. Highlight key accomplishments or progress made
3. Note any patterns or productivity insights
4. Keep your summary to 2-3 sentences
5. Be specific and technical when appropriate
6. Focus on what was achieved, not just what was done

Provide ONLY the summary text, no additional commentary, headers, or explanations.`;
}

private buildSummarizationPrompt(sessionData: SessionData): string {
  return `Analyze this coding session and provide a 2-3 sentence summary:

Session Details:
- Duration: ${durationMinutes} minutes
- Project: ${sessionData.projectName}
- Tool: ${sessionData.tool}
- Date: ${new Date(sessionData.timestamp).toLocaleDateString()}

Files Modified (${sessionData.filesChanged.length} files):
${fileList}

Commands Executed (${sessionData.commands.length} commands):
${commandList}

Summary:`;
}
```

#### PromptScorer

**File:** `src/copilot/prompt-scorer.ts`

Evaluates prompt quality on a 0-10 scale with detailed feedback.

**Scoring Criteria:**
- Clarity and specificity (0-2.5 points)
- Context provided (0-2.5 points)
- Expected output defined (0-2.5 points)
- Constraints specified (0-2.5 points)

**Usage Example:**

```typescript
import { PromptScorer } from '../copilot/prompt-scorer';

const scorer = new PromptScorer(llmManager);

const result = await scorer.scorePrompt('Improve the code');
console.log(`Score: ${result.score}/10`);
console.log(`Feedback: ${result.feedback}`);
// Score: 3/10
// Feedback: "Prompt is too vague. Specify which code file, what improvements
//            are needed, and what success looks like..."
```

#### PromptEnhancer

**File:** `src/copilot/prompt-enhancer.ts`

Suggests improvements to user prompts for better LLM results.

**Enhancement Strategies:**
- Add missing context
- Specify expected format
- Include constraints
- Clarify objectives
- Add examples

**Usage Example:**

```typescript
import { PromptEnhancer } from '../copilot/prompt-enhancer';

const enhancer = new PromptEnhancer(llmManager);

const original = 'Fix the bug';
const enhanced = await enhancer.enhancePrompt(original);
console.log(enhanced);
// "Fix the authentication bug in src/auth.ts where users are getting
//  'Invalid token' errors. The bug occurs when JWT tokens expire.
//  Expected outcome: Users should receive a refresh token automatically..."
```

---

## Adding New Providers

Want to add support for Anthropic's direct API, Azure OpenAI, or another provider? Follow this guide.

### Step 1: Create Provider File

Create a new file in `src/llm/providers/`:

```typescript
// src/llm/providers/my-provider.ts

import {
  LLMProvider,
  LLMProviderType,
  CompletionOptions,
  CompletionResponse,
  StreamChunk,
  ModelInfo,
  ConnectionTestResult,
} from '../types';

export interface MyProviderConfig {
  apiKey: string;
  endpoint: string;
  model: string;
}

export class MyProvider implements LLMProvider {
  public readonly type: LLMProviderType = 'my-provider' as any; // Update types.ts
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly _model: string;

  constructor(config: MyProviderConfig) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint;
    this._model = config.model;
  }

  public get model(): string {
    return this._model;
  }

  async isAvailable(): Promise<boolean> {
    // Test if provider is accessible
    try {
      const response = await fetch(`${this.endpoint}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    // Validate API key and return connection details
    try {
      const response = await fetch(`${this.endpoint}/health`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });

      return {
        success: response.ok,
        details: { endpoint: this.endpoint },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    // Fetch available models
    const response = await fetch(`${this.endpoint}/models`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });

    const data = await response.json();
    return data.models.map((m: any) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      contextLength: m.context_length,
      supportsStreaming: m.supports_streaming,
    }));
  }

  async generateCompletion(options: CompletionOptions): Promise<CompletionResponse> {
    // Implement non-streaming completion
    const response = await fetch(`${this.endpoint}/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this._model,
        prompt: options.prompt,
        system: options.systemPrompt,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      }),
    });

    const data = await response.json();

    return {
      text: data.text,
      model: this._model,
      provider: this.type,
      timestamp: new Date(),
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
  }

  async *streamCompletion(options: CompletionOptions): AsyncGenerator<StreamChunk> {
    // Implement streaming completion
    const response = await fetch(`${this.endpoint}/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this._model,
        prompt: options.prompt,
        system: options.systemPrompt,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: true,
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // Parse buffer and yield chunks...

      yield {
        text: '<chunk text>',
        isComplete: false,
        model: this._model,
        provider: this.type,
      };
    }
  }
}
```

### Step 2: Update Type Definitions

Add your provider to `src/llm/types.ts`:

```typescript
export type LLMProviderType = 'ollama' | 'openrouter' | 'my-provider';

export interface LLMProviderConfig {
  provider: LLMProviderType;
  ollama?: OllamaConfig;
  openrouter?: OpenRouterConfig;
  myProvider?: MyProviderConfig; // Add this
}

export interface MyProviderConfig {
  apiKey: string;
  endpoint: string;
  model: string;
}
```

### Step 3: Register in LLM Manager

Update `src/llm/llm-manager.ts`:

```typescript
import { MyProvider } from './providers/my-provider';

private async initializeProviders(config: LLMProviderConfig): Promise<void> {
  this.providers.clear();

  // Existing providers...

  // Add your provider
  if (config.myProvider && config.myProvider.apiKey) {
    try {
      const myProvider = new MyProvider(config.myProvider);
      this.providers.set('my-provider', myProvider);
    } catch (error) {
      throw new Error(`Failed to initialize MyProvider: ${error.message}`);
    }
  }
}
```

### Step 4: Add Settings Schema

Update `package.json` to add configuration options:

```json
{
  "contributes": {
    "configuration": {
      "properties": {
        "vibelog.llm.provider": {
          "enum": ["ollama", "openrouter", "my-provider"],
          "enumDescriptions": [
            "Local Ollama instance",
            "OpenRouter cloud API",
            "My Custom Provider"
          ]
        },
        "vibelog.llm.myProvider.apiKey": {
          "type": "string",
          "default": "",
          "description": "API key for My Provider"
        },
        "vibelog.llm.myProvider.endpoint": {
          "type": "string",
          "default": "https://api.myprovider.com",
          "description": "API endpoint URL"
        },
        "vibelog.llm.myProvider.model": {
          "type": "string",
          "default": "default-model",
          "description": "Model to use"
        }
      }
    }
  }
}
```

### Step 5: Update Settings Manager

Add getters in `src/llm/settings-manager.ts`:

```typescript
public getMyProviderConfig(): MyProviderConfig {
  const apiKey = this.config.get<string>('myProvider.apiKey', '');
  const endpoint = this.config.get<string>('myProvider.endpoint', 'https://api.myprovider.com');
  const model = this.config.get<string>('myProvider.model', 'default-model');

  return { apiKey, endpoint, model };
}

public getConfig(): LLMProviderConfig {
  return {
    provider: this.getProvider(),
    ollama: this.getOllamaConfig(),
    openrouter: this.getOpenRouterConfig(),
    myProvider: this.getMyProviderConfig(), // Add this
  };
}
```

### Step 6: Add Validation

Add validation logic in Settings Manager:

```typescript
public validateConfig(): ConfigValidationResult {
  // Existing validation...

  if (provider === 'my-provider') {
    const myProviderConfig = this.getMyProviderConfig();

    if (!myProviderConfig.apiKey) {
      errors.push('MyProvider API key is required');
    }

    if (!myProviderConfig.endpoint) {
      errors.push('MyProvider endpoint is required');
    }

    if (!myProviderConfig.model) {
      errors.push('MyProvider model is required');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
```

### Testing Checklist

After implementing a new provider, test:

- [ ] Provider initializes without errors
- [ ] `isAvailable()` correctly detects provider status
- [ ] `testConnection()` validates credentials
- [ ] `listModels()` returns available models
- [ ] `generateCompletion()` produces valid responses
- [ ] `streamCompletion()` yields chunks correctly
- [ ] Error handling works (invalid API key, network errors, etc.)
- [ ] Settings validation catches invalid configuration
- [ ] Provider switch works (from/to your provider)
- [ ] Token usage and cost tracking (if applicable)

---

## Adding New Features

Want to add a new LLM-powered feature? Here's how to integrate with the LLM Manager.

### Step 1: Create Service Class

```typescript
// src/copilot/my-feature.ts

import { LLMManager } from '../llm/llm-manager';
import { CompletionOptions } from '../llm/types';

export class MyFeature {
  private llmManager: LLMManager;

  constructor(llmManager: LLMManager) {
    this.llmManager = llmManager;
  }

  async processData(input: string): Promise<string> {
    // Ensure initialized
    if (!this.llmManager.isInitialized()) {
      await this.llmManager.initialize();
    }

    // Build prompt
    const prompt = this.buildPrompt(input);

    // Generate completion
    const options: CompletionOptions = {
      prompt,
      systemPrompt: this.getSystemPrompt(),
      temperature: 0.5,
      maxTokens: 1000,
    };

    const response = await this.llmManager.generateCompletion(options);

    // Handle errors
    if (response.error) {
      throw new Error(`LLM generation failed: ${response.error}`);
    }

    // Process and return
    return this.processResponse(response.text);
  }

  private getSystemPrompt(): string {
    return 'You are a helpful assistant...';
  }

  private buildPrompt(input: string): string {
    return `Process this input:\n\n${input}\n\nResult:`;
  }

  private processResponse(text: string): string {
    // Clean up response, extract relevant parts
    return text.trim();
  }
}
```

### Step 2: Integrate with Extension

```typescript
// src/extension.ts

import { getLLMManager } from './llm/llm-manager';
import { MyFeature } from './copilot/my-feature';

export async function activate(context: vscode.ExtensionContext) {
  // Initialize LLM Manager
  const llmManager = getLLMManager();

  try {
    await llmManager.initialize();
  } catch (error) {
    vscode.window.showErrorMessage(`LLM initialization failed: ${error.message}`);
  }

  // Create feature instance
  const myFeature = new MyFeature(llmManager);

  // Register command
  const disposable = vscode.commands.registerCommand('vibelog.myFeature', async () => {
    try {
      const result = await myFeature.processData('example input');
      vscode.window.showInformationMessage(result);
    } catch (error) {
      vscode.window.showErrorMessage(`Feature failed: ${error.message}`);
    }
  });

  context.subscriptions.push(disposable);
}
```

### Prompt Engineering Best Practices

1. **Be Specific:**
   ```typescript
   // BAD
   const prompt = 'Summarize this';

   // GOOD
   const prompt = `Summarize this coding session in 2-3 sentences.
   Focus on: main task, accomplishments, and productivity insights.`;
   ```

2. **Provide Context:**
   ```typescript
   const systemPrompt = `You are a coding session analyst specializing in developer productivity.
   You understand software development workflows, version control, testing, and deployment.
   Your summaries help developers understand their work patterns.`;
   ```

3. **Use Examples (Few-Shot):**
   ```typescript
   const prompt = `Summarize coding sessions like these examples:

   Example 1:
   Input: 60 min, modified auth.ts, ran tests
   Output: "Implemented JWT authentication with token refresh logic. Tests passing."

   Example 2:
   Input: 120 min, modified 5 React components, deployed
   Output: "Refactored UI components to use new design system. Successfully deployed to staging."

   Now summarize this session:
   ${sessionData}`;
   ```

4. **Specify Format:**
   ```typescript
   const prompt = `Analyze this prompt and respond in JSON:
   {
     "score": <number 0-10>,
     "strengths": [<string>],
     "weaknesses": [<string>],
     "suggestions": [<string>]
   }`;
   ```

5. **Control Temperature:**
   ```typescript
   // Factual, consistent (summaries, scoring)
   { temperature: 0.2 }

   // Balanced (enhancement suggestions)
   { temperature: 0.5 }

   // Creative (brainstorming, ideation)
   { temperature: 0.8 }
   ```

### Handling Streaming Responses

For real-time UI updates, use streaming:

```typescript
async processWithStreaming(input: string): Promise<string> {
  const options: CompletionOptions = {
    prompt: input,
    systemPrompt: 'You are...',
    temperature: 0.5,
    maxTokens: 1000,
  };

  let fullText = '';

  for await (const chunk of this.llmManager.streamCompletion(options)) {
    if (chunk.error) {
      throw new Error(chunk.error);
    }

    fullText += chunk.text;

    // Update UI with partial result
    this.updateUI(fullText);

    if (chunk.isComplete) {
      // Final chunk - includes usage info
      console.log('Token usage:', chunk.usage);
      console.log('Cost:', chunk.cost);
      break;
    }
  }

  return fullText;
}
```

### Error Handling Patterns

```typescript
async robustFeature(input: string): Promise<string> {
  try {
    // Ensure initialized
    if (!this.llmManager.isInitialized()) {
      await this.llmManager.initialize();
    }

    // Check if provider is available
    const provider = this.llmManager.getActiveProvider();
    if (!provider) {
      throw new Error('No LLM provider is configured');
    }

    // Generate completion
    const response = await this.llmManager.generateCompletion({
      prompt: input,
      temperature: 0.5,
      maxTokens: 500,
    });

    // Check for LLM errors
    if (response.error) {
      console.error('LLM error:', response.error);
      return this.getFallbackResponse(input);
    }

    return response.text;

  } catch (error) {
    console.error('Feature error:', error);

    // Provide helpful error messages
    if (error.message.includes('timeout')) {
      throw new Error('LLM request timed out. Try again or increase timeout in settings.');
    }

    if (error.message.includes('not configured')) {
      throw new Error('Please configure an LLM provider in Settings → VibeLog → LLM');
    }

    // Generic fallback
    return this.getFallbackResponse(input);
  }
}

private getFallbackResponse(input: string): string {
  // Provide a basic response when LLM fails
  return 'Unable to process request. Please check your LLM configuration.';
}
```

---

## Testing Guidelines

### Unit Testing Providers

Use mocks to test provider logic without real API calls:

```typescript
// __tests__/ollama-provider.test.ts

import { OllamaProvider } from '../src/llm/providers/ollama-provider';

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'codellama:7b',
    });
  });

  it('should initialize with correct config', () => {
    expect(provider.type).toBe('ollama');
    expect(provider.model).toBe('codellama:7b');
  });

  it('should handle connection errors gracefully', async () => {
    // Mock fetch to simulate connection error
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await provider.testConnection();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot connect to Ollama');
  });

  it('should generate completions', async () => {
    // Mock successful response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: 'Test response',
        prompt_eval_count: 10,
        eval_count: 20,
      }),
    });

    const response = await provider.generateCompletion({
      prompt: 'Test prompt',
      temperature: 0.5,
      maxTokens: 100,
    });

    expect(response.text).toBe('Test response');
    expect(response.usage?.totalTokens).toBe(30);
  });
});
```

### Integration Testing

Test with real APIs (requires actual credentials):

```typescript
// __tests__/integration/llm-manager.integration.test.ts

import { LLMManager } from '../../src/llm/llm-manager';
import { SettingsManager } from '../../src/llm/settings-manager';

describe('LLM Manager Integration', () => {
  let llmManager: LLMManager;

  beforeAll(async () => {
    // Use real settings (ensure Ollama is running locally)
    llmManager = new LLMManager();
    await llmManager.initialize();
  });

  it('should initialize with Ollama provider', () => {
    expect(llmManager.isInitialized()).toBe(true);
    expect(llmManager.hasProvider('ollama')).toBe(true);
  });

  it('should generate real completions', async () => {
    const response = await llmManager.generateCompletion({
      prompt: 'Say "test successful" and nothing else',
      temperature: 0.0,
      maxTokens: 10,
    });

    expect(response.error).toBeUndefined();
    expect(response.text.toLowerCase()).toContain('test successful');
  }, 30000); // 30 second timeout

  it('should stream completions', async () => {
    const chunks: string[] = [];

    for await (const chunk of llmManager.streamCompletion({
      prompt: 'Count from 1 to 5',
      temperature: 0.0,
      maxTokens: 50,
    })) {
      chunks.push(chunk.text);
      if (chunk.isComplete) break;
    }

    expect(chunks.length).toBeGreaterThan(1);
    const fullText = chunks.join('');
    expect(fullText).toContain('1');
    expect(fullText).toContain('5');
  }, 30000);
});
```

### Manual Testing Checklist

Before releasing LLM features:

**Ollama:**
- [ ] Install Ollama and pull a model
- [ ] Configure in VSCode settings
- [ ] Test connection (should show green checkmark)
- [ ] Generate completion (should work)
- [ ] Test streaming (should show incremental results)
- [ ] Stop Ollama server (should show error)
- [ ] Restart Ollama (should reconnect)

**OpenRouter:**
- [ ] Create OpenRouter account
- [ ] Add credits
- [ ] Configure API key in settings
- [ ] Test connection
- [ ] Generate completion
- [ ] Test streaming
- [ ] Use invalid API key (should show helpful error)
- [ ] Run out of credits (should show clear error)

**Provider Switching:**
- [ ] Start with Ollama
- [ ] Generate completion
- [ ] Switch to OpenRouter in settings
- [ ] Generate completion (should use new provider)
- [ ] Check status shows correct active provider

**Error Scenarios:**
- [ ] No provider configured → Clear error message
- [ ] Invalid configuration → Validation errors shown
- [ ] Network timeout → Timeout error with suggestion
- [ ] Model not found → Helpful error with suggestions

### Performance Testing

Test performance under various conditions:

```typescript
// __tests__/performance/llm-performance.test.ts

describe('LLM Performance', () => {
  it('should complete requests within timeout', async () => {
    const start = Date.now();

    await llmManager.generateCompletion({
      prompt: 'Short test',
      maxTokens: 50,
    });

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(10000); // 10 seconds
  });

  it('should handle concurrent requests', async () => {
    const requests = Array(5).fill(null).map((_, i) =>
      llmManager.generateCompletion({
        prompt: `Request ${i}`,
        maxTokens: 50,
      })
    );

    const results = await Promise.all(requests);
    expect(results.every(r => !r.error)).toBe(true);
  });
});
```

---

## API Reference

### CompletionOptions

```typescript
interface CompletionOptions {
  prompt: string;           // Required: The user prompt
  systemPrompt?: string;    // Optional: System instructions
  temperature?: number;     // 0.0-2.0, default: varies by provider
  maxTokens?: number;       // Max response length, default: varies
  stream?: boolean;         // Enable streaming, default: false
  stop?: string[];          // Stop sequences
}
```

### CompletionResponse

```typescript
interface CompletionResponse {
  text: string;             // Generated text
  model: string;            // Model used
  provider: LLMProviderType; // Provider used
  timestamp: Date;          // When generated
  usage?: {                 // Token usage (if available)
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  cost?: {                  // Cost info (OpenRouter only)
    amount: number;
    currency: string;
  };
  error?: string;           // Error message (if failed)
}
```

### StreamChunk

```typescript
interface StreamChunk {
  text: string;             // Text delta for this chunk
  isComplete: boolean;      // True for final chunk
  model: string;            // Model generating stream
  provider: LLMProviderType; // Provider handling stream
  usage?: {...};            // Only in final chunk
  cost?: {...};             // Only in final chunk
  error?: string;           // Error message (if failed)
}
```

### ModelInfo

```typescript
interface ModelInfo {
  id: string;               // Model identifier
  name: string;             // Human-readable name
  description?: string;     // Model description
  contextLength?: number;   // Context window size
  supportsStreaming?: boolean; // Streaming support
}
```

### ConnectionTestResult

```typescript
interface ConnectionTestResult {
  success: boolean;         // Connection successful?
  error?: string;           // Error message (if failed)
  details?: {               // Connection details
    version?: string;
    modelsAvailable?: number;
    endpoint?: string;
  };
}
```

---

## Design Patterns Used

### 1. Singleton Pattern (LLM Manager)

**Purpose:** Ensure single instance across extension lifecycle

```typescript
let globalInstance: LLMManager | null = null;

export function getLLMManager(): LLMManager {
  if (!globalInstance) {
    globalInstance = new LLMManager();
  }
  return globalInstance;
}
```

**Benefits:**
- Consistent state across the extension
- Prevents multiple initializations
- Easy access from any module
- Resource efficiency

### 2. Strategy Pattern (Provider Selection)

**Purpose:** Allow runtime selection of LLM provider

```typescript
interface LLMProvider {
  generateCompletion(options: CompletionOptions): Promise<CompletionResponse>;
}

class LLMManager {
  private activeProvider: LLMProvider | null;

  async generateCompletion(options: CompletionOptions) {
    return this.activeProvider!.generateCompletion(options);
  }
}
```

**Benefits:**
- Swap providers without code changes
- Easy to add new providers
- Abstraction from implementation details

### 3. Factory Pattern (Provider Creation)

**Purpose:** Create provider instances based on configuration

```typescript
private async initializeProviders(config: LLMProviderConfig): Promise<void> {
  if (config.ollama) {
    const provider = new OllamaProvider(config.ollama);
    this.providers.set('ollama', provider);
  }

  if (config.openrouter) {
    const provider = new OpenRouterProvider(config.openrouter);
    this.providers.set('openrouter', provider);
  }
}
```

**Benefits:**
- Centralized creation logic
- Validation before creation
- Error handling in one place

### 4. Observer Pattern (Settings Changes)

**Purpose:** React to configuration changes

```typescript
class SettingsManager {
  onConfigChange(callback: (config: LLMProviderConfig) => void): Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('vibelog.llm')) {
        callback(this.getConfig());
      }
    });
  }
}
```

**Benefits:**
- Automatic updates on settings change
- Decoupled components
- Clean resource management

---

## Performance Considerations

### 1. Provider Caching

The LLM Manager caches provider instances to avoid repeated initialization:

```typescript
private providers: Map<LLMProviderType, LLMProvider>;
```

### 2. Request Timeouts

All requests include timeouts to prevent hanging:

```typescript
const response = await fetch(url, {
  signal: AbortSignal.timeout(30000), // 30 seconds
});
```

### 3. Token Limits

Set appropriate max tokens based on use case:

```typescript
// Short summaries
{ maxTokens: 200 }

// Detailed analysis
{ maxTokens: 1000 }

// Long-form content
{ maxTokens: 4000 }
```

### 4. Streaming vs Non-Streaming

**Use streaming when:**
- Results displayed in real-time
- Long responses expected
- User needs immediate feedback

**Use non-streaming when:**
- Processing result programmatically
- Short responses expected
- Simplicity preferred

### 5. Cost Optimization

For OpenRouter users:

```typescript
// Use cheaper models for simple tasks
const cheapModel = 'anthropic/claude-3-haiku';

// Use premium models for complex tasks
const premiumModel = 'anthropic/claude-3.5-sonnet';

// Reduce maxTokens to save costs
{ maxTokens: 200 } // Instead of 1000
```

---

## Conclusion

The LLM architecture in Vibe Log is designed for flexibility, extensibility, and ease of use. Key takeaways:

1. **Provider-Agnostic**: Easy to switch between providers or add new ones
2. **Type-Safe**: Full TypeScript support with comprehensive types
3. **Error-Resilient**: Graceful error handling with helpful messages
4. **Testable**: Clear separation of concerns enables thorough testing
5. **Performant**: Caching, timeouts, and streaming for optimal UX

For questions or contributions, visit the [GitHub repository](https://github.com/vibelog/vibe-log-extension) or join our [Discord community](https://discord.gg/vibelog).
