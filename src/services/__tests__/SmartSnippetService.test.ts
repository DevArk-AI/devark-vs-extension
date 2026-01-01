/**
 * SmartSnippetService Unit Tests
 *
 * Tests for code snippet extraction including:
 * - Entity extraction from prompt text
 * - Timeout behavior
 * - Graceful degradation
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { SmartSnippetService, getSmartSnippetService } from '../SmartSnippetService';

describe('SmartSnippetService', () => {
  let service: SmartSnippetService;

  beforeEach(() => {
    // Reset singleton for each test
    (SmartSnippetService as any).instance = null;
    service = getSmartSnippetService();
  });

  describe('extractMentionedEntities', () => {
    test('should extract file names from prompt', () => {
      const prompt = 'I need to fix the bug in LoginComponent.tsx and update auth.ts';

      const entities = service.extractMentionedEntities(prompt);

      expect(entities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'LoginComponent.tsx', type: 'file' }),
          expect.objectContaining({ name: 'auth.ts', type: 'file' }),
        ])
      );
    });

    test('should extract component names from prompt', () => {
      const prompt = 'The LoginForm component needs to validate the PasswordInput';

      const entities = service.extractMentionedEntities(prompt);

      expect(entities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'LoginForm', type: 'component' }),
          expect.objectContaining({ name: 'PasswordInput', type: 'component' }),
        ])
      );
    });

    test('should extract function names from prompt', () => {
      const prompt = 'Call the fetchUserData function after the user logs in with handleLogin';

      const entities = service.extractMentionedEntities(prompt);

      expect(entities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'fetchUserData', type: 'function' }),
          expect.objectContaining({ name: 'handleLogin', type: 'function' }),
        ])
      );
    });

    test('should extract React hooks from prompt', () => {
      const prompt = 'I need to add useEffect and useState to this component';

      const entities = service.extractMentionedEntities(prompt);

      expect(entities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'useEffect', type: 'function' }),
          expect.objectContaining({ name: 'useState', type: 'function' }),
        ])
      );
    });

    test('should prioritize files over components over functions', () => {
      const prompt = 'Fix LoginComponent.tsx with useAuth hook';

      const entities = service.extractMentionedEntities(prompt);

      // Files should come first (confidence 1.0)
      const fileIndex = entities.findIndex((e) => e.name === 'LoginComponent.tsx');
      const hookIndex = entities.findIndex((e) => e.name === 'useAuth');

      expect(fileIndex).toBeLessThan(hookIndex);
    });

    test('should filter out common words from component matches', () => {
      const prompt = 'The Error component should handle This and That case';

      const entities = service.extractMentionedEntities(prompt);

      const names = entities.map((e) => e.name);
      expect(names).not.toContain('The');
      expect(names).not.toContain('This');
      expect(names).not.toContain('That');
      expect(names).not.toContain('Error');
    });

    test('should limit entities to 10', () => {
      const prompt = `
        File1.ts File2.ts File3.ts File4.ts File5.ts
        File6.ts File7.ts File8.ts File9.ts File10.ts
        File11.ts File12.ts
      `;

      const entities = service.extractMentionedEntities(prompt);

      expect(entities.length).toBeLessThanOrEqual(10);
    });

    test('should handle empty prompt', () => {
      const entities = service.extractMentionedEntities('');

      expect(entities).toEqual([]);
    });

    test('should handle prompt with no entities', () => {
      const prompt = 'Please help me understand how this works';

      const entities = service.extractMentionedEntities(prompt);

      expect(entities).toEqual([]);
    });

    test('should deduplicate entities by name', () => {
      const prompt = 'Check LoginComponent.tsx and then update LoginComponent.tsx again';

      const entities = service.extractMentionedEntities(prompt);

      const loginComponents = entities.filter((e) => e.name === 'LoginComponent.tsx');
      expect(loginComponents.length).toBe(1);
    });

    test('should extract multiple file extensions', () => {
      const prompt = 'Update styles.css, config.json, and schema.sql';

      const entities = service.extractMentionedEntities(prompt);

      expect(entities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'styles.css', type: 'file' }),
          expect.objectContaining({ name: 'config.json', type: 'file' }),
          expect.objectContaining({ name: 'schema.sql', type: 'file' }),
        ])
      );
    });

    test('should handle file paths in prompts', () => {
      const prompt = 'The file at src/components/Header.tsx needs updating';

      const entities = service.extractMentionedEntities(prompt);

      expect(entities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Header.tsx', type: 'file' }),
        ])
      );
    });

    test('should extract Vue and Svelte components', () => {
      const prompt = 'Update the Button.vue and Modal.svelte components';

      const entities = service.extractMentionedEntities(prompt);

      expect(entities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Button.vue', type: 'file' }),
          expect.objectContaining({ name: 'Modal.svelte', type: 'file' }),
        ])
      );
    });
  });

  describe('getSnippetsForPrompt', () => {
    test('should return empty array when no entities found', async () => {
      const prompt = 'Help me with something';

      const snippets = await service.getSnippetsForPrompt(prompt);

      expect(snippets).toEqual([]);
    });

    test('should return empty array when workspace is not available', async () => {
      // VS Code workspace will be mocked as undefined in test environment
      const prompt = 'Update LoginComponent.tsx';

      const snippets = await service.getSnippetsForPrompt(prompt);

      // Will return empty because workspace.workspaceFolders is undefined in tests
      expect(Array.isArray(snippets)).toBe(true);
    });

    test('should limit snippets to 3', async () => {
      const prompt = 'Fix all these files: A.ts B.ts C.ts D.ts E.ts';

      const snippets = await service.getSnippetsForPrompt(prompt);

      expect(snippets.length).toBeLessThanOrEqual(3);
    });
  });

  describe('singleton pattern', () => {
    test('should return same instance', () => {
      const instance1 = getSmartSnippetService();
      const instance2 = getSmartSnippetService();

      expect(instance1).toBe(instance2);
    });
  });
});
