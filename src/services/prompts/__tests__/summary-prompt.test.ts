/**
 * Daily Summary Prompt Builder Tests
 *
 * Tests for prompt construction including:
 * - Session data formatting
 * - Custom instructions integration
 * - Date formatting
 * - Edge cases
 */

import {
  buildDailySummaryPrompt,
  SYSTEM_PROMPT,
  getExamplePrompt
} from '../summary-prompt';
import { SummaryContext } from '../../SummaryService';
import {
  frontendSession,
  backendSession,
  productiveDaySessions,
  emptySessions,
  sessionWithoutFiles,
  shortSession,
  longSession,
  createMockSession
} from '../../../test/fixtures/mock-sessions';

describe('buildDailySummaryPrompt', () => {
  describe('Basic Prompt Generation', () => {
    test('should generate prompt with session data', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession, backendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format groups by project
      expect(prompt).toContain('Total Sessions: 2');
      expect(prompt).toContain('## Project:');
    });

    test('should include project names', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession, backendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      expect(prompt).toContain('my-react-app');
      expect(prompt).toContain('api-server');
    });

    test('should include file contexts', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format uses "Files Modified:" section
      expect(prompt).toContain('LoginForm.tsx');
      expect(prompt).toContain('Button.tsx');
      expect(prompt).toContain('Files Modified:');
    });

    test('should include prompt counts', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession], // Has 15 prompts
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      expect(prompt).toContain('Prompts: 15');
    });

    test('should include session durations', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession], // 2.5 hours
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format shows Total Time per project
      expect(prompt).toContain('Total Time:');
      expect(prompt).toMatch(/\d+h|\d+ min/);
    });

    test('should include session counts per project', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession], // status: 'historical'
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format shows Sessions count per project
      expect(prompt).toContain('Sessions: 1');
    });
  });

  describe('Date Formatting', () => {
    test('should format date in readable format', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      expect(prompt).toMatch(/Wednesday|Thursday|Friday|Saturday|Sunday|Monday|Tuesday/);
      expect(prompt).toContain('2025');
      expect(prompt).toMatch(/January|February|March|April|May|June|July|August|September|October|November|December/);
    });

    test('should handle different dates correctly', () => {
      // Arrange
      const dates = [
        new Date('2025-01-01'),
        new Date('2025-06-15'),
        new Date('2025-12-31')
      ];

      dates.forEach(date => {
        const context: SummaryContext = {
          sessions: [frontendSession],
          date
        };

        // Act
        const prompt = buildDailySummaryPrompt(context);

        // Assert
        expect(prompt).toContain('2025');
        expect(prompt).toMatch(/\w+, \w+ \d+, \d+/); // Format: "Wednesday, January 15, 2025"
      });
    });
  });

  describe('Custom Instructions', () => {
    test('should include custom instructions when provided', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15'),
        userInstructions: 'Focus on testing and code quality'
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      expect(prompt).toContain('Custom Instructions:');
      expect(prompt).toContain('Focus on testing and code quality');
    });

    test('should not include custom instructions section when undefined', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15'),
        userInstructions: undefined
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      expect(prompt).not.toContain('Custom Instructions:');
    });

    test('should not include custom instructions section when empty string', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15'),
        userInstructions: '   '
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      expect(prompt).not.toContain('Custom Instructions:');
    });

    test('should handle multi-line custom instructions', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15'),
        userInstructions: 'Focus on:\n- Testing coverage\n- Code quality\n- Performance'
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      expect(prompt).toContain('Custom Instructions:');
      expect(prompt).toContain('Focus on:');
      expect(prompt).toContain('Testing coverage');
      expect(prompt).toContain('Code quality');
      expect(prompt).toContain('Performance');
    });
  });

  describe('Aggregated Statistics', () => {
    test('should calculate total prompts correctly', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [
          frontendSession,  // 15 prompts
          backendSession    // 22 prompts
        ],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      expect(prompt).toContain('Total Prompts: 37');
    });

    test('should list projects in summary section', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [
          frontendSession,  // my-react-app
          backendSession    // api-server
        ],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format lists projects in Summary section
      expect(prompt).toContain('## Summary');
      expect(prompt).toContain('Projects:');
    });

    test('should list feature areas in summary section', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [
          frontendSession,  // 5 files
          backendSession    // 6 files
        ],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format shows Feature Areas instead of file count
      expect(prompt).toContain('Feature Areas:');
    });

    test('should list active projects', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: productiveDaySessions,
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format lists projects in Summary section
      expect(prompt).toContain('Projects:');
      expect(prompt).toContain('my-react-app');
      expect(prompt).toContain('api-server');
    });

    test('should handle duplicate project names', () => {
      // Arrange
      const session1 = createMockSession({ workspaceName: 'my-app' });
      const session2 = createMockSession({ workspaceName: 'my-app' });
      const session3 = createMockSession({ workspaceName: 'my-app' });

      const context: SummaryContext = {
        sessions: [session1, session2, session3],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format shows only one project section for same project
      expect(prompt).toContain('## Project: my-app');
      expect(prompt).toContain('Sessions: 3');
    });
  });

  describe('Output Format Instructions', () => {
    test('should include JSON output format instructions', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      expect(prompt).toContain('Output Format (JSON only, no markdown)');
      expect(prompt).toContain('"accomplishments"');
      expect(prompt).toContain('"suggestedFocus"');
      expect(prompt).toContain('"insights"');
    });

    test('should instruct to return only JSON', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      expect(prompt).toContain('Return ONLY the JSON object');
      expect(prompt).toContain('no additional text or markdown formatting');
    });

    test('should provide specific instructions for summary content', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format uses different instruction text
      expect(prompt).toContain('Be concrete and specific');
      expect(prompt).toContain('Name exact features');
      expect(prompt).toContain('Provide actionable next steps');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty sessions list', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: emptySessions,
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format only shows the message, no count
      expect(prompt).toContain('No sessions recorded for this day');
    });

    test('should handle session without file context', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [sessionWithoutFiles],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format omits Files Modified section when no files
      expect(prompt).not.toContain('Files Modified:');
    });

    test('should limit files shown per area', () => {
      // Arrange - use deeper paths to ensure same area grouping
      const manyFilesSession = createMockSession({
        fileContext: Array.from({ length: 20 }, (_, i) => `src/components/ui/file${i}.ts`)
      });

      const context: SummaryContext = {
        sessions: [manyFilesSession],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format groups by area and shows first 4 files with ellipsis
      expect(prompt).toContain('Files Modified:');
      expect(prompt).toContain('...');
    });

    test('should handle very short sessions', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [shortSession], // 5 minutes
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format shows Total Time per project
      expect(prompt).toContain('Total Time:');
      expect(prompt).toContain('min');
    });

    test('should handle very long sessions', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [longSession], // 8 hours
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format shows Total Time with hours
      expect(prompt).toContain('Total Time:');
      expect(prompt).toContain('h');
    });

    test('should handle sessions with zero prompts', () => {
      // Arrange
      const zeroPromptSession = createMockSession({ promptCount: 0 });
      const context: SummaryContext = {
        sessions: [zeroPromptSession],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      expect(prompt).toContain('Prompts: 0');
    });

    test('should handle sessions with many prompts', () => {
      // Arrange
      const manyPromptsSession = createMockSession({ promptCount: 500 });
      const context: SummaryContext = {
        sessions: [manyPromptsSession],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      expect(prompt).toContain('Prompts: 500');
      expect(prompt).toContain('Total Prompts: 500');
    });
  });

  describe('SYSTEM_PROMPT', () => {
    test('should define system prompt as string', () => {
      expect(typeof SYSTEM_PROMPT).toBe('string');
      expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });

    test('should include role definition', () => {
      expect(SYSTEM_PROMPT).toContain('software development analyst');
      expect(SYSTEM_PROMPT).toContain('coding sessions');
    });

    test('should include key guidelines', () => {
      expect(SYSTEM_PROMPT).toContain('BE SPECIFIC');
      expect(SYSTEM_PROMPT).toContain('NAME FEATURES');
      expect(SYSTEM_PROMPT).toContain('AVOID GENERIC STATEMENTS');
    });

    test('should instruct to return valid JSON only', () => {
      expect(SYSTEM_PROMPT).toContain('valid JSON only');
      expect(SYSTEM_PROMPT).toContain('no markdown');
    });
  });

  describe('getExamplePrompt', () => {
    test('should generate example prompt', () => {
      // Act
      const examplePrompt = getExamplePrompt();

      // Assert
      expect(examplePrompt).toBeTruthy();
      expect(examplePrompt).toContain('Total Sessions:');
      expect(examplePrompt).toContain('vibe-log-extension');
    });

    test('should include sample sessions', () => {
      // Act
      const examplePrompt = getExamplePrompt();

      // Assert - new format groups by project
      expect(examplePrompt).toContain('## Project:');
      expect(examplePrompt).toContain('SummaryService.ts');
      expect(examplePrompt).toContain('V2MessageHandler.ts');
    });

    test('should include custom instructions in example', () => {
      // Act
      const examplePrompt = getExamplePrompt();

      // Assert
      expect(examplePrompt).toContain('Custom Instructions:');
      expect(examplePrompt).toContain('Focus on code quality and testing');
    });

    test('should be a valid prompt for testing', () => {
      // Act
      const examplePrompt = getExamplePrompt();

      // Assert - new format uses ## Summary instead of Aggregated Statistics
      // Should have all necessary sections
      expect(examplePrompt).toContain('Analyze the following coding sessions');
      expect(examplePrompt).toContain('Total Sessions:');
      expect(examplePrompt).toContain('## Summary');
      expect(examplePrompt).toContain('Output Format');
      expect(examplePrompt).toContain('Return ONLY the JSON object');
    });
  });

  describe('Prompt Length and Structure', () => {
    test('should generate reasonable length prompt', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: productiveDaySessions,
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt.length).toBeLessThan(10000); // Reasonable upper bound
    });

    test('should have clear section separators', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      expect(prompt).toContain('\n\n'); // Double newlines for section breaks
    });

    test('should be well-structured for LLM consumption', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession, backendSession],
        date: new Date('2025-01-15'),
        userInstructions: 'Focus on quality'
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      // Should have logical flow
      const sections = prompt.split('\n\n');
      expect(sections.length).toBeGreaterThan(3);

      // Should end with instructions
      expect(prompt).toMatch(/Return ONLY the JSON object.*$/s);
    });
  });

  describe('Integration with SummaryService', () => {
    test('should generate prompt compatible with parseAIResponse', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      // Should instruct LLM to return format that parseAIResponse expects
      expect(prompt).toContain('"accomplishments"');
      expect(prompt).toContain('"suggestedFocus"');
      expect(prompt).toContain('"insights"');
      expect(prompt).toContain('JSON only');
    });

    test('should provide enough context for meaningful summary', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: productiveDaySessions,
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format uses project sections and Summary section
      // Should include all key information
      expect(prompt).toContain('## Project:');
      expect(prompt).toContain('Total Time:');
      expect(prompt).toContain('Prompts:');
      expect(prompt).toContain('Total Prompts:');
      expect(prompt).toContain('Projects:');
      expect(prompt).toContain('## Summary');
    });
  });

  describe('Timeframe-Specific Prompt Generation', () => {
    test('should generate weekly prompt with correct timeframe text', () => {
      // Arrange
      const startDate = new Date('2025-01-06');
      const endDate = new Date('2025-01-12');
      const context: SummaryContext = {
        sessions: [frontendSession, backendSession],
        date: endDate,
        timeframe: 'weekly',
        dateRange: { start: startDate, end: endDate }
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format uses different instruction phrasing
      expect(prompt).toContain('for the week of');
      expect(prompt).toContain('weekly summary');
      expect(prompt).toContain('advance the projects toward completion');
      expect(prompt).toContain('Activity Distribution');
    });

    test('should generate monthly prompt with correct timeframe text', () => {
      // Arrange
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');
      const context: SummaryContext = {
        sessions: [frontendSession, backendSession],
        date: endDate,
        timeframe: 'monthly',
        dateRange: { start: startDate, end: endDate }
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format uses strategic next steps phrasing
      expect(prompt).toContain('for January 2025');
      expect(prompt).toContain('monthly summary');
      expect(prompt).toContain('strategic next steps for next month');
      expect(prompt).toContain('momentum areas');
    });

    test('should generate daily prompt as default', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-15')
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format uses "what to finish tomorrow" phrasing
      expect(prompt).toContain('from');
      expect(prompt).toContain('2025');
      expect(prompt).toContain('daily summary');
      expect(prompt).toContain('what to finish tomorrow');
    });

    test('should include timeframe-specific instructions for weekly', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-12'),
        timeframe: 'weekly',
        dateRange: { start: new Date('2025-01-06'), end: new Date('2025-01-12') }
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format has different weekly instructions
      expect(prompt).toContain('Suggest 2-4 specific next steps to advance the projects');
      expect(prompt).toContain('Identify incomplete work that needs finishing');
      expect(prompt).not.toContain('strategic next steps for next month');
    });

    test('should include timeframe-specific instructions for monthly', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession],
        date: new Date('2025-01-31'),
        timeframe: 'monthly',
        dateRange: { start: new Date('2025-01-01'), end: new Date('2025-01-31') }
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert - new format has different monthly instructions
      expect(prompt).toContain('Suggest 2-4 strategic next steps for next month');
      expect(prompt).toContain('momentum areas');
      expect(prompt).toContain('bottlenecks');
      expect(prompt).not.toContain('advance the projects toward completion');
    });

    test('should handle weekly prompt with custom instructions', () => {
      // Arrange
      const context: SummaryContext = {
        sessions: [frontendSession, backendSession],
        date: new Date('2025-01-12'),
        timeframe: 'weekly',
        dateRange: { start: new Date('2025-01-06'), end: new Date('2025-01-12') },
        userInstructions: 'Focus on code quality metrics and test coverage improvements'
      };

      // Act
      const prompt = buildDailySummaryPrompt(context);

      // Assert
      expect(prompt).toContain('Custom Instructions:');
      expect(prompt).toContain('Focus on code quality metrics and test coverage improvements');
      expect(prompt).toContain('weekly summary');
    });
  });
});
