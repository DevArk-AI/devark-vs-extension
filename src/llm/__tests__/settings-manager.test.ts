/**
 * SettingsManager Unit Tests
 *
 * Tests for settings validation and configuration retrieval,
 * specifically covering Ollama auto-detection behavior where model is optional.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { SettingsManager } from '../settings-manager';
import { MockUnifiedSettingsService } from '../../test/mock-unified-settings';

describe('SettingsManager', () => {
  let settingsService: MockUnifiedSettingsService;
  let settingsManager: SettingsManager;

  beforeEach(() => {
    settingsService = new MockUnifiedSettingsService();
    settingsManager = new SettingsManager(settingsService);
  });

  describe('validateConfig', () => {
    test('should NOT error when Ollama model is undefined but endpoint is set', async () => {
      // Setup: Ollama provider with endpoint but no model
      await settingsService.setRaw('devark.llm', 'activeProvider', 'ollama');
      await settingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: 'http://localhost:11434',
          // No model - should auto-detect
        },
      });

      const result = settingsManager.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should use default endpoint when empty string provided', async () => {
      // Note: getOllamaConfig() falls back to default endpoint when empty
      // This means validation passes since there's always a valid endpoint
      await settingsService.setRaw('devark.llm', 'activeProvider', 'ollama');
      await settingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: '',
        },
      });

      const config = settingsManager.getOllamaConfig();
      const result = settingsManager.validateConfig();

      // Falls back to default endpoint
      expect(config.endpoint).toBe('http://localhost:11434');
      expect(result.valid).toBe(true);
    });

    test('should error when Ollama endpoint is invalid URL', async () => {
      await settingsService.setRaw('devark.llm', 'activeProvider', 'ollama');
      await settingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: 'not-a-valid-url',
        },
      });

      const result = settingsManager.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Ollama endpoint must be a valid URL');
    });

    test('should error when Ollama endpoint uses invalid protocol', async () => {
      await settingsService.setRaw('devark.llm', 'activeProvider', 'ollama');
      await settingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: 'file:///etc/passwd',
        },
      });

      const result = settingsManager.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Ollama endpoint must use http:// or https://');
    });
  });

  describe('getOllamaConfig', () => {
    test('should return undefined model when not set in providers', () => {
      // No providers configured - just defaults
      const config = settingsManager.getOllamaConfig();

      expect(config.enabled).toBe(true);
      expect(config.model).toBeUndefined();
    });

    test('should return default endpoint when not configured', () => {
      const config = settingsManager.getOllamaConfig();

      expect(config.endpoint).toBe('http://localhost:11434');
    });

    test('should return configured model when set', async () => {
      await settingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: 'http://localhost:11434',
          model: 'llama3.1:8b',
        },
      });

      const config = settingsManager.getOllamaConfig();

      expect(config.model).toBe('llama3.1:8b');
    });

    test('should return custom endpoint when configured', async () => {
      await settingsService.setRaw('devark.llm', 'providers', {
        ollama: {
          endpoint: 'http://192.168.1.100:11434',
        },
      });

      const config = settingsManager.getOllamaConfig();

      expect(config.endpoint).toBe('http://192.168.1.100:11434');
    });
  });
});
