/**
 * Multi Select Component
 *
 * Dropdown for selecting multiple items (e.g., projects)
 */

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

interface MultiSelectProps {
  options: string[];
  value: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select items...',
  className,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = (option: string) => {
    const newValue = value.includes(option)
      ? value.filter((v) => v !== option)
      : [...value, option];
    onChange(newValue);
  };

  const handleSelectAll = () => {
    onChange(value.length === options.length ? [] : options);
  };

  const displayText = value.length === 0
    ? placeholder
    : value.length === options.length
    ? 'All selected'
    : `${value.length} selected`;

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="input w-full text-left flex items-center justify-between gap-2"
        aria-label="Select options"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={cn(value.length === 0 && 'text-gray-400')}>
          {displayText}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-gray-400 transition-transform',
            isOpen && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          className="absolute z-10 mt-1 w-full bg-vscode-input border border-vscode-inputBorder rounded-vscode shadow-vscode max-h-60 overflow-auto animate-fade-in"
          role="listbox"
          aria-multiselectable="true"
        >
          {/* Select All option */}
          <button
            type="button"
            onClick={handleSelectAll}
            className="w-full px-3 py-2 text-left hover:bg-white/5 focus:bg-white/5 focus:outline-none text-sm border-b border-vscode-border font-medium"
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'h-4 w-4 border rounded flex items-center justify-center',
                  value.length === options.length
                    ? 'bg-primary border-primary'
                    : 'border-gray-400'
                )}
              >
                {value.length === options.length && (
                  <Check className="h-3 w-3 text-white" aria-hidden="true" />
                )}
              </div>
              <span>Select All</span>
            </div>
          </button>

          {/* Individual options */}
          {options.map((option) => {
            const isSelected = value.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => handleToggle(option)}
                className="w-full px-3 py-2 text-left hover:bg-white/5 focus:bg-white/5 focus:outline-none text-sm"
                role="option"
                aria-selected={isSelected}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'h-4 w-4 border rounded flex items-center justify-center',
                      isSelected
                        ? 'bg-primary border-primary'
                        : 'border-gray-400'
                    )}
                  >
                    {isSelected && (
                      <Check className="h-3 w-3 text-white" aria-hidden="true" />
                    )}
                  </div>
                  <span>{option}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
