/**
 * Prompt Detection Adapter Types
 *
 * Core interfaces for the unified prompt detection system.
 * Supports multiple AI coding tools: Cursor, Claude Code, Windsurf, GitHub Copilot, etc.
 */

/**
 * Known AI coding tool identifiers
 * Add new tools here as they become supported
 */
export type KnownSourceId = 'cursor' | 'claude_code' | 'vscode' | 'windsurf' | 'github_copilot' | 'cody';

/**
 * Detection method types
 * - hook: Tool calls our script on events (Claude Code, Cursor hooks)
 * - polling: We poll tool's database/state (Cursor SQLite)
 * - api: Tool has an API we subscribe to
 * - extension: We're running inside the tool as an extension
 */
export type DetectionMethod = 'hook' | 'polling' | 'api' | 'extension';

/**
 * Definition of a prompt source (AI coding tool)
 */
export interface PromptSource {
  /** Unique identifier for this source */
  id: KnownSourceId | string;
  /** Human-readable name */
  displayName: string;
  /** How prompts are detected from this source */
  detectionMethod: DetectionMethod;
  /** Optional icon for UI */
  icon?: string;
}

/**
 * Context information extracted with a prompt
 */
export interface PromptContext {
  /** Absolute path to the project/workspace */
  projectPath?: string;
  /** Project/workspace name (from git or folder) */
  projectName?: string;
  /** Source-specific session identifier */
  sourceSessionId?: string;
  /** Files involved in the conversation */
  files?: string[];
  /** Source-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Unified prompt structure from any source
 * All adapters produce this same format
 */
export interface DetectedPrompt {
  /** Unique identifier for this prompt */
  id: string;
  /** The actual prompt text */
  text: string;
  /** When the prompt was submitted */
  timestamp: Date;
  /** Which AI tool this came from */
  source: PromptSource;
  /** Additional context */
  context: PromptContext;
}

/**
 * Status of a prompt source adapter
 */
export interface AdapterStatus {
  /** Whether the adapter is ready to detect prompts */
  isReady: boolean;
  /** Whether the source tool is installed/available */
  isAvailable: boolean;
  /** Whether actively watching for prompts */
  isWatching: boolean;
  /** Number of prompts detected in current session */
  promptsDetected: number;
  /** Last error message if any */
  lastError?: string;
  /** Additional status info */
  info?: string;
}

/**
 * Callback for when a prompt is detected
 */
export type PromptDetectedCallback = (prompt: DetectedPrompt) => void;

/**
 * Callback for adapter status changes
 */
export type AdapterStatusCallback = (status: AdapterStatus) => void;

/**
 * Interface that each source adapter must implement
 */
export interface PromptSourceAdapter {
  /** The source this adapter handles */
  readonly source: PromptSource;

  /**
   * Initialize the adapter (check availability, setup resources)
   * @returns true if initialization successful
   */
  initialize(): Promise<boolean>;

  /**
   * Start watching for prompts
   */
  start(): Promise<void>;

  /**
   * Stop watching for prompts
   */
  stop(): void;

  /**
   * Check if the source tool is available on this system
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get current adapter status
   */
  getStatus(): AdapterStatus;

  /**
   * Clean up resources
   */
  dispose(): void;

  /**
   * Register callback for detected prompts
   */
  onPromptDetected(callback: PromptDetectedCallback): void;

  /**
   * Register callback for status changes
   */
  onStatusChanged(callback: AdapterStatusCallback): void;
}

/**
 * Configuration for the unified prompt detection service
 */
export interface PromptDetectionConfig {
  /** Whether auto-detection is enabled */
  enabled: boolean;
  /** Which sources to enable (empty = all available) */
  enabledSources?: string[];
  /** Whether to auto-analyze detected prompts */
  autoAnalyze: boolean;
}

/**
 * Pre-defined source definitions
 * Used by adapters and for UI display
 */
export const KNOWN_SOURCES: Record<KnownSourceId, PromptSource> = {
  cursor: {
    id: 'cursor',
    displayName: 'Cursor',
    detectionMethod: 'polling',
    icon: 'cursor',
  },
  claude_code: {
    id: 'claude_code',
    displayName: 'Claude Code',
    detectionMethod: 'hook',
    icon: 'claude',
  },
  vscode: {
    id: 'vscode',
    displayName: 'VS Code',
    detectionMethod: 'extension',
    icon: 'vscode',
  },
  windsurf: {
    id: 'windsurf',
    displayName: 'Windsurf',
    detectionMethod: 'hook',
    icon: 'windsurf',
  },
  github_copilot: {
    id: 'github_copilot',
    displayName: 'GitHub Copilot',
    detectionMethod: 'api',
    icon: 'copilot',
  },
  cody: {
    id: 'cody',
    displayName: 'Sourcegraph Cody',
    detectionMethod: 'api',
    icon: 'cody',
  },
};

/**
 * Helper to create a unique prompt ID
 */
export function generatePromptId(sourceId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${sourceId}-${timestamp}-${random}`;
}

/**
 * Helper to get source display name
 */
export function getSourceDisplayName(sourceId: string): string {
  const known = KNOWN_SOURCES[sourceId as KnownSourceId];
  if (known) {
    return known.displayName;
  }
  // Capitalize first letter of unknown sources
  return sourceId.charAt(0).toUpperCase() + sourceId.slice(1).replace(/_/g, ' ');
}
