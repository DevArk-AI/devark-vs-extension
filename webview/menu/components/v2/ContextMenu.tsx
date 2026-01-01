/**
 * ContextMenu Component
 *
 * Generic dropdown context menu for session and prompt management.
 * Supports right-click and three-dot menu triggers.
 */

import { useState, useEffect, useRef, type ReactNode, type MouseEvent } from 'react';
import { MoreVertical } from 'lucide-react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  isOpen: boolean;
  onClose: () => void;
  position?: { x: number; y: number };
  anchorRef?: React.RefObject<HTMLElement>;
}

export function ContextMenu({ items, isOpen, onClose, position, anchorRef }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Calculate position
  let style: React.CSSProperties = {};
  if (position) {
    style = {
      position: 'fixed',
      left: position.x,
      top: position.y,
    };
  } else if (anchorRef?.current) {
    const rect = anchorRef.current.getBoundingClientRect();
    style = {
      position: 'fixed',
      left: rect.right + 4,
      top: rect.top,
    };
  }

  return (
    <div className="vl-context-menu" ref={menuRef} style={style}>
      {items.map((item) => (
        <button
          key={item.id}
          className={`vl-context-menu-item ${item.danger ? 'danger' : ''} ${item.disabled ? 'disabled' : ''}`}
          onClick={() => {
            if (!item.disabled) {
              item.onClick();
              onClose();
            }
          }}
          disabled={item.disabled}
        >
          {item.icon && <span className="vl-context-menu-icon">{item.icon}</span>}
          <span className="vl-context-menu-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

// Hook for managing context menu state
export function useContextMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | undefined>();

  const open = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPosition({ x: e.clientX, y: e.clientY });
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setPosition(undefined);
  };

  return { isOpen, position, open, close };
}

// Three-dot menu button component
interface MenuButtonProps {
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

export function MenuButton({ onClick, className = '' }: MenuButtonProps) {
  return (
    <button
      className={`vl-menu-button ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      aria-label="More options"
    >
      <MoreVertical size={14} />
    </button>
  );
}

export default ContextMenu;
