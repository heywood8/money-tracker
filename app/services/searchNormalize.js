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

/**
 * Russian Cyrillic uppercase → lowercase pairs, plus ё/Ё → е folding. Used to
 * build a SQL expression that mirrors normalizeSearchText() for the Cyrillic
 * alphabet (see buildSearchNormSql).
 */
const CYRILLIC_FOLD_PAIRS = [
  ['А', 'а'], ['Б', 'б'], ['В', 'в'], ['Г', 'г'], ['Д', 'д'], ['Е', 'е'],
  ['Ж', 'ж'], ['З', 'з'], ['И', 'и'], ['Й', 'й'], ['К', 'к'], ['Л', 'л'],
  ['М', 'м'], ['Н', 'н'], ['О', 'о'], ['П', 'п'], ['Р', 'р'], ['С', 'с'],
  ['Т', 'т'], ['У', 'у'], ['Ф', 'ф'], ['Х', 'х'], ['Ц', 'ц'], ['Ч', 'ч'],
  ['Ш', 'ш'], ['Щ', 'щ'], ['Ъ', 'ъ'], ['Ы', 'ы'], ['Ь', 'ь'], ['Э', 'э'],
  ['Ю', 'ю'], ['Я', 'я'],
  // ё/Ё fold straight to е (not ё) so search treats them as equivalent.
  ['Ё', 'е'], ['ё', 'е'],
];

/**
 * Build a SQLite expression that normalizes `columnExpr` the way
 * normalizeSearchText() does in JS — as closely as plain SQL allows.
 *
 * Why this exists: expo-sqlite exposes no API to register a custom SQL
 * function, so the SEARCH_NORM custom function never registers on a real
 * device (see db.js). SQLite's built-in LOWER() only case-folds ASCII, so a
 * Cyrillic query like "самолёт" would never match a stored "Самолёт". This
 * builder wraps the column in LOWER() (ASCII folding) plus a chain of
 * REPLACE() calls that lower-case the Russian Cyrillic alphabet and fold
 * ё/Ё → е.
 *
 * Coverage is the Russian alphabet only; other non-ASCII scripts (accented
 * Latin, Greek, Armenian, …) still fold only their ASCII portion and match
 * case-sensitively — the same limitation the LOWER()-only fallback always
 * had, but now without breaking Cyrillic search. Callers must normalize the
 * query side with normalizeSearchText() so both halves of the LIKE comparison
 * use the same alphabet.
 *
 * @param {string} columnExpr - A SQL column reference, e.g. 'o.description'.
 * @returns {string} A SQL expression string (no surrounding whitespace).
 */
export const buildSearchNormSql = (columnExpr) => {
  let expr = `LOWER(${columnExpr})`;
  for (const [upper, lower] of CYRILLIC_FOLD_PAIRS) {
    expr = `REPLACE(${expr}, '${upper}', '${lower}')`;
  }
  return expr;
};
