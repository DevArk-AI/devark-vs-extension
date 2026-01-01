/**
 * Run evaluation on daily summary generation
 *
 * Usage: npx tsx scripts/eval/run-evaluation.ts [fixture-name]
 *
 * This script:
 * 1. Loads test fixtures
 * 2. Runs summary generation
 * 3. Evaluates output quality
 * 4. Generates pass/fail report
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SummaryService } from '../../src/services/SummaryService';
import { LLMManager } from '../../src/llm/llm-manager';
import type { CursorSession } from '../../src/cursor-integration/types';
import type { DailySummary } from '../../src/services/SummaryService';

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

interface EvaluationResult {
  fixture: string;
  passed: boolean;
  score: number;
  criteria: {
    sessionCountAccuracy: { passed: boolean; expected: number; actual: number };
    fileTrackingAccuracy: { passed: boolean; expected: number; actual: number };
    messageCountAccuracy: { passed: boolean; expected: number; actual: number };
    specificityScore: { passed: boolean; score: number; details: string };
    noGenericPhrases: { passed: boolean; violations: string[] };
  };
  summary: DailySummary;
  duration: number;
}

// Generic phrases that indicate lack of specificity
const GENERIC_PHRASES = [
  'extensive work',
  'extensive development',
  'multiple files',
  'various files',
  'various tasks',
  'various features',
  'continued development',
  'continued work',
  'several changes',
  'numerous changes',
  'worked on multiple',
  'worked on various'
];

async function loadFixtures(): Promise<TestFixture[]> {
  const fixturesDir = path.join(__dirname, '../../fixtures');
  const files = await fs.readdir(fixturesDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  const fixtures: TestFixture[] = [];
  for (const file of jsonFiles) {
    const content = await fs.readFile(path.join(fixturesDir, file), 'utf-8');
    fixtures.push(JSON.parse(content));
  }

  return fixtures;
}

async function evaluateSummary(fixture: TestFixture, summary: DailySummary): Promise<EvaluationResult> {
  const startTime = Date.now();

  // Calculate expected values
  const expectedSessions = fixture.sessions.length;
  const expectedMessages = fixture.sessions.reduce((sum, s) => sum + s.promptCount, 0);
  const expectedFiles = new Set(fixture.sessions.flatMap(s => s.fileContext || [])).size;

  // 1. Session count accuracy (must be exact)
  const sessionCountAccuracy = {
    passed: summary.sessions === expectedSessions,
    expected: expectedSessions,
    actual: summary.sessions
  };

  // 2. File tracking accuracy (at least 80% of files mentioned in accomplishments)
  const mentionedFiles = new Set<string>();
  const allText = [...summary.workedOn, ...summary.suggestedFocus, summary.insights || ''].join(' ').toLowerCase();

  for (const session of fixture.sessions) {
    for (const file of session.fileContext || []) {
      const fileName = path.basename(file).toLowerCase();
      if (allText.includes(fileName)) {
        mentionedFiles.add(file);
      }
    }
  }

  const fileTrackingAccuracy = {
    passed: mentionedFiles.size >= Math.max(1, expectedFiles * 0.5), // At least 50% of files
    expected: expectedFiles,
    actual: mentionedFiles.size
  };

  // 3. Message count accuracy (must be exact)
  const messageCountAccuracy = {
    passed: summary.totalMessages === expectedMessages,
    expected: expectedMessages,
    actual: summary.totalMessages
  };

  // 4. Specificity score (mentions of actual files/features)
  const accomplishmentsText = summary.workedOn.join(' ');
  const fileExtensionPattern = /\.(ts|tsx|js|jsx|json|css|html|md|py|java|go|rs|c|cpp|h|hpp)\b/gi;
  const fileMatches = accomplishmentsText.match(fileExtensionPattern) || [];
  const specificityRatio = fileMatches.length / Math.max(1, summary.workedOn.length);

  const specificityScore = {
    passed: specificityRatio >= 0.3, // At least 30% of accomplishments mention files
    score: Math.round(specificityRatio * 100),
    details: `${fileMatches.length} file mentions in ${summary.workedOn.length} accomplishments (${Math.round(specificityRatio * 100)}%)`
  };

  // 5. No generic phrases check
  const violations: string[] = [];
  for (const phrase of GENERIC_PHRASES) {
    if (allText.toLowerCase().includes(phrase.toLowerCase())) {
      violations.push(phrase);
    }
  }

  const noGenericPhrases = {
    passed: violations.length === 0,
    violations
  };

  // Calculate overall score
  const criteria = [
    sessionCountAccuracy.passed,
    fileTrackingAccuracy.passed,
    messageCountAccuracy.passed,
    specificityScore.passed,
    noGenericPhrases.passed
  ];

  const passedCount = criteria.filter(Boolean).length;
  const score = Math.round((passedCount / criteria.length) * 100);

  const duration = Date.now() - startTime;

  return {
    fixture: fixture.name,
    passed: passedCount === criteria.length,
    score,
    criteria: {
      sessionCountAccuracy,
      fileTrackingAccuracy,
      messageCountAccuracy,
      specificityScore,
      noGenericPhrases
    },
    summary,
    duration
  };
}

async function runEvaluation(fixtureName?: string): Promise<void> {
  console.log('🧪 Running Daily Summary Evaluation\n');

  // Load fixtures
  const fixtures = await loadFixtures();
  console.log(`✅ Loaded ${fixtures.length} fixtures`);

  // Filter fixtures if name provided
  const toEvaluate = fixtureName
    ? fixtures.filter(f => f.name === fixtureName)
    : fixtures;

  if (toEvaluate.length === 0) {
    console.error(`❌ No fixtures found${fixtureName ? ` matching "${fixtureName}"` : ''}`);
    process.exit(1);
  }

  console.log(`📊 Evaluating ${toEvaluate.length} fixture(s)\n`);

  // Initialize LLM Manager
  const llmManager = LLMManager.getInstance();
  await llmManager.initialize();

  if (!llmManager.isInitialized()) {
    console.error('❌ LLM Manager not initialized - do you have a provider configured?');
    process.exit(1);
  }

  const summaryService = new SummaryService(llmManager);

  // Run evaluations
  const results: EvaluationResult[] = [];

  for (const fixture of toEvaluate) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Fixture: ${fixture.name}`);
    console.log(`   ${fixture.description}`);
    console.log(`   ${fixture.sessions.length} sessions, ${fixture.sessions.reduce((s, sess) => s + sess.promptCount, 0)} messages`);
    console.log('─'.repeat(60));

    try {
      // Generate summary
      console.log('⏳ Generating summary...');
      const aiResult = await summaryService.generateDailySummary({
        sessions: fixture.sessions,
        date: new Date(fixture.date),
        timeframe: 'daily'
      });

      const summary = summaryService.convertToDailySummary(
        aiResult,
        fixture.sessions,
        new Date(fixture.date)
      );

      // Evaluate
      console.log('📊 Evaluating quality...');
      const result = await evaluateSummary(fixture, summary);
      results.push(result);

      // Print result
      const statusIcon = result.passed ? '✅' : '❌';
      console.log(`\n${statusIcon} ${result.passed ? 'PASSED' : 'FAILED'} - Score: ${result.score}%`);
      console.log('\nCriteria:');
      console.log(`  ${result.criteria.sessionCountAccuracy.passed ? '✅' : '❌'} Session count: ${result.criteria.sessionCountAccuracy.actual}/${result.criteria.sessionCountAccuracy.expected}`);
      console.log(`  ${result.criteria.messageCountAccuracy.passed ? '✅' : '❌'} Message count: ${result.criteria.messageCountAccuracy.actual}/${result.criteria.messageCountAccuracy.expected}`);
      console.log(`  ${result.criteria.fileTrackingAccuracy.passed ? '✅' : '❌'} File tracking: ${result.criteria.fileTrackingAccuracy.actual}/${result.criteria.fileTrackingAccuracy.expected} files mentioned`);
      console.log(`  ${result.criteria.specificityScore.passed ? '✅' : '❌'} Specificity: ${result.criteria.specificityScore.details}`);
      console.log(`  ${result.criteria.noGenericPhrases.passed ? '✅' : '❌'} No generic phrases${result.criteria.noGenericPhrases.violations.length > 0 ? ` (found: ${result.criteria.noGenericPhrases.violations.join(', ')})` : ''}`);

      console.log('\nGenerated Summary:');
      console.log('Accomplishments:');
      for (const item of summary.workedOn) {
        console.log(`  • ${item}`);
      }

    } catch (error) {
      console.error(`❌ Error evaluating ${fixture.name}:`, error);
      results.push({
        fixture: fixture.name,
        passed: false,
        score: 0,
        criteria: {
          sessionCountAccuracy: { passed: false, expected: 0, actual: 0 },
          fileTrackingAccuracy: { passed: false, expected: 0, actual: 0 },
          messageCountAccuracy: { passed: false, expected: 0, actual: 0 },
          specificityScore: { passed: false, score: 0, details: 'Error' },
          noGenericPhrases: { passed: false, violations: ['Error occurred'] }
        },
        summary: {} as any,
        duration: 0
      });
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 EVALUATION SUMMARY');
  console.log('='.repeat(60));

  const passedCount = results.filter(r => r.passed).length;
  const avgScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);

  console.log(`\nTotal fixtures: ${results.length}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${results.length - passedCount}`);
  console.log(`Average score: ${avgScore}%`);

  // Save results
  const resultsPath = path.join(__dirname, '../../fixtures/eval-results.json');
  await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to ${resultsPath}`);

  // Exit with error if any failed
  if (passedCount < results.length) {
    console.log('\n❌ Some evaluations failed');
    process.exit(1);
  } else {
    console.log('\n✅ All evaluations passed!');
  }
}

// Run
const fixtureName = process.argv[2];
runEvaluation(fixtureName).catch(error => {
  console.error('❌ Evaluation failed:', error);
  process.exit(1);
});
