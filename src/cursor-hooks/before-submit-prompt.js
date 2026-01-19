#!/usr/bin/env node
/**
 * Cursor beforeSubmitPrompt Hook
 *
 * This script is executed by Cursor before each prompt is submitted.
 * It captures the prompt data and writes it to a temp file for the
 * VS Code extension to pick up and analyze.
 *
 * Usage: Configure in .cursor/hooks.json:
 * {
 *   "version": 1,
 *   "hooks": {
 *     "beforeSubmitPrompt": [
 *       { "command": "node /path/to/before-submit-prompt.js" }
 *     ]
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Debug logging to persistent file
const vibeLogDir = path.join(os.tmpdir(), 'devark-hooks');
const debugLogFile = path.join(vibeLogDir, 'debug.log');

function debugLog(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [cursor-prompt] ${message}\n`;
  try {
    // Ensure directory exists
    if (!fs.existsSync(vibeLogDir)) {
      fs.mkdirSync(vibeLogDir, { recursive: true });
    }
    fs.appendFileSync(debugLogFile, logLine);
  } catch (e) {
    // Ignore logging errors
  }
  console.error(`[vibe-log] ${message}`);
}

debugLog('Hook script started');
debugLog(`Process args: ${process.argv.join(' ')}`);
debugLog(`Working directory: ${process.cwd()}`);

// Read JSON input from stdin
let inputData = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  inputData += chunk;
  debugLog(`Received stdin chunk: ${chunk.length} bytes`);
});

process.stdin.on('end', () => {
  debugLog(`Total stdin received: ${inputData.length} bytes`);
  debugLog(`Raw input (first 500 chars): ${inputData.substring(0, 500)}`);

  try {
    const input = JSON.parse(inputData);
    debugLog(`Parsed input keys: ${Object.keys(input).join(', ')}`);
    debugLog(`Input prompt field: ${input.prompt ? 'present' : 'MISSING'}`);

    // Extract prompt data from Cursor hook input
    const promptData = {
      id: `prompt-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      timestamp: new Date().toISOString(),
      prompt: input.prompt || '',
      source: 'cursor',
      attachments: input.attachments || [],
      // Include context from Cursor's common fields
      conversationId: input.conversation_id,
      generationId: input.generation_id,
      model: input.model,
      cursorVersion: input.cursor_version,
      workspaceRoots: input.workspace_roots || [],
      userEmail: input.user_email
    };

    debugLog(`Created promptData with id: ${promptData.id}`);

    // Ensure directory exists
    if (!fs.existsSync(vibeLogDir)) {
      fs.mkdirSync(vibeLogDir, { recursive: true });
      debugLog(`Created hook directory: ${vibeLogDir}`);
    }

    // Write prompt to a new file (extension will read and delete)
    const promptFile = path.join(vibeLogDir, `prompt-${Date.now()}.json`);
    fs.writeFileSync(promptFile, JSON.stringify(promptData, null, 2));
    debugLog(`Wrote prompt file: ${promptFile}`);

    // Also update the "latest" file for quick access
    const latestFile = path.join(vibeLogDir, 'latest-prompt.json');
    fs.writeFileSync(latestFile, JSON.stringify(promptData, null, 2));
    debugLog(`Wrote latest file: ${latestFile}`);

    // Note: We rely on polling instead of exec('code --command') to avoid opening
    // unwanted IDE windows (e.g., Cursor when using Claude Code)

    // Log for debugging (Cursor captures stdout/stderr)
    debugLog(`SUCCESS: Captured prompt: ${promptData.prompt.substring(0, 50)}...`);

  } catch (error) {
    debugLog(`ERROR: ${error.message}`);
    debugLog(`Stack: ${error.stack}`);
  }

  // Always continue - never block prompt submission
  const output = JSON.stringify({ continue: true });
  process.stdout.write(output);
  debugLog('Sent continue response to stdout');
});

// Handle case where stdin is empty or closed immediately
process.stdin.on('close', () => {
  debugLog('stdin closed');
  if (!inputData) {
    debugLog('WARNING: No input received from Cursor');
    // No input received, still continue
    process.stdout.write(JSON.stringify({ continue: true }));
  }
});

// Handle errors
process.on('uncaughtException', (error) => {
  debugLog(`UNCAUGHT EXCEPTION: ${error.message}`);
  debugLog(`Stack: ${error.stack}`);
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
});
