/**
 * Mock Provider State Fixtures
 *
 * Provides mock provider configurations and states for testing
 * provider detection, switching, and AI summary integration.
 */

import { ProviderStatus } from '../../services/ProviderDetectionService';
import type { ProviderMetadata } from '../../llm/provider-registry';

/**
 * Mock provider status: Claude Agent SDK detected and connected
 */
export const claudeCodeConnected: ProviderStatus = {
  id: 'claude-agent-sdk',
  name: 'Claude Agent SDK',
  type: 'local',
  status: 'connected',
  model: 'claude-sonnet-3.5',
  description: 'Your Claude subscription',
  requiresApiKey: false
};

/**
 * Mock provider status: Claude Agent SDK available but not active
 */
export const claudeCodeAvailable: ProviderStatus = {
  id: 'claude-agent-sdk',
  name: 'Claude Agent SDK',
  type: 'local',
  status: 'available',
  description: 'Your Claude subscription',
  requiresApiKey: false
};

/**
 * Mock provider status: Claude Agent SDK not detected
 */
export const claudeCodeNotDetected: ProviderStatus = {
  id: 'claude-agent-sdk',
  name: 'Claude Agent SDK',
  type: 'local',
  status: 'not-detected',
  description: 'Your Claude subscription',
  requiresApiKey: false
};

/**
 * Mock provider status: Cursor CLI connected
 */
export const cursorConnected: ProviderStatus = {
  id: 'cursor-cli',
  name: 'Cursor CLI',
  type: 'local',
  status: 'connected',
  model: 'cursor-default',
  description: 'Your Cursor subscription',
  requiresApiKey: true
};

/**
 * Mock provider status: Cursor CLI available but not configured
 */
export const cursorNotConfigured: ProviderStatus = {
  id: 'cursor-cli',
  name: 'Cursor CLI',
  type: 'local',
  status: 'not-configured',
  description: 'Your Cursor subscription',
  requiresApiKey: true
};

/**
 * Mock provider status: Ollama connected
 */
export const ollamaConnected: ProviderStatus = {
  id: 'ollama',
  name: 'Ollama',
  type: 'local',
  status: 'connected',
  model: 'codellama:7b',
  availableModels: [
    'codellama:7b',
    'codellama:13b',
    'deepseek-coder:6.7b',
    'llama3.2:3b'
  ],
  description: 'Free, local, private',
  requiresApiKey: false
};

/**
 * Mock provider status: Ollama server not running
 */
export const ollamaNotRunning: ProviderStatus = {
  id: 'ollama',
  name: 'Ollama',
  type: 'local',
  status: 'not-running',
  description: 'Free, local, private',
  requiresApiKey: false
};

/**
 * Mock provider status: OpenRouter not configured
 */
export const openRouterNotConfigured: ProviderStatus = {
  id: 'openrouter',
  name: 'OpenRouter',
  type: 'cloud',
  status: 'not-configured',
  description: 'Needs API key',
  requiresApiKey: true
};

/**
 * Mock provider status: OpenRouter connected
 */
export const openRouterConnected: ProviderStatus = {
  id: 'openrouter',
  name: 'OpenRouter',
  type: 'cloud',
  status: 'connected',
  model: 'test/mock-model',
  description: 'Needs API key',
  requiresApiKey: true
};

/**
 * Collection of all providers in different states
 */
export const providerCollections = {
  /**
   * Scenario: Claude Code is the only provider available
   */
  claudeCodeOnly: [
    claudeCodeConnected,
    cursorNotConfigured,
    ollamaNotRunning,
    openRouterNotConfigured
  ],

  /**
   * Scenario: Cursor is the only provider available
   */
  cursorOnly: [
    claudeCodeNotDetected,
    cursorConnected,
    ollamaNotRunning,
    openRouterNotConfigured
  ],

  /**
   * Scenario: Ollama is the only provider available
   */
  ollamaOnly: [
    claudeCodeNotDetected,
    cursorNotConfigured,
    ollamaConnected,
    openRouterNotConfigured
  ],

  /**
   * Scenario: Multiple providers available
   */
  multipleAvailable: [
    claudeCodeConnected,
    cursorConnected,
    ollamaConnected,
    openRouterNotConfigured
  ],

  /**
   * Scenario: All providers connected
   */
  allConnected: [
    claudeCodeConnected,
    cursorConnected,
    ollamaConnected,
    openRouterConnected
  ],

  /**
   * Scenario: No providers available
   */
  noneAvailable: [
    claudeCodeNotDetected,
    cursorNotConfigured,
    ollamaNotRunning,
    openRouterNotConfigured
  ],

  /**
   * Scenario: Providers available but not connected
   */
  availableButNotConnected: [
    claudeCodeAvailable,
    cursorNotConfigured,
    ollamaNotRunning,
    openRouterNotConfigured
  ]
};

/**
 * Mock provider metadata for testing registry
 */
export const mockProviderMetadata: Record<string, ProviderMetadata> = {
  'claude-agent-sdk': {
    id: 'claude-agent-sdk',
    displayName: 'Claude Agent SDK',
    description: 'Claude Agent SDK',
    requiresAuth: false,
    supportsStreaming: true,
    supportsCostTracking: false,
    configSchema: {
      enabled: { type: 'boolean', required: false, default: false }
    }
  },

  'cursor-cli': {
    id: 'cursor-cli',
    displayName: 'Cursor CLI',
    description: 'Cursor command-line interface',
    requiresAuth: true,
    supportsStreaming: true,
    supportsCostTracking: false,
    configSchema: {
      enabled: { type: 'boolean', required: false, default: false }
    }
  },

  ollama: {
    id: 'ollama',
    displayName: 'Ollama',
    description: 'Local Ollama server',
    requiresAuth: false,
    supportsStreaming: true,
    supportsCostTracking: false,
    configSchema: {
      enabled: { type: 'boolean', required: false, default: true },
      endpoint: { type: 'string', required: false, default: 'http://localhost:11434' },
      model: { type: 'string', required: false, default: 'codellama:7b' },
      temperature: { type: 'number', required: false, default: 0.3 },
      maxTokens: { type: 'number', required: false, default: 500 }
    }
  },

  openrouter: {
    id: 'openrouter',
    displayName: 'OpenRouter',
    description: 'OpenRouter cloud API',
    requiresAuth: true,
    supportsStreaming: true,
    supportsCostTracking: true,
    configSchema: {
      enabled: { type: 'boolean', required: false, default: false },
      model: { type: 'string', required: true },
      temperature: { type: 'number', required: false, default: 0.3 },
      maxTokens: { type: 'number', required: false, default: 500 }
    }
  }
};

/**
 * Mock configuration objects for testing
 */
export const mockProviderConfigs = {
  claudeCode: {
    enabled: true
  },

  cursor: {
    enabled: true
  },

  ollama: {
    enabled: true,
    endpoint: 'http://localhost:11434',
    model: 'codellama:7b',
    temperature: 0.3,
    maxTokens: 500
  },

  openrouter: {
    enabled: true,
    model: 'test/mock-model',
    temperature: 0.3,
    maxTokens: 500
  }
};

/**
 * Mock LLM responses by provider
 */
export const mockProviderResponses = {
  /**
   * Claude Code typical response (high quality)
   */
  claudeCode: {
    text: JSON.stringify({
      accomplishments: [
        'Implemented OAuth 2.0 authentication flow with GitHub provider',
        'Added JWT token generation and validation middleware',
        'Created user session management with Redis cache',
        'Wrote comprehensive integration tests for auth endpoints'
      ],
      suggestedFocus: [
        'Add refresh token rotation to enhance security',
        'Implement rate limiting on authentication endpoints',
        'Add email verification workflow for new users'
      ],
      insights: 'Strong foundation for authentication system. Consider adding multi-factor authentication support and implementing proper session invalidation on logout.'
    }),
    model: 'claude-sonnet-3.5',
    provider: 'claude-agent-sdk',
    timestamp: new Date(),
    usage: { promptTokens: 150, completionTokens: 95, totalTokens: 245 }
  },

  /**
   * Cursor typical response (good quality)
   */
  cursor: {
    text: JSON.stringify({
      accomplishments: [
        'Built user authentication system with OAuth',
        'Added JWT tokens for API security',
        'Created tests for authentication flow'
      ],
      suggestedFocus: [
        'Add password reset functionality',
        'Implement session timeout',
        'Add security headers'
      ],
      insights: 'Authentication is working well. Consider adding rate limiting.'
    }),
    model: 'cursor-default',
    provider: 'cursor-cli',
    timestamp: new Date(),
    usage: { promptTokens: 140, completionTokens: 70, totalTokens: 210 }
  },

  /**
   * Ollama 7B response (decent quality, shorter)
   */
  ollama7b: {
    text: JSON.stringify({
      accomplishments: [
        'Added OAuth authentication',
        'Created JWT middleware',
        'Wrote tests'
      ],
      suggestedFocus: [
        'Add more tests',
        'Improve error handling',
        'Document the API'
      ],
      insights: 'Good progress on authentication'
    }),
    model: 'codellama:7b',
    provider: 'ollama',
    timestamp: new Date()
  },

  /**
   * Ollama 13B response (better quality)
   */
  ollama13b: {
    text: JSON.stringify({
      accomplishments: [
        'Implemented OAuth 2.0 authentication with GitHub',
        'Added JWT token validation middleware',
        'Created user session management',
        'Wrote integration tests for auth flow'
      ],
      suggestedFocus: [
        'Add refresh token support',
        'Implement rate limiting',
        'Add email verification'
      ],
      insights: 'Solid authentication implementation. Consider adding 2FA support.'
    }),
    model: 'codellama:13b',
    provider: 'ollama',
    timestamp: new Date()
  },

  /**
   * OpenRouter response (high quality, similar to Claude)
   */
  openrouter: {
    text: JSON.stringify({
      accomplishments: [
        'Developed comprehensive OAuth 2.0 authentication system',
        'Implemented secure JWT token management',
        'Built Redis-backed session storage',
        'Added extensive test coverage for authentication'
      ],
      suggestedFocus: [
        'Implement refresh token rotation for enhanced security',
        'Add rate limiting to prevent brute force attacks',
        'Create email verification workflow'
      ],
      insights: 'Excellent work on authentication architecture. The use of Redis for session management is a good choice for scalability.'
    }),
    model: 'test/mock-model',
    provider: 'openrouter',
    timestamp: new Date(),
    usage: { promptTokens: 145, completionTokens: 90, totalTokens: 235 }
  }
};

/**
 * Mock error responses from providers
 */
export const mockProviderErrors = {
  /**
   * Connection timeout
   */
  timeout: {
    error: 'Request timeout',
    details: 'LLM provider did not respond within 30 seconds'
  },

  /**
   * API key invalid
   */
  authError: {
    error: 'Authentication failed',
    details: 'Invalid API key or token'
  },

  /**
   * Rate limit exceeded
   */
  rateLimitError: {
    error: 'Rate limit exceeded',
    details: 'Too many requests. Please try again later.'
  },

  /**
   * Model not found
   */
  modelNotFound: {
    error: 'Model not found',
    details: 'The requested model is not available'
  },

  /**
   * Network error
   */
  networkError: {
    error: 'Network error',
    details: 'Failed to connect to provider'
  },

  /**
   * Server error
   */
  serverError: {
    error: 'Internal server error',
    details: 'Provider returned 500 status code'
  }
};

/**
 * Helper function to create mock provider status
 */
export function createMockProviderStatus(
  overrides: Partial<ProviderStatus>
): ProviderStatus {
  return {
    id: 'mock-provider',
    name: 'Mock Provider',
    type: 'local',
    status: 'connected',
    description: 'Mock provider for testing',
    requiresApiKey: false,
    ...overrides
  };
}

/**
 * Helper function to create a collection of providers with one active
 */
export function createProviderCollectionWithActive(
  activeId: string
): ProviderStatus[] {
  const providers: ProviderStatus[] = [
    claudeCodeAvailable,
    cursorNotConfigured,
    ollamaNotRunning,
    openRouterNotConfigured
  ];

  return providers.map(p => {
    if (p.id === activeId) {
      return { ...p, status: 'connected' as const };
    }
    return p;
  });
}

/**
 * Test scenarios for provider states
 */
export const providerScenarios = {
  /**
   * Happy path: Provider detected and working
   */
  happyPath: {
    providers: providerCollections.claudeCodeOnly,
    activeProvider: 'claude-agent-sdk',
    expectedBehavior: 'AI summary generated successfully'
  },

  /**
   * Fallback: No providers available
   */
  noProviders: {
    providers: providerCollections.noneAvailable,
    activeProvider: null,
    expectedBehavior: 'Falls back to basic summary'
  },

  /**
   * Switch provider: Multiple available, user switches
   */
  switchProvider: {
    initial: providerCollections.claudeCodeOnly,
    target: 'ollama',
    final: providerCollections.ollamaOnly,
    expectedBehavior: 'Switches to Ollama successfully'
  },

  /**
   * Provider failure: Active provider stops working
   */
  providerFailure: {
    initialState: claudeCodeConnected,
    failureState: { ...claudeCodeConnected, status: 'not-detected' as const },
    expectedBehavior: 'Falls back to basic summary with error message'
  },

  /**
   * Provider recovery: Provider becomes available
   */
  providerRecovery: {
    initialState: ollamaNotRunning,
    recoveredState: ollamaConnected,
    expectedBehavior: 'Detects new provider and offers to use it'
  }
};
