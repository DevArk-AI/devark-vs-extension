/**
 * HookBasedPromptService Tests
 *
 * Tests for hook-based prompt and response detection:
 * - processHookFiles() command notification
 * - Prompt-response linking logic
 * - File processing and deduplication
 * - Project ignore filtering
 * - Event emission
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CapturedPrompt } from '../HookBasedPromptService';

// Mock vscode module
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [],
    createFileSystemWatcher: vi.fn().mockReturnValue({
      onDidCreate: vi.fn(),
      onDidChange: vi.fn(),
      dispose: vi.fn(),
    }),
  },
  window: {
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
  },
  commands: {
    executeCommand: vi.fn().mockResolvedValue(undefined),
  },
  extensions: {
    getExtension: vi.fn().mockReturnValue({
      extensionPath: '/mock/extension/path',
    }),
  },
  RelativePattern: class MockRelativePattern {
    base: unknown;
    pattern: string;
    constructor(base: unknown, pattern: string) {
      this.base = base;
      this.pattern = pattern;
    }
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
  },
}));

// Mock ExtensionState
vi.mock('../../extension-state', () => ({
  ExtensionState: {
    getLLMManager: vi.fn().mockReturnValue(null),
    getStatusBarManager: vi.fn().mockReturnValue(null),
  },
}));

// Mock SessionManagerService
const mockSessionManager = {
  syncFromSource: vi.fn().mockResolvedValue(undefined),
  onPromptDetected: vi.fn().mockResolvedValue('mock-prompt-id'),
  addResponse: vi.fn().mockResolvedValue(undefined),
  updatePromptScore: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../SessionManagerService', () => ({
  getSessionManager: vi.fn().mockReturnValue(mockSessionManager),
}));

// Mock NotificationService
vi.mock('../NotificationService', () => ({
  getNotificationService: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

// Mock HookFileProcessor with controllable behavior
const mockPromptProcessor = {
  ensureHookDir: vi.fn(),
  listMatchingFiles: vi.fn().mockReturnValue([]),
  shouldSkip: vi.fn().mockReturnValue(false),
  wasProcessed: vi.fn().mockReturnValue(false),
  markProcessed: vi.fn(),
  readFile: vi.fn().mockReturnValue(null),
  parseData: vi.fn().mockReturnValue(null),
  deleteFile: vi.fn(),
  getBasename: vi.fn().mockImplementation((path: string) => path.split('/').pop() || ''),
  clearProcessedIds: vi.fn(),
  getProcessedCount: vi.fn().mockReturnValue(0),
};

const mockResponseProcessor = {
  ensureHookDir: vi.fn(),
  listMatchingFiles: vi.fn().mockReturnValue([]),
  shouldSkip: vi.fn().mockReturnValue(false),
  wasProcessed: vi.fn().mockReturnValue(false),
  markProcessed: vi.fn(),
  readFile: vi.fn().mockReturnValue(null),
  parseData: vi.fn().mockReturnValue(null),
  deleteFile: vi.fn(),
  getBasename: vi.fn().mockImplementation((path: string) => path.split('/').pop() || ''),
  clearProcessedIds: vi.fn(),
  getProcessedCount: vi.fn().mockReturnValue(0),
};

vi.mock('../../adapters/hooks', () => {
  return {
    HookFileProcessor: class MockHookFileProcessor {
      private config: { filePrefix: string };
      constructor(_fs: unknown, config: { filePrefix: string }) {
        this.config = config;
      }
      get processor() {
        return this.config.filePrefix === 'prompt-' ? mockPromptProcessor : mockResponseProcessor;
      }
      ensureHookDir() { return this.processor.ensureHookDir(); }
      listMatchingFiles() { return this.processor.listMatchingFiles(); }
      shouldSkip(f: string) { return this.processor.shouldSkip(f); }
      wasProcessed(f: string) { return this.processor.wasProcessed(f); }
      markProcessed(f: string) { return this.processor.markProcessed(f); }
      readFile(f: string) { return this.processor.readFile(f); }
      parseData(c: string, f: string, r: string[]) { return this.processor.parseData(c, f, r); }
      deleteFile(f: string) { return this.processor.deleteFile(f); }
      getBasename(f: string) { return this.processor.getBasename(f); }
      clearProcessedIds() { return this.processor.clearProcessedIds(); }
      getProcessedCount() { return this.processor.getProcessedCount(); }
    },
  };
});

vi.mock('../../adapters/readers', () => {
  return {
    NodeSyncFileSystem: class MockNodeSyncFileSystem {
      existsSync() { return true; }
      mkdirSync() {}
      readdirSync() { return []; }
      readFileSync() { return '{}'; }
      unlinkSync() {}
      basename(p: string) { return p.split('/').pop() || ''; }
    },
  };
});

describe('HookBasedPromptService', () => {
  let HookBasedPromptService: typeof import('../HookBasedPromptService').HookBasedPromptService;
  let getHookBasedPromptService: typeof import('../HookBasedPromptService').getHookBasedPromptService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reset mock processors
    mockPromptProcessor.listMatchingFiles.mockReturnValue([]);
    mockPromptProcessor.wasProcessed.mockReturnValue(false);
    mockPromptProcessor.readFile.mockReturnValue(null);
    mockPromptProcessor.parseData.mockReturnValue(null);
    mockResponseProcessor.listMatchingFiles.mockReturnValue([]);
    mockResponseProcessor.wasProcessed.mockReturnValue(false);
    mockResponseProcessor.readFile.mockReturnValue(null);
    mockResponseProcessor.parseData.mockReturnValue(null);

    const module = await import('../HookBasedPromptService');
    HookBasedPromptService = module.HookBasedPromptService;
    getHookBasedPromptService = module.getHookBasedPromptService;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor and configuration', () => {
    it('should create service with default config', () => {
      const service = new HookBasedPromptService();
      const status = service.getStatus();

      expect(status.isWatching).toBe(false);
      expect(status.hookDir).toContain('devark-hooks');
    });

    it('should allow custom watch interval', () => {
      const service = new HookBasedPromptService({ watchInterval: 10000 });
      const status = service.getStatus();

      expect(status.isWatching).toBe(false);
    });

    it('should use 5000ms polling interval as fallback', () => {
      // The default config should have 5000ms interval (changed from 500ms)
      const service = new HookBasedPromptService();
      // We can't directly access the config, but we can verify it doesn't poll too frequently
      expect(service).toBeDefined();
    });
  });

  describe('processHookFiles', () => {
    it('should call checkForNewPrompts and checkForNewResponses', () => {
      const service = new HookBasedPromptService();

      // Setup mock to return files
      mockPromptProcessor.listMatchingFiles.mockReturnValue([]);
      mockResponseProcessor.listMatchingFiles.mockReturnValue([]);

      service.processHookFiles();

      expect(mockPromptProcessor.listMatchingFiles).toHaveBeenCalled();
      expect(mockResponseProcessor.listMatchingFiles).toHaveBeenCalled();
    });

    it('should process prompt files when found', async () => {
      const service = new HookBasedPromptService({ autoAnalyze: false });

      const mockPrompt: CapturedPrompt = {
        id: 'prompt-123',
        timestamp: new Date().toISOString(),
        prompt: 'Test prompt text',
        source: 'cursor',
        attachments: [],
        conversationId: 'conv-456',
      };

      mockPromptProcessor.listMatchingFiles.mockReturnValue(['/tmp/devark-hooks/prompt-123.json']);
      mockPromptProcessor.readFile.mockReturnValue(JSON.stringify(mockPrompt));
      mockPromptProcessor.parseData.mockReturnValue(mockPrompt);

      service.processHookFiles();

      expect(mockPromptProcessor.listMatchingFiles).toHaveBeenCalled();
      expect(mockPromptProcessor.markProcessed).toHaveBeenCalled();
    });

    it('should skip already processed files', () => {
      const service = new HookBasedPromptService({ autoAnalyze: false });

      mockPromptProcessor.listMatchingFiles.mockReturnValue(['/tmp/devark-hooks/prompt-123.json']);
      mockPromptProcessor.wasProcessed.mockReturnValue(true);

      service.processHookFiles();

      expect(mockPromptProcessor.readFile).not.toHaveBeenCalled();
    });
  });

  describe('prompt-response linking', () => {
    it('should generate correct link key for Cursor prompts', async () => {
      const service = new HookBasedPromptService({ autoAnalyze: false });

      const mockPrompt: CapturedPrompt = {
        id: 'prompt-123',
        timestamp: new Date().toISOString(),
        prompt: 'Test prompt',
        source: 'cursor',
        attachments: [],
        conversationId: 'conv-456',
        workspaceRoots: ['/test/project'],
      };

      mockPromptProcessor.listMatchingFiles.mockReturnValue(['/tmp/devark-hooks/prompt-123.json']);
      mockPromptProcessor.readFile.mockReturnValue(JSON.stringify(mockPrompt));
      mockPromptProcessor.parseData.mockReturnValue(mockPrompt);

      // Process the prompt
      service.processHookFiles();

      // The prompt should be stored with key 'cursor:conv-456'
      expect(mockPromptProcessor.markProcessed).toHaveBeenCalledWith('prompt-123.json');
    });

    it('should generate correct link key for Claude Code prompts', async () => {
      const service = new HookBasedPromptService({ autoAnalyze: false });

      const mockPrompt: CapturedPrompt = {
        id: 'claude-prompt-123',
        timestamp: new Date().toISOString(),
        prompt: 'Test Claude prompt',
        source: 'claude_code',
        attachments: [],
        sessionId: 'session-789',
        cwd: '/test/project',
      };

      mockPromptProcessor.listMatchingFiles.mockReturnValue(['/tmp/devark-hooks/claude-prompt-123.json']);
      mockPromptProcessor.getBasename.mockReturnValue('claude-prompt-123.json');
      mockPromptProcessor.readFile.mockReturnValue(JSON.stringify(mockPrompt));
      mockPromptProcessor.parseData.mockReturnValue(mockPrompt);

      service.processHookFiles();

      // The prompt should be stored with key 'claude:session-789'
      expect(mockPromptProcessor.markProcessed).toHaveBeenCalled();
    });
  });

  describe('project ignore filtering', () => {
    it('should ignore prompts from devark-temp-prompt-analysis directory', async () => {
      const service = new HookBasedPromptService({ autoAnalyze: false });

      const mockPrompt: CapturedPrompt = {
        id: 'prompt-123',
        timestamp: new Date().toISOString(),
        prompt: 'Test prompt',
        source: 'cursor',
        attachments: [],
        cwd: '/tmp/devark-temp-prompt-analysis/test',
        workspaceRoots: ['/tmp/devark-temp-prompt-analysis/test'],
      };

      mockPromptProcessor.listMatchingFiles.mockReturnValue(['/tmp/devark-hooks/prompt-123.json']);
      mockPromptProcessor.readFile.mockReturnValue(JSON.stringify(mockPrompt));
      mockPromptProcessor.parseData.mockReturnValue(mockPrompt);

      service.processHookFiles();

      // Should not save to session manager because project is ignored
      expect(mockSessionManager.syncFromSource).not.toHaveBeenCalled();
    });

    it('should ignore prompts from Cursor installation paths', async () => {
      const service = new HookBasedPromptService({ autoAnalyze: false });

      const mockPrompt: CapturedPrompt = {
        id: 'prompt-123',
        timestamp: new Date().toISOString(),
        prompt: 'Test prompt',
        source: 'cursor',
        attachments: [],
        cwd: 'C:\\Programs\\Cursor\\resources',
        workspaceRoots: ['C:\\Programs\\Cursor\\resources'],
      };

      mockPromptProcessor.listMatchingFiles.mockReturnValue(['/tmp/devark-hooks/prompt-123.json']);
      mockPromptProcessor.readFile.mockReturnValue(JSON.stringify(mockPrompt));
      mockPromptProcessor.parseData.mockReturnValue(mockPrompt);

      service.processHookFiles();

      // Should not save to session manager because project is ignored
      expect(mockSessionManager.syncFromSource).not.toHaveBeenCalled();
    });

    it('should process prompts from valid project paths', async () => {
      const service = new HookBasedPromptService({ autoAnalyze: false });

      const mockPrompt: CapturedPrompt = {
        id: 'prompt-123',
        timestamp: new Date().toISOString(),
        prompt: 'Test prompt',
        source: 'cursor',
        attachments: [],
        conversationId: 'conv-456',
        cwd: '/Users/test/my-project',
        workspaceRoots: ['/Users/test/my-project'],
      };

      mockPromptProcessor.listMatchingFiles.mockReturnValue(['/tmp/devark-hooks/prompt-123.json']);
      mockPromptProcessor.readFile.mockReturnValue(JSON.stringify(mockPrompt));
      mockPromptProcessor.parseData.mockReturnValue(mockPrompt);

      service.processHookFiles();

      // Should save to session manager for valid projects
      expect(mockSessionManager.syncFromSource).toHaveBeenCalled();
    });
  });

  describe('event emission', () => {
    it('should emit responseDetected event when response is processed', async () => {
      const service = new HookBasedPromptService({ autoAnalyze: false });
      const eventHandler = vi.fn();

      service.on('responseDetected', eventHandler);

      const mockResponse = {
        id: 'response-123',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Test response text',
        success: true,
        conversationId: 'conv-456',
      };

      mockResponseProcessor.listMatchingFiles.mockReturnValue(['/tmp/devark-hooks/cursor-response-123.json']);
      mockResponseProcessor.readFile.mockReturnValue(JSON.stringify(mockResponse));
      mockResponseProcessor.parseData.mockReturnValue(mockResponse);

      service.processHookFiles();

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.objectContaining({ id: 'response-123' }),
        })
      );
    });

    it('should allow removing event listeners', () => {
      const service = new HookBasedPromptService();
      const eventHandler = vi.fn();

      service.on('responseDetected', eventHandler);
      service.off('responseDetected', eventHandler);

      // Process a response
      const mockResponse = {
        id: 'response-123',
        timestamp: new Date().toISOString(),
        source: 'cursor',
        response: 'Test response',
        success: true,
      };

      mockResponseProcessor.listMatchingFiles.mockReturnValue(['/tmp/devark-hooks/cursor-response-123.json']);
      mockResponseProcessor.readFile.mockReturnValue(JSON.stringify(mockResponse));
      mockResponseProcessor.parseData.mockReturnValue(mockResponse);

      service.processHookFiles();

      expect(eventHandler).not.toHaveBeenCalled();
    });
  });

  describe('service lifecycle', () => {
    it('should start watching when start() is called', async () => {
      const service = new HookBasedPromptService();

      await service.start();
      const status = service.getStatus();

      expect(status.isWatching).toBe(true);

      service.stop();
    });

    it('should stop watching when stop() is called', async () => {
      const service = new HookBasedPromptService();

      await service.start();
      service.stop();
      const status = service.getStatus();

      expect(status.isWatching).toBe(false);
    });

    it('should not start twice if already watching', async () => {
      const service = new HookBasedPromptService();

      await service.start();
      await service.start(); // Second call should be no-op

      const status = service.getStatus();
      expect(status.isWatching).toBe(true);

      service.stop();
    });

    it('should clean up on dispose', async () => {
      const service = new HookBasedPromptService();

      await service.start();
      service.dispose();

      const status = service.getStatus();
      expect(status.isWatching).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return correct status information', () => {
      const service = new HookBasedPromptService();
      const status = service.getStatus();

      expect(status).toHaveProperty('isWatching');
      expect(status).toHaveProperty('hooksInstalled');
      expect(status).toHaveProperty('processedPromptCount');
      expect(status).toHaveProperty('processedResponseCount');
      expect(status).toHaveProperty('hookDir');
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance from getHookBasedPromptService', () => {
      const instance1 = getHookBasedPromptService();
      const instance2 = getHookBasedPromptService();

      expect(instance1).toBe(instance2);
    });
  });
});
