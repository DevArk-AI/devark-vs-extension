/**
 * Prompt Enhancer
 *
 * Automatically improves user prompts before sending to AI.
 * Adds missing context, clarifies ambiguous language, and
 * structures prompts for better results.
 *
 * Now extends BaseCopilotTool for common functionality.
 */

import { BaseCopilotTool, ProgressCallback, PromptContext } from './base-copilot-tool';
import { ILLMProvider } from '../llm/interfaces';

/**
 * Enhancement level configuration
 */
export type EnhancementLevel = 'light' | 'medium' | 'aggressive';

/**
 * Input for enhancement
 */
interface EnhancementInput {
  prompt: string;
  level: EnhancementLevel;
}

/**
 * Result of prompt enhancement
 */
export interface EnhancedPrompt {
  /** Original user prompt */
  original: string;

  /** Enhanced/improved version */
  enhanced: string;

  /** List of improvements made */
  improvements: string[];

  /** Level of enhancement applied */
  enhancementLevel: EnhancementLevel;
}

/**
 * Service for automatically enhancing user prompts
 */
export class PromptEnhancer extends BaseCopilotTool<EnhancementInput, EnhancedPrompt> {
  constructor(provider: ILLMProvider) {
    super(provider);
  }

  /**
   * Enhance a user prompt
   * @param context Optional context for more targeted enhancement
   */
  public async enhancePrompt(
    userPrompt: string,
    level: EnhancementLevel = 'medium',
    onProgress?: ProgressCallback,
    context?: PromptContext
  ): Promise<EnhancedPrompt> {
    try {
      // Validate first
      if (!userPrompt || userPrompt.trim().length === 0) {
        throw new Error('Prompt cannot be empty');
      }

      const input: EnhancementInput = { prompt: userPrompt, level };
      const result = await this.execute(input, onProgress, context);

      // Store original prompt in result
      return {
        ...result,
        original: userPrompt,
        enhancementLevel: level,
      };
    } catch (error) {
      console.error('[PromptEnhancer] Enhancement failed:', error);

      const errorMessage = error instanceof Error ? error.message : String(error);
      // Return original prompt with error explanation
      return {
        original: userPrompt,
        enhanced: userPrompt,
        improvements: [`Enhancement unavailable: ${errorMessage}`],
        enhancementLevel: level,
      };
    }
  }

  protected getToolName(): string {
    return 'PromptEnhancer';
  }

  protected buildPrompt(input: EnhancementInput, context?: PromptContext): string {
    const basePrompt = `You are a prompt enhancement assistant. Your task is to improve user prompts for better AI interactions.

CRITICAL: You MUST respond ONLY with valid JSON. No markdown, no explanations, no code blocks - just raw JSON.

General Guidelines:
- Preserve the user's original intent
- Add relevant context where missing
- Clarify ambiguous language
- Structure information logically
- Keep improvements proportional to the enhancement level
- Make prompts more specific and actionable

Required JSON format (respond with ONLY this structure, nothing else):
{"enhanced": "the improved prompt text", "improvements": ["improvement 1", "improvement 2"]}

List 2-4 specific improvements you made in the "improvements" array.`;

    const levelGuidance: Record<EnhancementLevel, string> = {
      light: `
Enhancement Level: LIGHT
- Make minimal changes
- Fix obvious clarity issues
- Add only critical missing information
- Keep the prompt's style and length similar
- Focus on quick wins without major restructuring`,

      medium: `
Enhancement Level: MEDIUM
- Make moderate improvements
- Add helpful context where beneficial
- Improve structure and organization
- Clarify ambiguous terms
- Add relevant technical details
- Balance between preserving style and improving effectiveness`,

      aggressive: `
Enhancement Level: AGGRESSIVE
- Make comprehensive improvements
- Add substantial context and background
- Fully restructure for optimal clarity
- Add all relevant technical specifications
- Break down complex requests into clear steps
- Include examples or expected formats
- Transform vague requests into detailed instructions`,
    };

    // Build context section if context is provided
    let contextSection = '';
    if (context) {
      const parts: string[] = [];

      if (context.goal) {
        parts.push(`USER'S SESSION GOAL: ${context.goal}`);
      }
      if (context.techStack?.length) {
        parts.push(`TECH STACK: ${context.techStack.join(', ')}`);
      }
      if (context.recentTopics?.length) {
        parts.push(`TOPICS ALREADY DISCUSSED: ${context.recentTopics.slice(0, 5).join(', ')}`);
      }
      if (context.codeSnippets?.length) {
        parts.push('RELEVANT CODE:\n' + context.codeSnippets
          .slice(0, 2)
          .map(s => `// ${s.filePath}\n${s.relevantCode.slice(0, 400)}`)
          .join('\n\n'));
      }

      // Session correspondence for better enhancement suggestions
      if (context.firstInteractions?.length) {
        const validFirst = context.firstInteractions.filter((i) => i?.prompt);
        if (validFirst.length) {
          const firstStr = validFirst.map((i, idx) =>
            `${idx + 1}. User: "${i.prompt.slice(0, 200)}"\n   AI: ${i.response?.slice(0, 200) || 'N/A'}`
          ).join('\n');
          parts.push(`SESSION START (first ${validFirst.length} exchanges):\n${firstStr}`);
        }
      }

      if (context.lastInteractions?.length) {
        const validLast = context.lastInteractions.filter((i) => i?.prompt);
        if (validLast.length) {
          const lastStr = validLast.map((i, idx) =>
            `${idx + 1}. User: "${i.prompt.slice(0, 200)}"\n   AI: ${i.response?.slice(0, 200) || 'N/A'}\n   Files: ${i.filesModified?.join(', ') || 'none'}`
          ).join('\n');
          parts.push(`RECENT EXCHANGES (last ${validLast.length}):\n${lastStr}`);
        }
      }

      if (parts.length > 0) {
        contextSection = `\n\nCONTEXT (use to make enhancement more relevant):\n${parts.join('\n\n')}`;
      }
    }

    return `${basePrompt}

${levelGuidance[input.level]}${contextSection}

Improve the following user prompt according to the ${input.level} enhancement level:

Original Prompt:
"${input.prompt}"

RESPOND WITH JSON ONLY: {"enhanced": "...", "improvements": ["...", "..."]}`;
  }

  protected parseResponse(content: string): EnhancedPrompt {
    const parsed = this.parseJSON<any>(content);

    // Validate required fields
    if (!parsed.enhanced || typeof parsed.enhanced !== 'string') {
      throw new Error('Missing or invalid "enhanced" field');
    }

    if (!Array.isArray(parsed.improvements)) {
      throw new Error('Missing or invalid "improvements" field');
    }

    // Filter improvements to only strings
    const improvements = parsed.improvements
      .filter((item: any) => typeof item === 'string' && item.length > 0);

    // Ensure we have at least one improvement explanation
    if (improvements.length === 0) {
      improvements.push('Prompt enhanced for better clarity and specificity');
    }

    return {
      original: '', // Will be set by enhancePrompt
      enhanced: parsed.enhanced.trim(),
      improvements,
      enhancementLevel: 'medium', // Will be set by enhancePrompt
    };
  }

  /**
   * Quick enhancement check - determines if a prompt would benefit from enhancement
   */
  public shouldEnhance(userPrompt: string): boolean {
    const prompt = userPrompt.trim();

    // Very short prompts likely need more detail
    if (prompt.length < 20) {
      return true;
    }

    // Very long prompts are probably already detailed
    if (prompt.length > 500) {
      return false;
    }

    // Check for common improvement indicators
    const indicators = {
      vague: /\b(something|stuff|thing|whatever|somehow)\b/i.test(prompt),
      tooGeneral: /\b(help|assist|do|make|fix)\b/i.test(prompt) && prompt.length < 50,
      lacksPunctuation: !/[.!?]/.test(prompt),
      singleWord: prompt.split(/\s+/).length < 3,
      noContext: !/\b(file|project|function|class|component|feature|error|bug|in|at|for|with)\b/i.test(prompt),
    };

    // Enhancement recommended if 2+ indicators are present
    const indicatorCount = Object.values(indicators).filter(Boolean).length;
    return indicatorCount >= 2;
  }

  /**
   * Get enhancement suggestions without actually enhancing
   */
  public getEnhancementSuggestions(userPrompt: string): string[] {
    const suggestions: string[] = [];
    const prompt = userPrompt.trim();

    if (prompt.length < 20) {
      suggestions.push('Add more details about what you want to achieve');
    }

    if (!/\?/.test(prompt) && !/\b(create|add|implement|fix|update|refactor|write|generate)\b/i.test(prompt)) {
      suggestions.push('Make your request more specific - what action should be taken?');
    }

    if (!/\b(file|function|class|component|module|feature)\b/i.test(prompt)) {
      suggestions.push('Specify which files, functions, or components are involved');
    }

    if (!/\b(because|since|for|to|so that)\b/i.test(prompt)) {
      suggestions.push('Explain why you need this - it helps provide better context');
    }

    if (prompt.split(/\s+/).length < 5) {
      suggestions.push('Expand your prompt with more context and requirements');
    }

    return suggestions.length > 0
      ? suggestions
      : ['Your prompt looks good! No major enhancements needed.'];
  }
}
