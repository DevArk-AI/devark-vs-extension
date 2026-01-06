/**
 * SettingsView - Settings Panel
 *
 * Shows:
 * - Prompt analysis toggle
 * - LLM provider selection
 * - Auto-sync hooks (when authenticated)
 * - Data statistics
 */

import { useState, useEffect } from 'react';
import { X, ExternalLink, RefreshCw, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useAppV2 } from '../../AppV2';
import { send } from '../../utils/vscode';

interface SettingsViewProps {
  onClose: () => void;
}

interface TestResult {
  success: boolean;
  error?: string;
}

export function SettingsView({ onClose }: SettingsViewProps) {
  const { state, dispatch } = useAppV2();
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const activeProvider = state.providers.find((p) => p.id === state.activeProvider);

  // Listen for testProvidersResult messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'testProvidersResult') {
        setIsTesting(false);
        const { results, error } = message.data;

        if (error) {
          setTestResult({ success: false, error });
        } else if (state.activeProvider && results[state.activeProvider]) {
          setTestResult(results[state.activeProvider]);
        } else {
          // Check if any provider succeeded
          const resultValues = Object.values(results) as TestResult[];
          const anySuccess = resultValues.some((r) => r.success);
          setTestResult({ success: anySuccess, error: anySuccess ? undefined : 'No providers connected' });
        }

        // Clear result after 5 seconds
        setTimeout(() => setTestResult(null), 5000);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [state.activeProvider]);

  const handleTestConnection = () => {
    setIsTesting(true);
    setTestResult(null);
    send('testProviders');
  };

  const handleClearData = () => {
    if (confirm('Are you sure you want to clear all local data? This cannot be undone.')) {
      send('clearLocalData');
    }
  };

  return (
    <div className="vl-settings">
      {/* Header */}
      <div className="vl-settings-header">
        <span className="vl-settings-title">Settings</span>
        <button className="vl-close-btn" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      {/* AI Analysis Section */}
      <div className="vl-settings-section">
        <div className="vl-section-title">AI Analysis</div>
        <div className="vl-settings-box">
          {/* Auto-analyze Prompt Toggle */}
          <div className="vl-settings-row">
            <div>
              <div className="vl-settings-label">Auto-analyze prompt</div>
              <div className="vl-settings-desc">Scores prompts you send to AI</div>
            </div>
            <button
              className={`vl-toggle ${state.autoAnalyzeEnabled ? 'active' : ''}`}
              onClick={() => {
                dispatch({ type: 'TOGGLE_AUTO_ANALYZE' });
                send('toggleAutoAnalyze', { enabled: !state.autoAnalyzeEnabled });
              }}
            >
              <div className="vl-toggle-knob" />
            </button>
          </div>

          {/* Auto-analyze Response Toggle */}
          <div className="vl-settings-row">
            <div>
              <div className="vl-settings-label">Auto-analyze response</div>
              <div className="vl-settings-desc">Coaching suggestions after AI responds</div>
            </div>
            <button
              className={`vl-toggle ${state.responseAnalysisEnabled ? 'active' : ''}`}
              onClick={() => {
                dispatch({ type: 'TOGGLE_RESPONSE_ANALYSIS' });
                send('toggleResponseAnalysis', { enabled: !state.responseAnalysisEnabled });
              }}
            >
              <div className="vl-toggle-knob" />
            </button>
          </div>
        </div>
      </div>

      {/* LLM Provider Section */}
      <div className="vl-settings-section">
        <div className="vl-section-title">LLM Provider</div>
        <div className="vl-settings-box">
          <div className="vl-settings-row">
            <div>
              <div className="vl-settings-label">
                Current: {activeProvider?.name || 'Not configured'}
              </div>
              {activeProvider?.status === 'connected' && (
                <div className="vl-settings-desc" style={{ color: 'var(--score-good)' }}>
                  Connected
                </div>
              )}
              {activeProvider?.status === 'not-detected' && (
                <div className="vl-settings-desc" style={{ color: 'var(--score-poor)' }}>
                  Not detected
                </div>
              )}
              {activeProvider?.status === 'not-running' && (
                <div className="vl-settings-desc" style={{ color: 'var(--score-poor)' }}>
                  Not running
                </div>
              )}
            </div>
            <div className="vl-flex vl-gap-sm">
              <button
                className="vl-action-btn"
                onClick={handleTestConnection}
                disabled={isTesting}
              >
                {isTesting ? <><Loader2 size={12} className="vl-spin" /> Testing...</> : 'Test Connection'}
              </button>
              <button
                className="vl-action-btn"
                onClick={() => dispatch({ type: 'SET_VIEW', payload: 'provider-select' })}
              >
                Change Provider
              </button>
            </div>
            {testResult && (
              <div
                style={{
                  marginTop: 'var(--space-sm)',
                  fontSize: '11px',
                  color: testResult.success ? 'var(--score-good)' : 'var(--score-poor)',
                }}
              >
                {testResult.success ? '✓ Connection successful' : `✗ ${testResult.error || 'Connection failed'}`}
              </div>
            )}
          </div>

          {/* Cursor CLI not detected */}
          {activeProvider?.id === 'cursor-cli' && activeProvider?.status === 'not-detected' && (
            <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-sm)', background: 'var(--vscode-inputValidation-warningBackground)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '11px', opacity: 0.9, marginBottom: 'var(--space-sm)' }}>
                Cursor CLI not detected. Make sure Cursor is installed and the CLI is enabled.
              </div>
              <div className="vl-flex vl-gap-sm">
                <button
                  className="vl-action-btn"
                  onClick={() => send('detectProviders')}
                >
                  <RefreshCw size={12} /> Retry
                </button>
                <button
                  className="vl-action-btn"
                  onClick={() => send('openExternal', { url: 'https://cursor.com/docs/cli/overview' })}
                >
                  Install Cursor CLI <ExternalLink size={12} />
                </button>
              </div>
            </div>
          )}

          {/* Ollama not running */}
          {activeProvider?.id === 'ollama' && activeProvider?.status === 'not-running' && (
            <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-sm)', background: 'var(--vscode-inputValidation-warningBackground)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '11px', opacity: 0.9, marginBottom: 'var(--space-sm)' }}>
                Ollama is not running. Start Ollama to continue.
              </div>
              <div className="vl-flex vl-gap-sm">
                <button
                  className="vl-action-btn"
                  onClick={() => send('detectProviders')}
                >
                  <RefreshCw size={12} /> Retry
                </button>
                <button
                  className="vl-action-btn"
                  onClick={() => send('openExternal', { url: 'https://ollama.ai' })}
                >
                  Install Ollama <ExternalLink size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Advanced Model Settings Section */}
      <div className="vl-settings-section">
        <div
          className="vl-section-title vl-clickable vl-flex vl-justify-between vl-items-center"
          onClick={() => setAdvancedExpanded(!advancedExpanded)}
          style={{ cursor: 'pointer' }}
        >
          <span>Advanced Model Settings</span>
          {advancedExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
        {advancedExpanded && (
          <div className="vl-settings-box">
            {/* Enable toggle */}
            <div className="vl-settings-row">
              <div>
                <div className="vl-settings-label">Use different models per feature</div>
                <div className="vl-settings-desc">
                  Configure specialized models for summaries, scoring, and improvement
                </div>
              </div>
              <button
                className={`vl-toggle ${state.featureModels?.enabled ? 'active' : ''}`}
                onClick={() => {
                  send('setFeatureModelsEnabled', {
                    enabled: !state.featureModels?.enabled
                  });
                }}
              >
                <div className="vl-toggle-knob" />
              </button>
            </div>

            {/* Feature-specific dropdowns (only show when enabled) */}
            {state.featureModels?.enabled && (
              <div className="vl-advanced-models">
                {/* Summaries Model */}
                <div className="vl-model-select">
                  <label className="vl-model-label">Summaries</label>
                  <select
                    value={state.featureModels?.summaries || ''}
                    onChange={(e) => send('setFeatureModel', {
                      feature: 'summaries',
                      model: e.target.value
                    })}
                    className="vl-select"
                  >
                    <option value="">Use default provider</option>
                    {state.availableFeatureModels.map(m => (
                      <option key={m.model} value={m.model}>{m.displayName}</option>
                    ))}
                  </select>
                  <div className="vl-model-hint">Best for: longer context, detailed analysis</div>
                </div>

                {/* Prompt Scoring Model */}
                <div className="vl-model-select">
                  <label className="vl-model-label">Prompt Scoring</label>
                  <select
                    value={state.featureModels?.promptScoring || ''}
                    onChange={(e) => send('setFeatureModel', {
                      feature: 'scoring',
                      model: e.target.value
                    })}
                    className="vl-select"
                  >
                    <option value="">Use default provider</option>
                    {state.availableFeatureModels.map(m => (
                      <option key={m.model} value={m.model}>{m.displayName}</option>
                    ))}
                  </select>
                  <div className="vl-model-hint">Best for: fast, lightweight evaluation</div>
                </div>

                {/* Prompt Improvement Model */}
                <div className="vl-model-select">
                  <label className="vl-model-label">Prompt Improvement</label>
                  <select
                    value={state.featureModels?.promptImprovement || ''}
                    onChange={(e) => send('setFeatureModel', {
                      feature: 'improvement',
                      model: e.target.value
                    })}
                    className="vl-select"
                  >
                    <option value="">Use default provider</option>
                    {state.availableFeatureModels.map(m => (
                      <option key={m.model} value={m.model}>{m.displayName}</option>
                    ))}
                  </select>
                  <div className="vl-model-hint">Best for: creative rewriting</div>
                </div>

                {/* Reset Button */}
                <button
                  className="vl-action-btn"
                  style={{ marginTop: 'var(--space-md)' }}
                  onClick={() => send('resetFeatureModels')}
                >
                  Reset to Defaults
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Auto-sync Hooks Section (only when authenticated) */}
      {state.cloud.isConnected && (
        <div className="vl-settings-section">
          <div className="vl-section-title">Auto-Sync Hooks</div>
          <div className="vl-settings-box">
            <div className="vl-settings-row">
              <div>
                <div className="vl-settings-label">
                  Status: {state.cloud.autoSyncEnabled ? 'Installed' : 'Not installed'}
                </div>
                <div className="vl-settings-desc">Track sessions automatically when you code.</div>
              </div>
              <span
                className="vl-settings-link"
                onClick={() => dispatch({ type: 'SET_VIEW', payload: 'hook-setup' })}
              >
                {state.cloud.autoSyncEnabled ? 'Manage hooks' : 'Set up auto-sync'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Data Section */}
      <div className="vl-settings-section">
        <div className="vl-section-title">Data</div>
        <div className="vl-settings-box">
          <div className="vl-data-stats">
            <div className="vl-data-stat">
              <span className="vl-data-stat-label">Local prompts:</span>
              <span className="vl-data-stat-value">{state.recentPrompts.length}</span>
            </div>
            <div className="vl-data-stat">
              <span className="vl-data-stat-label">Analyzed today:</span>
              <span className="vl-data-stat-value">{state.analyzedToday}</span>
            </div>
            {state.cloud.isConnected && (
              <>
                <div className="vl-data-stat">
                  <span className="vl-data-stat-label">Synced prompts:</span>
                  <span className="vl-data-stat-value">-</span>
                </div>
                <div className="vl-data-stat">
                  <span className="vl-data-stat-label">Synced sessions:</span>
                  <span className="vl-data-stat-value">-</span>
                </div>
              </>
            )}
          </div>

          <div className="vl-flex vl-gap-sm" style={{ marginTop: 'var(--space-md)', flexWrap: 'wrap' }}>
            <button
              className="vl-danger-btn"
              onClick={() => {
                if (confirm('Clear your prompt history? This cannot be undone.')) {
                  send('clearPromptHistory');
                  dispatch({ type: 'SET_RECENT_PROMPTS', payload: [] });
                }
              }}
            >
              Clear prompt history
            </button>
            <button className="vl-danger-btn" onClick={handleClearData}>
              Clear all local data
            </button>
          </div>
        </div>
      </div>

      {/* Version */}
      <div style={{ marginTop: 'var(--space-xl)', fontSize: '11px', opacity: 0.5, textAlign: 'center' }}>
        DevArk v0.1.1
      </div>
    </div>
  );
}
