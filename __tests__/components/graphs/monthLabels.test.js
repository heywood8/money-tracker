import {
  MONTH_SHORT_KEYS,
  MONTH_ABBREVIATIONS_FALLBACK,
  getMonthAbbreviations,
  labelGapFor,
  measureLabelWidth,
  measureWidestLabel,
  resolveLabelStride,
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

  describe('measureLabelWidth', () => {
    // Victory measures a label as the sum of its glyph advances; so does this,
    // so the two agree about what fits.
    const font = {
      getSize: () => 9,
      getGlyphIDs: (text) => [...text].map((_, index) => index),
      getGlyphWidths: (glyphs) => glyphs.map(() => 5),
    };

    it('sums the font\'s glyph advances when the font can measure itself', () => {
      expect(measureLabelWidth('Окт', font)).toBe(15);
    });

    it('estimates from the character count when the font cannot', () => {
      expect(measureLabelWidth('Окт', null, 10)).toBeCloseTo(3 * 10 * 0.62, 5);
    });

    it('falls back to the font\'s own size when none is passed', () => {
      expect(measureLabelWidth('Ok', { getSize: () => 10 })).toBeCloseTo(2 * 10 * 0.62, 5);
    });

    it('measures an empty label as nothing', () => {
      expect(measureLabelWidth('', font)).toBe(0);
    });

    it('takes the widest of a set, which is what a tick has to hold', () => {
      expect(measureWidestLabel(['Ja', 'Sept', 'Mar'], null, 10)).toBeCloseTo(4 * 10 * 0.62, 5);
    });
  });

  describe('labelGapFor', () => {
    it('scales the clear space with the axis font', () => {
      // Held in ems so a chart drawing its axis larger asks for more air rather
      // than inheriting a gap sized for somebody else's font.
      expect(labelGapFor(9)).toBe(18);
      expect(labelGapFor(11)).toBe(22);
      expect(labelGapFor(undefined)).toBe(0);
    });
  });

  describe('resolveLabelStride', () => {
    it('labels every month while one is wide enough to hold a label', () => {
      expect(resolveLabelStride(48, 16, 9)).toBe(1);
      expect(resolveLabelStride(16 + labelGapFor(9), 16, 9)).toBe(1);
    });

    it('thins the labels out once a month cannot hold one with room to spare', () => {
      // A wider locale is what tips this: at the trends card's resting 36dp
      // pitch, "Июл" plus its gap does not fit where "Jul" plus its gap does.
      expect(resolveLabelStride(36, 22, 9)).toBe(2);
      expect(resolveLabelStride(36, 15, 9)).toBe(1);
      expect(resolveLabelStride(18, 22, 9)).toBe(3);
    });

    it('asks for more room at a larger axis font', () => {
      expect(resolveLabelStride(36, 19, 9)).toBe(2);
      expect(resolveLabelStride(36, 19, 11)).toBe(2);
      expect(resolveLabelStride(44, 19, 9)).toBe(1);
      expect(resolveLabelStride(44, 19, 11)).toBe(1);
    });

    it('never returns a stride that would drop every label', () => {
      expect(resolveLabelStride(0, 16, 9)).toBe(1);
      expect(resolveLabelStride(-10, 16, 9)).toBe(1);
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
