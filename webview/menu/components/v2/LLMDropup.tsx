/**
 * LLMDropup - Footer LLM Provider Selector
 *
 * Shows:
 * - List of configured providers with status
 * - Quick switch between providers
 * - Link to configure more providers
 */

import { useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import type { LLMProvider } from '../../state/types-v2';

interface LLMDropupProps {
  providers: LLMProvider[];
  activeProvider: string | null;
  onSelect: (providerId: string) => void;
  onConfigure: () => void;
  onClose: () => void;
}

export function LLMDropup({
  providers,
  activeProvider,
  onSelect,
  onConfigure,
  onClose,
}: LLMDropupProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const getStatusLabel = (provider: LLMProvider) => {
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

  // Sort providers: connected first, then by name
  const sortedProviders = [...providers].sort((a, b) => {
    if (a.status === 'connected' && b.status !== 'connected') return -1;
    if (a.status !== 'connected' && b.status === 'connected') return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="vl-llm-dropup" ref={ref}>
      <div className="vl-dropup-header">Select LLM</div>

      <div className="vl-dropup-list">
        {sortedProviders.map((provider) => {
          const status = getStatusLabel(provider);
          const isActive = provider.id === activeProvider;
          const canSelect = provider.status === 'connected' || provider.status === 'available';

          return (
            <div
              key={provider.id}
              className={`vl-provider-item ${isActive ? 'active' : ''}`}
              onClick={() => canSelect && onSelect(provider.id)}
              style={{ opacity: canSelect ? 1 : 0.5, cursor: canSelect ? 'pointer' : 'default' }}
            >
              <div className="vl-provider-info">
                <div className="vl-provider-radio" />
                <div>
                  <div className="vl-provider-name">
                    {provider.name}
                    {provider.model && provider.status === 'connected' && (
                      <span style={{ opacity: 0.6, fontWeight: 'normal', marginLeft: '4px' }}>
                        ({provider.model})
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <span className={`vl-llm-status ${status.className}`}>{status.text}</span>
            </div>
          );
        })}
      </div>

      <div className="vl-dropup-footer">
        <span className="vl-configure-link" onClick={onConfigure}>
          <Plus size={14} />
          Configure more providers
        </span>
      </div>
    </div>
  );
}
