/**
 * Session Processing Module
 *
 * Pure functions for processing session data:
 * - Duration calculation (with idle gap handling)
 * - Language detection (from file paths/extensions)
 */

// Duration calculator
export {
  calculateDuration,
  MAX_IDLE_GAP,
  MAX_SESSION_DURATION,
  type DurationResult,
  type TimestampedItem,
} from './duration-calculator';

// Language extractor
export {
  getLanguageFromExtension,
  getLanguageFromPath,
  extractLanguagesFromPaths,
  getLanguageStatistics,
  LANGUAGE_MAPPINGS,
  IGNORED_EXTENSIONS,
} from './language-extractor';

// Session transformer
export {
  toSanitizedSession,
  extractProjectName,
  summarizeMessages,
  type MessageSummary,
} from './session-transformer';

// Highlights extractor
export {
  extractHighlights,
  isMeaningfulMessage,
  truncateText,
  DEFAULT_MAX_HIGHLIGHT_LENGTH,
  MIN_MEANINGFUL_LENGTH,
  type HighlightsOptions,
} from './highlights-extractor';
