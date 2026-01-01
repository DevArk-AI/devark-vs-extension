/**
 * Card Component
 *
 * Container component for sections with optional header
 */

import { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface CardProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function Card({
  title,
  subtitle,
  action,
  children,
  className,
  noPadding = false,
}: CardProps) {
  return (
    <div className={cn('card', className)}>
      {(title || subtitle || action) && (
        <div className="flex items-start justify-between mb-4 pb-3 border-b border-vscode-border">
          <div>
            {title && (
              <h3 className="text-vscode-lg font-semibold text-vscode-foreground">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
            )}
          </div>
          {action && <div className="ml-4">{action}</div>}
        </div>
      )}
      <div className={cn(!noPadding && 'space-y-4')}>{children}</div>
    </div>
  );
}

interface CardSectionProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function CardSection({ title, children, className }: CardSectionProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {title && (
        <h4 className="text-sm font-medium text-vscode-foreground">{title}</h4>
      )}
      {children}
    </div>
  );
}
