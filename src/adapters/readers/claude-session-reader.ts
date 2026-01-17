/**
 * Claude Session Reader
 *
 * Reads Claude Code sessions from JSONL files in ~/.claude/projects/.
 * Implements ISessionReader interface with full model tracking
 * and planning mode detection.
 */

import type {
  ISessionReader,
  ReaderCapabilities,
  SessionReaderResult,
  SessionReaderError,
} from '../../ports/readers/session-reader.interface';
import type { IFileSystem } from '../../ports/readers/file-system.interface';
import type {
  SessionData,
  ReaderOptions,
  ToolType,
  Message,
  ModelUsageStats,
  PlanningModeInfo,
  SessionMetadata,
  SourceFileInfo,
  SessionIndex,
  SessionDetails,
  TokenUsageData,
} from '../../types';
import { calculateDuration } from '../../core/session/duration-calculator';
import { extractLanguagesFromPaths } from '../../core/session/language-extractor';
import { extractHighlights } from '../../core/session/highlights-extractor';
import { calculateTokenUsage } from '../../core/session/token-counter';

/**
 * Claude-specific patterns to skip when extracting highlights
 */
const CLAUDE_SKIP_PATTERNS = [
  '<command-name>',
  '<local-command-',
  'Caveat: The messages below were generated',
];

/**
 * JSONL entry for Claude message
 */
interface ClaudeMessage {
  role: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: string | any[];
  timestamp: string;
  model?: string;
}

/**
 * JSONL entry structure
 */
interface ClaudeLogEntry {
  sessionId?: string;
  cwd?: string;
  timestamp?: string;
  message?: ClaudeMessage;
  type?: string;
  files?: string[];
  gitBranch?: string;
  toolUseResult?: {
    type: string;
    filePath?: string;
  };
}

export class ClaudeSessionReader implements ISessionReader {
  readonly tool: ToolType = 'claude_code';

  constructor(private readonly fileSystem: IFileSystem) {}

  getCapabilities(): ReaderCapabilities {
    return {
      tool: 'claude_code',
      supportsIncremental: true,
      supportsFiltering: true,
      supportsModelTracking: true,
      supportsPlanningMode: true,
    };
  }

  async isAvailable(): Promise<boolean> {
    const claudePath = this.fileSystem.join(
      this.fileSystem.homedir(),
      '.claude',
      'projects'
    );
    return this.fileSystem.exists(claudePath);
  }

  async readSessions(options: ReaderOptions = {}): Promise<SessionReaderResult> {
    const sessions: SessionData[] = [];
    const errors: SessionReaderError[] = [];

    const claudePath = this.fileSystem.join(
      this.fileSystem.homedir(),
      '.claude',
      'projects'
    );

    // Check if Claude projects directory exists
    const exists = await this.fileSystem.exists(claudePath);
    if (!exists) {
      return {
        sessions: [],
        tool: 'claude_code',
        totalFound: 0,
        filtered: 0,
        errors: [],
      };
    }

    // Read all project directories
    const projects = await this.fileSystem.readdir(claudePath);

    console.log(`[ClaudeSessionReader] Found ${projects.length} project folders`);

    for (const project of projects) {
      if (!project.isDirectory) continue;

      // Check if folder name contains ignored patterns
      // Folder names like "C--Users-97254-AppData-Local-Temp-devark-hooks"
      // should be skipped if they contain "devark-hooks", "programs-cursor", etc.
      if (this.shouldIgnoreProjectFolder(project.name)) {
        console.log(`[ClaudeSessionReader] ❌ SKIPPING ignored folder: ${project.name}`);
        continue; // Skip entire folder if it matches ignored patterns
      }

      console.log(`[ClaudeSessionReader] ✅ READING folder: ${project.name}`);

      const projectPath = this.fileSystem.join(claudePath, project.name);
      const files = await this.fileSystem.readdir(projectPath);
      // Filter: only .jsonl files, exclude agent session files (agent-*.jsonl)
      const logFiles = files.filter(
        (f) => f.isFile && f.name.endsWith('.jsonl') && !f.name.startsWith('agent-')
      );

      console.log(`[ClaudeSessionReader]   Found ${logFiles.length} non-agent session files in ${project.name}`);

      let skippedByFileDate = 0;
      let skippedByQuickTimestamp = 0;
      let skippedBySessionTimestamp = 0;
      let addedCount = 0;

      for (const file of logFiles) {
        const filePath = this.fileSystem.join(projectPath, file.name);

        try {
          // Check file creation/modification time for quick filtering
          if (options.since) {
            const stat = await this.fileSystem.stat(filePath);
            // Include file if EITHER created today OR modified today
            const fileCreationTime = stat.ctime;
            const isCreatedRecently = fileCreationTime >= options.since;
            const isModifiedRecently = stat.mtime >= options.since;

            if (!isCreatedRecently && !isModifiedRecently) {
              skippedByFileDate++;
              continue;
            }

            // Quick timestamp check from file head
            const quickTimestamp = await this.quickExtractTimestamp(filePath);
            if (quickTimestamp && quickTimestamp < options.since) {
              skippedByQuickTimestamp++;
              continue;
            }
          }

          // Parse the session file
          const session = await this.parseSessionFile(filePath, project.name, file.name);

          if (session) {
            // Apply filters
            if (options.since && session.timestamp < options.since) {
              skippedBySessionTimestamp++;
              continue;
            }

            if (options.projectPath) {
              const normalizedSession = session.projectPath.toLowerCase();
              const normalizedFilter = options.projectPath.toLowerCase();
              if (!normalizedSession.startsWith(normalizedFilter)) {
                continue;
              }
            }

            sessions.push(session);
            addedCount++;

            if (options.limit && sessions.length >= options.limit) {
              break;
            }
          }
        } catch (error) {
          errors.push({
            path: filePath,
            error: error instanceof Error ? error.message : String(error),
            recoverable: true,
          });
        }
      }

      console.log(`[ClaudeSessionReader]   Date filtering results for ${project.name}:`);
      console.log(`[ClaudeSessionReader]     - Skipped by file date (neither created nor modified today): ${skippedByFileDate}`);
      console.log(`[ClaudeSessionReader]     - Skipped by quick timestamp: ${skippedByQuickTimestamp}`);
      console.log(`[ClaudeSessionReader]     - Skipped by session timestamp: ${skippedBySessionTimestamp}`);
      console.log(`[ClaudeSessionReader]     - Added to result: ${addedCount}`);

      if (options.limit && sessions.length >= options.limit) {
        break;
      }
    }

    // Sort by timestamp
    sessions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    console.log(`[ClaudeSessionReader] ✅ FINAL: Returning ${sessions.length} sessions after all filtering`);

    return {
      sessions,
      tool: 'claude_code',
      totalFound: sessions.length,
      filtered: sessions.length,
      errors,
    };
  }

  async getSessionById(id: string): Promise<SessionData | null> {
    const result = await this.readSessions();
    return result.sessions.find((s) => s.claudeSessionId === id) || null;
  }

  /**
   * Get session details (messages, highlights, etc.) for a specific session.
   * On-demand loading for when full session data is needed.
   * @param id Session ID in format "projectDir/fileName/sessionId"
   */
  async getSessionDetails(id: string): Promise<SessionDetails | null> {
    // Parse the composite ID: "projectDir/fileName/sessionId"
    const parts = id.split('/');
    if (parts.length < 3) {
      return null;
    }

    const projectDirName = parts[0];
    const fileName = parts[1];

    const claudePath = this.fileSystem.join(
      this.fileSystem.homedir(),
      '.claude',
      'projects'
    );

    const filePath = this.fileSystem.join(claudePath, projectDirName, fileName);

    try {
      const exists = await this.fileSystem.exists(filePath);
      if (!exists) {
        return null;
      }

      const session = await this.parseSessionFile(filePath, projectDirName, fileName);
      if (!session) {
        return null;
      }

      return {
        messages: session.messages,
        highlights: session.highlights,
        modelInfo: session.modelInfo,
        planningModeInfo: session.planningModeInfo,
        fileContext: session.metadata?.editedFiles || session.metadata?.languages,
      };
    } catch {
      return null;
    }
  }

  async getProjectPaths(): Promise<string[]> {
    const result = await this.readSessions();
    const paths = new Set<string>();
    for (const session of result.sessions) {
      paths.add(session.projectPath);
    }
    return Array.from(paths);
  }

  async getSessionCount(options?: ReaderOptions): Promise<number> {
    const result = await this.readSessions(options);
    return result.sessions.length;
  }

  /**
   * Fast index-only scan of Claude Code sessions.
   * Reads only metadata (timestamps, duration, project) without parsing full message content.
   * This is much faster than readSessions() for counting and filtering.
   */
  async readSessionIndex(options: ReaderOptions = {}): Promise<SessionIndex[]> {
    const indices: SessionIndex[] = [];

    const claudePath = this.fileSystem.join(
      this.fileSystem.homedir(),
      '.claude',
      'projects'
    );

    const exists = await this.fileSystem.exists(claudePath);
    if (!exists) {
      return [];
    }

    const projects = await this.fileSystem.readdir(claudePath);

    for (const project of projects) {
      if (!project.isDirectory) continue;
      if (this.shouldIgnoreProjectFolder(project.name)) continue;

      const projectPath = this.fileSystem.join(claudePath, project.name);
      const files = await this.fileSystem.readdir(projectPath);
      const logFiles = files.filter(
        (f) => f.isFile && f.name.endsWith('.jsonl') && !f.name.startsWith('agent-')
      );

      for (const file of logFiles) {
        const filePath = this.fileSystem.join(projectPath, file.name);

        try {
          // Quick file date check
          if (options.since) {
            const stat = await this.fileSystem.stat(filePath);
            if (stat.ctime < options.since && stat.mtime < options.since) {
              continue;
            }
          }

          // Quick index extraction (reads only first ~4KB of file)
          const index = await this.quickExtractSessionIndex(filePath, project.name, file.name);

          if (index) {
            // Apply timestamp filter
            if (options.since && index.timestamp < options.since) {
              continue;
            }

            // Apply project path filter
            if (options.projectPath) {
              const normalizedSession = index.projectPath.toLowerCase();
              const normalizedFilter = options.projectPath.toLowerCase();
              if (!normalizedSession.startsWith(normalizedFilter)) {
                continue;
              }
            }

            indices.push(index);

            if (options.limit && indices.length >= options.limit) {
              break;
            }
          }
        } catch {
          // Skip files that can't be read
          continue;
        }
      }

      if (options.limit && indices.length >= options.limit) {
        break;
      }
    }

    // Sort by timestamp (most recent first)
    indices.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return indices;
  }

  /**
   * Quick extraction of session index from file head.
   * Reads only first ~4KB to get metadata and count messages without full parsing.
   */
  private async quickExtractSessionIndex(
    filePath: string,
    projectDirName: string,
    fileName: string
  ): Promise<SessionIndex | null> {
    try {
      // Read file head for metadata extraction
      const headBuffer = await this.fileSystem.readFileHead(filePath, 4096);
      const headContent = headBuffer.toString('utf-8');
      const headLines = headContent.split('\n').filter(l => l.trim());

      let sessionId: string | null = null;
      let cwd: string | null = null;
      let firstTimestamp: Date | null = null;

      // Parse head lines for metadata
      for (const line of headLines) {
        try {
          const data = JSON.parse(line) as ClaudeLogEntry;
          if (!sessionId && data.sessionId) sessionId = data.sessionId;
          if (!cwd && data.cwd) cwd = data.cwd;
          if (!firstTimestamp && data.timestamp) {
            firstTimestamp = new Date(data.timestamp);
          }
          // Break early if we have all we need from the head
          if (sessionId && cwd && firstTimestamp) break;
        } catch {
          continue;
        }
      }

      if (!sessionId || !cwd || !firstTimestamp) {
        return null;
      }

      // Count actual user prompts (not tool results or assistant messages)
      const fullContent = await this.fileSystem.readFile(filePath);
      const allLines = fullContent.trim().split('\n').filter(l => l.trim());

      let promptCount = 0;
      let lastTimestamp = firstTimestamp;

      // Parse all lines to count actual user prompts and get last timestamp
      for (let i = 0; i < allLines.length; i++) {
        try {
          const data = JSON.parse(allLines[i]) as ClaudeLogEntry;

          // Track last timestamp
          if (data.timestamp) {
            lastTimestamp = new Date(data.timestamp);
          }

          // Only count actual user prompts (not tool results)
          if (data.message?.role === 'user') {
            const content = this.filterImageContent(data.message.content);
            if (this.isActualUserPrompt(content)) {
              promptCount++;
            }
          }
        } catch {
          continue;
        }
      }

      // Calculate duration in seconds
      const durationSeconds = Math.floor(
        (lastTimestamp.getTime() - firstTimestamp.getTime()) / 1000
      );

      // Extract workspace name from path
      const workspaceName = cwd.split(/[/\\]/).filter(Boolean).pop() || 'Unknown Project';

      return {
        id: `${projectDirName}/${fileName}/${sessionId}`,
        source: 'claude_code',
        timestamp: firstTimestamp,
        duration: durationSeconds,
        projectPath: cwd,
        workspaceName,
        promptCount,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a project folder name should be ignored based on path patterns
   * Uses substring matching since folder names encode paths with dashes
   * Examples:
   * - "C--Users-97254-AppData-Local-Temp-devark-hooks" contains "devark-hooks" → IGNORE
   * - "C--Users-97254-AppData-Local-Programs-cursor" contains "Programs-cursor" → IGNORE
   * - "c--vibelog-vibe-log-cursor-extentstion" → KEEP (legitimate project)
   */
  private shouldIgnoreProjectFolder(folderName: string): boolean {
    const lowerFolder = folderName.toLowerCase();

    // Check for specific ignored patterns (case-insensitive substring match)
    // Note: Folder names encode paths with dashes, so we match substrings
    // Example: "C--Users-97254-AppData-Local-Temp-devark-analysis" contains "devark-analysis"
    const ignoredSubstrings = [
      'devark-hooks',
      'devark-temp',
      'devark-analysis',         // AI analysis temp directory
      'temp-prompt-analysis',
      'temp-standup',
      'temp-productivity-report',
      'programs-cursor',
      'appdata-local-programs-cursor',
    ];

    return ignoredSubstrings.some(pattern => lowerFolder.includes(pattern));
  }

  /**
   * Quick extraction of timestamp from first few lines of file.
   * Optimization to skip files before full parsing.
   */
  private async quickExtractTimestamp(filePath: string): Promise<Date | null> {
    try {
      const buffer = await this.fileSystem.readFileHead(filePath, 2048);
      const content = buffer.toString('utf-8');
      const lines = content.split('\n').slice(0, 10);

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const data = JSON.parse(line) as ClaudeLogEntry;
          if (data.timestamp) {
            return new Date(data.timestamp);
          }
        } catch {
          continue;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Parse a single JSONL session file.
   */
  private async parseSessionFile(
    filePath: string,
    projectDirName: string,
    fileName: string
  ): Promise<SessionData | null> {
    const content = await this.fileSystem.readFile(filePath);
    const lines = content.trim().split('\n');

    if (lines.length === 0 || (lines.length === 1 && !lines[0].trim())) {
      return null;
    }

    const messages: Message[] = [];
    let metadata: {
      id: string;
      projectPath: string;
      timestamp: Date;
      claudeSessionId: string;
    } | null = null;
    const editedFiles = new Set<string>();

    // Model tracking
    const modelStats: Record<string, number> = {};
    let lastModel: string | null = null;
    let modelSwitches = 0;

    // Planning mode tracking
    const exitPlanTimestamps: Date[] = [];

    // Git branch tracking
    let gitBranch: string | undefined;

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const data: ClaudeLogEntry = JSON.parse(line);

        // Extract git branch from first entry that has it
        if (!gitBranch && data.gitBranch) {
          gitBranch = data.gitBranch;
        }

        // Extract session metadata from first valid entry
        if (!metadata && data.sessionId && data.cwd && data.timestamp) {
          metadata = {
            id: `${projectDirName}/${fileName}/${data.sessionId}`,
            projectPath: data.cwd,
            timestamp: new Date(data.timestamp),
            claudeSessionId: data.sessionId,
          };
        }

        // Extract messages and track model usage
        if (data.message && data.timestamp) {
          // Check for ExitPlanMode tool usage in message content
          if (data.message.content && Array.isArray(data.message.content)) {
            for (const item of data.message.content) {
              if (
                item &&
                typeof item === 'object' &&
                item.type === 'tool_use' &&
                item.name === 'ExitPlanMode'
              ) {
                exitPlanTimestamps.push(new Date(data.timestamp));
              }
            }
          }

          // Filter images from content
          const filteredContent = this.filterImageContent(data.message.content);

          messages.push({
            role: data.message.role as 'user' | 'assistant',
            content: filteredContent,
            timestamp: new Date(data.timestamp),
          });

          // Track model usage for assistant messages
          if (data.message.role === 'assistant' && data.message.model) {
            modelStats[data.message.model] =
              (modelStats[data.message.model] || 0) + 1;

            // Track model switches
            if (lastModel && lastModel !== data.message.model) {
              modelSwitches++;
            }
            lastModel = data.message.model;
          }
        }

        // Track edited files from toolUseResult
        if (
          data.toolUseResult &&
          (data.toolUseResult.type === 'create' ||
            data.toolUseResult.type === 'update')
        ) {
          const editedFilePath = data.toolUseResult.filePath;
          if (editedFilePath) {
            editedFiles.add(editedFilePath);
          }
        }
      } catch {
        // Skip invalid JSON lines
        continue;
      }
    }

    // Need both metadata and at least some messages
    if (!metadata || messages.length === 0) {
      return null;
    }

    // Calculate duration
    const durationResult = calculateDuration(messages);

    // Extract languages from edited files
    const languages = extractLanguagesFromPaths(Array.from(editedFiles));

    // Prepare model info
    let modelInfo: ModelUsageStats | undefined;
    if (Object.keys(modelStats).length > 0) {
      const models = Object.keys(modelStats);
      const primaryModel = models.reduce((a, b) =>
        modelStats[a] > modelStats[b] ? a : b
      );

      modelInfo = {
        models,
        primaryModel,
        modelUsage: modelStats,
        modelSwitches,
      };
    }

    // Prepare planning mode info
    let planningModeInfo: PlanningModeInfo | undefined;
    if (exitPlanTimestamps.length > 0) {
      planningModeInfo = {
        hasPlanningMode: true,
        planningCycles: exitPlanTimestamps.length,
        exitPlanTimestamps,
      };
    }

    // Build session metadata with actual file paths
    const sessionMetadata: SessionMetadata = {
      files_edited: editedFiles.size,
      languages,
      editedFiles: Array.from(editedFiles),  // Preserve actual file paths
    };

    // Build source file info
    const sourceFile: SourceFileInfo = {
      claudeProjectPath: this.fileSystem.join(
        this.fileSystem.homedir(),
        '.claude',
        'projects',
        projectDirName
      ),
      sessionFile: fileName,
    };

    // Extract conversation highlights for summarization
    const highlights = extractHighlights(messages, {}, CLAUDE_SKIP_PATTERNS);

    // Calculate token usage for context window tracking
    const tokenUsageResult = calculateTokenUsage(messages, modelInfo?.primaryModel ?? undefined);
    const tokenUsage: TokenUsageData = {
      inputTokens: tokenUsageResult.inputTokens,
      outputTokens: tokenUsageResult.outputTokens,
      totalTokens: tokenUsageResult.totalTokens,
      contextUtilization: tokenUsageResult.contextUtilization,
    };

    return {
      ...metadata,
      messages,
      duration: durationResult.durationSeconds,
      tool: 'claude_code',
      metadata: sessionMetadata,
      modelInfo,
      planningModeInfo,
      gitBranch,
      sourceFile,
      highlights,
      tokenUsage,
    };
  }

  /**
   * Check if message content is an actual user prompt (not tool result)
   * Tool results contain [Tool result] or [Tool: ...] markers
   */
  private isActualUserPrompt(content: string): boolean {
    // Skip empty content
    if (!content || content.trim().length === 0) {
      return false;
    }
    // Skip tool results (these are machine-generated, not user prompts)
    if (content.startsWith('[Tool result]') || content.startsWith('[Tool:')) {
      return false;
    }
    // Skip if content is only tool markers
    const toolMarkerPattern = /^\s*\[Tool[^\]]*\]\s*$/;
    if (toolMarkerPattern.test(content)) {
      return false;
    }
    return true;
  }

  /**
   * Filter image content from messages.
   * Images are large base64 strings that we don't need.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private filterImageContent(content: string | any[]): string {
    if (typeof content === 'string') {
      return content;
    }

    if (!Array.isArray(content)) {
      return String(content);
    }

    // Filter out image blocks and join text
    const textParts: string[] = [];
    let imageCount = 0;

    for (const item of content) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      if (item.type === 'image' || item.type === 'image_url') {
        imageCount++;
      } else if (item.type === 'text' && item.text) {
        textParts.push(item.text);
      } else if (item.type === 'tool_use') {
        textParts.push(`[Tool: ${item.name || 'unknown'}]`);
      } else if (item.type === 'tool_result') {
        textParts.push(`[Tool result]`);
      }
    }

    if (imageCount > 0) {
      textParts.push(`[${imageCount} image attachment${imageCount > 1 ? 's' : ''}]`);
    }

    return textParts.join('\n');
  }

}
