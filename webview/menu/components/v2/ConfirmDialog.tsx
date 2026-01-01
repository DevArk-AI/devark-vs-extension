/**
 * ConfirmDialog Component
 *
 * Modal dialog for confirming destructive actions like delete.
 */

import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="vl-dialog-overlay" onClick={onCancel}>
      <div className="vl-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="vl-dialog-header">
          {danger && (
            <span className="vl-dialog-icon danger">
              <AlertTriangle size={20} />
            </span>
          )}
          <h3 className="vl-dialog-title">{title}</h3>
          <button className="vl-dialog-close" onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="vl-dialog-content">
          <p className="vl-dialog-message">{message}</p>
        </div>
        <div className="vl-dialog-actions">
          <button className="vl-dialog-btn secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`vl-dialog-btn ${danger ? 'danger' : 'primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
