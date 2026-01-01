/**
 * Session Summarizer
 *
 * Analyzes coding sessions and generates AI-powered summaries.
 * Provides concise insights about development activity, achievements,
 * and productivity patterns.
 */

import { ILLMProvider, ILogger, ConsoleLogger } from '../llm/interfaces';
import { CompletionOptions } from '../llm/types';

/**
 * Data structure for a coding session
 */
export interface SessionData {
  /** Duration of the session in seconds */
  duration: number;

  /** List of files that were modified */
  filesChanged: string[];

  /** List of commands that were executed */
  commands: string[];

  /** Name of the project */
  projectName: string;

  /** Development tool used (e.g., 'cursor', 'vscode', 'claude_code') */
  tool: string;

  /** ISO timestamp of when the session occurred */
  timestamp: string;
}

/**
 * Service for generating AI summaries of coding sessions
 */
export class SessionSummarizer {
  private logger: ILogger;

  /**
   * Create a new SessionSummarizer
   * @param llmProvider - The LLM provider instance to use for completions
   * @param logger - Optional logger instance (defaults to console logger)
   */
  constructor(
    private llmProvider: ILLMProvider,
    logger?: ILogger
  ) {
    this.logger = logger || new ConsoleLogger();
  }

  /**
   * Generate a summary for a coding session
   *
   * @param sessionData - The session data to summarize
   * @returns A concise 2-3 sentence summary of the session
   * @throws Error if LLM generation fails (after attempting fallback)
   */
  public async summarizeSession(sessionData: SessionData): Promise<string> {
    this.logger.info('Generating session summary...');

    try {
      // Build the prompt
      const prompt = this.buildSummarizationPrompt(sessionData);

      // Generate completion with conservative settings
      const options: CompletionOptions = {
        prompt,
        systemPrompt: this.getSystemPrompt(),
        temperature: 0.3, // Low temperature for consistent, focused summaries
        maxTokens: 200, // Short summaries
      };

      const response = await this.llmProvider.generateCompletion(options);

      // Check for errors in response
      if (response.error) {
        throw new Error(`LLM generation failed: ${response.error}`);
      }

      this.logger.info('Session summary generated successfully');
      return response.text.trim();
    } catch (error) {
      // Provide a fallback message if AI generation fails
      this.logger.error('Session summarization failed', error as Error);
      return this.getFallbackSummary(sessionData);
    }
  }

  /**
   * Build the system prompt for session summarization
   */
  private getSystemPrompt(): string {
    return `You are a coding session analyst. Your task is to analyze coding sessions and provide clear, concise summaries.

When summarizing a session:
1. Identify the main task or objective based on files modified and commands run
2. Highlight key accomplishments or progress made
3. Note any patterns or productivity insights
4. Keep your summary to 2-3 sentences
5. Be specific and technical when appropriate
6. Focus on what was achieved, not just what was done

Provide ONLY the summary text, no additional commentary, headers, or explanations.`;
  }

  /**
   * Build the user prompt with session data
   */
  private buildSummarizationPrompt(sessionData: SessionData): string {
    const durationMinutes = Math.round(sessionData.duration / 60);
    const fileList = this.formatFileList(sessionData.filesChanged);
    const commandList = this.formatCommandList(sessionData.commands);

    return `Analyze this coding session and provide a 2-3 sentence summary:

Session Details:
- Duration: ${durationMinutes} minutes
- Project: ${sessionData.projectName}
- Tool: ${sessionData.tool}
- Date: ${new Date(sessionData.timestamp).toLocaleDateString()}

Files Modified (${sessionData.filesChanged.length} files):
${fileList}

Commands Executed (${sessionData.commands.length} commands):
${commandList}

Summary:`;
  }

  /**
   * Format the list of modified files for the prompt
   */
  private formatFileList(files: string[]): string {
    if (files.length === 0) {
      return '  (no files modified)';
    }

    // Show up to 10 files, then summarize the rest
    const displayFiles = files.slice(0, 10);
    const remaining = files.length - displayFiles.length;

    let result = displayFiles.map(file => `  - ${file}`).join('\n');

    if (remaining > 0) {
      result += `\n  ... and ${remaining} more files`;
    }

    return result;
  }

  /**
   * Format the list of commands for the prompt
   */
  private formatCommandList(commands: string[]): string {
    if (commands.length === 0) {
      return '  (no commands recorded)';
    }

    // Show up to 8 commands, then summarize the rest
    const displayCommands = commands.slice(0, 8);
    const remaining = commands.length - displayCommands.length;

    let result = displayCommands.map(cmd => `  - ${cmd}`).join('\n');

    if (remaining > 0) {
      result += `\n  ... and ${remaining} more commands`;
    }

    return result;
  }

  /**
   * Generate a fallback summary when AI generation fails
   */
  private getFallbackSummary(sessionData: SessionData): string {
    const durationMinutes = Math.round(sessionData.duration / 60);
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    const durationText = hours > 0
      ? `${hours} hour${hours > 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''}`
      : `${minutes} minute${minutes !== 1 ? 's' : ''}`;

    const fileCount = sessionData.filesChanged.length;
    const commandCount = sessionData.commands.length;

    return `Worked on ${sessionData.projectName} for ${durationText} using ${sessionData.tool}. ` +
      `Modified ${fileCount} file${fileCount !== 1 ? 's' : ''} and executed ${commandCount} command${commandCount !== 1 ? 's' : ''}.`;
  }
}
