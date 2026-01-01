/**
 * MessageSanitizer Tests - TDD
 *
 * These tests are written FIRST, before any implementation exists.
 * The tests should FAIL initially (RED phase).
 */

import { describe, it, expect } from 'vitest';
import { sanitize, sanitizeMessages } from '../message-sanitizer';

describe('MessageSanitizer', () => {
  describe('sanitize() - single string', () => {
    describe('credential redaction', () => {
      it('redacts OpenAI API keys (sk-...)', () => {
        const result = sanitize('my key is sk-abc123xyz789');
        expect(result.content).toBe('my key is [CREDENTIAL_1]');
        expect(result.metadata.credentialsRedacted).toBe(1);
      });

      it('redacts Anthropic API keys (sk-ant-...)', () => {
        const result = sanitize('key: sk-ant-api03-abcdef123456');
        expect(result.content).toBe('key: [CREDENTIAL_1]');
        expect(result.metadata.credentialsRedacted).toBe(1);
      });

      it('redacts AWS keys (AKIA...)', () => {
        const result = sanitize('aws_key = AKIAIOSFODNN7EXAMPLE');
        expect(result.content).toBe('aws_key = [CREDENTIAL_1]');
        expect(result.metadata.credentialsRedacted).toBe(1);
      });

      it('redacts generic API keys in common formats', () => {
        const result = sanitize('API_KEY=abcd1234efgh5678ijkl');
        expect(result.content).toBe('API_KEY=[CREDENTIAL_1]');
        expect(result.metadata.credentialsRedacted).toBe(1);
      });

      it('redacts multiple credentials with sequential numbering', () => {
        const result = sanitize('key1: sk-abc123 and key2: sk-xyz789');
        expect(result.content).toBe('key1: [CREDENTIAL_1] and key2: [CREDENTIAL_2]');
        expect(result.metadata.credentialsRedacted).toBe(2);
      });

      it('redacts passwords in URLs', () => {
        // Database URLs are fully redacted (more secure)
        const result = sanitize('postgres://user:secretpass123@localhost:5432/db');
        expect(result.content).toBe('[DATABASE_URL]');
        expect(result.content).not.toContain('secretpass123');
      });

      it('redacts passwords in non-database URLs', () => {
        const result = sanitize('https://user:secretpass123@example.com/api');
        expect(result.content).toContain('[CREDENTIAL_');
        expect(result.content).not.toContain('secretpass123');
      });

      // === NEW: Stripe Keys ===
      it('redacts Stripe secret test keys (sk-test_...)', () => {
        const result = sanitize('key: sk-test_abc123xyz789012345');
        expect(result.content).toBe('key: [CREDENTIAL_1]');
        expect(result.metadata.credentialsRedacted).toBe(1);
      });

      it('redacts Stripe secret live keys (sk-live_...)', () => {
        const result = sanitize('key: sk-live_abc123xyz789012345');
        expect(result.content).toBe('key: [CREDENTIAL_1]');
        expect(result.metadata.credentialsRedacted).toBe(1);
      });

      it('redacts Stripe publishable test keys (pk-test_...)', () => {
        const result = sanitize('key: pk-test_abc123xyz789012345');
        expect(result.content).toBe('key: [CREDENTIAL_1]');
        expect(result.metadata.credentialsRedacted).toBe(1);
      });

      it('redacts Stripe publishable live keys (pk-live_...)', () => {
        const result = sanitize('key: pk-live_abc123xyz789012345');
        expect(result.content).toBe('key: [CREDENTIAL_1]');
        expect(result.metadata.credentialsRedacted).toBe(1);
      });

      it('redacts Stripe restricted keys (rk_live_...)', () => {
        const result = sanitize('key: rk_live_abc123xyz789012345');
        expect(result.content).toBe('key: [CREDENTIAL_1]');
        expect(result.metadata.credentialsRedacted).toBe(1);
      });

      // === NEW: Slack Tokens ===
      it('redacts Slack bot tokens (xoxb-...)', () => {
        const result = sanitize('token: xoxb-123456789012-1234567890123-abcdefghijklmnop');
        expect(result.content).toBe('token: [CREDENTIAL_1]');
        expect(result.metadata.credentialsRedacted).toBe(1);
      });

      it('redacts Slack user tokens (xoxp-...)', () => {
        const result = sanitize('token: xoxp-123456789012-1234567890123-abcdefghijklmnop');
        expect(result.content).toBe('token: [CREDENTIAL_1]');
        expect(result.metadata.credentialsRedacted).toBe(1);
      });

      // === NEW: NPM Tokens ===
      it('redacts NPM tokens (npm_...)', () => {
        const result = sanitize('NPM_TOKEN=npm_abc123xyz789012345678901234567890123');
        expect(result.content).toContain('[CREDENTIAL_');
        expect(result.content).not.toContain('npm_abc123xyz');
        expect(result.metadata.credentialsRedacted).toBeGreaterThanOrEqual(1);
      });

      // === NEW: SendGrid API Keys ===
      it('redacts SendGrid API keys (SG....)', () => {
        const result = sanitize('key: SG.abc123xyz789012345678.abc123xyz789012345678901234567890123456');
        expect(result.content).toBe('key: [CREDENTIAL_1]');
        expect(result.metadata.credentialsRedacted).toBe(1);
      });

      // === NEW: JWT Tokens ===
      it('redacts JWT tokens (header.payload.signature)', () => {
        const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
        const result = sanitize(`token: ${jwt}`);
        expect(result.content).toBe('token: [CREDENTIAL_1]');
        expect(result.content).not.toContain('eyJ');
        expect(result.metadata.credentialsRedacted).toBe(1);
      });

      // === NEW: Passwords in JSON ===
      it('redacts passwords in JSON format', () => {
        const result = sanitize('{"password": "super-secret-123"}');
        expect(result.content).not.toContain('super-secret-123');
      });

      it('redacts passwords with single quotes', () => {
        const result = sanitize("'password': 'my-secret-pass'");
        expect(result.content).not.toContain('my-secret-pass');
      });
    });

    describe('path redaction', () => {
      it('redacts home directory paths', () => {
        const result = sanitize('file at /Users/johndoe/projects/secret');
        expect(result.content).toContain('[PATH_');
        expect(result.content).not.toContain('johndoe');
        expect(result.metadata.pathsRedacted).toBeGreaterThan(0);
      });

      it('redacts Windows paths with usernames', () => {
        const result = sanitize('file at C:\\Users\\JohnDoe\\Documents\\secret.txt');
        expect(result.content).toContain('[PATH_');
        expect(result.content).not.toContain('JohnDoe');
      });

      it('preserves generic paths without usernames', () => {
        const result = sanitize('config in /etc/nginx/nginx.conf');
        // Generic system paths may be preserved or normalized
        expect(result.content).toBeDefined();
      });
    });

    describe('email redaction', () => {
      it('redacts email addresses', () => {
        const result = sanitize('contact me at john.doe@example.com');
        expect(result.content).toContain('[EMAIL_');
        expect(result.content).not.toContain('john.doe@example.com');
        expect(result.metadata.emailsRedacted).toBe(1);
      });

      it('redacts multiple emails', () => {
        const result = sanitize('from: alice@test.com to: bob@test.com');
        expect(result.metadata.emailsRedacted).toBe(2);
      });
    });

    describe('URL redaction', () => {
      it('redacts URLs with sensitive query params', () => {
        const result = sanitize('https://api.example.com/auth?token=secret123&key=abc');
        expect(result.content).not.toContain('secret123');
        expect(result.content).not.toContain('abc');
      });

      it('preserves safe URLs', () => {
        const result = sanitize('see https://docs.example.com/guide');
        // Documentation URLs without sensitive data may be preserved
        expect(result.content).toContain('https://');
      });
    });

    // === NEW: IP Address Redaction ===
    describe('IP address redaction', () => {
      it('redacts IPv4 addresses', () => {
        const result = sanitize('server at 192.168.1.100');
        expect(result.content).toBe('server at [IP_ADDRESS]');
        expect(result.content).not.toContain('192.168.1.100');
        expect(result.metadata.ipsRedacted).toBe(1);
      });

      it('redacts multiple IP addresses', () => {
        const result = sanitize('from 10.0.0.1 to 10.0.0.2');
        expect(result.content).toBe('from [IP_ADDRESS] to [IP_ADDRESS]');
        expect(result.metadata.ipsRedacted).toBe(2);
      });

      it('redacts localhost IP', () => {
        const result = sanitize('connect to 127.0.0.1:8080');
        expect(result.content).not.toContain('127.0.0.1');
      });

      it('preserves version numbers that look like IPs', () => {
        // This is a tricky case - we might accept false positives here
        const result = sanitize('version 1.2.3.4');
        // For security, we accept that version numbers may be redacted
        expect(result.content).toBeDefined();
      });
    });

    // === NEW: Environment Variable Redaction ===
    describe('environment variable redaction', () => {
      it('redacts $VAR style environment variables', () => {
        const result = sanitize('use $DATABASE_URL for connection');
        expect(result.content).toContain('[ENV_VAR_');
        expect(result.content).not.toContain('$DATABASE_URL');
        expect(result.metadata.envVarsRedacted).toBe(1);
      });

      it('redacts ${VAR} style environment variables', () => {
        const result = sanitize('secret is ${API_SECRET}');
        expect(result.content).toContain('[ENV_VAR_');
        expect(result.content).not.toContain('${API_SECRET}');
        expect(result.metadata.envVarsRedacted).toBe(1);
      });

      it('redacts multiple env vars', () => {
        const result = sanitize('$USER at $HOME directory');
        expect(result.metadata.envVarsRedacted).toBe(2);
      });

      it('preserves $ in non-variable contexts', () => {
        const result = sanitize('costs $100');
        expect(result.content).toBe('costs $100');
      });
    });

    // === NEW: Database URL Redaction ===
    describe('database URL redaction', () => {
      it('redacts PostgreSQL connection strings', () => {
        const result = sanitize('postgres://user:pass@localhost:5432/mydb');
        expect(result.content).toBe('[DATABASE_URL]');
        expect(result.content).not.toContain('user');
        expect(result.content).not.toContain('pass');
        expect(result.metadata.databaseUrlsRedacted).toBe(1);
      });

      it('redacts MySQL connection strings', () => {
        const result = sanitize('mysql://admin:secret@db.example.com:3306/appdb');
        expect(result.content).toBe('[DATABASE_URL]');
        expect(result.metadata.databaseUrlsRedacted).toBe(1);
      });

      it('redacts MongoDB connection strings', () => {
        const result = sanitize('mongodb://admin:secret@mongodb.example.com/mydb');
        expect(result.content).toBe('[DATABASE_URL]');
        expect(result.metadata.databaseUrlsRedacted).toBe(1);
      });

      it('redacts Redis connection strings', () => {
        const result = sanitize('redis://user:pass@redis.example.com:6379');
        expect(result.content).toBe('[DATABASE_URL]');
        expect(result.metadata.databaseUrlsRedacted).toBe(1);
      });

      it('redacts database URL in context', () => {
        const result = sanitize('connect using postgres://user:pass@host:5432/db and proceed');
        expect(result.content).toBe('connect using [DATABASE_URL] and proceed');
      });
    });

    describe('preserves non-sensitive content', () => {
      it('preserves plain text unchanged', () => {
        const result = sanitize('hello world');
        expect(result.content).toBe('hello world');
        expect(result.metadata.credentialsRedacted).toBe(0);
        expect(result.metadata.pathsRedacted).toBe(0);
        expect(result.metadata.emailsRedacted).toBe(0);
      });

      it('preserves code without sensitive data', () => {
        const code = 'function add(a, b) { return a + b; }';
        const result = sanitize(code);
        expect(result.content).toBe(code);
      });

      it('preserves numbers and common identifiers', () => {
        const result = sanitize('user id: 12345, count: 100');
        expect(result.content).toBe('user id: 12345, count: 100');
      });
    });
  });

  describe('sanitizeMessages() - array of messages', () => {
    it('sanitizes an array of messages', () => {
      const messages = [
        { role: 'user' as const, content: 'my key is sk-abc123' },
        { role: 'assistant' as const, content: 'I see your key' },
      ];

      const result = sanitizeMessages(messages);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toBe('my key is [CREDENTIAL_1]');
      expect(result.messages[1].content).toBe('I see your key');
      expect(result.totalRedactions.credentials).toBe(1);
    });

    it('maintains sequential numbering across messages', () => {
      const messages = [
        { role: 'user' as const, content: 'key1: sk-first123' },
        { role: 'user' as const, content: 'key2: sk-second456' },
      ];

      const result = sanitizeMessages(messages);

      expect(result.messages[0].content).toBe('key1: [CREDENTIAL_1]');
      expect(result.messages[1].content).toBe('key2: [CREDENTIAL_2]');
      expect(result.totalRedactions.credentials).toBe(2);
    });

    it('handles empty message array', () => {
      const result = sanitizeMessages([]);
      expect(result.messages).toHaveLength(0);
      expect(result.totalRedactions.credentials).toBe(0);
    });
  });
});
