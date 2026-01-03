/**
 * UnifiedSettingsService Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockUnifiedSettingsService } from '../../test/mock-unified-settings';
import type { SettingKey } from '../settings-types';

describe('UnifiedSettingsService', () => {
  let settingsService: MockUnifiedSettingsService;

  beforeEach(() => {
    settingsService = new MockUnifiedSettingsService();
  });

  describe('get()', () => {
    it('returns undefined for unset settings', () => {
      const value = settingsService.get('onboarding.completed');
      expect(value).toBeUndefined();
    });

    it('returns set value', async () => {
      await settingsService.set('onboarding.completed', true);
      const value = settingsService.get('onboarding.completed');
      expect(value).toBe(true);
    });

    it('works with string settings', async () => {
      await settingsService.set('llm.activeProvider', 'ollama');
      const value = settingsService.get('llm.activeProvider');
      expect(value).toBe('ollama');
    });

    it('works with number settings', async () => {
      await settingsService.set('llm.timeout', 30000);
      const value = settingsService.get('llm.timeout');
      expect(value).toBe(30000);
    });
  });

  describe('getWithDefault()', () => {
    it('returns default when value not set', () => {
      const value = settingsService.getWithDefault('onboarding.completed', false);
      expect(value).toBe(false);
    });

    it('returns actual value when set', async () => {
      await settingsService.set('onboarding.completed', true);
      const value = settingsService.getWithDefault('onboarding.completed', false);
      expect(value).toBe(true);
    });

    it('returns false when explicitly set to false', async () => {
      await settingsService.set('autoAnalyze.enabled', false);
      const value = settingsService.getWithDefault('autoAnalyze.enabled', true);
      expect(value).toBe(false);
    });
  });

  describe('set()', () => {
    it('stores value for retrieval', async () => {
      await settingsService.set('llm.activeProvider', 'openrouter');
      expect(settingsService.get('llm.activeProvider')).toBe('openrouter');
    });

    it('overwrites previous value', async () => {
      await settingsService.set('llm.activeProvider', 'ollama');
      await settingsService.set('llm.activeProvider', 'openrouter');
      expect(settingsService.get('llm.activeProvider')).toBe('openrouter');
    });

    it('stores boolean values correctly', async () => {
      await settingsService.set('detection.useHooks', true);
      expect(settingsService.get('detection.useHooks')).toBe(true);

      await settingsService.set('detection.useHooks', false);
      expect(settingsService.get('detection.useHooks')).toBe(false);
    });
  });

  describe('setMultiple()', () => {
    it('sets multiple values at once', async () => {
      await settingsService.setMultiple({
        'llm.activeProvider': 'ollama',
        'onboarding.completed': true,
        'autoAnalyze.enabled': false,
      });

      expect(settingsService.get('llm.activeProvider')).toBe('ollama');
      expect(settingsService.get('onboarding.completed')).toBe(true);
      expect(settingsService.get('autoAnalyze.enabled')).toBe(false);
    });

    it('preserves unrelated settings', async () => {
      await settingsService.set('detection.useHooks', true);
      await settingsService.setMultiple({
        'llm.activeProvider': 'openrouter',
      });

      expect(settingsService.get('detection.useHooks')).toBe(true);
    });
  });

  describe('onChange()', () => {
    it('calls listener when setting changes', async () => {
      const callback = vi.fn();
      settingsService.onChange('onboarding.completed', callback);

      await settingsService.set('onboarding.completed', true);

      expect(callback).toHaveBeenCalledWith(true);
    });

    it('does not call listener for other settings', async () => {
      const callback = vi.fn();
      settingsService.onChange('onboarding.completed', callback);

      await settingsService.set('llm.activeProvider', 'ollama');

      expect(callback).not.toHaveBeenCalled();
    });

    it('dispose stops listening', async () => {
      const callback = vi.fn();
      const disposable = settingsService.onChange('onboarding.completed', callback);

      disposable.dispose();
      await settingsService.set('onboarding.completed', true);

      expect(callback).not.toHaveBeenCalled();
    });

    it('multiple listeners all get called', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      settingsService.onChange('llm.activeProvider', callback1);
      settingsService.onChange('llm.activeProvider', callback2);

      await settingsService.set('llm.activeProvider', 'ollama');

      expect(callback1).toHaveBeenCalledWith('ollama');
      expect(callback2).toHaveBeenCalledWith('ollama');
    });
  });

  describe('onAnyChange()', () => {
    it('calls listener for any setting change', async () => {
      const callback = vi.fn();
      settingsService.onAnyChange(callback);

      await settingsService.set('llm.activeProvider', 'ollama');
      await settingsService.set('onboarding.completed', true);

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith('llm.activeProvider', 'ollama');
      expect(callback).toHaveBeenCalledWith('onboarding.completed', true);
    });

    it('dispose stops listening to all changes', async () => {
      const callback = vi.fn();
      const disposable = settingsService.onAnyChange(callback);

      disposable.dispose();
      await settingsService.set('llm.activeProvider', 'ollama');

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('hasCustomValue()', () => {
    it('returns false for unset settings', () => {
      expect(settingsService.hasCustomValue('onboarding.completed')).toBe(false);
    });

    it('returns true after setting', async () => {
      await settingsService.set('onboarding.completed', true);
      expect(settingsService.hasCustomValue('onboarding.completed')).toBe(true);
    });

    it('returns false after reset', async () => {
      await settingsService.set('onboarding.completed', true);
      await settingsService.reset('onboarding.completed');
      expect(settingsService.hasCustomValue('onboarding.completed')).toBe(false);
    });
  });

  describe('reset()', () => {
    it('clears specific setting', async () => {
      await settingsService.set('llm.activeProvider', 'ollama');
      await settingsService.reset('llm.activeProvider');

      expect(settingsService.get('llm.activeProvider')).toBeUndefined();
    });

    it('notifies listeners with undefined', async () => {
      const callback = vi.fn();
      await settingsService.set('llm.activeProvider', 'ollama');
      settingsService.onChange('llm.activeProvider', callback);

      await settingsService.reset('llm.activeProvider');

      expect(callback).toHaveBeenCalledWith(undefined);
    });

    it('preserves other settings', async () => {
      await settingsService.set('llm.activeProvider', 'ollama');
      await settingsService.set('onboarding.completed', true);

      await settingsService.reset('llm.activeProvider');

      expect(settingsService.get('onboarding.completed')).toBe(true);
    });
  });

  describe('resetAll()', () => {
    it('clears all settings', async () => {
      await settingsService.set('llm.activeProvider', 'ollama');
      await settingsService.set('onboarding.completed', true);
      await settingsService.set('autoAnalyze.enabled', true);

      await settingsService.resetAll();

      expect(settingsService.get('llm.activeProvider')).toBeUndefined();
      expect(settingsService.get('onboarding.completed')).toBeUndefined();
      expect(settingsService.get('autoAnalyze.enabled')).toBeUndefined();
    });

    it('notifies all listeners', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      await settingsService.set('llm.activeProvider', 'ollama');
      await settingsService.set('onboarding.completed', true);

      settingsService.onChange('llm.activeProvider', callback1);
      settingsService.onChange('onboarding.completed', callback2);

      await settingsService.resetAll();

      expect(callback1).toHaveBeenCalledWith(undefined);
      expect(callback2).toHaveBeenCalledWith(undefined);
    });
  });

  describe('dispose()', () => {
    it('clears all listeners', async () => {
      const callback = vi.fn();
      settingsService.onChange('llm.activeProvider', callback);
      settingsService.onAnyChange(callback);

      settingsService.dispose();
      await settingsService.set('llm.activeProvider', 'ollama');

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('initial settings', () => {
    it('accepts initial settings in constructor', () => {
      const service = new MockUnifiedSettingsService({
        'llm.activeProvider': 'openrouter',
        'onboarding.completed': true,
      });

      expect(service.get('llm.activeProvider')).toBe('openrouter');
      expect(service.get('onboarding.completed')).toBe(true);
    });
  });

  describe('simulateChange() helper', () => {
    it('sets value and notifies listeners', () => {
      const callback = vi.fn();
      settingsService.onChange('llm.activeProvider', callback);

      settingsService.simulateChange('llm.activeProvider', 'ollama');

      expect(settingsService.get('llm.activeProvider')).toBe('ollama');
      expect(callback).toHaveBeenCalledWith('ollama');
    });

    it('handles undefined value for reset simulation', () => {
      const callback = vi.fn();
      settingsService.set('llm.activeProvider', 'ollama');
      settingsService.onChange('llm.activeProvider', callback);

      settingsService.simulateChange('llm.activeProvider', undefined);

      expect(settingsService.get('llm.activeProvider')).toBeUndefined();
      expect(callback).toHaveBeenCalledWith(undefined);
    });
  });

  describe('getAllSettings() helper', () => {
    it('returns all settings as object', async () => {
      await settingsService.set('llm.activeProvider', 'ollama');
      await settingsService.set('onboarding.completed', true);

      const all = settingsService.getAllSettings();

      expect(all).toEqual({
        'llm.activeProvider': 'ollama',
        'onboarding.completed': true,
      });
    });

    it('returns empty object when no settings', () => {
      const all = settingsService.getAllSettings();
      expect(all).toEqual({});
    });
  });
});
