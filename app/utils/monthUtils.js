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
 * How far through `monthKey` today is, as a 0..1 fraction — or null when the
 * month shown is not the current one.
 *
 * Drives the "today" marker on a plan row: the marker is what makes 99% spent
 * legible as fine on the 27th and alarming on the 3rd. A past month is fully
 * spent and a future one hasn't started, so in neither case does "are you ahead
 * of pace" mean anything, and the marker is not drawn at all.
 *
 * Measured at the END of today (day N of M → N/M), so the last day of the month
 * reads as a full month elapsed rather than one day short.
 * @param {string} monthKey - YYYY-MM
 * @returns {number|null}
 */
export const monthProgressFraction = (monthKey) => {
  if (monthKey !== currentMonthKey()) return null;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() / daysInMonth;
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
