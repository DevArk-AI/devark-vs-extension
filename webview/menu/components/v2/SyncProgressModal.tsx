/**
 * SyncProgressModal - Shows sync progress with heartbeat animation
 *
 * Displays:
 * - Heartbeat logo animation
 * - Phase message (Preparing, Sanitizing, Uploading, Complete)
 * - Progress bar with percentage
 * - Session count and batch info
 * - Minimize and Cancel buttons
 */

import { X, Minimize2, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { SyncProgressData } from '@shared/webview-protocol';

interface SyncProgressModalProps {
  progress: SyncProgressData;
  onMinimize: () => void;
  onCancel: () => void;
  onClose: () => void;
}

export function SyncProgressModal({ progress, onMinimize, onCancel, onClose }: SyncProgressModalProps) {
  const percentage = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const isComplete = progress.phase === 'complete';
  const isError = progress.phase === 'error';
  const isCancelled = progress.phase === 'cancelled';
  const isFinished = isComplete || isError || isCancelled;

  const getPhaseLabel = () => {
    switch (progress.phase) {
      case 'preparing':
        return 'Preparing';
      case 'sanitizing':
        return 'Sanitizing';
      case 'uploading':
        return 'Uploading';
      case 'complete':
        return 'Complete';
      case 'cancelled':
        return 'Cancelled';
      case 'error':
        return 'Error';
      default:
        return 'Syncing';
    }
  };

  const getStatusIcon = () => {
    if (isComplete) {
      return <CheckCircle2 size={48} className="vl-sync-status-icon success" />;
    }
    if (isError) {
      return <XCircle size={48} className="vl-sync-status-icon error" />;
    }
    if (isCancelled) {
      return <XCircle size={48} className="vl-sync-status-icon cancelled" />;
    }
    return null;
  };

  return (
    <div className="vl-modal-overlay" style={{ zIndex: 99999 }}>
      <div
        className="vl-modal vl-sync-progress-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--vscode-editor-background)',
          border: '2px solid var(--vscode-panel-border)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
          maxWidth: '400px',
        }}
      >
        <div className="vl-modal-header">
          <h3>Syncing Sessions</h3>
          <div className="vl-modal-actions">
            {!isFinished && (
              <button
                className="vl-modal-action-btn"
                onClick={onMinimize}
                title="Minimize to status bar"
              >
                <Minimize2 size={16} />
              </button>
            )}
            {isFinished && (
              <button className="vl-modal-close" onClick={onClose}>
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        <div className="vl-modal-body vl-sync-progress-body">
          {/* Heartbeat Logo or Status Icon */}
          <div className="vl-sync-logo-container">
            {isFinished ? (
              getStatusIcon()
            ) : (
              <div className="vl-heartbeat-logo">
                {(window as any).VIBE_LOG_LOGO_URI ? (
                  <img
                    src={(window as any).VIBE_LOG_LOGO_URI}
                    alt="Syncing"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <div className="vl-logo-fallback">VL</div>
                )}
              </div>
            )}
          </div>

          {/* Phase Label */}
          <div className="vl-sync-phase-label">{getPhaseLabel()}</div>

          {/* Message */}
          <div className="vl-sync-message">{progress.message}</div>

          {/* Progress Bar */}
          {!isFinished && progress.total > 0 && (
            <div className="vl-sync-progress-section">
              <div className="vl-progress-bar-container">
                <div
                  className="vl-progress-bar"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="vl-sync-progress-stats">
                <span className="vl-sync-progress-percent">{percentage}%</span>
                {progress.currentBatch && progress.totalBatches && (
                  <span className="vl-sync-batch-info">
                    Batch {progress.currentBatch}/{progress.totalBatches}
                  </span>
                )}
              </div>
              <div className="vl-sync-session-count">
                {progress.current} of {progress.total} sessions
              </div>
            </div>
          )}

          {/* Spinner for indeterminate phases */}
          {!isFinished && progress.total === 0 && (
            <div className="vl-sync-spinner">
              <Loader2 size={24} className="vl-spin" />
            </div>
          )}

          {/* Completion stats */}
          {isComplete && progress.current > 0 && (
            <div className="vl-sync-complete-stats">
              <span>{progress.current} sessions synced successfully</span>
            </div>
          )}
        </div>

        <div className="vl-modal-footer">
          {!isFinished ? (
            <button className="vl-btn vl-btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          ) : (
            <button className="vl-btn vl-btn-primary" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
