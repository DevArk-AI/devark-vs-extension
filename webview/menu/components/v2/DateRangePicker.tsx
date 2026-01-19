/**
 * DateRangePicker Component
 *
 * Allows users to select either:
 * - A single date (same start and end date)
 * - A date range (different start and end dates)
 *
 * Prevents selection of future dates.
 * Uses inline calendar for better UX in dropdown.
 *
 * SINGLE MODE: Shows one calendar for single date selection
 * RANGE MODE: Shows TWO calendars side-by-side (Start Date | End Date)
 */

import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Custom header with explicit navigation buttons
interface CustomHeaderProps {
  date: Date;
  decreaseMonth: () => void;
  increaseMonth: () => void;
  prevMonthButtonDisabled: boolean;
  nextMonthButtonDisabled: boolean;
}

function CustomHeader({
  date,
  decreaseMonth,
  increaseMonth,
  prevMonthButtonDisabled,
  nextMonthButtonDisabled
}: CustomHeaderProps) {
  const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="vl-datepicker-header">
      <button
        type="button"
        className="vl-datepicker-nav-btn"
        onClick={decreaseMonth}
        disabled={prevMonthButtonDisabled}
        aria-label="Previous month"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="vl-datepicker-month-year">{monthYear}</span>
      <button
        type="button"
        className="vl-datepicker-nav-btn"
        onClick={increaseMonth}
        disabled={nextMonthButtonDisabled}
        aria-label="Next month"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export interface DateRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onChange: (startDate: Date | null, endDate: Date | null) => void;
  isSingleDate?: boolean; // If true, only allow single date selection
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  isSingleDate = false
}: DateRangePickerProps) {
  const maxDate = new Date(); // Today - cannot select future dates

  // Single date mode handler
  const handleSingleDateChange = (date: Date | null) => {
    onChange(date, date);
  };

  // Range mode handlers - separate handlers for start and end
  const handleStartDateChange = (date: Date | null) => {
    // If new start date is after current end date, reset end date
    if (date && endDate && date > endDate) {
      onChange(date, date);
    } else {
      onChange(date, endDate);
    }
  };

  const handleEndDateChange = (date: Date | null) => {
    // If new end date is before current start date, set both to same date
    if (date && startDate && date < startDate) {
      onChange(date, date);
    } else {
      onChange(startDate, date);
    }
  };

  // Format day names to 2-letter abbreviations
  // CRITICAL: Must return ONLY 2 letters, nothing else
  const formatWeekDay = (dayName: string): string => {
    const twoLetters = dayName.substring(0, 2);
    return twoLetters;
  };

  if (isSingleDate) {
    // SINGLE DATE MODE: One calendar
    return (
      <div className="vl-date-range-picker">
        <div className="vl-calendar-label">Select Date</div>
        <DatePicker
          selected={startDate}
          onChange={handleSingleDateChange}
          inline
          maxDate={maxDate}
          calendarClassName="vl-inline-calendar"
          monthsShown={1}
          showPopperArrow={false}
          formatWeekDay={formatWeekDay}
          renderCustomHeader={CustomHeader}
        />
      </div>
    );
  }

  // RANGE MODE: Two calendars side-by-side
  return (
    <div className="vl-date-range-picker">
      <div className="vl-dual-calendar-container">
        <div className="vl-calendar-column">
          <div className="vl-calendar-label">Start Date</div>
          <DatePicker
            selected={startDate}
            onChange={handleStartDateChange}
            selectsStart
            startDate={startDate}
            endDate={endDate}
            inline
            maxDate={maxDate}
            calendarClassName="vl-inline-calendar"
            monthsShown={1}
            showPopperArrow={false}
            formatWeekDay={formatWeekDay}
            renderCustomHeader={CustomHeader}
          />
        </div>
        <div className="vl-calendar-column">
          <div className="vl-calendar-label">End Date</div>
          <DatePicker
            selected={endDate}
            onChange={handleEndDateChange}
            selectsEnd
            startDate={startDate}
            endDate={endDate}
            minDate={startDate ?? undefined}
            inline
            maxDate={maxDate}
            calendarClassName="vl-inline-calendar"
            monthsShown={1}
            showPopperArrow={false}
            formatWeekDay={formatWeekDay}
            renderCustomHeader={CustomHeader}
          />
        </div>
      </div>
    </div>
  );
}
