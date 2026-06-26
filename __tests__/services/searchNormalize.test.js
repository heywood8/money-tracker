/**
 * Tests for the shared search-text normalizer used by both in-memory
 * filtering (OperationsDataContext) and SQL filtering (db.js → SEARCH_NORM).
 *
 * The pipeline is NFC → lowercase → ё→е, and the regression motivating it is
 * the Russian keyboard autocomplete bug where typing "Самолет" gets submitted
 * as "Самолёт" — both spellings have to normalize to the same string.
 */

import { normalizeSearchText, buildSearchNormSql } from '../../app/services/searchNormalize';

describe('normalizeSearchText', () => {
  describe('null/undefined handling', () => {
    it('returns null for null', async () => {
      expect(normalizeSearchText(null)).toBeNull();
    });

    it('returns null for undefined', async () => {
      expect(normalizeSearchText(undefined)).toBeNull();
    });

    it('returns empty string for empty string', async () => {
      expect(normalizeSearchText('')).toBe('');
    });
  });

  describe('case folding', () => {
    it('lowercases ASCII', async () => {
      expect(normalizeSearchText('COFFEE')).toBe('coffee');
      expect(normalizeSearchText('Mixed Case')).toBe('mixed case');
    });

    it('lowercases Cyrillic (which SQLite LOWER() does not)', async () => {
      expect(normalizeSearchText('Транспорт')).toBe('транспорт');
      expect(normalizeSearchText('САМОЛЕТ')).toBe('самолет');
      expect(normalizeSearchText('Путешествия')).toBe('путешествия');
    });

    it('lowercases accented Latin', async () => {
      expect(normalizeSearchText('Café')).toBe('café');
      expect(normalizeSearchText('München')).toBe('münchen');
    });
  });

  describe('ё → е folding (Russian yo-folding)', () => {
    it('folds lowercase ё', async () => {
      expect(normalizeSearchText('ёжик')).toBe('ежик');
      expect(normalizeSearchText('самолёт')).toBe('самолет');
    });

    it('folds uppercase Ё by way of lowercasing first', async () => {
      expect(normalizeSearchText('Ёлка')).toBe('елка');
      expect(normalizeSearchText('САМОЛЁТ')).toBe('самолет');
    });

    it('makes "Самолет" and "Самолёт" compare equal', async () => {
      // Regression: this is the screenshot bug — Russian keyboard autocomplete
      // swaps е for ё (or vice versa) and the search stops matching.
      expect(normalizeSearchText('Самолет')).toBe(normalizeSearchText('Самолёт'));
      expect(normalizeSearchText('САМОЛЕТ')).toBe(normalizeSearchText('самолёт'));
    });

    it('leaves regular е untouched', async () => {
      expect(normalizeSearchText('еда')).toBe('еда');
    });
  });

  describe('Unicode NFC normalization', () => {
    it('composes decomposed ё (е + combining diaeresis) into the precomposed form', async () => {
      // Decomposed: U+0435 (е) + U+0308 (combining diaeresis)
      const decomposed = 'ё';
      // After NFC composition this becomes U+0451 (ё), then ё→е folds to е
      expect(normalizeSearchText(decomposed)).toBe('е');
    });

    it('normalizes decomposed Latin diacritics', async () => {
      // "café" with combining acute on e
      const decomposed = 'café';
      // After NFC, this is the precomposed "café"
      expect(normalizeSearchText(decomposed)).toBe('café');
    });
  });

  describe('non-string input coercion', () => {
    it('coerces numbers to strings', async () => {
      expect(normalizeSearchText(123)).toBe('123');
      expect(normalizeSearchText(3.14)).toBe('3.14');
    });

    it('coerces booleans to strings', async () => {
      expect(normalizeSearchText(true)).toBe('true');
    });
  });
});

describe('buildSearchNormSql (SQL fallback for missing custom function)', () => {
  it('wraps the column in LOWER() for ASCII folding', () => {
    const sql = buildSearchNormSql('o.description');
    expect(sql).toContain('LOWER(o.description)');
  });

  it('produces a single SQL expression with no surrounding whitespace', () => {
    const sql = buildSearchNormSql('a.name');
    expect(sql).toBe(sql.trim());
    expect(sql.startsWith('REPLACE(')).toBe(true);
  });

  it('emits REPLACE() pairs that lower-case the Russian Cyrillic alphabet', () => {
    const sql = buildSearchNormSql('o.description');
    // A representative sample of uppercase → lowercase folds.
    expect(sql).toContain("REPLACE(LOWER(o.description), 'А', 'а')");
    expect(sql).toContain("'С', 'с'");
    expect(sql).toContain("'Т', 'т'");
    expect(sql).toContain("'Я', 'я'");
  });

  it('folds both ё and Ё straight to е', () => {
    const sql = buildSearchNormSql('o.description');
    expect(sql).toContain("'Ё', 'е'");
    expect(sql).toContain("'ё', 'е'");
    // It must never fold Ё to ё (which would defeat ё/е equivalence).
    expect(sql).not.toContain("'Ё', 'ё'");
  });

  it('embeds the column reference verbatim so callers control the alias', () => {
    expect(buildSearchNormSql('to_a.name')).toContain('LOWER(to_a.name)');
    expect(buildSearchNormSql('pc.name')).toContain('LOWER(pc.name)');
  });

  it('mirrors normalizeSearchText for the Cyrillic case via a JS REPLACE simulation', () => {
    // Apply the same LOWER()+REPLACE() chain that the SQL would, and confirm the
    // result matches the JS normalizer for Cyrillic input (the case that LOWER()
    // alone could not handle).
    const pairs = [
      ['А', 'а'], ['Б', 'б'], ['В', 'в'], ['Г', 'г'], ['Д', 'д'], ['Е', 'е'],
      ['Ж', 'ж'], ['З', 'з'], ['И', 'и'], ['Й', 'й'], ['К', 'к'], ['Л', 'л'],
      ['М', 'м'], ['Н', 'н'], ['О', 'о'], ['П', 'п'], ['Р', 'р'], ['С', 'с'],
      ['Т', 'т'], ['У', 'у'], ['Ф', 'ф'], ['Х', 'х'], ['Ц', 'ц'], ['Ч', 'ч'],
      ['Ш', 'ш'], ['Щ', 'щ'], ['Ъ', 'ъ'], ['Ы', 'ы'], ['Ь', 'ь'], ['Э', 'э'],
      ['Ю', 'ю'], ['Я', 'я'], ['Ё', 'е'], ['ё', 'е'],
    ];
    const sqlSimulate = (value) => {
      // LOWER() in SQLite only folds ASCII; emulate that, then apply the pairs.
      let out = value.replace(/[A-Z]/g, (c) => c.toLowerCase());
      for (const [u, l] of pairs) out = out.split(u).join(l);
      return out;
    };
    for (const input of ['Самолёт', 'САМОЛЕТ', 'Транспорт', 'Ёлка', 'еда']) {
      expect(sqlSimulate(input)).toBe(normalizeSearchText(input));
    }
  });
});
