/**
 * MessageSanitizer - Pure function implementation
 *
 * Redacts sensitive information from text content:
 * - API keys and credentials
 * - File paths with usernames
 * - Email addresses
 * - URLs with sensitive query parameters
 *
 * This module has NO external dependencies and is 100% testable.
 */

// ============================================================================
// Types
// ============================================================================

export interface SanitizationMetadata {
  credentialsRedacted: number;
  pathsRedacted: number;
  emailsRedacted: number;
  urlsRedacted: number;
  ipsRedacted: number;
  envVarsRedacted: number;
  databaseUrlsRedacted: number;
}

export interface SanitizationResult {
  content: string;
  metadata: SanitizationMetadata;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface SanitizedMessage extends Message {
  originalLength: number;
}

export interface SanitizeMessagesResult {
  messages: SanitizedMessage[];
  totalRedactions: {
    credentials: number;
    paths: number;
    emails: number;
    urls: number;
    ips: number;
    envVars: number;
    databaseUrls: number;
  };
}

// ============================================================================
// Patterns
// ============================================================================

/**
 * Credential patterns - detect API keys, secrets, tokens
 */
const CREDENTIAL_PATTERNS = [
  // Anthropic API keys: sk-ant-... (check before generic sk-)
  /\bsk-ant-[a-zA-Z0-9-]{6,}/g,
  // Stripe secret keys: sk-test_... or sk-live_...
  /\bsk[-_](test|live)[-_][a-zA-Z0-9_-]{10,}/g,
  // Stripe publishable keys: pk-test_... or pk-live_...
  /\bpk[-_](test|live)[-_][a-zA-Z0-9_-]{10,}/g,
  // Stripe restricted keys: rk_live_... or rk_test_...
  /\brk_(live|test)_[a-zA-Z0-9_-]{10,}/g,
  // OpenAI API keys: sk-... (at least 6 chars after sk-)
  /\bsk-[a-zA-Z0-9]{6,}/g,
  // AWS Access Keys: AKIA...
  /\bAKIA[A-Z0-9]{16}\b/g,
  // AWS Secret Keys (40 char base64-ish)
  /(?<=AWS_SECRET_ACCESS_KEY=|aws_secret_access_key=)[A-Za-z0-9+/=]{40}/g,
  // Generic API_KEY=value patterns
  /(?<=API_KEY=|api_key=|apikey=|APIKEY=)[a-zA-Z0-9_-]{16,}/gi,
  // Bearer tokens
  /(?<=Bearer\s)[a-zA-Z0-9._-]{20,}/g,
  // GitHub tokens: ghp_, gho_, ghs_, ghr_
  /\bgh[psohr]_[a-zA-Z0-9]{36,}/g,
  // Slack tokens: xoxb-... or xoxp-...
  /\bxox[bp]-[0-9]+-[0-9]+-[a-zA-Z0-9]+/g,
  // NPM tokens: npm_...
  /\bnpm_[a-zA-Z0-9]{36,}/g,
  // SendGrid API keys: SG....
  /\bSG\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g,
  // JWT tokens: header.payload.signature (base64url encoded)
  /\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  // Generic long hex strings that look like secrets (32+ chars)
  /(?<=secret=|token=|password=|key=)[a-f0-9]{32,}/gi,
  // URLs with passwords: protocol://user:password@host
  /(?<=:\/\/[^:]+:)[^@]+(?=@)/g,
];

/**
 * Password patterns in JSON/config
 */
const PASSWORD_PATTERNS = [
  // "password": "value" or 'password': 'value'
  /(['"])password\1\s*:\s*(['"])[^'"]+\2/gi,
];

/**
 * Path patterns - detect file paths with usernames
 */
const PATH_PATTERNS = [
  // Unix home directories: /Users/username/... or /home/username/...
  /\/(?:Users|home)\/[a-zA-Z0-9_.-]+(?:\/[^\s"'`]+)?/g,
  // Windows user directories: C:\Users\username\...
  /[A-Z]:\\Users\\[a-zA-Z0-9_.-]+(?:\\[^\s"'`]+)?/gi,
];

/**
 * Email patterns
 */
const EMAIL_PATTERNS = [
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
];

/**
 * IP address patterns
 */
const IP_PATTERNS = [
  // IPv4 addresses
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
];

/**
 * Environment variable patterns
 */
const ENV_VAR_PATTERNS = [
  // ${VAR_NAME} style
  /\$\{[A-Z_][A-Z0-9_]*\}/g,
  // $VAR_NAME style (must start with letter and have at least one more char)
  /\$[A-Z_][A-Z0-9_]+\b/g,
];

/**
 * Database URL patterns
 */
const DATABASE_URL_PATTERNS = [
  // postgres://, mysql://, mongodb://, redis://
  /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^\s"'`<>]+/g,
];

/**
 * URL patterns with sensitive query params
 */
const SENSITIVE_URL_PARAMS = ['token', 'key', 'secret', 'password', 'auth', 'api_key', 'apikey', 'access_token'];

// ============================================================================
// Sanitization State (for sequential numbering across calls)
// ============================================================================

class SanitizationState {
  private credentialCount = 0;
  private pathCount = 0;
  private emailCount = 0;
  private urlCount = 0;
  private ipCount = 0;
  private envVarCount = 0;
  private databaseUrlCount = 0;

  nextCredential(): string {
    return `[CREDENTIAL_${++this.credentialCount}]`;
  }

  nextPath(): string {
    return `[PATH_${++this.pathCount}]`;
  }

  nextEmail(): string {
    return `[EMAIL_${++this.emailCount}]`;
  }

  nextUrl(): string {
    return `[URL_${++this.urlCount}]`;
  }

  nextIp(): string {
    this.ipCount++;
    return '[IP_ADDRESS]';
  }

  nextEnvVar(): string {
    return `[ENV_VAR_${++this.envVarCount}]`;
  }

  nextDatabaseUrl(): string {
    this.databaseUrlCount++;
    return '[DATABASE_URL]';
  }

  getCounts(): SanitizationMetadata {
    return {
      credentialsRedacted: this.credentialCount,
      pathsRedacted: this.pathCount,
      emailsRedacted: this.emailCount,
      urlsRedacted: this.urlCount,
      ipsRedacted: this.ipCount,
      envVarsRedacted: this.envVarCount,
      databaseUrlsRedacted: this.databaseUrlCount,
    };
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Sanitize a single string, redacting sensitive information.
 * Uses fresh state for each call (no cross-call numbering).
 */
export function sanitize(content: string): SanitizationResult {
  const state = new SanitizationState();
  const sanitized = sanitizeWithState(content, state);
  return {
    content: sanitized,
    metadata: state.getCounts(),
  };
}

/**
 * Sanitize with shared state (for sequential numbering across multiple strings)
 */
function sanitizeWithState(content: string, state: SanitizationState): string {
  let result = content;

  // Redact database URLs first (before generic URL handling)
  for (const pattern of DATABASE_URL_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, () => state.nextDatabaseUrl());
  }

  // Redact credentials (do this early as they're highest priority)
  for (const pattern of CREDENTIAL_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    result = result.replace(pattern, () => state.nextCredential());
  }

  // Redact passwords in JSON/config
  for (const pattern of PASSWORD_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, (match) => {
      // Preserve the structure, just redact the value
      const quoteChar = match[0]; // First quote character
      return `${quoteChar}password${quoteChar}: "[REDACTED_PASSWORD]"`;
    });
  }

  // Redact paths with usernames
  for (const pattern of PATH_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, () => state.nextPath());
  }

  // Redact emails
  for (const pattern of EMAIL_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, () => state.nextEmail());
  }

  // Redact IP addresses
  for (const pattern of IP_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, () => state.nextIp());
  }

  // Redact environment variables
  for (const pattern of ENV_VAR_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, () => state.nextEnvVar());
  }

  // Redact sensitive URL query parameters
  result = redactSensitiveUrlParams(result, state);

  return result;
}

/**
 * Redact sensitive query parameters from URLs
 */
function redactSensitiveUrlParams(content: string, state: SanitizationState): string {
  // Match URLs
  const urlPattern = /https?:\/\/[^\s"'`<>]+/g;

  return content.replace(urlPattern, (url) => {
    try {
      const urlObj = new URL(url);
      let modified = false;

      for (const param of SENSITIVE_URL_PARAMS) {
        if (urlObj.searchParams.has(param)) {
          urlObj.searchParams.set(param, state.nextCredential().slice(1, -1)); // Remove brackets for URL
          modified = true;
        }
      }

      return modified ? urlObj.toString() : url;
    } catch {
      // Invalid URL, return as-is
      return url;
    }
  });
}

/**
 * Sanitize an array of messages, maintaining sequential numbering across all messages.
 */
export function sanitizeMessages(messages: Message[]): SanitizeMessagesResult {
  const state = new SanitizationState();

  const sanitizedMessages: SanitizedMessage[] = messages.map((msg) => ({
    ...msg,
    content: sanitizeWithState(msg.content, state),
    originalLength: msg.content.length,
  }));

  const counts = state.getCounts();

  return {
    messages: sanitizedMessages,
    totalRedactions: {
      credentials: counts.credentialsRedacted,
      paths: counts.pathsRedacted,
      emails: counts.emailsRedacted,
      urls: counts.urlsRedacted,
      ips: counts.ipsRedacted,
      envVars: counts.envVarsRedacted,
      databaseUrls: counts.databaseUrlsRedacted,
    },
  };
}
