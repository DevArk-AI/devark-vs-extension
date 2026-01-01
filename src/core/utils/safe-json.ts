/**
 * Safe JSON Parsing Utilities
 *
 * Provides robust JSON parsing with error handling, validation,
 * and recovery options for handling corrupted or malformed data.
 */

/**
 * Result of a safe JSON parse operation
 */
export interface SafeParseResult<T> {
  /** Whether parsing was successful */
  success: boolean;
  /** The parsed data (only if success is true) */
  data?: T;
  /** Error information (only if success is false) */
  error?: {
    message: string;
    position?: number;
    line?: number;
    column?: number;
  };
  /** Whether recovery was attempted */
  recovered?: boolean;
}

/**
 * Options for safe JSON parsing
 */
export interface SafeParseOptions {
  /** Attempt to recover from common JSON errors */
  attemptRecovery?: boolean;
  /** Validate the parsed data against a schema */
  validate?: (data: unknown) => boolean;
  /** Default value to return if parsing fails */
  defaultValue?: unknown;
  /** Log errors to console */
  logErrors?: boolean;
  /** Context string for error messages */
  context?: string;
}

/**
 * Safely parse JSON string with error handling and recovery
 *
 * @param content - The JSON string to parse
 * @param options - Parsing options
 * @returns SafeParseResult with success status, data, and error info
 */
export function safeJSONParse<T = unknown>(
  content: string,
  options: SafeParseOptions = {}
): SafeParseResult<T> {
  const {
    attemptRecovery = true,
    validate,
    defaultValue,
    logErrors = false,
    context = 'JSON',
  } = options;

  // Handle empty content
  if (!content || typeof content !== 'string') {
    const result: SafeParseResult<T> = {
      success: false,
      error: { message: 'Content is empty or not a string' },
    };

    if (defaultValue !== undefined) {
      result.data = defaultValue as T;
    }

    return result;
  }

  const trimmed = content.trim();
  if (!trimmed) {
    const result: SafeParseResult<T> = {
      success: false,
      error: { message: 'Content is empty after trimming' },
    };

    if (defaultValue !== undefined) {
      result.data = defaultValue as T;
    }

    return result;
  }

  // Try direct parsing first
  try {
    const data = JSON.parse(trimmed);

    // Validate if validator provided
    if (validate && !validate(data)) {
      return {
        success: false,
        error: { message: 'Parsed data failed validation' },
        data: defaultValue as T,
      };
    }

    return { success: true, data: data as T };
  } catch (e) {
    const error = e as SyntaxError;
    const errorInfo = parseJSONError(error);

    if (logErrors) {
      console.warn(`[SafeJSON] Parse error in ${context}:`, errorInfo.message);
    }

    // Attempt recovery if enabled
    if (attemptRecovery) {
      const recovered = attemptJSONRecovery<T>(trimmed, validate);
      if (recovered.success) {
        if (logErrors) {
          console.info(`[SafeJSON] Successfully recovered ${context}`);
        }
        return { ...recovered, recovered: true };
      }
    }

    // Return failure with error details
    const result: SafeParseResult<T> = {
      success: false,
      error: errorInfo,
    };

    if (defaultValue !== undefined) {
      result.data = defaultValue as T;
    }

    return result;
  }
}

/**
 * Parse a JSON error to extract position information
 */
function parseJSONError(error: SyntaxError): {
  message: string;
  position?: number;
  line?: number;
  column?: number;
} {
  const message = error.message || 'Unknown JSON error';

  // Try to extract position from error message
  // Format: "... at position 123"
  const posMatch = message.match(/at position (\d+)/);
  const position = posMatch ? parseInt(posMatch[1], 10) : undefined;

  // Format: "... (line X column Y)"
  const lineColMatch = message.match(/\(line (\d+) column (\d+)\)/);
  const line = lineColMatch ? parseInt(lineColMatch[1], 10) : undefined;
  const column = lineColMatch ? parseInt(lineColMatch[2], 10) : undefined;

  return { message, position, line, column };
}

/**
 * Attempt to recover valid JSON from corrupted content
 */
function attemptJSONRecovery<T>(
  content: string,
  validate?: (data: unknown) => boolean
): SafeParseResult<T> {
  // Strategy 1: Extract first complete JSON object/array
  const extracted = extractFirstJSON(content);
  if (extracted) {
    try {
      const data = JSON.parse(extracted);
      if (!validate || validate(data)) {
        return { success: true, data: data as T };
      }
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 2: Try to fix common issues
  const fixed = fixCommonJSONIssues(content);
  if (fixed !== content) {
    try {
      const data = JSON.parse(fixed);
      if (!validate || validate(data)) {
        return { success: true, data: data as T };
      }
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 3: Try truncating at the error position
  const truncated = truncateToValidJSON(content);
  if (truncated) {
    try {
      const data = JSON.parse(truncated);
      if (!validate || validate(data)) {
        return { success: true, data: data as T };
      }
    } catch {
      // All strategies failed
    }
  }

  return { success: false };
}

/**
 * Extract the first complete JSON object or array from content
 */
function extractFirstJSON(content: string): string | null {
  const startIndex = content.search(/[[{]/);
  if (startIndex === -1) return null;

  const isArray = content[startIndex] === '[';
  const openChar = isArray ? '[' : '{';
  const closeChar = isArray ? ']' : '}';

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === openChar) {
      depth++;
    } else if (char === closeChar) {
      depth--;
      if (depth === 0) {
        return content.substring(startIndex, i + 1);
      }
    }
  }

  return null;
}

/**
 * Fix common JSON formatting issues
 */
function fixCommonJSONIssues(content: string): string {
  let fixed = content;

  // Remove trailing commas before } or ]
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');

  // Remove BOM if present
  fixed = fixed.replace(/^\uFEFF/, '');

  // Remove leading/trailing whitespace
  fixed = fixed.trim();

  return fixed;
}

/**
 * Try to truncate content to form valid JSON (handles EOF issues)
 */
function truncateToValidJSON(content: string): string | null {
  const startIndex = content.search(/[[{]/);
  if (startIndex === -1) return null;

  // Work backwards from the end trying to find a valid JSON
  for (let endPos = content.length; endPos > startIndex; endPos--) {
    const char = content[endPos - 1];
    if (char === '}' || char === ']') {
      const candidate = content.substring(startIndex, endPos);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // Continue trying shorter strings
      }
    }
  }

  return null;
}

/**
 * Read and parse a JSON file safely
 *
 * @param filePath - Path to the JSON file
 * @param fs - File system interface with readFileSync
 * @param options - Parse options
 * @returns SafeParseResult with file contents or error
 */
export function safeReadJSONFile<T = unknown>(
  filePath: string,
  fs: { readFileSync: (path: string, encoding: string) => string; existsSync: (path: string) => boolean },
  options: SafeParseOptions & { createBackup?: boolean } = {}
): SafeParseResult<T> & { fileExists: boolean } {
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      fileExists: false,
      error: { message: `File not found: ${filePath}` },
      data: options.defaultValue as T,
    };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const result = safeJSONParse<T>(content, {
      ...options,
      context: options.context || filePath,
    });

    return { ...result, fileExists: true };
  } catch (e) {
    const error = e as Error;
    return {
      success: false,
      fileExists: true,
      error: { message: `Failed to read file: ${error.message}` },
      data: options.defaultValue as T,
    };
  }
}

/**
 * Validate that an object has the expected structure
 *
 * @param data - The data to validate
 * @param requiredFields - Array of required field names
 * @returns True if all required fields are present
 */
export function hasRequiredFields(
  data: unknown,
  requiredFields: string[]
): data is Record<string, unknown> {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return requiredFields.every((field) => field in obj);
}

