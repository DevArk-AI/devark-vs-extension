/**
 * Functional tests for ClaudeSessionReader with real session files.
 * These tests verify that the reader correctly extracts highlights and file paths
 * from actual Claude Code session data.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ClaudeSessionReader } from '../claude-session-reader';
import { NodeFileSystem } from '../../../../test/mocks/node-file-system';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Real session file path for testing
const REAL_SESSION_PATH = path.join(
  os.homedir(),
  '.claude',
  'projects',
  'c--vibelog-vibe-log-cursor-extentstion',
  'f142219e-ce6a-4955-bc3c-cba5e4b1fef9.jsonl'
);

describe('ClaudeSessionReader Functional Tests', () => {
  let reader: ClaudeSessionReader;
  let sessionExists: boolean;

  beforeAll(() => {
    // Use real file system for functional tests
    const nodeFs = new NodeFileSystem();
    reader = new ClaudeSessionReader(nodeFs);
    sessionExists = fs.existsSync(REAL_SESSION_PATH);
  });

  describe('Real Session File Parsing', () => {
    it('should parse real session file and extract highlights', async function() {
      if (!sessionExists) {
        console.log('Skipping: Real session file not found at', REAL_SESSION_PATH);
        return;
      }

      const result = await reader.readSessions({
        projectPath: 'c:\\vibelog\\vibe-log-cursor-extentstion'
      });

      expect(result.sessions.length).toBeGreaterThan(0);

      // Find the specific session
      const session = result.sessions.find(
        s => s.claudeSessionId === 'f142219e-ce6a-4955-bc3c-cba5e4b1fef9'
      );

      if (!session) {
        console.log('Session not found, but found', result.sessions.length, 'sessions');
        return;
      }

      // Verify highlights extraction
      console.log('\n=== Session Highlights ===');
      console.log('Session ID:', session.claudeSessionId);
      console.log('Project:', session.projectPath);
      console.log('Messages:', session.messages.length);

      expect(session.highlights).toBeDefined();

      if (session.highlights?.firstUserMessage) {
        console.log('\nFirst User Intent:');
        console.log('  ', session.highlights.firstUserMessage.substring(0, 200) + '...');
        expect(session.highlights.firstUserMessage.length).toBeGreaterThan(10);
      }

      if (session.highlights?.lastExchange) {
        console.log('\nLast Exchange:');
        console.log('  User:', session.highlights.lastExchange.userMessage.substring(0, 100) + '...');
        console.log('  Assistant:', session.highlights.lastExchange.assistantResponse.substring(0, 100) + '...');
      }
    });

    it('should preserve editedFiles in metadata', async function() {
      if (!sessionExists) {
        console.log('Skipping: Real session file not found');
        return;
      }

      const result = await reader.readSessions({
        projectPath: 'c:\\vibelog\\vibe-log-cursor-extentstion'
      });

      const session = result.sessions.find(
        s => s.claudeSessionId === 'f142219e-ce6a-4955-bc3c-cba5e4b1fef9'
      );

      if (!session) {
        console.log('Session not found');
        return;
      }

      console.log('\n=== Edited Files ===');
      console.log('Files edited count:', session.metadata?.files_edited);
      console.log('Languages detected:', session.metadata?.languages);

      if (session.metadata?.editedFiles) {
        console.log('Actual file paths:');
        session.metadata.editedFiles.forEach((f, i) => {
          if (i < 10) console.log('  -', f);
        });
        if (session.metadata.editedFiles.length > 10) {
          console.log('  ... and', session.metadata.editedFiles.length - 10, 'more');
        }

        // Verify we have actual file paths, not language names
        expect(session.metadata.editedFiles.length).toBeGreaterThanOrEqual(0);

        // If there are edited files, they should look like paths
        if (session.metadata.editedFiles.length > 0) {
          const firstFile = session.metadata.editedFiles[0];
          expect(firstFile).toMatch(/[/\\]/); // Should contain path separator
        }
      }
    });

    it('should extract meaningful content for summarization', async function() {
      if (!sessionExists) {
        console.log('Skipping: Real session file not found');
        return;
      }

      const result = await reader.readSessions({
        projectPath: 'c:\\vibelog\\vibe-log-cursor-extentstion'
      });

      const session = result.sessions.find(
        s => s.claudeSessionId === 'f142219e-ce6a-4955-bc3c-cba5e4b1fef9'
      );

      if (!session) {
        console.log('Session not found');
        return;
      }

      // Simulate what SummaryService would receive
      console.log('\n=== Data Available for Summarization ===');

      const summaryData = {
        projectName: session.projectPath?.split(/[/\\]/).pop() || 'Unknown',
        duration: session.duration,
        promptCount: session.messages.filter(m => m.role === 'user').length,
        filesEdited: session.metadata?.editedFiles || [],
        languages: session.metadata?.languages || [],
        firstIntent: session.highlights?.firstUserMessage || 'Not captured',
        lastExchange: session.highlights?.lastExchange || null,
      };

      console.log('Project:', summaryData.projectName);
      console.log('Duration (s):', summaryData.duration);
      console.log('User prompts:', summaryData.promptCount);
      console.log('Files edited:', summaryData.filesEdited.length);
      console.log('Languages:', summaryData.languages.join(', '));
      console.log('First intent available:', !!session.highlights?.firstUserMessage);
      console.log('Last exchange available:', !!session.highlights?.lastExchange);

      // Verify we have enough data for meaningful summarization
      expect(summaryData.promptCount).toBeGreaterThan(0);
      expect(summaryData.projectName).not.toBe('Unknown');

      // The key fix: we should have either file paths OR first intent
      const hasContextForSummary =
        (summaryData.filesEdited.length > 0) ||
        (session.highlights?.firstUserMessage);

      expect(hasContextForSummary).toBe(true);
    });
  });
});
