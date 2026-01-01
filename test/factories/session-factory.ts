/**
 * Session Factory
 *
 * Builder pattern for creating test sessions with fluent API.
 */

import type {
  SessionData,
  Message,
  ToolType,
  ModelUsageStats,
  PlanningModeInfo,
  SessionMetadata,
  SourceFileInfo,
} from '../../src/types';

/**
 * Builder for creating test sessions
 */
export class SessionBuilder {
  private session: Partial<SessionData> = {};
  private messageBuilder: Message[] = [];

  constructor() {
    // Set sensible defaults
    this.session = {
      id: 'session-' + Math.random().toString(36).slice(2, 10),
      projectPath: '/home/user/project',
      timestamp: new Date(),
      tool: 'claude_code',
      duration: 3600,
      metadata: {
        files_edited: 0,
        languages: [],
      },
    };
  }

  /**
   * Static factory for creating a builder
   */
  static create(): SessionBuilder {
    return new SessionBuilder();
  }

  /**
   * Set the session ID
   */
  withId(id: string): SessionBuilder {
    this.session.id = id;
    return this;
  }

  /**
   * Set the project path
   */
  withProjectPath(path: string): SessionBuilder {
    this.session.projectPath = path;
    return this;
  }

  /**
   * Set the timestamp
   */
  withTimestamp(timestamp: Date): SessionBuilder {
    this.session.timestamp = timestamp;
    return this;
  }

  /**
   * Set the tool type
   */
  withTool(tool: ToolType): SessionBuilder {
    this.session.tool = tool;
    return this;
  }

  /**
   * Set the duration in seconds
   */
  withDuration(seconds: number): SessionBuilder {
    this.session.duration = seconds;
    return this;
  }

  /**
   * Set the duration in minutes (convenience method)
   */
  withDurationMinutes(minutes: number): SessionBuilder {
    this.session.duration = minutes * 60;
    return this;
  }

  /**
   * Set the Claude session ID
   */
  withClaudeSessionId(id: string): SessionBuilder {
    this.session.claudeSessionId = id;
    return this;
  }

  /**
   * Set the git branch
   */
  withGitBranch(branch: string): SessionBuilder {
    this.session.gitBranch = branch;
    return this;
  }

  /**
   * Set session metadata
   */
  withMetadata(metadata: SessionMetadata): SessionBuilder {
    this.session.metadata = metadata;
    return this;
  }

  /**
   * Add files edited count
   */
  withFilesEdited(count: number): SessionBuilder {
    this.session.metadata = {
      ...this.session.metadata,
      files_edited: count,
      languages: this.session.metadata?.languages ?? [],
    };
    return this;
  }

  /**
   * Add languages
   */
  withLanguages(languages: string[]): SessionBuilder {
    this.session.metadata = {
      ...this.session.metadata,
      files_edited: this.session.metadata?.files_edited ?? 0,
      languages,
    };
    return this;
  }

  /**
   * Set model info
   */
  withModelInfo(modelInfo: ModelUsageStats): SessionBuilder {
    this.session.modelInfo = modelInfo;
    return this;
  }

  /**
   * Quick model setup
   */
  withModel(model: string): SessionBuilder {
    this.session.modelInfo = {
      models: [model],
      primaryModel: model,
      modelUsage: { [model]: 1 },
      modelSwitches: 0,
    };
    return this;
  }

  /**
   * Set planning mode info
   */
  withPlanningMode(info: PlanningModeInfo): SessionBuilder {
    this.session.planningModeInfo = info;
    return this;
  }

  /**
   * Quick planning mode setup
   */
  withPlanningCycles(cycles: number): SessionBuilder {
    this.session.planningModeInfo = {
      hasPlanningMode: cycles > 0,
      planningCycles: cycles,
      exitPlanTimestamps: Array(cycles)
        .fill(null)
        .map((_, i) => new Date(Date.now() + i * 600000)),
    };
    return this;
  }

  /**
   * Set source file info
   */
  withSourceFile(info: SourceFileInfo): SessionBuilder {
    this.session.sourceFile = info;
    return this;
  }

  /**
   * Add a single message
   */
  withMessage(message: Message): SessionBuilder {
    this.messageBuilder.push(message);
    return this;
  }

  /**
   * Add a user message
   */
  withUserMessage(content: string, timestamp?: Date): SessionBuilder {
    this.messageBuilder.push({
      role: 'user',
      content,
      timestamp: timestamp ?? new Date(),
    });
    return this;
  }

  /**
   * Add an assistant message
   */
  withAssistantMessage(content: string, timestamp?: Date): SessionBuilder {
    this.messageBuilder.push({
      role: 'assistant',
      content,
      timestamp: timestamp ?? new Date(),
    });
    return this;
  }

  /**
   * Add multiple messages
   */
  withMessages(messages: Message[]): SessionBuilder {
    this.messageBuilder.push(...messages);
    return this;
  }

  /**
   * Generate a conversation with alternating messages
   */
  withConversation(messageCount: number, startTime?: Date): SessionBuilder {
    const start = startTime ?? this.session.timestamp ?? new Date();
    for (let i = 0; i < messageCount; i++) {
      const timestamp = new Date(start.getTime() + i * 60000);
      this.messageBuilder.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i + 1}`,
        timestamp,
      });
    }
    return this;
  }

  /**
   * Build the final session
   */
  build(): SessionData {
    return {
      id: this.session.id!,
      projectPath: this.session.projectPath!,
      timestamp: this.session.timestamp!,
      messages: this.messageBuilder.length > 0 ? this.messageBuilder : [],
      duration: this.session.duration!,
      tool: this.session.tool!,
      metadata: this.session.metadata,
      modelInfo: this.session.modelInfo,
      planningModeInfo: this.session.planningModeInfo,
      gitBranch: this.session.gitBranch,
      claudeSessionId: this.session.claudeSessionId,
      sourceFile: this.session.sourceFile,
    };
  }
}

/**
 * Convenience function for quick session creation
 */
export function session(): SessionBuilder {
  return SessionBuilder.create();
}
