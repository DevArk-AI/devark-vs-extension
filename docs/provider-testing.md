# LLM Provider Testing Infrastructure

## Overview

The extension includes comprehensive end-to-end testing utilities for verifying LLM provider integration. This ensures that all providers work correctly with the prompt analysis and enhancement features.

## Components

### 1. ProviderE2ETester (`src/test/provider-e2e-test.ts`)

Core testing utility that validates:
- **Connection Testing**: Verifies provider is accessible and responding
- **Prompt Scoring**: Tests PromptScorer integration with the provider
- **Prompt Enhancement**: Tests PromptEnhancer integration with the provider

### 2. VS Code Command (`vibelog.testProviders`)

Command registered in `extension.ts` that:
- Tests all configured providers
- Shows progress notifications
- Displays results in a new text document or output channel
- Provides detailed pass/fail information

### 3. UI Integration (Settings View)

The SettingsView component includes a "Test Connection" button that:
- Triggers provider testing from the webview
- Shows real-time progress
- Displays test results inline

## Usage

### From Command Palette

1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Type "Vibe Log: Test All LLM Providers"
3. View progress notification
4. Choose to view detailed results or output

### From Settings UI

1. Open Vibe Log menu panel
2. Navigate to Settings
3. Click "Test Connection" button next to LLM Provider section
4. View test results in the UI

### Programmatic Usage

```typescript
import { ProviderE2ETester } from './test/provider-e2e-test';
import { LLMManager } from './llm/llm-manager';

// Create tester
const llmManager = new LLMManager();
await llmManager.initialize();
const tester = new ProviderE2ETester(llmManager);

// Test all providers
const summary = await tester.testAllProviders({
  connectionOnly: false,
  onProgress: (message, percentage) => {
    console.log(`${percentage}%: ${message}`);
  }
});

// View results
console.log(ProviderE2ETester.formatSummary(summary));

// Test specific provider
const result = await tester.testProvider('ollama');
console.log(ProviderE2ETester.formatProviderResult(result));
```

## Test Results Structure

### ProviderTestSummary

```typescript
{
  totalProviders: number;        // Total providers available
  testedProviders: number;       // Providers that were tested
  passedProviders: number;       // Providers that passed all tests
  failedProviders: number;       // Providers that failed any test
  totalDuration: number;         // Total time in milliseconds
  results: ProviderTestResult[]; // Individual provider results
  timestamp: Date;               // When tests were run
}
```

### ProviderTestResult

```typescript
{
  providerId: string;           // Provider identifier
  providerName: string;         // Display name
  timestamp: Date;              // When test was run

  connectionTest: {
    passed: boolean;
    duration: number;           // Milliseconds
    error?: string;
    details?: {
      version?: string;
      modelsAvailable?: number;
      endpoint?: string;
    };
  };

  promptScoring?: {
    passed: boolean;
    duration: number;
    error?: string;
    result?: {
      overall: number;          // 0-100
      clarity: number;          // 0-10
      specificity: number;      // 0-10
      context: number;          // 0-10
      actionability: number;    // 0-10
      suggestions: string[];
    };
  };

  promptEnhancement?: {
    passed: boolean;
    duration: number;
    error?: string;
    result?: {
      original: string;
      enhanced: string;
      improvements: string[];
    };
  };
}
```

## Test Stages

### 1. Connection Test
- Verifies provider is accessible
- Checks API key validity (for cloud providers)
- Retrieves version/model information
- **Duration**: ~1-5 seconds

### 2. Prompt Scoring Test
- Uses PromptScorer with test prompt
- Validates score structure and ranges
- Checks suggestion generation
- **Duration**: ~5-30 seconds (depends on provider speed)

### 3. Prompt Enhancement Test
- Uses PromptEnhancer with test prompt
- Validates enhancement structure
- Ensures prompt was actually enhanced
- **Duration**: ~5-30 seconds (depends on provider speed)

## Error Handling

The testing infrastructure handles:

### Missing Configuration
- **Issue**: Provider not configured
- **Response**: Skips provider with clear message
- **User Action**: Configure provider in settings

### Network Failures
- **Issue**: Cannot reach provider endpoint
- **Response**: Connection test fails with timeout/connection error
- **User Action**: Check network, verify endpoint URL

### API Key Issues
- **Issue**: Invalid or missing API key
- **Response**: Connection test fails with authentication error
- **User Action**: Update API key in VS Code secrets

### Rate Limiting
- **Issue**: Too many requests to cloud provider
- **Response**: Test fails with rate limit error
- **User Action**: Wait and retry, or upgrade API plan

### Invalid Responses
- **Issue**: Provider returns malformed data
- **Response**: Parsing error in test result
- **User Action**: Check provider compatibility

## Performance Considerations

### Ollama (Local)
- **Connection**: < 1 second
- **Scoring**: 10-60 seconds (CPU-dependent)
- **Enhancement**: 10-60 seconds (CPU-dependent)
- **Total**: ~20-120 seconds

### OpenRouter (Cloud)
- **Connection**: < 2 seconds
- **Scoring**: 3-10 seconds
- **Enhancement**: 3-10 seconds
- **Total**: ~6-20 seconds

### Claude Code CLI
- **Connection**: < 1 second
- **Scoring**: 5-15 seconds
- **Enhancement**: 5-15 seconds
- **Total**: ~10-30 seconds

### Cursor CLI
- **Connection**: < 1 second
- **Scoring**: 5-15 seconds (requires CURSOR_API_KEY)
- **Enhancement**: 5-15 seconds
- **Total**: ~10-30 seconds

## Best Practices

### When to Run Tests

1. **After Initial Setup**: Verify provider configuration works
2. **After Configuration Changes**: Ensure new settings are valid
3. **When Switching Providers**: Confirm new provider is accessible
4. **Before Critical Work**: Ensure copilot features are functional
5. **Troubleshooting**: Diagnose connection or functionality issues

### Interpreting Results

#### All Tests Pass ✓
- Provider is fully functional
- Copilot features will work as expected
- Safe to use for prompt analysis

#### Connection Fails ✗
- Provider is not accessible
- Check network/endpoint configuration
- Verify API keys if required

#### Scoring/Enhancement Fails ✗
- Connection works but functionality doesn't
- May be provider-specific issue
- Check provider compatibility

### Test Options

```typescript
interface TestOptions {
  // Only test connection, skip functional tests
  connectionOnly?: boolean;

  // Skip connection test, only test functionality
  skipConnection?: boolean;

  // Timeout for each test in milliseconds
  timeout?: number;

  // Custom test prompt (default: "Add error handling to the login function")
  testPrompt?: string;

  // Progress callback for real-time updates
  onProgress?: (message: string, progress?: number) => void;
}
```

## Troubleshooting

### Test Hangs or Times Out

**Symptoms**: Test never completes or shows timeout error

**Solutions**:
1. Check if provider is running (Ollama)
2. Verify network connectivity (cloud providers)
3. Increase timeout in test options
4. Check system resources (CPU/memory for local models)

### Inconsistent Results

**Symptoms**: Tests pass sometimes but fail other times

**Solutions**:
1. Check for rate limiting (cloud providers)
2. Verify stable network connection
3. Ensure provider has sufficient resources
4. Check for background tasks affecting performance

### All Providers Fail

**Symptoms**: No providers pass connection test

**Solutions**:
1. Verify at least one provider is configured
2. Check VS Code settings under `vibelog.llm`
3. Restart VS Code
4. Check extension logs for initialization errors

## Integration with Copilot Features

The testing infrastructure validates that providers work with:

### PromptScorer
- Analyzes prompt quality
- Provides 4-dimensional scoring
- Generates improvement suggestions
- **Validates**: JSON parsing, score ranges, suggestion generation

### PromptEnhancer
- Improves prompt clarity and specificity
- Supports 3 enhancement levels
- Explains improvements made
- **Validates**: JSON parsing, actual enhancement, improvement tracking

## Future Enhancements

Planned improvements to the testing infrastructure:

1. **Batch Testing**: Test multiple prompts in sequence
2. **Performance Benchmarks**: Track and compare provider speeds
3. **Cost Tracking**: Estimate API costs per test
4. **Historical Results**: Store and compare test results over time
5. **Automated Testing**: CI/CD integration for provider validation
6. **Detailed Metrics**: Token usage, response time percentiles
7. **Custom Test Suites**: User-defined test prompts and validations

## API Reference

### ProviderE2ETester

```typescript
class ProviderE2ETester {
  constructor(llmManager: LLMManager);

  // Test all configured providers
  async testAllProviders(options?: TestOptions): Promise<ProviderTestSummary>;

  // Test specific provider
  async testProvider(
    providerId: LLMProviderType,
    options?: Omit<TestOptions, 'onProgress' | 'testPrompt'>
  ): Promise<ProviderTestResult>;

  // Format test summary as readable text
  static formatSummary(summary: ProviderTestSummary): string;

  // Format single provider result as readable text
  static formatProviderResult(result: ProviderTestResult): string;
}
```

### Message Handler (V2MessageHandler)

```typescript
// Test all providers (triggers vibelog.testProviders command)
postMessage('testProviders')

// Test specific provider with real-time progress
postMessage('testProvider', { providerId: 'ollama' })

// Receive test results
onMessage('testResults', (data) => {
  // data.success: boolean
  // data.results: ProviderTestResults
  // data.error?: string
})

// Receive single provider result
onMessage('testProviderResult', (data) => {
  // data.providerId: string
  // data.success: boolean
  // data.connectionDetails?: object
  // data.scoringTest?: object
  // data.enhancementTest?: object
  // data.error?: string
})

// Receive progress updates
onMessage('testProviderProgress', (data) => {
  // data.providerId: string
  // data.stage: 'connection' | 'scoring' | 'enhancement'
  // data.message: string
})
```

## Examples

### Test All Providers with Progress

```typescript
await vscode.commands.executeCommand('vibelog.testProviders');
```

### Test Specific Provider Programmatically

```typescript
const tester = new ProviderE2ETester(llmManager);
const result = await tester.testProvider('ollama', {
  connectionOnly: false
});

if (result.connectionTest.passed) {
  console.log('✓ Connection successful');
  if (result.promptScoring?.passed) {
    console.log('✓ Prompt scoring works');
  }
  if (result.promptEnhancement?.passed) {
    console.log('✓ Prompt enhancement works');
  }
} else {
  console.error('✗ Connection failed:', result.connectionTest.error);
}
```

### Connection-Only Fast Test

```typescript
const summary = await tester.testAllProviders({
  connectionOnly: true
});

console.log(`${summary.passedProviders}/${summary.totalProviders} providers available`);
```

### Custom Test Prompt

```typescript
const summary = await tester.testAllProviders({
  testPrompt: 'Refactor the authentication module to use JWT tokens'
});
```

## Support

For issues with the testing infrastructure:

1. Check extension logs in VS Code Output panel
2. Review provider-specific documentation
3. Verify VS Code settings under `vibelog.llm`
4. Open an issue on GitHub with test results

---

**Last Updated**: 2025-12-02
**Version**: 0.1.0
