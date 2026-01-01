/**
 * ContextExtractor - Session Context Extraction for Co-Pilot V2
 *
 * Responsibilities:
 * - Extract tech stack from prompts
 * - Track key decisions
 * - Identify entities (files, components)
 * - Store in session context
 * - Build full contextual improvement context (Workstream A)
 */

import { getSessionManager } from './SessionManagerService';
import { SessionContext, PromptRecord, Session } from './types/session-types';
import { getSmartSnippetService } from './SmartSnippetService';
import { getContextWeightCalculator } from './ContextWeightCalculator';
import { getGoalService, GoalStatus } from './GoalService';
import {
  ContextualImprovementContext,
  SmartSnippet,
  RecentPromptContext,
} from './types/context-types';

/**
 * Extracted entity from prompt
 */
export interface ExtractedEntity {
  type: 'file' | 'component' | 'function' | 'class' | 'variable' | 'concept';
  name: string;
  mentions: number;
  firstMentioned: Date;
  lastMentioned: Date;
}

/**
 * Key decision extracted from prompts
 */
export interface KeyDecision {
  description: string;
  timestamp: Date;
  relatedEntities: string[];
  importance: 'high' | 'medium' | 'low';
}

/**
 * Full context extraction result
 * Note: entities are converted to string[] to match SessionContext
 * ExtractedEntity[] is used internally before mapping to names
 */
export interface ExtractedContext extends SessionContext {
  decisions: KeyDecision[];
}

/**
 * Tech stack patterns
 */
const TECH_PATTERNS: Record<string, RegExp[]> = {
  // Languages
  'TypeScript': [/\btypescript\b/i, /\.tsx?\b/, /\bts\b/i],
  'JavaScript': [/\bjavascript\b/i, /\.jsx?\b/, /\bjs\b/i],
  'Python': [/\bpython\b/i, /\.py\b/, /\bpip\b/i],
  'Rust': [/\brust\b/i, /\.rs\b/, /\bcargo\b/i],
  'Go': [/\bgolang\b/i, /\.go\b/],
  'Java': [/\bjava\b/i, /\.java\b/],
  'C#': [/\bc#\b/i, /\.cs\b/, /\bdotnet\b/i],

  // Frameworks
  'React': [/\breact\b/i, /\buseState\b/, /\buseEffect\b/, /\bJSX\b/i],
  'Vue': [/\bvue\b/i, /\bvuex\b/i, /\bnuxt\b/i],
  'Angular': [/\bangular\b/i, /\bngModule\b/i],
  'Svelte': [/\bsvelte\b/i, /\bsveltekit\b/i],
  'Next.js': [/\bnext\.?js\b/i, /\bgetServerSideProps\b/, /\bgetStaticProps\b/],
  'Express': [/\bexpress\b/i, /\bapp\.get\b/, /\bapp\.post\b/],
  'Django': [/\bdjango\b/i],
  'FastAPI': [/\bfastapi\b/i],
  'Flask': [/\bflask\b/i],

  // Databases
  'PostgreSQL': [/\bpostgres(?:ql)?\b/i, /\bpg\b/],
  'MySQL': [/\bmysql\b/i],
  'MongoDB': [/\bmongodb?\b/i, /\bmongoose\b/i],
  'Redis': [/\bredis\b/i],
  'SQLite': [/\bsqlite\b/i],

  // Tools
  'Docker': [/\bdocker\b/i, /\bcontainer\b/i, /\bDockerfile\b/i],
  'Kubernetes': [/\bkubernetes\b/i, /\bk8s\b/i],
  'Git': [/\bgit\b/i, /\bcommit\b/, /\bbranch\b/, /\bmerge\b/],
  'npm': [/\bnpm\b/i, /\bpackage\.json\b/],
  'Webpack': [/\bwebpack\b/i],
  'Vite': [/\bvite\b/i],

  // Cloud
  'AWS': [/\baws\b/i, /\bs3\b/i, /\blambda\b/i, /\bec2\b/i],
  'Cloudflare': [/\bcloudflare\b/i, /\bworkers?\b/i],
  'Vercel': [/\bvercel\b/i],
  'Supabase': [/\bsupabase\b/i],

  // State Management
  'Redux': [/\bredux\b/i, /\buseSelector\b/, /\buseDispatch\b/],
  'Zustand': [/\bzustand\b/i],
  'MobX': [/\bmobx\b/i],

  // Testing
  'Jest': [/\bjest\b/i, /\bdescribe\b.*\bit\b/],
  'Vitest': [/\bvitest\b/i],
  'Playwright': [/\bplaywright\b/i],
  'Cypress': [/\bcypress\b/i],

  // APIs
  'GraphQL': [/\bgraphql\b/i, /\bquery\b.*\bmutation\b/],
  'REST': [/\brest\b/i, /\bapi\b/i],
  'tRPC': [/\btrpc\b/i],
};

/**
 * Entity patterns
 */
const ENTITY_PATTERNS = {
  file: /(?:^|[\s"'`])([a-zA-Z_][\w-]*\.(?:ts|tsx|js|jsx|py|rs|go|java|cs|vue|svelte|css|scss|html|json|yaml|yml|md|sql))\b/gi,
  component: /\b([A-Z][a-zA-Z0-9]*(?:Component|Page|View|Modal|Button|Form|Card|List|Item|Header|Footer|Nav|Menu|Panel|Dialog|Drawer|Sidebar|Tab|Table|Row|Cell|Input|Select|Checkbox|Radio|Toggle|Switch|Badge|Tag|Chip|Avatar|Icon|Logo|Image|Link|Tooltip|Popover|Dropdown|Alert|Toast|Snackbar|Progress|Spinner|Loader|Skeleton)?)\b/g,
  function: /\b((?:use|get|set|is|has|can|should|will|fetch|load|save|update|delete|create|remove|add|handle|on|process)[A-Z][a-zA-Z0-9]*)\b/g,
  class: /\bclass\s+([A-Z][a-zA-Z0-9]*)/g,
  variable: /\b(const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g,
};

/**
 * Decision indicator patterns
 */
const DECISION_INDICATORS = [
  /(?:I(?:'ll| will) use|let'?s use|going with|chose|decided on|picked)\s+(.+?)(?:\.|$)/i,
  /(?:should|will|going to)\s+(?:implement|add|create|build|use)\s+(.+?)(?:\.|$)/i,
  /(?:changed|switched|migrated)\s+(?:from .+ )?to\s+(.+?)(?:\.|$)/i,
  /(?:instead of .+,?\s*)?(?:use|using)\s+(.+?)(?:\s+for|\.|$)/i,
];

/**
 * ContextExtractor - Extract context from session prompts
 */
export class ContextExtractor {
  private static instance: ContextExtractor | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): ContextExtractor {
    if (!ContextExtractor.instance) {
      ContextExtractor.instance = new ContextExtractor();
    }
    return ContextExtractor.instance;
  }

  /**
   * Extract full context from current session
   */
  public extractSessionContext(): ExtractedContext | null {
    const sessionManager = getSessionManager();
    const session = sessionManager.getActiveSession();

    if (!session || session.prompts.length === 0) {
      return null;
    }

    const prompts = session.prompts;
    const combinedText = prompts.map(p => p.text).join('\n');

    const techStack = this.extractTechStack(combinedText);
    const entities = this.extractEntities(prompts);
    const decisions = this.extractDecisions(prompts);
    const topics = this.extractTopics(prompts);

    return {
      techStack,
      entities: entities.map(e => e.name),
      keyDecisions: decisions.map(d => d.description),
      topics,
      lastUpdated: new Date(),
      decisions,
    };
  }

  /**
   * Extract tech stack from text
   */
  public extractTechStack(text: string): string[] {
    const detected: Set<string> = new Set();

    for (const [tech, patterns] of Object.entries(TECH_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          detected.add(tech);
          break;
        }
      }
    }

    return Array.from(detected);
  }

  /**
   * Extract entities from prompts
   */
  public extractEntities(prompts: PromptRecord[]): ExtractedEntity[] {
    const entityMap = new Map<string, ExtractedEntity>();

    for (const prompt of prompts) {
      const text = prompt.text;

      // Extract files
      let match;
      const filePattern = new RegExp(ENTITY_PATTERNS.file);
      while ((match = filePattern.exec(text)) !== null) {
        this.addEntity(entityMap, 'file', match[1], prompt.timestamp);
      }

      // Extract components
      const componentPattern = new RegExp(ENTITY_PATTERNS.component);
      while ((match = componentPattern.exec(text)) !== null) {
        if (match[1].length > 2 && !this.isCommonWord(match[1])) {
          this.addEntity(entityMap, 'component', match[1], prompt.timestamp);
        }
      }

      // Extract functions
      const functionPattern = new RegExp(ENTITY_PATTERNS.function);
      while ((match = functionPattern.exec(text)) !== null) {
        this.addEntity(entityMap, 'function', match[1], prompt.timestamp);
      }

      // Extract classes
      const classPattern = new RegExp(ENTITY_PATTERNS.class);
      while ((match = classPattern.exec(text)) !== null) {
        this.addEntity(entityMap, 'class', match[1], prompt.timestamp);
      }
    }

    // Sort by mentions (most mentioned first)
    return Array.from(entityMap.values())
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 20); // Keep top 20 entities
  }

  /**
   * Extract key decisions from prompts
   */
  public extractDecisions(prompts: PromptRecord[]): KeyDecision[] {
    const decisions: KeyDecision[] = [];

    for (const prompt of prompts) {
      for (const pattern of DECISION_INDICATORS) {
        const match = prompt.text.match(pattern);
        if (match && match[1]) {
          decisions.push({
            description: match[1].trim(),
            timestamp: prompt.timestamp,
            relatedEntities: this.findRelatedEntities(prompt.text),
            importance: this.assessImportance(match[1]),
          });
        }
      }
    }

    // Deduplicate similar decisions
    const uniqueDecisions = this.deduplicateDecisions(decisions);

    return uniqueDecisions.slice(0, 10); // Keep top 10 decisions
  }

  /**
   * Extract main topics from prompts
   */
  public extractTopics(prompts: PromptRecord[]): string[] {
    const topicCounts = new Map<string, number>();

    // Topic keywords
    const topicKeywords = [
      'authentication', 'authorization', 'api', 'database', 'frontend', 'backend',
      'testing', 'deployment', 'performance', 'security', 'ui', 'ux', 'design',
      'refactoring', 'debugging', 'error', 'feature', 'bug', 'integration',
      'migration', 'configuration', 'documentation', 'logging', 'monitoring',
      'caching', 'pagination', 'validation', 'routing', 'state', 'styling',
    ];

    for (const prompt of prompts) {
      const lowerText = prompt.text.toLowerCase();

      for (const keyword of topicKeywords) {
        if (lowerText.includes(keyword)) {
          topicCounts.set(keyword, (topicCounts.get(keyword) || 0) + 1);
        }
      }
    }

    // Sort by count and return top topics
    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);
  }

  /**
   * Get context summary for display
   */
  public getContextSummary(): string | null {
    const context = this.extractSessionContext();
    if (!context) return null;

    const parts: string[] = [];

    if (context.techStack.length > 0) {
      parts.push(`Tech: ${context.techStack.slice(0, 3).join(', ')}`);
    }

    if (context.topics.length > 0) {
      parts.push(`Topics: ${context.topics.slice(0, 3).join(', ')}`);
    }

    if (context.keyDecisions.length > 0) {
      parts.push(`${context.keyDecisions.length} key decisions`);
    }

    return parts.length > 0 ? parts.join(' | ') : null;
  }

  // ========================================
  // Contextual Improvement Context (Workstream A)
  // ========================================

  /**
   * Build full contextual improvement context for prompt enhancement
   *
   * Performance budget: 600ms total
   * - Entity extraction: 50ms (regex, sync)
   * - File search: 200ms (VS Code findFiles)
   * - Snippet fetch: 300ms (file reads)
   * - Context assembly: 50ms
   */
  public async buildImprovementContext(
    currentPrompt: string
  ): Promise<ContextualImprovementContext> {
    const snippetService = getSmartSnippetService();
    const weightCalculator = getContextWeightCalculator();
    const sessionManager = getSessionManager();
    const goalService = getGoalService();

    // Parallel fetch with timeout for snippets
    const [snippets, session, goalStatus] = await Promise.all([
      this.fetchSnippetsWithFallback(snippetService, currentPrompt),
      Promise.resolve(sessionManager.getActiveSession()),
      Promise.resolve(goalService.getGoalStatus()),
    ]);

    // Calculate dynamic weights
    const weights = weightCalculator.calculateWeights({
      hasGoal: goalStatus.hasGoal,
      promptCount: session?.prompts.length ?? 0,
      hasTechStack: this.extractTechStack(currentPrompt).length > 0,
      repeatedTopic: this.findRepeatedTopic(session),
    });

    // Extract tech stack from prompt
    const techStack = this.extractTechStack(currentPrompt);
    if (techStack.length === 0) {
      console.log('[ContextExtractor] No tech stack detected in prompt. Prompt must mention technologies (e.g., "React", "TypeScript", "API") to detect tech stack.');
    } else {
      console.log(`[ContextExtractor] Tech stack detected:`, techStack.join(', '));
    }

    // Build context object
    return {
      goal: {
        text: goalStatus.goalText ?? null,
        progress: this.calculateGoalProgress(goalStatus, session),
        relevantToPrompt: this.isGoalRelevant(currentPrompt, goalStatus.goalText),
      },
      recentHistory: {
        lastPrompts: this.getRecentPrompts(session, 5),
        alreadyAskedAbout: this.extractTopicsFromSession(session),
        sessionDuration: this.getSessionDuration(session),
      },
      technical: {
        techStack,
        codeSnippets: snippets,
        recentlyModifiedFiles: [], // TODO: track from git in future
      },
      weights,
    };
  }

  /**
   * Fetch snippets with timeout fallback
   */
  private async fetchSnippetsWithFallback(
    snippetService: ReturnType<typeof getSmartSnippetService>,
    prompt: string
  ): Promise<SmartSnippet[]> {
    try {
      return await Promise.race([
        snippetService.getSnippetsForPrompt(prompt),
        this.timeout(500, []),
      ]);
    } catch (error) {
      console.warn('[ContextExtractor] Snippet fetch failed:', error);
      return [];
    }
  }

  /**
   * Get recent prompts with metadata
   */
  private getRecentPrompts(
    session: Session | null,
    count: number
  ): RecentPromptContext[] {
    if (!session || session.prompts.length === 0) {
      return [];
    }

    return session.prompts.slice(0, count).map((p) => ({
      text: p.text,
      wasAddressed: this.wasPromptAddressed(p),
      topics: this.extractTopicsFromText(p.text),
    }));
  }

  /**
   * Check if a prompt was likely addressed (has a score)
   */
  private wasPromptAddressed(prompt: PromptRecord): boolean {
    // A prompt is considered "addressed" if it has a decent score
    // This is a heuristic - in practice would check if AI responded
    return prompt.score >= 5;
  }

  /**
   * Extract topics from a single text
   */
  private extractTopicsFromText(text: string): string[] {
    const topicKeywords = [
      'authentication', 'authorization', 'api', 'database', 'frontend', 'backend',
      'testing', 'deployment', 'performance', 'security', 'ui', 'ux', 'design',
      'refactoring', 'debugging', 'error', 'feature', 'bug', 'integration',
    ];

    const lowerText = text.toLowerCase();
    return topicKeywords.filter((keyword) => lowerText.includes(keyword));
  }

  /**
   * Extract all topics from session prompts
   */
  private extractTopicsFromSession(session: Session | null): string[] {
    if (!session) return [];
    return this.extractTopics(session.prompts);
  }

  /**
   * Get session duration in minutes
   */
  private getSessionDuration(session: Session | null): number {
    if (!session) return 0;
    const start = session.startTime.getTime();
    const end = session.lastActivityTime.getTime();
    return Math.round((end - start) / 60000);
  }

  /**
   * Calculate goal completion progress (0-1)
   */
  private calculateGoalProgress(
    goalStatus: GoalStatus,
    session: Session | null
  ): number {
    if (!goalStatus.hasGoal || !session) {
      return 0;
    }

    if (goalStatus.isCompleted) {
      return 1;
    }

    // Estimate progress based on prompts since goal was set
    // More prompts = closer to completion (rough heuristic)
    const promptsSinceGoal = goalStatus.promptsSinceGoalSet;
    const estimatedPromptsForCompletion = 10;
    return Math.min(0.9, promptsSinceGoal / estimatedPromptsForCompletion);
  }

  /**
   * Check if goal is relevant to current prompt
   */
  private isGoalRelevant(prompt: string, goalText?: string): boolean {
    if (!goalText) return false;

    const promptLower = prompt.toLowerCase();
    const goalLower = goalText.toLowerCase();

    // Extract keywords from goal
    const goalWords = goalLower.split(/\s+/).filter((w) => w.length > 3);

    // Check if any goal keywords appear in prompt
    return goalWords.some((word) => promptLower.includes(word));
  }

  /**
   * Find a topic that has been repeated 3+ times
   */
  private findRepeatedTopic(session: Session | null): string | undefined {
    if (!session || session.prompts.length < 3) {
      return undefined;
    }

    const topicCounts = new Map<string, number>();
    const recentPrompts = session.prompts.slice(0, 10);

    for (const prompt of recentPrompts) {
      const topics = this.extractTopicsFromText(prompt.text);
      for (const topic of topics) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }

    // Find topic with 3+ occurrences
    for (const [topic, count] of topicCounts) {
      if (count >= 3) {
        return topic;
      }
    }

    return undefined;
  }

  /**
   * Create a timeout promise
   */
  private timeout<T>(ms: number, fallback: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(fallback), ms));
  }

  // ========================================
  // Private Helpers
  // ========================================

  private addEntity(
    map: Map<string, ExtractedEntity>,
    type: ExtractedEntity['type'],
    name: string,
    timestamp: Date
  ): void {
    const key = `${type}:${name.toLowerCase()}`;
    const existing = map.get(key);

    if (existing) {
      existing.mentions++;
      existing.lastMentioned = timestamp;
    } else {
      map.set(key, {
        type,
        name,
        mentions: 1,
        firstMentioned: timestamp,
        lastMentioned: timestamp,
      });
    }
  }

  private isCommonWord(word: string): boolean {
    const common = [
      'The', 'This', 'That', 'These', 'Those', 'Here', 'There',
      'What', 'When', 'Where', 'Which', 'Who', 'How', 'Why',
      'Yes', 'No', 'Not', 'Can', 'Could', 'Would', 'Should',
      'May', 'Might', 'Must', 'Will', 'Shall',
      'Error', 'Warning', 'Info', 'Debug', 'Log',
    ];
    return common.includes(word);
  }

  private findRelatedEntities(text: string): string[] {
    const entities: string[] = [];

    // Find file names
    const fileMatch = text.match(/[\w-]+\.[a-z]+/gi);
    if (fileMatch) entities.push(...fileMatch.slice(0, 2));

    // Find component names
    const componentMatch = text.match(/[A-Z][a-zA-Z]+(?:Component|Page|View)?/g);
    if (componentMatch) entities.push(...componentMatch.slice(0, 2));

    return [...new Set(entities)];
  }

  private assessImportance(decision: string): 'high' | 'medium' | 'low' {
    const highIndicators = ['architecture', 'database', 'security', 'auth', 'api', 'migrate'];
    const lowIndicators = ['style', 'format', 'rename', 'comment'];

    const lower = decision.toLowerCase();

    if (highIndicators.some(i => lower.includes(i))) return 'high';
    if (lowIndicators.some(i => lower.includes(i))) return 'low';
    return 'medium';
  }

  private deduplicateDecisions(decisions: KeyDecision[]): KeyDecision[] {
    const seen = new Set<string>();
    return decisions.filter(d => {
      const key = d.description.toLowerCase().slice(0, 30);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

/**
 * Get ContextExtractor singleton
 */
export function getContextExtractor(): ContextExtractor {
  return ContextExtractor.getInstance();
}
