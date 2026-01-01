/**
 * Success Message Component
 *
 * Dismissible success alert with icon
 */

import { CheckCircle2, X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface SuccessMessageProps {
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export function SuccessMessage({
  message,
  onDismiss,
  className,
}: SuccessMessageProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 bg-green-900/20 border border-green-500/50 rounded-vscode animate-fade-in',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <p className="flex-1 text-sm text-green-200">{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 p-1 hover:bg-white/10 rounded transition-colors"
          aria-label="Dismiss message"
        >
          <X className="h-4 w-4 text-green-300" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
