/**
 * SummariesView - Reports Tab (Dashboard Style)
 *
 * Shows a combined dashboard view:
 * - Daily Standup card at top with copy button
 * - Weekly Insights card below
 * - Expandable "View full weekly report" section
 */

import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronRight, Flame, AlertTriangle, Lightbulb, Calendar, ArrowRight, BarChart2, RefreshCw, TrendingUp } from 'lucide-react';
import { useAppV2, formatDuration } from '../../AppV2';
import { send } from '../../utils/vscode';
import type { StandupSummary, WeeklySummary, MonthlySummary, BusinessOutcome } from '../../state/types-v2';

// Copy Button with confirmation
function CopyButton({ onClick, label = 'Copy' }: { onClick: () => void; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button className={`vl-card-copy-btn ${copied ? 'copied' : ''}`} onClick={handleClick}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

// Refresh Button
function RefreshButton({ onClick, isLoading }: { onClick: () => void; isLoading?: boolean }) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLoading) onClick();
  };

  return (
    <button
      className={`vl-card-refresh-btn ${isLoading ? 'loading' : ''}`}
      onClick={handleClick}
      disabled={isLoading}
      title="Refresh"
    >
      <RefreshCw size={12} className={isLoading ? 'spinning' : ''} />
    </button>
  );
}

// Report Card Wrapper - common structure for all report cards
function ReportCard({
  title,
  subtitle,
  actions,
  providerInfo,
  className,
  children
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  providerInfo?: { model: string; provider: string };
  className?: string;
  children: React.ReactNode;
}) {
  const providerLabel = providerInfo
    ? (providerInfo.model ? `${providerInfo.provider} · ${providerInfo.model}` : providerInfo.provider)
    : null;

  return (
    <div className={`vl-report-card ${className || ''}`}>
      <div className="vl-report-card-header">
        {title && <div className="vl-report-card-title">{title}</div>}
        {subtitle && <div className="vl-report-card-subtitle">{subtitle}</div>}
        {actions}
      </div>
      <div className="vl-report-card-content">
        {children}
      </div>
      {providerLabel && (
        <div className="vl-report-card-footer">
          <span className="vl-provider-label">Analyzed by {providerLabel}</span>
        </div>
      )}
    </div>
  );
}

// Daily Standup Card
function DailyStandupCard({
  summary,
  onCopy,
  onRefresh,
  isLoading
}: {
  summary: StandupSummary | null;
  onCopy: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
}) {
  if (!summary) return null;

  const outcomesByProject = groupOutcomesByProject(summary.previousWorkday?.businessOutcomes);
  const yesterdayItems = Object.keys(outcomesByProject).length > 0
    ? Object.entries(outcomesByProject).flatMap(([project, outcomes]) =>
        outcomes.map(o => `${o.objective} (${project})`)
      )
    : summary.previousWorkday?.workedOn || [];

  const todayItems = summary.suggestedFocusForToday || [];

  return (
    <ReportCard
      title={<><Calendar size={16} /> DAILY STANDUP</>}
      actions={
        <div className="vl-report-card-actions">
          <RefreshButton onClick={onRefresh} isLoading={isLoading} />
          <CopyButton onClick={onCopy} />
        </div>
      }
      providerInfo={summary.providerInfo}
    >
      {yesterdayItems.length > 0 && (
        <div className="vl-standup-section">
          <div className="vl-standup-section-label">Yesterday I:</div>
          <ul className="vl-standup-list">
            {yesterdayItems.slice(0, 4).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {todayItems.length > 0 && (
        <div className="vl-standup-section">
          <div className="vl-standup-section-label">Today I plan to:</div>
          <ul className="vl-standup-list">
            {todayItems.slice(0, 3).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </ReportCard>
  );
}

// Weekly Insights Card
function WeeklyInsightsCard({
  summary,
  onRefresh,
  isLoading
}: {
  summary: WeeklySummary | null;
  onRefresh: () => void;
  isLoading?: boolean;
}) {
  if (!summary) return null;

  const dateRange = `${formatShortDate(summary.startDate)} - ${formatShortDate(summary.endDate)}`;
  const counts = countOutcomes(summary.businessOutcomes);

  // Build stats line
  const statsItems = [
    formatDuration(summary.totalTime),
    `${summary.sessions} sessions`
  ];
  if (counts.feature) statsItems.push(`${counts.feature} feature${counts.feature > 1 ? 's' : ''}`);
  if (counts.bugfix) statsItems.push(`${counts.bugfix} bug fix${counts.bugfix > 1 ? 'es' : ''}`);

  // Build insights from executive summary or generate from data
  const insights = summary.executiveSummary?.slice(0, 3) || [];

  return (
    <ReportCard
      subtitle={`THIS WEEK · ${dateRange}`}
      actions={<RefreshButton onClick={onRefresh} isLoading={isLoading} />}
      providerInfo={summary.providerInfo}
      className="vl-report-card--insights"
    >
      <div className="vl-weekly-stats">{statsItems.join(' · ')}</div>

      {insights.length > 0 && (
        <div className="vl-weekly-insights">
          {insights.map((insight, i) => (
            <div key={i} className="vl-insight-item">
              {getInsightIcon(insight)}
              <span>{insight}</span>
            </div>
          ))}
        </div>
      )}
    </ReportCard>
  );
}

// Monthly Insights Card
function MonthlyInsightsCard({
  summary,
  onRefresh,
  isLoading
}: {
  summary: MonthlySummary | null;
  onRefresh: () => void;
  isLoading?: boolean;
}) {
  if (!summary) return null;

  const counts = countOutcomes(summary.businessOutcomes);

  // Build stats line
  const statsItems = [
    formatDuration(summary.totalTime),
    `${summary.sessions} sessions`,
    `${summary.activeDays}/${summary.totalDays} days`
  ];
  if (counts.feature) statsItems.push(`${counts.feature} feature${counts.feature > 1 ? 's' : ''}`);
  if (counts.bugfix) statsItems.push(`${counts.bugfix} bug fix${counts.bugfix > 1 ? 'es' : ''}`);

  // Build insights from executive summary
  const insights = summary.executiveSummary?.slice(0, 3) || [];

  return (
    <ReportCard
      subtitle={`THIS MONTH · ${summary.month} ${summary.year}`}
      actions={<RefreshButton onClick={onRefresh} isLoading={isLoading} />}
      providerInfo={summary.providerInfo}
      className="vl-report-card--insights"
    >
      <div className="vl-weekly-stats">{statsItems.join(' · ')}</div>

      {insights.length > 0 && (
        <div className="vl-weekly-insights">
          {insights.map((insight, i) => (
            <div key={i} className="vl-insight-item">
              {getInsightIcon(insight)}
              <span>{insight}</span>
            </div>
          ))}
        </div>
      )}
    </ReportCard>
  );
}

// Get appropriate icon for insight
function getInsightIcon(insight: string) {
  const lower = insight.toLowerCase();
  if (lower.includes('shipped') || lower.includes('completed') || lower.includes('finished')) {
    return <Flame size={14} className="vl-insight-icon vl-insight-icon--success" />;
  }
  if (lower.includes('warning') || lower.includes('limit') || lower.includes('error') || lower.includes('issue')) {
    return <AlertTriangle size={14} className="vl-insight-icon vl-insight-icon--warning" />;
  }
  return <Lightbulb size={14} className="vl-insight-icon vl-insight-icon--tip" />;
}

// View Full Report Expandable
function ViewFullReport({ summary }: { summary: WeeklySummary | null }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!summary) return null;

  return (
    <div className="vl-view-full-report">
      <button
        className="vl-view-full-report-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        View full weekly report
      </button>

      {isOpen && (
        <div className="vl-full-report-content">
          {/* Daily Breakdown */}
          {summary.dailyBreakdown && summary.dailyBreakdown.length > 0 && (
            <>
              <div className="vl-full-report-section-title">Daily Breakdown</div>
              <table className="vl-daily-breakdown">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Time</th>
                    <th>Prompts</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.dailyBreakdown.map((day, i) => (
                    <tr key={i}>
                      <td>{day.day}</td>
                      <td>{formatDuration(day.time)}</td>
                      <td>{day.prompts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Activity Distribution */}
          {summary.activityDistribution && Object.keys(summary.activityDistribution).length > 0 && (
            <>
              <div className="vl-full-report-section-title">Activity Distribution</div>
              <div className="vl-activity-compact">
                {Object.entries(summary.activityDistribution)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 5)
                  .map(([activity, percentage]) => (
                    <div key={activity} className="vl-activity-row">
                      <span>{activity}</span>
                      <div className="vl-activity-bar-compact">
                        <div className="vl-activity-fill" style={{ width: `${percentage}%` }} />
                      </div>
                      <span className="vl-activity-pct">{percentage}%</span>
                    </div>
                  ))}
              </div>
            </>
          )}

          {/* Top Projects */}
          {summary.topProjects && summary.topProjects.length > 0 && (
            <>
              <div className="vl-full-report-section-title">Top Projects</div>
              <div className="vl-top-projects">
                {summary.topProjects.slice(0, 4).map((project, i) => (
                  <div key={i} className="vl-project-row">
                    <span className="vl-project-name">{project.name}</span>
                    <span className="vl-project-stats">
                      {formatDuration(project.time)} · {project.prompts} prompts
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Empty Card Placeholder with Generate Button
function EmptyReportCard({
  title,
  icon,
  description,
  buttonText,
  onGenerate,
  isLoading
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  buttonText: string;
  onGenerate: () => void;
  isLoading?: boolean;
}) {
  return (
    <div className="vl-report-card vl-report-card--empty">
      <div className="vl-report-card-header">
        <div className="vl-report-card-title">
          {icon}
          {title}
        </div>
      </div>
      <div className="vl-report-card-content vl-report-card-empty-content">
        <p className="vl-report-empty-text">{description}</p>
        <button
          className="vl-report-generate-btn"
          onClick={onGenerate}
          disabled={isLoading}
        >
          {isLoading ? (
            <>Generating...</>
          ) : (
            <>
              <ArrowRight size={14} />
              {buttonText}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Main SummariesView Component
export function SummariesView() {
  const { state, dispatch } = useAppV2();

  const handleCopyStandup = () => {
    if (state.standupSummary) {
      const text = formatStandupAsText(state.standupSummary);
      navigator.clipboard.writeText(text);
    }
  };

  const handleGenerateStandup = () => {
    dispatch({ type: 'START_LOADING_SUMMARY', payload: 'Generating standup...' });
    send('getSummary', { period: 'standup' });
  };

  const handleGenerateWeekly = () => {
    dispatch({ type: 'START_LOADING_SUMMARY', payload: 'Generating weekly report...' });
    send('getSummary', { period: 'week' });
  };

  const handleGenerateMonthly = () => {
    dispatch({ type: 'START_LOADING_SUMMARY', payload: 'Generating monthly report...' });
    send('getSummary', { period: 'month' });
  };

  return (
    <div className="vl-reports-view">
      {/* Daily Standup Card - show content or empty state */}
      {state.standupSummary ? (
        <DailyStandupCard
          summary={state.standupSummary}
          onCopy={handleCopyStandup}
          onRefresh={handleGenerateStandup}
          isLoading={state.isLoadingSummary}
        />
      ) : (
        <EmptyReportCard
          title="DAILY STANDUP"
          icon={<Calendar size={16} />}
          description="Yesterday's work and today's focus, ready to share with your team."
          buttonText="Generate Standup"
          onGenerate={handleGenerateStandup}
          isLoading={state.isLoadingSummary}
        />
      )}

      {/* Weekly Insights Card - show content or empty state */}
      {state.weeklySummary ? (
        <>
          <WeeklyInsightsCard
            summary={state.weeklySummary}
            onRefresh={handleGenerateWeekly}
            isLoading={state.isLoadingSummary}
          />
          <ViewFullReport summary={state.weeklySummary} />
        </>
      ) : (
        <EmptyReportCard
          title="THIS WEEK"
          icon={<BarChart2 size={16} />}
          description="See patterns, insights, and a summary of your week's coding sessions."
          buttonText="Generate Weekly Report"
          onGenerate={handleGenerateWeekly}
          isLoading={state.isLoadingSummary}
        />
      )}

      {/* Monthly Insights Card - show content or empty state */}
      {state.monthlySummary ? (
        <MonthlyInsightsCard
          summary={state.monthlySummary}
          onRefresh={handleGenerateMonthly}
          isLoading={state.isLoadingSummary}
        />
      ) : (
        <EmptyReportCard
          title="THIS MONTH"
          icon={<TrendingUp size={16} />}
          description="Monthly trends, total activity, and long-term patterns."
          buttonText="Generate Monthly Report"
          onGenerate={handleGenerateMonthly}
          isLoading={state.isLoadingSummary}
        />
      )}

      {/* Cloud CTA */}
      <CloudCTA />
    </div>
  );
}

// Cloud CTA Banner
function CloudCTA() {
  const { dispatch } = useAppV2();

  return (
    <div className="vl-cloud-cta-banner">
      <div className="vl-cloud-cta-text">
        <div className="vl-cloud-cta-title">Want daily reports in your inbox?</div>
        <div className="vl-cloud-cta-subtitle">
          Get your standup delivered every morning, ready to share.
        </div>
      </div>
      <button
        className="vl-cloud-cta-btn"
        onClick={() => dispatch({ type: 'SET_TAB', payload: 'account' })}
      >
        Set up emails <ArrowRight size={12} />
      </button>
    </div>
  );
}

// Helper functions
function formatShortDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function countOutcomes(outcomes?: BusinessOutcome[]): Record<string, number> {
  return outcomes?.reduce((acc, o) => {
    acc[o.category] = (acc[o.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};
}

function groupOutcomesByProject(outcomes?: BusinessOutcome[]): Record<string, BusinessOutcome[]> {
  return outcomes?.reduce((acc, o) => {
    if (!acc[o.project]) acc[o.project] = [];
    acc[o.project].push(o);
    return acc;
  }, {} as Record<string, BusinessOutcome[]>) || {};
}

function formatStandupAsText(summary: StandupSummary): string {
  const outcomesByProject = groupOutcomesByProject(summary.previousWorkday?.businessOutcomes);
  let text = 'Yesterday I:\n';

  if (Object.keys(outcomesByProject).length > 0) {
    Object.entries(outcomesByProject).forEach(([project, outcomes]) => {
      outcomes.forEach(o => { text += `• ${o.objective} (${project})\n`; });
    });
  } else if (summary.previousWorkday?.workedOn?.length > 0) {
    summary.previousWorkday.workedOn.forEach(item => { text += `• ${item}\n`; });
  }

  if (summary.suggestedFocusForToday?.length > 0) {
    text += '\nToday I plan to:\n';
    summary.suggestedFocusForToday.forEach(item => { text += `• ${item}\n`; });
  }

  return text.trim();
}
