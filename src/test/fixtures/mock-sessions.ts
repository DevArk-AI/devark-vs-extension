/**
 * Mock Session Data Fixtures
 *
 * Provides realistic test data for testing summary generation,
 * provider detection, and integration scenarios.
 */

import { CursorSession } from '../../cursor-integration/types';

/**
 * Sample session for frontend React work
 */
export const frontendSession: CursorSession = {
  sessionId: 'session-frontend-1',
  workspaceName: 'my-react-app',
  workspacePath: '/Users/dev/projects/my-react-app',
  startTime: new Date('2025-01-15T09:00:00Z'),
  lastActivity: new Date('2025-01-15T11:30:00Z'),
  promptCount: 15,
  status: 'historical',
  fileContext: [
    'src/components/LoginForm.tsx',
    'src/components/Button.tsx',
    'src/components/Input.tsx',
    'src/styles/theme.css',
    'src/hooks/useAuth.ts'
  ]
};

/**
 * Sample session for backend API work
 */
export const backendSession: CursorSession = {
  sessionId: 'session-backend-1',
  workspaceName: 'api-server',
  workspacePath: '/Users/dev/projects/api-server',
  startTime: new Date('2025-01-15T14:00:00Z'),
  lastActivity: new Date('2025-01-15T16:45:00Z'),
  promptCount: 22,
  status: 'historical',
  fileContext: [
    'src/auth/oauth.ts',
    'src/auth/jwt.ts',
    'src/middleware/auth.ts',
    'src/routes/users.ts',
    'tests/auth.test.ts',
    'tests/users.test.ts'
  ]
};

/**
 * Sample session for database work
 */
export const databaseSession: CursorSession = {
  sessionId: 'session-database-1',
  workspaceName: 'data-pipeline',
  workspacePath: '/Users/dev/projects/data-pipeline',
  startTime: new Date('2025-01-15T10:00:00Z'),
  lastActivity: new Date('2025-01-15T12:30:00Z'),
  promptCount: 18,
  status: 'historical',
  fileContext: [
    'migrations/001_add_users_table.sql',
    'migrations/002_add_sessions_table.sql',
    'src/db/schema.ts',
    'src/db/queries.ts',
    'src/models/User.ts'
  ]
};

/**
 * Sample session for testing/debugging work
 */
export const testingSession: CursorSession = {
  sessionId: 'session-testing-1',
  workspaceName: 'my-app',
  workspacePath: '/Users/dev/projects/my-app',
  startTime: new Date('2025-01-15T15:00:00Z'),
  lastActivity: new Date('2025-01-15T17:00:00Z'),
  promptCount: 12,
  status: 'historical',
  fileContext: [
    'tests/unit/auth.test.ts',
    'tests/integration/api.test.ts',
    'tests/fixtures/users.ts',
    'src/utils/testHelpers.ts'
  ]
};

/**
 * Short session (just above minimum 4 minutes)
 */
export const shortSession: CursorSession = {
  sessionId: 'session-short-1',
  workspaceName: 'quick-fix',
  workspacePath: '/Users/dev/projects/quick-fix',
  startTime: new Date('2025-01-15T16:00:00Z'),
  lastActivity: new Date('2025-01-15T16:05:00Z'),
  promptCount: 2,
  status: 'historical',
  fileContext: ['src/config.ts']
};

/**
 * Long session (several hours)
 */
export const longSession: CursorSession = {
  sessionId: 'session-long-1',
  workspaceName: 'major-refactor',
  workspacePath: '/Users/dev/projects/major-refactor',
  startTime: new Date('2025-01-15T09:00:00Z'),
  lastActivity: new Date('2025-01-15T17:00:00Z'),
  promptCount: 65,
  status: 'historical',
  fileContext: [
    'src/services/UserService.ts',
    'src/services/AuthService.ts',
    'src/services/EmailService.ts',
    'src/models/User.ts',
    'src/models/Session.ts',
    'src/models/Token.ts',
    'src/controllers/AuthController.ts',
    'src/controllers/UserController.ts',
    'src/routes/auth.ts',
    'src/routes/users.ts',
    'tests/services/UserService.test.ts',
    'tests/services/AuthService.test.ts',
    'tests/integration/auth.test.ts',
    'tests/integration/users.test.ts',
    'docs/api.md',
    'README.md'
  ]
};

/**
 * Session with no file context
 */
export const sessionWithoutFiles: CursorSession = {
  sessionId: 'session-no-files-1',
  workspaceName: 'exploration',
  workspacePath: '/Users/dev/projects/exploration',
  startTime: new Date('2025-01-15T10:00:00Z'),
  lastActivity: new Date('2025-01-15T10:30:00Z'),
  promptCount: 5,
  status: 'historical',
  fileContext: []
};

/**
 * Active session (currently ongoing)
 */
export const activeSession: CursorSession = {
  sessionId: 'session-active-1',
  workspaceName: 'current-work',
  workspacePath: '/Users/dev/projects/current-work',
  startTime: new Date(), // Now
  lastActivity: new Date(), // Now
  promptCount: 8,
  status: 'active',
  fileContext: [
    'src/features/newFeature.ts',
    'tests/newFeature.test.ts'
  ]
};

/**
 * Collection of multiple sessions for a productive day
 */
export const productiveDaySessions: CursorSession[] = [
  frontendSession,
  backendSession,
  testingSession
];

/**
 * Collection of sessions across multiple projects
 */
export const multiProjectSessions: CursorSession[] = [
  frontendSession,
  backendSession,
  databaseSession,
  testingSession
];

/**
 * Collection with a mix of short and long sessions
 */
export const mixedDurationSessions: CursorSession[] = [
  shortSession,
  frontendSession,
  longSession
];

/**
 * Empty session list (for testing edge cases)
 */
export const emptySessions: CursorSession[] = [];

/**
 * Single session list
 */
export const singleSession: CursorSession[] = [frontendSession];

/**
 * Create a custom session with specified properties
 */
export function createMockSession(overrides: Partial<CursorSession> = {}): CursorSession {
  return {
    sessionId: `session-${Date.now()}`,
    workspaceName: 'test-project',
    workspacePath: '/Users/dev/projects/test-project',
    startTime: new Date(),
    lastActivity: new Date(Date.now() + 3600000), // 1 hour later
    promptCount: 10,
    status: 'historical',
    fileContext: ['src/test.ts'],
    ...overrides
  };
}

/**
 * Create multiple mock sessions with a time range
 */
export function createMockSessionsInRange(
  count: number,
  startDate: Date,
  endDate: Date
): CursorSession[] {
  const sessions: CursorSession[] = [];
  const timeSpan = endDate.getTime() - startDate.getTime();
  const interval = timeSpan / count;

  for (let i = 0; i < count; i++) {
    const sessionStart = new Date(startDate.getTime() + (interval * i));
    const sessionEnd = new Date(sessionStart.getTime() + 3600000); // 1 hour sessions

    sessions.push(createMockSession({
      sessionId: `session-range-${i}`,
      workspaceName: `project-${i % 3}`, // Rotate through 3 projects
      startTime: sessionStart,
      lastActivity: sessionEnd,
      promptCount: Math.floor(Math.random() * 30) + 5 // 5-35 prompts
    }));
  }

  return sessions;
}

/**
 * Session data for testing specific scenarios
 */
export const scenarioSessions = {
  /**
   * Sessions for testing AI prompt generation
   */
  aiPromptTest: {
    single: [frontendSession],
    multiple: productiveDaySessions,
    empty: emptySessions
  },

  /**
   * Sessions for testing fallback behavior
   */
  fallbackTest: {
    noFiles: [sessionWithoutFiles],
    shortSession: [shortSession],
    minimal: [createMockSession({ promptCount: 1, fileContext: [] })]
  },

  /**
   * Sessions for testing edge cases
   */
  edgeCases: {
    veryOld: [createMockSession({
      startTime: new Date('2020-01-01T00:00:00Z'),
      lastActivity: new Date('2020-01-01T01:00:00Z')
    })],
    future: [createMockSession({
      startTime: new Date('2030-01-01T00:00:00Z'),
      lastActivity: new Date('2030-01-01T01:00:00Z')
    })],
    invalidDuration: [createMockSession({
      startTime: new Date('2025-01-15T10:00:00Z'),
      lastActivity: new Date('2025-01-15T09:00:00Z') // End before start
    })],
    zeroPrompts: [createMockSession({ promptCount: 0 })],
    manyPrompts: [createMockSession({ promptCount: 1000 })],
    manyFiles: [createMockSession({
      fileContext: Array.from({ length: 100 }, (_, i) => `src/file${i}.ts`)
    })]
  },

  /**
   * Sessions for testing performance
   */
  performance: {
    small: createMockSessionsInRange(5, new Date('2025-01-15'), new Date('2025-01-15T05:00:00')),
    medium: createMockSessionsInRange(20, new Date('2025-01-15'), new Date('2025-01-15T20:00:00')),
    large: createMockSessionsInRange(100, new Date('2025-01-10'), new Date('2025-01-15'))
  }
};

/**
 * Create weekly sessions with realistic distribution
 *
 * @param startDate - Start of week (Monday)
 * @param endDate - End of week (Sunday)
 * @returns Array of sessions spread across the week
 */
export function generateWeeklySessions(
  startDate: Date = new Date('2025-01-06'), // Monday
  endDate: Date = new Date('2025-01-12') // Sunday
): CursorSession[] {
  const sessions: CursorSession[] = [];
  const projects = ['frontend-app', 'backend-api', 'mobile-app'];

  // Monday - 3 sessions (high activity)
  const monday = new Date(startDate);
  sessions.push(
    createMockSession({
      sessionId: 'week-mon-1',
      workspaceName: projects[0],
      startTime: new Date(monday.setHours(9, 0, 0)),
      lastActivity: new Date(monday.setHours(11, 30, 0)),
      promptCount: 25,
      fileContext: ['src/components/Header.tsx', 'src/styles/main.css']
    }),
    createMockSession({
      sessionId: 'week-mon-2',
      workspaceName: projects[1],
      startTime: new Date(monday.setHours(14, 0, 0)),
      lastActivity: new Date(monday.setHours(16, 45, 0)),
      promptCount: 18,
      fileContext: ['src/routes/api.ts', 'src/middleware/auth.ts']
    }),
    createMockSession({
      sessionId: 'week-mon-3',
      workspaceName: projects[0],
      startTime: new Date(monday.setHours(19, 0, 0)),
      lastActivity: new Date(monday.setHours(20, 30, 0)),
      promptCount: 12
    })
  );

  // Tuesday - 2 sessions
  const tuesday = new Date(startDate);
  tuesday.setDate(tuesday.getDate() + 1);
  sessions.push(
    createMockSession({
      sessionId: 'week-tue-1',
      workspaceName: projects[1],
      startTime: new Date(tuesday.setHours(10, 0, 0)),
      lastActivity: new Date(tuesday.setHours(12, 30, 0)),
      promptCount: 20
    }),
    createMockSession({
      sessionId: 'week-tue-2',
      workspaceName: projects[2],
      startTime: new Date(tuesday.setHours(15, 0, 0)),
      lastActivity: new Date(tuesday.setHours(17, 0, 0)),
      promptCount: 15
    })
  );

  // Wednesday - 2 sessions
  const wednesday = new Date(startDate);
  wednesday.setDate(wednesday.getDate() + 2);
  sessions.push(
    createMockSession({
      sessionId: 'week-wed-1',
      workspaceName: projects[0],
      startTime: new Date(wednesday.setHours(9, 30, 0)),
      lastActivity: new Date(wednesday.setHours(13, 0, 0)),
      promptCount: 30
    }),
    createMockSession({
      sessionId: 'week-wed-2',
      workspaceName: projects[1],
      startTime: new Date(wednesday.setHours(14, 0, 0)),
      lastActivity: new Date(wednesday.setHours(16, 0, 0)),
      promptCount: 16
    })
  );

  // Thursday - 1 session (lighter day)
  const thursday = new Date(startDate);
  thursday.setDate(thursday.getDate() + 3);
  sessions.push(
    createMockSession({
      sessionId: 'week-thu-1',
      workspaceName: projects[2],
      startTime: new Date(thursday.setHours(10, 0, 0)),
      lastActivity: new Date(thursday.setHours(11, 30, 0)),
      promptCount: 10
    })
  );

  // Friday - 3 sessions (wrapping up week)
  const friday = new Date(startDate);
  friday.setDate(friday.getDate() + 4);
  sessions.push(
    createMockSession({
      sessionId: 'week-fri-1',
      workspaceName: projects[0],
      startTime: new Date(friday.setHours(9, 0, 0)),
      lastActivity: new Date(friday.setHours(11, 0, 0)),
      promptCount: 22
    }),
    createMockSession({
      sessionId: 'week-fri-2',
      workspaceName: projects[1],
      startTime: new Date(friday.setHours(13, 0, 0)),
      lastActivity: new Date(friday.setHours(15, 30, 0)),
      promptCount: 19
    }),
    createMockSession({
      sessionId: 'week-fri-3',
      workspaceName: projects[0],
      startTime: new Date(friday.setHours(16, 0, 0)),
      lastActivity: new Date(friday.setHours(17, 30, 0)),
      promptCount: 14
    })
  );

  // Saturday - no sessions (weekend break)

  // Sunday - 1 session (light catch-up work)
  const sunday = new Date(endDate);
  sessions.push(
    createMockSession({
      sessionId: 'week-sun-1',
      workspaceName: projects[0],
      startTime: new Date(sunday.setHours(15, 0, 0)),
      lastActivity: new Date(sunday.setHours(16, 30, 0)),
      promptCount: 8
    })
  );

  return sessions;
}

/**
 * Create monthly sessions with realistic distribution
 *
 * @param year - Year
 * @param month - Month (0-11, where 0 = January)
 * @returns Array of sessions spread across the month
 */
export function generateMonthlySessions(
  year: number = 2025,
  month: number = 0 // January
): CursorSession[] {
  const sessions: CursorSession[] = [];
  const projects = ['frontend-app', 'backend-api', 'mobile-app', 'data-pipeline'];

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Generate sessions with realistic patterns
  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = new Date(year, month, day);
    const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday

    // Skip most weekends (but occasionally work on Sundays)
    if (dayOfWeek === 6) continue; // No Saturday sessions
    if (dayOfWeek === 0 && Math.random() > 0.3) continue; // 30% chance of Sunday work

    // Determine number of sessions for the day (1-3)
    let sessionsPerDay = 1;
    if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Weekdays
      sessionsPerDay = Math.floor(Math.random() * 3) + 1; // 1-3 sessions
    }

    for (let i = 0; i < sessionsPerDay; i++) {
      const project = projects[Math.floor(Math.random() * projects.length)];
      const startHour = 9 + (i * 4) + Math.floor(Math.random() * 2); // Spread throughout day
      const durationHours = 1 + Math.random() * 2.5; // 1-3.5 hours

      const startTime = new Date(year, month, day, startHour, 0, 0);
      const lastActivity = new Date(startTime.getTime() + durationHours * 3600000);
      const promptCount = Math.floor(10 + Math.random() * 30); // 10-40 prompts

      sessions.push(
        createMockSession({
          sessionId: `month-${year}-${month}-${day}-${i}`,
          workspaceName: project,
          startTime,
          lastActivity,
          promptCount,
          fileContext: generateRandomFiles(Math.floor(Math.random() * 5) + 1)
        })
      );
    }
  }

  return sessions;
}

/**
 * Generate random file paths for sessions
 */
function generateRandomFiles(count: number): string[] {
  const fileTypes = ['ts', 'tsx', 'js', 'jsx', 'css', 'json'];
  const directories = ['src/components', 'src/services', 'src/utils', 'tests', 'src/api'];
  const files: string[] = [];

  for (let i = 0; i < count; i++) {
    const dir = directories[Math.floor(Math.random() * directories.length)];
    const ext = fileTypes[Math.floor(Math.random() * fileTypes.length)];
    const name = `file${i + 1}.${ext}`;
    files.push(`${dir}/${name}`);
  }

  return files;
}

/**
 * Create weekly sessions with specific patterns for testing
 */
export const weeklyTestCollections = {
  /**
   * High-activity week with multiple projects
   */
  productiveWeek: generateWeeklySessions(new Date('2025-01-06'), new Date('2025-01-12')),

  /**
   * Light week with only 3 sessions
   */
  lightWeek: [
    createMockSession({ startTime: new Date('2025-01-06T10:00:00Z'), promptCount: 10 }),
    createMockSession({ startTime: new Date('2025-01-08T10:00:00Z'), promptCount: 12 }),
    createMockSession({ startTime: new Date('2025-01-10T10:00:00Z'), promptCount: 8 })
  ],

  /**
   * Week with focus on single project
   */
  focusedWeek: Array.from({ length: 10 }, (_, i) =>
    createMockSession({
      workspaceName: 'main-project',
      startTime: new Date(`2025-01-0${6 + Math.floor(i / 2)}T${10 + (i % 2) * 4}:00:00Z`),
      promptCount: 15 + Math.floor(Math.random() * 10)
    })
  )
};

/**
 * Create monthly sessions with specific patterns for testing
 */
export const monthlyTestCollections = {
  /**
   * Full January 2025 (31 days)
   */
  fullMonth: generateMonthlySessions(2025, 0),

  /**
   * Partial month (first 2 weeks only)
   */
  partialMonth: generateMonthlySessions(2025, 0).slice(0, 15),

  /**
   * High-intensity month (2-3 sessions per weekday)
   */
  highIntensity: Array.from({ length: 50 }, (_, i) => {
    const day = Math.floor(i / 2) + 1;
    return createMockSession({
      startTime: new Date(`2025-01-${day.toString().padStart(2, '0')}T${10 + (i % 2) * 5}:00:00Z`),
      promptCount: 20 + Math.floor(Math.random() * 20)
    });
  })
};

/**
 * Expected AI responses for testing (mock LLM outputs)
 */
export const mockAIResponses = {
  /**
   * Valid JSON response
   */
  validJSON: JSON.stringify({
    accomplishments: [
      'Built authentication system with OAuth integration',
      'Added user login and registration forms',
      'Implemented JWT token validation middleware'
    ],
    suggestedFocus: [
      'Write unit tests for authentication flows',
      'Add error handling for failed login attempts',
      'Implement password reset functionality'
    ],
    insights: 'Strong focus on security implementation. Consider adding rate limiting to prevent brute force attacks.'
  }),

  /**
   * Valid JSON with snake_case (alternative format)
   */
  validJSONSnakeCase: JSON.stringify({
    accomplishments: [
      'Refactored database queries for better performance',
      'Added connection pooling'
    ],
    suggested_focus: [
      'Monitor query performance in production',
      'Add database indexes'
    ],
    insights: 'Good database optimization work'
  }),

  /**
   * JSON wrapped in markdown code block
   */
  jsonInMarkdown: `\`\`\`json
{
  "accomplishments": [
    "Fixed authentication bug",
    "Updated documentation"
  ],
  "suggestedFocus": [
    "Deploy to production",
    "Monitor error rates"
  ]
}
\`\`\``,

  /**
   * Plain text response (no JSON)
   */
  plainText: `
The developer worked on:
- Authentication system improvements
- Added OAuth integration
- Improved error handling

Suggested next steps:
- Write comprehensive tests
- Update API documentation
- Consider adding rate limiting

Additional insights:
The work shows good attention to security practices.
  `.trim(),

  /**
   * Malformed JSON (missing closing brace)
   */
  malformedJSON: `{
    "accomplishments": [
      "Some work"
    ],
    "suggestedFocus": [
      "More work"
    ]
  `,

  /**
   * Empty response
   */
  empty: '',

  /**
   * Response with only whitespace
   */
  whitespace: '   \n\n\t   ',

  /**
   * Very short response
   */
  minimal: 'Worked on code',

  /**
   * Response with special characters
   */
  specialChars: JSON.stringify({
    accomplishments: [
      'Fixed bug in "authentication" module',
      'Added support for <special> characters & symbols',
      'Handled edge case: null/undefined values'
    ],
    suggestedFocus: [
      'Test with real-world data (including UTF-8)',
      'Review security implications'
    ]
  })
};
