import { MenuSidebarView } from '../sidebar/MenuSidebarView';

export type NotificationLevel = 'info' | 'warning' | 'error';

export interface NotificationAction {
  label: string;
  command: string;
}

export interface NotificationOptions {
  action?: NotificationAction;
}

const LOG_PREFIX: Record<NotificationLevel, string> = {
  error: '✗',
  warning: '⚠',
  info: '✓'
};

export class NotificationService {
  private static instance: NotificationService;

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  public info(message: string, options?: NotificationOptions): void {
    this.notify('info', message, options);
  }

  public warn(message: string, options?: NotificationOptions): void {
    this.notify('warning', message, options);
  }

  public error(message: string, options?: NotificationOptions): void {
    this.notify('error', message, options);
  }

  private notify(level: NotificationLevel, message: string, options?: NotificationOptions): void {
    const sidebar = MenuSidebarView.getInstance();
    if (sidebar) {
      sidebar.incrementBadge();
      sidebar.postMessage({
        type: 'notification',
        data: { level, message, action: options?.action }
      });
    }
    console.log(`[NotificationService] ${LOG_PREFIX[level]} ${message}`);
  }
}

export function getNotificationService(): NotificationService {
  return NotificationService.getInstance();
}
