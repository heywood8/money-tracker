/**
 * Tests for the CategorySpendingCard axis formatters.
 *
 * The bars, axes and the press-driven month scrub all live on the Skia canvas
 * (victory-native is virtually mocked in jest.setup.js), so the tick formatters
 * Victory calls via xAxis/yAxis are exported and asserted directly.
 */

import { formatPctTick, formatYTick } from '../../app/components/graphs/CategorySpendingCard';

describe('CategorySpendingCard axis formatters', () => {
  describe('formatYTick', () => {
    it('formats sub-thousand amounts as whole numbers', () => {
      expect(formatYTick(0)).toBe('0');
      expect(formatYTick(42.4)).toBe('42');
      expect(formatYTick(999)).toBe('999');
    });

    it('abbreviates thousands', () => {
      expect(formatYTick(1000)).toBe('1K');
      expect(formatYTick(15400)).toBe('15K');
    });

    it('abbreviates millions with one decimal', () => {
      expect(formatYTick(1000000)).toBe('1.0M');
      expect(formatYTick(2500000)).toBe('2.5M');
    });

    it('accepts the string values Victory may hand back', () => {
      expect(formatYTick('2000')).toBe('2K');
    });
  });

  describe('formatPctTick', () => {
    it('renders whole-percent ticks for the 100%-normalized stack', () => {
      expect(formatPctTick(0)).toBe('0%');
      expect(formatPctTick(50)).toBe('50%');
      expect(formatPctTick(100)).toBe('100%');
    });

    it('rounds fractional ticks', () => {
      expect(formatPctTick(33.333)).toBe('33%');
      expect(formatPctTick('66.7')).toBe('67%');
    });
  });
});
