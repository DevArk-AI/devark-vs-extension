/**
 * VSCodeTokenStorage Tests - TDD
 *
 * Tests for the VS Code SecretStorage-based token storage adapter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VSCodeTokenStorage } from '../vscode-secret-storage';

// Mock VS Code SecretStorage interface
interface MockSecretStorage {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  onDidChange: unknown;
}

function createMockSecretStorage(): MockSecretStorage & {
  _store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    _store: store,
    get: vi.fn(async (key: string) => store.get(key)),
    store: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    onDidChange: vi.fn(),
  };
}

describe('VSCodeTokenStorage', () => {
  let mockSecrets: ReturnType<typeof createMockSecretStorage>;
  let storage: VSCodeTokenStorage;

  beforeEach(() => {
    mockSecrets = createMockSecretStorage();
    storage = new VSCodeTokenStorage(mockSecrets as unknown as Parameters<typeof VSCodeTokenStorage['prototype']['constructor']>[0]);
  });

  describe('getToken()', () => {
    it('returns null when no token is stored', async () => {
      const token = await storage.getToken();

      expect(token).toBeNull();
    });

    it('returns the stored token', async () => {
      mockSecrets._store.set('devark.auth.token', 'test-token-123');

      const token = await storage.getToken();

      expect(token).toBe('test-token-123');
    });

    it('calls SecretStorage.get with correct key', async () => {
      await storage.getToken();

      expect(mockSecrets.get).toHaveBeenCalledWith('devark.auth.token');
    });
  });

  describe('storeToken()', () => {
    it('stores the token using SecretStorage', async () => {
      await storage.storeToken('new-token-456');

      expect(mockSecrets.store).toHaveBeenCalledWith('devark.auth.token', 'new-token-456');
      expect(mockSecrets._store.get('devark.auth.token')).toBe('new-token-456');
    });

    it('overwrites existing token', async () => {
      mockSecrets._store.set('devark.auth.token', 'old-token');

      await storage.storeToken('new-token');

      expect(mockSecrets._store.get('devark.auth.token')).toBe('new-token');
    });
  });

  describe('clearToken()', () => {
    it('deletes the token from SecretStorage', async () => {
      mockSecrets._store.set('devark.auth.token', 'token-to-delete');

      await storage.clearToken();

      expect(mockSecrets.delete).toHaveBeenCalledWith('devark.auth.token');
      expect(mockSecrets._store.has('devark.auth.token')).toBe(false);
    });

    it('does not throw when no token exists', async () => {
      await expect(storage.clearToken()).resolves.not.toThrow();
    });
  });

  describe('hasToken()', () => {
    it('returns false when no token stored', async () => {
      const hasToken = await storage.hasToken();

      expect(hasToken).toBe(false);
    });

    it('returns true when token is stored', async () => {
      mockSecrets._store.set('devark.auth.token', 'test-token');

      const hasToken = await storage.hasToken();

      expect(hasToken).toBe(true);
    });

    it('returns false for empty string token', async () => {
      mockSecrets._store.set('devark.auth.token', '');

      const hasToken = await storage.hasToken();

      expect(hasToken).toBe(false);
    });
  });

  describe('integration', () => {
    it('round-trips token correctly', async () => {
      // Initially empty
      expect(await storage.getToken()).toBeNull();
      expect(await storage.hasToken()).toBe(false);

      // Store token
      await storage.storeToken('my-secure-token');
      expect(await storage.getToken()).toBe('my-secure-token');
      expect(await storage.hasToken()).toBe(true);

      // Update token
      await storage.storeToken('updated-token');
      expect(await storage.getToken()).toBe('updated-token');
      expect(await storage.hasToken()).toBe(true);

      // Clear token
      await storage.clearToken();
      expect(await storage.getToken()).toBeNull();
      expect(await storage.hasToken()).toBe(false);
    });
  });
});
