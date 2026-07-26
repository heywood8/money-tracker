/**
 * Month-key helpers shared by the Budgets screen and its monthly-plan section.
 * A "month key" is the local calendar month formatted as `YYYY-MM`.
 */

/** Current month as YYYY-MM (local calendar). */
export const currentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

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
