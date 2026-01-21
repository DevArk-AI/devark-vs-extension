/**
 * Tests for prompt-utils module
 */

import { describe, it, expect } from 'vitest';
import { isActualUserPrompt, countActualUserPrompts } from '../prompt-utils';

describe('isActualUserPrompt', () => {
  it('should return true for regular user prompts', () => {
    expect(isActualUserPrompt('Fix the bug in the login page')).toBe(true);
    expect(isActualUserPrompt('Please add a new feature')).toBe(true);
    expect(isActualUserPrompt('What does this function do?')).toBe(true);
  });

  it('should return false for empty content', () => {
    expect(isActualUserPrompt('')).toBe(false);
    expect(isActualUserPrompt('   ')).toBe(false);
    expect(isActualUserPrompt('\n\t')).toBe(false);
  });

  it('should return false for null/undefined content', () => {
    expect(isActualUserPrompt(null as unknown as string)).toBe(false);
    expect(isActualUserPrompt(undefined as unknown as string)).toBe(false);
  });

  it('should return false for tool result markers', () => {
    expect(isActualUserPrompt('[Tool result] Success')).toBe(false);
    expect(isActualUserPrompt('[Tool: Edit] File updated')).toBe(false);
    expect(isActualUserPrompt('[Tool: Read] Content...')).toBe(false);
  });

  it('should return false for content that is only a tool marker', () => {
    expect(isActualUserPrompt('[Tool result]')).toBe(false);
    expect(isActualUserPrompt('  [Tool: unknown]  ')).toBe(false);
    expect(isActualUserPrompt('\n[Tool result]\n')).toBe(false);
  });

  it('should return true for content containing tool markers but with other text', () => {
    // If the content has tool markers but also has other text, it might be user content
    expect(isActualUserPrompt('Please run [Tool: test] for me')).toBe(true);
  });
});

describe('countActualUserPrompts', () => {
  it('should count only user messages that are actual prompts', () => {
    const messages = [
      { role: 'user', content: 'Fix the bug' },
      { role: 'assistant', content: 'I will fix it' },
      { role: 'user', content: 'Thanks!' },
    ];
    expect(countActualUserPrompts(messages)).toBe(2);
  });

  it('should exclude tool results from user messages', () => {
    const messages = [
      { role: 'user', content: 'Fix the bug' },
      { role: 'user', content: '[Tool result] Success' },
      { role: 'user', content: '[Tool: Edit] File updated' },
      { role: 'user', content: 'What else?' },
    ];
    expect(countActualUserPrompts(messages)).toBe(2);
  });

  it('should return 0 for empty messages array', () => {
    expect(countActualUserPrompts([])).toBe(0);
  });

  it('should exclude assistant messages', () => {
    const messages = [
      { role: 'assistant', content: 'Hello' },
      { role: 'assistant', content: 'How can I help?' },
    ];
    expect(countActualUserPrompts(messages)).toBe(0);
  });

  it('should exclude empty user messages', () => {
    const messages = [
      { role: 'user', content: '' },
      { role: 'user', content: '   ' },
      { role: 'user', content: 'Actual prompt' },
    ];
    expect(countActualUserPrompts(messages)).toBe(1);
  });

  it('should work with system messages present', () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'How are you?' },
    ];
    expect(countActualUserPrompts(messages)).toBe(2);
  });
});
