/**
 * ProviderSelectView - Change Provider Screen
 *
 * Shows:
 * - Built-in providers (CLI-based)
 * - Local providers (Ollama)
 * - Cloud API providers with API key input
 */

import { useState, useEffect } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { ProviderErrorActions } from './ProviderErrorActions';
import { useAppV2 } from '../../AppV2';
import { send } from '../../utils/vscode';
import type { LLMProvider } from '../../state/types-v2';

interface ProviderSelectViewProps {
  onClose: () => void;
}

interface VerifyResult {
  success: boolean;
  error?: string;
  message?: string;
}

export function ProviderSelectView({ onClose }: ProviderSelectViewProps) {
  const { state, dispatch } = useAppV2();
  const [selectedProvider, setSelectedProvider] = useState<string>(state.activeProvider || '');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, VerifyResult>>({});
  const [openRouterModel, setOpenRouterModel] = useState<string>('');
  const [cursorCliModel, setCursorCliModel] = useState<string>('auto');
  const [claudeAgentSdkModel, setClaudeAgentSdkModel] = useState<string>('haiku');

  // Listen for verifyApiKeyResult messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'verifyApiKeyResult') {
        const { providerId, success, error, message: successMessage } = message.data;
        setVerifying(null);
        setVerifyResult(prev => ({
          ...prev,
          [providerId]: { success, error, message: successMessage },
        }));

        // Clear result after 5 seconds
        setTimeout(() => {
          setVerifyResult(prev => {
            const newResult = { ...prev };
            delete newResult[providerId];
            return newResult;
          });
        }, 5000);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Initialize models from provider data
  useEffect(() => {
    const openRouterProvider = state.providers.find(p => p.id === 'openrouter');
    if (openRouterProvider?.model) {
      setOpenRouterModel(openRouterProvider.model);
    } else {
      setOpenRouterModel('');  // No fallback - require explicit model selection
    }

    const cursorProvider = state.providers.find(p => p.id === 'cursor-cli');
    if (cursorProvider?.model) {
      setCursorCliModel(cursorProvider.model);
    }

    const claudeProvider = state.providers.find(p => p.id === 'claude-agent-sdk');
    if (claudeProvider?.model) {
      setClaudeAgentSdkModel(claudeProvider.model);
    }
  }, [state.providers]);

  const handleSave = () => {
    dispatch({ type: 'SET_ACTIVE_PROVIDER', payload: selectedProvider });
    // Pass model for providers that need it (OpenRouter)
    const model = selectedProvider === 'openrouter' ? openRouterModel : undefined;
    send('switchProvider', { providerId: selectedProvider, model });
    onClose();
  };

  const handleVerifyApiKey = async (providerId: string) => {
    setVerifying(providerId);
    setVerifyResult(prev => {
      const newResult = { ...prev };
      delete newResult[providerId];
      return newResult;
    });
    // Pass model for providers that need it (OpenRouter)
    const model = providerId === 'openrouter' ? openRouterModel : undefined;
    send('verifyApiKey', { providerId, apiKey: apiKeys[providerId], model });
  };

  const handleRetry = (providerId: string) => {
    console.log('[ProviderSelectView] handleRetry called for:', providerId);
    send('detectProvider', { providerId });
  };

  const getProviderStatus = (provider: LLMProvider) => {
    switch (provider.status) {
      case 'connected':
        return { text: 'Connected', className: 'connected' };
      case 'not-configured':
        return { text: 'Not configured', className: 'warning' };
      case 'not-running':
        return { text: 'Not running', className: 'error' };
      case 'not-detected':
        return { text: 'Not detected', className: 'error' };
      case 'not-logged-in':
        return { text: 'Not logged in', className: 'error' };
      default:
        return { text: provider.status, className: 'warning' };
    }
  };

  // Group providers by type
  const builtInProviders = state.providers.filter((p) => p.type === 'cli');
  const localProviders = state.providers.filter((p) => p.type === 'local');
  const cloudProviders = state.providers.filter((p) => p.type === 'cloud');

  // Check if selected provider is in a usable state
  const selectedProviderData = state.providers.find(p => p.id === selectedProvider);
  const canSave = selectedProviderData && (
    selectedProviderData.status === 'connected' ||
    selectedProviderData.status === 'available' ||
    (selectedProviderData.type === 'cloud' && selectedProviderData.requiresApiKey)
  );

  const renderProviderCard = (provider: LLMProvider) => {
    const status = getProviderStatus(provider);
    const isSelected = selectedProvider === provider.id;

    return (
      <div
        key={provider.id}
        className={`vl-settings-box ${isSelected ? 'selected' : ''}`}
        style={{
          marginBottom: 'var(--space-sm)',
          cursor: 'pointer',
          border: isSelected ? '2px solid var(--vl-accent)' : undefined,
        }}
        onClick={() => setSelectedProvider(provider.id)}
      >
        <div className="vl-settings-row">
          <div className="vl-flex vl-items-center vl-gap-sm">
            <div
              className="vl-provider-radio"
              style={{
                borderColor: isSelected ? 'var(--vl-accent)' : undefined,
                background: isSelected ? 'var(--vl-accent)' : undefined,
                boxShadow: isSelected ? 'inset 0 0 0 4px var(--vscode-input-background)' : undefined,
              }}
            />
            <div>
              <div className="vl-settings-label">{provider.name}</div>
              <div className="vl-settings-desc">{provider.description}</div>
            </div>
          </div>
          <span className={`vl-llm-status ${status.className}`}>{status.text}</span>
        </div>

        {/* Model display for connected providers */}
        {provider.status === 'connected' && provider.model && (
          <div style={{ marginTop: 'var(--space-sm)', fontSize: '11px', fontFamily: 'var(--font-mono)', opacity: 0.6 }}>
            Model: {provider.model}
          </div>
        )}

        {/* Ollama model selector - shows actual available models from Ollama server */}
        {isSelected && provider.id === 'ollama' && provider.status === 'connected' && (
          <div style={{ marginTop: 'var(--space-md)' }}>
            <div style={{ fontSize: '11px', opacity: 0.6, marginBottom: 'var(--space-xs)' }}>
              Available Models ({provider.availableModels?.length || 0}):
            </div>
            <select
              style={{
                width: '100%',
                padding: 'var(--space-sm)',
                background: 'var(--vscode-input-background)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--vscode-input-foreground)',
                fontSize: '12px',
              }}
              defaultValue={provider.model}
              onChange={(e) => send('setOllamaModel', { model: e.target.value })}
            >
              {provider.availableModels && provider.availableModels.length > 0 ? (
                provider.availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))
              ) : (
                <>
                  <option value="">No models found</option>
                  <option value="" disabled style={{ fontSize: '10px' }}>
                    Run: ollama pull codellama
                  </option>
                </>
              )}
            </select>
            {provider.availableModels && provider.availableModels.length === 0 && (
              <div style={{ marginTop: 'var(--space-sm)', fontSize: '11px', opacity: 0.7 }}>
                No models installed. Run <code style={{ fontFamily: 'var(--font-mono)' }}>ollama pull codellama</code> to install a model.
              </div>
            )}
          </div>
        )}

        {/* Cursor CLI model selector */}
        {isSelected && provider.id === 'cursor-cli' && provider.status === 'connected' && (
          <div style={{ marginTop: 'var(--space-md)' }}>
            <div style={{ fontSize: '11px', opacity: 0.6, marginBottom: 'var(--space-xs)' }}>
              Model:
            </div>
            <select
              style={{
                width: '100%',
                padding: 'var(--space-sm)',
                background: 'var(--vscode-input-background)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--vscode-input-foreground)',
                fontSize: '12px',
              }}
              value={cursorCliModel}
              onChange={(e) => {
                e.stopPropagation();
                setCursorCliModel(e.target.value);
                send('setCursorCliModel', { model: e.target.value });
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {provider.availableModels && provider.availableModels.length > 0 ? (
                provider.availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))
              ) : (
                <option value="auto">auto</option>
              )}
            </select>
          </div>
        )}

        {/* Claude Agent SDK model selector */}
        {isSelected && provider.id === 'claude-agent-sdk' && provider.status === 'connected' && (
          <div style={{ marginTop: 'var(--space-md)' }}>
            <div style={{ fontSize: '11px', opacity: 0.6, marginBottom: 'var(--space-xs)' }}>
              Model:
            </div>
            <select
              style={{
                width: '100%',
                padding: 'var(--space-sm)',
                background: 'var(--vscode-input-background)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--vscode-input-foreground)',
                fontSize: '12px',
              }}
              value={claudeAgentSdkModel}
              onChange={(e) => {
                e.stopPropagation();
                setClaudeAgentSdkModel(e.target.value);
                send('setClaudeAgentSdkModel', { model: e.target.value });
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {provider.availableModels && provider.availableModels.length > 0 ? (
                provider.availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))
              ) : (
                <option value="haiku">haiku</option>
              )}
            </select>
          </div>
        )}

        {/* Error actions for providers with issues */}
        {isSelected && <ProviderErrorActions provider={provider} onRetry={handleRetry} />}

        {/* API key input for cloud providers */}
        {isSelected && provider.type === 'cloud' && (
          <div style={{ marginTop: 'var(--space-md)' }}>
            <div className="vl-flex vl-gap-sm">
              <input
                type="password"
                placeholder="Enter API key..."
                value={apiKeys[provider.id] || ''}
                onChange={(e) => setApiKeys({ ...apiKeys, [provider.id]: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1,
                  padding: 'var(--space-sm)',
                  background: 'var(--vscode-input-background)',
                  border: '1px solid var(--vscode-input-border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--vscode-input-foreground)',
                  fontSize: '12px',
                }}
              />
              <button
                className="vl-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleVerifyApiKey(provider.id);
                }}
                disabled={!apiKeys[provider.id] || verifying === provider.id}
              >
                {verifying === provider.id ? 'Verifying...' : 'Verify'}
              </button>
            </div>

            {/* Verification result feedback */}
            {verifyResult[provider.id] && (
              <div
                style={{
                  marginTop: 'var(--space-sm)',
                  padding: 'var(--space-sm)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-xs)',
                  background: verifyResult[provider.id].success
                    ? 'rgba(0, 200, 83, 0.1)'
                    : 'rgba(255, 82, 82, 0.1)',
                  color: verifyResult[provider.id].success
                    ? 'var(--vscode-testing-iconPassed)'
                    : 'var(--vscode-testing-iconFailed)',
                }}
              >
                {verifyResult[provider.id].success ? (
                  <>
                    <Check size={12} />
                    {verifyResult[provider.id].message || 'API key verified!'}
                  </>
                ) : (
                  <>
                    <AlertCircle size={12} />
                    {verifyResult[provider.id].error || 'Verification failed'}
                  </>
                )}
              </div>
            )}

            {provider.id === 'openrouter' && (
              <div style={{ marginTop: 'var(--space-md)' }}>
                <div style={{ fontSize: '11px', opacity: 0.6, marginBottom: 'var(--space-sm)' }}>Model:</div>
                <input
                  type="text"
                  placeholder="e.g., anthropic/claude-3.5-sonnet"
                  value={openRouterModel}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    setOpenRouterModel(e.target.value);
                  }}
                  style={{
                    width: '100%',
                    padding: 'var(--space-sm)',
                    background: 'var(--vscode-input-background)',
                    border: '1px solid var(--vscode-input-border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--vscode-input-foreground)',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ marginTop: 'var(--space-xs)', fontSize: '10px', opacity: 0.5 }}>
                  Enter model ID from OpenRouter (e.g., anthropic/claude-3.5-sonnet, openai/gpt-4o)
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="vl-settings">
      {/* Header */}
      <div className="vl-settings-header">
        <span className="vl-settings-title">Select LLM</span>
        <button className="vl-close-btn" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      {/* Built-in Providers */}
      <div className="vl-settings-section">
        <div className="vl-section-title">Built-in (Uses your existing subscriptions)</div>
        {builtInProviders.map(renderProviderCard)}
      </div>

      {/* Local Providers */}
      <div className="vl-settings-section">
        <div className="vl-section-title">Local (Free, private)</div>
        {localProviders.map(renderProviderCard)}
      </div>

      {/* Cloud API Providers */}
      <div className="vl-settings-section">
        <div className="vl-section-title">Cloud API (Requires API key)</div>
        {cloudProviders.map(renderProviderCard)}
      </div>

      {/* Action Buttons */}
      <div className="vl-flex vl-gap-sm" style={{ marginTop: 'var(--space-xl)', justifyContent: 'flex-end' }}>
        <button className="vl-action-btn" onClick={onClose}>
          Cancel
        </button>
        <button className="vl-action-btn primary" onClick={handleSave} disabled={!selectedProvider || !canSave}>
          Save
        </button>
      </div>
    </div>
  );
}
