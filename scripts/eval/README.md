# Daily Summary Evaluation System

Automated testing system for daily summary quality. Ensures summaries are specific, accurate, and avoid generic descriptions.

## Quick Start

### 1. Extract Test Fixtures

Extract real Cursor sessions from your database as test fixtures:

```bash
npm run eval:extract
```

This creates fixtures in `fixtures/` directory:
- `single-session.json` - Single session (simplest case)
- `small-day.json` - 2-5 sessions
- `medium-day.json` - 6-20 sessions
- `large-day.json` - 20+ sessions
- `multi-project.json` - Multiple projects in one day

### 2. Run Evaluation

Run all fixtures:
```bash
npm run eval:run
```

Run single fixture (fast test):
```bash
npm run eval:quick
```

Run everything (extract + evaluate):
```bash
npm run eval:all
```

## Quality Criteria

The evaluation scores summaries based on 5 criteria:

### 1. ✅ Session Count Accuracy
- **Must be exact match**
- Example: If fixture has 97 sessions, summary must report exactly 97
- **Why**: Basic data integrity check

### 2. ✅ Message Count Accuracy
- **Must be exact match**
- Example: If fixture has 450 messages, summary must report exactly 450
- **Why**: Validates message extraction and counting

### 3. ✅ File Tracking (50% threshold)
- **At least 50% of files mentioned in accomplishments**
- Example: If 20 files were worked on, at least 10 should be mentioned
- **Why**: Ensures summary references actual work done

### 4. ✅ Specificity Score (30% threshold)
- **At least 30% of accomplishments mention specific files**
- Example: "Fixed bug in AuthService.ts" (good) vs "Fixed authentication bug" (vague)
- **Why**: Prevents generic, vague descriptions

### 5. ✅ No Generic Phrases
- **Zero tolerance for generic phrases**
- Banned phrases:
  - "extensive work"
  - "multiple files"
  - "various tasks"
  - "continued development"
  - "several changes"
  - "worked on multiple"
- **Why**: Forces concrete, specific language

## Understanding Results

### Pass Example
```
✅ PASSED - Score: 100%

Criteria:
  ✅ Session count: 15/15
  ✅ Message count: 234/234
  ✅ File tracking: 12/18 files mentioned (67%)
  ✅ Specificity: 8 file mentions in 5 accomplishments (160%)
  ✅ No generic phrases

Generated Summary:
Accomplishments:
  • Implemented AI summary feature in SummaryService.ts with OpenRouter integration
  • Fixed provider switching bug in LLMManager.ts that caused crashes
  • Built daily summary UI in SummariesView.tsx with loading states
```

### Fail Example
```
❌ FAILED - Score: 40%

Criteria:
  ✅ Session count: 15/15
  ✅ Message count: 234/234
  ❌ File tracking: 3/18 files mentioned (17%)
  ❌ Specificity: 1 file mention in 5 accomplishments (20%)
  ❌ No generic phrases (found: extensive work, multiple files)

Generated Summary:
Accomplishments:
  • Extensive development work on the extension
  • Modified multiple files across the project
  • Continued work on various features
```

**Problems**:
- Only 3 out of 18 files mentioned (17% < 50% threshold)
- Only 1 file mention in 5 accomplishments (20% < 30% threshold)
- Used generic phrases: "extensive work", "multiple files"

## Output Files

### `fixtures/eval-results.json`
Detailed JSON results for all evaluations:
```json
{
  "fixture": "medium-day",
  "passed": true,
  "score": 100,
  "criteria": { ... },
  "summary": { ... },
  "duration": 3450
}
```

Use this for:
- Automated testing in CI/CD
- Tracking improvements over time
- Debugging specific failures

## Tips for Good Summaries

### ✅ DO:
- Mention specific file names: "Updated AuthService.ts"
- Name actual features: "Built leaderboard component"
- Reference exact bugs fixed: "Fixed null pointer in checkout.ts"
- Use concrete numbers: "Refactored 15 test files"

### ❌ DON'T:
- Use vague terms: "extensive work", "various files"
- Be generic: "Continued development"
- Skip file names: "Modified authentication logic" (which file?)
- Be abstract: "Improved performance" (how? where?)

## Integration with CI/CD

Add to your CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Run summary evaluation
  run: npm run eval:all
```

This ensures summary quality is maintained as the prompt evolves.

## Troubleshooting

### "No fixtures found"
Run `npm run eval:extract` first to create fixtures from your Cursor database.

### "LLM Manager not initialized"
Make sure you have an LLM provider configured in the extension settings.

### "Could not find Cursor database"
The extraction script looks for Cursor's database at:
- **Windows**: `%APPDATA%\Cursor\User\globalStorage\state.vscdb`
- **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
- **Linux**: `~/.config/Cursor/User/globalStorage/state.vscdb`

Make sure Cursor is installed and you have some composer sessions.

## Customizing Criteria

Edit `scripts/eval/run-evaluation.ts` to adjust thresholds:

```typescript
// Lower file tracking threshold (default: 50%)
const fileTrackingAccuracy = {
  passed: mentionedFiles.size >= expectedFiles * 0.3, // Now 30%
  ...
};

// Raise specificity threshold (default: 30%)
const specificityScore = {
  passed: specificityRatio >= 0.5, // Now 50%
  ...
};
```

## Next Steps

After running evaluations:

1. **If passing**: Summaries are good! Consider raising thresholds for higher quality.

2. **If failing on specificity**: Improve the prompt to encourage file mentions. Look at vibe-log-cli's standup prompt for examples.

3. **If failing on accuracy**: Check data extraction logic (session reader, file tracking).

4. **If using generic phrases**: Add more banned phrases to the list or improve prompt instructions.

---

Built to ensure daily summaries are as concrete and specific as vibe-log-cli's standup reports.
