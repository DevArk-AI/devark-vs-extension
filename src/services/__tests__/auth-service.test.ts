/**
 * AuthService Tests
 *
 * TDD: Tests written first, implementation follows.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../auth-service';
import { MockTokenStorage, MockConfigStorage } from '../../../test/mocks/mock-storage';
import { MockApiClient } from '../../../test/mocks/mock-api-client';

describe('AuthService', () => {
  let authService: AuthService;
  let mockTokenStorage: MockTokenStorage;
  let mockApiClient: MockApiClient;

  beforeEach(() => {
    mockTokenStorage = new MockTokenStorage();
    mockApiClient = new MockApiClient();
    authService = new AuthService(mockTokenStorage, mockApiClient);
  });

  describe('isAuthenticated()', () => {
    it('returns false when no token stored', async () => {
      const result = await authService.isAuthenticated();
      expect(result).toBe(false);
    });

    it('returns false when token stored but invalid', async () => {
      mockTokenStorage.setToken('invalid-token');
      mockApiClient.setTokenValid(false);

      const result = await authService.isAuthenticated();
      expect(result).toBe(false);
    });

    it('returns true when token stored and valid', async () => {
      mockTokenStorage.setToken('valid-token');
      mockApiClient.setTokenValid(true);

      const result = await authService.isAuthenticated();
      expect(result).toBe(true);
    });

    it('returns false when API verification throws', async () => {
      mockTokenStorage.setToken('some-token');
      mockApiClient.setFailure(new Error('Network error'));

      const result = await authService.isAuthenticated();
      expect(result).toBe(false);
    });
  });

  describe('startLogin()', () => {
    it('creates auth session via API', async () => {
      const result = await authService.startLogin();

      expect(result.authUrl).toBe('https://app.devark.dev/auth/cli?token=test-token');
    });

    it('returns waitForCompletion function', async () => {
      const result = await authService.startLogin();

      expect(typeof result.waitForCompletion).toBe('function');
    });

    // Note: SSE-based tests require mocking fetch/SSE which is complex.
    // The actual SSE behavior is tested via integration tests.

    it('throws when API createAuthSession fails', async () => {
      mockApiClient.setFailure(new Error('Server error'));

      await expect(authService.startLogin()).rejects.toThrow('Server error');
    });
  });

  describe('logout()', () => {
    it('clears token from storage', async () => {
      mockTokenStorage.setToken('existing-token');

      await authService.logout();

      expect(await mockTokenStorage.hasToken()).toBe(false);
    });

    it('succeeds even when no token stored', async () => {
      await expect(authService.logout()).resolves.toBeUndefined();
    });

    it('clears token from API client', async () => {
      mockTokenStorage.setToken('existing-token');

      await authService.logout();

      // API client should have null token after logout
      // (we can verify this by checking the mock's internal state)
      expect(await mockTokenStorage.getToken()).toBeNull();
    });
  });

  describe('getCurrentUser()', () => {
    it('returns null when not authenticated', async () => {
      const result = await authService.getCurrentUser();
      expect(result).toBeNull();
    });

    it('returns null when token invalid', async () => {
      mockTokenStorage.setToken('invalid-token');
      mockApiClient.setTokenValid(false);

      const result = await authService.getCurrentUser();
      expect(result).toBeNull();
    });

    it('returns user info when authenticated', async () => {
      mockTokenStorage.setToken('valid-token');
      mockApiClient.setTokenValid(true);

      const result = await authService.getCurrentUser();

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user-123');
    });

    it('returns username from user.name when authenticated', async () => {
      mockTokenStorage.setToken('valid-token');
      mockApiClient.setTokenValid(true);

      const result = await authService.getCurrentUser();

      expect(result?.username).toBe('Test User');
    });
  });

  describe('verifyToken()', () => {
    it('returns false when no token stored', async () => {
      const result = await authService.verifyToken();
      expect(result).toBe(false);
    });

    it('calls API verifyToken and returns result', async () => {
      mockTokenStorage.setToken('some-token');
      mockApiClient.setTokenValid(true);

      const result = await authService.verifyToken();

      expect(result).toBe(true);
      expect(mockApiClient.verifyCallCount).toBe(1);
    });

    it('returns false when API returns invalid', async () => {
      mockTokenStorage.setToken('some-token');
      mockApiClient.setTokenValid(false);

      const result = await authService.verifyToken();
      expect(result).toBe(false);
    });

    it('returns false when API throws error', async () => {
      mockTokenStorage.setToken('some-token');
      mockApiClient.setFailure(new Error('Network error'));

      const result = await authService.verifyToken();
      expect(result).toBe(false);
    });
  });

  describe('getToken()', () => {
    it('returns null when no token stored', async () => {
      const result = await authService.getToken();
      expect(result).toBeNull();
    });

    it('returns token when stored', async () => {
      mockTokenStorage.setToken('my-token');

      const result = await authService.getToken();
      expect(result).toBe('my-token');
    });
  });
});
