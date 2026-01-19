/**
 * DateRangeDialog Component
 *
 * Modal dialog for selecting a custom date range for reports.
 * Uses the DateRangePicker component for calendar selection.
 */

import { useState, useEffect } from 'react';
import { X, CalendarRange } from 'lucide-react';
import { DateRangePicker } from './DateRangePicker';

interface DateRangeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (startDate: Date, endDate: Date) => void;
  isLoading?: boolean;
}

export function DateRangeDialog({
  isOpen,
  onClose,
  onGenerate,
  isLoading
}: DateRangeDialogProps) {
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  // Reset dates when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setStartDate(null);
      setEndDate(null);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleDateChange = (start: Date | null, end: Date | null) => {
    setStartDate(start);
    setEndDate(end);
  };

  const handleGenerate = () => {
    if (startDate && endDate) {
      onGenerate(startDate, endDate);
    }
  };

  const canGenerate = startDate && endDate && !isLoading;

  // Format selected range for display
  const formatSelectedRange = () => {
    if (!startDate || !endDate) return null;
    const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (startDate.getTime() === endDate.getTime()) {
      return formatDate(startDate);
    }
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  };

  if (!isOpen) return null;

  return (
    <div className="vl-dialog-overlay" onClick={onClose}>
      <div className="vl-dialog vl-date-range-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="vl-dialog-header">
          <span className="vl-dialog-icon">
            <CalendarRange size={20} />
          </span>
          <h3 className="vl-dialog-title">Custom Date Range</h3>
          <button className="vl-dialog-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="vl-dialog-content vl-date-dialog-content">
          <p className="vl-dialog-message">
            Select a date range to generate a detailed report.
          </p>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={handleDateChange}
            isSingleDate={false}
          />
          {formatSelectedRange() && (
            <div className="vl-date-selected-range">
              Selected: {formatSelectedRange()}
            </div>
          )}
        </div>
        <div className="vl-dialog-actions">
          <button className="vl-dialog-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="vl-dialog-btn primary"
            onClick={handleGenerate}
            disabled={!canGenerate}
          >
            {isLoading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DateRangeDialog;
