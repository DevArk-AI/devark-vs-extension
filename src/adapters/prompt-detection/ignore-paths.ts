/**
 * Shared configuration for ignored project paths
 *
 * These paths are filtered out from:
 * - Auto-capture prompt detection
 * - Daily/weekly/monthly summaries
 * - Session analytics
 *
 * IMPORTANT: Be specific! Don't use broad patterns that might catch real projects.
 */

/**
 * Paths to ignore when detecting project context
 *
 * NOTE: Leading slashes are stripped for cross-platform compatibility.
 * Patterns match as complete path segments anywhere in the path.
 */
export const IGNORED_PATHS = [
  // Vibe-Log internal temp directories (used for AI analysis, standups, reports)
  '.devark/temp-prompt-analysis',     // CLI evaluation temp folder
  '.devark/temp-standup',             // Standup summary generation
  '.devark/temp-productivity-report', // Productivity report generation
  'devark-temp',                      // General temp directory
  'devark-hooks',                     // Hook temp directory
  'devark-analysis',                  // AI analysis temp directory (e.g., AppData/Local/Temp/devark-analysis)

  // Cursor IDE installation paths (cross-platform)
  'programs/cursor',                    // C:\Programs\Cursor or /usr/programs/cursor
  'appdata/local/programs/cursor',      // Windows AppData

  // Additional common ignore patterns
  '.cursor',                            // Cursor settings directory
];

/**
 * Compiled regex patterns for efficient path matching (created once)
 * Each pattern matches complete path segments to avoid false positives
 */
const COMPILED_PATTERNS = IGNORED_PATHS.map((pattern) => {
  // Normalize pattern: remove leading slash, escape regex chars
  const normalizedPattern = pattern.replace(/^\/+/, '');
  const escaped = normalizedPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '\\/');

  // Match as complete path segment sequence: (start OR /) + pattern + (/ OR end)
  // Examples:
  // - 'programs/cursor' matches: 'c:/programs/cursor/foo' ✅
  // - 'programs/cursor' does NOT match: 'c:/my-programs/cursor-clone' ❌
  // - '.cursor' matches: '/home/user/.cursor' ✅
  // - '.cursor' does NOT match: '/home/user/.cursorrules' ❌
  return new RegExp(`(^|/)${escaped}(/|$)`, 'i');
});

/**
 * Check if a path should be ignored (cross-platform folder filtering)
 *
 * Uses path segment matching to avoid false positives:
 * - ✅ '/home/user/.devark/temp-standup' → matches '.devark/temp-standup'
 * - ✅ 'C:\\Programs\\Cursor\\project' → matches 'programs/cursor'
 * - ❌ '/home/user/my-cursor-project' → does NOT match '.cursor'
 * - ❌ '/work/programs-cursor-app' → does NOT match 'programs/cursor'
 *
 * @param projectPath - Full path to the project/workspace (Windows or Unix)
 * @returns true if path should be ignored, false otherwise
 */
export function shouldIgnorePath(projectPath: string | undefined): boolean {
  if (!projectPath || projectPath.trim() === '') {
    return false;
  }

  // Normalize: forward slashes, remove trailing slash
  const normalized = projectPath.replace(/\\/g, '/').replace(/\/$/, '');

  // Check against compiled patterns (case-insensitive)
  return COMPILED_PATTERNS.some((regex) => regex.test(normalized));
}
