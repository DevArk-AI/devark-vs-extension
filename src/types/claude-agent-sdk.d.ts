declare module '@anthropic-ai/claude-agent-sdk' {
  export interface QueryOptions {
    maxTurns?: number;
    model?: string;
    disallowedTools?: string[];
    cwd?: string;
  }

  export interface MessageContent {
    type: string;
    text?: string;
  }

  export interface AssistantMessage {
    type: 'assistant';
    message?: {
      content?: MessageContent[];
    };
  }

  export interface ResultMessage {
    type: 'result';
    total_cost_usd?: number;
  }

  export type QueryMessage = AssistantMessage | ResultMessage | { type: string };

  export function query(params: {
    prompt: string;
    options?: QueryOptions;
  }): AsyncIterable<QueryMessage>;
}
