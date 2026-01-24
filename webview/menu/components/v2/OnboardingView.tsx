/**
 * OnboardingView - First-Time Setup Screen
 *
 * Shows:
 * - Logo and tagline
 * - Value propositions
 * - LLM provider selection
 * - Auto-analyze checkbox options
 * - Start button
 */

import { useState, useEffect } from 'react';
import { Check, ArrowRight, RefreshCw } from 'lucide-react';
import { ProviderErrorActions } from './ProviderErrorActions';
import { useAppV2 } from '../../AppV2';
import { send } from '../../utils/vscode';
import type { LLMProvider } from '../../state/types-v2';

/**
 * Get theme-aware logo URI (VIB-65)
 */
function getThemeLogoUri(theme: 'light' | 'dark' | 'high-contrast'): string | undefined {
  const isLight = theme === 'light';
  return isLight
    ? (window as any).DEVARK_LOGO_URI
    : (window as any).DEVARK_LOGO_WHITE_URI || (window as any).DEVARK_LOGO_URI;
}

export function OnboardingView() {
  const { state, dispatch } = useAppV2();
  // Default provider based on platform: cursor-cli for Cursor, claude-agent-sdk for VS Code
  const defaultProvider = state.editorInfo?.isCursor ? 'cursor-cli' : 'claude-agent-sdk';
  const [selectedProvider, setSelectedProvider] = useState<string>(defaultProvider);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);

  // Auto-detect on mount
  useEffect(() => {
    handleAutoDetect();
  }, []);

  // Update selected provider when editorInfo becomes available
  useEffect(() => {
    if (state.editorInfo) {
      const platformDefault = state.editorInfo.isCursor ? 'cursor-cli' : 'claude-agent-sdk';
      setSelectedProvider(platformDefault);
    }
  }, [state.editorInfo?.isCursor]);

  // Auto-enable Claude Agent SDK when detected as 'available' (VIB-58)
  useEffect(() => {
    const claudeSDK = state.providers.find((p) => p.id === 'claude-agent-sdk');
    if (claudeSDK?.status === 'available') {
      send('switchProvider', { providerId: 'claude-agent-sdk' });
    }
  }, [state.providers]);

  const handleAutoDetect = () => {
    setIsDetecting(true);
    send('detectProviders');

    // Simulate detection timeout
    setTimeout(() => setIsDetecting(false), 2000);
  };

  const handleProviderClick = (provider: LLMProvider) => {
    setSelectedProvider(provider.id);

    // If provider is available (CLI detected), automatically enable it
    if (provider.status === 'available' && (provider.type === 'cli' || provider.type === 'local')) {
      send('switchProvider', { providerId: provider.id });
    }
  };

  const handleStart = () => {
    send('completeOnboarding', {
      provider: selectedProvider,
      autoAnalyze,
    });
    dispatch({ type: 'SET_ACTIVE_PROVIDER', payload: selectedProvider });
    dispatch({ type: 'COMPLETE_ONBOARDING' });
  };

  const getProviderStatus = (provider: LLMProvider) => {
    switch (provider.status) {
      case 'connected':
        return { badge: 'Connected', badgeClass: 'connected' };
      case 'not-detected':
        return { badge: 'Not detected', badgeClass: 'error' };
      case 'not-running':
        return { badge: 'Not running', badgeClass: 'error' };
      case 'not-logged-in':
        return { badge: 'Not logged in', badgeClass: 'error' };
      case 'available':
        return { badge: 'Click to enable', badgeClass: 'info' };
      case 'not-configured':
        return { badge: 'Needs setup', badgeClass: '' };
      default:
        return { badge: 'Auto-detect', badgeClass: '' };
    }
  };

  const selectedProviderData = state.providers.find((p) => p.id === selectedProvider);
  const canStart =
    selectedProviderData &&
    (selectedProviderData.status === 'connected' ||
     selectedProviderData.status === 'available' ||
     (selectedProviderData.type === 'cloud' && selectedProviderData.requiresApiKey));

  const logoUri = getThemeLogoUri(state.theme);

  return (
    <div className="vl-onboarding">
      {/* Logo */}
      <div className="vl-onboarding-logo">
        {logoUri ? (
          <img
            src={logoUri}
            alt="DevArk"
            style={{
              width: '80px',
              height: '80px',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : (
          <div
            className="vl-logo-fallback"
            style={{
              width: '80px',
              height: '80px',
              fontSize: '24px',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            VL
          </div>
        )}
      </div>

      {/* Tagline */}
      <div className="vl-onboarding-tagline">Focus. Discover. Grow. Ship.</div>

      {/* Value Props */}
      <div className="vl-value-props">
        <div className="vl-value-prop">
          <div className="vl-value-prop-title">1. Prompt Smarter</div>
          <div className="vl-value-prop-desc">
            Score prompts in real time.
            <br />
            Get instant rewrites that work better.
          </div>
        </div>

        <div className="vl-value-prop">
          <div className="vl-value-prop-title">2. Understand Your Patterns</div>
          <div className="vl-value-prop-desc">
            See what you built today.
            <br />
            Track prompt quality trends.
          </div>
        </div>

        <div className="vl-value-prop">
          <div className="vl-value-prop-title">3. Prep Your Standups</div>
          <div className="vl-value-prop-desc">
            Yesterday&apos;s work, summarized. Ready for standup.
            <br />
            <span
              className="vl-value-prop-link"
              onClick={() => {
                dispatch({ type: 'SET_VIEW', payload: 'main' });
                dispatch({ type: 'SET_TAB', payload: 'account' });
              }}
            >
              Get cloud sync <ArrowRight size={12} style={{ display: 'inline' }} />
            </span>
          </div>
        </div>
      </div>

      {/* LLM Selection */}
      <div className="vl-section-title">Select Your LLM</div>
      <div className="vl-llm-selection">
        {state.providers.map((provider) => {
          const status = getProviderStatus(provider);
          const isSelected = selectedProvider === provider.id;

          return (
            <div
              key={provider.id}
              className={`vl-llm-option ${isSelected ? 'selected' : ''}`}
              onClick={() => handleProviderClick(provider)}
            >
              <div className="vl-llm-radio" />
              <div className="vl-llm-content">
                <div className="vl-llm-header">
                  <span className="vl-llm-title">{provider.name}</span>
                  {isDetecting && isSelected ? (
                    <span className="vl-llm-badge">
                      <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />{' '}
                      Detecting...
                    </span>
                  ) : (
                    <span className={`vl-llm-badge ${status.badgeClass}`}>{status.badge}</span>
                  )}
                </div>
                <div className="vl-llm-description">{provider.description}</div>

                {/* Ollama model selection dropdown */}
                {isSelected && provider.id === 'ollama' && provider.availableModels && provider.availableModels.length > 0 && (
                  <div style={{ marginTop: 'var(--space-md)' }}>
                    <select
                      value={provider.model || provider.availableModels[0]}
                      onChange={(e) => send('setOllamaModel', { model: e.target.value })}
                      className="vl-model-select"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {provider.availableModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: '10px', opacity: 0.6, marginTop: 'var(--space-xs)' }}>
                      {provider.availableModels.length} model{provider.availableModels.length !== 1 ? 's' : ''} available
                    </div>
                  </div>
                )}

                {/* Show model info when not selected or not Ollama */}
                {(!isSelected || provider.id !== 'ollama') && provider.model && provider.status === 'connected' && (
                  <div className="vl-llm-model">
                    Model: {provider.model}
                    {provider.availableModels && provider.availableModels.length > 1 && (
                      <span style={{ opacity: 0.6, fontSize: '10px', marginLeft: '4px' }}>
                        ({provider.availableModels.length} available)
                      </span>
                    )}
                  </div>
                )}

                {provider.availableModels && provider.availableModels.length === 0 && provider.id === 'ollama' && (
                  <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '4px' }}>
                    No models found. Run: <code style={{ fontFamily: 'var(--font-mono)' }}>ollama pull llama3.2</code>
                  </div>
                )}

                {/* Error states with actions */}
                {isSelected && <ProviderErrorActions provider={provider} onRetry={handleAutoDetect} />}

                {/* Cloud API setup */}
                {isSelected && provider.id === 'openrouter' && (
                  <div style={{ marginTop: 'var(--space-md)' }}>
                    <div className="vl-flex vl-gap-sm" style={{ marginBottom: 'var(--space-sm)' }}>
                      <select
                        style={{
                          flex: 1,
                          padding: 'var(--space-sm)',
                          background: 'var(--vscode-input-background)',
                          border: '1px solid var(--vscode-input-border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--vscode-input-foreground)',
                          fontSize: '12px',
                        }}
                      >
                        <option value="openrouter">OpenRouter</option>
                        <option value="anthropic">Anthropic API</option>
                        <option value="bedrock">AWS Bedrock</option>
                      </select>
                    </div>
                    <div className="vl-flex vl-gap-sm">
                      <input
                        type="password"
                        placeholder="API Key"
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
                      <button className="vl-action-btn">Verify</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Checkboxes */}
      <div className="vl-checkboxes">
        <label className="vl-checkbox-item" onClick={() => setAutoAnalyze(!autoAnalyze)}>
          <div className={`vl-checkbox ${autoAnalyze ? 'checked' : ''}`}>
            <Check size={10} className="vl-checkbox-check" />
          </div>
          <span className="vl-checkbox-label">Auto-analyze prompt</span>
        </label>
      </div>

      {/* Start Button */}
      <button className="vl-start-btn" onClick={handleStart} disabled={!canStart}>
        Start
      </button>

      {!canStart && (
        <div style={{ marginTop: 'var(--space-md)', fontSize: '11px', opacity: 0.6, textAlign: 'center' }}>
          {selectedProviderData?.type === 'cloud'
            ? 'Enter your API key to continue'
            : 'Connect to a provider to continue'}
        </div>
      )}
    </div>
  );
}
