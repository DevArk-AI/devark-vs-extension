/**
 * AccountView - ACCOUNT Tab
 *
 * Shows:
 * - Dashboard connection status
 * - Account details
 * - Sync status (local vs cloud)
 * - Sync progress with visual feedback
 */

import React, { useState } from 'react';
import { ExternalLink, RefreshCw, User, Mail, ArrowRight, Filter, X, Loader2 } from 'lucide-react';
import { useAppV2, formatTimeAgo } from '../../AppV2';
import { send } from '../../utils/vscode';
import type { SyncFilterOptions, SyncPreview } from '../../state/types-v2';
import type { SyncProgressData } from '@shared/webview-protocol';
import { SyncProgressModal } from './SyncProgressModal';
import { SyncStatusBar } from './SyncStatusBar';

export function AccountView() {
  const { state, dispatch } = useAppV2();
  const [showSyncFilter, setShowSyncFilter] = useState(false);
  const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null);
  const [filterOptions, setFilterOptions] = useState<SyncFilterOptions>({
    filterType: 'recent',
    limit: 100,
  });
  const [isSyncStatusLoading, setIsSyncStatusLoading] = useState(true);
  const [syncStatusTimedOut, setSyncStatusTimedOut] = useState(false);
  const [isSyncStatusRefreshing, setIsSyncStatusRefreshing] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Sync progress state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressData | null>(null);
  const [isSyncMinimized, setIsSyncMinimized] = useState(false);

  const requestSyncStatus = React.useCallback(() => {
    setIsSyncStatusLoading(true);
    setSyncStatusTimedOut(false);
    send('getSyncStatus');

    // Never shimmer forever: if the extension is slow/hung, show placeholders but keep actions available.
    const timeout = setTimeout(() => {
      setIsSyncStatusLoading(false);
      setSyncStatusTimedOut(true);
      setIsSyncStatusRefreshing(false);
    }, 5000);

    return () => clearTimeout(timeout);
  }, []);

  // Request sync status immediately on mount (uses cached data for fast response)
  React.useEffect(() => {
    return requestSyncStatus();
  }, [requestSyncStatus]);

  const handleOpenDashboard = () => {
    send('openDashboard');
  };

  const handleLogin = () => {
    setIsLoggingIn(true);
    send('loginWithGithub');
  };

  const handleLogout = () => {
    send('requestLogoutConfirmation');
  };

  const handleSyncNow = () => {
    console.log('[AccountView] 🔵 Sync button clicked!');
    // Open sync filter modal and start loading
    setShowSyncFilter(true);
    setSyncPreview(null);
    setIsPreviewLoading(true);
    // Request preview with default filter
    send('previewSync', filterOptions);
    console.log('[AccountView] ✅ Modal opened and preview requested');
  };

  const handleConfirmSync = () => {
    send('syncWithFilters', filterOptions);
    setShowSyncFilter(false);
    setSyncPreview(null);
    // Start showing sync progress
    setIsSyncing(true);
    setIsSyncMinimized(false);
    setSyncProgress({
      phase: 'preparing',
      message: 'Starting sync...',
      current: 0,
      total: 0,
    });
  };

  const handleCancelSyncFilter = () => {
    setShowSyncFilter(false);
    setSyncPreview(null);
  };

  const handleCancelSync = () => {
    send('cancelSync');
  };

  const handleMinimizeSync = () => {
    setIsSyncMinimized(true);
  };

  const handleExpandSync = () => {
    setIsSyncMinimized(false);
  };

  const handleCloseSyncProgress = () => {
    setIsSyncing(false);
    setSyncProgress(null);
    setIsSyncMinimized(false);
  };

  // Listen for sync preview results, sync status updates, cloudStatus, and sync progress
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'syncPreview') {
        setSyncPreview(message.data);
        setIsPreviewLoading(false);
      } else if (message.type === 'syncStatus') {
        setIsSyncStatusLoading(false);
        setSyncStatusTimedOut(false);
        setIsSyncStatusRefreshing(false);
      } else if (message.type === 'cloudStatus') {
        setIsLoggingIn(false);
      } else if (message.type === 'syncProgress') {
        setSyncProgress(message.data as SyncProgressData);
      } else if (message.type === 'syncComplete') {
        // Update progress to complete state
        const data = message.data as { success: boolean; sessionsUploaded: number; error?: string };
        setSyncProgress({
          phase: data.success ? 'complete' : 'error',
          message: data.success
            ? `Successfully synced ${data.sessionsUploaded} sessions!`
            : `Sync failed: ${data.error || 'Unknown error'}`,
          current: data.sessionsUploaded,
          total: data.sessionsUploaded,
        });
      } else if (message.type === 'syncCancelled') {
        // Keep showing the cancelled state briefly
        setSyncProgress(prev => prev ? {
          ...prev,
          phase: 'cancelled',
          message: `Sync cancelled. ${prev.current} sessions uploaded.`,
        } : null);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="vl-account-view">
      {/* Dashboard Section */}
      <section className="vl-dashboard-section">
        <div className="vl-section-header">
          <h2 className="vl-section-title">VIBE-LOG DASHBOARD</h2>
        </div>

        {state.cloud.isConnected ? (
          // Connected State
          <div className="vl-dashboard-connected">
            <div className="vl-dashboard-status">
              <div className="vl-status-row">
                <div className="vl-status-info">
                  <div className={`vl-status-dot connected`} />
                  <span className="vl-status-text">
                    Connected as <strong>@{state.cloud.username || 'user'}</strong>
                  </span>
                </div>
                <button className="vl-btn vl-btn-secondary" onClick={handleOpenDashboard}>
                  Open Dashboard
                  <ExternalLink size={14} />
                </button>
              </div>

              {state.cloud.lastSynced && (
                <div className="vl-last-sync">
                  Last sync: {formatTimeAgo(new Date(state.cloud.lastSynced))}
                </div>
              )}
            </div>

            <div className="vl-dashboard-actions">
              <button className="vl-btn vl-btn-link" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>
        ) : (
          // Not Connected State - with benefits UI
          <div className="vl-dashboard-disconnected">
            <p className="vl-dashboard-description">
              Get more from your coding data.
            </p>

            {/* Benefits Section */}
            <div className="vl-benefits-section">
              <div className="vl-section-subtitle" style={{ marginBottom: 'var(--space-md)' }}>WHAT YOU GET</div>
              <div className="vl-benefits-box">
                <div className="vl-benefit-item">
                  <div className="vl-benefit-title">Daily standup email</div>
                  <div className="vl-benefit-desc">Yesterday&apos;s work, summarized</div>
                </div>

                <div className="vl-benefit-item">
                  <div className="vl-benefit-title">Weekly summaries</div>
                  <div className="vl-benefit-desc">Track patterns over time</div>
                </div>

                <div className="vl-benefit-item">
                  <div className="vl-benefit-title">Cross-device history</div>
                  <div className="vl-benefit-desc">Access from anywhere</div>
                </div>
              </div>
            </div>

            {/* Sign In Button */}
            <div className="vl-dashboard-login-actions">
              <button
                className="vl-btn vl-btn-primary"
                onClick={handleLogin}
                disabled={isLoggingIn}
                style={{ opacity: isLoggingIn ? 0.7 : 1 }}
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 size={16} className="vl-spin" />
                    Waiting for browser...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                    </svg>
                    Login with GitHub
                  </>
                )}
              </button>
            </div>

            {/* Privacy Note */}
            <div className="vl-privacy-note">
              Your code stays private. Only session metadata is synced.
            </div>
          </div>
        )}
      </section>

      {/* Account Details Section - only shown when connected */}
      {state.cloud.isConnected && (
        <section className="vl-account-details">
          <h3 className="vl-section-subtitle">ACCOUNT DETAILS</h3>

          <div className="vl-detail-row">
            <div className="vl-detail-icon">
              <User size={16} />
            </div>
            <div className="vl-detail-content">
              <div className="vl-detail-label">Username</div>
              <div className="vl-detail-value">@{state.cloud.username || 'user'}</div>
            </div>
          </div>

          <div className="vl-detail-row">
            <div className="vl-detail-icon">
              <Mail size={16} />
            </div>
            <div className="vl-detail-content">
              <div className="vl-detail-label">Email</div>
              <div className="vl-detail-value">
                {/* TODO: Get email from API */}
                <span className="vl-detail-placeholder">Connected via GitHub</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Sync Status Section - only shown when connected */}
      {state.cloud.isConnected && (
        <section className="vl-sync-status">
          <h3 className="vl-section-subtitle">SYNC STATUS</h3>

          {(isSyncStatusLoading && !state.syncStatus) ? (
            <div className="vl-sync-stats">
              <div className="vl-stat-item">
                <div className="vl-stat-label">Local sessions</div>
                <div className="vl-stat-value vl-shimmer" style={{ width: '60px', height: '28px', margin: '0 auto' }}></div>
              </div>

              <div className="vl-stat-item">
                <div className="vl-stat-label">Synced to cloud</div>
                <div className="vl-stat-value vl-shimmer" style={{ width: '60px', height: '28px', margin: '0 auto' }}></div>
              </div>

              <div className="vl-stat-item">
                <div className="vl-stat-label">Pending upload</div>
                <div className="vl-stat-value vl-shimmer" style={{ width: '60px', height: '28px', margin: '0 auto' }}></div>
              </div>
            </div>
          ) : (
            <div className="vl-sync-stats">
              <div className="vl-stat-item">
                <div className="vl-stat-label">Local sessions</div>
                <div className="vl-stat-value">{state.syncStatus?.localSessions ?? (syncStatusTimedOut ? '—' : 0)}</div>
              </div>

              <div className="vl-stat-item">
                <div className="vl-stat-label">Synced to cloud</div>
                <div className="vl-stat-value">{state.syncStatus?.syncedSessions ?? (syncStatusTimedOut ? '—' : 0)}</div>
              </div>

              <div className="vl-stat-item">
                <div className="vl-stat-label">Pending upload</div>
                <div className="vl-stat-value pending">
                  {state.syncStatus?.pendingUploads ?? (syncStatusTimedOut ? '—' : 0)}
                </div>
              </div>
            </div>
          )}

          {syncStatusTimedOut && !state.syncStatus && (
            <div className="vl-last-sync" style={{ marginTop: 8 }}>
              Sync status is taking longer than usual. You can still sync now.
            </div>
          )}

          <div className="vl-sync-actions">
            <button className="vl-btn vl-btn-secondary" onClick={handleSyncNow}>
              <RefreshCw size={14} />
              Sync now
            </button>
            <button
              className="vl-btn vl-btn-link"
              onClick={() => {
                setIsSyncStatusRefreshing(true);
                requestSyncStatus();
              }}
              disabled={isSyncStatusRefreshing}
              style={{ opacity: isSyncStatusRefreshing ? 0.7 : 1 }}
            >
              {isSyncStatusRefreshing ? 'Refreshing…' : 'Refresh status'}
            </button>
          </div>
        </section>
      )}

      {/* Auto-sync Banner (only when authenticated but not set up) */}
      {state.cloud.isConnected && !state.cloud.autoSyncEnabled && (
        <section className="vl-autosync-promo">
          <div className="vl-autosync-promo-content">
            <div className="vl-autosync-promo-title">Enable Auto-sync</div>
            <div className="vl-autosync-promo-description">
              Never lose a session. Track across all your tools automatically.
            </div>
          </div>
          <button
            className="vl-btn vl-btn-accent"
            onClick={() => dispatch({ type: 'SET_VIEW', payload: 'hook-setup' })}
          >
            Set up - 30 sec
            <ArrowRight size={14} />
          </button>
        </section>
      )}

      {/* Sync Filter Modal */}
      {showSyncFilter && (
        <div className="vl-modal-overlay" onClick={handleCancelSyncFilter} style={{ zIndex: 99999 }}>
          <div className="vl-modal" onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--vscode-editor-background)',
            border: '2px solid var(--vscode-panel-border)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
          }}>
            <div className="vl-modal-header">
              <h3>Sync Sessions</h3>
              <button className="vl-modal-close" onClick={handleCancelSyncFilter}>
                <X size={20} />
              </button>
            </div>

            <div className="vl-modal-body">
              <div className="vl-filter-section">
                <label className="vl-filter-label">Sync sessions from:</label>

                <div className="vl-filter-options">
                  <label className="vl-filter-option">
                    <input
                      type="radio"
                      name="filterType"
                      value="recent"
                      checked={filterOptions.filterType === 'recent'}
                      onChange={() => {
                        const newOptions = { ...filterOptions, filterType: 'recent' as const, limit: 100 };
                        setFilterOptions(newOptions);
                        setIsPreviewLoading(true);
                        send('previewSync', newOptions);
                      }}
                    />
                    <span>Most recent sessions</span>
                  </label>

                  {filterOptions.filterType === 'recent' && (
                    <div className="vl-filter-input-group">
                      <label>Limit:</label>
                      <select
                        value={filterOptions.limit || 100}
                        onChange={(e) => {
                          const newOptions = { ...filterOptions, limit: parseInt(e.target.value) };
                          setFilterOptions(newOptions);
                          setIsPreviewLoading(true);
                          send('previewSync', newOptions);
                        }}
                      >
                        <option value="10">10 sessions</option>
                        <option value="50">50 sessions</option>
                        <option value="100">100 sessions</option>
                        <option value="200">200 sessions</option>
                        <option value="500">500 sessions</option>
                      </select>
                    </div>
                  )}

                  <label className="vl-filter-option">
                    <input
                      type="radio"
                      name="filterType"
                      value="date-range"
                      checked={filterOptions.filterType === 'date-range'}
                      onChange={() => {
                        const today = new Date().toISOString().split('T')[0];
                        const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                        const newOptions = { ...filterOptions, filterType: 'date-range' as const, startDate: lastWeek, endDate: today };
                        setFilterOptions(newOptions);
                        setIsPreviewLoading(true);
                        send('previewSync', newOptions);
                      }}
                    />
                    <span>Date range</span>
                  </label>

                  {filterOptions.filterType === 'date-range' && (
                    <div className="vl-filter-input-group">
                      <label>From:</label>
                      <input
                        type="date"
                        value={filterOptions.startDate || ''}
                        onChange={(e) => {
                          const newOptions = { ...filterOptions, startDate: e.target.value };
                          setFilterOptions(newOptions);
                          setIsPreviewLoading(true);
                          send('previewSync', newOptions);
                        }}
                      />
                      <label>To:</label>
                      <input
                        type="date"
                        value={filterOptions.endDate || ''}
                        onChange={(e) => {
                          const newOptions = { ...filterOptions, endDate: e.target.value };
                          setFilterOptions(newOptions);
                          setIsPreviewLoading(true);
                          send('previewSync', newOptions);
                        }}
                      />
                    </div>
                  )}

                  <label className="vl-filter-option">
                    <input
                      type="radio"
                      name="filterType"
                      value="all"
                      checked={filterOptions.filterType === 'all'}
                      onChange={() => {
                        const newOptions = { ...filterOptions, filterType: 'all' as const };
                        setFilterOptions(newOptions);
                        setIsPreviewLoading(true);
                        send('previewSync', newOptions);
                      }}
                    />
                    <span>All sessions (not recommended for 1000+)</span>
                  </label>
                </div>
              </div>

              {isPreviewLoading && (
                <div className="vl-sync-preview">
                  <div className="vl-preview-header">
                    <Filter size={16} />
                    <span>Loading preview...</span>
                  </div>
                  <div className="vl-preview-stats">
                    <div className="vl-preview-stat">
                      <span className="vl-preview-label">Sessions to sync:</span>
                      <span className="vl-preview-value vl-shimmer" style={{ width: '40px', height: '20px', display: 'inline-block' }}></span>
                    </div>
                    <div className="vl-preview-stat">
                      <span className="vl-preview-label">Estimated size:</span>
                      <span className="vl-preview-value vl-shimmer" style={{ width: '60px', height: '20px', display: 'inline-block' }}></span>
                    </div>
                  </div>
                </div>
              )}

              {!isPreviewLoading && syncPreview && (
                <div className="vl-sync-preview">
                  <div className="vl-preview-header">
                    <Filter size={16} />
                    <span>Preview</span>
                  </div>
                  <div className="vl-preview-stats">
                    <div className="vl-preview-stat">
                      <span className="vl-preview-label">Sessions to sync:</span>
                      <span className="vl-preview-value">{syncPreview.totalSessions}</span>
                    </div>
                    {syncPreview.sessionsBySource && (syncPreview.sessionsBySource.cursor > 0 || syncPreview.sessionsBySource.claudeCode > 0) && (
                      <div className="vl-preview-stat vl-preview-stat-breakdown">
                        <span className="vl-preview-label"></span>
                        <span className="vl-preview-value vl-source-breakdown">
                          {syncPreview.sessionsBySource.cursor > 0 && (
                            <span className="vl-source-item">
                              <span className="vl-source-icon">⌘</span>
                              {syncPreview.sessionsBySource.cursor} Cursor
                            </span>
                          )}
                          {syncPreview.sessionsBySource.claudeCode > 0 && (
                            <span className="vl-source-item">
                              <span className="vl-source-icon">◆</span>
                              {syncPreview.sessionsBySource.claudeCode} Claude Code
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    <div className="vl-preview-stat">
                      <span className="vl-preview-label">Estimated size:</span>
                      <span className="vl-preview-value">
                        {syncPreview.estimatedSizeKB > 1024
                          ? `${(syncPreview.estimatedSizeKB / 1024).toFixed(1)} MB`
                          : `${syncPreview.estimatedSizeKB.toFixed(0)} KB`}
                      </span>
                    </div>
                    {syncPreview.dateRange && (
                      <div className="vl-preview-stat">
                        <span className="vl-preview-label">Date range:</span>
                        <span className="vl-preview-value">
                          {new Date(syncPreview.dateRange.oldest).toLocaleDateString()} - {new Date(syncPreview.dateRange.newest).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {syncPreview.filteredOutShort !== undefined && syncPreview.filteredOutShort > 0 && (
                      <div className="vl-preview-stat">
                        <span className="vl-preview-label">Filtered out (too short):</span>
                        <span className="vl-preview-value" style={{ color: 'var(--vscode-descriptionForeground)' }}>
                          {syncPreview.filteredOutShort} session{syncPreview.filteredOutShort === 1 ? '' : 's'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="vl-preview-note">
                    {syncPreview.filteredOutShort !== undefined && syncPreview.filteredOutShort > 0
                      ? `${syncPreview.filteredOutShort} session${syncPreview.filteredOutShort === 1 ? '' : 's'} shorter than 4 minutes ${syncPreview.filteredOutShort === 1 ? 'was' : 'were'} filtered out. `
                      : 'Sessions shorter than 4 minutes are automatically filtered out. '
                    }
                    All sessions will be sanitized before upload (privacy-protected).
                  </div>
                </div>
              )}
            </div>

            <div className="vl-modal-footer">
              <button className="vl-btn vl-btn-secondary" onClick={handleCancelSyncFilter}>
                Cancel
              </button>
              <button
                className="vl-btn vl-btn-primary"
                onClick={handleConfirmSync}
                disabled={isPreviewLoading || !syncPreview || syncPreview.totalSessions === 0}
              >
                {isPreviewLoading ? (
                  'Loading...'
                ) : syncPreview ? (
                  `Sync ${syncPreview.totalSessions} session${syncPreview.totalSessions === 1 ? '' : 's'}`
                ) : (
                  'Sync'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Progress Modal */}
      {isSyncing && syncProgress && !isSyncMinimized && (
        <SyncProgressModal
          progress={syncProgress}
          onMinimize={handleMinimizeSync}
          onCancel={handleCancelSync}
          onClose={handleCloseSyncProgress}
        />
      )}

      {/* Sync Status Bar (minimized progress) */}
      {isSyncing && syncProgress && isSyncMinimized && (
        <SyncStatusBar
          progress={syncProgress}
          onExpand={handleExpandSync}
          onCancel={handleCancelSync}
          onClose={handleCloseSyncProgress}
        />
      )}
    </div>
  );
}
