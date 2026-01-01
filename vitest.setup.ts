import { vi } from 'vitest';

// Mock vscode module for tests that import VS Code-dependent code
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
      update: vi.fn(),
      has: vi.fn(),
      inspect: vi.fn(),
    })),
    workspaceFolders: [],
    onDidChangeConfiguration: vi.fn(),
  },
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      append: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    })),
    withProgress: vi.fn(),
  },
  commands: {
    registerCommand: vi.fn(),
    executeCommand: vi.fn(),
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, path })),
    parse: vi.fn((uri: string) => ({ fsPath: uri, path: uri })),
  },
  EventEmitter: vi.fn(() => ({
    event: vi.fn(),
    fire: vi.fn(),
    dispose: vi.fn(),
  })),
  Disposable: {
    from: vi.fn(),
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  ProgressLocation: {
    Notification: 15,
    SourceControl: 1,
    Window: 10,
  },
}));
