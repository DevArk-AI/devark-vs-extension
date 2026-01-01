import { vi } from 'vitest';
import type { ICursorDatabase } from '../types';

interface MockDbOptions {
  composerData?: Record<string, object>;
  bubbleData?: Record<string, object>;
}

/**
 * Creates a mock Cursor database for testing.
 * @param options.composerData - Map of composerId to composer data object
 * @param options.bubbleData - Map of bubbleKey to bubble data object
 */
export function createMockCursorDb(options: MockDbOptions = {}): ICursorDatabase {
  const { composerData = {}, bubbleData = {} } = options;

  return {
    exec: vi.fn((sql: string) => {
      // Handle composerData queries
      if (sql.includes("composerData:%")) {
        const values = Object.entries(composerData).map(([id, data]) => [
          `composerData:${id}`,
          JSON.stringify(data),
        ]);
        return [{ values }];
      }

      // Handle bubbleId queries
      const bubbleMatch = sql.match(/bubbleId:([^:]+):/);
      if (bubbleMatch) {
        const composerId = bubbleMatch[1];
        const values = Object.entries(bubbleData)
          .filter(([key]) => key.startsWith(`bubbleId:${composerId}:`))
          .map(([key, data]) => [key, JSON.stringify(data)]);
        return [{ values }];
      }

      // Handle table listing
      if (sql.includes("sqlite_master")) {
        return [{ values: [['cursorDiskKV']] }];
      }

      return [{ values: [] }];
    }),

    prepare: vi.fn(() => {
      let currentValue: any[] | null = null;
      let stepped = false;

      return {
        bind: vi.fn((params: any[]) => {
          const key = params[0] as string;

          if (key.startsWith('composerData:')) {
            const id = key.replace('composerData:', '');
            if (composerData[id]) {
              currentValue = [key, JSON.stringify(composerData[id])];
            }
          } else if (key.startsWith('bubbleId:')) {
            if (bubbleData[key]) {
              currentValue = [key, JSON.stringify(bubbleData[key])];
            }
          }
        }),
        step: vi.fn(() => {
          if (currentValue && !stepped) {
            stepped = true;
            return true;
          }
          return false;
        }),
        get: vi.fn(() => currentValue || []),
        free: vi.fn(),
      };
    }),

    close: vi.fn(),
  };
}

/**
 * Helper to create a minimal composer data object
 */
export function createComposerData(overrides: Partial<{
  id: string;
  workspaceName: string;
  workspacePath: string;
  createdAt: number | string;
  updatedAt: number | string;
  messages: Array<{ role: string; content: string; timestamp?: number }>;
  conversation: Array<{ role?: string; type?: number; content?: string; text?: string }>;
  conversationHistory: Array<{ role: string; content: string }>;
  fullConversationHeadersOnly: Array<{ bubbleId: string; type: number }>;
  files: string[];
  fileContext: string[];
  _v: number;
}> = {}) {
  return {
    id: 'test-composer-id',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Helper to create a bubble message object
 */
export function createBubbleMessage(overrides: Partial<{
  role: string;
  type: number;
  content: string;
  text: string;
  timestamp: number | string;
}> = {}) {
  return {
    role: 'user',
    content: 'Test message',
    timestamp: Date.now(),
    ...overrides,
  };
}
