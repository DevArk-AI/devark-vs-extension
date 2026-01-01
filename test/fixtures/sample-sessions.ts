/**
 * Sample Sessions
 *
 * Test fixtures for session-related tests.
 */

import type { SessionData, ToolType, Message } from '../../src/types';
import { createConversation } from './sample-messages';

/**
 * Create a sample session with sensible defaults
 */
export function createSession(overrides: Partial<SessionData> = {}): SessionData {
  const timestamp = overrides.timestamp ?? new Date('2024-01-15T10:00:00Z');
  const messages = overrides.messages ?? createConversation(4, timestamp);

  return {
    id: overrides.id ?? 'session-' + Math.random().toString(36).slice(2, 10),
    projectPath: overrides.projectPath ?? '/home/user/projects/my-app',
    timestamp,
    messages,
    duration: overrides.duration ?? 3600, // 1 hour
    tool: overrides.tool ?? 'claude_code',
    metadata: overrides.metadata ?? {
      files_edited: 5,
      languages: ['typescript', 'json'],
    },
    ...overrides,
  };
}

/**
 * Create multiple sessions
 */
export function createSessions(
  count: number,
  baseOverrides: Partial<SessionData> = {}
): SessionData[] {
  const sessions: SessionData[] = [];
  const baseTime = baseOverrides.timestamp ?? new Date('2024-01-01T10:00:00Z');

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(baseTime.getTime() + i * 24 * 60 * 60 * 1000); // 1 day apart
    sessions.push(
      createSession({
        ...baseOverrides,
        id: `session-${i + 1}`,
        timestamp,
      })
    );
  }

  return sessions;
}

/**
 * Sample sessions for different scenarios
 */
export const SAMPLE_SESSIONS = {
  /**
   * Basic Claude Code session
   */
  basic: createSession({
    id: 'basic-session',
    projectPath: '/home/user/projects/basic-app',
    duration: 1800, // 30 minutes
    metadata: {
      files_edited: 3,
      languages: ['javascript'],
    },
  }),

  /**
   * Session with model tracking
   */
  withModelInfo: createSession({
    id: 'model-session',
    modelInfo: {
      models: ['claude-3-5-sonnet', 'claude-3-opus'],
      primaryModel: 'claude-3-5-sonnet',
      modelUsage: {
        'claude-3-5-sonnet': 15,
        'claude-3-opus': 5,
      },
      modelSwitches: 2,
    },
  }),

  /**
   * Session with planning mode
   */
  withPlanningMode: createSession({
    id: 'planning-session',
    planningModeInfo: {
      hasPlanningMode: true,
      planningCycles: 2,
      exitPlanTimestamps: [
        new Date('2024-01-15T10:30:00Z'),
        new Date('2024-01-15T11:00:00Z'),
      ],
    },
  }),

  /**
   * Long-running session (8 hours)
   */
  longRunning: createSession({
    id: 'long-session',
    duration: 8 * 60 * 60, // 8 hours
    messages: createConversation(100),
    metadata: {
      files_edited: 50,
      languages: ['typescript', 'python', 'rust', 'go'],
    },
  }),

  /**
   * Short session (under 4 minutes - should be filtered by API)
   */
  tooShort: createSession({
    id: 'short-session',
    duration: 180, // 3 minutes
    messages: createConversation(2),
  }),

  /**
   * Session from Cursor
   */
  cursor: createSession({
    id: 'cursor-session',
    tool: 'cursor',
    projectPath: '/home/user/projects/cursor-project',
  }),

  /**
   * Session with git branch
   */
  withGitBranch: createSession({
    id: 'git-session',
    gitBranch: 'feature/new-feature',
  }),

  /**
   * Session with source file info (for re-reading)
   */
  withSourceFile: createSession({
    id: 'sourced-session',
    sourceFile: {
      claudeProjectPath: '/home/user/.claude/projects/-home-user-projects-my-app',
      sessionFile: 'session-abc123.jsonl',
    },
  }),
};

/**
 * Sessions for filtering tests
 */
export const FILTER_TEST_SESSIONS = [
  createSession({
    id: 'old-session',
    timestamp: new Date('2024-01-01T10:00:00Z'),
    projectPath: '/home/user/project-a',
  }),
  createSession({
    id: 'recent-session',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    projectPath: '/home/user/project-a',
  }),
  createSession({
    id: 'different-project',
    timestamp: new Date('2024-01-10T10:00:00Z'),
    projectPath: '/home/user/project-b',
  }),
  createSession({
    id: 'newest-session',
    timestamp: new Date('2024-01-20T10:00:00Z'),
    projectPath: '/home/user/project-a/subdir',
  }),
];

/**
 * Sample JSONL content (as would appear in Claude Code session files)
 */
export const SAMPLE_JSONL = {
  singleSession: `{"sessionId":"abc123","cwd":"/home/user/project","timestamp":"2024-01-15T10:00:00Z","gitBranch":"main"}
{"message":{"role":"user","content":"Hello"},"timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"assistant","content":"Hi there!","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:00:30Z"}
{"toolUseResult":{"type":"update","filePath":"/home/user/project/src/index.ts"}}`,

  withPlanningMode: `{"sessionId":"def456","cwd":"/home/user/project","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"Plan a feature"},"timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"assistant","content":[{"type":"tool_use","name":"EnterPlanMode"}],"model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:01:00Z"}
{"message":{"role":"assistant","content":[{"type":"tool_use","name":"ExitPlanMode"}],"model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:05:00Z"}`,

  empty: '',

  invalidJson: `{"valid":"json"}
not valid json at all
{"also":"valid"}`,
};
