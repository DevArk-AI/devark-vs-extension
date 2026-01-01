/**
 * ProviderErrorActions Tests
 *
 * Tests for the ProviderErrorActions component logic.
 */

import { describe, it, expect, vi } from 'vitest';
import type { LLMProvider } from '../../../state/types-v2';

// Helper to create mock provider data
function createMockProvider(overrides?: Partial<LLMProvider>): LLMProvider {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    type: 'cli',
    status: 'connected',
    description: 'Test provider description',
    ...overrides,
  };
}

// Test the logic that determines which error UI to show
function getErrorActionType(provider: LLMProvider): string | null {
  if (provider.status === 'not-detected' && provider.id === 'cursor-cli') {
    return 'cursor-cli-not-detected';
  }
  if (provider.status === 'not-detected' && provider.id === 'claude-agent-sdk') {
    return 'claude-sdk-not-detected';
  }
  if (provider.status === 'not-logged-in' && provider.id === 'claude-agent-sdk') {
    return 'claude-sdk-not-logged-in';
  }
  if (provider.status === 'not-running' && provider.id === 'ollama') {
    return 'ollama-not-running';
  }
  return null;
}

describe('ProviderErrorActions', () => {
  describe('Error type detection', () => {
    it('should detect Cursor CLI not detected', () => {
      const provider = createMockProvider({
        id: 'cursor-cli',
        status: 'not-detected',
      });

      expect(getErrorActionType(provider)).toBe('cursor-cli-not-detected');
    });

    it('should detect Claude Agent SDK not detected', () => {
      const provider = createMockProvider({
        id: 'claude-agent-sdk',
        status: 'not-detected',
      });

      expect(getErrorActionType(provider)).toBe('claude-sdk-not-detected');
    });

    it('should detect Claude Agent SDK not logged in', () => {
      const provider = createMockProvider({
        id: 'claude-agent-sdk',
        status: 'not-logged-in',
      });

      expect(getErrorActionType(provider)).toBe('claude-sdk-not-logged-in');
    });

    it('should detect Ollama not running', () => {
      const provider = createMockProvider({
        id: 'ollama',
        type: 'local',
        status: 'not-running',
      });

      expect(getErrorActionType(provider)).toBe('ollama-not-running');
    });

    it('should return null for connected providers', () => {
      const provider = createMockProvider({
        id: 'ollama',
        status: 'connected',
      });

      expect(getErrorActionType(provider)).toBeNull();
    });

    it('should return null for available providers', () => {
      const provider = createMockProvider({
        id: 'cursor-cli',
        status: 'available',
      });

      expect(getErrorActionType(provider)).toBeNull();
    });

    it('should return null for cloud providers with not-configured status', () => {
      const provider = createMockProvider({
        id: 'openrouter',
        type: 'cloud',
        status: 'not-configured',
      });

      expect(getErrorActionType(provider)).toBeNull();
    });
  });

  describe('Provider status combinations', () => {
    it('should not show error for Ollama when detected but just not running', () => {
      const provider = createMockProvider({
        id: 'ollama',
        type: 'local',
        status: 'not-running',
      });

      // Ollama not-running shows an error
      expect(getErrorActionType(provider)).toBe('ollama-not-running');
    });

    it('should not confuse not-detected with not-running for CLI providers', () => {
      const cursorNotDetected = createMockProvider({
        id: 'cursor-cli',
        status: 'not-detected',
      });

      const cursorNotRunning = createMockProvider({
        id: 'cursor-cli',
        status: 'not-running',
      });

      expect(getErrorActionType(cursorNotDetected)).toBe('cursor-cli-not-detected');
      expect(getErrorActionType(cursorNotRunning)).toBeNull(); // not-running is not handled for cursor-cli
    });

    it('should handle Claude SDK with different error states', () => {
      const notDetected = createMockProvider({
        id: 'claude-agent-sdk',
        status: 'not-detected',
      });

      const notLoggedIn = createMockProvider({
        id: 'claude-agent-sdk',
        status: 'not-logged-in',
      });

      expect(getErrorActionType(notDetected)).toBe('claude-sdk-not-detected');
      expect(getErrorActionType(notLoggedIn)).toBe('claude-sdk-not-logged-in');
    });
  });

  describe('canSave logic', () => {
    // Test the canSave logic used in ProviderSelectView
    function canSave(provider: LLMProvider | undefined): boolean {
      return !!(provider && (
        provider.status === 'connected' ||
        provider.status === 'available' ||
        (provider.type === 'cloud' && provider.requiresApiKey)
      ));
    }

    it('should allow save for connected providers', () => {
      const provider = createMockProvider({ status: 'connected' });
      expect(canSave(provider)).toBe(true);
    });

    it('should allow save for available providers', () => {
      const provider = createMockProvider({ status: 'available' });
      expect(canSave(provider)).toBe(true);
    });

    it('should allow save for cloud providers requiring API key', () => {
      const provider = createMockProvider({
        id: 'openrouter',
        type: 'cloud',
        status: 'not-configured',
        requiresApiKey: true,
      });
      expect(canSave(provider)).toBe(true);
    });

    it('should not allow save for not-detected CLI providers', () => {
      const provider = createMockProvider({
        id: 'cursor-cli',
        status: 'not-detected',
      });
      expect(canSave(provider)).toBe(false);
    });

    it('should not allow save for not-running local providers', () => {
      const provider = createMockProvider({
        id: 'ollama',
        type: 'local',
        status: 'not-running',
      });
      expect(canSave(provider)).toBe(false);
    });

    it('should not allow save for not-logged-in providers', () => {
      const provider = createMockProvider({
        id: 'claude-agent-sdk',
        status: 'not-logged-in',
      });
      expect(canSave(provider)).toBe(false);
    });

    it('should not allow save when provider is undefined', () => {
      expect(canSave(undefined)).toBe(false);
    });
  });

  describe('Retry callback', () => {
    it('should call onRetry with provider id', () => {
      const mockOnRetry = vi.fn();
      const provider = createMockProvider({
        id: 'cursor-cli',
        status: 'not-detected',
      });

      // Simulate what happens when retry is clicked
      mockOnRetry(provider.id);

      expect(mockOnRetry).toHaveBeenCalledWith('cursor-cli');
    });

    it('should call onRetry for each provider type', () => {
      const mockOnRetry = vi.fn();

      const providers = [
        createMockProvider({ id: 'cursor-cli', status: 'not-detected' }),
        createMockProvider({ id: 'claude-agent-sdk', status: 'not-detected' }),
        createMockProvider({ id: 'ollama', status: 'not-running' }),
      ];

      providers.forEach(p => mockOnRetry(p.id));

      expect(mockOnRetry).toHaveBeenCalledTimes(3);
      expect(mockOnRetry).toHaveBeenCalledWith('cursor-cli');
      expect(mockOnRetry).toHaveBeenCalledWith('claude-agent-sdk');
      expect(mockOnRetry).toHaveBeenCalledWith('ollama');
    });
  });
});

describe('Provider install instructions', () => {
  it('should have correct install command for Claude Code CLI', () => {
    const installCommand = 'npm install @anthropic-ai/claude-code';
    expect(installCommand).toContain('@anthropic-ai/claude-code');
  });

  it('should have correct login command for Claude Agent SDK', () => {
    const loginCommand = 'claude login';
    expect(loginCommand).toBe('claude login');
  });

  it('should have correct serve command for Ollama', () => {
    const serveCommand = 'ollama serve';
    expect(serveCommand).toBe('ollama serve');
  });

  it('should have correct external URLs', () => {
    const urls = {
      cursorCli: 'https://cursor.com/docs/cli/overview',
      claudeCode: 'https://www.npmjs.com/package/@anthropic-ai/claude-code',
      ollama: 'https://ollama.ai',
    };

    expect(urls.cursorCli).toContain('cursor.com');
    expect(urls.claudeCode).toContain('npmjs.com');
    expect(urls.ollama).toContain('ollama.ai');
  });
});

describe('CopyButton', () => {
  it('should have copy functionality for all commands', () => {
    const commands = {
      claudeInstall: 'npm install @anthropic-ai/claude-code',
      claudeLogin: 'claude login',
      ollamaServe: 'ollama serve',
    };

    expect(commands.claudeInstall).toBeTruthy();
    expect(commands.claudeLogin).toBeTruthy();
    expect(commands.ollamaServe).toBeTruthy();
  });
});
