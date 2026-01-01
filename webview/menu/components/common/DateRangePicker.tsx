/**
 * Date Range Picker Component
 *
 * Allows selection of preset date ranges or custom dates
 */

import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { Calendar } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface DateRange {
  start: Date;
  end: Date;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

const presets = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: null },
];

export function DateRangePicker({
  value,
  onChange,
  className,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handlePresetClick = (days: number | null) => {
    const end = new Date();
    const start = days ? subDays(end, days) : new Date(0); // Epoch for "all time"
    onChange({ start, end });
    setIsOpen(false);
  };

  const formatRange = (range: DateRange) => {
    if (range.start.getTime() === new Date(0).getTime()) {
      return 'All time';
    }
    return `${format(range.start, 'MMM d, yyyy')} - ${format(range.end, 'MMM d, yyyy')}`;
  };

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="input w-full text-left flex items-center gap-2"
        aria-label="Select date range"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <Calendar className="h-4 w-4 text-gray-400" aria-hidden="true" />
        <span className="flex-1">{formatRange(value)}</span>
        <svg
          className={cn(
            'h-4 w-4 text-gray-400 transition-transform',
            isOpen && 'rotate-180'
          )}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute z-10 mt-1 w-full bg-vscode-input border border-vscode-inputBorder rounded-vscode shadow-vscode animate-fade-in"
          role="listbox"
        >
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handlePresetClick(preset.days)}
              className="w-full px-3 py-2 text-left hover:bg-white/5 focus:bg-white/5 focus:outline-none text-sm"
              role="option"
            >
              {preset.label}
            </button>
          ))}
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
