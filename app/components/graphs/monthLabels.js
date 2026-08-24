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

// Clear space a label needs between itself and its neighbours, in ems of the
// axis font. Below this the row reads as one run of text rather than a line of
// separate ticks — which is what three-letter labels at the trends card's
// resting pitch looked like in Russian, where "Июл" is half again as wide as
// "Jul". Held in ems rather than dp so a chart drawing its axis at a larger
// size asks for proportionally more air, instead of inheriting a gap sized for
// somebody else's font.
export const LABEL_GAP_EM = 2;

/** The clear space a label needs, in the same units as a tick pitch. */
export const labelGapFor = (fontSize) => LABEL_GAP_EM * (fontSize || 0);

// Advance width of a glyph as a fraction of the font size, used when the font
// cannot measure itself (the Skia stub under Jest, or a canvas that has not
// resolved a typeface yet). Deliberately generous: over-estimating thins the
// axis out by one step, under-estimating lets the labels touch.
const GLYPH_WIDTH_RATIO = 0.62;

/**
 * Width of one axis label in canvas units, measured the way Victory measures it
 * (the sum of its glyph advances) so the two agree about what fits.
 *
 * @param {string} text
 * @param {object} [font] - SkFont, or null before one resolves
 * @param {number} [fontSize] - size the font was asked for, for the estimate
 */
export const measureLabelWidth = (text, font, fontSize) => {
  if (!text) return 0;
  const glyphIds = font?.getGlyphIDs?.(text);
  const widths = glyphIds?.length ? font?.getGlyphWidths?.(glyphIds) : null;
  if (widths?.length) {
    const total = widths.reduce((sum, width) => sum + width, 0);
    if (total > 0) return total;
  }
  return text.length * (fontSize || font?.getSize?.() || 0) * GLYPH_WIDTH_RATIO;
};

/** The widest of a set of labels — what the tick pitch actually has to hold. */
export const measureWidestLabel = (labels, font, fontSize) => labels.reduce(
  (widest, label) => Math.max(widest, measureLabelWidth(label, font, fontSize)),
  0,
);

/**
 * How many months apart the labelled ticks are: 1 while a month is wide enough
 * to hold a label and the clear space around it, then 2, 3, ... Labelling every
 * month regardless is what left the axis looking like one long word.
 *
 * Phase the result on the month number, not on a position in the window: that
 * keeps January among the labelled months at every stride (so the year marker
 * cannot fall in a gap) and keeps the same months labelled as the window moves.
 */
export const resolveLabelStride = (pitch, labelWidth, fontSize) => (
  pitch > 0 ? Math.max(1, Math.ceil((labelWidth + labelGapFor(fontSize)) / pitch)) : 1
);

export default getMonthAbbreviations;
