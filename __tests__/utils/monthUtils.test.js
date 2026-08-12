// __tests__/utils/monthUtils.test.js
import {
  currentMonthKey,
  addMonths,
  formatMonthLabel,
  monthKeyOf,
  monthIndexOf,
  yearOf,
  monthShortLabels,
  fullYearKeyOf,
  isFullYearKey,
  monthElapsedFraction,
} from '../../app/utils/monthUtils';

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

  // The month grid's arithmetic: it works in (year, 0-based index) pairs and
  // hands keys back out, so these are the two directions of that conversion.
  describe('monthKeyOf / yearOf / monthIndexOf', () => {
    it('pads a single-digit month', () => {
      expect(monthKeyOf(2026, 0)).toBe('2026-01');
      expect(monthKeyOf(2026, 8)).toBe('2026-09');
    });

    it('keeps December at index 11 rather than rolling the year', () => {
      expect(monthKeyOf(2026, 11)).toBe('2026-12');
    });

    it('round-trips a key through its parts', () => {
      const key = '2026-03';
      expect(monthKeyOf(yearOf(key), monthIndexOf(key))).toBe(key);
      expect(yearOf(key)).toBe(2026);
      expect(monthIndexOf(key)).toBe(2);
    });

    it('returns numbers, not the key strings', () => {
      expect(yearOf('2026-01')).toBe(2026);
      // '01' as a string would compare and index wrongly.
      expect(monthIndexOf('2026-01')).toBe(0);
    });
  });

  describe('monthShortLabels', () => {
    it('returns twelve labels, January first', () => {
      const labels = monthShortLabels('en');
      expect(labels).toHaveLength(12);
      expect(labels[0]).toMatch(/Jan/);
      expect(labels[11]).toMatch(/Dec/);
    });

    it('names them in the requested language, not the device locale', () => {
      expect(monthShortLabels('de')[2]).toMatch(/Mär|Mrz/);
      expect(monthShortLabels('ru')[0]).not.toBe(monthShortLabels('en')[0]);
    });

    it('capitalises the first letter for locales that lowercase month names', () => {
      monthShortLabels('ru').forEach(label => {
        expect(label[0]).toBe(label[0].toUpperCase());
      });
    });

    it('falls back to the device locale when no language is given', () => {
      expect(monthShortLabels()).toHaveLength(12);
      expect(monthShortLabels().every(l => typeof l === 'string' && l.length > 0)).toBe(true);
    });
  });
  describe('monthElapsedFraction', () => {
    it('is 1 for a month that has already finished', () => {
      expect(monthElapsedFraction(addMonths(currentMonthKey(), -1))).toBe(1);
      expect(monthElapsedFraction('2001-01')).toBe(1);
    });

    it('is 0 for a month that has not started', () => {
      expect(monthElapsedFraction(addMonths(currentMonthKey(), 1))).toBe(0);
      expect(monthElapsedFraction('2999-12')).toBe(0);
    });

    // Today counts as done — "11 of 31 days" on the 11th — which is what a
    // person means by how far into the month they are.
    it('counts today as elapsed in the month in progress', () => {
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      expect(monthElapsedFraction(currentMonthKey())).toBeCloseTo(now.getDate() / daysInMonth, 10);
    });

    it('never leaves the unit interval', () => {
      const fraction = monthElapsedFraction(currentMonthKey());
      expect(fraction).toBeGreaterThan(0);
      expect(fraction).toBeLessThanOrEqual(1);
    });
  });

  describe('whole-year period keys', () => {
    it('builds a YYYY-full key from a year', () => {
      expect(fullYearKeyOf(2026)).toBe('2026-full');
    });

    it('recognises a whole-year key and not a month key', () => {
      expect(isFullYearKey('2026-full')).toBe(true);
      expect(isFullYearKey('2026-01')).toBe(false);
      expect(isFullYearKey('2026-12')).toBe(false);
    });

    it('is safe on absent keys rather than throwing', () => {
      expect(isFullYearKey(undefined)).toBe(false);
      expect(isFullYearKey(null)).toBe(false);
    });

    // The Graphs header reads the year off either kind of key with yearOf, so
    // the two formats have to agree on where the year lives.
    it('keeps the year readable with yearOf', () => {
      expect(yearOf(fullYearKeyOf(2019))).toBe(2019);
    });
  });
});
