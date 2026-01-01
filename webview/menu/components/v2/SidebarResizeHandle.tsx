/**
 * SidebarResizeHandle Component
 *
 * A draggable handle for resizing the sidebar with:
 * - Drag to resize functionality
 * - Double-click to toggle collapse/expand
 * - Visual feedback on hover and drag
 * - Cursor change on hover
 */

import React from 'react';

interface SidebarResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  isDragging: boolean;
  isCollapsed: boolean;
}

export function SidebarResizeHandle({
  onMouseDown,
  onDoubleClick,
  isDragging,
  isCollapsed,
}: SidebarResizeHandleProps) {
  return (
    <div
      className={`vl-sidebar-resize-handle ${isDragging ? 'dragging' : ''} ${isCollapsed ? 'collapsed' : ''}`}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      title="Drag to resize, double-click to toggle"
    >
      <div className="vl-resize-handle-grip">
        <div className="vl-resize-handle-line" />
        <div className="vl-resize-handle-line" />
      </div>
    </div>
  );
}

export default SidebarResizeHandle;
