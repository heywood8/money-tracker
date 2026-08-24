/**
 * Short month labels for chart x-axes.
 *
 * The axis used to draw an invented two-glyph set — 'Mr', 'My', 'Jn', 'Jl',
 * 'Oc' — on the theory that a tick has room for two characters and nothing
 * more. It never read as a month: nobody writes October as "Oc", the pairs sit
 * tight enough at 9px that the glyphs run into each other, and on a Russian or
 * Japanese UI the axis was the last place still speaking English.
 *
 * Ticks are laid out at a 36dp pitch, which is room enough for the locale's own
 * abbreviation (three letters in most languages, "10月" in CJK), so that is what
 * they draw now. Both charts that label months read this list, so two charts on
 * one screen never disagree about which month is which.
 */

export const MONTH_SHORT_KEYS = [
  'month_short_january',
  'month_short_february',
  'month_short_march',
  'month_short_april',
  'month_short_may',
  'month_short_june',
  'month_short_july',
  'month_short_august',
  'month_short_september',
  'month_short_october',
  'month_short_november',
  'month_short_december',
];

// Drawn when a locale has no `month_short_*` entry — `t()` hands back the key
// itself for a missing translation, and a raw key on an axis is worse than an
// English abbreviation.
export const MONTH_ABBREVIATIONS_FALLBACK = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * The twelve abbreviations in the active language, indexed by month (0-11).
 *
 * @param {(key: string) => string} t - translation function
 * @returns {string[]}
 */
export const getMonthAbbreviations = (t) => MONTH_SHORT_KEYS.map((key, index) => {
  const label = typeof t === 'function' ? t(key) : key;
  return label && label !== key ? label : MONTH_ABBREVIATIONS_FALLBACK[index];
});

export default getMonthAbbreviations;
