/**
 * LoadingOverlay - Loading State with Heartbeat Animation
 *
 * Shows:
 * - Pulsing Vibe-Log logo
 * - Progress bar
 * - Loading message
 * - Cancel button
 */

interface LoadingOverlayProps {
  progress: number;
  message: string;
  onCancel?: () => void;
}

export function LoadingOverlay({ progress, message, onCancel }: LoadingOverlayProps) {
  return (
    <div className="vl-loading-overlay">
      {/* Heartbeat Logo */}
      <div className="vl-heartbeat-logo">
        {(window as any).VIBE_LOG_LOGO_URI ? (
          <img
            src={(window as any).VIBE_LOG_LOGO_URI}
            alt="Loading"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div
            className="vl-logo-fallback"
            style={{
              width: '100%',
              height: '100%',
              fontSize: '20px',
              borderRadius: '16px',
            }}
          >
            VL
          </div>
        )}
      </div>

      {/* Loading Message */}
      <div className="vl-loading-message">{message || 'Analyzing sessions...'}</div>

      {/* Progress Bar */}
      <div className="vl-progress-bar-container">
        <div className="vl-progress-bar" style={{ width: `${progress}%` }} />
      </div>

      {/* Progress Percentage */}
      <div className="vl-progress-detail">{progress}%</div>

      {/* Cancel Button */}
      {onCancel && (
        <button className="vl-cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
