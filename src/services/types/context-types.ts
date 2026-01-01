/**
 * Context Types for Smart Snippets & Context Weighting (Workstream A)
 *
 * Type definitions for:
 * - SmartSnippet: Code snippets extracted from workspace
 * - ContextWeights: Dynamic context weighting for prompt improvement
 * - ContextualImprovementContext: Full context for prompt improvement
 */

/**
 * Code snippet extracted from workspace files
 */
export interface SmartSnippet {
  /** Entity name (e.g., "LoginComponent", "fetchUsers") */
  entityName: string;
  /** Full file path (e.g., "src/components/LoginComponent.tsx") */
  filePath: string;
  /** Relevant code content (max 50 lines) */
  relevantCode: string;
  /** Why this snippet was extracted */
  extractionReason: string;
  /** Number of lines in the snippet */
  lineCount: number;
}

/**
 * Dynamic weights for context sources
 * Total should equal 1.0
 */
export interface ContextWeights {
  /** Weight for session goal context (0-1) */
  goal: number;
  /** Weight for prompt history context (0-1) */
  history: number;
  /** Weight for technical context (0-1) */
  technical: number;
}

/**
 * Recent prompt with additional metadata
 */
export interface RecentPromptContext {
  /** The prompt text */
  text: string;
  /** Whether this was addressed/completed */
  wasAddressed: boolean;
  /** Detected topics in this prompt */
  topics: string[];
}

/**
 * Full context for contextual prompt improvement
 */
export interface ContextualImprovementContext {
  /** Goal-related context */
  goal: {
    /** Current goal text or null if no goal */
    text: string | null;
    /** Goal completion progress (0-1) */
    progress: number;
    /** Whether goal is relevant to current prompt */
    relevantToPrompt: boolean;
  };
  /** Recent prompt history context */
  recentHistory: {
    /** Last N prompts with metadata */
    lastPrompts: RecentPromptContext[];
    /** Topics already asked about in session */
    alreadyAskedAbout: string[];
    /** Session duration in minutes */
    sessionDuration: number;
  };
  /** Technical context */
  technical: {
    /** Detected tech stack (React, TypeScript, etc.) */
    techStack: string[];
    /** Extracted code snippets from workspace */
    codeSnippets: SmartSnippet[];
    /** Recently modified files in workspace */
    recentlyModifiedFiles: string[];
  };
  /** Dynamic weights for context sources */
  weights: ContextWeights;
}

/**
 * Input for context weight calculation
 */
export interface ContextWeightInput {
  /** Whether a goal is set */
  hasGoal: boolean;
  /** Number of prompts in current session */
  promptCount: number;
  /** Whether tech stack was detected */
  hasTechStack: boolean;
  /** Topic that has been repeated 3+ times */
  repeatedTopic?: string;
}
