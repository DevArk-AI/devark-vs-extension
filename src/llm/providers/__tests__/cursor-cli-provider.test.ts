/**
 * CursorCLIProvider Unit Tests
 *
 * Tests for Cursor CLI provider including:
 * - Model listing with dynamic fetch
 * - Fallback to static models when CLI fails
 * - Parsing various model output formats
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { CursorCLIProvider } from '../cursor-cli-provider';
import type { ModelInfo } from '../../types';

// Mock child_process spawn
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock command-utils to always return true for isCommandAvailable
vi.mock('../../command-utils', () => ({
  isCommandAvailable: vi.fn().mockResolvedValue(true),
}));

const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;

/**
 * Helper to create a mock child process
 */
function createMockChildProcess(options: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: Error;
}) {
  const stdoutHandlers: ((data: Buffer) => void)[] = [];
  const stderrHandlers: ((data: Buffer) => void)[] = [];
  const errorHandlers: ((error: Error) => void)[] = [];
  const exitHandlers: ((code: number | null) => void)[] = [];

  const mockChild = {
    stdout: {
      on: vi.fn((event: string, handler: (data: Buffer) => void) => {
        if (event === 'data') stdoutHandlers.push(handler);
      }),
    },
    stderr: {
      on: vi.fn((event: string, handler: (data: Buffer) => void) => {
        if (event === 'data') stderrHandlers.push(handler);
      }),
    },
    on: vi.fn((event: string, handler: unknown) => {
      if (event === 'error') errorHandlers.push(handler as (error: Error) => void);
      if (event === 'exit') exitHandlers.push(handler as (code: number | null) => void);
    }),
    stdin: { write: vi.fn(), end: vi.fn() },
    kill: vi.fn(),
  };

  // Simulate async behavior
  setTimeout(() => {
    if (options.error) {
      errorHandlers.forEach((h) => h(options.error!));
    } else {
      if (options.stdout) {
        stdoutHandlers.forEach((h) => h(Buffer.from(options.stdout!)));
      }
      if (options.stderr) {
        stderrHandlers.forEach((h) => h(Buffer.from(options.stderr!)));
      }
      exitHandlers.forEach((h) => h(options.exitCode ?? 0));
    }
  }, 0);

  return mockChild;
}

describe('CursorCLIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should use default model when not provided', () => {
      const provider = new CursorCLIProvider({});
      expect(provider.model).toBe('auto');
    });

    test('should use configured model when provided', () => {
      const provider = new CursorCLIProvider({ model: 'gpt-4o' });
      expect(provider.model).toBe('gpt-4o');
    });
  });

  describe('listModels', () => {
    test('should return dynamic models when CLI succeeds with JSON format', async () => {
      const jsonOutput = [
        '{"id": "claude-4-sonnet", "name": "Claude 4 Sonnet"}',
        '{"id": "gpt-4o", "name": "GPT-4o"}',
      ].join('\n');

      mockSpawn.mockReturnValue(createMockChildProcess({ stdout: jsonOutput }));

      const provider = new CursorCLIProvider({});
      const models = await provider.listModels();

      expect(mockSpawn).toHaveBeenCalledWith('cursor-agent', ['--list-models'], expect.any(Object));
      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({
        id: 'claude-4-sonnet',
        name: 'Claude 4 Sonnet',
        description: undefined,
        supportsStreaming: true,
      });
      expect(models[1]).toEqual({
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: undefined,
        supportsStreaming: true,
      });
    });

    test('should return dynamic models when CLI succeeds with line format', async () => {
      const lineOutput = ['model-a: Model A', 'model-b'].join('\n');

      mockSpawn.mockReturnValue(createMockChildProcess({ stdout: lineOutput }));

      const provider = new CursorCLIProvider({});
      const models = await provider.listModels();

      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({
        id: 'model-a',
        name: 'Model A',
        supportsStreaming: true,
      });
      expect(models[1]).toEqual({
        id: 'model-b',
        name: 'model-b',
        supportsStreaming: true,
      });
    });

    test('should return fallback models when CLI fails', async () => {
      mockSpawn.mockReturnValue(
        createMockChildProcess({ stderr: 'Command not found', exitCode: 1 })
      );

      const provider = new CursorCLIProvider({});
      const models = await provider.listModels();

      // Should return fallback static models
      expect(models.length).toBeGreaterThanOrEqual(5);
      expect(models[0].id).toBe('auto');
      expect(models.find((m) => m.id === 'claude-4-sonnet')).toBeDefined();
      expect(models.find((m) => m.id === 'gpt-4o')).toBeDefined();
    });

    test('should return fallback models when CLI throws error', async () => {
      mockSpawn.mockReturnValue(
        createMockChildProcess({ error: new Error('spawn ENOENT') })
      );

      const provider = new CursorCLIProvider({});
      const models = await provider.listModels();

      // Should return fallback static models
      expect(models.length).toBeGreaterThanOrEqual(5);
      expect(models[0].id).toBe('auto');
    });

    test('should return fallback models when CLI returns empty output', async () => {
      mockSpawn.mockReturnValue(createMockChildProcess({ stdout: '' }));

      const provider = new CursorCLIProvider({});
      const models = await provider.listModels();

      // Should return fallback static models
      expect(models.length).toBeGreaterThanOrEqual(5);
      expect(models[0].id).toBe('auto');
    });

    test('should handle JSON with description field', async () => {
      const jsonOutput = '{"id": "test-model", "name": "Test Model", "description": "A test model"}';

      mockSpawn.mockReturnValue(createMockChildProcess({ stdout: jsonOutput }));

      const provider = new CursorCLIProvider({});
      const models = await provider.listModels();

      expect(models).toHaveLength(1);
      expect(models[0]).toEqual({
        id: 'test-model',
        name: 'Test Model',
        description: 'A test model',
        supportsStreaming: true,
      });
    });

    test('should skip invalid JSON lines and continue parsing', async () => {
      const mixedOutput = [
        '{"id": "valid-model", "name": "Valid Model"}',
        'not valid json',
        'another-model: Another Model',
      ].join('\n');

      mockSpawn.mockReturnValue(createMockChildProcess({ stdout: mixedOutput }));

      const provider = new CursorCLIProvider({});
      const models = await provider.listModels();

      expect(models).toHaveLength(2);
      expect(models.map((m) => m.id)).toEqual(['valid-model', 'another-model']);
    });
  });

  describe('model property', () => {
    test('should expose the configured model', () => {
      const provider = new CursorCLIProvider({ model: 'custom-model' });
      expect(provider.model).toBe('custom-model');
    });
  });

  describe('type property', () => {
    test('should have correct provider type', () => {
      const provider = new CursorCLIProvider({});
      expect(provider.type).toBe('cursor-cli');
    });
  });
});
