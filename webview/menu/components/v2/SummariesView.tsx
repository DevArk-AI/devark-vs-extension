/**
 * SummariesView - Summaries Tab
 *
 * Shows:
 * - Period selector (Today/Week/Month)
 * - Today's summary with quick stats
 * - Yesterday fallback when no sessions today
 * - Monday recap (Friday + Weekend)
 * - Weekly/Monthly views
 */

import { useEffect, useState, useRef } from 'react';
import { Copy, ArrowRight, Calendar, Monitor, Terminal, Target, ArrowLeft, TrendingUp, BarChart3, Sparkles, FolderKanban, AlertTriangle } from 'lucide-react';
import { useAppV2, formatDuration } from '../../AppV2';
import { send } from '../../utils/vscode';
import type { SummaryPeriod, DailySummary, WeeklySummary, MonthlySummary, StandupSummary, SessionsBySource, BusinessOutcome, DateRange, PromptQualityMetrics, ProjectBreakdownItem, SummaryError } from '../../state/types-v2';
import { DateRangePicker } from './DateRangePicker';

export function SummariesView() {
  const { state, dispatch } = useAppV2();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // No auto-load - user must click Analyze button
  // (Removed useEffect that auto-loaded summaries)

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    };

    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [showDatePicker]);

  // Close dropdown on ESC key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showDatePicker) {
        setShowDatePicker(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showDatePicker]);

  const handlePeriodChange = (period: Exclude<SummaryPeriod, 'custom'>) => {
    dispatch({ type: 'SET_SUMMARY_PERIOD', payload: period });
    setShowDatePicker(false);
  };

  const handleAnalyze = () => {
    dispatch({ type: 'START_LOADING_SUMMARY', payload: 'Loading summary...' });

    if (state.summaryPeriod === 'custom' && state.customDateRange) {
      send('getSummary', {
        period: 'custom',
        startDate: state.customDateRange.startDate.toISOString(),
        endDate: state.customDateRange.endDate.toISOString()
      });
    } else {
      send('getSummary', { period: state.summaryPeriod });
    }
  };

  const handleBackToPeriods = () => {
    dispatch({ type: 'SET_SUMMARY_PERIOD', payload: 'today' });
    setShowDatePicker(false);
  };

  const handleDateRangeChange = (startDate: Date | null, endDate: Date | null) => {
    if (startDate && endDate) {
      // Set the custom date range in state
      dispatch({ type: 'SET_CUSTOM_DATE_RANGE', payload: { startDate, endDate } });

      // Switch to custom period
      dispatch({ type: 'SET_SUMMARY_PERIOD', payload: 'custom' });

      // Close the dropdown
      setShowDatePicker(false);

      // Don't auto-analyze - user must click Analyze button
    }
  };

  const formatCustomDateRange = (dateRange: DateRange | null): string => {
    if (!dateRange) return '';
    const start = dateRange.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const end = dateRange.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // If same date, show single date
    if (start === end) {
      return start;
    }
    return `${start} - ${end}`;
  };

  const handleCopyAsText = () => {
    let text = '';
    if (state.summaryPeriod === 'standup' && state.standupSummary) {
      text = formatStandupSummaryAsText(state.standupSummary);
    } else if (state.summaryPeriod === 'today' && state.todaySummary) {
      text = formatDailySummaryAsText(state.todaySummary);
    } else if (state.summaryPeriod === 'week' && state.weeklySummary) {
      text = formatWeeklySummaryAsText(state.weeklySummary);
    } else if (state.summaryPeriod === 'month' && state.monthlySummary) {
      text = formatMonthlySummaryAsText(state.monthlySummary);
    }
    navigator.clipboard.writeText(text);
  };

  // Check if today is Monday
  const isMonday = new Date().getDay() === 1;
  const hasNoSessionsToday = !state.todaySummary || state.todaySummary.sessions === 0;

  // Check if we have data for current period
  const hasData =
    (state.summaryPeriod === 'standup' && state.standupSummary !== null) ||
    (state.summaryPeriod === 'today' && state.todaySummary !== null) ||
    (state.summaryPeriod === 'week' && state.weeklySummary !== null) ||
    (state.summaryPeriod === 'month' && state.monthlySummary !== null) ||
    (state.summaryPeriod === 'custom' && state.customSummary !== null);

  // Determine if we should show analyze button
  const showAnalyzeButton = !hasData && !state.isLoadingSummary;

  return (
    <div className="vl-summaries-view">
      {/* Header with Period Selector and Calendar Icon */}
      <div className="vl-summaries-header">
        {/* Show either period buttons OR custom date display */}
        {state.summaryPeriod !== 'custom' ? (
          <div className="vl-period-selector">
            <button
              className={`vl-period-btn ${state.summaryPeriod === 'standup' ? 'active' : ''}`}
              onClick={() => handlePeriodChange('standup')}
            >
              Standup
            </button>
            <button
              className={`vl-period-btn ${state.summaryPeriod === 'today' ? 'active' : ''}`}
              onClick={() => handlePeriodChange('today')}
            >
              Today
            </button>
            <button
              className={`vl-period-btn ${state.summaryPeriod === 'week' ? 'active' : ''}`}
              onClick={() => handlePeriodChange('week')}
            >
              This Week
            </button>
            <button
              className={`vl-period-btn ${state.summaryPeriod === 'month' ? 'active' : ''}`}
              onClick={() => handlePeriodChange('month')}
            >
              This Month
            </button>
          </div>
        ) : (
          <div className="vl-custom-date-display">
            <button
              className="vl-back-btn"
              onClick={handleBackToPeriods}
              aria-label="Back to period selector"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <span className="vl-custom-date-text">
              {formatCustomDateRange(state.customDateRange)}
            </span>
          </div>
        )}

        {/* Calendar icon - always visible */}
        <button
          className={`vl-calendar-trigger ${showDatePicker ? 'active' : ''}`}
          onClick={() => setShowDatePicker(!showDatePicker)}
          aria-label="Select custom date"
          aria-expanded={showDatePicker}
          aria-haspopup="dialog"
        >
          <Calendar size={16} />
          {state.summaryPeriod === 'custom' && <span className="vl-active-indicator" />}
        </button>
      </div>

      {/* Date Picker Dropdown */}
      {showDatePicker && (
        <div className="vl-date-picker-dropdown" ref={dropdownRef} role="dialog" aria-label="Date picker">
          <div className="vl-date-mode-toggle">
            <button
              className={`vl-mode-btn ${dateMode === 'single' ? 'active' : ''}`}
              onClick={() => setDateMode('single')}
            >
              Single Day
            </button>
            <button
              className={`vl-mode-btn ${dateMode === 'range' ? 'active' : ''}`}
              onClick={() => setDateMode('range')}
            >
              Date Range
            </button>
          </div>

          <DateRangePicker
            startDate={state.customDateRange?.startDate || null}
            endDate={state.customDateRange?.endDate || null}
            onChange={handleDateRangeChange}
            isSingleDate={dateMode === 'single'}
          />
        </div>
      )}

      {/* Show Analyze Button if no data */}
      {showAnalyzeButton && (
        <div className="vl-analyze-empty-state">
          <div className="vl-analyze-icon">
            <Calendar size={48} />
          </div>
          <h3 className="vl-analyze-title">
            {state.summaryPeriod === 'standup'
              ? 'Ready for your standup?'
              : state.summaryPeriod === 'custom'
                ? state.customDateRange
                  ? `Analyze ${formatCustomDateRange(state.customDateRange)}`
                  : 'Select a date to analyze'
                : `Analyze ${getPeriodLabel(state.summaryPeriod)}`
            }
          </h3>
          <p className="vl-analyze-description">
            {state.summaryPeriod === 'standup'
              ? "Yesterday's work and today's focus, ready to share."
              : 'Get insights on your coding sessions, time spent, and productivity patterns.'
            }
          </p>
          <button
            className="vl-analyze-button"
            onClick={handleAnalyze}
            disabled={state.summaryPeriod === 'custom' && !state.customDateRange}
          >
            <ArrowRight size={16} />
            Analyze Sessions
          </button>
        </div>
      )}

      {/* Standup View */}
      {state.summaryPeriod === 'standup' && state.standupSummary && (
        <StandupPrepView summary={state.standupSummary} />
      )}

      {/* Today View */}
      {state.summaryPeriod === 'today' && state.todaySummary && (
        <TodaySummaryView
          todaySummary={state.todaySummary}
          yesterdaySummary={state.yesterdaySummary}
          weekendRecap={state.weekendRecap}
          isMonday={isMonday}
          hasNoSessionsToday={hasNoSessionsToday}
        />
      )}

      {/* Week View */}
      {state.summaryPeriod === 'week' && state.weeklySummary && (
        <WeeklySummaryView summary={state.weeklySummary} />
      )}

      {/* Month View */}
      {state.summaryPeriod === 'month' && state.monthlySummary && (
        <MonthlySummaryView summary={state.monthlySummary} />
      )}

      {/* Custom Date Range View */}
      {state.summaryPeriod === 'custom' && state.customSummary && (
        <CustomSummaryView
          summary={state.customSummary}
          dateRange={state.customDateRange}
        />
      )}

      {/* Copy Button */}
      {hasData && (
        <button className="vl-copy-btn" onClick={handleCopyAsText}>
          <Copy size={14} />
          Copy as text
        </button>
      )}

      {/* Daily Standup CTA - shown for standup view */}
      {state.summaryPeriod === 'standup' && state.standupSummary && (
        <DailyStandupCTA />
      )}
    </div>
  );
}

// Today Summary Component
function TodaySummaryView({
  todaySummary,
  yesterdaySummary,
  weekendRecap,
  isMonday,
  hasNoSessionsToday,
}: {
  todaySummary: DailySummary | null;
  yesterdaySummary: DailySummary | null;
  weekendRecap: DailySummary[] | null;
  isMonday: boolean;
  hasNoSessionsToday: boolean;
}) {
  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Monday: Show Friday + Weekend recap
  if (isMonday && weekendRecap && weekendRecap.length > 0) {
    return (
      <>
        <div className="vl-summary-date">{dateString}</div>

        <div className="vl-section-title">Friday + Weekend Recap</div>

        <div className="vl-work-summary">
          {weekendRecap.map((day, index) => (
            <div key={index} style={{ marginBottom: 'var(--space-lg)' }}>
              <div style={{ fontWeight: 500, marginBottom: 'var(--space-sm)' }}>
                {new Date(day.date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
              {day.sessions > 0 ? (
                <div style={{ fontSize: '12px', opacity: 0.8 }}>
                  Messages: {day.totalMessages} | Time: {formatDuration(day.timeCoding)}
                  <ul className="vl-work-list" style={{ marginTop: 'var(--space-sm)' }}>
                    {day.workedOn.slice(0, 2).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div style={{ fontSize: '12px', opacity: 0.6 }}>No sessions</div>
              )}
            </div>
          ))}
        </div>

        <SuggestedFocus title="Suggested Focus for This Week" items={getWeekSuggestions(weekendRecap)} />

        <button className="vl-action-btn primary" style={{ marginTop: 'var(--space-lg)' }}>
          Start the week <ArrowRight size={14} />
        </button>

        <DailyStandupCTA />
      </>
    );
  }

  // No sessions today: Show yesterday
  if (hasNoSessionsToday && yesterdaySummary) {
    return (
      <>
        <div className="vl-summary-date">{dateString}</div>

        <div className="vl-empty-state" style={{ marginBottom: 'var(--space-xl)' }}>
          <p>No sessions found for today.</p>
          <p>Showing yesterday&apos;s summary.</p>
        </div>

        <div className="vl-section-title">
          Yesterday ({new Date(yesterdaySummary.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
        </div>

        <QuickStats summary={yesterdaySummary} />

        <WorkedOnSection items={yesterdaySummary.workedOn} />

        <SuggestedFocus title="Suggested Focus for Today" items={yesterdaySummary.suggestedFocus} />

        <button className="vl-action-btn primary" style={{ marginTop: 'var(--space-lg)' }}>
          Start coding <ArrowRight size={14} />
        </button>

        <DailyStandupCTA />
      </>
    );
  }

  // Normal today view
  if (todaySummary) {
    return (
      <>
        <div className="vl-summary-date">{dateString}</div>

        {/* Error Banner (shows rate limit, auth errors, etc.) */}
        {todaySummary.source === 'fallback' && <ErrorBanner error={todaySummary.error} />}

        {/* Session Sources (Cursor vs Claude Code) */}
        <SessionSourcesDisplay sources={todaySummary.sessionsBySource} />

        <QuickStats summary={todaySummary} />

        <WorkedOnSection items={todaySummary.workedOn} />

        {/* Business Outcomes */}
        <BusinessOutcomesSection outcomes={todaySummary.businessOutcomes} />

        <SuggestedFocus title="Suggested Focus for Tomorrow" items={todaySummary.suggestedFocus} />

        {/* AI Provider Info */}
        {todaySummary.providerInfo && (
          <div style={{ fontSize: '10px', opacity: 0.5, marginTop: 'var(--space-md)' }}>
            Analysis by {todaySummary.providerInfo.provider} ({todaySummary.providerInfo.model})
          </div>
        )}

        <DailyStandupCTA />
      </>
    );
  }

  // No data at all
  return (
    <>
      <div className="vl-summary-date">{dateString}</div>
      <div className="vl-empty-state">
        <p>No sessions yet.</p>
        <p>Start coding to see your summary here.</p>
      </div>
    </>
  );
}

// Quick Stats Grid
function QuickStats({ summary }: { summary: DailySummary }) {
  return (
    <div className="vl-quick-stats">
      <div className="vl-stat-item">
        <span className="vl-stat-label">Time coding</span>
        <span className="vl-stat-value">{formatDuration(summary.timeCoding)}</span>
      </div>
      <div className="vl-stat-item">
        <span className="vl-stat-label">Sessions</span>
        <span className="vl-stat-value">{summary.sessions}</span>
      </div>
    </div>
  );
}

// Session Sources Display (shows Cursor vs Claude Code breakdown)
function SessionSourcesDisplay({ sources }: { sources?: SessionsBySource }) {
  if (!sources || sources.total === 0) return null;

  const hasBothSources = sources.cursor > 0 && sources.claudeCode > 0;

  return (
    <div className="vl-session-sources" style={{
      display: 'flex',
      gap: 'var(--space-md)',
      marginBottom: 'var(--space-lg)',
      fontSize: '11px',
      opacity: 0.8
    }}>
      <span style={{ fontWeight: 500 }}>Sources:</span>
      {sources.cursor > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Monitor size={12} /> Cursor: {sources.cursor}
        </span>
      )}
      {hasBothSources && <span style={{ opacity: 0.5 }}>|</span>}
      {sources.claudeCode > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Terminal size={12} /> Claude Code: {sources.claudeCode}
        </span>
      )}
    </div>
  );
}

// Error Banner Display (shows rate limit and other errors)
function ErrorBanner({ error }: { error?: SummaryError }) {
  if (!error) return null;

  const getErrorColor = (type: string) => {
    switch (type) {
      case 'rate_limit':
        return 'var(--score-medium)';
      case 'auth_failed':
        return 'var(--score-low)';
      case 'network':
        return 'var(--score-low)';
      default:
        return 'var(--score-medium)';
    }
  };

  return (
    <div className="vl-error-banner" style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--space-md)',
      padding: 'var(--space-md) var(--space-lg)',
      marginBottom: 'var(--space-lg)',
      background: `${getErrorColor(error.type)}15`,
      border: `1px solid ${getErrorColor(error.type)}40`,
      borderRadius: 'var(--radius-md)',
      fontSize: '12px'
    }}>
      <AlertTriangle size={16} style={{ color: getErrorColor(error.type), flexShrink: 0, marginTop: '2px' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, color: getErrorColor(error.type), marginBottom: 'var(--space-xs)' }}>
          {error.message}
        </div>
        <div style={{ opacity: 0.85 }}>
          {error.suggestion}
        </div>
      </div>
    </div>
  );
}

// Business Outcomes Section
function BusinessOutcomesSection({ outcomes }: { outcomes?: BusinessOutcome[] }) {
  if (!outcomes || outcomes.length === 0) return null;

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'feature': return 'var(--accent-primary)';
      case 'bugfix': return 'var(--accent-warning)';
      case 'refactor': return 'var(--accent-secondary)';
      case 'docs': return 'var(--foreground-muted)';
      case 'test': return 'var(--accent-success)';
      case 'research': return 'var(--accent-info)';
      default: return 'var(--foreground-muted)';
    }
  };

  const getOutcomeStyle = (outcome: string) => {
    const lowerOutcome = outcome.toLowerCase();
    if (lowerOutcome.includes('completed') || lowerOutcome.includes('complete')) {
      return { icon: '✓', color: 'var(--accent-success)', label: outcome };
    }
    if (lowerOutcome.includes('progress')) {
      return { icon: '→', color: 'var(--accent-primary)', label: outcome };
    }
    if (lowerOutcome.includes('blocked')) {
      return { icon: '⚠', color: 'var(--accent-warning)', label: outcome };
    }
    if (lowerOutcome.includes('unknown')) {
      return { icon: '?', color: 'var(--foreground-muted)', label: 'Status unknown' };
    }
    return { icon: '•', color: 'var(--foreground-muted)', label: outcome };
  };

  return (
    <>
      <div className="vl-section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Target size={14} /> Business Outcomes
      </div>
      <div className="vl-business-outcomes" style={{ marginBottom: 'var(--space-lg)' }}>
        {outcomes.map((outcome, i) => {
          const outcomeStyle = getOutcomeStyle(outcome.outcome);
          return (
            <div key={i} style={{
              padding: 'var(--space-sm) var(--space-md)',
              marginBottom: 'var(--space-sm)',
              borderLeft: `3px solid ${getCategoryColor(outcome.category)}`,
              backgroundColor: 'var(--background-secondary)',
              borderRadius: '0 4px 4px 0'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-xs)'
              }}>
                <span style={{ fontWeight: 500, fontSize: '12px' }}>{outcome.project}</span>
                <span style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  backgroundColor: getCategoryColor(outcome.category),
                  color: 'var(--background-primary)',
                  textTransform: 'uppercase'
                }}>
                  {outcome.category}
                </span>
              </div>
              <div style={{ fontSize: '11px', opacity: 0.9 }}>{outcome.objective}</div>
              <div style={{
                fontSize: '10px',
                marginTop: 'var(--space-xs)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                color: outcomeStyle.color
              }}>
                <span>{outcomeStyle.icon}</span>
                <span>{outcomeStyle.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// Worked On Section
function WorkedOnSection({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;

  return (
    <>
      <div className="vl-section-title">What You Worked On</div>
      <div className="vl-work-summary">
        <ul className="vl-work-list">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

// Suggested Focus Section
function SuggestedFocus({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="vl-suggested-focus">
      <div className="vl-section-title">{title}</div>
      <ul className="vl-work-list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

// Executive Summary Section
function ExecutiveSummarySection({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return null;

  return (
    <>
      <div className="vl-section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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

  // Sort by percentage descending
  const sortedActivities = Object.entries(distribution)
    .sort(([, a], [, b]) => b - a);

  const getActivityColor = (activity: string): string => {
    // Muted activity colors using CSS variables
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
      <div className="vl-section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <BarChart3 size={14} /> Activity Distribution
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
      <div className="vl-section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
              flex: item.value,
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
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#fff' }}>
                  {item.value}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-md)',
          fontSize: '11px'
        }}>
          {breakdownItems.map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '2px',
                background: item.color
              }} />
              <span style={{ opacity: 0.8 }}>{item.label}: {item.value}%</span>
            </div>
          ))}
        </div>

        {/* Insights */}
        {quality.insights && (
          <div style={{
            marginTop: 'var(--space-md)',
            padding: 'var(--space-sm) var(--space-md)',
            background: 'var(--vscode-textBlockQuote-background)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            fontStyle: 'italic',
            opacity: 0.9
          }}>
            {quality.insights}
          </div>
        )}
      </div>
    </>
  );
}

// Enhanced Project Breakdown Section
function EnhancedProjectBreakdownSection({ projects }: { projects?: ProjectBreakdownItem[] }) {
  if (!projects || projects.length === 0) return null;

  return (
    <>
      <div className="vl-section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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

// Weekly Summary View
function WeeklySummaryView({ summary }: { summary: WeeklySummary }) {
  const dateRange = `${formatShortDate(summary.startDate)} - ${formatShortDate(summary.endDate)}`;

  return (
    <>
      <div className="vl-summary-date">This Week ({dateRange})</div>

      {/* Error Banner (shows rate limit, auth errors, etc.) */}
      {summary.source === 'fallback' && <ErrorBanner error={summary.error} />}

      {/* Session Sources (Cursor vs Claude Code) */}
      <SessionSourcesDisplay sources={summary.sessionsBySource} />

      {/* Executive Summary - show first for weekly reports */}
      <ExecutiveSummarySection items={summary.executiveSummary} />

      <div className="vl-section-title">Quick Stats</div>
      <div className="vl-quick-stats">
        <div className="vl-stat-item">
          <span className="vl-stat-label">Total time coding</span>
          <span className="vl-stat-value">{formatDuration(summary.totalTime)}</span>
        </div>
        <div className="vl-stat-item">
          <span className="vl-stat-label">Sessions</span>
          <span className="vl-stat-value">{summary.sessions}</span>
        </div>
      </div>

      {/* Activity Distribution */}
      <ActivityDistributionSection distribution={summary.activityDistribution} />

      {/* Prompt Quality */}
      <PromptQualitySection quality={summary.promptQuality} />

      {/* Enhanced Project Breakdown (if AI provided it) */}
      <EnhancedProjectBreakdownSection projects={summary.projectBreakdown} />

      <div className="vl-section-title">Daily Breakdown</div>
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

      {/* Fallback Top Projects (if no enhanced breakdown from AI) */}
      {!summary.projectBreakdown && summary.topProjects.length > 0 && (
        <>
          <div className="vl-section-title">Top Projects</div>
          <div className="vl-work-summary">
            {summary.topProjects.map((project, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: 'var(--space-sm) 0',
                  fontSize: '12px',
                }}
              >
                <span>{project.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.7 }}>
                  {formatDuration(project.time)} | {project.prompts} prompts
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <CloudUpsellBanner period="weeks" />
    </>
  );
}

// Monthly Summary View
function MonthlySummaryView({ summary }: { summary: MonthlySummary }) {
  return (
    <>
      <div className="vl-summary-date">
        {summary.month} {summary.year}
      </div>

      {/* Error Banner (shows rate limit, auth errors, etc.) */}
      {summary.source === 'fallback' && <ErrorBanner error={summary.error} />}

      {/* Session Sources (Cursor vs Claude Code) */}
      <SessionSourcesDisplay sources={summary.sessionsBySource} />

      {/* Executive Summary - show first for monthly reports */}
      <ExecutiveSummarySection items={summary.executiveSummary} />

      <div className="vl-section-title">Quick Stats</div>
      <div className="vl-quick-stats">
        <div className="vl-stat-item">
          <span className="vl-stat-label">Total time coding</span>
          <span className="vl-stat-value">{formatDuration(summary.totalTime)}</span>
        </div>
        <div className="vl-stat-item">
          <span className="vl-stat-label">Sessions</span>
          <span className="vl-stat-value">{summary.sessions}</span>
        </div>
        <div className="vl-stat-item">
          <span className="vl-stat-label">Active days</span>
          <span className="vl-stat-value">
            {summary.activeDays} / {summary.totalDays}
          </span>
        </div>
      </div>

      {/* Activity Distribution */}
      <ActivityDistributionSection distribution={summary.activityDistribution} />

      {/* Prompt Quality */}
      <PromptQualitySection quality={summary.promptQuality} />

      {/* Enhanced Project Breakdown (if AI provided it) */}
      <EnhancedProjectBreakdownSection projects={summary.projectBreakdown} />

      <div className="vl-section-title">Weekly Breakdown</div>
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

      <CloudUpsellBanner period="months" />
    </>
  );
}

// Cloud Upsell Banner
function CloudUpsellBanner({ period }: { period: string }) {
  const { dispatch } = useAppV2();

  return (
    <div className="vl-cloud-banner" style={{ marginTop: 'var(--space-xl)' }}>
      <div>
        <div style={{ fontWeight: 500, marginBottom: 'var(--space-xs)' }}>Want deeper insights?</div>
        <div style={{ fontSize: '11px', opacity: 0.8 }}>
          Drill-down by project, compare {period}, and get AI-powered recommendations.
        </div>
      </div>
      <button
        className="vl-cloud-cta"
        onClick={() => dispatch({ type: 'SET_TAB', payload: 'account' })}
      >
        Get detailed reports on DevArk Cloud <ArrowRight size={12} />
      </button>
    </div>
  );
}

// Daily Standup CTA Banner
function DailyStandupCTA() {
  const { dispatch } = useAppV2();

  return (
    <div
      className="vl-cloud-banner"
      style={{
        marginTop: 'var(--space-xl)',
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
        borderColor: 'rgba(139, 92, 246, 0.25)'
      }}
    >
      <div>
        <div style={{ fontWeight: 500, marginBottom: 'var(--space-xs)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={14} style={{ color: 'var(--vl-accent)' }} />
          Always be prepared for your daily standup meetings
        </div>
        <div style={{ fontSize: '11px', opacity: 0.85 }}>
          Get your daily recap delivered to your inbox each morning. Ready to share what you shipped.
        </div>
      </div>
      <button
        className="vl-cloud-cta"
        onClick={() => dispatch({ type: 'SET_TAB', payload: 'account' })}
        style={{ whiteSpace: 'nowrap' }}
      >
        Set up daily emails <ArrowRight size={12} />
      </button>
    </div>
  );
}

// Helper functions
function formatShortDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getPeriodLabel(period: SummaryPeriod): string {
  switch (period) {
    case 'standup':
      return 'Standup Prep';
    case 'today':
      return 'Today';
    case 'week':
      return 'This Week';
    case 'month':
      return 'This Month';
    case 'custom':
      return 'Custom Period';
    default:
      return period;
  }
}

function getWeekSuggestions(weekendRecap: DailySummary[]): string[] {
  const allItems = weekendRecap.flatMap((day) => day.suggestedFocus || []);
  return [...new Set(allItems)].slice(0, 3);
}

function formatDailySummaryAsText(summary: DailySummary): string {
  return `
Daily Summary - ${new Date(summary.date).toLocaleDateString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total messages: ${summary.totalMessages}
Time coding: ${formatDuration(summary.timeCoding)}
Sessions: ${summary.sessions}

What I worked on:
${summary.workedOn.map((item) => `- ${item}`).join('\n')}

Focus for tomorrow:
${summary.suggestedFocus.map((item) => `- ${item}`).join('\n')}
  `.trim();
}

function formatWeeklySummaryAsText(summary: WeeklySummary): string {
  return `
Weekly Summary - ${formatShortDate(summary.startDate)} to ${formatShortDate(summary.endDate)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total time coding: ${formatDuration(summary.totalTime)}
Total messages: ${summary.totalMessages}
Sessions: ${summary.sessions}

Daily Breakdown:
${summary.dailyBreakdown.map((day) => `${day.day}: ${formatDuration(day.time)} | ${day.prompts} prompts`).join('\n')}

Top Projects:
${summary.topProjects.map((p) => `- ${p.name}: ${formatDuration(p.time)} | ${p.prompts} prompts`).join('\n')}
  `.trim();
}

function formatMonthlySummaryAsText(summary: MonthlySummary): string {
  return `
Monthly Summary - ${summary.month} ${summary.year}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total time coding: ${formatDuration(summary.totalTime)}
Total messages: ${summary.totalMessages}
Sessions: ${summary.sessions}
Active days: ${summary.activeDays}/${summary.totalDays}

Weekly Breakdown:
${summary.weeklyBreakdown.map((w) => `Week ${w.week}: ${formatDuration(w.time)} | ${w.prompts} prompts`).join('\n')}
  `.trim();
}

// Shared utilities for standup summary
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

function buildStatsLine(summary: StandupSummary): string[] {
  const counts = countOutcomes(summary.previousWorkday.businessOutcomes);
  const stats = [
    formatDuration(summary.totalTimeCoding),
    `${summary.totalSessions} session${summary.totalSessions !== 1 ? 's' : ''}`
  ];
  if (counts.feature) stats.push(`${counts.feature} feature${counts.feature > 1 ? 's' : ''}`);
  if (counts.bugfix) stats.push(`${counts.bugfix} bug fix${counts.bugfix > 1 ? 'es' : ''}`);
  if (counts.refactor) stats.push(`${counts.refactor} refactor${counts.refactor > 1 ? 's' : ''}`);
  return stats;
}

function formatStandupSummaryAsText(summary: StandupSummary): string {
  const statsLine = buildStatsLine(summary);
  const outcomesByProject = groupOutcomesByProject(summary.previousWorkday.businessOutcomes);
  let text = `Yesterday (${statsLine.join(', ')}):\n`;

  if (Object.keys(outcomesByProject).length > 0) {
    Object.entries(outcomesByProject).forEach(([project, outcomes]) => {
      text += `- ${project}: ${outcomes.map(o => o.objective).join(', ')}\n`;
    });
  } else if (summary.previousWorkday.workedOn?.length > 0) {
    summary.previousWorkday.workedOn.forEach(item => { text += `- ${item}\n`; });
  }

  if (summary.weekendActivity?.hasSaturday || summary.weekendActivity?.hasSunday) {
    text += `\nWeekend: ${formatDuration(summary.weekendActivity.totalMinutes)} on ${summary.weekendActivity.projectsWorkedOn.join(', ')}\n`;
  }

  if (summary.suggestedFocusForToday?.length > 0) {
    text += `\nFocus:\n`;
    summary.suggestedFocusForToday.forEach(item => { text += `- ${item}\n`; });
  }

  return text.trim();
}

// Custom Date Range Summary View
function CustomSummaryView({
  summary,
  dateRange,
}: {
  summary: DailySummary;
  dateRange: { startDate: Date; endDate: Date } | null;
}) {
  const formatDateRange = () => {
    if (!dateRange) return '';
    const start = formatShortDate(dateRange.startDate);
    const end = formatShortDate(dateRange.endDate);
    return start === end ? start : `${start} - ${end}`;
  };

  return (
    <>
      <div className="vl-summary-date">Custom Period ({formatDateRange()})</div>

      {/* Error Banner (shows rate limit, auth errors, etc.) */}
      {summary.source === 'fallback' && <ErrorBanner error={summary.error} />}

      {/* Session Sources (Cursor vs Claude Code) */}
      <SessionSourcesDisplay sources={summary.sessionsBySource} />

      <QuickStats summary={summary} />

      <WorkedOnSection items={summary.workedOn} />

      {/* Business Outcomes */}
      <BusinessOutcomesSection outcomes={summary.businessOutcomes} />

      <SuggestedFocus title="Suggested Focus" items={summary.suggestedFocus} />

      {/* AI Provider Info */}
      {summary.providerInfo && (
        <div style={{ fontSize: '10px', opacity: 0.5, marginTop: 'var(--space-md)' }}>
          Analysis by {summary.providerInfo.provider} ({summary.providerInfo.model})
        </div>
      )}
    </>
  );
}

// Standup Prep View Component - uses shared utilities
function StandupPrepView({ summary }: { summary: StandupSummary }) {
  const dayName = new Date(summary.previousWorkdayDate).toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = new Date(summary.previousWorkdayDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const statsLine = buildStatsLine(summary);
  const outcomesByProject = groupOutcomesByProject(summary.previousWorkday.businessOutcomes);

  return (
    <>
      {/* Header with date */}
      <div className="vl-summary-date">Standup Prep - {dayName}, {dateStr}</div>

      {/* Overall stats right under the title */}
      <div className="vl-standup-overall-stats">
        {statsLine.map((stat, i) => (
          <span key={i} className="vl-standup-stat-item">{stat}</span>
        ))}
      </div>

      {/* Yesterday Section - title outside box */}
      <div className="vl-standup-label">Yesterday</div>
      <div className="vl-standup-section">
        {Object.keys(outcomesByProject).length > 0 ? (
          Object.entries(outcomesByProject).map(([project, outcomes]) => (
            <div key={project} className="vl-standup-project">
              <div className="vl-standup-project-name">{project}</div>
              {outcomes.map((o, i) => (
                <div key={i} className="vl-standup-item">{o.objective}</div>
              ))}
            </div>
          ))
        ) : (
          summary.previousWorkday.workedOn?.map((item, i) => (
            <div key={i} className="vl-standup-item">{item}</div>
          ))
        )}
      </div>

      {/* Weekend Activity */}
      {(summary.weekendActivity?.hasSaturday || summary.weekendActivity?.hasSunday) && (
        <div className="vl-standup-weekend">
          Weekend: {formatDuration(summary.weekendActivity!.totalMinutes)} on {summary.weekendActivity!.projectsWorkedOn.join(', ')}
        </div>
      )}

      {/* Suggested Focus - title outside box */}
      {summary.suggestedFocusForToday?.length > 0 && (
        <>
          <div className="vl-standup-label">Today's Focus</div>
          <div className="vl-standup-section">
            {summary.suggestedFocusForToday.map((item, i) => (
              <div key={i} className="vl-standup-item">{item}</div>
            ))}
          </div>
        </>
      )}

      {summary.providerInfo && (
        <div className="vl-provider-info">
          Analysis by {summary.providerInfo.provider} ({summary.providerInfo.model})
        </div>
      )}
    </>
  );
}
