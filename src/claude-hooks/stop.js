#!/usr/bin/env node
/**
 * Claude Code Stop Hook
 *
 * This script is executed by Claude Code when the agent stops
 * (completes, errors, or is cancelled). It captures the response data
 * and writes it to a temp file for the VS Code extension to pick up
 * and use for coaching suggestions.
 *
 * Usage: Configure in ~/.claude/settings.json:
 * {
 *   "hooks": {
 *     "Stop": [
 *       {
 *         "matcher": "*",
 *         "hooks": [{ "type": "command", "command": "node /path/to/stop.js" }]
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
 *   "hook_event_name": "Stop",
 *   "stop_reason": "completed" | "error" | "cancelled",
 *   "last_assistant_message": "Agent's last response",
 *   "tool_results": [...]
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
  const logLine = `[${timestamp}] [claude-stop] ${message}\n`;
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

/**
 * Extract text from a message content block
 * Claude Code messages can have various formats
 */
function extractTextFromContent(content) {
  // If it's a string, return as-is
  if (typeof content === 'string') {
    return content;
  }

  // If it's an array of content blocks (Claude API format)
  if (Array.isArray(content)) {
    const textParts = content
      .filter(block => block && (block.type === 'text' || typeof block === 'string'))
      .map(block => typeof block === 'string' ? block : (block.text || ''));
    return textParts.join('\n');
  }

  // If it's an object with text property
  if (content && typeof content === 'object') {
    if (content.text) {
      return String(content.text);
    }
    // If it has content property (nested)
    if (content.content) {
      return extractTextFromContent(content.content);
    }
    // Try to get meaningful string representation
    // Avoid [object Object] by checking common properties
    if (content.message) {
      return extractTextFromContent(content.message);
    }
    // Last resort: JSON stringify but only if it has actual content
    try {
      const json = JSON.stringify(content);
      if (json && json !== '{}' && json !== '[]') {
        return json.substring(0, 5000);
      }
    } catch (e) {
      // Ignore stringify errors
    }
  }

  return '';
}

/**
 * Read the last assistant message from the transcript file
 * Claude Code stores the conversation in a JSONL file
 */
function getLastAssistantMessageFromTranscript(transcriptPath) {
  debugLog(`Attempting to read transcript from: ${transcriptPath}`);

  if (!transcriptPath) {
    debugLog('No transcript path provided');
    return '';
  }

  try {
    if (!fs.existsSync(transcriptPath)) {
      debugLog(`Transcript file does not exist: ${transcriptPath}`);
      return '';
    }

    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    debugLog(`Transcript has ${lines.length} lines`);

    // Find the last assistant message by reading lines from the end
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        // Claude Code transcript format: look for assistant messages
        if (entry.type === 'assistant' || entry.role === 'assistant') {
          // Try multiple possible content locations
          const messageContent = entry.message || entry.content || entry.text || '';
          const extractedText = extractTextFromContent(messageContent);

          if (extractedText) {
            debugLog(`Found assistant message: ${extractedText.length} chars`);
            debugLog(`Message preview: ${extractedText.substring(0, 100)}...`);
            return extractedText.substring(0, 5000);
          }
        }
      } catch (e) {
        // Invalid JSON line, skip
      }
    }

    debugLog('No assistant message found in transcript');
    return '';
  } catch (error) {
    debugLog(`Error reading transcript: ${error.message}`);
    return '';
  }
}

process.stdin.on('end', () => {
  debugLog(`Total stdin received: ${inputData.length} bytes`);
  debugLog(`Raw input (first 500 chars): ${inputData.substring(0, 500)}`);

  try {
    const input = JSON.parse(inputData);
    debugLog(`Parsed input keys: ${Object.keys(input).join(', ')}`);
    debugLog(`Input last_assistant_message: ${input.last_assistant_message ? 'present (' + input.last_assistant_message.length + ' chars)' : 'MISSING'}`);
    debugLog(`Input response field: ${input.response ? 'present' : 'missing'}`);
    debugLog(`Input stop_reason: ${input.stop_reason || 'missing'}`);
    debugLog(`Input session_id: ${input.session_id || 'missing'}`);
    debugLog(`Input transcript_path: ${input.transcript_path || 'missing'}`);

    // Get response content - try direct fields first, then fall back to reading transcript
    let responseContent = input.last_assistant_message || input.response || '';
    if (!responseContent && input.transcript_path) {
      debugLog('No direct response content, reading from transcript...');
      responseContent = getLastAssistantMessageFromTranscript(input.transcript_path);
    }

    // Extract response data from Claude Code hook input
    const responseData = {
      id: `claude-response-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      timestamp: new Date().toISOString(),
      source: 'claude_code',
      // Response content (truncate for safety)
      response: responseContent.substring(0, 5000),
      // Claude Code specific fields
      sessionId: input.session_id,
      transcriptPath: input.transcript_path,
      cwd: input.cwd,
      // Stop reason
      reason: input.stop_reason || input.reason || 'completed',
      // Tool results (max 10 for safety)
      toolResults: (input.tool_results || []).slice(0, 10).map(tr => ({
        tool: tr.tool || tr.name,
        result: typeof tr.result === 'string' ? tr.result.substring(0, 1000) : JSON.stringify(tr.result).substring(0, 1000)
      })),
      // Success is true if reason is 'completed'
      success: (input.stop_reason || input.reason || 'completed') === 'completed',
      // Workspace context
      workspaceRoots: input.cwd ? [input.cwd] : []
    };

    debugLog(`Created responseData with id: ${responseData.id}`);
    debugLog(`Response reason: ${responseData.reason}`);
    debugLog(`Response content length: ${responseData.response.length}`);

    // Ensure directory exists
    if (!fs.existsSync(vibeLogDir)) {
      fs.mkdirSync(vibeLogDir, { recursive: true });
      debugLog(`Created hook directory: ${vibeLogDir}`);
    }

    // Write response to a new file (extension will read and delete)
    const responseFile = path.join(vibeLogDir, `claude-response-${Date.now()}.json`);
    fs.writeFileSync(responseFile, JSON.stringify(responseData, null, 2));
    debugLog(`Wrote response file: ${responseFile}`);

    // Also update the "latest" file for quick access
    const latestFile = path.join(vibeLogDir, 'latest-claude-response.json');
    fs.writeFileSync(latestFile, JSON.stringify(responseData, null, 2));
    debugLog(`Wrote latest file: ${latestFile}`);

    // Note: We rely on polling instead of exec('code --command') to avoid opening
    // unwanted IDE windows (e.g., Cursor when using Claude Code)

    // Log for debugging
    debugLog(`SUCCESS: Captured Claude Code response (${responseData.reason}): ${responseData.response.substring(0, 50)}...`);

  } catch (error) {
    debugLog(`ERROR: ${error.message}`);
    debugLog(`Stack: ${error.stack}`);
  }

  // Always continue - never block
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
