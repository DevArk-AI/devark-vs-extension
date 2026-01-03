# LLM Provider System

Complete LLM provider architecture supporting multiple providers (Ollama, OpenRouter) with a unified interface.

## Architecture

```
src/llm/
├── types.ts                          # Core type definitions
├── llm-manager.ts                    # Central provider manager
├── settings-manager.ts               # VSCode settings integration
├── providers/
│   ├── ollama-provider.ts           # Ollama implementation
│   └── openrouter-provider.ts       # OpenRouter implementation
└── index.ts                          # Public API exports
```

## Features

### Type-Safe Provider System
- **Unified Interface**: All providers implement `LLMProvider` interface
- **Multiple Providers**: Support for Ollama (local) and OpenRouter (cloud)
- **Provider Switching**: Runtime switching between providers
- **Configuration Validation**: Type-safe settings with validation

### Ollama Provider
- **Local Models**: codellama:7b, deepseek-coder:6.7b, starcoder2:7b
- **Endpoint**: Default http://localhost:11434
- **Streaming**: Full NDJSON streaming support
- **Connection Testing**: Health checks and version detection
- **Model Discovery**: Automatic model listing from local Ollama

### OpenRouter Provider
- **Cloud Models**: Claude 3.5 Sonnet, GPT-4 Turbo, Llama 3 70B, Gemini Pro
- **API Authentication**: Bearer token authentication
- **Cost Tracking**: Automatic cost calculation per request
- **Rate Limiting**: Handles 429 errors gracefully
- **Streaming**: SSE-based streaming support

## Usage

### Basic Initialization

```typescript
import { getLLMManager } from './llm';

// Get singleton instance
const llmManager = getLLMManager();

// Initialize with current configuration
await llmManager.initialize();

// Check active provider
const info = llmManager.getActiveProviderInfo();
console.log(`Using ${info.type} with model ${info.model}`);
```

### Generate Completions

```typescript
// Non-streaming completion
const response = await llmManager.generateCompletion({
  prompt: 'Explain async/await in JavaScript',
  systemPrompt: 'You are a helpful coding assistant.',
  temperature: 0.7,
  maxTokens: 500,
});

console.log(response.text);
console.log(`Used ${response.usage?.totalTokens} tokens`);
if (response.cost) {
  console.log(`Cost: $${response.cost.amount.toFixed(4)}`);
}
```

### Streaming Completions

```typescript
// Streaming completion
for await (const chunk of llmManager.streamCompletion({
  prompt: 'Write a Python function to calculate fibonacci',
  temperature: 0.5,
})) {
  process.stdout.write(chunk.text);

  if (chunk.isComplete) {
    console.log(`\n\nTotal tokens: ${chunk.usage?.totalTokens}`);
  }
}
```

### Provider Management

```typescript
// Test all configured providers
const testResults = await llmManager.testAllProviders();
for (const [provider, result] of Object.entries(testResults)) {
  console.log(`${provider}: ${result.success ? '✓' : '✗'}`);
  if (!result.success) {
    console.log(`  Error: ${result.error}`);
  }
}

// Switch providers
await llmManager.switchProvider('openrouter');

// List available models
const models = await llmManager.listModels();
models.forEach(model => {
  console.log(`${model.name} - ${model.description}`);
});
```

### Settings Management

```typescript
import { SettingsManager } from './llm';

const settings = new SettingsManager();

// Get current configuration
const config = settings.getConfig();
console.log(`Active provider: ${config.provider}`);

// Validate configuration
const validation = settings.validateConfig();
if (!validation.valid) {
  console.error('Configuration errors:', validation.errors);
}

// Update settings
await settings.setProvider('ollama');
await settings.setOllamaModel('deepseek-coder:6.7b');

// Listen for changes
const disposable = settings.onConfigChange((newConfig) => {
  console.log('Config changed:', newConfig);
});
```

### Direct Provider Usage

```typescript
import { OllamaProvider, OpenRouterProvider } from './llm';

// Use Ollama directly
const ollama = new OllamaProvider({
  endpoint: 'http://localhost:11434',
  model: 'codellama:7b',
});

const available = await ollama.isAvailable();
if (available) {
  const response = await ollama.generateCompletion({
    prompt: 'Hello, world!',
  });
}

// Use OpenRouter directly
const openrouter = new OpenRouterProvider({
  apiKey: 'sk-or-v1-...',
  model: 'anthropic/claude-3.5-sonnet',
  siteUrl: 'https://myapp.com',
  siteName: 'My App',
});

const result = await openrouter.testConnection();
if (result.success) {
  console.log(`Connected! ${result.details?.modelsAvailable} models available`);
}
```

## Configuration

The system reads from VSCode workspace settings under `devark.llm.*`:

```json
{
  "devark.llm.activeProvider": "ollama",
  "devark.llm.providers": {
    "ollama": {
      "endpoint": "http://localhost:11434",
      "model": "codellama:7b"
    },
    "openrouter": {
      "model": "anthropic/claude-3.5-sonnet"
    }
  }
}
```

## Error Handling

All methods include comprehensive error handling:

```typescript
try {
  await llmManager.initialize();
} catch (error) {
  // Handles:
  // - Invalid configuration
  // - No providers configured
  // - Provider initialization failures
  console.error('Failed to initialize:', error.message);
}

// Completion errors return in response object
const response = await llmManager.generateCompletion({ prompt: '...' });
if (response.error) {
  console.error('Completion failed:', response.error);
  // Provider remains available for retry
}

// Streaming errors return in final chunk
for await (const chunk of llmManager.streamCompletion({ prompt: '...' })) {
  if (chunk.error) {
    console.error('Stream failed:', chunk.error);
  }
}
```

## Testing Recommendations

### Unit Tests
1. **Provider Tests**
   - Mock HTTP responses for Ollama/OpenRouter APIs
   - Test connection handling (success, timeout, auth failures)
   - Test streaming parser edge cases (incomplete JSON, malformed data)
   - Test cost calculation accuracy

2. **Settings Manager Tests**
   - Test configuration validation
   - Test VSCode settings integration
   - Test change listeners

3. **LLM Manager Tests**
   - Test provider initialization
   - Test provider switching
   - Test error propagation

### Integration Tests
1. **Ollama Integration**
   - Requires local Ollama installation
   - Test model listing
   - Test completion generation
   - Test streaming

2. **OpenRouter Integration**
   - Requires API key (use test account)
   - Test multiple models
   - Test rate limiting handling
   - Test cost tracking

### Example Test Structure

```typescript
import { OllamaProvider } from './providers/ollama-provider';

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'codellama:7b',
    });
  });

  it('should check availability', async () => {
    const available = await provider.isAvailable();
    expect(typeof available).toBe('boolean');
  });

  it('should handle connection failures gracefully', async () => {
    const badProvider = new OllamaProvider({
      endpoint: 'http://localhost:9999', // Wrong port
      model: 'codellama:7b',
    });

    const result = await badProvider.testConnection();
    expect(result.success).toBe(false);
    expect(result.error).toContain('connect');
  });

  // More tests...
});
```

## Design Decisions

### 1. Unified Interface
- **Rationale**: Abstract provider differences behind common interface
- **Trade-off**: Some provider-specific features not exposed
- **Benefit**: Easy to add new providers or switch between them

### 2. Async Generator for Streaming
- **Rationale**: Modern, memory-efficient streaming pattern
- **Trade-off**: Requires ES2018+ target
- **Benefit**: Natural backpressure handling, clean syntax

### 3. Error Objects in Responses
- **Rationale**: Non-throwing error handling for better UX
- **Trade-off**: Must check response.error field
- **Benefit**: Provider remains available after errors, easier retry logic

### 4. Singleton LLM Manager
- **Rationale**: Single source of truth for active provider
- **Trade-off**: Less flexible for complex scenarios
- **Benefit**: Simple API, shared state across extension

### 5. VSCode Settings Integration
- **Rationale**: Standard configuration mechanism for VSCode extensions
- **Trade-off**: Settings changes require UI interaction
- **Benefit**: User-familiar configuration, persistent across sessions

## Performance Considerations

1. **Connection Pooling**: Fetch API handles connection reuse
2. **Streaming**: Minimizes memory usage for large completions
3. **Lazy Initialization**: Providers created only when configured
4. **Cached Instances**: Provider instances cached in manager
5. **Timeout Handling**: All network requests have timeouts

## Security Considerations

1. **API Key Storage**: OpenRouter keys stored in VSCode settings (encrypted)
2. **Local-Only Ollama**: Default endpoint is localhost only
3. **No Credential Logging**: API keys never logged or exposed
4. **HTTPS for OpenRouter**: All cloud API calls use HTTPS
5. **Input Validation**: All user inputs validated before API calls
