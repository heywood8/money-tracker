/**
 * Month-key helpers shared by the Budgets screen and its monthly-plan section.
 * A "month key" is the local calendar month formatted as `YYYY-MM`.
 *
 * The Graphs screen scopes itself to the same keys but may also be scoped to a
 * whole year, which it names `YYYY-full` — a *period* key. Everything that only
 * needs the year (`yearOf`, the picker's year stepper) reads both alike; the
 * two predicates below are what tells them apart where the difference matters.
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

/** Whole-year period key for a calendar year. */
export const fullYearKeyOf = (year) => `${year}-full`;

/** True for a whole-year period key (`YYYY-full`) rather than a month key. */
export const isFullYearKey = (key) => typeof key === 'string' && key.endsWith('-full');

/**
 * How much of a month has already happened, as a fraction of its days.
 *
 * A finished month is 1 and a month that has not started is 0, so the single
 * number covers past, present and future without the caller testing which it
 * has. The current month counts today as done — "11 of 31 days" on the 11th —
 * which is what a person means when they ask how far into the month they are.
 *
 * @param {string} monthKey - YYYY-MM. String comparison orders these, so no
 *   date parsing is needed to place the key against the current month.
 * @returns {number} Fraction in [0, 1].
 */
export const monthElapsedFraction = (monthKey) => {
  const current = currentMonthKey();
  if (monthKey < current) return 1;
  if (monthKey > current) return 0;
  const now = new Date();
  // Day 0 of the next month is the last day of this one.
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() / daysInMonth;
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
