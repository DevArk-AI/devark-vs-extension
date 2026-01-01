# Config Store Abstraction

Pluggable configuration storage for the LLM provider system. Decoupled from VSCode for testability and portability.

## Quick Start

### In VSCode Extension (Production)

```typescript
import { VSCodeConfigStore } from './config';
import { SettingsManager } from './settings-manager';

// Create settings manager with VSCode backend
const store = new VSCodeConfigStore();
const manager = new SettingsManager(store);

// Use as normal
const config = manager.getConfig();
await manager.setProvider('ollama');
```

### In Unit Tests

```typescript
import { FileConfigStore } from './config';
import { SettingsManager } from './settings-manager';
import * as path from 'path';
import * as os from 'os';

// Create settings manager with file backend
const configPath = path.join(os.tmpdir(), 'test.json');
const store = new FileConfigStore(configPath);
const manager = new SettingsManager(store);

// Pre-seed test configuration
await store.setAll({
  provider: 'ollama',
  'ollama.endpoint': 'http://localhost:11434',
  'ollama.model': 'codellama:7b'
});

// Run tests
const validation = manager.validateConfig();
expect(validation.valid).toBe(true);
```

## Available Implementations

### VSCodeConfigStore

**Where to use**: Production code, VSCode extension context

**Storage**: `.vscode/settings.json` under `vibelog.llm` namespace

**Features**:
- Integrates with VSCode settings UI
- Persists across sessions
- Workspace-level configuration
- Native change detection

**Example**:
```typescript
const store = new VSCodeConfigStore();
await store.set('provider', 'ollama');
const provider = store.get('provider', 'ollama');
```

### FileConfigStore

**Where to use**: Unit tests, CLI tools, server environments

**Storage**: JSON file at specified path

**Features**:
- No VSCode dependency
- Fast test execution
- Isolated test environments
- Atomic writes (corruption-safe)
- Auto-creates directories

**Example**:
```typescript
const store = new FileConfigStore('/tmp/config.json');
await store.set('provider', 'openrouter');
await store.set('openrouter.apiKey', 'sk-xxx');
```

## Core Interface

All implementations follow `IConfigStore`:

```typescript
interface IConfigStore {
  // Read a value with default fallback
  get<T>(key: string, defaultValue: T): T;

  // Read all configuration
  getAll(): Record<string, unknown>;

  // Update a single value
  set(key: string, value: unknown): Promise<void>;

  // Replace entire configuration
  setAll(config: Record<string, unknown>): Promise<void>;

  // Subscribe to changes
  onConfigChange(callback: (config: any) => void): Disposable;
}
```

## Common Patterns

### Test Setup/Teardown

```typescript
describe('LLM Tests', () => {
  let store: FileConfigStore;
  let manager: SettingsManager;
  let configPath: string;

  beforeEach(async () => {
    configPath = path.join(os.tmpdir(), `test-${Date.now()}.json`);
    store = new FileConfigStore(configPath);
    manager = new SettingsManager(store);

    // Pre-seed
    await store.setAll({
      provider: 'ollama',
      'ollama.endpoint': 'http://localhost:11434',
      'ollama.model': 'codellama:7b'
    });
  });

  afterEach(() => {
    const fs = require('fs');
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  it('works', () => {
    expect(manager.getProvider()).toBe('ollama');
  });
});
```

### Configuration Change Handling

```typescript
const store = new FileConfigStore('/tmp/config.json');

const subscription = store.onConfigChange((newConfig) => {
  console.log('Config updated:', newConfig);
});

// Make changes
await store.set('provider', 'openrouter');

// Cleanup when done
subscription.dispose();
```

### Atomic Updates

```typescript
// Update multiple settings atomically
await store.setAll({
  provider: 'ollama',
  'ollama.endpoint': 'http://localhost:11434',
  'ollama.model': 'codellama:13b'
});
```

## Creating Custom Implementations

Implement `IConfigStore` for your environment:

```typescript
import { IConfigStore, Disposable } from './config-store.interface';

export class CustomConfigStore implements IConfigStore {
  get<T>(key: string, defaultValue: T): T {
    // Your implementation
  }

  async set(key: string, value: unknown): Promise<void> {
    // Your implementation
  }

  getAll(): Record<string, unknown> {
    // Your implementation
  }

  async setAll(config: Record<string, unknown>): Promise<void> {
    // Your implementation
  }

  onConfigChange(callback: (config: any) => void): Disposable {
    // Your implementation
    return { dispose: () => {} };
  }
}
```

### Example: Environment Variables Store

```typescript
export class EnvConfigStore implements IConfigStore {
  private prefix = 'VIBELOG_LLM_';

  get<T>(key: string, defaultValue: T): T {
    const envKey = this.prefix + key.toUpperCase().replace(/\./g, '_');
    const value = process.env[envKey];
    return value !== undefined ? (value as unknown as T) : defaultValue;
  }

  async set(key: string, value: unknown): Promise<void> {
    const envKey = this.prefix + key.toUpperCase().replace(/\./g, '_');
    process.env[envKey] = String(value);
  }

  // ... implement other methods
}
```

## Configuration Keys Reference

### Top-level
- `provider`: Active provider type (e.g., 'ollama', 'openrouter')

### Ollama-specific
- `ollama.endpoint`: Ollama API endpoint
- `ollama.model`: Model name

### OpenRouter-specific
- `openrouter.apiKey`: API key
- `openrouter.model`: Model identifier
- `openrouter.siteUrl`: Optional site URL for ranking
- `openrouter.siteName`: Optional site name for ranking

## Testing Best Practices

1. **Use temp files**: Never reuse config files between tests
2. **Clean up**: Always delete test config files in `afterEach`
3. **Isolate**: Each test should have its own config file
4. **Pre-seed**: Set up initial state in `beforeEach`
5. **Validate**: Always check that config is valid before testing behavior

## Migration Guide

### Before (Tightly Coupled)
```typescript
import { SettingsManager } from './settings-manager';

const manager = new SettingsManager(); // VSCode-coupled
```

### After (Dependency Injection)
```typescript
import { SettingsManager } from './settings-manager';
import { VSCodeConfigStore } from './config';

const store = new VSCodeConfigStore();
const manager = new SettingsManager(store); // Explicit dependency
```

### In Tests
```typescript
import { SettingsManager } from './settings-manager';
import { FileConfigStore } from './config';

const store = new FileConfigStore('/tmp/test.json');
const manager = new SettingsManager(store); // No VSCode needed!
```

## Troubleshooting

### FileConfigStore: "ENOENT: no such file or directory"

The directory doesn't exist. FileConfigStore auto-creates directories on write, but not on read.

**Solution**: Use `setAll()` or `set()` before reading, or manually create the file:
```typescript
const fs = require('fs');
fs.writeFileSync(configPath, '{}', 'utf8');
```

### VSCodeConfigStore: "Cannot read properties of undefined"

Not in VSCode extension context.

**Solution**: Use `FileConfigStore` for tests:
```typescript
const store = new FileConfigStore('/tmp/test.json');
```

### Config changes not detected

File watcher may not be set up correctly.

**Solution**: Ensure the file exists before watching:
```typescript
// Create file first
await store.set('provider', 'ollama');

// Then subscribe
const sub = store.onConfigChange(() => { ... });
```

## Examples

See `test-examples.ts` for comprehensive usage examples:
- Basic FileConfigStore usage
- SettingsManager integration
- Configuration change handling
- Pre-seeding configurations
- Unit test patterns
- Invalid configuration testing
- Cleanup patterns

## Architecture Benefits

- **Testability**: No VSCode extension host required
- **Portability**: Run in CLI, server, other editors
- **Flexibility**: Swap backends without code changes
- **Isolation**: Each test has independent config
- **Type Safety**: Full TypeScript support
- **Simplicity**: Clean, focused interface

## See Also

- `config-store.interface.ts` - Core interface definition
- `vscode-config-store.ts` - VSCode implementation
- `file-config-store.ts` - File-based implementation
- `test-examples.ts` - Comprehensive examples
- `../settings-manager.ts` - Consumer of IConfigStore
