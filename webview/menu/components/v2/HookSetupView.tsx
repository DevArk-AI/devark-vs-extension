/**
 * HookSetupView - Auto-Sync Hook Setup
 *
 * Shows:
 * - Step 1: Select tools to track
 * - Step 2: Select projects to track
 * - Success confirmation
 */

import { useState, useEffect } from 'react';
import { X, Check, Folder, Plus } from 'lucide-react';
import { useAppV2 } from '../../AppV2';
import { send } from '../../utils/vscode';

interface HookSetupViewProps {
  onClose: () => void;
}

interface DetectedTool {
  id: string;
  name: string;
  detected: boolean;
  installed: boolean;
  selected: boolean;
}

interface Project {
  path: string;
  name: string;
  selected: boolean;
}

export function HookSetupView({ onClose }: HookSetupViewProps) {
  const { dispatch } = useAppV2();
  const [step, setStep] = useState<'tools' | 'projects' | 'success'>('tools');
  const [tools, setTools] = useState<DetectedTool[]>([
    { id: 'cursor', name: 'Cursor', detected: true, installed: false, selected: true },
    { id: 'claude-code', name: 'Claude Code', detected: true, installed: false, selected: true },
  ]);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [trackAllProjects, setTrackAllProjects] = useState(true);
  const [projects, setProjects] = useState<Project[]>([
    { path: '/projects/vibe-log-extension', name: 'vibe-log-extension', selected: false },
    { path: '/projects/api-service', name: 'api-service', selected: false },
    { path: '/projects/docs-site', name: 'docs-site', selected: false },
  ]);
  const [isInstalling, setIsInstalling] = useState(false);

  // Request detected tools, projects and hook status on mount
  useEffect(() => {
    send('getDetectedTools');
    send('getRecentProjects');
    send('getHooksStatus');
  }, []);

  // Listen for messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'projectFolderSelected') {
        const { path, name } = message.data;
        setProjects(prev => {
          if (prev.some(p => p.path === path)) {
            return prev;
          }
          return [...prev, { path, name, selected: true }];
        });
      } else if (message.type === 'hooksStatus') {
        const { claude, cursor } = message.data;
        setTools(prev => prev.map(t => {
          if (t.id === 'cursor') return { ...t, installed: cursor?.installed || false };
          if (t.id === 'claude-code') return { ...t, installed: claude?.installed || false };
          return t;
        }));
      } else if (message.type === 'uninstallHooksComplete') {
        setIsUninstalling(false);
        if (message.data.success) {
          setTools(prev => prev.map(t => ({ ...t, installed: false })));
          setStep('tools');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleToolToggle = (toolId: string) => {
    setTools(tools.map((t) => (t.id === toolId ? { ...t, selected: !t.selected } : t)));
  };

  const handleProjectToggle = (projectPath: string) => {
    setProjects(projects.map((p) => (p.path === projectPath ? { ...p, selected: !p.selected } : p)));
  };

  const handleAddProject = () => {
    send('selectProjectFolder');
  };

  const handleInstall = async () => {
    setIsInstalling(true);

    const selectedTools = tools.filter((t) => t.selected).map((t) => t.id);
    const selectedProjects = trackAllProjects
      ? 'all'
      : projects.filter((p) => p.selected).map((p) => p.path);

    send('installHooks', {
      tools: selectedTools,
      projects: selectedProjects,
    });

    // Wait for installation
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mark selected tools as installed
    setTools(prev => prev.map(t =>
      selectedTools.includes(t.id) ? { ...t, installed: true } : t
    ));

    setIsInstalling(false);
    setStep('success');

    dispatch({ type: 'SET_CLOUD_STATE', payload: { autoSyncEnabled: true } });
  };

  const handleUninstall = () => {
    setIsUninstalling(true);
    send('uninstallHooks', { tools: ['cursor', 'claude-code'] });
  };

  const selectedToolCount = tools.filter((t) => t.selected).length;

  // Step 1: Select Tools
  if (step === 'tools') {
    return (
      <div className="vl-settings">
        <div className="vl-settings-header">
          <span className="vl-settings-title">Set Up Auto-Sync</span>
          <button className="vl-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div style={{ fontSize: '13px', marginBottom: 'var(--space-xl)' }}>
          Track sessions automatically when you code.
        </div>

        <div className="vl-section-title">Step 1: Select Tools to Track</div>

        <div className="vl-settings-box">
          {tools.map((tool) => (
            <div
              key={tool.id}
              className="vl-checkbox-item"
              onClick={() => tool.detected && handleToolToggle(tool.id)}
              style={{
                opacity: tool.detected ? 1 : 0.5,
                cursor: tool.detected ? 'pointer' : 'default',
              }}
            >
              <div className={`vl-checkbox ${tool.selected ? 'checked' : ''}`}>
                <Check size={10} className="vl-checkbox-check" />
              </div>
              <span className="vl-checkbox-label">{tool.name}</span>
              <span
                className={`vl-llm-status ${tool.detected || tool.installed ? 'connected' : ''}`}
                style={{ marginLeft: 'auto' }}
              >
                {tool.installed ? 'Installed' : tool.detected ? 'Detected' : 'Not detected'}
              </span>
            </div>
          ))}
        </div>

        <div className="vl-flex vl-gap-sm" style={{ marginTop: 'var(--space-xl)', justifyContent: 'space-between' }}>
          <div>
            {tools.some(t => t.installed) && (
              <button
                className="vl-action-btn"
                onClick={handleUninstall}
                disabled={isUninstalling}
                style={{ color: 'var(--vscode-errorForeground)' }}
              >
                {isUninstalling ? 'Uninstalling...' : 'Uninstall All Hooks'}
              </button>
            )}
          </div>
          <div className="vl-flex vl-gap-sm">
            <button className="vl-action-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="vl-action-btn primary"
              onClick={() => setStep('projects')}
              disabled={selectedToolCount === 0}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Select Projects
  if (step === 'projects') {
    return (
      <div className="vl-settings">
        <div className="vl-settings-header">
          <span className="vl-settings-title">Set Up Auto-Sync</span>
          <button className="vl-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div style={{ fontSize: '13px', marginBottom: 'var(--space-xl)' }}>
          Track sessions automatically when you code.
        </div>

        <div className="vl-section-title">Step 2: Select Projects to Track</div>

        <div className="vl-settings-box">
          {/* All projects option */}
          <div
            className="vl-checkbox-item"
            onClick={() => setTrackAllProjects(!trackAllProjects)}
            style={{ borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: 'var(--space-md)', marginBottom: 'var(--space-md)' }}
          >
            <div className={`vl-checkbox ${trackAllProjects ? 'checked' : ''}`}>
              <Check size={10} className="vl-checkbox-check" />
            </div>
            <span className="vl-checkbox-label" style={{ fontWeight: 500 }}>
              All projects
            </span>
          </div>

          {/* Specific projects */}
          <div style={{ opacity: trackAllProjects ? 0.4 : 1, pointerEvents: trackAllProjects ? 'none' : 'auto' }}>
            <div style={{ fontSize: '11px', opacity: 0.6, marginBottom: 'var(--space-sm)' }}>Or select specific:</div>
            {projects.map((project) => (
              <div
                key={project.path}
                className="vl-checkbox-item"
                onClick={() => handleProjectToggle(project.path)}
              >
                <div className={`vl-checkbox ${project.selected ? 'checked' : ''}`}>
                  <Check size={10} className="vl-checkbox-check" />
                </div>
                <Folder size={14} style={{ opacity: 0.6 }} />
                <span className="vl-checkbox-label">{project.name}</span>
              </div>
            ))}

            <div
              className="vl-checkbox-item"
              onClick={handleAddProject}
              style={{ color: 'var(--vl-accent)', cursor: 'pointer' }}
            >
              <Plus size={14} />
              <span>Add project path...</span>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 'var(--space-lg)',
            fontSize: '11px',
            opacity: 0.6,
          }}
        >
          Your code stays private. Only session metadata is synced.
        </div>

        <div className="vl-flex vl-gap-sm" style={{ marginTop: 'var(--space-xl)', justifyContent: 'flex-end' }}>
          <button className="vl-action-btn" onClick={() => setStep('tools')}>
            Back
          </button>
          <button className="vl-action-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="vl-action-btn primary" onClick={handleInstall} disabled={isInstalling}>
            {isInstalling ? 'Installing...' : 'Done'}
          </button>
        </div>
      </div>
    );
  }

  // Success Step
  return (
    <div className="vl-settings">
      <div className="vl-settings-header">
        <span className="vl-settings-title">Auto-Sync Ready</span>
        <button className="vl-close-btn" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-2xl)',
          textAlign: 'center',
        }}
      >
        {/* Success Icon */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(74, 222, 128, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 'var(--space-xl)',
          }}
        >
          <Check size={32} style={{ color: 'var(--score-good)' }} />
        </div>

        <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: 'var(--space-xl)' }}>
          Hooks installed!
        </div>

        {/* Tracking Summary */}
        <div
          style={{
            fontSize: '13px',
            marginBottom: 'var(--space-lg)',
          }}
        >
          <div style={{ marginBottom: 'var(--space-md)' }}>Tracking:</div>
          {tools
            .filter((t) => t.selected)
            .map((tool) => (
              <div
                key={tool.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-xs) 0',
                  minWidth: '200px',
                }}
              >
                <span>- {tool.name}</span>
                <span style={{ color: 'var(--score-good)' }}>Installed</span>
              </div>
            ))}
        </div>

        <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: 'var(--space-lg)' }}>
          Projects: {trackAllProjects ? 'All' : `${projects.filter((p) => p.selected).length} selected`}
        </div>

        <div style={{ fontSize: '12px', opacity: 0.7 }}>Sessions will sync automatically.</div>
      </div>

      <div className="vl-flex" style={{ justifyContent: 'center', marginTop: 'var(--space-xl)' }}>
        <button className="vl-action-btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
