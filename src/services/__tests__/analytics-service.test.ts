import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { AnalyticsService, NoOpAnalyticsService } from '../analytics-service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnalyticsService();
  });

  describe('isEnabled()', () => {
    it('returns true when telemetryLevel is "all"', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn().mockReturnValue('all'),
      } as unknown as vscode.WorkspaceConfiguration);

      expect(service.isEnabled()).toBe(true);
    });

    it('returns true when telemetryLevel is "error"', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn().mockReturnValue('error'),
      } as unknown as vscode.WorkspaceConfiguration);

      expect(service.isEnabled()).toBe(true);
    });

    it('returns true when telemetryLevel is "crash"', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn().mockReturnValue('crash'),
      } as unknown as vscode.WorkspaceConfiguration);

      expect(service.isEnabled()).toBe(true);
    });

    it('returns false when telemetryLevel is "off"', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn().mockReturnValue('off'),
      } as unknown as vscode.WorkspaceConfiguration);

      expect(service.isEnabled()).toBe(false);
    });

    it('returns true when telemetryLevel is undefined (defaults to "all")', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
      } as unknown as vscode.WorkspaceConfiguration);

      // When undefined, the default 'all' is used, which is not 'off'
      expect(service.isEnabled()).toBe(true);
    });

    it('reads from the "telemetry" configuration section', () => {
      const mockGet = vi.fn().mockReturnValue('all');
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: mockGet,
      } as unknown as vscode.WorkspaceConfiguration);

      service.isEnabled();

      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('telemetry');
      expect(mockGet).toHaveBeenCalledWith('telemetryLevel', 'all');
    });
  });
});

describe('NoOpAnalyticsService', () => {
  it('isEnabled() always returns false', () => {
    const service = new NoOpAnalyticsService();
    expect(service.isEnabled()).toBe(false);
  });

  it('track() does nothing', () => {
    const service = new NoOpAnalyticsService();
    // Should not throw
    service.track('extension_activated' as never);
  });
});
