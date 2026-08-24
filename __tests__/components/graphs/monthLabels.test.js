import {
  MONTH_SHORT_KEYS,
  MONTH_ABBREVIATIONS_FALLBACK,
  getMonthAbbreviations,
} from '../../../app/components/graphs/monthLabels';

import en from '../../../assets/i18n/en.json';
import ru from '../../../assets/i18n/ru.json';
import ja from '../../../assets/i18n/ja.json';

const translatorFor = (dictionary) => (key) => dictionary[key] || key;

describe('monthLabels', () => {
  describe('getMonthAbbreviations', () => {
    it('returns twelve labels indexed by month number', () => {
      const labels = getMonthAbbreviations(translatorFor(en));
      expect(labels).toHaveLength(12);
      expect(labels[0]).toBe('Jan');
      expect(labels[9]).toBe('Oct');
      expect(labels[11]).toBe('Dec');
    });

    it('speaks the active language rather than English', () => {
      expect(getMonthAbbreviations(translatorFor(ru))[9]).toBe('Окт');
      expect(getMonthAbbreviations(translatorFor(ja))[9]).toBe('10月');
    });

    it('never repeats a label within a language', () => {
      [en, ru, ja].forEach((dictionary) => {
        const labels = getMonthAbbreviations(translatorFor(dictionary));
        expect(new Set(labels).size).toBe(12);
      });
    });

    it('falls back to English when a locale has no short month entry', () => {
      // `t()` hands back the key itself for a missing translation, and a raw
      // key drawn on an axis is worse than an English abbreviation.
      const labels = getMonthAbbreviations((key) => key);
      expect(labels).toEqual(MONTH_ABBREVIATIONS_FALLBACK);
    });

    it('falls back when handed no translator at all', () => {
      expect(getMonthAbbreviations(undefined)).toEqual(MONTH_ABBREVIATIONS_FALLBACK);
    });
  });

  describe('translations', () => {
    it('ships a short label for every month in English and Russian', () => {
      MONTH_SHORT_KEYS.forEach((key) => {
        expect(typeof en[key]).toBe('string');
        expect(typeof ru[key]).toBe('string');
      });
    });
  });
});
