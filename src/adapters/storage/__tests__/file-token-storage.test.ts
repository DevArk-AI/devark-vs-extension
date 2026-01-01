/**
 * FileTokenStorage Tests - TDD
 *
 * Tests written FIRST before implementation (RED phase).
 * Token storage with AES-256-GCM encryption compatible with CLI.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FileTokenStorage } from '../file-token-storage';
import { MockFileSystem } from '../../../../test/mocks/mock-file-system';

describe('FileTokenStorage', () => {
  let fs: MockFileSystem;
  let storage: FileTokenStorage;

  const CONFIG_PATH = '/home/user/.devark/config.json';
  const KEY_PATH = '/home/user/.devark/.key';

  beforeEach(() => {
    fs = new MockFileSystem();
    storage = new FileTokenStorage(fs);
  });

  describe('storeToken()', () => {
    it('stores token in encrypted format', async () => {
      const token = 'test-token-12345';
      await storage.storeToken(token);

      // Config file should exist
      const configContent = await fs.readFile(CONFIG_PATH);
      const config = JSON.parse(configContent);

      // Token should be encrypted (not plaintext)
      expect(config.token).toBeDefined();
      expect(config.token).not.toBe(token);
      expect(config.token).not.toContain(token);
    });

    it('creates key file if missing', async () => {
      const token = 'test-token-12345';
      await storage.storeToken(token);

      // Key file should be created
      expect(await fs.exists(KEY_PATH)).toBe(true);

      // Key should be hex-encoded 32 bytes (64 hex chars)
      const keyContent = await fs.readFile(KEY_PATH);
      expect(keyContent).toMatch(/^[0-9a-f]{64}$/);
    });

    it('creates ~/.devark directory if missing', async () => {
      const token = 'test-token-12345';
      await storage.storeToken(token);

      // Directory should exist
      expect(await fs.exists('/home/user/.devark')).toBe(true);
    });

    it('rejects tokens shorter than 10 characters', async () => {
      await expect(storage.storeToken('short')).rejects.toThrow();
    });

    it('reuses existing key file', async () => {
      // Pre-create a key
      const existingKey = 'a'.repeat(64);
      fs.addDirectory('/home/user/.devark');
      fs.addFile(KEY_PATH, existingKey);

      const token = 'test-token-12345';
      await storage.storeToken(token);

      // Key should not have changed
      const keyContent = await fs.readFile(KEY_PATH);
      expect(keyContent).toBe(existingKey);
    });
  });

  describe('getToken()', () => {
    it('returns null when no token stored', async () => {
      const token = await storage.getToken();
      expect(token).toBeNull();
    });

    it('decrypts and returns stored token', async () => {
      const originalToken = 'my-secret-token-123';
      await storage.storeToken(originalToken);

      const retrievedToken = await storage.getToken();
      expect(retrievedToken).toBe(originalToken);
    });

    it('returns null for corrupted encrypted data', async () => {
      // Setup: create a valid key but corrupted token data
      const validKey = 'a'.repeat(64);
      fs.addDirectory('/home/user/.devark');
      fs.addFile(KEY_PATH, validKey);
      fs.addFile(CONFIG_PATH, JSON.stringify({ token: 'not-valid-encrypted-format' }));

      const token = await storage.getToken();
      expect(token).toBeNull();
    });

    it('returns null if key file is missing after token was stored', async () => {
      // Store a token first
      await storage.storeToken('test-token-12345');

      // Delete the key file (simulating corruption)
      await fs.unlink(KEY_PATH);

      // Create new storage instance to avoid cached key
      const newStorage = new FileTokenStorage(fs);
      const token = await newStorage.getToken();
      expect(token).toBeNull();
    });

    it('returns null for config without token field', async () => {
      fs.addDirectory('/home/user/.devark');
      fs.addFile(CONFIG_PATH, JSON.stringify({ apiUrl: 'https://example.com' }));

      const token = await storage.getToken();
      expect(token).toBeNull();
    });
  });

  describe('hasToken()', () => {
    it('returns false when no token', async () => {
      expect(await storage.hasToken()).toBe(false);
    });

    it('returns true when token exists', async () => {
      await storage.storeToken('test-token-12345');
      expect(await storage.hasToken()).toBe(true);
    });

    it('returns false after token is cleared', async () => {
      await storage.storeToken('test-token-12345');
      await storage.clearToken();
      expect(await storage.hasToken()).toBe(false);
    });
  });

  describe('clearToken()', () => {
    it('removes token from storage', async () => {
      await storage.storeToken('test-token-12345');

      // Verify token exists
      expect(await storage.hasToken()).toBe(true);

      // Clear it
      await storage.clearToken();

      // Check config file no longer has token
      const configContent = await fs.readFile(CONFIG_PATH);
      const config = JSON.parse(configContent);
      expect(config.token).toBeUndefined();
    });

    it('subsequent getToken() returns null', async () => {
      await storage.storeToken('test-token-12345');
      await storage.clearToken();

      const token = await storage.getToken();
      expect(token).toBeNull();
    });

    it('does not throw if no token exists', async () => {
      await expect(storage.clearToken()).resolves.not.toThrow();
    });

    it('preserves other config fields when clearing token', async () => {
      // Setup: config with multiple fields
      fs.addDirectory('/home/user/.devark');
      fs.addFile(KEY_PATH, 'a'.repeat(64));

      await storage.storeToken('test-token-12345');

      // Add other config fields
      const configContent = await fs.readFile(CONFIG_PATH);
      const config = JSON.parse(configContent);
      config.apiUrl = 'https://custom.api.com';
      await fs.writeFile(CONFIG_PATH, JSON.stringify(config));

      // Clear token
      await storage.clearToken();

      // Other fields should be preserved
      const updatedConfig = JSON.parse(await fs.readFile(CONFIG_PATH));
      expect(updatedConfig.apiUrl).toBe('https://custom.api.com');
      expect(updatedConfig.token).toBeUndefined();
    });
  });

  describe('encryption', () => {
    it('uses AES-256-GCM algorithm (iv:authTag:encrypted format)', async () => {
      await storage.storeToken('test-token-12345');

      const configContent = await fs.readFile(CONFIG_PATH);
      const config = JSON.parse(configContent);
      const encryptedToken = config.token;

      // Should have three parts separated by colons
      const parts = encryptedToken.split(':');
      expect(parts).toHaveLength(3);

      // IV should be 16 bytes (32 hex chars)
      expect(parts[0]).toMatch(/^[0-9a-f]{32}$/);

      // Auth tag should be 16 bytes (32 hex chars)
      expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);

      // Encrypted data should be hex
      expect(parts[2]).toMatch(/^[0-9a-f]+$/);
    });

    it('different encryptions of same token differ (random IV)', async () => {
      // Store token twice
      const token = 'test-token-12345';

      await storage.storeToken(token);
      const config1 = JSON.parse(await fs.readFile(CONFIG_PATH));
      const encrypted1 = config1.token;

      // Store again
      await storage.storeToken(token);
      const config2 = JSON.parse(await fs.readFile(CONFIG_PATH));
      const encrypted2 = config2.token;

      // Should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to same value
      expect(await storage.getToken()).toBe(token);
    });

    it('encrypted token can be decrypted with same key', async () => {
      const originalToken = 'super-secret-api-key-12345';
      await storage.storeToken(originalToken);

      // Create new instance with same fs (same key file)
      const newStorage = new FileTokenStorage(fs);
      const decryptedToken = await newStorage.getToken();

      expect(decryptedToken).toBe(originalToken);
    });
  });

  describe('edge cases', () => {
    it('handles empty string token by rejecting', async () => {
      await expect(storage.storeToken('')).rejects.toThrow();
    });

    it('handles token with special characters', async () => {
      const token = 'token-with-special!@#$%^&*()_+-=[]{}|;:,.<>?~`chars';
      await storage.storeToken(token);

      const retrieved = await storage.getToken();
      expect(retrieved).toBe(token);
    });

    it('handles very long tokens', async () => {
      const token = 'x'.repeat(1000);
      await storage.storeToken(token);

      const retrieved = await storage.getToken();
      expect(retrieved).toBe(token);
    });

    it('handles unicode in token', async () => {
      const token = 'token-with-unicode-\u4e2d\u6587-\u{1F600}';
      await storage.storeToken(token);

      const retrieved = await storage.getToken();
      expect(retrieved).toBe(token);
    });
  });
});
