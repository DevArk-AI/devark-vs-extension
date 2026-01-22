/**
 * Daily Summary Prompt Builder
 *
 * Builds prompts for AI-powered daily summaries of coding sessions.
 * The prompt is designed to:
 * - Extract meaningful insights from session data
 * - Provide specific, actionable suggestions
 * - Be concise yet insightful
 */

import { SummaryContext } from '../SummaryService';
import { CursorSession } from '../../cursor-integration/types';

/**
 * System prompt for summary generation
 *
 * Sets the tone and expertise level for the LLM.
 */
export const SYSTEM_PROMPT = `You are an expert software development analyst who translates technical work into clear, specific accomplishments.
Your role is to analyze coding sessions and provide concrete descriptions of what was built, fixed, or improved.

CRITICAL: DO NOT USE ANY TOOLS. All the session data you need is provided in the prompt.
Do not use Read, Grep, Glob, LSP, Bash, or any other tools. Just analyze the text data provided.

IMPORTANT: You must respond with ONLY a JSON object. Do NOT:
- Use any tools (Read, Grep, Glob, LSP, Bash, etc.) - all data is already provided
- Say "Let me analyze..." or "I'll examine..."
- Ask for more information
- Use markdown code fences
- Include any text before or after the JSON
Just output the raw JSON object directly.

Critical Requirements:
- **BE SPECIFIC**: Use exact file names and component names from the session data
- **NAME FEATURES**: Identify and name the actual features/capabilities being worked on
- **AVOID GENERIC STATEMENTS**: Never say "extensive work", "multiple files", or "various tasks"
- **CONCRETE EXAMPLES**:
  ✅ "Built AI summary generation feature in SummaryService.ts with OpenRouter integration"
  ✅ "Fixed webview crash bug in MenuPanelV2.ts by handling null state"
  ✅ "Implemented provider detection for Claude Code, Cursor, and Ollama in ProviderDetectionService.ts"
  ❌ "Worked on multiple files across the project"
  ❌ "Extensive development work on various features"
  ❌ "Continued development on the extension"

Analysis Guidelines:
1. **Read file paths carefully** - they reveal exact features (e.g., "AutoAnalyzeService.ts" = auto-analyze feature)
2. **Identify patterns** - multiple related files indicate a feature area (e.g., 3 LLM files = LLM integration work)
3. **Infer intent** - new tests = feature completion, UI changes = UX improvements, service files = backend logic
4. **Be actionable** - describe what can now be done or what was fixed, not just what was touched
5. **Identify business outcomes** - What was the developer trying to achieve? Feature development, bug fix, refactoring, documentation, or testing?

Session Sources:
- Sessions may come from "Cursor" (Cursor IDE Composer) or "Claude Code" (Claude Code CLI terminal)
- Both represent AI-assisted coding sessions but from different tools
- Treat all sessions equally regardless of source when analyzing accomplishments

Output Format:
- 3-5 bullet points maximum
- Each point describes ONE specific accomplishment
- Include file/component names when relevant
- Focus on features, fixes, or capabilities added
- Include business outcomes for each major work area
- Always respond with valid JSON only (no markdown, no extra text)`;

/**
 * Build the daily summary prompt
 *
 * @param context - Summary context with sessions and date
 * @returns Formatted prompt string
 */
export function buildDailySummaryPrompt(context: SummaryContext): string {
  const { sessions, date, timeframe = 'daily', userInstructions, dateRange } = context;

  // Timeframe-specific text
  let timeframeText = '';
  let timeframeDescription = '';

  if (timeframe === 'daily') {
    const dateStr = date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    timeframeText = `from ${dateStr}`;
    timeframeDescription = 'daily';
  } else if (timeframe === 'weekly') {
    const start = dateRange?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = dateRange?.end || new Date();
    timeframeText = `for the week of ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
    timeframeDescription = 'weekly';
  } else if (timeframe === 'monthly') {
    const monthDate = dateRange?.end || date;
    timeframeText = `for ${monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    timeframeDescription = 'monthly';
  }

  // Format session data
  const sessionsSummary = formatSessions(sessions);

  // Build the prompt
  let prompt = `Analyze the following coding sessions ${timeframeText} and provide a ${timeframeDescription} summary.

${sessionsSummary}

`;

  // Add custom instructions if provided
  if (userInstructions && userInstructions.trim().length > 0) {
    prompt += `\nCustom Instructions:\n${userInstructions}\n\n`;
  }

  // Enhanced analysis instructions for weekly/monthly reports
  const enhancedAnalysisInstructions = `
5. **Activity Distribution** - Categorize ALL work into activity types and estimate percentages (must total 100%):
   - Development: Building new features
   - Debugging: Finding and fixing bugs
   - Refactoring: Code cleanup, restructuring
   - Testing: Writing tests
   - Planning: Architecture decisions
   - Research: Documentation reading
   - Review: Code review
   - Documentation: Writing docs
   - Other: Configuration, setup

6. **Prompt Quality** - Rate overall prompt quality 0-100, provide breakdown: excellent/good/fair/poor percentages

7. **Executive Summary** - 3-4 high-level insights

8. **Project Breakdown** - For each project: sessions count, largest session duration, focus area`;

  // Timeframe-specific instructions
  let specificInstructions = '';
  if (timeframe === 'weekly') {
    specificInstructions = `2. Suggest 2-4 specific next steps to advance the projects toward completion
3. Identify incomplete work that needs finishing
4. Note if productivity patterns blocked progress (only if relevant)` + enhancedAnalysisInstructions;
  } else if (timeframe === 'monthly') {
    specificInstructions = `2. Suggest 2-4 strategic next steps for next month
3. Identify momentum areas (what's progressing well) and bottlenecks (what's stalled)
4. Highlight major feature completions or milestones reached` + enhancedAnalysisInstructions;
  } else {
    specificInstructions = `2. Suggest 2-4 specific next steps to continue the work (what to finish tomorrow)
3. Identify any incomplete work or bugs introduced that need attention
4. Note if work patterns blocked progress (only if fragmentation prevented completion)`;
  }

  prompt += `Instructions:
1. **Read the session data carefully** - Look at EVERY file path mentioned to identify specific features/components worked on
2. **Name exact features** - Use file names to identify features (e.g., "SummaryService.ts" → "AI summary generation", "MenuPanelV2.ts" → "menu panel redesign")
3. **Be concrete and specific** - Every accomplishment must name the actual feature/component/fix, not generic descriptions
4. **Provide actionable next steps** - Suggest specific tasks that continue the work (e.g., "Test the auto-analyze feature with real Cursor sessions")
${specificInstructions}

Output Format (JSON only, no markdown):
${timeframe === 'weekly' || timeframe === 'monthly' ? getEnhancedOutputFormat(timeframe) : getDailyOutputFormat()}

CRITICAL: Each accomplishment MUST reference specific files, features, or components. NO GENERIC STATEMENTS.
Business outcomes should identify the high-level goal for each project/work area, not just list files.
Return ONLY the JSON object, no additional text or markdown formatting.`;

  return prompt;
}

/** Maximum number of sessions to show detailed highlights for */
const MAX_DETAILED_SESSIONS = 20;

/**
 * Format sessions for the prompt
 *
 * Converts session data into a human-readable format for the LLM.
 * Includes conversation highlights for top 20 sessions to give the AI
 * actual context about what was discussed/built.
 *
 * @param sessions - Array of cursor sessions
 * @returns Formatted session summary
 */
function formatSessions(sessions: CursorSession[]): string {
  if (sessions.length === 0) {
    return 'No sessions recorded for this day.';
  }

  // Count sessions by source
  const cursorCount = sessions.filter(s => s.sessionId.startsWith('cursor-')).length;
  const claudeCount = sessions.filter(s => s.sessionId.startsWith('claude-')).length;
  const unknownCount = sessions.length - cursorCount - claudeCount;

  let summary = `Total Sessions: ${sessions.length}`;
  if (cursorCount > 0 || claudeCount > 0) {
    summary += ` (Cursor: ${cursorCount}, Claude Code: ${claudeCount}${unknownCount > 0 ? `, Other: ${unknownCount}` : ''})`;
  }
  summary += '\n\n';

  // Sort sessions by duration to prioritize most significant work
  const sortedSessions = [...sessions].sort((a, b) => {
    const durationA = a.lastActivity.getTime() - a.startTime.getTime();
    const durationB = b.lastActivity.getTime() - b.startTime.getTime();
    return durationB - durationA;
  });

  // Group sessions by project for better organization
  const sessionsByProject = new Map<string, CursorSession[]>();
  for (const session of sortedSessions) {
    const project = session.workspaceName || 'Unknown';
    if (!sessionsByProject.has(project)) {
      sessionsByProject.set(project, []);
    }
    sessionsByProject.get(project)!.push(session);
  }

  // Format by project, showing highlights for top sessions
  let detailedCount = 0;

  for (const [project, projectSessions] of sessionsByProject) {
    const totalDuration = projectSessions.reduce((sum, s) => {
      return sum + Math.floor((s.lastActivity.getTime() - s.startTime.getTime()) / 60000);
    }, 0);
    const totalPrompts = projectSessions.reduce((sum, s) => sum + s.promptCount, 0);

    summary += `\n## Project: ${project}\n`;
    summary += `Sessions: ${projectSessions.length} | Total Time: ${formatMinutes(totalDuration)} | Prompts: ${totalPrompts}\n`;

    // Collect all session summaries and highlights for this project
    const projectHighlights: string[] = [];
    const projectIntents: string[] = [];

    for (const session of projectSessions) {
      // Extract Claude Code summaries (most valuable - AI-generated descriptions)
      if (session.highlights?.sessionSummaries?.length) {
        for (const s of session.highlights.sessionSummaries) {
          if (s && s.trim() && !projectHighlights.includes(s)) {
            projectHighlights.push(s);
          }
        }
      }

      // Extract first user message (intent) for top sessions only
      if (detailedCount < MAX_DETAILED_SESSIONS && session.highlights?.firstUserMessage) {
        const intent = session.highlights.firstUserMessage;
        if (intent && !projectIntents.some(i => i.includes(intent.substring(0, 50)))) {
          projectIntents.push(intent);
        }
      }

      detailedCount++;
    }

    // Show session summaries (from Claude Code)
    if (projectHighlights.length > 0) {
      summary += `\nWork Summaries:\n`;
      // Deduplicate similar summaries
      const uniqueHighlights = [...new Set(projectHighlights)].slice(0, 5);
      for (const highlight of uniqueHighlights) {
        summary += `  - ${highlight}\n`;
      }
    }

    // Show user intents (what the developer asked for)
    if (projectIntents.length > 0) {
      summary += `\nDeveloper Requests:\n`;
      const uniqueIntents = projectIntents.slice(0, 3);
      for (const intent of uniqueIntents) {
        summary += `  - "${intent}"\n`;
      }
    }

    // Show files worked on
    const allFiles = projectSessions.flatMap(s => s.fileContext || []);
    if (allFiles.length > 0) {
      const filesByArea = groupFilesByArea(allFiles);
      summary += `\nFiles Modified:\n`;
      for (const area of filesByArea.slice(0, 5)) {
        summary += `  - ${area.area}: ${area.files.slice(0, 4).join(', ')}${area.files.length > 4 ? '...' : ''}\n`;
      }
    }
  }

  // Add aggregated statistics
  const totalPrompts = sessions.reduce((sum, s) => sum + s.promptCount, 0);
  const allFiles = sessions.flatMap(s => s.fileContext || []);
  const filesByArea = groupFilesByArea(allFiles);

  summary += `\n## Summary\n`;
  summary += `- Total Prompts: ${totalPrompts}\n`;
  summary += `- Projects: ${Array.from(sessionsByProject.keys()).join(', ')}\n`;
  summary += `- Feature Areas: ${filesByArea.slice(0, 5).map(a => a.area).join(', ')}\n`;

  summary += `
IMPORTANT:
1. Use the "Work Summaries" and "Developer Requests" above to understand WHAT was actually built/fixed
2. Sessions may show repeated attempts at the same goal - consolidate these into single accomplishments
3. Reference specific files/components when describing accomplishments
4. If multiple sessions worked on the same feature, describe the overall outcome, not each attempt
`;

  return summary;
}

/**
 * Format minutes as human readable duration
 */
function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Group files by feature area (directory) for better LLM context
 */
function groupFilesByArea(files: string[]): Array<{ area: string; files: string[] }> {
  const uniqueFiles = [...new Set(files)];
  const grouped = new Map<string, string[]>();

  uniqueFiles.forEach(file => {
    // Extract directory/feature area from file path
    const parts = file.split(/[/\\]/);
    let area = 'Root';

    if (parts.length > 1) {
      // Get the most specific directory (e.g., "src/services", "webview/menu/components")
      if (parts.length >= 3) {
        area = parts.slice(0, 3).join('/');
      } else {
        area = parts.slice(0, -1).join('/');
      }
    }

    const fileName = parts[parts.length - 1];
    if (!grouped.has(area)) {
      grouped.set(area, []);
    }
    grouped.get(area)!.push(fileName);
  });

  return Array.from(grouped.entries())
    .map(([area, files]) => ({ area, files }))
    .sort((a, b) => b.files.length - a.files.length); // Most active areas first
}

/**
 * Get enhanced JSON output format for weekly/monthly reports
 */
function getEnhancedOutputFormat(timeframe: string): string {
  const insightsText = timeframe === 'monthly'
    ? 'Brief insight about progress: What major features shipped? What is incomplete? Patterns?'
    : 'Brief insight: Which areas progressed? What needs focus? Overall direction?';
  const periodText = timeframe === 'monthly' ? 'month' : 'week';

  return `{
  "accomplishments": ["Specific accomplishment 1", "Specific accomplishment 2", "..."],
  "suggestedFocus": ["Specific next step 1", "Specific next step 2", "..."],
  "insights": "${insightsText}",
  "businessOutcomes": [{"project": "name", "objective": "what was accomplished", "outcome": "completed|in-progress|blocked", "category": "feature|bugfix|refactor|docs|test|research|other"}],
  "executiveSummary": ["3-4 high-level insights about the ${periodText} work"],
  "activityDistribution": {"Development": 35, "Debugging": 25, "Refactoring": 15, "Testing": 10, "Planning": 5, "Research": 5, "Documentation": 3, "Other": 2},
  "promptQuality": {"averageScore": 75, "breakdown": {"excellent": 20, "good": 50, "fair": 20, "poor": 10}, "insights": "Brief insight about prompt quality patterns"},
  "projectBreakdown": [{"name": "project-name", "sessions": 5, "largestSession": "2h 30m", "focus": "main activity description"}]
}`;
}

/**
 * Get daily JSON output format
 */
function getDailyOutputFormat(): string {
  return `{
  "accomplishments": [
    "Specific accomplishment with file/feature name (e.g., 'Implemented auto-analyze service in AutoAnalyzeService.ts')",
    "Another specific accomplishment (e.g., 'Fixed provider switching bug in LLMManager that caused crashes')",
    "Third specific accomplishment (e.g., 'Built daily summary UI component with loading states')"
  ],
  "suggestedFocus": [
    "Specific next step 1 (e.g., 'Add error handling to AutoAnalyzeService for DB lock scenarios')",
    "Specific next step 2 (e.g., 'Test summary generation with 100+ sessions')",
    "Specific next step 3 (e.g., 'Complete weekly summary breakdown table')"
  ],
  "insights": "Brief insight: Main goal? Blockers? Progress toward completion?",
  "businessOutcomes": [
    {
      "project": "project-name (from session data)",
      "objective": "What was the developer trying to accomplish? (e.g., 'Add unified session aggregation for multi-source analysis')",
      "outcome": "completed | in-progress | blocked",
      "category": "feature | bugfix | refactor | docs | test | research | other"
    }
  ]
}`;
}

/**
 * Example prompt for testing
 *
 * This shows what the final prompt looks like with sample data.
 */
export function getExamplePrompt(): string {
  const sampleSessions: CursorSession[] = [
    {
      sessionId: 'test-1',
      workspaceName: 'vibe-log-extension',
      workspacePath: '/Users/dev/projects/vibe-log-extension',
      startTime: new Date('2025-01-15T09:00:00'),
      lastActivity: new Date('2025-01-15T11:30:00'),
      promptCount: 15,
      status: 'historical',
      fileContext: [
        'src/services/SummaryService.ts',
        'src/panels/V2MessageHandler.ts',
        'src/llm/llm-manager.ts'
      ]
    },
    {
      sessionId: 'test-2',
      workspaceName: 'vibe-log-extension',
      workspacePath: '/Users/dev/projects/vibe-log-extension',
      startTime: new Date('2025-01-15T14:00:00'),
      lastActivity: new Date('2025-01-15T16:45:00'),
      promptCount: 22,
      status: 'historical',
      fileContext: [
        'src/services/prompts/daily-summary-prompt.ts',
        'tests/SummaryService.test.ts'
      ]
    }
  ];

  const context: SummaryContext = {
    sessions: sampleSessions,
    date: new Date('2025-01-15'),
    userInstructions: 'Focus on code quality and testing'
  };

  return buildDailySummaryPrompt(context);
}
