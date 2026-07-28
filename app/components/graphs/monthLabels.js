/**
 * Two-glyph month labels for chart x-axes.
 *
 * Deliberately not localised: an axis tick on a phone-width chart has room for
 * about two characters, and twelve of them have to sit side by side. Locale
 * abbreviations do not survive that width (and the graphs screen has read this
 * way since the spending-trend card shipped — the balance chart's year view uses
 * the same set so two charts on one screen never disagree about "Mr").
 */
export const MONTH_ABBREVIATIONS = ['Ja', 'Fe', 'Mr', 'Ap', 'My', 'Jn', 'Jl', 'Au', 'Se', 'Oc', 'No', 'De'];

export default MONTH_ABBREVIATIONS;
