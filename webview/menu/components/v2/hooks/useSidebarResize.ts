/**
 * useSidebarResize Hook
 *
 * Manages sidebar resize functionality including:
 * - Mouse drag handling for resize
 * - Width constraints (min/max)
 * - localStorage persistence
 * - Collapse/expand state management
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { SIDEBAR_WIDTH, type SidebarState } from '../../../state/types-v2';

const STORAGE_KEY = 'vibe-log-sidebar-width';
const STATE_STORAGE_KEY = 'vibe-log-sidebar-state';

interface UseSidebarResizeOptions {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  onWidthChange?: (width: number) => void;
  onStateChange?: (state: SidebarState) => void;
}

interface UseSidebarResizeReturn {
  width: number;
  state: SidebarState;
  isCollapsed: boolean;
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleDoubleClick: () => void;
  toggleCollapse: () => void;
  expand: () => void;
  collapse: () => void;
  setWidth: (width: number) => void;
}

function getSidebarState(width: number): SidebarState {
  if (width <= SIDEBAR_WIDTH.MIN + 10) return 'collapsed';
  if (width >= SIDEBAR_WIDTH.MAX - 10) return 'expanded';
  return 'default';
}

function loadFromStorage(): { width: number; state: SidebarState } {
  try {
    const savedWidth = localStorage.getItem(STORAGE_KEY);
    const savedState = localStorage.getItem(STATE_STORAGE_KEY) as SidebarState | null;

    const width = savedWidth ? parseInt(savedWidth, 10) : SIDEBAR_WIDTH.MIN;
    const state = savedState || getSidebarState(width);

    return { width, state };
  } catch {
    return { width: SIDEBAR_WIDTH.MIN, state: 'collapsed' };
  }
}

function saveToStorage(width: number, state: SidebarState): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(width));
    localStorage.setItem(STATE_STORAGE_KEY, state);
  } catch {
    // Silently fail if localStorage is not available
  }
}

export function useSidebarResize(options: UseSidebarResizeOptions = {}): UseSidebarResizeReturn {
  const {
    defaultWidth = SIDEBAR_WIDTH.DEFAULT,
    minWidth = SIDEBAR_WIDTH.MIN,
    maxWidth = SIDEBAR_WIDTH.MAX,
    onWidthChange,
    onStateChange,
  } = options;

  // Load initial state from storage
  const initialValues = loadFromStorage();

  const [width, setWidthState] = useState<number>(initialValues.width || defaultWidth);
  const [state, setState] = useState<SidebarState>(initialValues.state);
  const [isDragging, setIsDragging] = useState(false);

  // Ref to track width before collapse (for restore)
  const widthBeforeCollapseRef = useRef<number>(defaultWidth);

  const isCollapsed = state === 'collapsed';

  // Constrain width to min/max bounds
  const constrainWidth = useCallback((newWidth: number): number => {
    return Math.max(minWidth, Math.min(maxWidth, newWidth));
  }, [minWidth, maxWidth]);

  // Set width with constraints and persistence
  const setWidth = useCallback((newWidth: number) => {
    const constrainedWidth = constrainWidth(newWidth);
    const newState = getSidebarState(constrainedWidth);

    setWidthState(constrainedWidth);
    setState(newState);
    saveToStorage(constrainedWidth, newState);

    onWidthChange?.(constrainedWidth);
    onStateChange?.(newState);
  }, [constrainWidth, onWidthChange, onStateChange]);

  // Handle mouse down on resize handle
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = startWidth + deltaX;
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width, setWidth]);

  // Handle double-click to toggle min/default
  const handleDoubleClick = useCallback(() => {
    if (isCollapsed) {
      // Expand to previous width or default
      const targetWidth = widthBeforeCollapseRef.current > minWidth
        ? widthBeforeCollapseRef.current
        : defaultWidth;
      setWidth(targetWidth);
    } else {
      // Save current width and collapse
      widthBeforeCollapseRef.current = width;
      setWidth(minWidth);
    }
  }, [isCollapsed, width, minWidth, defaultWidth, setWidth]);

  // Toggle collapse state
  const toggleCollapse = useCallback(() => {
    handleDoubleClick();
  }, [handleDoubleClick]);

  // Expand to default width
  const expand = useCallback(() => {
    if (isCollapsed) {
      const targetWidth = widthBeforeCollapseRef.current > minWidth
        ? widthBeforeCollapseRef.current
        : defaultWidth;
      setWidth(targetWidth);
    }
  }, [isCollapsed, minWidth, defaultWidth, setWidth]);

  // Collapse to minimum width
  const collapse = useCallback(() => {
    if (!isCollapsed) {
      widthBeforeCollapseRef.current = width;
      setWidth(minWidth);
    }
  }, [isCollapsed, width, minWidth, setWidth]);

  // Sync width before collapse ref when width changes while expanded
  useEffect(() => {
    if (!isCollapsed && width > minWidth) {
      widthBeforeCollapseRef.current = width;
    }
  }, [width, isCollapsed, minWidth]);

  return {
    width,
    state,
    isCollapsed,
    isDragging,
    handleMouseDown,
    handleDoubleClick,
    toggleCollapse,
    expand,
    collapse,
    setWidth,
  };
}

export default useSidebarResize;
