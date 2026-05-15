/**
 * Tests for the shared search-text normalizer used by both in-memory
 * filtering (OperationsDataContext) and SQL filtering (db.js → SEARCH_NORM).
 *
 * The pipeline is NFC → lowercase → ё→е, and the regression motivating it is
 * the Russian keyboard autocomplete bug where typing "Самолет" gets submitted
 * as "Самолёт" — both spellings have to normalize to the same string.
 */

import { normalizeSearchText } from '../../app/services/searchNormalize';

describe('normalizeSearchText', () => {
  describe('null/undefined handling', () => {
    it('returns null for null', () => {
      expect(normalizeSearchText(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(normalizeSearchText(undefined)).toBeNull();
    });

    it('returns empty string for empty string', () => {
      expect(normalizeSearchText('')).toBe('');
    });
  });

  describe('case folding', () => {
    it('lowercases ASCII', () => {
      expect(normalizeSearchText('COFFEE')).toBe('coffee');
      expect(normalizeSearchText('Mixed Case')).toBe('mixed case');
    });

    it('lowercases Cyrillic (which SQLite LOWER() does not)', () => {
      expect(normalizeSearchText('Транспорт')).toBe('транспорт');
      expect(normalizeSearchText('САМОЛЕТ')).toBe('самолет');
      expect(normalizeSearchText('Путешествия')).toBe('путешествия');
    });

    it('lowercases accented Latin', () => {
      expect(normalizeSearchText('Café')).toBe('café');
      expect(normalizeSearchText('München')).toBe('münchen');
    });
  });

  describe('ё → е folding (Russian yo-folding)', () => {
    it('folds lowercase ё', () => {
      expect(normalizeSearchText('ёжик')).toBe('ежик');
      expect(normalizeSearchText('самолёт')).toBe('самолет');
    });

    it('folds uppercase Ё by way of lowercasing first', () => {
      expect(normalizeSearchText('Ёлка')).toBe('елка');
      expect(normalizeSearchText('САМОЛЁТ')).toBe('самолет');
    });

    it('makes "Самолет" and "Самолёт" compare equal', () => {
      // Regression: this is the screenshot bug — Russian keyboard autocomplete
      // swaps е for ё (or vice versa) and the search stops matching.
      expect(normalizeSearchText('Самолет')).toBe(normalizeSearchText('Самолёт'));
      expect(normalizeSearchText('САМОЛЕТ')).toBe(normalizeSearchText('самолёт'));
    });

    it('leaves regular е untouched', () => {
      expect(normalizeSearchText('еда')).toBe('еда');
    });
  });

  describe('Unicode NFC normalization', () => {
    it('composes decomposed ё (е + combining diaeresis) into the precomposed form', () => {
      // Decomposed: U+0435 (е) + U+0308 (combining diaeresis)
      const decomposed = 'ё';
      // After NFC composition this becomes U+0451 (ё), then ё→е folds to е
      expect(normalizeSearchText(decomposed)).toBe('е');
    });

    it('normalizes decomposed Latin diacritics', () => {
      // "café" with combining acute on e
      const decomposed = 'café';
      // After NFC, this is the precomposed "café"
      expect(normalizeSearchText(decomposed)).toBe('café');
    });
  });

  describe('non-string input coercion', () => {
    it('coerces numbers to strings', () => {
      expect(normalizeSearchText(123)).toBe('123');
      expect(normalizeSearchText(3.14)).toBe('3.14');
    });

    it('coerces booleans to strings', () => {
      expect(normalizeSearchText(true)).toBe('true');
    });
  });
});
