/**
 * Shared types and interfaces for SessionManager internal services
 */

import type * as vscode from 'vscode';
import {
  type Project,
  type Session,
  type SessionDetectionConfig,
  type SessionEvent,
  type SessionManagerState,
  type SerializedProject,
  type SerializedSession,
  type SerializedPromptRecord,
  type SerializedResponseRecord,
  type PromptRecord,
  type ResponseRecord,
} from '../types/session-types';

/**
 * Storage keys for VS Code globalState
 */
export const STORAGE_KEYS = {
  SESSION_STATE: 'copilot.v2.sessionState',
  SIDEBAR_WIDTH: 'copilot.v2.sidebarWidth',
  SUGGESTION_DISMISSALS: 'copilot.v2.suggestionDismissals',
  THROTTLE_TIMESTAMPS: 'copilot.v2.throttleTimestamps',
} as const;

/**
 * Default session detection config
 */
export const DEFAULT_SESSION_DETECTION_CONFIG: SessionDetectionConfig = {
  maxInactivityMinutes: 120,
  minPromptsForSession: 1,
};

/**
 * Maximum prompts to keep per session (memory management)
 */
export const MAX_PROMPTS_PER_SESSION = 100;

/**
 * Dependencies shared across internal SessionManager services
 */
export interface SessionManagerDeps {
  context: vscode.ExtensionContext;
  projects: Map<string, Project>;
  config: SessionDetectionConfig;
  activeSessionId: string | null;
  activeProjectId: string | null;
  emitEvent: (event: SessionEvent) => void;
  saveState: () => Promise<void>;
  getActiveSessionId: () => string | null;
  setActiveSessionId: (id: string | null) => void;
  getActiveProjectId: () => string | null;
  setActiveProjectId: (id: string | null) => void;
}

// Re-export types used by internal services
export type {
  Project,
  Session,
  SessionDetectionConfig,
  SessionEvent,
  SessionManagerState,
  SerializedProject,
  SerializedSession,
  SerializedPromptRecord,
  SerializedResponseRecord,
  PromptRecord,
  ResponseRecord,
};
