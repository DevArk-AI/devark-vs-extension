/**
 * SyncStatusBar - Minimized sync progress bar at bottom of extension
 *
 * Shows:
 * - Mini progress indicator
 * - Phase text with current/total
 * - Expand button to restore modal
 * - Cancel button
 */

import { Maximize2, X, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { SyncProgressData } from '@shared/webview-protocol';

interface SyncStatusBarProps {
  progress: SyncProgressData;
  onExpand: () => void;
  onCancel: () => void;
  onClose: () => void;
}

export function SyncStatusBar({ progress, onExpand, onCancel, onClose }: SyncStatusBarProps) {
  const percentage = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const isComplete = progress.phase === 'complete';
  const isError = progress.phase === 'error';
  const isCancelled = progress.phase === 'cancelled';
  const isFinished = isComplete || isError || isCancelled;

  const getStatusText = () => {
    switch (progress.phase) {
      case 'preparing':
        return 'Preparing...';
      case 'sanitizing':
        return `Sanitizing ${progress.current}/${progress.total}`;
      case 'uploading':
        return `Uploading ${progress.current}/${progress.total}`;
      case 'complete':
        return `Synced ${progress.current} sessions`;
      case 'cancelled':
        return `Cancelled (${progress.current} synced)`;
      case 'error':
        return 'Sync failed';
      default:
        return 'Syncing...';
    }
  };

  const getStatusIcon = () => {
    if (isComplete) {
      return <CheckCircle2 size={14} className="vl-status-bar-icon success" />;
    }
    if (isError || isCancelled) {
      return <XCircle size={14} className="vl-status-bar-icon error" />;
    }
    return <Loader2 size={14} className="vl-spin" />;
  };

  return (
    <div className={`vl-sync-status-bar ${isFinished ? 'finished' : ''} ${isError ? 'error' : ''}`}>
      <div className="vl-status-bar-content" onClick={onExpand}>
        {/* Progress ring or status icon */}
        <div className="vl-status-bar-indicator">
          {!isFinished && progress.total > 0 ? (
            <svg className="vl-progress-ring" viewBox="0 0 24 24">
              <circle
                className="vl-progress-ring-bg"
                cx="12"
                cy="12"
                r="10"
                fill="none"
                strokeWidth="2"
              />
              <circle
                className="vl-progress-ring-fill"
                cx="12"
                cy="12"
                r="10"
                fill="none"
                strokeWidth="2"
                strokeDasharray={`${percentage * 0.628} 62.8`}
                transform="rotate(-90 12 12)"
              />
            </svg>
          ) : (
            getStatusIcon()
          )}
        </div>

        {/* Status text */}
        <span className="vl-status-bar-text">{getStatusText()}</span>

        {/* Percentage */}
        {!isFinished && progress.total > 0 && (
          <span className="vl-status-bar-percent">{percentage}%</span>
        )}
      </div>

      {/* Actions */}
      <div className="vl-status-bar-actions">
        {!isFinished && (
          <button
            className="vl-status-bar-btn"
            onClick={onExpand}
            title="Show details"
          >
            <Maximize2 size={14} />
          </button>
        )}
        <button
          className="vl-status-bar-btn"
          onClick={isFinished ? onClose : onCancel}
          title={isFinished ? 'Dismiss' : 'Cancel sync'}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
