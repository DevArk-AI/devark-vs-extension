# Auto-Analyze Implementation

## Overview
Integrated the existing CursorSessionReader with the V2 UI to automatically detect and analyze prompts from Cursor's SQLite database.

## Architecture

### Components

#### 1. AutoAnalyzeService (`src/services/AutoAnalyzeService.ts`)
**Purpose**: Core service that watches Cursor's database and automatically analyzes new prompts.

**Key Features**:
- Database watching via VS Code FileSystemWatcher
- Polling fallback (5-second intervals) for reliability
- In-memory session and prompt tracking
- Automatic prompt queuing and analysis
- Batch processing with configurable limits
- Retry mechanism for failed analyses
- Real-time UI updates via message handler

**Configuration**:
```typescript
{
  enabled: boolean;           // Enable/disable service
  pollInterval: 5000;         // ms between checks
  maxRetries: 3;              // max retries for failed analyses
  batchSize: 5;               // max prompts to analyze at once
}
```

**Workflow**:
1. Initialize CursorSessionReader (connects to Cursor's SQLite DB)
2. Start file watcher on database file
3. Start polling timer as fallback
4. On change: sync sessions, detect new prompts
5. Queue new prompts for analysis
6. Analyze prompts using PromptScorer and PromptEnhancer
7. Send results to webview
8. Update status bar with scores

**Edge Cases Handled**:
- ✅ Cursor not installed → Shows warning with install link
- ✅ Database locked → Skips check (normal, Cursor is using it)
- ✅ Multiple Cursor instances → Handles via session tracking
- ✅ File watcher fails → Falls back to polling
- ✅ Analysis fails → Retries up to maxRetries

#### 2. V2MessageHandler Integration (`src/panels/V2MessageHandler.ts`)
**Changes**:
- Added `autoAnalyzeService` field
- Initialize service in constructor
- Start/stop service in `handleToggleAutoAnalyze`
- Added `handleGetAutoAnalyzeStatus` for status queries
- Dispose service when handler is disposed

**New Message Types**:
- `toggleAutoAnalyze` - Start/stop auto-analyze
- `getAutoAnalyzeStatus` - Query current status

**Outbound Messages** (to webview):
- `autoAnalyzeStatus` - Service status update
- `newPromptsDetected` - New prompts found
- `promptAnalyzing` - Analysis started
- `analysisComplete` - Analysis finished
- `analysisFailed` - Analysis failed
- `autoAnalyzeError` - Service error

#### 3. MenuPanelV2 Integration (`src/panels/MenuPanelV2.ts`)
**Changes**:
- Added `getAutoAnalyzeStatus` to v2 message types list
- Override `dispose()` to clean up message handler (which disposes AutoAnalyzeService)

### Data Flow

```
Cursor DB Change
    ↓
FileSystemWatcher / Polling
    ↓
AutoAnalyzeService.handleDatabaseChange()
    ↓
CursorSessionReader.getActiveSessions()
    ↓
SessionTracker.syncWithDatabaseSessions()
    ↓
detectNewPrompts() (compares prompt counts)
    ↓
processNewPrompts() (creates PromptData objects)
    ↓
analyzePrompt() (uses PromptScorer + PromptEnhancer)
    ↓
V2MessageHandler.sendMessage() (notifies webview)
    ↓
StatusBarManager.addPromptScore() (updates status bar)
```

## Usage

### Enable Auto-Analyze
```typescript
// From webview
window.vscode.postMessage({
  type: 'toggleAutoAnalyze',
  data: { enabled: true }
});
```

### Query Status
```typescript
// From webview
window.vscode.postMessage({
  type: 'getAutoAnalyzeStatus'
});

// Response
{
  type: 'autoAnalyzeStatus',
  data: {
    isInitialized: boolean,
    isWatching: boolean,
    isAnalyzing: boolean,
    queueSize: number,
    totalSessions: number,
    activeSessions: number,
    totalPrompts: number
  }
}
```

### Listen for New Prompts
```typescript
// In webview
window.addEventListener('message', (event) => {
  const message = event.data;

  switch (message.type) {
    case 'newPromptsDetected':
      console.log(`${message.data.count} new prompts detected`);
      break;

    case 'analysisComplete':
      const { promptId, analysis } = message.data;
      console.log(`Analysis complete: score ${analysis.score}`);
      break;
  }
});
```

## Limitations & Future Improvements

### Current Limitations
1. **Mock Prompt Text**: Currently creates placeholder prompts because extracting actual prompt text from Cursor DB requires understanding the complete schema
2. **Session Detection**: Relies on prompt count changes, not actual prompt content inspection
3. **No Historical Analysis**: Only analyzes new prompts, doesn't backfill historical ones

### Future Improvements
1. **Extract Real Prompts**: Parse Cursor's `composerData` JSON to get actual user prompts and AI responses
2. **Smart Filtering**: Filter out trivial prompts (e.g., "yes", "ok", one-word responses)
3. **Batch Analysis**: Group related prompts in a session for context-aware analysis
4. **Historical Backfill**: Add command to analyze all historical prompts
5. **Performance**: Cache analysis results to avoid re-analyzing same prompts
6. **UI Integration**: Add auto-analyze toggle to V2 UI settings panel

## Testing

### Manual Testing Steps
1. Open VS Code with the extension
2. Enable auto-analyze: Open Vibe Log panel → Settings → Enable Auto-Analyze
3. Open Cursor in the same project
4. Make some prompts in Cursor Composer
5. Watch VS Code console for:
   - `[AutoAnalyze] Database changed, checking for new prompts...`
   - `[AutoAnalyze] Detected X new prompt(s)`
   - `[AutoAnalyze] Analyzing prompt...`
   - `[AutoAnalyze] Analysis complete...`
6. Check status bar: Should show updated prompt count and average score
7. Open Vibe Log panel: Should show analyzed prompts in history

### Debug Console Commands
```typescript
// Get service status
window.vscode.postMessage({ type: 'getAutoAnalyzeStatus' });

// Toggle auto-analyze
window.vscode.postMessage({ type: 'toggleAutoAnalyze', data: { enabled: true } });
```

## Files Changed
1. ✅ Created: `src/services/AutoAnalyzeService.ts` (492 lines)
2. ✅ Modified: `src/panels/V2MessageHandler.ts`
   - Added AutoAnalyzeService initialization
   - Added auto-analyze handlers
   - Added dispose method
3. ✅ Modified: `src/panels/MenuPanelV2.ts`
   - Added getAutoAnalyzeStatus to v2 message types
   - Added dispose override

## Dependencies
- `better-sqlite3` - Already installed (used by CursorSessionReader)
- `vscode` - Built-in
- Existing: `CursorSessionReader`, `SessionTracker`, `PromptScorer`, `PromptEnhancer`

## Configuration
Add to `package.json` settings:
```json
"vibelog.autoAnalyze": {
  "type": "boolean",
  "default": false,
  "description": "Automatically analyze prompts from Cursor"
}
```

## Build Success
✅ TypeScript compilation successful
✅ No errors or warnings
✅ All imports resolved
✅ Build output: `dist/extension.js` (308.2kb)
