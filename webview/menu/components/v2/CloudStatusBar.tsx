/**
 * CloudStatusBar - Bottom Status Bar Component (V2 Redesign)
 *
 * Displays cloud connection status at the bottom of the Co-Pilot view.
 * Follows VS Code pattern of status info at bottom.
 *
 * Status Variants:
 * - Connected: Cloud icon + "Connected to DevArk" + [Open Dashboard]
 * - Not connected: Dot + "Not connected" + [Connect to DevArk] (link style)
 * - Syncing: Spinner + "Syncing..." + [Open Dashboard]
 * - Error: Warning + "Sync error" + [Retry]
 */

import { Cloud, AlertCircle, Loader2, ExternalLink } from 'lucide-react';

export type CloudStatus = 'connected' | 'disconnected' | 'syncing' | 'error' | 'loading';

interface CloudStatusBarProps {
  status: CloudStatus;
  username?: string;
  onConnect: () => void;
  onOpenDashboard: () => void;
  onRetry?: () => void;
}

export function CloudStatusBar({
  status,
  username,
  onConnect,
  onOpenDashboard,
  onRetry,
}: CloudStatusBarProps) {
  return (
    <div className={`vl-cloud-status-bar status-${status}`}>
      <div className="vl-cloud-status-left">
        {status === 'connected' && (
          <>
            <Cloud size={14} className="vl-cloud-icon connected" />
            <span>Connected to DevArk</span>
            {username && <span className="vl-cloud-username">@{username}</span>}
          </>
        )}
        {status === 'disconnected' && (
          <>
            <div className="vl-status-dot disconnected" />
            <span>Cloud: Not connected</span>
          </>
        )}
        {status === 'loading' && (
          <>
            <Loader2 size={14} className="vl-cloud-icon loading animate-spin" />
            <span>Cloud: Checking...</span>
          </>
        )}
        {status === 'syncing' && (
          <>
            <Loader2 size={14} className="vl-cloud-icon syncing" />
            <span>Syncing...</span>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle size={14} className="vl-cloud-icon error" />
            <span>Sync error</span>
          </>
        )}
      </div>

      <div className="vl-cloud-status-right">
        {status === 'connected' && (
          <button className="vl-cloud-action" onClick={onOpenDashboard}>
            Open Dashboard
            <ExternalLink size={12} />
          </button>
        )}
        {status === 'disconnected' && (
          <button className="vl-cloud-action vl-cloud-link" onClick={onConnect}>
            Connect to DevArk
          </button>
        )}
        {status === 'syncing' && (
          <button className="vl-cloud-action" onClick={onOpenDashboard}>
            Open Dashboard
            <ExternalLink size={12} />
          </button>
        )}
        {status === 'error' && onRetry && (
          <button className="vl-cloud-action" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export default CloudStatusBar;
