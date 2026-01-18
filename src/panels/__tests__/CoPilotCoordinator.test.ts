import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import type * as vscode from 'vscode';
import type { SharedContext } from '../handlers/shared-context';
import type { GoalsHandler } from '../handlers/goals-handler';
import type { SessionHandler } from '../handlers/session-handler';

// Mock all singleton services
vi.mock('../../services/SessionManagerService', () => ({
  getSessionManager: vi.fn(),
  SessionManagerService: vi.fn(),
}));

vi.mock('../../services/DailyStatsService', () => ({
  getDailyStatsService: vi.fn(),
  DailyStatsService: vi.fn(),
}));

vi.mock('../../services/GoalService', () => ({
  getGoalService: vi.fn(),
  GoalService: vi.fn(),
}));

vi.mock('../../services/SuggestionEngine', () => ({
  getSuggestionEngine: vi.fn(),
  SuggestionEngine: vi.fn(),
}));

vi.mock('../../services/ContextExtractor', () => ({
  getContextExtractor: vi.fn(),
  ContextExtractor: vi.fn(),
}));

vi.mock('../../services/CoachingService', () => ({
  getCoachingService: vi.fn(),
}));

vi.mock('../../services/HookBasedPromptService', () => ({
  getHookBasedPromptService: vi.fn(),
}));

vi.mock('../../copilot/storage', () => {
  return {
    CoPilotStorageManager: class MockCoPilotStorageManager {
      initialize = vi.fn().mockResolvedValue(undefined);
    },
  };
});

// Mock ExtensionState for settings service
vi.mock('../../extension-state', () => ({
  ExtensionState: {
    getUnifiedSettingsService: vi.fn(),
  },
}));

// Import after mocks
import { CoPilotCoordinator, MessageSender, HandlerFinder } from '../CoPilotCoordinator';
import { getSessionManager } from '../../services/SessionManagerService';
import { ExtensionState } from '../../extension-state';
import { getDailyStatsService } from '../../services/DailyStatsService';
import { getGoalService } from '../../services/GoalService';
import { getSuggestionEngine } from '../../services/SuggestionEngine';
import { getContextExtractor } from '../../services/ContextExtractor';
import { getCoachingService } from '../../services/CoachingService';
import { getHookBasedPromptService } from '../../services/HookBasedPromptService';

describe('CoPilotCoordinator', () => {
  let coordinator: CoPilotCoordinator;
  let mockMessageSender: MessageSender;
  let mockHandlerFinder: HandlerFinder;
  let mockSharedContext: SharedContext;
  let mockContext: vscode.ExtensionContext;

  // Mock service instances
  let mockSessionManager: {
    initialize: Mock;
    subscribe: Mock;
  };
  let mockDailyStats: {
    initialize: Mock;
  };
  let mockGoalService: {
    getGoalStatus: Mock;
  };
  let mockSuggestionEngine: {
    initialize: Mock;
    subscribe: Mock;
  };
  let mockContextExtractor: {
    extractSessionContext: Mock;
    getContextSummary: Mock;
  };
  let mockCoachingService: {
    setStorageManager: Mock;
    subscribe: Mock;
    processResponse: Mock;
    resetProcessingState: Mock;
  };
  let mockHookService: {
    on: Mock;
    initialize: Mock;
    start: Mock;
  };

  // Track subscription callbacks
  let suggestionCallback: ((suggestion: unknown) => void) | null = null;
  let sessionEventCallback: ((event: unknown) => void) | null = null;
  let coachingCallback: ((coaching: unknown) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock message sender
    mockMessageSender = {
      sendMessage: vi.fn(),
    };

    // Create mock handler finder
    const mockGoalsHandler = {
      triggerGoalInferenceIfNeeded: vi.fn(),
    } as unknown as GoalsHandler;

    const mockSessionHandler = {
      handleMessage: vi.fn(),
    } as unknown as SessionHandler;

    mockHandlerFinder = {
      getGoalsHandler: vi.fn().mockReturnValue(mockGoalsHandler),
      getSessionHandler: vi.fn().mockReturnValue(mockSessionHandler),
    };

    // Create mock shared context
    mockSharedContext = {} as SharedContext;

    // Create mock extension context
    mockContext = {
      subscriptions: [],
      globalStoragePath: '/tmp/test-storage',
    } as unknown as vscode.ExtensionContext;

    // Setup mock service instances
    mockSessionManager = {
      initialize: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockImplementation((cb) => {
        sessionEventCallback = cb;
        return vi.fn(); // unsubscribe function
      }),
    };

    mockDailyStats = {
      initialize: vi.fn().mockResolvedValue(undefined),
    };

    mockGoalService = {
      getGoalStatus: vi.fn().mockReturnValue({
        goalText: 'Test goal',
        completed: false,
      }),
    };

    mockSuggestionEngine = {
      initialize: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockImplementation((cb) => {
        suggestionCallback = cb;
        return vi.fn(); // unsubscribe function
      }),
    };

    mockContextExtractor = {
      extractSessionContext: vi.fn().mockReturnValue({ techStack: ['typescript'] }),
      getContextSummary: vi.fn().mockReturnValue('Test context summary'),
    };

    mockCoachingService = {
      setStorageManager: vi.fn(),
      subscribe: vi.fn().mockImplementation((cb) => {
        coachingCallback = cb;
        return vi.fn(); // unsubscribe function
      }),
      processResponse: vi.fn().mockResolvedValue(undefined),
      resetProcessingState: vi.fn(),
    };

    mockHookService = {
      on: vi.fn(),
      initialize: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
    };

    // Wire up mocked getters
    (getSessionManager as Mock).mockReturnValue(mockSessionManager);
    (getDailyStatsService as Mock).mockReturnValue(mockDailyStats);
    (getGoalService as Mock).mockReturnValue(mockGoalService);
    (getSuggestionEngine as Mock).mockReturnValue(mockSuggestionEngine);
    (getContextExtractor as Mock).mockReturnValue(mockContextExtractor);
    (getCoachingService as Mock).mockReturnValue(mockCoachingService);
    (getHookBasedPromptService as Mock).mockReturnValue(mockHookService);

    // Create coordinator
    coordinator = new CoPilotCoordinator();
  });

  afterEach(() => {
    suggestionCallback = null;
    sessionEventCallback = null;
    coachingCallback = null;
  });

  describe('getServices', () => {
    it('should return all Co-Pilot services', () => {
      const services = coordinator.getServices();

      expect(services.sessionManagerService).toBe(mockSessionManager);
      expect(services.dailyStatsService).toBe(mockDailyStats);
      expect(services.goalService).toBe(mockGoalService);
      expect(services.suggestionEngine).toBe(mockSuggestionEngine);
      expect(services.contextExtractor).toBe(mockContextExtractor);
    });
  });

  describe('initialize', () => {
    it('should initialize all services', async () => {
      await coordinator.initialize(mockContext, mockMessageSender, mockHandlerFinder, mockSharedContext);

      expect(mockSessionManager.initialize).toHaveBeenCalledWith(mockContext);
      expect(mockDailyStats.initialize).toHaveBeenCalledWith(mockContext);
      expect(mockSuggestionEngine.initialize).toHaveBeenCalledWith(mockContext);
    });

    it('should populate SharedContext with services', async () => {
      await coordinator.initialize(mockContext, mockMessageSender, mockHandlerFinder, mockSharedContext);

      expect(mockSharedContext.goalService).toBe(mockGoalService);
      expect(mockSharedContext.sessionManagerService).toBe(mockSessionManager);
      expect(mockSharedContext.dailyStatsService).toBe(mockDailyStats);
    });

    it('should connect storage manager to coaching service', async () => {
      await coordinator.initialize(mockContext, mockMessageSender, mockHandlerFinder, mockSharedContext);

      expect(mockCoachingService.setStorageManager).toHaveBeenCalled();
    });

    it('should subscribe to suggestion engine', async () => {
      await coordinator.initialize(mockContext, mockMessageSender, mockHandlerFinder, mockSharedContext);

      expect(mockSuggestionEngine.subscribe).toHaveBeenCalled();
    });

    it('should subscribe to session events', async () => {
      await coordinator.initialize(mockContext, mockMessageSender, mockHandlerFinder, mockSharedContext);

      expect(mockSessionManager.subscribe).toHaveBeenCalled();
    });

    it('should subscribe to coaching updates', async () => {
      await coordinator.initialize(mockContext, mockMessageSender, mockHandlerFinder, mockSharedContext);

      expect(mockCoachingService.subscribe).toHaveBeenCalled();
    });

    it('should start hook service', async () => {
      await coordinator.initialize(mockContext, mockMessageSender, mockHandlerFinder, mockSharedContext);

      expect(mockHookService.initialize).toHaveBeenCalled();
      expect(mockHookService.start).toHaveBeenCalled();
    });
  });

  describe('subscription forwarding', () => {
    beforeEach(async () => {
      await coordinator.initialize(mockContext, mockMessageSender, mockHandlerFinder, mockSharedContext);
    });

    it('should forward suggestions to webview', () => {
      const suggestion = { type: 'improvement', text: 'Test suggestion' };
      suggestionCallback?.(suggestion);

      expect(mockMessageSender.sendMessage).toHaveBeenCalledWith('v2Suggestion', { suggestion });
    });

    it('should forward coaching updates to webview', () => {
      const coaching = { suggestions: [{ text: 'Try this' }] };
      coachingCallback?.(coaching);

      expect(mockMessageSender.sendMessage).toHaveBeenCalledWith('coachingUpdated', { coaching });
    });

    it('should refresh session list on session_created event', () => {
      sessionEventCallback?.({ type: 'session_created' });

      const sessionHandler = mockHandlerFinder.getSessionHandler();
      expect(sessionHandler?.handleMessage).toHaveBeenCalledWith('v2GetActiveSession', {});
      expect(sessionHandler?.handleMessage).toHaveBeenCalledWith('v2GetSessionList', {});
    });

    it('should refresh stats on prompt_added event', () => {
      sessionEventCallback?.({ type: 'prompt_added' });

      const sessionHandler = mockHandlerFinder.getSessionHandler();
      expect(sessionHandler?.handleMessage).toHaveBeenCalledWith('v2GetDailyStats', {});
    });

    // Note: Goal inference on prompt_added was removed - goals are now auto-set
    // via GoalService.analyzeGoalProgress() when progress analysis is triggered

    it('should send goal status on goal_set event', () => {
      sessionEventCallback?.({ type: 'goal_set' });

      expect(mockMessageSender.sendMessage).toHaveBeenCalledWith('v2GoalStatus', {
        goal: 'Test goal',
        status: { goalText: 'Test goal', completed: false },
      });
    });
  });

  describe('sendGoalStatusToWebview', () => {
    beforeEach(async () => {
      await coordinator.initialize(mockContext, mockMessageSender, mockHandlerFinder, mockSharedContext);
    });

    it('should send goal status via message sender', () => {
      coordinator.sendGoalStatusToWebview();

      expect(mockMessageSender.sendMessage).toHaveBeenCalledWith('v2GoalStatus', {
        goal: 'Test goal',
        status: { goalText: 'Test goal', completed: false },
      });
    });

    it('should handle null goal status', () => {
      mockGoalService.getGoalStatus.mockReturnValue(null);

      coordinator.sendGoalStatusToWebview();

      expect(mockMessageSender.sendMessage).toHaveBeenCalledWith('v2GoalStatus', {
        goal: null,
        status: null,
      });
    });

    it('should handle errors gracefully', () => {
      mockGoalService.getGoalStatus.mockImplementation(() => {
        throw new Error('Test error');
      });

      coordinator.sendGoalStatusToWebview();

      expect(mockMessageSender.sendMessage).toHaveBeenCalledWith('v2GoalStatus', {
        goal: null,
        status: null,
      });
    });
  });

  describe('handleGetSessionContext', () => {
    beforeEach(async () => {
      await coordinator.initialize(mockContext, mockMessageSender, mockHandlerFinder, mockSharedContext);
    });

    it('should send session context via message sender', () => {
      coordinator.handleGetSessionContext();

      expect(mockContextExtractor.extractSessionContext).toHaveBeenCalled();
      expect(mockMessageSender.sendMessage).toHaveBeenCalledWith('v2SessionContext', {
        context: { techStack: ['typescript'] },
      });
    });

    it('should handle errors gracefully', () => {
      mockContextExtractor.extractSessionContext.mockImplementation(() => {
        throw new Error('Test error');
      });

      coordinator.handleGetSessionContext();

      expect(mockMessageSender.sendMessage).toHaveBeenCalledWith('v2SessionContext', {
        context: null,
      });
    });
  });

  describe('handleGetContextSummary', () => {
    beforeEach(async () => {
      await coordinator.initialize(mockContext, mockMessageSender, mockHandlerFinder, mockSharedContext);
    });

    it('should send context summary via message sender', () => {
      coordinator.handleGetContextSummary();

      expect(mockContextExtractor.getContextSummary).toHaveBeenCalled();
      expect(mockMessageSender.sendMessage).toHaveBeenCalledWith('v2ContextSummary', {
        summary: 'Test context summary',
      });
    });

    it('should handle errors gracefully', () => {
      mockContextExtractor.getContextSummary.mockImplementation(() => {
        throw new Error('Test error');
      });

      coordinator.handleGetContextSummary();

      expect(mockMessageSender.sendMessage).toHaveBeenCalledWith('v2ContextSummary', {
        summary: null,
      });
    });
  });

  describe('pushInitialData', () => {
    beforeEach(async () => {
      await coordinator.initialize(mockContext, mockMessageSender, mockHandlerFinder, mockSharedContext);
      vi.clearAllMocks(); // Clear init calls
    });

    it('should push initial session data', () => {
      coordinator.pushInitialData();

      const sessionHandler = mockHandlerFinder.getSessionHandler();
      expect(sessionHandler?.handleMessage).toHaveBeenCalledWith('v2GetActiveSession', {});
      expect(sessionHandler?.handleMessage).toHaveBeenCalledWith('v2GetSessionList', { limit: 20 });
      expect(sessionHandler?.handleMessage).toHaveBeenCalledWith('v2GetDailyStats', {});
    });

    it('should send goal status', () => {
      coordinator.pushInitialData();

      expect(mockMessageSender.sendMessage).toHaveBeenCalledWith('v2GoalStatus', expect.any(Object));
    });
  });

  describe('dispose', () => {
    it('should clean up subscriptions', async () => {
      const suggestionUnsubscribe = vi.fn();
      const sessionUnsubscribe = vi.fn();
      const coachingUnsubscribe = vi.fn();

      mockSuggestionEngine.subscribe.mockReturnValue(suggestionUnsubscribe);
      mockSessionManager.subscribe.mockReturnValue(sessionUnsubscribe);
      mockCoachingService.subscribe.mockReturnValue(coachingUnsubscribe);

      await coordinator.initialize(mockContext, mockMessageSender, mockHandlerFinder, mockSharedContext);
      coordinator.dispose();

      expect(suggestionUnsubscribe).toHaveBeenCalled();
      expect(sessionUnsubscribe).toHaveBeenCalled();
      expect(coachingUnsubscribe).toHaveBeenCalled();
    });

    it('should handle dispose before initialize', () => {
      // Should not throw
      expect(() => coordinator.dispose()).not.toThrow();
    });
  });

  describe('responseAnalysis setting', () => {
    let responseDetectedCallback: ((data: { response: unknown; linkedPrompt?: unknown }) => Promise<void>) | null = null;
    let mockLocalSettingsService: { getWithDefault: Mock };

    beforeEach(async () => {
      // Create a local mock settings service for these tests
      mockLocalSettingsService = {
        getWithDefault: vi.fn().mockReturnValue(true),
      };
      (ExtensionState.getUnifiedSettingsService as Mock).mockReturnValue(mockLocalSettingsService);

      // Capture the responseDetected callback
      mockHookService.on.mockImplementation((event: string, callback: unknown) => {
        if (event === 'responseDetected') {
          responseDetectedCallback = callback as typeof responseDetectedCallback;
        }
      });

      await coordinator.initialize(mockContext, mockMessageSender, mockHandlerFinder, mockSharedContext);
    });

    afterEach(() => {
      responseDetectedCallback = null;
    });

    it('should skip coaching when responseAnalysis.enabled is false', async () => {
      mockLocalSettingsService.getWithDefault.mockReturnValue(false);

      await responseDetectedCallback?.({
        response: { id: 'test-response-1' },
        linkedPrompt: { id: 'test-prompt-1' },
      });

      expect(mockLocalSettingsService.getWithDefault).toHaveBeenCalledWith('responseAnalysis.enabled', true);
      expect(mockCoachingService.processResponse).not.toHaveBeenCalled();
    });

    it('should process coaching when responseAnalysis.enabled is true', async () => {
      mockLocalSettingsService.getWithDefault.mockReturnValue(true);

      const mockResponse = { id: 'test-response-2' };
      const mockLinkedPrompt = { id: 'test-prompt-2' };

      await responseDetectedCallback?.({
        response: mockResponse,
        linkedPrompt: mockLinkedPrompt,
      });

      expect(mockLocalSettingsService.getWithDefault).toHaveBeenCalledWith('responseAnalysis.enabled', true);
      expect(mockCoachingService.processResponse).toHaveBeenCalledWith(mockResponse, mockLinkedPrompt);
    });
  });
});
