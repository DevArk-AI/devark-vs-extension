/**
 * Claude Session Reader Tests - TDD
 *
 * Tests written FIRST before implementation.
 * These tests should FAIL initially (RED phase).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeSessionReader } from '../claude-session-reader';
import { MockFileSystem } from '../../../../test/mocks/mock-file-system';
import type { ReaderOptions } from '../../../types';

// Sample JSONL content for testing
const SAMPLE_JSONL = {
  basic: `{"sessionId":"abc123","cwd":"/home/user/project","timestamp":"2024-01-15T10:00:00Z","gitBranch":"main"}
{"message":{"role":"user","content":"Hello"},"timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"assistant","content":"Hi there!","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:00:30Z"}
{"toolUseResult":{"type":"update","filePath":"/home/user/project/src/index.ts"}}`,

  withModelTracking: `{"sessionId":"model123","cwd":"/home/user/project","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"First message"},"timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"assistant","content":"Response 1","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:00:30Z"}
{"message":{"role":"user","content":"Second message"},"timestamp":"2024-01-15T10:01:00Z"}
{"message":{"role":"assistant","content":"Response 2","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:01:30Z"}
{"message":{"role":"user","content":"Third message"},"timestamp":"2024-01-15T10:02:00Z"}
{"message":{"role":"assistant","content":"Response 3","model":"claude-3-opus"},"timestamp":"2024-01-15T10:02:30Z"}`,

  withPlanningMode: `{"sessionId":"plan123","cwd":"/home/user/project","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"Plan a feature"},"timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"assistant","content":[{"type":"tool_use","name":"EnterPlanMode"}],"model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:01:00Z"}
{"message":{"role":"assistant","content":[{"type":"tool_use","name":"ExitPlanMode"}],"model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:05:00Z"}
{"message":{"role":"assistant","content":"Let me implement","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:06:00Z"}
{"message":{"role":"assistant","content":[{"type":"tool_use","name":"ExitPlanMode"}],"model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:10:00Z"}`,

  withMultipleFiles: `{"sessionId":"files123","cwd":"/home/user/project","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"Edit these files"},"timestamp":"2024-01-15T10:00:00Z"}
{"toolUseResult":{"type":"create","filePath":"/home/user/project/src/index.ts"}}
{"toolUseResult":{"type":"update","filePath":"/home/user/project/src/utils.ts"}}
{"toolUseResult":{"type":"update","filePath":"/home/user/project/src/app.py"}}
{"message":{"role":"assistant","content":"Done!","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:05:00Z"}`,

  withGitBranch: `{"sessionId":"git123","cwd":"/home/user/project","timestamp":"2024-01-15T10:00:00Z","gitBranch":"feature/new-feature"}
{"message":{"role":"user","content":"Hello"},"timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"assistant","content":"Hi!","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:00:30Z"}`,

  empty: '',

  invalidJson: `{"sessionId":"valid123","cwd":"/home/user/project","timestamp":"2024-01-15T10:00:00Z"}
not valid json at all
{"message":{"role":"user","content":"Still works"},"timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"assistant","content":"Yes!","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:00:30Z"}`,

  oldSession: `{"sessionId":"old123","cwd":"/home/user/project","timestamp":"2024-01-01T10:00:00Z"}
{"message":{"role":"user","content":"Old message"},"timestamp":"2024-01-01T10:00:00Z"}
{"message":{"role":"assistant","content":"Old response","model":"claude-3-5-sonnet"},"timestamp":"2024-01-01T10:00:30Z"}`,

  noMetadata: `{"message":{"role":"user","content":"Hello"},"timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"assistant","content":"Hi","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:00:30Z"}`,
};

describe('ClaudeSessionReader', () => {
  let fs: MockFileSystem;
  let reader: ClaudeSessionReader;

  beforeEach(() => {
    fs = new MockFileSystem();
    reader = new ClaudeSessionReader(fs);
  });

  describe('getCapabilities()', () => {
    it('returns correct capabilities for Claude Code', () => {
      const caps = reader.getCapabilities();
      expect(caps.tool).toBe('claude_code');
      expect(caps.supportsIncremental).toBe(true);
      expect(caps.supportsFiltering).toBe(true);
      expect(caps.supportsModelTracking).toBe(true);
      expect(caps.supportsPlanningMode).toBe(true);
    });
  });

  describe('tool property', () => {
    it('returns claude_code', () => {
      expect(reader.tool).toBe('claude_code');
    });
  });

  describe('isAvailable()', () => {
    it('returns true when ~/.claude/projects/ exists', async () => {
      fs.addDirectory('/home/user/.claude/projects');
      const result = await reader.isAvailable();
      expect(result).toBe(true);
    });

    it('returns false when ~/.claude/projects/ does not exist', async () => {
      const result = await reader.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('readSessions()', () => {
    describe('basic parsing', () => {
      it('parses JSONL with single session', async () => {
        setupBasicSession(fs);
        const result = await reader.readSessions();
        expect(result.sessions.length).toBe(1);
        expect(result.tool).toBe('claude_code');
        expect(result.totalFound).toBe(1);
        expect(result.errors).toHaveLength(0);
      });

      it('extracts session metadata (id, projectPath, timestamp, claudeSessionId)', async () => {
        setupBasicSession(fs);
        const result = await reader.readSessions();
        const session = result.sessions[0];

        expect(session.id).toBeDefined();
        expect(session.projectPath).toBe('/home/user/project');
        expect(session.timestamp).toBeInstanceOf(Date);
        expect(session.timestamp.toISOString()).toBe('2024-01-15T10:00:00.000Z');
        expect(session.claudeSessionId).toBe('abc123');
      });

      it('extracts messages with role, content, timestamp', async () => {
        setupBasicSession(fs);
        const result = await reader.readSessions();
        const session = result.sessions[0];

        expect(session.messages.length).toBe(2);
        expect(session.messages[0]).toEqual({
          role: 'user',
          content: 'Hello',
          timestamp: new Date('2024-01-15T10:00:00Z'),
        });
        expect(session.messages[1]).toEqual({
          role: 'assistant',
          content: 'Hi there!',
          timestamp: new Date('2024-01-15T10:00:30Z'),
        });
      });
    });

    describe('model tracking', () => {
      it('tracks model usage (models, primaryModel, modelUsage)', async () => {
        fs.addDirectory('/home/user/.claude/projects');
        fs.addDirectory('/home/user/.claude/projects/-home-user-project');
        fs.addFile(
          '/home/user/.claude/projects/-home-user-project/session-model.jsonl',
          SAMPLE_JSONL.withModelTracking
        );

        const result = await reader.readSessions();
        const session = result.sessions[0];

        expect(session.modelInfo).toBeDefined();
        expect(session.modelInfo!.models).toContain('claude-3-5-sonnet');
        expect(session.modelInfo!.models).toContain('claude-3-opus');
        expect(session.modelInfo!.primaryModel).toBe('claude-3-5-sonnet');
        expect(session.modelInfo!.modelUsage['claude-3-5-sonnet']).toBe(2);
        expect(session.modelInfo!.modelUsage['claude-3-opus']).toBe(1);
      });

      it('tracks model switches', async () => {
        fs.addDirectory('/home/user/.claude/projects');
        fs.addDirectory('/home/user/.claude/projects/-home-user-project');
        fs.addFile(
          '/home/user/.claude/projects/-home-user-project/session-model.jsonl',
          SAMPLE_JSONL.withModelTracking
        );

        const result = await reader.readSessions();
        const session = result.sessions[0];

        expect(session.modelInfo!.modelSwitches).toBe(1);
      });
    });

    describe('planning mode detection', () => {
      it('detects ExitPlanMode tool usage', async () => {
        fs.addDirectory('/home/user/.claude/projects');
        fs.addDirectory('/home/user/.claude/projects/-home-user-project');
        fs.addFile(
          '/home/user/.claude/projects/-home-user-project/session-plan.jsonl',
          SAMPLE_JSONL.withPlanningMode
        );

        const result = await reader.readSessions();
        const session = result.sessions[0];

        expect(session.planningModeInfo).toBeDefined();
        expect(session.planningModeInfo!.hasPlanningMode).toBe(true);
        expect(session.planningModeInfo!.planningCycles).toBe(2);
        expect(session.planningModeInfo!.exitPlanTimestamps).toHaveLength(2);
      });
    });

    describe('metadata extraction', () => {
      it('extracts git branch', async () => {
        fs.addDirectory('/home/user/.claude/projects');
        fs.addDirectory('/home/user/.claude/projects/-home-user-project');
        fs.addFile(
          '/home/user/.claude/projects/-home-user-project/session-git.jsonl',
          SAMPLE_JSONL.withGitBranch
        );

        const result = await reader.readSessions();
        const session = result.sessions[0];

        expect(session.gitBranch).toBe('feature/new-feature');
      });

      it('tracks edited files from toolUseResult', async () => {
        fs.addDirectory('/home/user/.claude/projects');
        fs.addDirectory('/home/user/.claude/projects/-home-user-project');
        fs.addFile(
          '/home/user/.claude/projects/-home-user-project/session-files.jsonl',
          SAMPLE_JSONL.withMultipleFiles
        );

        const result = await reader.readSessions();
        const session = result.sessions[0];

        expect(session.metadata).toBeDefined();
        expect(session.metadata!.files_edited).toBe(3);
      });

      it('extracts languages from edited files', async () => {
        fs.addDirectory('/home/user/.claude/projects');
        fs.addDirectory('/home/user/.claude/projects/-home-user-project');
        fs.addFile(
          '/home/user/.claude/projects/-home-user-project/session-files.jsonl',
          SAMPLE_JSONL.withMultipleFiles
        );

        const result = await reader.readSessions();
        const session = result.sessions[0];

        expect(session.metadata!.languages).toContain('TypeScript');
        expect(session.metadata!.languages).toContain('Python');
      });

      it('stores source file info', async () => {
        setupBasicSession(fs);
        const result = await reader.readSessions();
        const session = result.sessions[0];

        expect(session.sourceFile).toBeDefined();
        expect(session.sourceFile!.claudeProjectPath).toContain(
          '.claude/projects/-home-user-project'
        );
        expect(session.sourceFile!.sessionFile).toMatch(/session-.*\.jsonl/);
      });
    });

    describe('filtering', () => {
      it('filters by since date', async () => {
        fs.addDirectory('/home/user/.claude/projects');
        fs.addDirectory('/home/user/.claude/projects/-home-user-project');
        fs.addFile(
          '/home/user/.claude/projects/-home-user-project/session-old.jsonl',
          SAMPLE_JSONL.oldSession,
          new Date('2024-01-01T12:00:00Z')
        );
        fs.addFile(
          '/home/user/.claude/projects/-home-user-project/session-new.jsonl',
          SAMPLE_JSONL.basic,
          new Date('2024-01-15T12:00:00Z')
        );

        const options: ReaderOptions = {
          since: new Date('2024-01-10T00:00:00Z'),
        };
        const result = await reader.readSessions(options);

        expect(result.sessions.length).toBe(1);
        expect(result.sessions[0].claudeSessionId).toBe('abc123');
      });

      it('filters by projectPath', async () => {
        fs.addDirectory('/home/user/.claude/projects');
        fs.addDirectory('/home/user/.claude/projects/-home-user-project-a');
        fs.addDirectory('/home/user/.claude/projects/-home-user-project-b');
        fs.addFile(
          '/home/user/.claude/projects/-home-user-project-a/session.jsonl',
          `{"sessionId":"a123","cwd":"/home/user/project-a","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"Hello"},"timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"assistant","content":"Hi!","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:00:30Z"}`
        );
        fs.addFile(
          '/home/user/.claude/projects/-home-user-project-b/session.jsonl',
          `{"sessionId":"b123","cwd":"/home/user/project-b","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"Hello"},"timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"assistant","content":"Hi!","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:00:30Z"}`
        );

        const options: ReaderOptions = {
          projectPath: '/home/user/project-a',
        };
        const result = await reader.readSessions(options);

        expect(result.sessions.length).toBe(1);
        expect(result.sessions[0].projectPath).toBe('/home/user/project-a');
      });

      it('applies limit', async () => {
        fs.addDirectory('/home/user/.claude/projects');
        fs.addDirectory('/home/user/.claude/projects/-home-user-project');
        // Create 3 session files
        for (let i = 1; i <= 3; i++) {
          fs.addFile(
            `/home/user/.claude/projects/-home-user-project/session-${i}.jsonl`,
            `{"sessionId":"sess${i}","cwd":"/home/user/project","timestamp":"2024-01-${String(i).padStart(2, '0')}T10:00:00Z"}
{"message":{"role":"user","content":"Message ${i}"},"timestamp":"2024-01-${String(i).padStart(2, '0')}T10:00:00Z"}
{"message":{"role":"assistant","content":"Response ${i}","model":"claude-3-5-sonnet"},"timestamp":"2024-01-${String(i).padStart(2, '0')}T10:00:30Z"}`
          );
        }

        const options: ReaderOptions = { limit: 2 };
        const result = await reader.readSessions(options);

        expect(result.sessions.length).toBe(2);
      });
    });

    describe('error handling', () => {
      it('handles invalid JSON lines gracefully (skips them)', async () => {
        fs.addDirectory('/home/user/.claude/projects');
        fs.addDirectory('/home/user/.claude/projects/-home-user-project');
        fs.addFile(
          '/home/user/.claude/projects/-home-user-project/session.jsonl',
          SAMPLE_JSONL.invalidJson
        );

        const result = await reader.readSessions();

        expect(result.sessions.length).toBe(1);
        expect(result.sessions[0].messages.length).toBe(2);
      });

      it('returns empty array for empty files', async () => {
        fs.addDirectory('/home/user/.claude/projects');
        fs.addDirectory('/home/user/.claude/projects/-home-user-project');
        fs.addFile(
          '/home/user/.claude/projects/-home-user-project/session.jsonl',
          SAMPLE_JSONL.empty
        );

        const result = await reader.readSessions();

        expect(result.sessions.length).toBe(0);
      });

      it('returns empty array for files without session metadata', async () => {
        fs.addDirectory('/home/user/.claude/projects');
        fs.addDirectory('/home/user/.claude/projects/-home-user-project');
        fs.addFile(
          '/home/user/.claude/projects/-home-user-project/session.jsonl',
          SAMPLE_JSONL.noMetadata
        );

        const result = await reader.readSessions();

        expect(result.sessions.length).toBe(0);
      });
    });

    describe('duration calculation', () => {
      it('calculates session duration from message timestamps', async () => {
        setupBasicSession(fs);
        const result = await reader.readSessions();
        const session = result.sessions[0];

        // 30 seconds between messages
        expect(session.duration).toBe(30);
      });
    });
  });

  describe('getSessionById()', () => {
    it('finds session by ID', async () => {
      setupBasicSession(fs);
      const session = await reader.getSessionById('abc123');

      expect(session).not.toBeNull();
      expect(session!.claudeSessionId).toBe('abc123');
    });

    it('returns null for unknown ID', async () => {
      setupBasicSession(fs);
      const session = await reader.getSessionById('unknown-id');

      expect(session).toBeNull();
    });
  });

  describe('getProjectPaths()', () => {
    it('returns unique project paths', async () => {
      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/-home-user-project-a');
      fs.addDirectory('/home/user/.claude/projects/-home-user-project-b');
      fs.addFile(
        '/home/user/.claude/projects/-home-user-project-a/session.jsonl',
        `{"sessionId":"a123","cwd":"/home/user/project-a","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"Hello"},"timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"assistant","content":"Hi!","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:00:30Z"}`
      );
      fs.addFile(
        '/home/user/.claude/projects/-home-user-project-b/session.jsonl',
        `{"sessionId":"b123","cwd":"/home/user/project-b","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"Hello"},"timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"assistant","content":"Hi!","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:00:30Z"}`
      );

      const paths = await reader.getProjectPaths();

      expect(paths).toContain('/home/user/project-a');
      expect(paths).toContain('/home/user/project-b');
      expect(paths.length).toBe(2);
    });
  });

  describe('getSessionCount()', () => {
    it('returns count without loading full data', async () => {
      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/-home-user-project');
      for (let i = 1; i <= 5; i++) {
        fs.addFile(
          `/home/user/.claude/projects/-home-user-project/session-${i}.jsonl`,
          `{"sessionId":"sess${i}","cwd":"/home/user/project","timestamp":"2024-01-${String(i).padStart(2, '0')}T10:00:00Z"}
{"message":{"role":"user","content":"Message ${i}"},"timestamp":"2024-01-${String(i).padStart(2, '0')}T10:00:00Z"}
{"message":{"role":"assistant","content":"Response ${i}","model":"claude-3-5-sonnet"},"timestamp":"2024-01-${String(i).padStart(2, '0')}T10:00:30Z"}`
        );
      }

      const count = await reader.getSessionCount();

      expect(count).toBe(5);
    });

    it('applies filter options to count', async () => {
      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/-home-user-project');
      fs.addFile(
        '/home/user/.claude/projects/-home-user-project/session-old.jsonl',
        SAMPLE_JSONL.oldSession,
        new Date('2024-01-01T12:00:00Z')
      );
      fs.addFile(
        '/home/user/.claude/projects/-home-user-project/session-new.jsonl',
        SAMPLE_JSONL.basic,
        new Date('2024-01-15T12:00:00Z')
      );

      const count = await reader.getSessionCount({
        since: new Date('2024-01-10T00:00:00Z'),
      });

      expect(count).toBe(1);
    });
  });

  describe('readSessionIndex()', () => {
    it('returns lightweight session index without messages', async () => {
      setupBasicSession(fs);
      const index = await reader.readSessionIndex();

      expect(index.length).toBe(1);
      expect(index[0].id).toBeDefined();
      expect(index[0].source).toBe('claude_code');
      expect(index[0].projectPath).toBe('/home/user/project');
      expect(index[0].workspaceName).toBe('project');
      expect(index[0].promptCount).toBeGreaterThan(0);
      expect(index[0].timestamp).toBeInstanceOf(Date);
      expect(index[0].duration).toBeDefined();
    });

    it('filters by since date', async () => {
      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/-home-user-project');
      fs.addFile(
        '/home/user/.claude/projects/-home-user-project/session-old.jsonl',
        SAMPLE_JSONL.oldSession,
        new Date('2024-01-01T12:00:00Z')
      );
      fs.addFile(
        '/home/user/.claude/projects/-home-user-project/session-new.jsonl',
        SAMPLE_JSONL.basic,
        new Date('2024-01-15T12:00:00Z')
      );

      const index = await reader.readSessionIndex({
        since: new Date('2024-01-10T00:00:00Z'),
      });

      expect(index.length).toBe(1);
    });

    it('applies limit', async () => {
      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/-home-user-project');
      for (let i = 1; i <= 5; i++) {
        fs.addFile(
          `/home/user/.claude/projects/-home-user-project/session-${i}.jsonl`,
          `{"sessionId":"sess${i}","cwd":"/home/user/project","timestamp":"2024-01-${String(i).padStart(2, '0')}T10:00:00Z"}
{"message":{"role":"user","content":"Message ${i}"},"timestamp":"2024-01-${String(i).padStart(2, '0')}T10:00:00Z"}
{"message":{"role":"assistant","content":"Response ${i}","model":"claude-3-5-sonnet"},"timestamp":"2024-01-${String(i).padStart(2, '0')}T10:00:30Z"}`
        );
      }

      const index = await reader.readSessionIndex({ limit: 2 });

      expect(index.length).toBe(2);
    });

    it('returns empty array when no projects exist', async () => {
      const index = await reader.readSessionIndex();
      expect(index).toEqual([]);
    });
  });

  describe('getSessionDetails()', () => {
    it('returns session details with messages', async () => {
      setupBasicSession(fs);
      const details = await reader.getSessionDetails('-home-user-project/session-basic.jsonl/abc123');

      expect(details).not.toBeNull();
      expect(details!.messages).toBeDefined();
      expect(details!.messages.length).toBe(2);
      expect(details!.messages[0].role).toBe('user');
      expect(details!.messages[0].content).toBe('Hello');
    });

    it('returns null for invalid ID format', async () => {
      setupBasicSession(fs);
      const details = await reader.getSessionDetails('invalid-id');

      expect(details).toBeNull();
    });

    it('returns null for non-existent session', async () => {
      setupBasicSession(fs);
      const details = await reader.getSessionDetails('-home-user-project/non-existent.jsonl/xyz');

      expect(details).toBeNull();
    });

    it('includes model info when available', async () => {
      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/-home-user-project');
      fs.addFile(
        '/home/user/.claude/projects/-home-user-project/session-model.jsonl',
        SAMPLE_JSONL.withModelTracking
      );

      const details = await reader.getSessionDetails('-home-user-project/session-model.jsonl/model123');

      expect(details).not.toBeNull();
      expect(details!.modelInfo).toBeDefined();
      expect(details!.modelInfo!.primaryModel).toBe('claude-3-5-sonnet');
    });

    it('includes planning mode info when available', async () => {
      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/-home-user-project');
      fs.addFile(
        '/home/user/.claude/projects/-home-user-project/session-plan.jsonl',
        SAMPLE_JSONL.withPlanningMode
      );

      const details = await reader.getSessionDetails('-home-user-project/session-plan.jsonl/plan123');

      expect(details).not.toBeNull();
      expect(details!.planningModeInfo).toBeDefined();
      expect(details!.planningModeInfo!.hasPlanningMode).toBe(true);
    });
  });

  describe('ignored folder filtering', () => {
    it('should skip devark-hooks folders', async () => {
      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/C--Users-97254-AppData-Local-Temp-devark-hooks');
      fs.addFile(
        '/home/user/.claude/projects/C--Users-97254-AppData-Local-Temp-devark-hooks/session.jsonl',
        SAMPLE_JSONL.basic
      );

      const result = await reader.readSessions();
      expect(result.sessions.length).toBe(0);
    });

    it('should skip devark-analysis folders (Windows temp directory)', async () => {
      // This is the exact scenario that was causing the bug - 80 sessions from temp analysis folder
      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/C--Users-97254-AppData-Local-Temp-devark-analysis');
      fs.addFile(
        '/home/user/.claude/projects/C--Users-97254-AppData-Local-Temp-devark-analysis/session.jsonl',
        SAMPLE_JSONL.basic
      );

      const result = await reader.readSessions();
      expect(result.sessions.length).toBe(0);
    });

    it('should skip programs-cursor folders', async () => {
      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/C--Users-97254-AppData-Local-Programs-cursor');
      fs.addFile(
        '/home/user/.claude/projects/C--Users-97254-AppData-Local-Programs-cursor/session.jsonl',
        SAMPLE_JSONL.basic
      );

      const result = await reader.readSessions();
      expect(result.sessions.length).toBe(0);
    });

    it('should NOT skip legitimate project folders', async () => {
      // The actual project folder should NOT be filtered
      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/c--vibelog-vibe-log-cursor-extentstion');
      fs.addFile(
        '/home/user/.claude/projects/c--vibelog-vibe-log-cursor-extentstion/session.jsonl',
        SAMPLE_JSONL.basic
      );

      const result = await reader.readSessions();
      expect(result.sessions.length).toBe(1);
    });

    it('should correctly count sessions after filtering ignored folders', async () => {
      // Setup: 1 legit project + 2 ignored temp folders
      fs.addDirectory('/home/user/.claude/projects');

      // Legitimate project (should be included)
      fs.addDirectory('/home/user/.claude/projects/c--vibelog-vibe-log-cursor-extentstion');
      fs.addFile(
        '/home/user/.claude/projects/c--vibelog-vibe-log-cursor-extentstion/session.jsonl',
        SAMPLE_JSONL.basic
      );

      // Temp analysis folder (should be ignored) - the bug scenario
      fs.addDirectory('/home/user/.claude/projects/C--Users-97254-AppData-Local-Temp-devark-analysis');
      for (let i = 1; i <= 5; i++) {
        fs.addFile(
          `/home/user/.claude/projects/C--Users-97254-AppData-Local-Temp-devark-analysis/session-${i}.jsonl`,
          SAMPLE_JSONL.basic.replace('abc123', `temp${i}`)
        );
      }

      // Hooks folder (should be ignored)
      fs.addDirectory('/home/user/.claude/projects/C--Users-97254-AppData-Local-Temp-devark-hooks');
      fs.addFile(
        '/home/user/.claude/projects/C--Users-97254-AppData-Local-Temp-devark-hooks/session.jsonl',
        SAMPLE_JSONL.basic.replace('abc123', 'hooks1')
      );

      const result = await reader.readSessions();

      // Should only return 1 session from the legitimate project
      expect(result.sessions.length).toBe(1);
      expect(result.sessions[0].claudeSessionId).toBe('abc123');
    });
  });

  describe('highlights extraction', () => {
    const SAMPLE_WITH_HIGHLIGHTS = `{"sessionId":"highlights123","cwd":"/home/user/project","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"I want to add a visual feedback to the user when syncing sessions, showing the number of sessions about to be uploaded"},"timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"assistant","content":"I'll help you implement visual feedback for the sync process. Let me explore the codebase first.","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:00:30Z"}
{"message":{"role":"user","content":"Yes, please also use our existing loading animation"},"timestamp":"2024-01-15T10:01:00Z"}
{"message":{"role":"assistant","content":"I found the existing heartbeat animation in LoadingOverlay.tsx. I'll use that for the sync progress indicator.","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:01:30Z"}
{"toolUseResult":{"type":"update","filePath":"/home/user/project/src/components/SyncProgress.tsx"}}
{"toolUseResult":{"type":"update","filePath":"/home/user/project/src/services/SyncService.ts"}}`;

    it('extracts firstUserMessage from first meaningful user prompt', async () => {
      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/-home-user-project');
      fs.addFile(
        '/home/user/.claude/projects/-home-user-project/session-highlights.jsonl',
        SAMPLE_WITH_HIGHLIGHTS
      );

      const result = await reader.readSessions();
      const session = result.sessions[0];

      expect(session.highlights).toBeDefined();
      expect(session.highlights!.firstUserMessage).toBeDefined();
      expect(session.highlights!.firstUserMessage).toContain('visual feedback');
      expect(session.highlights!.firstUserMessage).toContain('syncing sessions');
    });

    it('extracts lastExchange with user message and assistant response', async () => {
      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/-home-user-project');
      fs.addFile(
        '/home/user/.claude/projects/-home-user-project/session-highlights.jsonl',
        SAMPLE_WITH_HIGHLIGHTS
      );

      const result = await reader.readSessions();
      const session = result.sessions[0];

      expect(session.highlights).toBeDefined();
      expect(session.highlights!.lastExchange).toBeDefined();
      expect(session.highlights!.lastExchange!.userMessage).toContain('loading animation');
      expect(session.highlights!.lastExchange!.assistantResponse).toContain('heartbeat animation');
    });

    it('skips meta messages when extracting highlights', async () => {
      const sessionWithMeta = `{"sessionId":"meta123","cwd":"/home/user/project","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"Caveat: The messages below were generated by the user while running local commands."},"timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"<command-name>/clear</command-name>"},"timestamp":"2024-01-15T10:00:01Z"}
{"message":{"role":"user","content":"Fix the authentication bug in the login component"},"timestamp":"2024-01-15T10:00:02Z"}
{"message":{"role":"assistant","content":"I'll fix the authentication bug. Let me look at the login component.","model":"claude-3-5-sonnet"},"timestamp":"2024-01-15T10:00:30Z"}`;

      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/-home-user-project');
      fs.addFile(
        '/home/user/.claude/projects/-home-user-project/session-meta.jsonl',
        sessionWithMeta
      );

      const result = await reader.readSessions();
      const session = result.sessions[0];

      expect(session.highlights).toBeDefined();
      // Should skip meta messages and get the real user intent
      expect(session.highlights!.firstUserMessage).toContain('authentication bug');
      expect(session.highlights!.firstUserMessage).not.toContain('Caveat');
    });
  });

  describe('editedFiles preservation', () => {
    it('preserves actual file paths in metadata.editedFiles', async () => {
      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/-home-user-project');
      fs.addFile(
        '/home/user/.claude/projects/-home-user-project/session-files.jsonl',
        SAMPLE_JSONL.withMultipleFiles
      );

      const result = await reader.readSessions();
      const session = result.sessions[0];

      expect(session.metadata).toBeDefined();
      expect(session.metadata!.editedFiles).toBeDefined();
      expect(session.metadata!.editedFiles).toContain('/home/user/project/src/index.ts');
      expect(session.metadata!.editedFiles).toContain('/home/user/project/src/utils.ts');
      expect(session.metadata!.editedFiles).toContain('/home/user/project/src/app.py');
      expect(session.metadata!.editedFiles!.length).toBe(3);
    });

    it('editedFiles contains paths while languages contains language names', async () => {
      fs.addDirectory('/home/user/.claude/projects');
      fs.addDirectory('/home/user/.claude/projects/-home-user-project');
      fs.addFile(
        '/home/user/.claude/projects/-home-user-project/session-files.jsonl',
        SAMPLE_JSONL.withMultipleFiles
      );

      const result = await reader.readSessions();
      const session = result.sessions[0];

      // editedFiles should have actual paths
      expect(session.metadata!.editedFiles).toContain('/home/user/project/src/index.ts');

      // languages should have language names
      expect(session.metadata!.languages).toContain('TypeScript');
      expect(session.metadata!.languages).toContain('Python');

      // They should be different
      expect(session.metadata!.editedFiles).not.toEqual(session.metadata!.languages);
    });
  });
});

// Helper function to setup a basic session
function setupBasicSession(fs: MockFileSystem) {
  fs.addDirectory('/home/user/.claude/projects');
  fs.addDirectory('/home/user/.claude/projects/-home-user-project');
  fs.addFile(
    '/home/user/.claude/projects/-home-user-project/session-basic.jsonl',
    SAMPLE_JSONL.basic
  );
}
