/**
 * Rewrite the commas in a typed or pasted amount as a decimal point or as
 * grouping. decimal-pad keyboards type "," as the decimal key in most locales,
 * while a pasted figure may carry thousands grouping:
 * - both "," and ".": the later one is the decimal point ("1.234,56", "1,234.56")
 * - a lone "," not followed by exactly three digits: the decimal point ("12,5")
 * - any other ",": grouping ("1,500", "1,234,567"), as notification amounts read it
 *
 * Only separators are rewritten; the caller still filters and validates.
 *
 * @param {string} text
 * @returns {string}
 */
export const normalizeDecimalComma = (text) => {
  const s = String(text ?? '');
  const lastComma = s.lastIndexOf(',');
  if (lastComma === -1) return s;
  const lastDot = s.lastIndexOf('.');
  if (lastDot !== -1) {
    if (lastComma < lastDot) return s.replace(/,/g, '');
    const units = s.slice(0, lastComma).replace(/[.,]/g, '');
    return `${units}.${s.slice(lastComma + 1)}`;
  }
  const commas = s.split(',').length - 1;
  if (commas === 1 && !/,\d{3}$/.test(s)) return s.replace(',', '.');
  return s.replace(/,/g, '');
};
