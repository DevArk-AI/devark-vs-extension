#!/usr/bin/env node
/**
 * Cursor afterAgentResponse & stop Hook
 *
 * This script handles BOTH Cursor hooks:
 * 1. afterAgentResponse - fires after each agent turn (has response text)
 * 2. stop - fires when agent loop ends (has status, no response text)
 *
 * Detection: Uses 'hook_event_name' field (base field for all Cursor hooks)
 *
 * Usage: Configure in ~/.cursor/hooks.json:
 * {
 *   "version": 1,
 *   "hooks": {
 *     "afterAgentResponse": [{ "command": "node /path/to/post-response.js" }],
 *     "stop": [{ "command": "node /path/to/post-response.js" }]
 *   }
 * }
 *
 * afterAgentResponse input: { response, conversation_id, generation_id, model, tool_calls, ... }
 * stop input: { status, loop_count, conversation_id, generation_id, model, ... }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

// Debug logging to persistent file
const vibeLogDir = path.join(os.tmpdir(), 'devark-hooks');
const debugLogFile = path.join(vibeLogDir, 'debug.log');

function debugLog(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [cursor-response] ${message}\n`;
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

/**
 * Notify IDE to process hook files immediately
 * Skip on Windows (causes issues with opening unwanted windows) - rely on polling instead
 * On macOS/Linux, use simple 'code --command' which works fine
 */
function notifyActiveIDEs() {
  // Skip on Windows - causes issues with Cursor/VS Code window management
  // Extension will pick up files via polling instead
  if (process.platform === 'win32') {
    debugLog('Skipping IDE notification on Windows (using polling instead)');
    return;
  }

  // On macOS/Linux, simple 'code --command' works fine
  exec('code --command devark.processHookFiles', (err) => {
    if (err) {
      debugLog(`Could not notify IDE: ${err.message}`);
    } else {
      debugLog('Notified IDE to process hook files');
    }
  });
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

    // Detect which hook triggered this script
    const hookType = input.hook_event_name || 'afterAgentResponse';
    const isStopHook = hookType === 'stop';

    debugLog(`Hook type detected: ${hookType}`);
    debugLog(`Parsed input keys: ${Object.keys(input).join(', ')}`);

    // Build response data based on hook type
    const responseData = {
      id: `cursor-response-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      timestamp: new Date().toISOString(),
      source: 'cursor',

      // Hook identification
      hookType: hookType,
      isFinal: isStopHook,

      // Stop-specific fields (only from stop hook)
      stopReason: isStopHook ? (input.status || 'error') : undefined,
      loopCount: isStopHook ? (input.loop_count || 0) : undefined,

      // Response content (only from afterAgentResponse - stop hook has no text)
      response: isStopHook ? '' : (input.response || input.text || '').substring(0, 5000),

      // Common Cursor fields (available in both hooks)
      conversationId: input.conversation_id,
      generationId: input.generation_id,
      model: input.model,
      workspaceRoots: input.workspace_roots || [],
      cursorVersion: input.cursor_version,
      userEmail: input.user_email,

      // Tool calls (only in afterAgentResponse)
      toolCalls: isStopHook ? [] : (input.tool_calls || []).slice(0, 10).map(tc => ({
        name: tc.name || tc.tool,
        arguments: tc.arguments || tc.params || {}
      })),

      // Files modified (only in afterAgentResponse)
      filesModified: isStopHook ? [] : (input.files_modified || []).slice(0, 20),

      // Success status
      success: isStopHook ? (input.status === 'completed') : (input.success !== false)
    };

    debugLog(`Created responseData with id: ${responseData.id}`);
    debugLog(`Is stop hook: ${isStopHook}, stopReason: ${responseData.stopReason}, loopCount: ${responseData.loopCount}`);

    // Ensure directory exists
    if (!fs.existsSync(vibeLogDir)) {
      fs.mkdirSync(vibeLogDir, { recursive: true });
      debugLog(`Created hook directory: ${vibeLogDir}`);
    }

    // Use different filename pattern for stop hook
    const filePrefix = isStopHook ? 'cursor-response-final' : 'cursor-response';
    const responseFile = path.join(vibeLogDir, `${filePrefix}-${Date.now()}.json`);
    fs.writeFileSync(responseFile, JSON.stringify(responseData, null, 2));
    debugLog(`Wrote ${isStopHook ? 'FINAL' : 'intermediate'} response file: ${responseFile}`);

    // Update latest file (separate files for intermediate vs final)
    const latestFileName = isStopHook ? 'latest-cursor-response-final.json' : 'latest-cursor-response.json';
    const latestFile = path.join(vibeLogDir, latestFileName);
    fs.writeFileSync(latestFile, JSON.stringify(responseData, null, 2));
    debugLog(`Wrote latest file: ${latestFile}`);

    // Notify all active IDEs that have DevArk running
    notifyActiveIDEs();

    // Log for debugging
    if (isStopHook) {
      debugLog(`SUCCESS: Captured FINAL response - status: ${responseData.stopReason}, loops: ${responseData.loopCount}`);
    } else {
      debugLog(`SUCCESS: Captured response: ${responseData.response.substring(0, 50)}...`);
    }

  } catch (error) {
    debugLog(`ERROR: ${error.message}`);
    debugLog(`Stack: ${error.stack}`);
  }

  // Always continue - never block response delivery
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
