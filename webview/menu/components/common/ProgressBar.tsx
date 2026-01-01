/**
 * Progress Bar Component
 *
 * Visual progress indicator with percentage display
 */

import { cn } from '../../utils/cn';

interface ProgressBarProps {
  progress: number; // 0-100
  message?: string;
  showPercentage?: boolean;
  className?: string;
  variant?: 'primary' | 'success' | 'warning' | 'error';
}

const variantColors = {
  primary: 'bg-primary',
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
};

export function ProgressBar({
  progress,
  message,
  showPercentage = true,
  className,
  variant = 'primary',
}: ProgressBarProps) {
  const clampedProgress = Math.min(Math.max(progress, 0), 100);

  return (
    <div className={cn('space-y-2', className)} role="progressbar" aria-valuenow={clampedProgress} aria-valuemin={0} aria-valuemax={100}>
      {(message || showPercentage) && (
        <div className="flex items-center justify-between text-sm">
          {message && <span className="text-gray-400">{message}</span>}
          {showPercentage && (
            <span className="text-vscode-foreground font-medium">
              {Math.round(clampedProgress)}%
            </span>
          )}
        </div>
      )}
      <div className="progress-bar">
        <div
          className={cn('progress-bar-fill', variantColors[variant])}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
}
