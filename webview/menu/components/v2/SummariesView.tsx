/**
 * SummariesView - Reports Tab (Dashboard Style)
 *
 * Shows a combined dashboard view:
 * - Daily Standup card at top with copy button
 * - Weekly Insights card below
 * - Expandable "View full weekly report" section
 */

import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronRight, Flame, AlertTriangle, Lightbulb, Calendar, ArrowRight, BarChart2, RefreshCw, TrendingUp, CalendarRange, Sparkles, FolderKanban } from 'lucide-react';
import { useAppV2, formatDuration } from '../../AppV2';
import { send } from '../../utils/vscode';
import type { StandupSummary, WeeklySummary, MonthlySummary, BusinessOutcome, PromptQualityMetrics, ProjectBreakdownItem } from '../../state/types-v2';
import { DateRangeDialog } from './DateRangeDialog';

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

  // Build stats line
  const counts = countOutcomes(summary.previousWorkday?.businessOutcomes);
  const statsItems = [
    formatDuration(summary.totalTimeCoding),
    `${summary.totalSessions} session${summary.totalSessions !== 1 ? 's' : ''}`
  ];
  if (counts.feature) statsItems.push(`${counts.feature} feature${counts.feature > 1 ? 's' : ''}`);
  if (counts.bugfix) statsItems.push(`${counts.bugfix} bug fix${counts.bugfix > 1 ? 'es' : ''}`);

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
      <div className="vl-weekly-stats">{statsItems.join(' · ')}</div>
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
      title={<><Calendar size={14} /> THIS WEEK · {dateRange}</>}
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
      title={<><Calendar size={14} /> THIS MONTH · {summary.month} {summary.year}</>}
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

// Executive Summary Section
function ExecutiveSummarySection({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return null;

  return (
    <>
      <div className="vl-full-report-section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Sparkles size={14} /> Executive Summary
      </div>
      <div className="vl-executive-summary" style={{
        padding: 'var(--space-lg)',
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%)',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: 'var(--space-xl)'
      }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map((item, i) => (
            <li key={i} style={{
              padding: 'var(--space-sm) 0',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-sm)'
            }}>
              <span style={{ color: 'var(--vl-accent)', fontWeight: 600 }}>-</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// Activity Distribution Section
function ActivityDistributionSection({ distribution }: { distribution?: Record<string, number> }) {
  if (!distribution || Object.keys(distribution).length === 0) return null;

  const sortedActivities = Object.entries(distribution).sort(([, a], [, b]) => b - a);

  const getActivityColor = (activity: string): string => {
    const colors: Record<string, string> = {
      'Development': 'var(--score-good)',
      'Debugging': 'var(--score-medium)',
      'Refactoring': 'var(--platform-cursor)',
      'Testing': 'var(--platform-vscode)',
      'Planning': 'var(--activity-planning)',
      'Research': 'var(--activity-research)',
      'Review': 'var(--platform-claude)',
      'Documentation': 'var(--activity-docs)',
      'Other': 'var(--activity-other)'
    };
    return colors[activity] || 'var(--activity-other)';
  };

  return (
    <>
      <div className="vl-full-report-section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <BarChart2 size={14} /> Activity Distribution
      </div>
      <div className="vl-activity-distribution" style={{
        padding: 'var(--space-lg)',
        background: 'var(--vscode-input-background)',
        border: '1px solid var(--vscode-input-border)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: 'var(--space-xl)'
      }}>
        {sortedActivities.map(([activity, percentage]) => (
          <div key={activity} style={{ marginBottom: 'var(--space-md)' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-xs)',
              fontSize: '12px'
            }}>
              <span>{activity}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{percentage}%</span>
            </div>
            <div style={{
              height: '8px',
              background: 'var(--vscode-panel-border)',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${percentage}%`,
                background: getActivityColor(activity),
                borderRadius: '4px',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// Prompt Quality Section
function PromptQualitySection({ quality }: { quality?: PromptQualityMetrics }) {
  if (!quality) return null;

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'var(--score-good)';
    if (score >= 60) return 'var(--score-medium)';
    return 'var(--score-low)';
  };

  const breakdownItems = [
    { label: 'Excellent', value: quality.breakdown.excellent, color: 'var(--score-good)' },
    { label: 'Good', value: quality.breakdown.good, color: 'var(--platform-vscode)' },
    { label: 'Fair', value: quality.breakdown.fair, color: 'var(--score-medium)' },
    { label: 'Poor', value: quality.breakdown.poor, color: 'var(--score-low)' }
  ];

  return (
    <>
      <div className="vl-full-report-section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <TrendingUp size={14} /> Prompt Quality
      </div>
      <div className="vl-prompt-quality" style={{
        padding: 'var(--space-lg)',
        background: 'var(--vscode-input-background)',
        border: '1px solid var(--vscode-input-border)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: 'var(--space-xl)'
      }}>
        {/* Average Score */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-lg)',
          paddingBottom: 'var(--space-md)',
          borderBottom: '1px solid var(--vscode-panel-border)'
        }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>Average Score</span>
          <span style={{
            fontSize: '24px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: getScoreColor(quality.averageScore)
          }}>
            {quality.averageScore}
          </span>
        </div>

        {/* Breakdown Bars */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
          {breakdownItems.map(item => (
            <div key={item.label} style={{
              flex: item.value || 0.1,
              height: '24px',
              background: item.color,
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: item.value > 0 ? '40px' : '0',
              transition: 'flex 0.3s ease'
            }}>
              {item.value > 10 && (
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'white' }}>
                  {item.value}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', fontSize: '11px' }}>
          {breakdownItems.map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '2px',
                background: item.color
              }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// Enhanced Project Breakdown Section
function EnhancedProjectBreakdownSection({ projects }: { projects?: ProjectBreakdownItem[] }) {
  if (!projects || projects.length === 0) return null;

  return (
    <>
      <div className="vl-full-report-section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <FolderKanban size={14} /> Project Breakdown
      </div>
      <div className="vl-enhanced-project-breakdown" style={{
        padding: 'var(--space-lg)',
        background: 'var(--vscode-input-background)',
        border: '1px solid var(--vscode-input-border)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: 'var(--space-xl)'
      }}>
        {projects.map((project, i) => (
          <div key={i} style={{
            padding: 'var(--space-md)',
            marginBottom: i < projects.length - 1 ? 'var(--space-md)' : 0,
            borderBottom: i < projects.length - 1 ? '1px solid var(--vscode-panel-border)' : 'none'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--space-sm)'
            }}>
              <span style={{ fontWeight: 600, fontSize: '13px' }}>{project.name}</span>
              <span style={{
                fontSize: '11px',
                padding: '2px 8px',
                background: 'var(--vl-accent)',
                color: 'white',
                borderRadius: '10px'
              }}>
                {project.sessions} session{project.sessions !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{
              display: 'flex',
              gap: 'var(--space-lg)',
              fontSize: '12px',
              opacity: 0.8
            }}>
              <span>Largest: <strong style={{ fontFamily: 'var(--font-mono)' }}>{project.largestSession}</strong></span>
              <span>Focus: <strong>{project.focus}</strong></span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
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
          {/* Executive Summary - at top */}
          <ExecutiveSummarySection items={summary.executiveSummary} />

          {/* Activity Distribution */}
          <ActivityDistributionSection distribution={summary.activityDistribution} />

          {/* Prompt Quality */}
          <PromptQualitySection quality={summary.promptQuality} />

          {/* Enhanced Project Breakdown (if AI provided it) */}
          <EnhancedProjectBreakdownSection projects={summary.projectBreakdown} />

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

          {/* Fallback Top Projects (if no enhanced breakdown from AI) */}
          {!summary.projectBreakdown && summary.topProjects && summary.topProjects.length > 0 && (
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

// View Full Monthly Report Expandable
function ViewFullMonthlyReport({ summary }: { summary: MonthlySummary | null }) {
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
        View full monthly report
      </button>

      {isOpen && (
        <div className="vl-full-report-content">
          {/* Executive Summary - at top */}
          <ExecutiveSummarySection items={summary.executiveSummary} />

          {/* Activity Distribution */}
          <ActivityDistributionSection distribution={summary.activityDistribution} />

          {/* Prompt Quality */}
          <PromptQualitySection quality={summary.promptQuality} />

          {/* Enhanced Project Breakdown (if AI provided it) */}
          <EnhancedProjectBreakdownSection projects={summary.projectBreakdown} />

          {/* Weekly Breakdown */}
          {summary.weeklyBreakdown && summary.weeklyBreakdown.length > 0 && (
            <>
              <div className="vl-full-report-section-title">Weekly Breakdown</div>
              <table className="vl-daily-breakdown">
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Time</th>
                    <th>Prompts</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.weeklyBreakdown.map((week, i) => (
                    <tr key={i}>
                      <td>Week {week.week}</td>
                      <td>{formatDuration(week.time)}</td>
                      <td>{week.prompts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

// Custom Range Insights Card
function CustomRangeInsightsCard({
  summary,
  dateRange,
  onRefresh,
  isLoading
}: {
  summary: WeeklySummary | null;
  dateRange: { startDate: Date; endDate: Date } | null;
  onRefresh: () => void;
  isLoading?: boolean;
}) {
  if (!summary || !dateRange) return null;

  const rangeLabel = `${formatShortDate(dateRange.startDate)} - ${formatShortDate(dateRange.endDate)}`;
  const counts = countOutcomes(summary.businessOutcomes);

  // Build stats line
  const statsItems = [
    formatDuration(summary.totalTime),
    `${summary.sessions} sessions`
  ];
  if (counts.feature) statsItems.push(`${counts.feature} feature${counts.feature > 1 ? 's' : ''}`);
  if (counts.bugfix) statsItems.push(`${counts.bugfix} bug fix${counts.bugfix > 1 ? 'es' : ''}`);

  // Build insights from executive summary
  const insights = summary.executiveSummary?.slice(0, 3) || [];

  return (
    <ReportCard
      title={<><CalendarRange size={14} /> CUSTOM RANGE · {rangeLabel}</>}
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

// Main SummariesView Component
export function SummariesView() {
  const { state, dispatch } = useAppV2();
  const [isDateDialogOpen, setIsDateDialogOpen] = useState(false);

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

  const handleOpenDateDialog = () => {
    setIsDateDialogOpen(true);
  };

  const handleCloseDateDialog = () => {
    setIsDateDialogOpen(false);
  };

  const handleGenerateCustom = (startDate: Date, endDate: Date) => {
    dispatch({ type: 'SET_CUSTOM_DATE_RANGE', payload: { startDate, endDate } });
    dispatch({ type: 'START_LOADING_SUMMARY', payload: 'Generating custom report...' });
    send('getSummary', {
      period: 'custom',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });
    setIsDateDialogOpen(false);
  };

  const handleRefreshCustom = () => {
    if (state.customDateRange) {
      dispatch({ type: 'START_LOADING_SUMMARY', payload: 'Refreshing custom report...' });
      send('getSummary', {
        period: 'custom',
        startDate: state.customDateRange.startDate.toISOString(),
        endDate: state.customDateRange.endDate.toISOString()
      });
    }
  };

  return (
    <div className="vl-reports-view">
      <div className="vl-reports-content">
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
          <>
            <MonthlyInsightsCard
              summary={state.monthlySummary}
              onRefresh={handleGenerateMonthly}
              isLoading={state.isLoadingSummary}
            />
            <ViewFullMonthlyReport summary={state.monthlySummary} />
          </>
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

        {/* Custom Date Range Card - show content or empty state */}
        {state.customSummary && state.customDateRange ? (
          <CustomRangeInsightsCard
            summary={state.customSummary}
            dateRange={state.customDateRange}
            onRefresh={handleRefreshCustom}
            isLoading={state.isLoadingSummary}
          />
        ) : (
          <EmptyReportCard
            title="CUSTOM RANGE"
            icon={<CalendarRange size={16} />}
            description="Pick any date range for a detailed report of your coding activity."
            buttonText="Select Dates"
            onGenerate={handleOpenDateDialog}
            isLoading={state.isLoadingSummary}
          />
        )}
      </div>

      {/* Cloud CTA - sticky at bottom */}
      <CloudCTA />

      {/* Date Range Dialog */}
      <DateRangeDialog
        isOpen={isDateDialogOpen}
        onClose={handleCloseDateDialog}
        onGenerate={handleGenerateCustom}
        isLoading={state.isLoadingSummary}
      />
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
