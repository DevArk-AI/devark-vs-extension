/**
 * LoadingOverlay - Loading State with Heartbeat Animation
 *
 * Shows:
 * - Pulsing DevArk logo (theme-aware)
 * - Progress bar
 * - Loading message
 * - Cancel button
 */

/**
 * Get theme-aware logo URI (VIB-65)
 */
function getThemeLogoUri(theme: 'light' | 'dark' | 'high-contrast'): string | undefined {
  const isLight = theme === 'light';
  return isLight
    ? (window as any).DEVARK_LOGO_URI
    : (window as any).DEVARK_LOGO_WHITE_URI || (window as any).DEVARK_LOGO_URI;
}

interface LoadingOverlayProps {
  progress: number;
  message: string;
  theme?: 'light' | 'dark' | 'high-contrast';
  onCancel?: () => void;
}

export function LoadingOverlay({ progress, message, theme = 'dark', onCancel }: LoadingOverlayProps) {
  const logoUri = getThemeLogoUri(theme);

  return (
    <div className="vl-loading-overlay">
      {/* Heartbeat Logo */}
      <div className="vl-heartbeat-logo">
        {logoUri ? (
          <img
            src={logoUri}
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
