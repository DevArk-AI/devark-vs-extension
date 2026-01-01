#!/usr/bin/env node
/**
 * Claude Code UserPromptSubmit Hook
 *
 * This script is executed by Claude Code when a prompt is submitted.
 * It captures the prompt data and writes it to a temp file for the
 * VS Code extension to pick up and analyze.
 *
 * Usage: Configure in ~/.claude/settings.json:
 * {
 *   "hooks": {
 *     "UserPromptSubmit": [
 *       {
 *         "hooks": [{ "type": "command", "command": "node /path/to/user-prompt-submit.js" }]
 *       }
 *     ]
 *   }
 * }
 *
 * Input (stdin from Claude Code):
 * {
 *   "session_id": "abc123",
 *   "transcript_path": "/path/to/transcript.jsonl",
 *   "cwd": "/current/working/directory",
 *   "hook_event_name": "UserPromptSubmit",
 *   "prompt": "User's prompt text"
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
  const logLine = `[${timestamp}] [claude-prompt] ${message}\n`;
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
    debugLog(`Input prompt field: ${input.prompt ? 'present (' + input.prompt.length + ' chars)' : 'MISSING'}`);
    debugLog(`Input session_id: ${input.session_id || 'missing'}`);
    debugLog(`Input cwd: ${input.cwd || 'missing'}`);

    // Extract prompt data from Claude Code hook input
    const promptData = {
      id: `claude-prompt-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      timestamp: new Date().toISOString(),
      prompt: input.prompt || '',
      source: 'claude_code',
      // Include Claude Code specific context
      sessionId: input.session_id,
      transcriptPath: input.transcript_path,
      cwd: input.cwd,
      hookEventName: input.hook_event_name,
      // Map to common format for unified processing
      attachments: [],
      workspaceRoots: input.cwd ? [input.cwd] : [],
    };

    debugLog(`Created promptData with id: ${promptData.id}`);

    // Ensure directory exists
    if (!fs.existsSync(vibeLogDir)) {
      fs.mkdirSync(vibeLogDir, { recursive: true });
      debugLog(`Created hook directory: ${vibeLogDir}`);
    }

    // Write prompt to a new file with claude- prefix (extension will read and delete)
    const promptFile = path.join(vibeLogDir, `claude-prompt-${Date.now()}.json`);
    fs.writeFileSync(promptFile, JSON.stringify(promptData, null, 2));
    debugLog(`Wrote prompt file: ${promptFile}`);

    // Also update the "latest" file for quick access
    const latestFile = path.join(vibeLogDir, 'latest-claude-prompt.json');
    fs.writeFileSync(latestFile, JSON.stringify(promptData, null, 2));
    debugLog(`Wrote latest file: ${latestFile}`);

    // Log for debugging
    debugLog(`SUCCESS: Captured Claude Code prompt: ${promptData.prompt.substring(0, 50)}...`);

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
    debugLog('WARNING: No input received from Claude Code');
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
