/**
 * ReportHandler - Handles report generation messages
 *
 * Wires the Reports UI to use SummaryService for local LLM-based report generation.
 * Converts structured summary data to HTML for display.
 *
 * Message types:
 * - generateReport: Generate a report (daily/weekly/custom)
 * - resetReport: Clear current report state
 * - copyReport: Copy report HTML to clipboard
 * - downloadReport: Download report as file (PDF not supported, uses HTML)
 * - shareReport: Share report (shows info message - not implemented)
 */

import * as vscode from 'vscode';
import { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
import { SharedContext } from './shared-context';

interface GenerateReportData {
  type: 'daily' | 'weekly' | 'custom';
  dateRange?: {
    start: string | Date;
    end: string | Date;
  };
  model?: string;
}

export class ReportHandler extends BaseMessageHandler {
  private sharedContext: SharedContext;
  private currentReportHtml: string | null = null;

  constructor(
    messageSender: MessageSender,
    handlerContext: HandlerContext,
    sharedContext: SharedContext
  ) {
    super(messageSender, handlerContext);
    this.sharedContext = sharedContext;
  }

  getHandledMessageTypes(): string[] {
    return [
      'generateReport',
      'resetReport',
      'copyReport',
      'downloadReport',
      'shareReport',
    ];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    switch (type) {
      case 'generateReport':
        await this.handleGenerateReport(data as GenerateReportData);
        return true;
      case 'resetReport':
        this.handleResetReport();
        return true;
      case 'copyReport':
        await this.handleCopyReport();
        return true;
      case 'downloadReport':
        await this.handleDownloadReport();
        return true;
      case 'shareReport':
        this.handleShareReport();
        return true;
      default:
        return false;
    }
  }

  private async handleGenerateReport(data: GenerateReportData): Promise<void> {
    const reportType = data?.type || 'daily';

    // Send start message
    this.send('reportStart', 'Initializing report generation...');

    try {
      // Get services
      const unifiedSessionService = this.sharedContext.unifiedSessionService;
      const summaryService = this.sharedContext.summaryService;

      if (!unifiedSessionService) {
        this.send('reportError', 'Session service not available');
        return;
      }

      // Progress: 10%
      this.send('reportProgress', { progress: 10, message: 'Loading sessions...' });

      // Get sessions based on report type
      let sessions: any[];
      let dateRange: { start: Date; end: Date };

      if (reportType === 'daily') {
        const result = await unifiedSessionService.getTodaySessions();
        sessions = result.sessions;
        const today = new Date();
        dateRange = { start: today, end: today };
      } else if (reportType === 'weekly') {
        const result = await unifiedSessionService.getSessionsForDays(7);
        sessions = result.sessions;
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        dateRange = { start, end };
      } else if (reportType === 'custom' && data.dateRange) {
        const start = new Date(data.dateRange.start);
        const end = new Date(data.dateRange.end);
        const result = await unifiedSessionService.getSessionsForDateRange(start, end);
        sessions = result.sessions;
        dateRange = { start, end };
      } else {
        this.send('reportError', 'Invalid report type or missing date range');
        return;
      }

      // Progress: 30%
      this.send('reportProgress', { progress: 30, message: `Found ${sessions.length} sessions...` });

      if (sessions.length === 0) {
        // Generate empty report
        const html = this.generateEmptyReportHtml(reportType, dateRange);
        this.currentReportHtml = html;
        this.send('reportSuccess', {
          html,
          type: reportType,
          dateRange: {
            start: dateRange.start.toISOString(),
            end: dateRange.end.toISOString(),
          },
          sessionCount: 0,
        });
        return;
      }

      // Progress: 50%
      this.send('reportProgress', { progress: 50, message: 'Generating AI summary...' });

      // Generate summary using SummaryService
      let html: string;

      if (summaryService) {
        try {
          const summary = await summaryService.generateDailySummary({
            sessions,
            date: dateRange.end,
            timeframe: reportType === 'custom' ? 'daily' : reportType,
            dateRange,
          });

          // Progress: 80%
          this.send('reportProgress', { progress: 80, message: 'Formatting report...' });

          // Convert summary to HTML
          html = this.summaryToHtml(summary, reportType, sessions.length, dateRange);
        } catch (summaryError) {
          console.warn('[ReportHandler] AI summary failed, using basic report:', summaryError);
          html = this.generateBasicReportHtml(sessions, reportType, dateRange);
        }
      } else {
        // No summary service - generate basic HTML report
        html = this.generateBasicReportHtml(sessions, reportType, dateRange);
      }

      // Progress: 100%
      this.send('reportProgress', { progress: 100, message: 'Complete!' });

      // Store for copy/download
      this.currentReportHtml = html;

      // Send success
      this.send('reportSuccess', {
        html,
        type: reportType,
        dateRange: {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
        },
        sessionCount: sessions.length,
      });
    } catch (error) {
      console.error('[ReportHandler] Report generation failed:', error);
      this.send('reportError', error instanceof Error ? error.message : 'Failed to generate report');
    }
  }

  private handleResetReport(): void {
    this.currentReportHtml = null;
    this.send('reportReset');
  }

  private async handleCopyReport(): Promise<void> {
    if (!this.currentReportHtml) {
      vscode.window.showWarningMessage('No report to copy');
      return;
    }

    try {
      await vscode.env.clipboard.writeText(this.currentReportHtml);
      vscode.window.showInformationMessage('Report copied to clipboard');
    } catch (error) {
      vscode.window.showErrorMessage('Failed to copy report');
    }
  }

  private async handleDownloadReport(): Promise<void> {
    if (!this.currentReportHtml) {
      vscode.window.showWarningMessage('No report to download');
      return;
    }

    try {
      // Show save dialog
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`vibe-log-report-${new Date().toISOString().split('T')[0]}.html`),
        filters: {
          'HTML Files': ['html'],
          'All Files': ['*'],
        },
      });

      if (uri) {
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(uri, encoder.encode(this.currentReportHtml));
        vscode.window.showInformationMessage(`Report saved to ${uri.fsPath}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage('Failed to save report');
    }
  }

  private handleShareReport(): void {
    vscode.window.showInformationMessage(
      'Share functionality requires cloud sync. Use Copy to share manually.'
    );
  }

  /**
   * Convert summary object to HTML report
   */
  private summaryToHtml(
    summary: any,
    reportType: string,
    sessionCount: number,
    dateRange: { start: Date; end: Date }
  ): string {
    const dateStr = this.formatDateRange(dateRange, reportType);

    return `
<div class="report">
  <h1>${this.capitalizeFirst(reportType)} Report</h1>
  <p class="date-range">${dateStr}</p>
  <p class="session-count">${sessionCount} sessions analyzed</p>

  <h2>Summary</h2>
  <p>${summary.narrative || summary.aiSummary || 'No summary available'}</p>

  ${summary.accomplishments?.length ? `
  <h2>Key Accomplishments</h2>
  <ul>
    ${summary.accomplishments.map((a: string) => `<li>${a}</li>`).join('')}
  </ul>
  ` : ''}

  ${summary.challenges?.length ? `
  <h2>Challenges</h2>
  <ul>
    ${summary.challenges.map((c: string) => `<li>${c}</li>`).join('')}
  </ul>
  ` : ''}

  ${summary.nextSteps?.length ? `
  <h2>Next Steps</h2>
  <ul>
    ${summary.nextSteps.map((n: string) => `<li>${n}</li>`).join('')}
  </ul>
  ` : ''}

  <h2>Statistics</h2>
  <table>
    <tr><td>Total Sessions</td><td>${sessionCount}</td></tr>
    <tr><td>Total Duration</td><td>${summary.totalDuration || 'N/A'}</td></tr>
    ${summary.linesChanged ? `<tr><td>Lines Changed</td><td>${summary.linesChanged}</td></tr>` : ''}
    ${summary.filesModified ? `<tr><td>Files Modified</td><td>${summary.filesModified}</td></tr>` : ''}
  </table>
</div>
`;
  }

  /**
   * Generate basic HTML report without AI summary
   */
  private generateBasicReportHtml(
    sessions: any[],
    reportType: string,
    dateRange: { start: Date; end: Date }
  ): string {
    const dateStr = this.formatDateRange(dateRange, reportType);

    // Calculate basic stats
    const totalDuration = sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
    const projects = [...new Set(sessions.map((s) => s.project || s.projectPath || 'Unknown'))];

    return `
<div class="report">
  <h1>${this.capitalizeFirst(reportType)} Report</h1>
  <p class="date-range">${dateStr}</p>

  <h2>Session Overview</h2>
  <table>
    <tr><td>Total Sessions</td><td>${sessions.length}</td></tr>
    <tr><td>Total Duration</td><td>${Math.round(totalDuration)} minutes</td></tr>
    <tr><td>Projects</td><td>${projects.length}</td></tr>
  </table>

  <h2>Projects Worked On</h2>
  <ul>
    ${projects.map((p) => `<li>${p}</li>`).join('')}
  </ul>

  <h2>Sessions</h2>
  <ul>
    ${sessions.slice(0, 10).map((s) => `
      <li>
        <strong>${s.project || s.projectPath || 'Unknown'}</strong>
        - ${s.durationMinutes || 0} min
        ${s.source ? `(${s.source})` : ''}
      </li>
    `).join('')}
    ${sessions.length > 10 ? `<li>... and ${sessions.length - 10} more sessions</li>` : ''}
  </ul>
</div>
`;
  }

  /**
   * Generate empty report HTML
   */
  private generateEmptyReportHtml(
    reportType: string,
    dateRange: { start: Date; end: Date }
  ): string {
    const dateStr = this.formatDateRange(dateRange, reportType);

    return `
<div class="report">
  <h1>${this.capitalizeFirst(reportType)} Report</h1>
  <p class="date-range">${dateStr}</p>

  <p>No coding sessions found for this period.</p>
  <p>Start coding with Cursor or Claude Code to generate reports!</p>
</div>
`;
  }

  private formatDateRange(dateRange: { start: Date; end: Date }, reportType: string): string {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    };

    if (reportType === 'daily') {
      return dateRange.end.toLocaleDateString('en-US', options);
    }

    return `${dateRange.start.toLocaleDateString('en-US', options)} - ${dateRange.end.toLocaleDateString('en-US', options)}`;
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
