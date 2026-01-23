/**
 * Tests for prompt-utils module
 */

import { describe, it, expect } from 'vitest';
import { isActualUserPrompt, countActualUserPrompts, detectSlashCommand } from '../prompt-utils';

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

describe('detectSlashCommand', () => {
  describe('valid slash commands', () => {
    it('should detect simple slash commands', () => {
      const result = detectSlashCommand('/commit');
      expect(result.isSlashCommand).toBe(true);
      expect(result.commandName).toBe('commit');
      expect(result.arguments).toBeUndefined();
    });

    it('should detect slash commands with arguments', () => {
      const result = detectSlashCommand('/work-on-item VIB-123');
      expect(result.isSlashCommand).toBe(true);
      expect(result.commandName).toBe('work-on-item');
      expect(result.arguments).toBe('VIB-123');
    });

    it('should detect slash commands with multiple arguments', () => {
      const result = detectSlashCommand('/commit with multiple arguments here');
      expect(result.isSlashCommand).toBe(true);
      expect(result.commandName).toBe('commit');
      expect(result.arguments).toBe('with multiple arguments here');
    });

    it('should detect kebab-case commands', () => {
      const result = detectSlashCommand('/kebab-case-command');
      expect(result.isSlashCommand).toBe(true);
      expect(result.commandName).toBe('kebab-case-command');
    });

    it('should detect snake_case commands', () => {
      const result = detectSlashCommand('/snake_case_command');
      expect(result.isSlashCommand).toBe(true);
      expect(result.commandName).toBe('snake_case_command');
    });

    it('should detect camelCase commands', () => {
      const result = detectSlashCommand('/camelCase');
      expect(result.isSlashCommand).toBe(true);
      expect(result.commandName).toBe('camelCase');
    });

    it('should detect UPPERCASE commands', () => {
      const result = detectSlashCommand('/UPPERCASE');
      expect(result.isSlashCommand).toBe(true);
      expect(result.commandName).toBe('UPPERCASE');
    });

    it('should detect single character commands', () => {
      const result = detectSlashCommand('/a');
      expect(result.isSlashCommand).toBe(true);
      expect(result.commandName).toBe('a');
    });

    it('should detect commands with numbers', () => {
      const result = detectSlashCommand('/test123');
      expect(result.isSlashCommand).toBe(true);
      expect(result.commandName).toBe('test123');
    });

    it('should detect namespaced commands with colons', () => {
      const result = detectSlashCommand('/bmad:bmad-custom:workflows:quiz-master');
      expect(result.isSlashCommand).toBe(true);
      expect(result.commandName).toBe('bmad:bmad-custom:workflows:quiz-master');
    });

    it('should detect simple namespaced commands', () => {
      const result = detectSlashCommand('/skill:sub-skill');
      expect(result.isSlashCommand).toBe(true);
      expect(result.commandName).toBe('skill:sub-skill');
    });

    it('should detect multi-level namespaces', () => {
      const result = detectSlashCommand('/a:b:c:d');
      expect(result.isSlashCommand).toBe(true);
      expect(result.commandName).toBe('a:b:c:d');
    });

    it('should detect namespaced commands with arguments', () => {
      const result = detectSlashCommand('/bmad:workflow:create my-project');
      expect(result.isSlashCommand).toBe(true);
      expect(result.commandName).toBe('bmad:workflow:create');
      expect(result.arguments).toBe('my-project');
    });
  });

  describe('whitespace handling', () => {
    it('should trim leading whitespace', () => {
      const result = detectSlashCommand('  /commit');
      expect(result.isSlashCommand).toBe(true);
      expect(result.commandName).toBe('commit');
    });

    it('should trim trailing whitespace', () => {
      const result = detectSlashCommand('/commit  ');
      expect(result.isSlashCommand).toBe(true);
      expect(result.commandName).toBe('commit');
    });

    it('should trim arguments', () => {
      const result = detectSlashCommand('/work-on-item   VIB-123   ');
      expect(result.isSlashCommand).toBe(true);
      expect(result.arguments).toBe('VIB-123');
    });
  });

  describe('invalid slash commands', () => {
    it('should reject commands starting with numbers', () => {
      const result = detectSlashCommand('/123invalid');
      expect(result.isSlashCommand).toBe(false);
      expect(result.commandName).toBeUndefined();
    });

    it('should reject commands starting with hyphen', () => {
      const result = detectSlashCommand('/-invalid');
      expect(result.isSlashCommand).toBe(false);
    });

    it('should reject commands starting with underscore', () => {
      const result = detectSlashCommand('/_invalid');
      expect(result.isSlashCommand).toBe(false);
    });

    it('should reject slash followed by space', () => {
      const result = detectSlashCommand('/ space');
      expect(result.isSlashCommand).toBe(false);
    });

    it('should reject double slash', () => {
      const result = detectSlashCommand('//double');
      expect(result.isSlashCommand).toBe(false);
    });

    it('should reject regular prompts', () => {
      const result = detectSlashCommand('not a slash command');
      expect(result.isSlashCommand).toBe(false);
    });

    it('should reject prompts with slash in middle', () => {
      const result = detectSlashCommand('please run /commit for me');
      expect(result.isSlashCommand).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return false for empty string', () => {
      const result = detectSlashCommand('');
      expect(result.isSlashCommand).toBe(false);
    });

    it('should return false for whitespace only', () => {
      const result = detectSlashCommand('   ');
      expect(result.isSlashCommand).toBe(false);
    });

    it('should return false for null', () => {
      const result = detectSlashCommand(null as unknown as string);
      expect(result.isSlashCommand).toBe(false);
    });

    it('should return false for undefined', () => {
      const result = detectSlashCommand(undefined as unknown as string);
      expect(result.isSlashCommand).toBe(false);
    });

    it('should return false for just a slash', () => {
      const result = detectSlashCommand('/');
      expect(result.isSlashCommand).toBe(false);
    });
  });
});
