# VSCode Adapters

This directory contains adapter functions that wrap VSCode APIs to provide a consistent interface for UI interactions throughout the extension.

## Purpose

These adapters replace CLI-based interactive UI elements (like inquirer prompts, ora spinners) with native VSCode UI components. This allows the extension to provide a seamless user experience within the IDE.

## Quick Reference

### Selection Dialogs

```typescript
// Single selection
const tool = await showQuickPick(
  [
    { label: 'Option 1', value: 'opt1', description: 'First option' },
    { label: 'Option 2', value: 'opt2', description: 'Second option' }
  ],
  { title: 'Select Option', placeHolder: 'Choose one' }
);

// Multiple selection
const projects = await showMultiSelect(
  [
    { label: 'Project A', value: 'proj-a' },
    { label: 'Project B', value: 'proj-b' }
  ],
  { title: 'Select Projects', placeHolder: 'Choose one or more' }
);
```

### Input Dialogs

```typescript
// Text input
const name = await showInputBox({
  prompt: 'Enter your name',
  placeHolder: 'John Doe'
});

// Password input
const apiKey = await showInputBox({
  prompt: 'Enter API key',
  password: true
});

// Input with validation
const email = await showInputBox({
  prompt: 'Enter email',
  placeHolder: 'user@example.com',
  validateInput: (value) => {
    return value.includes('@') ? undefined : 'Invalid email';
  }
});
```

### Date Selection

```typescript
// Single date
const date = await showDatePicker({
  title: 'Select Date'
});

// Date range
const range = await showDatePicker({
  title: 'Select Date Range',
  allowRange: true
});
// Returns: { start: Date, end?: Date }
```

### Progress & Notifications

```typescript
// Progress notification
const result = await showProgress('Uploading sessions', async (progress) => {
  progress.report({ message: 'Step 1...', increment: 25 });
  await step1();
  progress.report({ message: 'Step 2...', increment: 25 });
  await step2();
  progress.report({ increment: 50 });
  return await final();
});

// Simple notifications
showNotification('Success!', 'info');
showNotification('Warning: Check settings', 'warning');
showNotification('Error occurred', 'error');
```

### Confirmations

```typescript
// Yes/No confirmation
const confirmed = await showConfirmation(
  'Delete 10 items?',
  'This action cannot be undone'
);

// Yes/No/Cancel
const answer = await showYesNoCancel(
  'Save changes?',
  'You have unsaved modifications'
);
// Returns: 'yes' | 'no' | 'cancel'
```

### File System

```typescript
// Get workspace folder
const workspace = getWorkspaceFolder();

// File picker
const files = await showFileDialog({
  canSelectFiles: true,
  canSelectMany: true,
  title: 'Select files'
});

// Folder picker
const folders = await showFileDialog({
  canSelectFolders: true,
  canSelectMany: false,
  title: 'Select project folder'
});
```

### Clipboard & External

```typescript
// Copy to clipboard
const success = await copyToClipboard('Text to copy');

// Read from clipboard
const text = await readFromClipboard();

// Open URL in browser
const opened = await openExternal('https://vibe-log.dev');
```

### Logging

```typescript
// Create output channel
const logger = createOutputChannel('Vibe Log');
logger.appendLine('Extension started');
logger.appendLine('Processing...');
logger.show(); // Show the output panel
```

## Error Handling

All adapters handle errors gracefully:

- Return `undefined` on cancellation or error (except where specified)
- Log errors to console with function name prefix
- Never throw exceptions to caller (except `showProgress`)
- Provide safe defaults for edge cases

## TypeScript Support

All functions are fully typed:

```typescript
// Generic type support
const value: 'opt1' | 'opt2' | undefined = await showQuickPick<'opt1' | 'opt2'>([...]);

// Type inference works
const values = await showMultiSelect([...]); // string[] | undefined

// Async return types
const date: { start: Date; end?: Date } | undefined = await showDatePicker({...});
```

## Best Practices

1. Always check for `undefined` return values (user may cancel)
2. Use `ignoreFocusOut: true` for important dialogs (already set by default)
3. Provide clear placeholder text and titles
4. Validate input when using `showInputBox`
5. Report progress in reasonable increments (avoid too many updates)
6. Use appropriate notification types (info/warning/error)

## File Locations

- Main implementation: `vscode-adapters.ts`
- This guide: `README.md`
- Summary: `../../ADAPTERS_IMPLEMENTATION_SUMMARY.md`

## See Also

- [VSCode Extension API Documentation](https://code.visualstudio.com/api)
- [VSCode Window API](https://code.visualstudio.com/api/references/vscode-api#window)
- [VSCode Workspace API](https://code.visualstudio.com/api/references/vscode-api#workspace)
