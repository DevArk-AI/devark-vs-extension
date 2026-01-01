/**
 * Duration Calculator Tests - TDD
 *
 * These tests are written FIRST, before implementation exists.
 * Tests should FAIL initially (RED phase).
 */

import { describe, it, expect } from 'vitest';
import {
  calculateDuration,
  MAX_IDLE_GAP,
  MAX_SESSION_DURATION,
  type TimestampedItem,
} from '../duration-calculator';

// Helper to create timestamped items at specific intervals
function createItems(timestamps: Date[]): TimestampedItem[] {
  return timestamps.map((timestamp) => ({ timestamp }));
}

// Helper to create items with minute intervals from a base time
function createItemsWithMinuteGaps(
  baseTime: Date,
  minuteGaps: number[]
): TimestampedItem[] {
  const items: TimestampedItem[] = [{ timestamp: baseTime }];
  let currentTime = baseTime.getTime();

  for (const gap of minuteGaps) {
    currentTime += gap * 60 * 1000; // Convert minutes to milliseconds
    items.push({ timestamp: new Date(currentTime) });
  }

  return items;
}

describe('DurationCalculator', () => {
  describe('constants', () => {
    it('MAX_IDLE_GAP is 15 minutes in seconds', () => {
      expect(MAX_IDLE_GAP).toBe(15 * 60);
    });

    it('MAX_SESSION_DURATION is 8 hours in seconds', () => {
      expect(MAX_SESSION_DURATION).toBe(8 * 60 * 60);
    });
  });

  describe('calculateDuration()', () => {
    describe('edge cases', () => {
      it('returns 0 duration and 0 gaps for empty array', () => {
        const result = calculateDuration([]);
        expect(result.durationSeconds).toBe(0);
        expect(result.activeGaps).toBe(0);
        expect(result.idleGaps).toBe(0);
      });

      it('returns 0 duration and 0 gaps for single item', () => {
        const items = createItems([new Date()]);
        const result = calculateDuration(items);
        expect(result.durationSeconds).toBe(0);
        expect(result.activeGaps).toBe(0);
        expect(result.idleGaps).toBe(0);
      });

      it('returns 0 duration for identical timestamps', () => {
        const sameTime = new Date();
        const items = createItems([sameTime, sameTime, sameTime]);
        const result = calculateDuration(items);
        expect(result.durationSeconds).toBe(0);
        // Zero gaps should not count as active or idle
        expect(result.activeGaps).toBe(0);
        expect(result.idleGaps).toBe(0);
      });
    });

    describe('active gaps (within 15 minutes)', () => {
      it('counts 5 minute gap as active time', () => {
        const base = new Date('2024-01-01T10:00:00');
        const items = createItemsWithMinuteGaps(base, [5]);
        const result = calculateDuration(items);
        expect(result.durationSeconds).toBe(300); // 5 minutes = 300 seconds
        expect(result.activeGaps).toBe(1);
        expect(result.idleGaps).toBe(0);
      });

      it('includes exactly 15 minute gap (boundary)', () => {
        const base = new Date('2024-01-01T10:00:00');
        const items = createItemsWithMinuteGaps(base, [15]);
        const result = calculateDuration(items);
        expect(result.durationSeconds).toBe(900); // 15 minutes = 900 seconds
        expect(result.activeGaps).toBe(1);
        expect(result.idleGaps).toBe(0);
      });
    });

    describe('idle gaps (over 15 minutes)', () => {
      it('excludes 20 minute gap as idle', () => {
        const base = new Date('2024-01-01T10:00:00');
        const items = createItemsWithMinuteGaps(base, [20]);
        const result = calculateDuration(items);
        expect(result.durationSeconds).toBe(0);
        expect(result.activeGaps).toBe(0);
        expect(result.idleGaps).toBe(1);
      });

      it('excludes 15m01s gap (just over boundary)', () => {
        const base = new Date('2024-01-01T10:00:00');
        // 15 minutes and 1 second
        const items = createItems([
          base,
          new Date(base.getTime() + 15 * 60 * 1000 + 1000),
        ]);
        const result = calculateDuration(items);
        expect(result.durationSeconds).toBe(0);
        expect(result.activeGaps).toBe(0);
        expect(result.idleGaps).toBe(1);
      });
    });

    describe('mixed gaps', () => {
      it('counts only active gaps in mixed sequence', () => {
        const base = new Date('2024-01-01T10:00:00');
        // 5 min (active) + 20 min (idle) = should only count 300 seconds
        const items = createItemsWithMinuteGaps(base, [5, 20]);
        const result = calculateDuration(items);
        expect(result.durationSeconds).toBe(300);
        expect(result.activeGaps).toBe(1);
        expect(result.idleGaps).toBe(1);
      });

      it('handles multiple active and idle gaps', () => {
        const base = new Date('2024-01-01T10:00:00');
        // 3 min + 10 min + 30 min (idle) + 5 min + 60 min (idle) + 2 min
        const items = createItemsWithMinuteGaps(base, [3, 10, 30, 5, 60, 2]);
        const result = calculateDuration(items);
        // Active: 3 + 10 + 5 + 2 = 20 minutes = 1200 seconds
        expect(result.durationSeconds).toBe(1200);
        expect(result.activeGaps).toBe(4);
        expect(result.idleGaps).toBe(2);
      });
    });

    describe('duration capping', () => {
      it('caps duration at 8 hours maximum', () => {
        const base = new Date('2024-01-01T10:00:00');
        // Create many 10-minute gaps to exceed 8 hours
        // 8 hours = 480 minutes, so 50 gaps of 10 minutes = 500 minutes
        const gaps = Array(50).fill(10);
        const items = createItemsWithMinuteGaps(base, gaps);
        const result = calculateDuration(items);
        expect(result.durationSeconds).toBe(MAX_SESSION_DURATION);
        expect(result.durationSeconds).toBe(28800); // 8 hours in seconds
      });
    });

    describe('negative/backwards timestamps', () => {
      it('ignores negative gaps (backwards timestamps)', () => {
        const base = new Date('2024-01-01T10:00:00');
        const items = createItems([
          base,
          new Date(base.getTime() + 5 * 60 * 1000), // +5 min
          new Date(base.getTime() + 3 * 60 * 1000), // -2 min (backwards!)
          new Date(base.getTime() + 8 * 60 * 1000), // +5 min from previous
        ]);
        const result = calculateDuration(items);
        // Only the first gap (5 min) and last gap (5 min) should count
        // The backwards gap should be ignored (not counted as active or idle)
        expect(result.durationSeconds).toBe(600); // 5 + 5 = 10 minutes
        expect(result.activeGaps).toBe(2);
      });
    });

    describe('performance', () => {
      it('handles large number of items efficiently', () => {
        const base = new Date('2024-01-01T10:00:00');
        // Create 1000 items with 1-minute gaps
        const gaps = Array(999).fill(1);
        const items = createItemsWithMinuteGaps(base, gaps);

        const start = performance.now();
        const result = calculateDuration(items);
        const duration = performance.now() - start;

        // Should complete in under 50ms even for 1000 items
        expect(duration).toBeLessThan(50);
        // 999 gaps of 1 minute each = 999 minutes, capped at 8 hours
        expect(result.durationSeconds).toBe(MAX_SESSION_DURATION);
        expect(result.activeGaps).toBe(999);
      });
    });

    describe('generic type support', () => {
      it('works with objects that have additional properties', () => {
        interface Message extends TimestampedItem {
          role: string;
          content: string;
        }

        const base = new Date('2024-01-01T10:00:00');
        const messages: Message[] = [
          { timestamp: base, role: 'user', content: 'hello' },
          {
            timestamp: new Date(base.getTime() + 5 * 60 * 1000),
            role: 'assistant',
            content: 'hi',
          },
        ];

        const result = calculateDuration(messages);
        expect(result.durationSeconds).toBe(300);
        expect(result.activeGaps).toBe(1);
      });
    });
  });
});
