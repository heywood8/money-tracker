/**
 * Month-key helpers shared by the Budgets screen and its monthly-plan section.
 * A "month key" is the local calendar month formatted as `YYYY-MM`.
 */

/** Current month as YYYY-MM (local calendar). */
export const currentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/** Build a YYYY-MM key from a full year and a 0-based month index. */
export const monthKeyOf = (year, monthIndex) =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

/** The calendar year a YYYY-MM key belongs to. */
export const yearOf = (monthKey) => Number(monthKey.split('-')[0]);

/** The 0-based month index of a YYYY-MM key (January === 0). */
export const monthIndexOf = (monthKey) => Number(monthKey.split('-')[1]) - 1;

/** Shift a YYYY-MM key by `delta` months. */
export const addMonths = (monthKey, delta) => {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Localized "Month YYYY" label for a YYYY-MM key.
 *
 * `language` is the app's own language code (LocalizationContext), NOT the device
 * locale: the two are independent here, so falling back to the device's — as
 * `toLocaleDateString(undefined, …)` does — printed "July 2026" across an
 * otherwise fully translated screen whenever the OS was left in English.
 * @param {string} monthKey - YYYY-MM
 * @param {string} [language] - App language code; omit to use the device locale.
 */
export const formatMonthLabel = (monthKey, language) => {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleDateString(language || undefined, { month: 'long', year: 'numeric' });
  // Several locales (Russian among them) render the month lowercase mid-sentence;
  // this label is a heading, so lift the first letter.
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/**
 * The twelve month names for a language, abbreviated — the labels of a month
 * grid, where the year is already named above the grid and repeating it twelve
 * times would say nothing.
 *
 * `language` is the app's language, not the device's, for the same reason
 * formatMonthLabel takes it: the two are independent in this app.
 *
 * The year used to build the dates is arbitrary (2020, a leap year so no locale
 * can trip on the 29th) — only the month part of the format is read.
 * @param {string} [language] - App language code; omit to use the device locale.
 * @returns {string[]} Twelve labels, January first.
 */
export const monthShortLabels = (language) =>
  Array.from({ length: 12 }, (_, i) => {
    const label = new Date(2020, i, 1)
      .toLocaleDateString(language || undefined, { month: 'short' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });
