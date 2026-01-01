/**
 * Extract Cursor session fixtures from the database for evaluation
 *
 * Usage: npx tsx scripts/eval/extract-fixtures.ts
 *
 * This script:
 * 1. Reads sessions from Cursor's state.vscdb database
 * 2. Groups them by date
 * 3. Creates test fixtures with varying complexity
 * 4. Saves them to fixtures/ directory
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import initSqlJs from 'sql.js';

interface CursorSession {
  sessionId: string;
  workspaceName: string;
  workspacePath?: string;
  startTime: Date;
  lastActivity: Date;
  promptCount: number;
  status: 'active' | 'historical';
  fileContext?: string[];
  messages?: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}

interface TestFixture {
  name: string;
  description: string;
  date: string;
  sessions: CursorSession[];
  expectedCriteria: {
    minSessions: number;
    minFiles: number;
    minMessages: number;
    shouldMentionFiles: boolean;
    shouldMentionProjects: boolean;
  };
}

async function getCursorDatabasePath(): Promise<string | null> {
  const homeDir = os.homedir();
  const platform = os.platform();

  const paths = {
    darwin: path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
    linux: path.join(homeDir, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
    win32: path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'Cursor', 'User', 'globalStorage', 'state.vscdb')
  };

  const dbPath = paths[platform as keyof typeof paths];
  if (!dbPath) return null;

  try {
    await fs.access(dbPath);
    return dbPath;
  } catch {
    return null;
  }
}

async function readCursorSessions(dbPath: string): Promise<CursorSession[]> {
  const SQL = await initSqlJs();
  const dbBuffer = await fs.readFile(dbPath);
  const db = new SQL.Database(dbBuffer);

  const result = db.exec(`
    SELECT key, value
    FROM cursorDiskKV
    WHERE key LIKE 'composerData:%'
  `);

  const sessions: CursorSession[] = [];

  for (const row of result[0]?.values || []) {
    try {
      const sessionId = (row[0] as string).replace('composerData:', '');
      const data = JSON.parse(row[1] as string);

      // Extract messages
      const messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: string }> = [];
      const rawMessages = data.messages || data.conversation || [];

      for (let i = 0; i < rawMessages.length; i++) {
        const msg = rawMessages[i];
        if (!msg) continue;

        const role = msg.role === 'assistant' || msg.type === 2 ? 'assistant' : 'user';
        const content = msg.content || msg.text || '';
        const timestamp = msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString();

        if (content && content.trim()) {
          messages.push({
            id: `msg-${i}`,
            role,
            content: content.trim(),
            timestamp
          });
        }
      }

      // Extract file context from messages
      const fileContext = new Set<string>();
      for (const msg of messages) {
        const fileMatches = msg.content.match(/(?:\.\/|\/)?[\w\-\/]+\.(?:ts|tsx|js|jsx|json|css|html|md|py|java|go|rs|c|cpp|h|hpp)/gi);
        if (fileMatches) {
          fileMatches.forEach(f => fileContext.add(f));
        }
      }

      sessions.push({
        sessionId,
        workspaceName: data.workspaceName || path.basename(data.workspacePath || 'Unknown'),
        workspacePath: data.workspacePath,
        startTime: new Date(data.createdAt || Date.now()),
        lastActivity: new Date(data.updatedAt || data.createdAt || Date.now()),
        promptCount: messages.length,
        status: 'historical',
        fileContext: Array.from(fileContext),
        messages
      });
    } catch (error) {
      console.warn('Failed to parse session:', error);
    }
  }

  db.close();
  return sessions;
}

async function createFixtures(sessions: CursorSession[]): Promise<TestFixture[]> {
  // Group sessions by date
  const sessionsByDate = new Map<string, CursorSession[]>();

  for (const session of sessions) {
    const dateKey = session.startTime.toISOString().split('T')[0];
    if (!sessionsByDate.has(dateKey)) {
      sessionsByDate.set(dateKey, []);
    }
    sessionsByDate.get(dateKey)!.push(session);
  }

  const fixtures: TestFixture[] = [];

  // Get dates sorted by recency
  const dates = Array.from(sessionsByDate.keys()).sort().reverse();

  // Fixture 1: Single session (simplest)
  if (dates.length > 0 && sessionsByDate.get(dates[0])!.length > 0) {
    const date = dates[0];
    const dateSessions = sessionsByDate.get(date)!;
    const singleSession = dateSessions.find(s => s.promptCount > 5 && s.fileContext && s.fileContext.length > 0);

    if (singleSession) {
      fixtures.push({
        name: 'single-session',
        description: 'Single session with multiple prompts and files',
        date,
        sessions: [singleSession],
        expectedCriteria: {
          minSessions: 1,
          minFiles: 1,
          minMessages: 5,
          shouldMentionFiles: true,
          shouldMentionProjects: true
        }
      });
    }
  }

  // Fixture 2: Small day (2-5 sessions)
  const smallDay = dates.find(d => {
    const count = sessionsByDate.get(d)!.length;
    return count >= 2 && count <= 5;
  });

  if (smallDay) {
    const dateSessions = sessionsByDate.get(smallDay)!;
    fixtures.push({
      name: 'small-day',
      description: 'Small day with 2-5 sessions',
      date: smallDay,
      sessions: dateSessions,
      expectedCriteria: {
        minSessions: 2,
        minFiles: 1,
        minMessages: 10,
        shouldMentionFiles: true,
        shouldMentionProjects: true
      }
    });
  }

  // Fixture 3: Medium day (6-20 sessions)
  const mediumDay = dates.find(d => {
    const count = sessionsByDate.get(d)!.length;
    return count >= 6 && count <= 20;
  });

  if (mediumDay) {
    const dateSessions = sessionsByDate.get(mediumDay)!;
    fixtures.push({
      name: 'medium-day',
      description: 'Medium day with 6-20 sessions',
      date: mediumDay,
      sessions: dateSessions,
      expectedCriteria: {
        minSessions: 6,
        minFiles: 3,
        minMessages: 30,
        shouldMentionFiles: true,
        shouldMentionProjects: true
      }
    });
  }

  // Fixture 4: Large day (20+ sessions)
  const largeDay = dates.find(d => sessionsByDate.get(d)!.length >= 20);

  if (largeDay) {
    const dateSessions = sessionsByDate.get(largeDay)!;
    fixtures.push({
      name: 'large-day',
      description: 'Large day with 20+ sessions',
      date: largeDay,
      sessions: dateSessions,
      expectedCriteria: {
        minSessions: 20,
        minFiles: 5,
        minMessages: 100,
        shouldMentionFiles: true,
        shouldMentionProjects: true
      }
    });
  }

  // Fixture 5: Multi-project day (sessions from different workspaces)
  const multiProjectDay = dates.find(d => {
    const projects = new Set(sessionsByDate.get(d)!.map(s => s.workspaceName));
    return projects.size >= 2;
  });

  if (multiProjectDay) {
    const dateSessions = sessionsByDate.get(multiProjectDay)!;
    fixtures.push({
      name: 'multi-project',
      description: 'Day with multiple projects',
      date: multiProjectDay,
      sessions: dateSessions,
      expectedCriteria: {
        minSessions: 2,
        minFiles: 2,
        minMessages: 10,
        shouldMentionFiles: true,
        shouldMentionProjects: true
      }
    });
  }

  return fixtures;
}

async function main() {
  console.log('🔍 Extracting Cursor session fixtures for evaluation...\n');

  // Find database
  const dbPath = await getCursorDatabasePath();
  if (!dbPath) {
    console.error('❌ Could not find Cursor database');
    process.exit(1);
  }

  console.log(`✅ Found Cursor database: ${dbPath}`);

  // Read sessions
  console.log('📖 Reading sessions from database...');
  const sessions = await readCursorSessions(dbPath);
  console.log(`✅ Read ${sessions.length} sessions`);

  if (sessions.length === 0) {
    console.error('❌ No sessions found in database');
    process.exit(1);
  }

  // Create fixtures
  console.log('\n📦 Creating test fixtures...');
  const fixtures = await createFixtures(sessions);
  console.log(`✅ Created ${fixtures.length} fixtures`);

  // Save fixtures
  const fixturesDir = path.join(__dirname, '../../fixtures');
  await fs.mkdir(fixturesDir, { recursive: true });

  for (const fixture of fixtures) {
    const fixturePath = path.join(fixturesDir, `${fixture.name}.json`);
    await fs.writeFile(fixturePath, JSON.stringify(fixture, null, 2));
    console.log(`   ✓ Saved ${fixture.name} (${fixture.sessions.length} sessions, ${fixture.sessions.reduce((sum, s) => sum + s.promptCount, 0)} messages)`);
  }

  console.log(`\n✅ All fixtures saved to ${fixturesDir}`);
  console.log('\n📊 Fixture Summary:');
  for (const fixture of fixtures) {
    const totalMessages = fixture.sessions.reduce((sum, s) => sum + s.promptCount, 0);
    const totalFiles = new Set(fixture.sessions.flatMap(s => s.fileContext || [])).size;
    console.log(`   ${fixture.name}: ${fixture.sessions.length} sessions, ${totalMessages} messages, ${totalFiles} files`);
  }
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
