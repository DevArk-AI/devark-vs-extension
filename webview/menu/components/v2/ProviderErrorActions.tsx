import { useState } from 'react';
import { RefreshCw, ExternalLink, Copy, Check } from 'lucide-react';
import { send } from '../../utils/vscode';
import type { LLMProvider } from '../../state/types-v2';

interface ProviderErrorActionsProps {
  provider: LLMProvider;
  onRetry: (providerId: string) => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      className="vl-action-btn"
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export function ProviderErrorActions({ provider, onRetry }: ProviderErrorActionsProps) {
  const handleRetryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('[ProviderErrorActions] Retry clicked for provider:', provider.id);
    onRetry(provider.id);
  };

  const handleExternalClick = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    send('openExternal', { url });
  };

  // Cursor CLI not detected
  if (provider.status === 'not-detected' && provider.id === 'cursor-cli') {
    return (
      <div style={{ marginTop: 'var(--space-md)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: '11px', opacity: 0.7, marginBottom: 'var(--space-sm)' }}>
          Cursor CLI not detected. Make sure Cursor is installed and the CLI is enabled.
        </div>
        <div className="vl-flex vl-gap-sm">
          <button className="vl-action-btn" onClick={handleRetryClick}>
            <RefreshCw size={12} /> Retry
          </button>
          <button
            className="vl-action-btn"
            onClick={(e) => handleExternalClick(e, 'https://cursor.com/docs/cli/overview')}
          >
            Install Cursor CLI <ExternalLink size={12} />
          </button>
        </div>
      </div>
    );
  }

  // Claude Agent SDK not detected
  if (provider.status === 'not-detected' && provider.id === 'claude-agent-sdk') {
    const installCommand = 'npm install @anthropic-ai/claude-code';
    return (
      <div style={{ marginTop: 'var(--space-md)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: '11px', opacity: 0.7, marginBottom: 'var(--space-sm)' }}>
          SDK not installed. Run:
          <br />
          <code style={{ fontFamily: 'var(--font-mono)' }}>{installCommand}</code>
        </div>
        <div className="vl-flex vl-gap-sm">
          <button className="vl-action-btn" onClick={handleRetryClick}>
            <RefreshCw size={12} /> Retry
          </button>
          <CopyButton text={installCommand} />
          <button
            className="vl-action-btn"
            onClick={(e) => handleExternalClick(e, 'https://www.npmjs.com/package/@anthropic-ai/claude-code')}
          >
            View on npm <ExternalLink size={12} />
          </button>
        </div>
      </div>
    );
  }

  // Claude Agent SDK not logged in
  if (provider.status === 'not-logged-in' && provider.id === 'claude-agent-sdk') {
    const loginCommand = 'claude login';
    return (
      <div style={{ marginTop: 'var(--space-md)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: '11px', opacity: 0.7, marginBottom: 'var(--space-sm)' }}>
          Run: <code style={{ fontFamily: 'var(--font-mono)' }}>{loginCommand}</code>
        </div>
        <div className="vl-flex vl-gap-sm">
          <button className="vl-action-btn" onClick={handleRetryClick}>
            <RefreshCw size={12} /> Retry
          </button>
          <CopyButton text={loginCommand} />
        </div>
      </div>
    );
  }

  // Ollama not running
  if (provider.status === 'not-running' && provider.id === 'ollama') {
    const serveCommand = 'ollama serve';
    return (
      <div style={{ marginTop: 'var(--space-md)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: '11px', opacity: 0.7, marginBottom: 'var(--space-sm)' }}>
          Start Ollama to continue.
          <br />
          Run: <code style={{ fontFamily: 'var(--font-mono)' }}>{serveCommand}</code>
        </div>
        <div className="vl-flex vl-gap-sm">
          <button className="vl-action-btn" onClick={handleRetryClick}>
            <RefreshCw size={12} /> Retry
          </button>
          <CopyButton text={serveCommand} />
          <button
            className="vl-action-btn"
            onClick={(e) => handleExternalClick(e, 'https://ollama.ai')}
          >
            Install Ollama <ExternalLink size={12} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
