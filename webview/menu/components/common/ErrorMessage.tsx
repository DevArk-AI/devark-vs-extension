/**
 * Error Message Component
 *
 * Dismissible error alert with icon
 */

import { AlertCircle, X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface ErrorMessageProps {
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorMessage({
  message,
  onDismiss,
  className,
}: ErrorMessageProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 bg-red-900/20 border border-red-500/50 rounded-vscode animate-fade-in',
        className
      )}
      role="alert"
      aria-live="assertive"
    >
      <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <p className="flex-1 text-sm text-red-200">{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 p-1 hover:bg-white/10 rounded transition-colors"
          aria-label="Dismiss error"
        >
          <X className="h-4 w-4 text-red-300" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
