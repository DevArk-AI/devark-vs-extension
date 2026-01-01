/**
 * Streaming JSON Parser
 *
 * Parses line-delimited JSON events from CLI output.
 * Based on vibe-log-cli implementation for Claude Code CLI.
 *
 * Handles:
 * - Line-delimited JSON (NDJSON)
 * - Non-JSON error/warning messages from CLI
 * - Corrupted config file warnings
 * - Multiple JSON objects on single line
 */

/**
 * Event types from Claude/Cursor stream-json output
 *
 * CLI tools output events as newline-delimited JSON objects.
 * Each line represents one event in the conversation or execution.
 */
export interface StreamEvent {
  /** Event type (e.g., 'message', 'result', 'error') */
  type: string;
  /** Event subtype for more granular categorization */
  subtype?: string;
  /** Message content (for message events) */
  message?: any;
  /** Delta content for streaming text (for delta events) */
  delta?: any;
  /** Final result (for result events) */
  result?: any;
  /** Content field (alternative to message/result) */
  content?: any;
  /** Execution duration in milliseconds */
  duration_ms?: number;
  /** Number of conversation turns */
  num_turns?: number;
  /** Total cost in USD (if available) */
  total_cost_usd?: number;
  /** Session identifier */
  session_id?: string;
  /** Whether this is an error event */
  is_error?: boolean;
}

/**
 * Patterns to identify non-JSON CLI output lines that should be silently ignored
 * These are typically error messages, warnings, or status updates from the CLI
 */
const IGNORABLE_LINE_PATTERNS = [
  /^Claude configuration file/i,
  /^The corrupted file has been backed up/i,
  /^A backup file exists at:/i,
  /is corrupted:/i,
  /JSON Parse error:/i,
  /Unexpected EOF/i,
  /^\s*Warning:/i,
  /^\s*Error:/i,
  /^\s*Note:/i,
  /^\[.*\]/,  // Log prefixes like [INFO], [WARN], etc.
];

/**
 * Check if a line looks like it might be JSON (starts with { or [)
 */
function looksLikeJSON(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

/**
 * Check if a line should be silently ignored (known non-JSON output)
 */
function shouldIgnoreLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;

  // Check against known ignorable patterns
  return IGNORABLE_LINE_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Attempt to extract valid JSON from a line that might have extra content
 * Returns null if no valid JSON can be extracted
 */
function extractJSON(line: string): object | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }

  // Try parsing as-is first
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to recovery strategies
  }

  // Strategy: Find balanced braces and try to parse just that portion
  let depth = 0;
  let start = -1;
  const isArray = trimmed.startsWith('[');
  const openChar = isArray ? '[' : '{';
  const closeChar = isArray ? ']' : '}';

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === openChar) {
      if (depth === 0) start = i;
      depth++;
    } else if (char === closeChar) {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = trimmed.substring(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          // This balanced section wasn't valid JSON, reset and continue
          start = -1;
        }
      }
    }
  }

  return null;
}

/**
 * Parse streaming JSON lines from CLI output
 *
 * Handles partial lines, malformed JSON, and various event types.
 * Based on vibe-log-cli pattern for robust CLI output parsing.
 */
export class StreamJSONParser {
  /** Buffer for incomplete lines */
  private buffer = '';

  /** Count of ignored lines (for debugging) */
  private ignoredLineCount = 0;

  /** Enable verbose logging for debugging */
  private verbose = false;

  /**
   * Create a new StreamJSONParser
   * @param options - Parser options
   */
  constructor(options?: { verbose?: boolean }) {
    this.verbose = options?.verbose ?? false;
  }

  /**
   * Add chunk of data and return complete events
   *
   * Accumulates data in buffer until complete lines are available.
   * Each complete line is parsed as a JSON event.
   *
   * @param chunk - Raw data chunk from CLI stdout
   * @returns Array of parsed events from complete lines
   */
  parseChunk(chunk: string): StreamEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');

    // Keep last incomplete line in buffer
    this.buffer = lines.pop() || '';

    const events: StreamEvent[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      // Check if this is a known non-JSON line that should be silently ignored
      if (shouldIgnoreLine(trimmed)) {
        this.ignoredLineCount++;
        if (this.verbose) {
          console.debug('[StreamJSONParser] Ignored non-JSON line:', trimmed.substring(0, 100));
        }
        continue;
      }

      // Only try to parse lines that look like JSON
      if (!looksLikeJSON(trimmed)) {
        this.ignoredLineCount++;
        if (this.verbose) {
          console.debug('[StreamJSONParser] Skipped non-JSON line:', trimmed.substring(0, 100));
        }
        continue;
      }

      // Try to parse as JSON
      try {
        const event = JSON.parse(trimmed);
        events.push(event);
      } catch {
        // Try to extract valid JSON from the line
        const extracted = extractJSON(trimmed);
        if (extracted) {
          events.push(extracted as StreamEvent);
        } else {
          // Only warn if verbose mode is on, as this is expected for some CLI output
          if (this.verbose) {
            console.warn('[StreamJSONParser] Could not parse line as JSON:', trimmed.substring(0, 100));
          }
          this.ignoredLineCount++;
        }
      }
    }

    return events;
  }

  /**
   * Extract final result from events
   *
   * Looks for result events first, falls back to concatenating message content.
   * Handles various result formats from different CLI tools.
   *
   * @param events - Array of parsed events
   * @returns Extracted result text
   */
  extractResult(events: StreamEvent[]): string {
    // Strategy 1: Find explicit result event
    const resultEvent = events.find(e => e.type === 'result');
    if (resultEvent?.result) {
      return typeof resultEvent.result === 'string'
        ? resultEvent.result
        : JSON.stringify(resultEvent.result);
    }

    // Strategy 2: Concatenate all assistant message content
    // Claude Code CLI format: {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
    const assistantContent = events
      .filter(e => e.type === 'assistant' && e.message?.content)
      .map(e => {
        const content = e.message.content;

        // Handle array of content blocks (Claude Code format)
        if (Array.isArray(content)) {
          return content
            .filter((c: any) => c.type === 'text' && c.text)
            .map((c: any) => c.text)
            .join('');
        }

        // Handle string content
        return typeof content === 'string' ? content : '';
      })
      .join('');

    if (assistantContent) {
      return assistantContent;
    }

    // Strategy 3: Legacy format - type === 'message' with message.content
    const messageContent = events
      .filter(e => e.type === 'message' && e.message?.content)
      .map(e => {
        const content = e.message.content;

        // Handle array of content blocks
        if (Array.isArray(content)) {
          return content.map((c: any) => c.text || '').join('');
        }

        // Handle string content
        return typeof content === 'string' ? content : '';
      })
      .join('');

    if (messageContent) {
      return messageContent;
    }

    // Strategy 4: Look for content field directly
    const contentEvent = events.find(e => e.content);
    if (contentEvent?.content) {
      return typeof contentEvent.content === 'string'
        ? contentEvent.content
        : JSON.stringify(contentEvent.content);
    }

    // No result found
    return '';
  }

  /**
   * Reset parser state
   *
   * Clears buffer for reuse with new stream.
   * Call between different CLI executions.
   */
  reset(): void {
    this.buffer = '';
    this.ignoredLineCount = 0;
  }

  /**
   * Get parser statistics
   *
   * Useful for debugging and monitoring parse quality.
   */
  getStats(): { ignoredLines: number; bufferLength: number } {
    return {
      ignoredLines: this.ignoredLineCount,
      bufferLength: this.buffer.length,
    };
  }
}
