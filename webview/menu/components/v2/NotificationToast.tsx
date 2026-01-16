import { useState, useEffect, useCallback } from 'react';
import { X, Info, AlertTriangle, AlertCircle, ExternalLink } from 'lucide-react';

export type NotificationLevel = 'info' | 'warning' | 'error';

export interface NotificationAction {
  label: string;
  command: string;
}

export interface Notification {
  id: string;
  level: NotificationLevel;
  message: string;
  action?: NotificationAction;
  timestamp: number;
}

interface NotificationToastProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
  onAction?: (command: string) => void;
}

const TOAST_DURATION = 4000;
const MAX_NOTIFICATIONS = 10;
let notificationCounter = 0;

export function NotificationToast({ notifications, onDismiss, onAction }: NotificationToastProps) {
  useEffect(() => {
    if (notifications.length === 0) return;

    const timers: NodeJS.Timeout[] = [];

    notifications.forEach((notification) => {
      const elapsed = Date.now() - notification.timestamp;
      const remaining = TOAST_DURATION - elapsed;

      if (remaining > 0) {
        const timer = setTimeout(() => {
          onDismiss(notification.id);
        }, remaining);
        timers.push(timer);
      } else {
        onDismiss(notification.id);
      }
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [notifications, onDismiss]);

  if (notifications.length === 0) return null;

  const getIcon = (level: NotificationLevel) => {
    switch (level) {
      case 'error':
        return <AlertCircle size={14} />;
      case 'warning':
        return <AlertTriangle size={14} />;
      default:
        return <Info size={14} />;
    }
  };

  return (
    <div className="vl-notification-container" role="status" aria-live="polite">
      {notifications.slice(0, 3).map((notification) => (
        <div
          key={notification.id}
          className={`vl-notification-toast vl-notification-${notification.level}`}
        >
          <span className="vl-notification-icon">{getIcon(notification.level)}</span>
          <span className="vl-notification-message">{notification.message}</span>
          {notification.action && onAction && (
            <button
              className="vl-notification-action"
              onClick={() => onAction(notification.action!.command)}
            >
              {notification.action.label}
              <ExternalLink size={10} />
            </button>
          )}
          <button
            className="vl-notification-close"
            onClick={() => onDismiss(notification.id)}
            aria-label="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((
    level: NotificationLevel,
    message: string,
    action?: NotificationAction
  ) => {
    const id = `notification-${Date.now()}-${++notificationCounter}`;
    setNotifications((prev) => {
      const updated = [...prev, { id, level, message, action, timestamp: Date.now() }];
      return updated.slice(-MAX_NOTIFICATIONS);
    });
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return {
    notifications,
    addNotification,
    dismissNotification,
  };
}
