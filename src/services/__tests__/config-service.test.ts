/**
 * ConfigService Tests
 *
 * TDD: Tests written first, implementation follows.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from '../config-service';
import { MockConfigStorage } from '../../../test/mocks/mock-storage';
import { DEFAULT_CONFIG } from '../../ports/storage/config-storage.interface';

describe('ConfigService', () => {
  let configService: ConfigService;
  let mockStorage: MockConfigStorage;

  beforeEach(() => {
    mockStorage = new MockConfigStorage();
    configService = new ConfigService(mockStorage);
  });

  describe('getConfig()', () => {
    it('returns defaults when storage empty', async () => {
      const config = await configService.getConfig();

      expect(config.apiUrl).toBe(DEFAULT_CONFIG.apiUrl);
      expect(config.autoSync).toBe(DEFAULT_CONFIG.autoSync);
      expect(config.syncInterval).toBe(DEFAULT_CONFIG.syncInterval);
      expect(config.showStatusBar).toBe(DEFAULT_CONFIG.showStatusBar);
    });

    it('merges stored values with defaults', async () => {
      mockStorage.setConfig({ autoSync: false });

      const config = await configService.getConfig();

      expect(config.autoSync).toBe(false);
      expect(config.apiUrl).toBe(DEFAULT_CONFIG.apiUrl); // default
    });

    it('stored values override defaults', async () => {
      mockStorage.setConfig({
        apiUrl: 'https://custom.api.dev',
        syncInterval: 60,
      });

      const config = await configService.getConfig();

      expect(config.apiUrl).toBe('https://custom.api.dev');
      expect(config.syncInterval).toBe(60);
    });
  });

  describe('get(key)', () => {
    it('returns default if key not set', async () => {
      const value = await configService.get('syncInterval');
      expect(value).toBe(DEFAULT_CONFIG.syncInterval);
    });

    it('returns stored value if set', async () => {
      mockStorage.setConfig({ syncInterval: 120 });

      const value = await configService.get('syncInterval');
      expect(value).toBe(120);
    });

    it('returns default for boolean false vs undefined', async () => {
      // autoSync default is true, so undefined should return true
      const value = await configService.get('autoSync');
      expect(value).toBe(true);
    });

    it('returns explicitly set false value', async () => {
      mockStorage.setConfig({ autoSync: false });

      const value = await configService.get('autoSync');
      expect(value).toBe(false);
    });
  });

  describe('set(key, value)', () => {
    it('stores value in storage', async () => {
      await configService.set('syncInterval', 90);

      const stored = await mockStorage.get('syncInterval');
      expect(stored).toBe(90);
    });

    it('value persists for retrieval', async () => {
      await configService.set('showNotifications', false);

      const value = await configService.get('showNotifications');
      expect(value).toBe(false);
    });

    it('updates only specified key', async () => {
      mockStorage.setConfig({ autoSync: false, syncInterval: 60 });

      await configService.set('syncInterval', 30);

      expect(await mockStorage.get('autoSync')).toBe(false);
      expect(await mockStorage.get('syncInterval')).toBe(30);
    });
  });

  describe('update(partial)', () => {
    it('merges with existing config', async () => {
      mockStorage.setConfig({ autoSync: false });

      await configService.update({ syncInterval: 45 });

      expect(await mockStorage.get('autoSync')).toBe(false);
      expect(await mockStorage.get('syncInterval')).toBe(45);
    });

    it('preserves unspecified values', async () => {
      mockStorage.setConfig({
        apiUrl: 'https://custom.dev',
        autoSync: false,
        syncInterval: 60,
      });

      await configService.update({ showStatusBar: false });

      const config = mockStorage.getConfig();
      expect(config.apiUrl).toBe('https://custom.dev');
      expect(config.autoSync).toBe(false);
      expect(config.syncInterval).toBe(60);
      expect(config.showStatusBar).toBe(false);
    });

    it('can update multiple values at once', async () => {
      await configService.update({
        autoSync: false,
        syncInterval: 15,
        showNotifications: false,
      });

      expect(await mockStorage.get('autoSync')).toBe(false);
      expect(await mockStorage.get('syncInterval')).toBe(15);
      expect(await mockStorage.get('showNotifications')).toBe(false);
    });
  });

  describe('reset()', () => {
    it('clears all stored config', async () => {
      mockStorage.setConfig({
        apiUrl: 'https://custom.dev',
        autoSync: false,
        syncInterval: 120,
      });

      await configService.reset();

      const exists = await mockStorage.exists();
      expect(exists).toBe(false);
    });

    it('subsequent get returns defaults', async () => {
      mockStorage.setConfig({ syncInterval: 120 });

      await configService.reset();

      const value = await configService.get('syncInterval');
      expect(value).toBe(DEFAULT_CONFIG.syncInterval);
    });
  });

  describe('isFirstRun()', () => {
    it('returns true when no config exists', async () => {
      const result = await configService.isFirstRun();
      expect(result).toBe(true);
    });

    it('returns false after any set()', async () => {
      await configService.set('autoSync', true);

      const result = await configService.isFirstRun();
      expect(result).toBe(false);
    });

    it('returns false when config exists', async () => {
      mockStorage.setConfig({ autoSync: false });

      const result = await configService.isFirstRun();
      expect(result).toBe(false);
    });

    it('returns true after reset()', async () => {
      mockStorage.setConfig({ autoSync: false });
      await configService.reset();

      const result = await configService.isFirstRun();
      expect(result).toBe(true);
    });
  });

  describe('getApiUrl()', () => {
    it('returns default API URL when not configured', async () => {
      const url = await configService.getApiUrl();
      expect(url).toBe(DEFAULT_CONFIG.apiUrl);
    });

    it('returns configured API URL', async () => {
      mockStorage.setConfig({ apiUrl: 'https://staging.devark.dev' });

      const url = await configService.getApiUrl();
      expect(url).toBe('https://staging.devark.dev');
    });
  });
});
