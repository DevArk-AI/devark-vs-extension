/**
 * RenameDialog Component
 *
 * Modal dialog for renaming sessions or prompts.
 */

import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface RenameDialogProps {
  isOpen: boolean;
  title: string;
  currentName: string;
  placeholder?: string;
  onSave: (newName: string) => void;
  onClose: () => void;
}

export function RenameDialog({
  isOpen,
  title,
  currentName,
  placeholder = 'Enter name',
  onSave,
  onClose,
}: RenameDialogProps) {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset when dialog opens
      setName(currentName);
      // Focus and select input after a brief delay
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, currentName]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== currentName) {
      onSave(trimmed);
    }
    onClose();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="vl-dialog-overlay" onClick={onClose}>
      <div className="vl-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="vl-dialog-header">
          <h3 className="vl-dialog-title">{title}</h3>
          <button className="vl-dialog-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="vl-dialog-content">
          <input
            ref={inputRef}
            type="text"
            className="vl-dialog-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus
          />
        </div>
        <div className="vl-dialog-actions">
          <button className="vl-dialog-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="vl-dialog-btn primary"
            onClick={handleSave}
            disabled={!name.trim() || name.trim() === currentName}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default RenameDialog;
