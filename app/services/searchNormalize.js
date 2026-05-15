/**
 * Normalize text for case- and yo-insensitive search comparison.
 *
 * The pipeline:
 *   1. Unicode NFC composition — ensures ё is represented as a single code point
 *      (U+0451) rather than е + combining diaeresis (U+0435 + U+0308). Without
 *      this, the ё → е fold below would miss the decomposed form.
 *   2. Unicode-aware lowercase — SQLite's built-in LOWER() is ASCII-only, so
 *      Cyrillic case-folding has to happen in JS.
 *   3. Russian yo-folding (ё → е) — Russian users (and Russian keyboards via
 *      autocomplete) treat ё and е as interchangeable in casual text. This
 *      matches the convention used by Elasticsearch's russian analyzer and by
 *      Wikipedia's search.
 *
 * The same function is used for in-memory filtering (OperationsDataContext)
 * AND as the SQLite custom function callback registered in db.js, so both
 * paths produce identical results.
 *
 * Returns null for null/undefined input so it can be used directly as an
 * SQLite custom function callback.
 *
 * @param {*} value - Input value (typically string; non-strings are coerced).
 * @returns {string|null} Normalized string, or null if input was null/undefined.
 */
export const normalizeSearchText = (value) => {
  if (value == null) return null;
  return String(value).normalize('NFC').toLowerCase().replace(/ё/g, 'е');
};
