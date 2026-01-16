/**
 * Summary Service
 *
 * Generates AI-powered daily summaries of coding sessions using the LLM Manager.
 * This service:
 * - Builds prompts from session data
 * - Calls LLM via LLMManager
 * - Parses and validates AI responses
 * - Handles errors gracefully with fallback logic
 */

import { LLMManager } from '../llm/llm-manager';
import { CompletionOptions, CompletionResponse } from '../llm/types';
import { CursorSession } from '../cursor-integration/types';
import { buildDailySummaryPrompt, SYSTEM_PROMPT } from './prompts/summary-prompt';
import type { SessionsBySource, BusinessCategory } from './UnifiedSessionService';
import { CLIProviderError } from '../llm/providers/cli-provider-base';

/**
 * Context for generating a summary
 */
export interface SummaryContext {
  /** Sessions to summarize */
  sessions: CursorSession[];

  /** Date for the summary */
  date: Date;

  /** Timeframe for summary */
  timeframe?: 'daily' | 'weekly' | 'monthly';

  /** Optional custom instructions from user */
  userInstructions?: string;

  /** Optional date range for weekly/monthly */
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Business outcome for a session or project
 */
export interface BusinessOutcome {
  /** Project name */
  project: string;
  /** What was the developer trying to accomplish? */
  objective: string;
  /** Outcome status: completed, in-progress, blocked */
  outcome: string;
  /** Category of work */
  category: BusinessCategory;
}

/**
 * Prompt quality metrics for weekly/monthly reports
 */
export interface PromptQualityMetrics {
  averageScore: number; // 0-100
  breakdown: {
    excellent: number; // percentage
    good: number;
    fair: number;
    poor: number;
  };
  insights?: string;
}

/**
 * Project breakdown item for weekly/monthly reports
 */
export interface ProjectBreakdownItem {
  name: string;
  sessions: number;
  largestSession: string; // duration string like "2h 30m"
  focus: string; // main activity description
}

/**
 * Error info for fallback summaries
 */
export interface SummaryErrorInfo {
  type: 'rate_limit' | 'auth_failed' | 'network' | 'no_provider' | 'unknown';
  message: string;
  suggestion: string;
}

/**
 * AI-generated summary result
 */
export interface AISummaryResult {
  /** What was accomplished */
  accomplishments: string[];

  /** Suggested next actions */
  suggestedFocus: string[];

  /** Additional insights (optional) */
  insights?: string;

  /** Whether this result came from AI or fallback */
  source: 'ai' | 'fallback';

  /** Model used for generation (if AI) */
  model?: string;

  /** Provider used (if AI) */
  provider?: string;

  /** Business outcomes extracted from sessions */
  businessOutcomes?: BusinessOutcome[];

  /** Executive summary for weekly/monthly reports */
  executiveSummary?: string[];

  /** Activity distribution percentages for weekly/monthly reports */
  activityDistribution?: Record<string, number>;

  /** Prompt quality metrics for weekly/monthly reports */
  promptQuality?: PromptQualityMetrics;

  /** Project breakdown for weekly/monthly reports */
  projectBreakdown?: ProjectBreakdownItem[];

  /** Error info when falling back (optional) */
  error?: SummaryErrorInfo;
}

/**
 * Complete daily summary for UI display
 */
export interface DailySummary {
  /** Date of summary */
  date: Date;

  /** Total number of messages/prompts (not "analyzed", just counted) */
  totalMessages: number;

  /** Average score (if applicable) */
  avgScore: number;

  /** Total time coding (minutes) */
  timeCoding: number;

  /** Number of files worked on */
  filesWorkedOn: number;

  /** Number of sessions */
  sessions: number;

  /** What was worked on (accomplishments) */
  workedOn: string[];

  /** Suggested next actions */
  suggestedFocus: string[];

  /** Additional insights */
  insights?: string;

  /** Data source */
  source: 'ai' | 'fallback';

  /** Provider info (if AI) */
  providerInfo?: {
    model: string;
    provider: string;
  };

  /** Session count breakdown by source (Cursor vs Claude Code) */
  sessionsBySource?: SessionsBySource;

  /** Business outcomes extracted from sessions */
  businessOutcomes?: BusinessOutcome[];

  /** Error info when falling back (optional) */
  error?: SummaryErrorInfo;
}

/**
 * Complete weekly summary for UI display
 */
export interface WeeklySummary {
  /** Start date of week */
  startDate: Date;

  /** End date of week */
  endDate: Date;

  /** Total time coding (minutes) */
  totalTime: number;

  /** Number of prompts analyzed */
  promptsAnalyzed: number;

  /** Average score (if applicable) */
  avgScore: number;

  /** Score trend (positive = improving) */
  scoreTrend: number;

  /** Number of sessions */
  sessions: number;

  /** Daily breakdown */
  dailyBreakdown: Array<{
    day: string;
    time: number;
    prompts: number;
    avgScore: number;
  }>;

  /** Top projects worked on */
  topProjects: Array<{
    name: string;
    time: number;
    prompts: number;
  }>;

  /** AI insights */
  insights?: string;

  /** Key achievements */
  achievements?: string[];

  /** Data source */
  source: 'ai' | 'fallback';

  /** Provider info (if AI) */
  providerInfo?: {
    model: string;
    provider: string;
  };

  /** Session count breakdown by source (Cursor vs Claude Code) */
  sessionsBySource?: SessionsBySource;

  /** Business outcomes extracted from sessions */
  businessOutcomes?: BusinessOutcome[];

  /** Executive summary for enhanced reports */
  executiveSummary?: string[];

  /** Activity distribution percentages for enhanced reports */
  activityDistribution?: Record<string, number>;

  /** Prompt quality metrics for enhanced reports */
  promptQuality?: PromptQualityMetrics;

  /** Project breakdown for enhanced reports */
  projectBreakdown?: ProjectBreakdownItem[];
}

/**
 * Complete monthly summary for UI display
 */
export interface MonthlySummary {
  /** Month name */
  month: string;

  /** Year */
  year: number;

  /** Total time coding (minutes) */
  totalTime: number;

  /** Number of prompts analyzed */
  promptsAnalyzed: number;

  /** Average score */
  avgScore: number;

  /** Score trend (positive = improving) */
  scoreTrend: number;

  /** Number of sessions */
  sessions: number;

  /** Active days in month */
  activeDays: number;

  /** Total days in month */
  totalDays: number;

  /** Weekly breakdown */
  weeklyBreakdown: Array<{
    week: number;
    time: number;
    prompts: number;
    avgScore: number;
  }>;

  /** AI insights */
  insights?: string;

  /** Key achievements */
  achievements?: string[];

  /** Top patterns/trends */
  trends?: string[];

  /** Data source */
  source: 'ai' | 'fallback';

  /** Provider info (if AI) */
  providerInfo?: {
    model: string;
    provider: string;
  };

  /** Session count breakdown by source (Cursor vs Claude Code) */
  sessionsBySource?: SessionsBySource;

  /** Business outcomes extracted from sessions */
  businessOutcomes?: BusinessOutcome[];

  /** Executive summary for enhanced reports */
  executiveSummary?: string[];

  /** Activity distribution percentages for enhanced reports */
  activityDistribution?: Record<string, number>;

  /** Prompt quality metrics for enhanced reports */
  promptQuality?: PromptQualityMetrics;

  /** Project breakdown for enhanced reports */
  projectBreakdown?: ProjectBreakdownItem[];
}

/**
 * Service for generating AI-powered session summaries
 */
export class SummaryService {
  private llmManager: LLMManager;

  /**
   * Create a new summary service
   *
   * @param llmManager - LLM Manager instance for generating completions
   */
  constructor(llmManager: LLMManager) {
    this.llmManager = llmManager;
  }

  /**
   * Generate a daily summary from sessions
   *
   * @param context - Summary context with sessions and date
   * @returns AI-generated summary result
   */
  async generateDailySummary(context: SummaryContext): Promise<AISummaryResult> {
    // Early return for empty sessions - no need to call AI
    if (context.sessions.length === 0) {
      return this.generateFallbackSummary(context);
    }

    try {
      // Ensure LLM Manager is initialized
      if (!this.llmManager.isInitialized()) {
        await this.llmManager.initialize();
      }

      // Build the prompt
      const prompt = this.buildPrompt(context);

      // Get active provider info
      const providerInfo = this.llmManager.getActiveProviderInfo();

      if (!providerInfo) {
        console.warn('[SummaryService] No active LLM provider, falling back to basic parsing');
        return this.generateFallbackSummary(context);
      }

      console.log(`[SummaryService] 🚀 Calling AI provider: ${providerInfo.type}`);
      console.log(`[SummaryService] Provider model: ${providerInfo.model}`);

      // Call LLM
      // Note: The provider will automatically cap maxTokens based on model limits
      const completionOptions: CompletionOptions = {
        prompt,
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0.3, // Lower temperature for more consistent, factual output
        maxTokens: 1000,
        stream: false
      };

      console.log(`[SummaryService] Sending prompt to ${providerInfo.type}...`);
      // Use feature-specific provider if configured, otherwise fall back to active provider
      const response: CompletionResponse = await this.llmManager.generateCompletionForFeature('summaries', completionOptions);
      console.log(`[SummaryService] ✅ Received response from ${response.provider}`);
      console.log(`[SummaryService] Response text length: ${response.text?.length || 0} characters`);

      // Check for errors
      if (response.error) {
        console.error('[SummaryService] LLM error:', response.error);
        return this.generateFallbackSummary(context);
      }

      // Parse AI response
      console.log('[SummaryService] Parsing AI response...');
      console.log('[SummaryService] Raw AI response (first 500 chars):', response.text?.substring(0, 500));
      const parsedResult = this.parseAIResponse(response.text);
      console.log('[SummaryService] ✅ Parsed result:', JSON.stringify(parsedResult, null, 2));

      // Add metadata
      console.log('[SummaryService] Adding metadata and returning result...');
      const finalResult: AISummaryResult = {
        ...parsedResult,
        source: 'ai' as const,
        model: response.model,
        provider: response.provider
      };
      console.log('[SummaryService] ✅ Final result ready:', JSON.stringify(finalResult, null, 2));
      return finalResult;

    } catch (error) {
      console.error('[SummaryService] Error generating summary:', error);

      // Extract error classification if available
      let errorInfo: SummaryErrorInfo | undefined;
      if (error instanceof CLIProviderError) {
        errorInfo = {
          type: error.errorType,
          message: error.message.split('\n')[0], // First line only
          suggestion: error.suggestion
        };
      }

      return this.generateFallbackSummary(context, errorInfo);
    }
  }

  /**
   * Build prompt from context
   *
   * @param context - Summary context
   * @returns Formatted prompt string
   */
  buildPrompt(context: SummaryContext): string {
    return buildDailySummaryPrompt(context);
  }

  /**
   * Parse AI response into structured result
   *
   * Attempts to parse JSON response. If parsing fails, extracts
   * information from plain text response.
   *
   * @param response - Raw AI response text
   * @returns Parsed summary result
   */
  parseAIResponse(response: string): Omit<AISummaryResult, 'source' | 'model' | 'provider'> {
    try {
      // Try to extract JSON from response (in case it's wrapped in markdown or text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        let parsed: any;
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (jsonError) {
          console.warn('[SummaryService] JSON parse failed, trying to fix common issues:', jsonError);
          // Try to fix common JSON issues (trailing commas, unescaped quotes)
          const fixedJson = jsonMatch[0]
            .replace(/,\s*}/g, '}')  // Remove trailing commas before }
            .replace(/,\s*]/g, ']'); // Remove trailing commas before ]
          try {
            parsed = JSON.parse(fixedJson);
          } catch {
            // If still fails, fall through to plain text extraction
            console.warn('[SummaryService] JSON fix attempt failed, falling back to text extraction');
            return this.extractFromPlainText(response);
          }
        }

        // More lenient validation - accept if we have ANY useful data
        const hasAccomplishments = Array.isArray(parsed.accomplishments) && parsed.accomplishments.length > 0;
        const hasSuggestedFocus = Array.isArray(parsed.suggestedFocus) || Array.isArray(parsed.suggested_focus);

        // Log what we found for debugging
        console.log('[SummaryService] JSON parsing - found fields:', {
          hasAccomplishments,
          hasSuggestedFocus,
          accomplishmentsCount: parsed.accomplishments?.length || 0,
          suggestedFocusCount: (parsed.suggestedFocus || parsed.suggested_focus)?.length || 0,
          hasInsights: !!parsed.insights,
          hasBusinessOutcomes: Array.isArray(parsed.businessOutcomes),
          hasExecutiveSummary: Array.isArray(parsed.executiveSummary)
        });

        // Accept JSON if we have at least accomplishments (the core required field)
        if (hasAccomplishments || hasSuggestedFocus) {
          // Extract and validate businessOutcomes if present
          let businessOutcomes: BusinessOutcome[] | undefined;
          if (Array.isArray(parsed.businessOutcomes)) {
            businessOutcomes = parsed.businessOutcomes
              .filter((bo: any) => bo && typeof bo === 'object' && bo.project)
              .map((bo: any) => ({
                project: String(bo.project || ''),
                objective: String(bo.objective || ''),
                outcome: String(bo.outcome || 'in-progress'),
                category: this.validateBusinessCategory(bo.category)
              }));
          }

          // Extract enhanced fields for weekly/monthly reports
          let executiveSummary: string[] | undefined;
          if (Array.isArray(parsed.executiveSummary)) {
            executiveSummary = parsed.executiveSummary.filter((s: any) => typeof s === 'string');
          }

          let activityDistribution: Record<string, number> | undefined;
          if (parsed.activityDistribution && typeof parsed.activityDistribution === 'object') {
            activityDistribution = {};
            for (const [key, value] of Object.entries(parsed.activityDistribution)) {
              if (typeof value === 'number') {
                activityDistribution[key] = value;
              }
            }
          }

          let promptQuality: PromptQualityMetrics | undefined;
          if (parsed.promptQuality && typeof parsed.promptQuality === 'object') {
            const pq = parsed.promptQuality;
            promptQuality = {
              averageScore: typeof pq.averageScore === 'number' ? pq.averageScore : 0,
              breakdown: {
                excellent: typeof pq.breakdown?.excellent === 'number' ? pq.breakdown.excellent : 0,
                good: typeof pq.breakdown?.good === 'number' ? pq.breakdown.good : 0,
                fair: typeof pq.breakdown?.fair === 'number' ? pq.breakdown.fair : 0,
                poor: typeof pq.breakdown?.poor === 'number' ? pq.breakdown.poor : 0
              },
              insights: typeof pq.insights === 'string' ? pq.insights : undefined
            };
          }

          let projectBreakdown: ProjectBreakdownItem[] | undefined;
          if (Array.isArray(parsed.projectBreakdown)) {
            projectBreakdown = parsed.projectBreakdown
              .filter((pb: any) => pb && typeof pb === 'object' && pb.name)
              .map((pb: any) => ({
                name: String(pb.name || ''),
                sessions: typeof pb.sessions === 'number' ? pb.sessions : 0,
                largestSession: String(pb.largestSession || '0m'),
                focus: String(pb.focus || '')
              }));
          }

          return {
            accomplishments: parsed.accomplishments || [],
            suggestedFocus: parsed.suggestedFocus || parsed.suggested_focus || [],
            insights: parsed.insights,
            businessOutcomes,
            executiveSummary,
            activityDistribution,
            promptQuality,
            projectBreakdown
          };
        }
      }

      // If JSON parsing fails or no useful data found, try to extract from plain text
      console.log('[SummaryService] No valid JSON found, falling back to text extraction');
      return this.extractFromPlainText(response);

    } catch (error) {
      console.warn('[SummaryService] Failed to parse AI response as JSON, extracting from text:', error);
      return this.extractFromPlainText(response);
    }
  }

  /**
   * Validate and normalize business category
   */
  private validateBusinessCategory(category: any): BusinessCategory {
    const validCategories: BusinessCategory[] = ['feature', 'bugfix', 'refactor', 'docs', 'test', 'research', 'other'];
    const normalized = String(category || '').toLowerCase();
    return validCategories.includes(normalized as BusinessCategory)
      ? (normalized as BusinessCategory)
      : 'other';
  }

  /**
   * Extract summary information from plain text response
   */
  private extractFromPlainText(text: string): Omit<AISummaryResult, 'source' | 'model' | 'provider'> {
    const accomplishments: string[] = [];
    const suggestedFocus: string[] = [];
    let insights: string | undefined;

    // Split into lines
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let currentSection: 'accomplishments' | 'suggestions' | 'insights' | null = null;

    for (const line of lines) {
      // Detect section headers
      const lowerLine = line.toLowerCase();

      if (lowerLine.includes('accomplishment') || lowerLine.includes('achieved') || lowerLine.includes('completed')) {
        currentSection = 'accomplishments';
        continue;
      }

      if (lowerLine.includes('suggest') || lowerLine.includes('next') || lowerLine.includes('focus')) {
        currentSection = 'suggestions';
        continue;
      }

      if (lowerLine.includes('insight') || lowerLine.includes('observation')) {
        currentSection = 'insights';
        continue;
      }

      // Extract bullet points or numbered items
      const bulletMatch = line.match(/^[\-\*\d+\.)]\s*(.+)$/);
      const content = bulletMatch ? bulletMatch[1] : line;

      // Add to appropriate section
      if (currentSection === 'accomplishments' && content.length > 10) {
        accomplishments.push(content);
      } else if (currentSection === 'suggestions' && content.length > 10) {
        suggestedFocus.push(content);
      } else if (currentSection === 'insights') {
        insights = insights ? `${insights} ${content}` : content;
      }
    }

    // If we couldn't extract anything, provide generic summary
    if (accomplishments.length === 0) {
      accomplishments.push('Worked on coding sessions');
    }

    if (suggestedFocus.length === 0) {
      suggestedFocus.push('Continue current work');
    }

    return {
      accomplishments,
      suggestedFocus,
      insights
    };
  }

  /**
   * Generate fallback summary when AI is unavailable
   *
   * Uses basic session data analysis without LLM.
   *
   * @param context - Summary context
   * @param errorInfo - Optional error info when falling back due to error
   * @returns Basic summary result
   */
  private generateFallbackSummary(context: SummaryContext, errorInfo?: SummaryErrorInfo): AISummaryResult {
    const { sessions } = context;

    // Collect workspace names
    const workspaces = new Set<string>();
    let totalPrompts = 0;

    sessions.forEach(session => {
      workspaces.add(session.workspaceName);
      totalPrompts += session.promptCount;
    });

    const accomplishments: string[] = [];
    const suggestedFocus: string[] = [];

    // Generic accomplishments
    if (workspaces.size > 0) {
      accomplishments.push(`Worked on ${workspaces.size} project${workspaces.size > 1 ? 's' : ''}: ${Array.from(workspaces).join(', ')}`);
    }

    if (totalPrompts > 0) {
      accomplishments.push(`Completed ${totalPrompts} coding task${totalPrompts > 1 ? 's' : ''}`);
    }

    if (sessions.length > 0) {
      accomplishments.push(`${sessions.length} coding session${sessions.length > 1 ? 's' : ''} logged`);
    }

    // Generic suggestions
    suggestedFocus.push('Continue work on current projects');
    if (workspaces.size > 1) {
      suggestedFocus.push('Consider focusing on one project for deeper progress');
    }

    return {
      accomplishments: accomplishments.length > 0 ? accomplishments : ['No sessions to summarize'],
      suggestedFocus,
      insights: 'AI analysis unavailable - showing basic session summary',
      source: 'fallback',
      error: errorInfo
    };
  }

  /**
   * Convert AI summary result to complete daily summary
   *
   * @param aiResult - AI-generated summary
   * @param sessions - Original sessions
   * @param date - Summary date
   * @returns Complete daily summary for UI
   */
  convertToDailySummary(
    aiResult: AISummaryResult,
    sessions: CursorSession[],
    date: Date
  ): DailySummary {
    try {
      console.log('[SummaryService] convertToDailySummary - Input:', {
        aiResultKeys: Object.keys(aiResult),
        sessionsCount: sessions.length,
        date: date.toISOString()
      });

      // Calculate session statistics
      const totalPrompts = sessions.reduce((sum, s) => sum + s.promptCount, 0);
      console.log('[SummaryService] Total prompts:', totalPrompts);

      const filesWorkedOn = new Set(
        sessions.flatMap(s => s.fileContext || [])
      ).size;
      console.log('[SummaryService] Files worked on:', filesWorkedOn);

      // Calculate total time (difference between start and last activity)
      const timeCoding = sessions.reduce((total, session) => {
        try {
          const duration = session.lastActivity.getTime() - session.startTime.getTime();
          return total + Math.floor(duration / 60000); // Convert to minutes
        } catch (err) {
          console.warn('[SummaryService] Error calculating duration for session:', err);
          return total;
        }
      }, 0);
      console.log('[SummaryService] Time coding (minutes):', timeCoding);

      const summary: DailySummary = {
        date,
        totalMessages: totalPrompts,
        avgScore: 0, // Not applicable for summaries
        timeCoding,
        filesWorkedOn,
        sessions: sessions.length,
        workedOn: aiResult.accomplishments,
        suggestedFocus: aiResult.suggestedFocus,
        insights: aiResult.insights,
        source: aiResult.source,
        providerInfo: aiResult.model && aiResult.provider ? {
          model: aiResult.model,
          provider: aiResult.provider
        } : undefined,
        error: aiResult.error
      };

      console.log('[SummaryService] ✅ Summary object created successfully');
      return summary;

    } catch (error) {
      console.error('[SummaryService] ERROR in convertToDailySummary:', error);
      throw error; // Re-throw to be caught by caller
    }
  }

  /**
   * Generate AI-powered weekly summary
   */
  async generateWeeklySummary(context: SummaryContext): Promise<WeeklySummary> {
    // Early return for empty sessions - use weekly-specific fallback
    if (!context.sessions || context.sessions.length === 0) {
      return this.generateFallbackWeeklySummary(context);
    }

    try {
      // Ensure timeframe is set
      const weeklyContext = { ...context, timeframe: 'weekly' as const };

      // Generate AI summary
      const aiResult = await this.generateDailySummary(weeklyContext);

      // Convert to weekly format with calculated metrics
      return this.convertToWeeklySummary(aiResult, context.sessions, context.dateRange);
    } catch (error) {
      console.error('[SummaryService] Error generating weekly summary:', error);
      return this.generateFallbackWeeklySummary(context);
    }
  }

  /**
   * Generate AI-powered monthly summary
   */
  async generateMonthlySummary(context: SummaryContext): Promise<MonthlySummary> {
    // Early return for empty sessions - use monthly-specific fallback
    if (!context.sessions || context.sessions.length === 0) {
      return this.generateFallbackMonthlySummary(context);
    }

    try {
      // Ensure timeframe is set
      const monthlyContext = { ...context, timeframe: 'monthly' as const };

      // Generate AI summary
      const aiResult = await this.generateDailySummary(monthlyContext);

      // Convert to monthly format with calculated metrics
      return this.convertToMonthlySummary(aiResult, context.sessions, context.dateRange);
    } catch (error) {
      console.error('[SummaryService] Error generating monthly summary:', error);
      return this.generateFallbackMonthlySummary(context);
    }
  }

  /**
   * Convert AI result to WeeklySummary format with metrics
   */
  convertToWeeklySummary(
    aiResult: AISummaryResult,
    sessions: CursorSession[],
    dateRange?: { start: Date; end: Date }
  ): WeeklySummary {
    // Calculate metrics from sessions
    const totalTime = sessions.reduce((sum, s) => {
      const duration = s.lastActivity.getTime() - s.startTime.getTime();
      return sum + Math.floor(duration / 60000); // Convert to minutes
    }, 0);
    const totalPrompts = sessions.reduce((sum, s) => sum + s.promptCount, 0);

    // Group by day
    const dailyData = new Map<string, { time: number; prompts: number }>();
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    sessions.forEach((session) => {
      const date = session.startTime;
      const dayKey = date.toLocaleDateString('en-US', { weekday: 'short' });
      const current = dailyData.get(dayKey) || { time: 0, prompts: 0 };
      const duration = session.lastActivity.getTime() - session.startTime.getTime();
      current.time += Math.floor(duration / 60000); // Convert to minutes
      current.prompts += session.promptCount;
      dailyData.set(dayKey, current);
    });

    const dailyBreakdown = days.map((day) => {
      const data = dailyData.get(day) || { time: 0, prompts: 0 };
      return { day, time: Math.round(data.time), prompts: data.prompts, avgScore: 0 };
    });

    // Extract top projects
    const projectData = new Map<string, { time: number; prompts: number }>();
    sessions.forEach((session) => {
      const projectName = session.workspaceName || 'Unknown';
      const current = projectData.get(projectName) || { time: 0, prompts: 0 };
      const duration = session.lastActivity.getTime() - session.startTime.getTime();
      current.time += Math.floor(duration / 60000);
      current.prompts += session.promptCount;
      projectData.set(projectName, current);
    });

    const topProjects = Array.from(projectData.entries())
      .map(([name, data]) => ({ name, time: Math.round(data.time), prompts: data.prompts }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 3);

    const startDate = dateRange?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = dateRange?.end || new Date();

    return {
      startDate,
      endDate,
      totalTime: Math.round(totalTime),
      promptsAnalyzed: totalPrompts,
      avgScore: 0,
      scoreTrend: 0,
      sessions: sessions.length,
      dailyBreakdown,
      topProjects,
      insights: aiResult.insights,
      achievements: aiResult.accomplishments,
      source: aiResult.source,
      providerInfo: aiResult.provider && aiResult.model ? {
        provider: aiResult.provider,
        model: aiResult.model
      } : undefined,
      // Enhanced report fields
      executiveSummary: aiResult.executiveSummary,
      activityDistribution: aiResult.activityDistribution,
      promptQuality: aiResult.promptQuality,
      projectBreakdown: aiResult.projectBreakdown,
      businessOutcomes: aiResult.businessOutcomes
    };
  }

  /**
   * Convert AI result to MonthlySummary format with metrics
   */
  convertToMonthlySummary(
    aiResult: AISummaryResult,
    sessions: CursorSession[],
    dateRange?: { start: Date; end: Date }
  ): MonthlySummary {
    // Calculate metrics from sessions
    const totalTime = sessions.reduce((sum, s) => {
      const duration = s.lastActivity.getTime() - s.startTime.getTime();
      return sum + Math.floor(duration / 60000); // Convert to minutes
    }, 0);
    const totalPrompts = sessions.reduce((sum, s) => sum + s.promptCount, 0);

    // Group by week
    const weeklyData = new Map<number, { time: number; prompts: number }>();
    const activeDaysSet = new Set<string>();

    sessions.forEach((session) => {
      const date = session.startTime;
      const weekNumber = Math.ceil(date.getDate() / 7);
      const dayKey = date.toDateString();

      activeDaysSet.add(dayKey);

      const current = weeklyData.get(weekNumber) || { time: 0, prompts: 0 };
      const duration = session.lastActivity.getTime() - session.startTime.getTime();
      current.time += Math.floor(duration / 60000);
      current.prompts += session.promptCount;
      weeklyData.set(weekNumber, current);
    });

    const weeklyBreakdown = Array.from(weeklyData.entries())
      .map(([week, data]) => ({
        week,
        time: Math.round(data.time),
        prompts: data.prompts,
        avgScore: 0
      }))
      .sort((a, b) => a.week - b.week);

    const now = dateRange?.end || new Date();
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    return {
      month: now.toLocaleDateString('en-US', { month: 'long' }),
      year: now.getFullYear(),
      totalTime: Math.round(totalTime),
      promptsAnalyzed: totalPrompts,
      avgScore: 0,
      scoreTrend: 0,
      sessions: sessions.length,
      activeDays: activeDaysSet.size,
      totalDays,
      weeklyBreakdown,
      insights: aiResult.insights,
      achievements: aiResult.accomplishments,
      trends: aiResult.suggestedFocus,
      source: aiResult.source,
      providerInfo: aiResult.provider && aiResult.model ? {
        provider: aiResult.provider,
        model: aiResult.model
      } : undefined,
      // Enhanced report fields
      executiveSummary: aiResult.executiveSummary,
      activityDistribution: aiResult.activityDistribution,
      promptQuality: aiResult.promptQuality,
      projectBreakdown: aiResult.projectBreakdown,
      businessOutcomes: aiResult.businessOutcomes
    };
  }

  /**
   * Generate fallback weekly summary (basic parsing, no AI)
   */
  generateFallbackWeeklySummary(context: SummaryContext): WeeklySummary {
    const { sessions, dateRange } = context;

    if (!sessions || sessions.length === 0) {
      const startDate = dateRange?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = dateRange?.end || new Date();

      return {
        startDate,
        endDate,
        totalTime: 0,
        promptsAnalyzed: 0,
        avgScore: 0,
        scoreTrend: 0,
        sessions: 0,
        dailyBreakdown: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
          day, time: 0, prompts: 0, avgScore: 0
        })),
        topProjects: [],
        insights: 'No coding sessions detected this week. Start coding and your summary will appear here!',
        source: 'fallback'
      };
    }

    // Use convertToWeeklySummary with fallback AI result
    const fallbackResult: AISummaryResult = {
      accomplishments: ['Continued development work'],
      suggestedFocus: ['Continue working on current projects'],
      source: 'fallback'
    };

    return this.convertToWeeklySummary(fallbackResult, sessions, dateRange);
  }

  /**
   * Generate fallback monthly summary (basic parsing, no AI)
   */
  generateFallbackMonthlySummary(context: SummaryContext): MonthlySummary {
    const { sessions, dateRange } = context;

    if (!sessions || sessions.length === 0) {
      const now = dateRange?.end || new Date();
      return {
        month: now.toLocaleDateString('en-US', { month: 'long' }),
        year: now.getFullYear(),
        totalTime: 0,
        promptsAnalyzed: 0,
        avgScore: 0,
        scoreTrend: 0,
        sessions: 0,
        activeDays: 0,
        totalDays: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
        weeklyBreakdown: [],
        insights: 'No coding sessions detected this month. Start coding and your summary will appear here!',
        source: 'fallback'
      };
    }

    // Use convertToMonthlySummary with fallback AI result
    const fallbackResult: AISummaryResult = {
      accomplishments: ['Continued development work'],
      suggestedFocus: ['Continue working on current projects'],
      source: 'fallback'
    };

    return this.convertToMonthlySummary(fallbackResult, sessions, dateRange);
  }
}
