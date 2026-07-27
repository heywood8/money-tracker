// __tests__/utils/monthUtils.test.js
import { currentMonthKey, addMonths, formatMonthLabel, monthProgressFraction } from '../../app/utils/monthUtils';

describe('monthUtils', () => {
  describe('currentMonthKey', () => {
    it('formats the current local month as YYYY-MM', () => {
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      expect(currentMonthKey()).toBe(expected);
    });
  });

  describe('addMonths', () => {
    it('shifts forward and backward', () => {
      expect(addMonths('2026-07', 1)).toBe('2026-08');
      expect(addMonths('2026-07', -1)).toBe('2026-06');
    });

    it('rolls over year boundaries in both directions', () => {
      expect(addMonths('2026-12', 1)).toBe('2027-01');
      expect(addMonths('2026-01', -1)).toBe('2025-12');
      expect(addMonths('2026-07', 12)).toBe('2027-07');
    });

    it('is a no-op for a zero delta', () => {
      expect(addMonths('2026-07', 0)).toBe('2026-07');
    });
  });

  describe('formatMonthLabel', () => {
    it('formats in the requested language, not the device locale', () => {
      // Regression: the label used toLocaleDateString(undefined, …), so a device
      // left in English printed "July 2026" across an otherwise Russian screen.
      // The app's language is independent of the OS locale here.
      expect(formatMonthLabel('2026-07', 'en')).toMatch(/July/);
      expect(formatMonthLabel('2026-07', 'ru')).toMatch(/июл/i);
      expect(formatMonthLabel('2026-07', 'de')).toMatch(/Juli/);
    });

    it('capitalises the first letter for locales that lowercase month names', () => {
      const label = formatMonthLabel('2026-07', 'ru');
      expect(label[0]).toBe(label[0].toUpperCase());
    });

    it('includes the year', () => {
      expect(formatMonthLabel('2026-07', 'en')).toMatch(/2026/);
    });

    it('falls back to the device locale when no language is given', () => {
      expect(typeof formatMonthLabel('2026-07')).toBe('string');
      expect(formatMonthLabel('2026-07')).toMatch(/2026/);
    });
  });

  describe('monthProgressFraction', () => {
    it('returns how far through the current month today is', () => {
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      expect(monthProgressFraction(currentMonthKey())).toBeCloseTo(now.getDate() / daysInMonth, 10);
    });

    it('stays within (0, 1]', () => {
      const fraction = monthProgressFraction(currentMonthKey());
      expect(fraction).toBeGreaterThan(0);
      expect(fraction).toBeLessThanOrEqual(1);
    });

    it('returns null for any month but the current one', () => {
      // A past month is fully spent and a future one has not started, so "are
      // you ahead of pace" is not a question either can answer — the caller
      // draws no today marker at all rather than pinning one to an edge.
      expect(monthProgressFraction(addMonths(currentMonthKey(), -1))).toBeNull();
      expect(monthProgressFraction(addMonths(currentMonthKey(), 1))).toBeNull();
      expect(monthProgressFraction('2020-01')).toBeNull();
    });
  });
});
