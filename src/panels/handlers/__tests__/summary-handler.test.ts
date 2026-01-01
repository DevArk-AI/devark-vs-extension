import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SummaryHandler } from '../summary-handler';
import { SharedContext } from '../shared-context';
import type { MessageSender } from '../base-handler';
import type * as vscode from 'vscode';

const mockUri = { fsPath: '/test/path' } as vscode.Uri;

describe('SummaryHandler', () => {
  let handler: SummaryHandler;
  let mockSender: MessageSender;
  let sharedContext: SharedContext;

  beforeEach(() => {
    mockSender = { sendMessage: vi.fn() };
    sharedContext = new SharedContext();

    // Mock unified session service
    sharedContext.unifiedSessionService = {
      getTodaySessions: vi.fn().mockResolvedValue({
        sessions: [],
        bySource: { cursor: 0, claudeCode: 0, total: 0 }
      }),
      getSessionsForDays: vi.fn().mockResolvedValue({
        sessions: [],
        bySource: { cursor: 0, claudeCode: 0, total: 0 }
      }),
      getSessionsForDateRange: vi.fn().mockResolvedValue({
        sessions: [],
        bySource: { cursor: 0, claudeCode: 0, total: 0 }
      }),
      convertToCursorSessions: vi.fn().mockReturnValue([]),
    } as any;

    // Mock provider detection service
    sharedContext.providerDetectionService = {
      detectAll: vi.fn().mockResolvedValue([]),
      getActiveProviderId: vi.fn().mockReturnValue(null),
    } as any;

    handler = new SummaryHandler(
      mockSender,
      { extensionUri: mockUri, context: {} as vscode.ExtensionContext },
      sharedContext
    );
  });

  it('should handle getSummary message', async () => {
    const result = await handler.handleMessage('getSummary', { period: 'today' });
    expect(result).toBe(true);
  });

  it('should return correct message types', () => {
    expect(handler.getHandledMessageTypes()).toEqual(['getSummary']);
  });

  it('should return false for unknown messages', async () => {
    const result = await handler.handleMessage('unknownMessage', {});
    expect(result).toBe(false);
  });

  it('should generate empty summary when no sessions exist', async () => {
    await handler.handleMessage('getSummary', { period: 'today' });

    expect(mockSender.sendMessage).toHaveBeenCalledWith('loadingProgress', expect.any(Object));
    expect(mockSender.sendMessage).toHaveBeenCalledWith('summaryData', expect.objectContaining({
      type: 'today'
    }));
  });

  it('should handle weekly summary request', async () => {
    await handler.handleMessage('getSummary', { period: 'week' });

    expect(sharedContext.unifiedSessionService?.getSessionsForDays).toHaveBeenCalledWith(7);
    expect(mockSender.sendMessage).toHaveBeenCalledWith('summaryData', expect.objectContaining({
      type: 'week'
    }));
  });

  it('should handle monthly summary request', async () => {
    await handler.handleMessage('getSummary', { period: 'month' });

    expect(sharedContext.unifiedSessionService?.getSessionsForDays).toHaveBeenCalledWith(30);
    expect(mockSender.sendMessage).toHaveBeenCalledWith('summaryData', expect.objectContaining({
      type: 'month'
    }));
  });

  it('should handle custom date range summary request', async () => {
    const startDate = '2024-01-01';
    const endDate = '2024-01-31';

    await handler.handleMessage('getSummary', {
      period: 'custom',
      startDate,
      endDate
    });

    expect(sharedContext.unifiedSessionService?.getSessionsForDateRange).toHaveBeenCalled();
    expect(mockSender.sendMessage).toHaveBeenCalledWith('summaryData', expect.objectContaining({
      type: 'custom'
    }));
  });

  it('should send loading progress updates', async () => {
    await handler.handleMessage('getSummary', { period: 'today' });

    // Should have sent at least initial loading progress
    expect(mockSender.sendMessage).toHaveBeenCalledWith('loadingProgress',
      expect.objectContaining({ progress: expect.any(Number) })
    );
  });

  it('should handle missing unified session service gracefully', async () => {
    sharedContext.unifiedSessionService = undefined;

    await handler.handleMessage('getSummary', { period: 'today' });

    // Should return empty summary without error
    expect(mockSender.sendMessage).toHaveBeenCalledWith('summaryData', expect.objectContaining({
      type: 'today',
      summary: expect.objectContaining({
        sessions: 0,
        source: 'fallback'
      })
    }));
  });

  it('should use fallback when no LLM available', async () => {
    // Mock having sessions but no LLM
    sharedContext.unifiedSessionService = {
      getTodaySessions: vi.fn().mockResolvedValue({
        sessions: [{ id: '1', source: 'cursor' }],
        bySource: { cursor: 1, claudeCode: 0, total: 1 }
      }),
      convertToCursorSessions: vi.fn().mockReturnValue([{
        sessionId: '1',
        workspaceName: 'test-project',
        startTime: new Date(),
        lastActivity: new Date(),
        promptCount: 5,
        fileContext: ['src/test.ts']
      }]),
    } as any;

    sharedContext.providerDetectionService = {
      detectAll: vi.fn().mockResolvedValue([]),
      getActiveProviderId: vi.fn().mockReturnValue(null),
    } as any;

    await handler.handleMessage('getSummary', { period: 'today' });

    // Should have sent loadingProgress with "Using basic analysis" message
    expect(mockSender.sendMessage).toHaveBeenCalledWith('loadingProgress',
      expect.objectContaining({ message: expect.stringContaining('basic analysis') })
    );
  });
});
