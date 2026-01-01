/**
 * ResponseAnalyzer Service
 *
 * Analyzes captured AI agent responses to extract:
 * - What was accomplished
 * - Topics and entities involved
 * - Goal progress
 * - Overall outcome
 *
 * Performance budget: 100ms (no LLM calls, heuristics only)
 */

import type { CapturedResponse } from './types/response-types';
import type { ResponseAnalysis, ResponseOutcome } from './types/coaching-types';
import { getGoalService } from './GoalService';

// Debug logging
const DEBUG_RESPONSE_ANALYZER = false;

/**
 * ResponseAnalyzer - Singleton service for analyzing agent responses
 */
export class ResponseAnalyzer {
  private static instance: ResponseAnalyzer | null = null;

  private constructor() {}

  public static getInstance(): ResponseAnalyzer {
    if (!ResponseAnalyzer.instance) {
      ResponseAnalyzer.instance = new ResponseAnalyzer();
    }
    return ResponseAnalyzer.instance;
  }

  /**
   * Analyze a captured response to extract what was accomplished
   */
  public async analyzeResponse(response: CapturedResponse): Promise<ResponseAnalysis> {
    if (DEBUG_RESPONSE_ANALYZER) {
      console.log('[ResponseAnalyzer] Analyzing response:', response.id);
    }

    // Extract topics from response text
    const topicsAddressed = this.extractTopics(response.response || '');

    // Get modified entities
    const entitiesModified = this.extractEntities(response);

    // Determine outcome
    const outcome = this.determineOutcome(response);

    // Generate summary
    const summary = this.generateSummary(response, outcome);

    // Calculate goal progress
    const goalProgress = await this.calculateGoalProgress(response);

    const analysis: ResponseAnalysis = {
      summary,
      outcome,
      topicsAddressed,
      entitiesModified,
      goalProgress,
    };

    if (DEBUG_RESPONSE_ANALYZER) {
      console.log('[ResponseAnalyzer] Analysis result:', analysis);
    }

    return analysis;
  }

  /**
   * Determine the outcome based on response data
   */
  private determineOutcome(response: CapturedResponse): ResponseOutcome {
    if (response.source === 'cursor') {
      return response.success ? 'success' : 'error';
    }

    // Claude Code uses 'reason' field
    switch (response.reason) {
      case 'completed':
        return 'success';
      case 'error':
        return 'error';
      case 'cancelled':
        return 'partial';
      default:
        // Default based on success flag
        return response.success !== false ? 'partial' : 'error';
    }
  }

  /**
   * Extract topics from response text using heuristics
   */
  private extractTopics(text: string): string[] {
    if (!text) return [];

    const topics = new Set<string>();

    // Common development topics patterns
    const topicPatterns: Array<{ pattern: RegExp; topic: string }> = [
      { pattern: /\b(test|testing|tests|spec)\b/i, topic: 'Testing' },
      { pattern: /\b(fix|fixed|bug|error|issue)\b/i, topic: 'Bug Fix' },
      { pattern: /\b(refactor|clean|improve)\b/i, topic: 'Refactoring' },
      { pattern: /\b(add|create|implement|new)\b/i, topic: 'Feature' },
      { pattern: /\b(type|types|typescript|interface)\b/i, topic: 'Type Safety' },
      { pattern: /\b(style|css|design|ui)\b/i, topic: 'Styling' },
      { pattern: /\b(api|endpoint|request|response)\b/i, topic: 'API' },
      { pattern: /\b(database|db|query|sql)\b/i, topic: 'Database' },
      { pattern: /\b(auth|login|authentication|jwt)\b/i, topic: 'Authentication' },
      { pattern: /\b(deploy|build|ci|cd)\b/i, topic: 'DevOps' },
      { pattern: /\b(config|configuration|setup|env)\b/i, topic: 'Configuration' },
      { pattern: /\b(document|readme|comment)\b/i, topic: 'Documentation' },
      { pattern: /\b(component|react|vue|angular)\b/i, topic: 'Components' },
      { pattern: /\b(hook|useState|useEffect)\b/i, topic: 'React Hooks' },
      { pattern: /\b(state|redux|store|context)\b/i, topic: 'State Management' },
      { pattern: /\b(route|router|navigation)\b/i, topic: 'Routing' },
      { pattern: /\b(validation|validate|schema)\b/i, topic: 'Validation' },
      { pattern: /\b(performance|optimize|cache)\b/i, topic: 'Performance' },
      { pattern: /\b(security|sanitize|escape)\b/i, topic: 'Security' },
    ];

    for (const { pattern, topic } of topicPatterns) {
      if (pattern.test(text)) {
        topics.add(topic);
      }
    }

    return Array.from(topics).slice(0, 5); // Max 5 topics
  }

  /**
   * Extract modified entities from response
   */
  private extractEntities(response: CapturedResponse): string[] {
    const entities = new Set<string>();

    // From files modified (Cursor)
    if (response.filesModified) {
      for (const file of response.filesModified) {
        entities.add(this.normalizeFilePath(file));
      }
    }

    // From tool calls (Cursor)
    if (response.toolCalls) {
      for (const call of response.toolCalls) {
        if (call.arguments?.path) {
          entities.add(this.normalizeFilePath(call.arguments.path as string));
        }
        if (call.arguments?.file) {
          entities.add(this.normalizeFilePath(call.arguments.file as string));
        }
        if (call.arguments?.file_path) {
          entities.add(this.normalizeFilePath(call.arguments.file_path as string));
        }
      }
    }

    // From tool results (Claude Code)
    if (response.toolResults) {
      for (const result of response.toolResults) {
        // Extract file paths from result text
        const pathMatches = result.result?.match(/(?:file|path|wrote|created|modified)[:\s]+([^\s,\n]+)/gi);
        if (pathMatches) {
          for (const match of pathMatches) {
            const pathPart = match.split(/[:\s]+/)[1];
            if (pathPart && pathPart.includes('/') || pathPart.includes('\\')) {
              entities.add(this.normalizeFilePath(pathPart));
            }
          }
        }
      }
    }

    // Extract from response text
    if (response.response) {
      const filePatterns = [
        /(?:modified|created|updated|wrote|edited)\s+[`"']?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z]{2,6})[`"']?/gi,
        /`([a-zA-Z0-9_\-./\\]+\.[a-zA-Z]{2,6})`/g,
      ];

      for (const pattern of filePatterns) {
        let match;
        while ((match = pattern.exec(response.response)) !== null) {
          if (match[1] && this.isValidFilePath(match[1])) {
            entities.add(this.normalizeFilePath(match[1]));
          }
        }
      }
    }

    return Array.from(entities).slice(0, 20); // Max 20 entities
  }

  /**
   * Normalize a file path for display
   */
  private normalizeFilePath(path: string): string {
    // Remove leading ./ or ./
    let normalized = path.replace(/^\.[\\/]/, '');
    // Convert backslashes to forward slashes
    normalized = normalized.replace(/\\/g, '/');
    // Take just the filename if path is very long
    if (normalized.length > 50) {
      const parts = normalized.split('/');
      normalized = parts.slice(-2).join('/');
    }
    return normalized;
  }

  /**
   * Check if a string looks like a valid file path
   */
  private isValidFilePath(path: string): boolean {
    // Must have an extension
    if (!/\.[a-zA-Z]{2,6}$/.test(path)) return false;
    // Must not be a URL
    if (/^https?:\/\//.test(path)) return false;
    // Must not contain certain characters
    if (/[<>|"?*]/.test(path)) return false;
    return true;
  }

  /**
   * Generate a summary of the response
   */
  private generateSummary(
    response: CapturedResponse,
    outcome: ResponseOutcome
  ): string {
    // Determine action word based on outcome
    const actionWord = outcome === 'success' ? 'Completed' :
                       outcome === 'partial' ? 'Partially completed' :
                       outcome === 'blocked' ? 'Blocked on' : 'Error in';

    // Try to extract a meaningful first line from the response
    const firstMeaningfulLine = this.extractFirstMeaningfulLine(response.response || '');

    if (firstMeaningfulLine) {
      return firstMeaningfulLine;
    }

    // Fallback: describe what was done based on entities
    if (response.filesModified && response.filesModified.length > 0) {
      const fileCount = response.filesModified.length;
      const firstFile = this.normalizeFilePath(response.filesModified[0]);
      if (fileCount === 1) {
        return `${actionWord} changes to ${firstFile}`;
      }
      return `${actionWord} changes to ${fileCount} files including ${firstFile}`;
    }

    if (response.toolCalls && response.toolCalls.length > 0) {
      return `${actionWord} ${response.toolCalls.length} operations`;
    }

    return `${actionWord} task`;
  }

  /**
   * Detect if a line is likely JSON or structured data (should be skipped for summaries)
   */
  private isJsonLikeLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;

    // Starts with JSON object/array or contains multiple key/value pairs
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return true;
    const keyValuePairs = (trimmed.match(/"[^"]+"\s*:/g) || []).length;
    if (keyValuePairs >= 2) return true;

    // Looks like a single JSON field (e.g., "specificity": 7,)
    if (/^"[^"]+"\s*:\s*.+/.test(trimmed)) return true;

    return false;
  }

  /**
   * Extract the first meaningful line from response text
   */
  private extractFirstMeaningfulLine(text: string): string | null {
    if (!text) return null;

    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines
      if (!trimmed) continue;
      // Skip lines that are just symbols or very short
      if (trimmed.length < 15) continue;
      // Skip markdown headers
      if (/^#{1,6}\s/.test(trimmed)) continue;
      // Skip code fence markers
      if (/^```/.test(trimmed)) continue;
      // Skip JSON/structured data lines (e.g., {"specificity":7,...})
      if (this.isJsonLikeLine(trimmed)) continue;
      // Skip lines that are just file paths
      if (/^[a-zA-Z0-9_\-./\\]+$/.test(trimmed)) continue;

      // Found a good line - return it in full
      return trimmed;
    }

    return null;
  }

  /**
   * Calculate goal progress based on response
   */
  private async calculateGoalProgress(
    response: CapturedResponse
  ): Promise<ResponseAnalysis['goalProgress'] | undefined> {
    try {
      const goalService = getGoalService();
      const goalStatus = goalService.getGoalStatus();

      if (!goalStatus.hasGoal) {
        return undefined;
      }

      const before = this.estimateProgress(goalStatus);

      // Calculate increment based on response
      let increment = 0;

      if (response.success !== false) {
        // Base increment for successful response
        increment = 5;

        // Additional increment for files modified
        const filesModified = response.filesModified?.length ?? 0;
        increment += Math.min(15, filesModified * 5);

        // Additional increment for tool calls
        const toolCallCount = (response.toolCalls?.length ?? 0) + (response.toolResults?.length ?? 0);
        increment += Math.min(10, toolCallCount * 2);
      }

      const after = Math.min(100, before + increment);

      return {
        before,
        after,
        justCompleted: after > before ? this.generateMilestoneDescription(response, after) : undefined,
      };
    } catch (error) {
      if (DEBUG_RESPONSE_ANALYZER) {
        console.error('[ResponseAnalyzer] Error calculating goal progress:', error);
      }
      return undefined;
    }
  }

  /**
   * Estimate current progress from goal status
   */
  private estimateProgress(goalStatus: { promptsSinceGoalSet?: number }): number {
    // Simple heuristic: each prompt represents ~5% progress
    const promptCount = goalStatus.promptsSinceGoalSet ?? 0;
    return Math.min(90, promptCount * 5);
  }

  /**
   * Generate a milestone description
   */
  private generateMilestoneDescription(response: CapturedResponse, progress: number): string {
    if (progress >= 90) {
      return 'Nearing completion';
    }
    if (response.filesModified && response.filesModified.length > 0) {
      return `Updated ${response.filesModified.length} file(s)`;
    }
    return 'Made progress';
  }
}

/**
 * Get the singleton ResponseAnalyzer instance
 */
export function getResponseAnalyzer(): ResponseAnalyzer {
  return ResponseAnalyzer.getInstance();
}
