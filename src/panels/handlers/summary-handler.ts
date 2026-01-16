/**
 * SummaryHandler - Handles session summary generation messages
 *
 * This is the largest handler (~700 lines), handling:
 * - Daily summaries (today's sessions)
 * - Weekly summaries (last 7 days)
 * - Monthly summaries (last 30 days)
 * - Custom date range summaries
 *
 * Uses UnifiedSessionService to aggregate sessions from Cursor + Claude Code.
 */

import { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
import { SharedContext } from './shared-context';
import { ExtensionState } from '../../extension-state';
import type { CursorSession } from '../../cursor-integration/types';
import type { WeeklySummary, MonthlySummary } from '../../services/SummaryService';
import type { SessionsBySource } from '../../services/UnifiedSessionService';
import type { SummaryError, WebviewMessageData } from '../../shared/webview-protocol';
import { AnalyticsEvents } from '../../services/analytics-events';

const DEBUG_SUMMARY_HANDLER = false;

/**
 * Calculate previous workday date and weekend dates for standup
 * Mon -> Friday (3 days ago), Sun -> Friday, Sat -> Friday, Tue-Fri -> Yesterday
 */
function calculatePreviousWorkday(now: Date): {
  previousWorkday: Date;
  checkWeekend: boolean;
  saturdayDate?: Date;
  sundayDate?: Date;
} {
  const dayOfWeek = now.getDay();
  const previousWorkday = new Date(now);
  let checkWeekend = false;
  let saturdayDate: Date | undefined;
  let sundayDate: Date | undefined;

  if (dayOfWeek === 1) { // Monday
    previousWorkday.setDate(now.getDate() - 3);
    checkWeekend = true;
    saturdayDate = new Date(now);
    saturdayDate.setDate(now.getDate() - 2);
    sundayDate = new Date(now);
    sundayDate.setDate(now.getDate() - 1);
  } else if (dayOfWeek === 0) { // Sunday
    previousWorkday.setDate(now.getDate() - 2);
    checkWeekend = true;
    saturdayDate = new Date(now);
    saturdayDate.setDate(now.getDate() - 1);
  } else { // Tue-Sat
    previousWorkday.setDate(now.getDate() - 1);
  }

  return { previousWorkday, checkWeekend, saturdayDate, sundayDate };
}

/**
 * Empty summary structure for when no sessions exist
 */
interface EmptySummary {
  date: Date;
  promptsAnalyzed: number;
  avgScore: number;
  timeCoding: number;
  filesWorkedOn: number;
  sessions: number;
  workedOn: string[];
  suggestedFocus: string[];
  insights: string;
  source: 'fallback';
  sessionsBySource?: SessionsBySource;
}

export class SummaryHandler extends BaseMessageHandler {
  private sharedContext: SharedContext;

  constructor(
    messageSender: MessageSender,
    handlerContext: HandlerContext,
    sharedContext: SharedContext
  ) {
    super(messageSender, handlerContext);
    this.sharedContext = sharedContext;
  }

  getHandledMessageTypes(): string[] {
    return ['getSummary'];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    if (type === 'getSummary') {
      const d = data as WebviewMessageData<'getSummary'>;
      await this.handleGetSummary(d.period, d.startDate, d.endDate);
      return true;
    }
    return false;
  }

  private async handleGetSummary(
    period: 'standup' | 'today' | 'week' | 'month' | 'custom',
    startDateStr?: string,
    endDateStr?: string
  ): Promise<void> {
    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;

    // Send loading progress
    this.send('loadingProgress', { progress: 10, message: 'Loading sessions...' });

    try {
      if (period === 'standup') {
        await this.generateStandupSummary();
      } else if (period === 'today') {
        await this.generateTodaySummary();
      } else if (period === 'week') {
        await this.generateWeeklySummary();
      } else if (period === 'month') {
        await this.generateMonthlySummary();
      } else if (period === 'custom' && startDate && endDate) {
        await this.generateCustomDateRangeSummary(startDate, endDate);
      }
    } catch (error: unknown) {
      console.error('[SummaryHandler] Summary generation failed:', error);

      // Build structured error for UI
      let summaryError: SummaryError;
      if (this.isFileLockError(error)) {
        summaryError = {
          type: 'unknown',
          message: 'Claude settings file is locked',
          suggestion: 'Please close Claude Code or wait a moment and try again'
        };
      } else {
        summaryError = {
          type: 'unknown',
          message: error instanceof Error ? error.message.split('\n')[0] : 'Failed to generate summary',
          suggestion: 'Please try again or switch AI provider in Settings'
        };
      }

      // Send error to webview with proper loading progress reset
      this.send('loadingProgress', { progress: 0, message: '' });
      this.send('summaryData', { type: period, error: summaryError });
    }
  }

  /**
   * Generate today's summary from BOTH Cursor Composer AND Claude Code sessions with AI
   * Uses UnifiedSessionService to aggregate sessions from all sources
   */
  private async generateTodaySummary(): Promise<void> {
    const unifiedSessionService = this.sharedContext.unifiedSessionService;
    const summaryService = this.sharedContext.summaryService;

    if (!unifiedSessionService) {
      const emptySummary = this.generateEmptySummary('daily');
      this.send('summaryData', { type: 'today', summary: emptySummary });
      return;
    }

    try {
      // Progress: 20%
      this.send('loadingProgress', { progress: 20, message: 'Fetching today\'s sessions from all sources...' });

      // Use UnifiedSessionService to get sessions from BOTH Cursor AND Claude Code
      const { sessions: unifiedSessions, bySource } = await unifiedSessionService.getTodaySessions();

      if (DEBUG_SUMMARY_HANDLER) console.log(`[SummaryHandler] Found ${bySource.total} unified sessions (Cursor: ${bySource.cursor}, Claude Code: ${bySource.claudeCode})`);

      if (unifiedSessions.length === 0) {
        const emptySummary = this.generateEmptySummary('daily');
        this.send('loadingProgress', { progress: 100, message: 'No sessions found today' });
        this.send('summaryData', { type: 'today', summary: emptySummary });
        return;
      }

      // Progress: 40%
      this.send('loadingProgress', { progress: 40, message: 'Checking for AI providers...' });

      // Convert unified sessions to CursorSession format for SummaryService compatibility
      const cursorFormatSessions = unifiedSessionService.convertToCursorSessions(unifiedSessions);

      // Check if any LLM is available
      const hasAvailableLLM = await this.isLLMAvailable();

      if (!hasAvailableLLM || !summaryService) {
        // Fallback to basic parsing
        this.send('loadingProgress', { progress: 100, message: 'Using basic analysis (no AI available)' });
        const basicSummary = this.parseCursorSessions(cursorFormatSessions, new Date());
        // Add source breakdown to basic summary
        basicSummary.sessionsBySource = bySource;
        this.send('summaryData', { type: 'today', summary: basicSummary });
        return;
      }

      // Progress: 60%
      const providerName = await this.getActiveProviderName();
      if (DEBUG_SUMMARY_HANDLER) console.log(`[SummaryHandler] Using AI provider: ${providerName}`);
      this.send('loadingProgress', { progress: 60, message: `Analyzing ${bySource.total} sessions with ${providerName}...` });

      // Get custom instructions if available
      const customInstructions = await this.getUserCustomInstructions();

      // Enrich sessions with file context from messages (for Cursor sessions)
      const enrichedSessions = await this.enrichSessionsWithFiles(cursorFormatSessions);

      // Progress: 80%
      this.send('loadingProgress', { progress: 80, message: 'Generating AI summary...' });

      // Generate AI summary via SummaryService
      console.log('[SummaryHandler] Calling summaryService.generateDailySummary with unified sessions...');
      const aiResult = await summaryService.generateDailySummary({
        sessions: enrichedSessions,
        date: new Date(),
        userInstructions: customInstructions
      });

      console.log('[SummaryHandler] AI result received:', JSON.stringify(aiResult, null, 2));

      // Convert to UI format
      console.log('[SummaryHandler] Converting AI result to UI format...');
      const summary = summaryService.convertToDailySummary(aiResult, enrichedSessions, new Date());

      // Add session source breakdown to summary
      summary.sessionsBySource = bySource;
      summary.businessOutcomes = aiResult.businessOutcomes;

      console.log('[SummaryHandler] Summary converted with source breakdown:', bySource);

      // Progress: 100%
      this.send('loadingProgress', { progress: 100, message: `Summary generated by ${providerName}` });
      this.send('summaryData', { type: 'today', summary });

      // Track session summarized
      ExtensionState.getAnalyticsService().track(AnalyticsEvents.SESSION_SUMMARIZED, {
        provider: providerName,
      });

      console.log('[SummaryHandler] Summary sent to webview successfully!');

    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[SummaryHandler] ERROR generating AI summary:', err);
      console.error('[SummaryHandler] Error name:', err.name);
      console.error('[SummaryHandler] Error message:', err.message);
      console.error('[SummaryHandler] Error stack:', err.stack);

      // Fallback to basic parsing on error
      try {
        const { sessions: unifiedSessions, bySource } = await unifiedSessionService.getTodaySessions();
        if (unifiedSessions.length === 0) {
          const emptySummary = this.generateEmptySummary('daily');
          this.send('summaryData', { type: 'today', summary: emptySummary });
        } else {
          const cursorFormatSessions = unifiedSessionService.convertToCursorSessions(unifiedSessions);
          const basicSummary = this.parseCursorSessions(cursorFormatSessions, new Date());
          basicSummary.sessionsBySource = bySource;
          this.send('summaryData', { type: 'today', summary: basicSummary });
        }
      } catch (fallbackError: unknown) {
        console.error('[SummaryHandler] Fallback also failed:', fallbackError);
        // Show empty summary
        const emptySummary = this.generateEmptySummary('daily');
        this.send('summaryData', { type: 'today', summary: emptySummary });
      }
    }
  }

  /**
   * Generate standup summary showing previous workday data with weekend bonus
   * Uses smart date logic: Monday shows Friday, Sunday shows Friday, other days show yesterday
   */
  private async generateStandupSummary(): Promise<void> {
    const unifiedSessionService = this.sharedContext.unifiedSessionService;
    const summaryService = this.sharedContext.summaryService;

    if (!unifiedSessionService) {
      const emptySummary = this.generateEmptyStandupSummary();
      this.send('summaryData', { type: 'standup', summary: emptySummary });
      return;
    }

    try {
      // Progress: 20%
      this.send('loadingProgress', { progress: 20, message: 'Calculating previous workday...' });

      // Use shared date calculation
      const now = new Date();
      const { previousWorkday, checkWeekend, saturdayDate, sundayDate } = calculatePreviousWorkday(now);

      // Set to start and end of the previous workday
      const previousWorkdayStart = new Date(previousWorkday);
      previousWorkdayStart.setHours(0, 0, 0, 0);
      const previousWorkdayEnd = new Date(previousWorkday);
      previousWorkdayEnd.setHours(23, 59, 59, 999);

      if (DEBUG_SUMMARY_HANDLER) console.log(`[SummaryHandler] Standup: Previous workday is ${previousWorkday.toDateString()}`);

      // Progress: 30%
      this.send('loadingProgress', { progress: 30, message: 'Fetching previous workday sessions...' });

      // Fetch previous workday sessions
      const { sessions: workdaySessions, bySource } = await unifiedSessionService.getSessionsForDateRange(
        previousWorkdayStart,
        previousWorkdayEnd
      );

      if (DEBUG_SUMMARY_HANDLER) console.log(`[SummaryHandler] Found ${workdaySessions.length} sessions for previous workday`);

      // Progress: 40%
      let weekendActivity: {
        hasSaturday: boolean;
        hasSunday: boolean;
        totalMinutes: number;
        projectsWorkedOn: string[];
      } | undefined;

      if (checkWeekend) {
        this.send('loadingProgress', { progress: 40, message: 'Checking for weekend activity...' });

        const weekendProjects = new Set<string>();
        let weekendMinutes = 0;
        let hasSaturday = false;
        let hasSunday = false;

        // Check Saturday
        if (saturdayDate) {
          const satStart = new Date(saturdayDate);
          satStart.setHours(0, 0, 0, 0);
          const satEnd = new Date(saturdayDate);
          satEnd.setHours(23, 59, 59, 999);

          const { sessions: satSessions } = await unifiedSessionService.getSessionsForDateRange(satStart, satEnd);
          if (satSessions.length > 0) {
            hasSaturday = true;
            satSessions.forEach(s => {
              weekendMinutes += Math.floor((s.endTime.getTime() - s.startTime.getTime()) / 60000);
              weekendProjects.add(s.workspaceName);
            });
          }
        }

        // Check Sunday
        if (sundayDate) {
          const sunStart = new Date(sundayDate);
          sunStart.setHours(0, 0, 0, 0);
          const sunEnd = new Date(sundayDate);
          sunEnd.setHours(23, 59, 59, 999);

          const { sessions: sunSessions } = await unifiedSessionService.getSessionsForDateRange(sunStart, sunEnd);
          if (sunSessions.length > 0) {
            hasSunday = true;
            sunSessions.forEach(s => {
              weekendMinutes += Math.floor((s.endTime.getTime() - s.startTime.getTime()) / 60000);
              weekendProjects.add(s.workspaceName);
            });
          }
        }

        if (hasSaturday || hasSunday) {
          weekendActivity = {
            hasSaturday,
            hasSunday,
            totalMinutes: weekendMinutes,
            projectsWorkedOn: Array.from(weekendProjects)
          };
          if (DEBUG_SUMMARY_HANDLER) console.log(`[SummaryHandler] Weekend activity found:`, weekendActivity);
        }
      }

      // Handle empty previous workday
      if (workdaySessions.length === 0) {
        const emptySummary = this.generateEmptyStandupSummary();
        emptySummary.previousWorkdayDate = previousWorkday;
        emptySummary.weekendActivity = weekendActivity;
        this.send('loadingProgress', { progress: 100, message: 'No sessions found for previous workday' });
        this.send('summaryData', { type: 'standup', summary: emptySummary });
        return;
      }

      // Progress: 50%
      this.send('loadingProgress', { progress: 50, message: 'Checking for AI providers...' });

      // Convert unified sessions to CursorSession format for SummaryService compatibility
      const cursorFormatSessions = unifiedSessionService.convertToCursorSessions(workdaySessions);

      // Check if any LLM is available
      const hasAvailableLLM = await this.isLLMAvailable();

      if (!hasAvailableLLM || !summaryService) {
        // Fallback to basic parsing
        this.send('loadingProgress', { progress: 100, message: 'Using basic analysis (no AI available)' });
        const basicSummary = this.parseCursorSessions(cursorFormatSessions, previousWorkday);
        basicSummary.sessionsBySource = bySource;

        const standupSummary = {
          previousWorkday: basicSummary,
          previousWorkdayDate: previousWorkday,
          weekendActivity,
          totalSessions: basicSummary.sessions,
          totalTimeCoding: basicSummary.timeCoding,
          sessionsBySource: bySource,
          suggestedFocusForToday: basicSummary.suggestedFocus || [],
          source: 'fallback' as const
        };
        this.send('summaryData', { type: 'standup', summary: standupSummary });
        return;
      }

      // Progress: 60%
      const providerName = await this.getActiveProviderName();
      if (DEBUG_SUMMARY_HANDLER) console.log(`[SummaryHandler] Using AI provider: ${providerName}`);
      this.send('loadingProgress', { progress: 60, message: `Analyzing sessions with ${providerName}...` });

      // Get custom instructions if available
      const customInstructions = await this.getUserCustomInstructions();

      // Enrich sessions with file context
      const enrichedSessions = await this.enrichSessionsWithFiles(cursorFormatSessions);

      // Progress: 80%
      this.send('loadingProgress', { progress: 80, message: 'Generating AI summary...' });

      // Generate AI summary for previous workday
      const aiResult = await summaryService.generateDailySummary({
        sessions: enrichedSessions,
        date: previousWorkday,
        userInstructions: customInstructions
      });

      // Convert to UI format
      const dailySummary = summaryService.convertToDailySummary(aiResult, enrichedSessions, previousWorkday);
      dailySummary.sessionsBySource = bySource;
      dailySummary.businessOutcomes = aiResult.businessOutcomes;

      // Build standup summary
      const standupSummary = {
        previousWorkday: dailySummary,
        previousWorkdayDate: previousWorkday,
        weekendActivity,
        totalSessions: dailySummary.sessions,
        totalTimeCoding: dailySummary.timeCoding,
        sessionsBySource: bySource,
        suggestedFocusForToday: dailySummary.suggestedFocus || [],
        source: 'ai' as const,
        providerInfo: dailySummary.providerInfo
      };

      // Progress: 100%
      this.send('loadingProgress', { progress: 100, message: `Standup prep generated by ${providerName}` });
      this.send('summaryData', { type: 'standup', summary: standupSummary });

      // Track session summarized
      ExtensionState.getAnalyticsService().track(AnalyticsEvents.SESSION_SUMMARIZED, {
        provider: providerName,
        type: 'standup'
      });

    } catch (error: unknown) {
      console.error('[SummaryHandler] Error generating standup summary:', error);

      // Re-throw file lock errors to be handled by handleGetSummary
      if (this.isFileLockError(error)) {
        throw error;
      }

      // Fallback to empty standup
      const emptySummary = this.generateEmptyStandupSummary();
      this.send('summaryData', { type: 'standup', summary: emptySummary });
    }
  }

  /**
   * Generate empty standup summary when no sessions exist
   */
  private generateEmptyStandupSummary(): {
    previousWorkday: ReturnType<SummaryHandler['generateEmptySummary']>;
    previousWorkdayDate: Date;
    weekendActivity?: { hasSaturday: boolean; hasSunday: boolean; totalMinutes: number; projectsWorkedOn: string[] };
    totalSessions: number;
    totalTimeCoding: number;
    suggestedFocusForToday: string[];
    source: 'fallback';
  } {
    const { previousWorkday } = calculatePreviousWorkday(new Date());
    return {
      previousWorkday: this.generateEmptySummary('daily'),
      previousWorkdayDate: previousWorkday,
      totalSessions: 0,
      totalTimeCoding: 0,
      suggestedFocusForToday: ['Start coding and your standup will be ready tomorrow!'],
      source: 'fallback'
    };
  }

  /**
   * Generate weekly summary from BOTH Cursor AND Claude Code sessions using AI
   * Uses UnifiedSessionService to aggregate sessions from all sources
   */
  private async generateWeeklySummary(): Promise<void> {
    const unifiedSessionService = this.sharedContext.unifiedSessionService;
    const summaryService = this.sharedContext.summaryService;

    if (!unifiedSessionService) {
      const emptySummary = this.generateEmptyWeeklySummary();
      this.send('summaryData', { type: 'week', summary: emptySummary });
      return;
    }

    try {
      // Progress: 20%
      this.send('loadingProgress', { progress: 20, message: 'Fetching this week\'s sessions from all sources...' });

      // Use UnifiedSessionService to get sessions from BOTH Cursor AND Claude Code (last 7 days)
      const { sessions: unifiedSessions, bySource } = await unifiedSessionService.getSessionsForDays(7);

      if (DEBUG_SUMMARY_HANDLER) console.log(`[SummaryHandler] Found ${bySource.total} weekly unified sessions (Cursor: ${bySource.cursor}, Claude Code: ${bySource.claudeCode})`);

      if (unifiedSessions.length === 0) {
        const emptySummary = this.generateEmptyWeeklySummary();
        this.send('loadingProgress', { progress: 100, message: 'No sessions found this week' });
        this.send('summaryData', { type: 'week', summary: emptySummary });
        return;
      }

      // Progress: 40%
      this.send('loadingProgress', { progress: 40, message: 'Checking for AI providers...' });

      // Convert unified sessions to CursorSession format for SummaryService compatibility
      const cursorFormatSessions = unifiedSessionService.convertToCursorSessions(unifiedSessions);

      // Check if LLM available
      const hasLLM = await this.isLLMAvailable();

      if (!hasLLM || !summaryService) {
        // Fallback to basic parsing
        this.send('loadingProgress', { progress: 100, message: 'Using basic analysis (no AI available)' });
        const fallbackSummary = summaryService!.generateFallbackWeeklySummary({
          sessions: cursorFormatSessions,
          date: new Date(),
          timeframe: 'weekly',
          dateRange: {
            start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            end: new Date()
          }
        });
        // Add source breakdown
        fallbackSummary.sessionsBySource = bySource;
        this.send('summaryData', { type: 'week', summary: fallbackSummary });
        return;
      }

      // Progress: 60%
      const providerName = await this.getActiveProviderName();
      if (DEBUG_SUMMARY_HANDLER) console.log(`[SummaryHandler] Using AI provider: ${providerName}`);
      this.send('loadingProgress', { progress: 60, message: `Analyzing ${bySource.total} sessions with ${providerName}...` });

      // Get custom instructions
      const customInstructions = await this.getUserCustomInstructions();

      // Progress: 80%
      this.send('loadingProgress', { progress: 80, message: 'Generating AI weekly summary...' });

      // Generate AI summary
      const summary = await summaryService.generateWeeklySummary({
        sessions: cursorFormatSessions,
        date: new Date(),
        timeframe: 'weekly',
        userInstructions: customInstructions,
        dateRange: {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          end: new Date()
        }
      });

      // Add source breakdown
      summary.sessionsBySource = bySource;

      // Progress: 100%
      this.send('loadingProgress', { progress: 100, message: `Weekly summary generated by ${providerName}` });
      this.send('summaryData', { type: 'week', summary });

    } catch (error: unknown) {
      console.error('[SummaryHandler] Error generating weekly summary:', error);

      // Re-throw file lock errors to be handled by handleGetSummary
      if (this.isFileLockError(error)) {
        throw error;
      }

      // Fallback
      try {
        const { sessions: unifiedSessions, bySource } = await unifiedSessionService.getSessionsForDays(7);
        if (unifiedSessions.length === 0) {
          const emptySummary = this.generateEmptyWeeklySummary();
          this.send('summaryData', { type: 'week', summary: emptySummary });
        } else {
          const cursorFormatSessions = unifiedSessionService.convertToCursorSessions(unifiedSessions);
          const summaryService = this.sharedContext.summaryService;
          const fallbackSummary = summaryService!.generateFallbackWeeklySummary({
            sessions: cursorFormatSessions,
            date: new Date(),
            timeframe: 'weekly',
            dateRange: {
              start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              end: new Date()
            }
          });
          fallbackSummary.sessionsBySource = bySource;
          this.send('summaryData', { type: 'week', summary: fallbackSummary });
        }
      } catch (fallbackError: unknown) {
        if (this.isFileLockError(fallbackError)) {
          throw fallbackError;
        }
        const emptySummary = this.generateEmptyWeeklySummary();
        this.send('summaryData', { type: 'week', summary: emptySummary });
      }
    }
  }

  /**
   * Generate monthly summary from BOTH Cursor AND Claude Code sessions using AI
   * Uses UnifiedSessionService to aggregate sessions from all sources
   */
  private async generateMonthlySummary(): Promise<void> {
    const unifiedSessionService = this.sharedContext.unifiedSessionService;
    const summaryService = this.sharedContext.summaryService;

    if (!unifiedSessionService) {
      const emptySummary = this.generateEmptyMonthlySummary();
      this.send('summaryData', { type: 'month', summary: emptySummary });
      return;
    }

    try {
      // Progress: 20%
      this.send('loadingProgress', { progress: 20, message: 'Fetching this month\'s sessions from all sources...' });

      // Use UnifiedSessionService to get sessions from BOTH Cursor AND Claude Code (last 30 days)
      const { sessions: unifiedSessions, bySource } = await unifiedSessionService.getSessionsForDays(30);

      if (DEBUG_SUMMARY_HANDLER) console.log(`[SummaryHandler] Found ${bySource.total} monthly unified sessions (Cursor: ${bySource.cursor}, Claude Code: ${bySource.claudeCode})`);

      if (unifiedSessions.length === 0) {
        const emptySummary = this.generateEmptyMonthlySummary();
        this.send('loadingProgress', { progress: 100, message: 'No sessions found this month' });
        this.send('summaryData', { type: 'month', summary: emptySummary });
        return;
      }

      // Progress: 40%
      this.send('loadingProgress', { progress: 40, message: 'Checking for AI providers...' });

      // Convert unified sessions to CursorSession format for SummaryService compatibility
      const cursorFormatSessions = unifiedSessionService.convertToCursorSessions(unifiedSessions);

      // Check if LLM available
      const hasLLM = await this.isLLMAvailable();

      if (!hasLLM || !summaryService) {
        // Fallback to basic parsing
        this.send('loadingProgress', { progress: 100, message: 'Using basic analysis (no AI available)' });
        const fallbackSummary = summaryService!.generateFallbackMonthlySummary({
          sessions: cursorFormatSessions,
          date: new Date(),
          timeframe: 'monthly',
          dateRange: {
            start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            end: new Date()
          }
        });
        // Add source breakdown
        fallbackSummary.sessionsBySource = bySource;
        this.send('summaryData', { type: 'month', summary: fallbackSummary });
        return;
      }

      // Progress: 60%
      const providerName = await this.getActiveProviderName();
      if (DEBUG_SUMMARY_HANDLER) console.log(`[SummaryHandler] Using AI provider: ${providerName}`);
      this.send('loadingProgress', { progress: 60, message: `Analyzing ${bySource.total} sessions with ${providerName}...` });

      // Get custom instructions
      const customInstructions = await this.getUserCustomInstructions();

      // Progress: 80%
      this.send('loadingProgress', { progress: 80, message: 'Generating AI monthly summary...' });

      // Generate AI summary
      const summary = await summaryService.generateMonthlySummary({
        sessions: cursorFormatSessions,
        date: new Date(),
        timeframe: 'monthly',
        userInstructions: customInstructions,
        dateRange: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date()
        }
      });

      // Add source breakdown
      summary.sessionsBySource = bySource;

      // Progress: 100%
      this.send('loadingProgress', { progress: 100, message: `Monthly summary generated by ${providerName}` });
      this.send('summaryData', { type: 'month', summary });

    } catch (error: unknown) {
      console.error('[SummaryHandler] Error generating monthly summary:', error);

      // Re-throw file lock errors to be handled by handleGetSummary
      if (this.isFileLockError(error)) {
        throw error;
      }

      // Fallback
      try {
        const { sessions: unifiedSessions, bySource } = await unifiedSessionService.getSessionsForDays(30);
        if (unifiedSessions.length === 0) {
          const emptySummary = this.generateEmptyMonthlySummary();
          this.send('summaryData', { type: 'month', summary: emptySummary });
        } else {
          const cursorFormatSessions = unifiedSessionService.convertToCursorSessions(unifiedSessions);
          const summaryService = this.sharedContext.summaryService;
          const fallbackSummary = summaryService!.generateFallbackMonthlySummary({
            sessions: cursorFormatSessions,
            date: new Date(),
            timeframe: 'monthly',
            dateRange: {
              start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              end: new Date()
            }
          });
          fallbackSummary.sessionsBySource = bySource;
          this.send('summaryData', { type: 'month', summary: fallbackSummary });
        }
      } catch (fallbackError: unknown) {
        if (this.isFileLockError(fallbackError)) {
          throw fallbackError;
        }
        const emptySummary = this.generateEmptyMonthlySummary();
        this.send('summaryData', { type: 'month', summary: emptySummary });
      }
    }
  }

  /**
   * Generate custom date range summary from BOTH Cursor AND Claude Code sessions with AI
   * Uses UnifiedSessionService to aggregate sessions from all sources within the specified date range
   */
  private async generateCustomDateRangeSummary(startDate: Date, endDate: Date): Promise<void> {
    const unifiedSessionService = this.sharedContext.unifiedSessionService;
    const summaryService = this.sharedContext.summaryService;

    if (!unifiedSessionService) {
      const emptySummary = this.generateEmptySummary('daily');
      emptySummary.date = startDate;
      this.send('summaryData', { type: 'custom', summary: emptySummary });
      return;
    }

    try {
      const dateRangeStr = `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
      this.send('loadingProgress', { progress: 20, message: `Fetching sessions from ${dateRangeStr}...` });

      // Use UnifiedSessionService to get sessions from BOTH Cursor AND Claude Code within date range
      const { sessions: unifiedSessions, bySource } = await unifiedSessionService.getSessionsForDateRange(startDate, endDate);

      if (DEBUG_SUMMARY_HANDLER) console.log(`[SummaryHandler] Found ${bySource.total} unified sessions for custom range (Cursor: ${bySource.cursor}, Claude Code: ${bySource.claudeCode})`);

      if (unifiedSessions.length === 0) {
        const emptySummary = this.generateEmptySummary('daily');
        emptySummary.date = startDate;
        this.send('loadingProgress', { progress: 100, message: 'No sessions found in date range' });
        this.send('summaryData', { type: 'custom', summary: emptySummary });
        return;
      }

      this.send('loadingProgress', { progress: 40, message: 'Checking for AI providers...' });

      // Convert unified sessions to CursorSession format for SummaryService compatibility
      const cursorFormatSessions = unifiedSessionService.convertToCursorSessions(unifiedSessions);

      // Check if any LLM is available
      const hasAvailableLLM = await this.isLLMAvailable();

      if (!hasAvailableLLM || !summaryService) {
        // Fallback to basic parsing
        this.send('loadingProgress', { progress: 100, message: 'Using basic analysis (no AI available)' });
        const basicSummary = this.parseCursorSessions(cursorFormatSessions, startDate);
        basicSummary.sessionsBySource = bySource;
        this.send('summaryData', { type: 'custom', summary: basicSummary });
        return;
      }

      const providerName = await this.getActiveProviderName();
      if (DEBUG_SUMMARY_HANDLER) console.log(`[SummaryHandler] Using AI provider: ${providerName}`);
      this.send('loadingProgress', { progress: 60, message: `Analyzing ${bySource.total} sessions with ${providerName}...` });

      // Get custom instructions if available
      const customInstructions = await this.getUserCustomInstructions();

      // Enrich sessions with file context from messages (for Cursor sessions)
      const enrichedSessions = await this.enrichSessionsWithFiles(cursorFormatSessions);

      this.send('loadingProgress', { progress: 80, message: 'Generating AI summary...' });

      // Generate AI summary via SummaryService
      console.log('[SummaryHandler] Calling summaryService.generateDailySummary with custom date range...');
      const aiResult = await summaryService.generateDailySummary({
        sessions: enrichedSessions,
        date: startDate,
        userInstructions: customInstructions,
        dateRange: {
          start: startDate,
          end: endDate
        }
      });

      console.log('[SummaryHandler] AI result received for custom range:', JSON.stringify(aiResult, null, 2));

      // Convert to UI format
      console.log('[SummaryHandler] Converting AI result to UI format...');
      const summary = summaryService.convertToDailySummary(aiResult, enrichedSessions, startDate);

      // Add session source breakdown to summary
      summary.sessionsBySource = bySource;

      console.log('[SummaryHandler] Final summary with source breakdown:', JSON.stringify(summary.sessionsBySource, null, 2));

      this.send('loadingProgress', { progress: 100, message: `Custom range summary generated by ${providerName}` });
      this.send('summaryData', { type: 'custom', summary });

    } catch (error: unknown) {
      console.error('[SummaryHandler] Error generating custom date range summary:', error);

      // Re-throw file lock errors to be handled by handleGetSummary
      if (this.isFileLockError(error)) {
        throw error;
      }

      // Fallback
      try {
        const { sessions: unifiedSessions, bySource } = await unifiedSessionService.getSessionsForDateRange(startDate, endDate);
        if (unifiedSessions.length === 0) {
          const emptySummary = this.generateEmptySummary('daily');
          emptySummary.date = startDate;
          this.send('summaryData', { type: 'custom', summary: emptySummary });
        } else {
          const cursorFormatSessions = unifiedSessionService.convertToCursorSessions(unifiedSessions);
          const basicSummary = this.parseCursorSessions(cursorFormatSessions, startDate);
          basicSummary.sessionsBySource = bySource;
          this.send('summaryData', { type: 'custom', summary: basicSummary });
        }
      } catch (fallbackError: unknown) {
        if (this.isFileLockError(fallbackError)) {
          throw fallbackError;
        }
        const emptySummary = this.generateEmptySummary('daily');
        emptySummary.date = startDate;
        this.send('summaryData', { type: 'custom', summary: emptySummary });
      }
    }
  }

  /**
   * Enrich Cursor sessions with file context extracted from messages
   */
  private async enrichSessionsWithFiles(sessions: CursorSession[]): Promise<CursorSession[]> {
    const sessionReader = this.sharedContext.sessionReader;
    if (!sessionReader) {
      return sessions;
    }

    const enriched: CursorSession[] = [];

    for (const session of sessions) {
      try {
        // Get messages for this session
        const messages = sessionReader.getAllMessagesForSession(session.sessionId);

        // Extract file paths from message content
        const filePathsSet = new Set<string>();

        for (const message of messages) {
          // Look for file paths in message content
          // Common patterns: src/file.ts, ./components/Button.tsx, /absolute/path.js
          const fileMatches = message.content.match(/(?:\.\/|\/)?[\w\-\/]+\.(?:ts|tsx|js|jsx|json|css|html|md|py|java|go|rs|c|cpp|h|hpp)/gi);

          if (fileMatches) {
            fileMatches.forEach(file => filePathsSet.add(file));
          }
        }

        // Merge with existing file context
        const allFiles = [
          ...(session.fileContext || []),
          ...Array.from(filePathsSet)
        ];

        // Create enriched session
        enriched.push({
          ...session,
          fileContext: [...new Set(allFiles)], // Remove duplicates
          promptCount: messages.length // Use actual message count
        });

      } catch (error) {
        console.warn(`[SummaryHandler] Failed to enrich session ${session.sessionId}:`, error);
        // Keep original session if enrichment fails
        enriched.push(session);
      }
    }

    return enriched;
  }

  /**
   * Parse Cursor sessions into DailySummary format (basic, no AI)
   */
  private parseCursorSessions(sessions: CursorSession[], date: Date): any {
    if (!sessions || sessions.length === 0) {
      return {
        date,
        totalMessages: 0,
        avgScore: 0,
        timeCoding: 0,
        filesWorkedOn: 0,
        sessions: 0,
        bestPromptScore: 0,
        workedOn: ['No Cursor sessions found for today'],
        suggestedFocus: ['Start a Cursor Composer session to track your progress!'],
      };
    }

    // Calculate metrics
    const totalDuration = sessions.reduce((sum, s) => {
      const duration = s.lastActivity.getTime() - s.startTime.getTime();
      return sum + duration;
    }, 0);
    const totalMinutes = Math.floor(totalDuration / 60000);

    const totalMessages = sessions.reduce((sum, s) => sum + s.promptCount, 0);

    // Extract unique files
    const filesSet = new Set<string>();
    sessions.forEach((session) => {
      session.fileContext?.forEach((f) => filesSet.add(f));
    });

    // Extract project names
    const projects = new Set<string>();
    const activities: string[] = [];

    sessions.forEach((session) => {
      projects.add(session.workspaceName);

      // Generate activity description
      const fileCount = session.fileContext?.length || 0;
      if (fileCount > 0) {
        activities.push(`Worked on ${fileCount} files in ${session.workspaceName}`);
      } else {
        activities.push(`Session in ${session.workspaceName}`);
      }
    });

    // Limit activities to top 5
    const topActivities = activities.slice(0, 5);

    return {
      date,
      totalMessages,
      avgScore: 0,
      timeCoding: totalMinutes,
      filesWorkedOn: filesSet.size,
      sessions: sessions.length,
      bestPromptScore: 0,
      workedOn: topActivities.length > 0 ? topActivities : ['No specific work tracked'],
      suggestedFocus: [
        `Continue working on ${Array.from(projects).join(', ')}`,
        'Review and test recent changes'
      ],
    };
  }

  /**
   * Check if error is a file lock error (EBUSY) from Claude CLI
   */
  private isFileLockError(error: unknown): boolean {
    if (!error) return false;

    // Get error string from message or toString
    let errorStr = '';
    if (error instanceof Error) {
      errorStr = error.message;
    } else if (typeof error === 'string') {
      errorStr = error;
    } else if (typeof error === 'object') {
      errorStr = String(error);
    }

    // Check for EBUSY patterns in message
    if (
      errorStr.includes('EBUSY') ||
      errorStr.includes('resource busy or locked') ||
      (errorStr.includes('.claude.json') && errorStr.includes('locked')) ||
      (errorStr.includes('.claude.json') && errorStr.includes('busy'))
    ) {
      return true;
    }

    // Check error code/errno for Node.js errors
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>;
      if (err.code === 'EBUSY' || err.errno === -16) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if any LLM provider is available
   */
  private async isLLMAvailable(): Promise<boolean> {
    const providerDetectionService = this.sharedContext.providerDetectionService;
    if (!providerDetectionService) {
      return false;
    }

    try {
      const providers = await providerDetectionService.detectAll();
      return providers.some(p => p.status === 'connected' || p.status === 'available');
    } catch (error) {
      console.log('[SummaryHandler] Error checking LLM availability:', error);
      return false;
    }
  }

  /**
   * Get the active provider name
   */
  private async getActiveProviderName(): Promise<string> {
    const providerDetectionService = this.sharedContext.providerDetectionService;
    if (!providerDetectionService) {
      return 'AI';
    }

    try {
      const providers = await providerDetectionService.detectAll();
      const activeProviderId = providerDetectionService.getActiveProviderId();
      const activeProvider = providers.find(p => p.id === activeProviderId);
      return activeProvider?.name || 'AI';
    } catch (error) {
      console.log('[SummaryHandler] Error getting provider name:', error);
      return 'AI';
    }
  }

  /**
   * Get user custom instructions from config
   * NOTE: CLI config removed, custom instructions now stored in VS Code settings
   */
  private async getUserCustomInstructions(): Promise<string | undefined> {
    try {
      // TODO: Implement custom instructions via VS Code settings
      return undefined;
    } catch (error) {
      console.log('[SummaryHandler] Could not fetch custom instructions:', error);
      return undefined;
    }
  }

  /**
   * Generate empty summary when no sessions exist
   */
  private generateEmptySummary(type: 'daily' | 'weekly' | 'monthly'): EmptySummary {
    return {
      date: new Date(),
      promptsAnalyzed: 0,
      avgScore: 0,
      timeCoding: 0,
      filesWorkedOn: 0,
      sessions: 0,
      workedOn: [],
      suggestedFocus: [`No ${type} coding sessions detected yet`],
      insights: `Start coding and your ${type} summary will appear here!`,
      source: 'fallback'
    };
  }

  /**
   * Generate empty weekly summary
   */
  private generateEmptyWeeklySummary(): WeeklySummary {
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = new Date();

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

  /**
   * Generate empty monthly summary
   */
  private generateEmptyMonthlySummary(): MonthlySummary {
    const now = new Date();

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
}
