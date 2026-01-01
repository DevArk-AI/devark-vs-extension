/**
 * Sample Messages
 *
 * Test fixtures for message-related tests.
 */

import type { Message } from '../../src/types';

/**
 * Create a simple message
 */
export function createMessage(
  role: 'user' | 'assistant' = 'user',
  content: string = 'Hello, world!',
  timestamp: Date = new Date()
): Message {
  return { role, content, timestamp };
}

/**
 * Create a conversation (alternating user/assistant messages)
 */
export function createConversation(
  messageCount: number = 4,
  startTime: Date = new Date('2024-01-01T10:00:00Z')
): Message[] {
  const messages: Message[] = [];
  for (let i = 0; i < messageCount; i++) {
    const timestamp = new Date(startTime.getTime() + i * 60000); // 1 minute apart
    messages.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: i % 2 === 0 ? `User message ${i + 1}` : `Assistant response ${i + 1}`,
      timestamp,
    });
  }
  return messages;
}

/**
 * Sample messages with various content types
 */
export const SAMPLE_MESSAGES = {
  simple: createMessage('user', 'How do I create a function?'),

  withCode: createMessage(
    'assistant',
    'Here is an example:\n```typescript\nfunction hello() {\n  console.log("Hello!");\n}\n```'
  ),

  withSensitiveData: createMessage(
    'user',
    'My API key is sk-abc123xyz and email is test@example.com'
  ),

  withPath: createMessage(
    'user',
    'Please edit /Users/johndoe/projects/secret-app/config.json'
  ),

  withMultipleCredentials: createMessage(
    'user',
    'Use sk-key1 for dev and sk-key2 for prod, database is postgres://user:pass@localhost/db'
  ),

  longMessage: createMessage(
    'assistant',
    'A'.repeat(10000) // 10KB message
  ),

  emptyContent: createMessage('user', ''),

  withNewlines: createMessage(
    'user',
    'Line 1\nLine 2\nLine 3\n\nLine 5 after blank'
  ),
};

/**
 * Sample conversations for different scenarios
 */
export const SAMPLE_CONVERSATIONS = {
  short: createConversation(2),
  medium: createConversation(10),
  long: createConversation(50),

  /**
   * Conversation with idle gaps (for duration calculation tests)
   */
  withIdleGaps: [
    createMessage('user', 'Start', new Date('2024-01-01T10:00:00Z')),
    createMessage('assistant', 'Response 1', new Date('2024-01-01T10:01:00Z')),
    createMessage('user', 'Question 2', new Date('2024-01-01T10:02:00Z')),
    createMessage('assistant', 'Response 2', new Date('2024-01-01T10:03:00Z')),
    // 30 minute gap (idle)
    createMessage('user', 'Back after break', new Date('2024-01-01T10:33:00Z')),
    createMessage('assistant', 'Welcome back', new Date('2024-01-01T10:34:00Z')),
  ],

  /**
   * Conversation spanning multiple hours (active time < elapsed time)
   */
  multiHour: [
    createMessage('user', 'Morning start', new Date('2024-01-01T09:00:00Z')),
    createMessage('assistant', 'Good morning', new Date('2024-01-01T09:01:00Z')),
    // 2 hour lunch break
    createMessage('user', 'Afternoon', new Date('2024-01-01T11:00:00Z')),
    createMessage('assistant', 'Welcome back', new Date('2024-01-01T11:01:00Z')),
    // 3 hour meeting
    createMessage('user', 'End of day', new Date('2024-01-01T14:00:00Z')),
    createMessage('assistant', 'Wrapping up', new Date('2024-01-01T14:05:00Z')),
  ],
};
