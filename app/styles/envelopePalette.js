/**
 * Colours that identify a budget envelope (a plan line group).
 *
 * The Budgets screen used to spend colour on STATUS: every row was washed in
 * red when it was over target and amber when it was ahead of the month's pace.
 * On a plan where overspending is ordinary — and on a real one it is, by the
 * last week most envelopes are at or past 100% — that painted almost every row,
 * so the wash separated nothing. Worse, at the alpha it was drawn with, amber
 * and red land within a few units of each other over a near-black surface
 * (#F2A93B and #FF6B6B at 18% over #1a1a1a differ mostly in the blue channel),
 * so the two states it distinguished were not distinguishable anyway.
 *
 * So colour moved off status and onto STRUCTURE — which envelope a row belongs
 * to, the one thing the list could not say before except with an indent. Status
 * is geometry now (see PlanProgressBar), and the only saturated colour left on
 * the screen is the overspend segment of a bar.
 *
 * The hues are deliberately muted — filing-cabinet tabs, not highlighter pens.
 * They have to sit UNDER the alert colour in the visual hierarchy, because a
 * label is never more urgent than a number in the red. None of them lives in
 * the red/orange band for the same reason: that band belongs to `overspend`.
 */

/**
 * Six hues, assigned to envelopes by position. Enough that adjacent envelopes
 * never collide in a plan of realistic size; few enough that the screen still
 * reads as one palette rather than as a chart legend.
 */
export const ENVELOPE_HUES = [
  '#7E93B8', // dusty indigo
  '#7FA07A', // sage
  '#A08A76', // kraft
  '#9B7FA8', // muted plum
  '#6FA3A3', // faded teal
  '#8E8B72', // olive grey
];

/**
 * Alpha (as a hex channel appended to a 6-digit colour) for the rail drawn
 * beside an envelope's CHILDREN.
 *
 * The children's rail is the same line as the envelope header's, continued
 * downward — one bracket, not a colour repeated per row. It is dimmed because
 * the header is the thing being identified and the rows below it are its parts;
 * at full strength six rows of solid colour would out-shout the header they
 * belong to.
 */
export const ENVELOPE_RAIL_CHILD_ALPHA = '73'; // ~45%

/**
 * The hue for the envelope at `index` in the screen's order.
 *
 * By position rather than by a hash of the id: a hash gives two neighbouring
 * envelopes the same colour often enough to matter (birthday-paradox odds over
 * six buckets), and position guarantees the first six are all distinct — which
 * is every plan anyone actually keeps.
 *
 * @param {number} index - Zero-based position of the envelope on screen.
 * @returns {string} A 6-digit hex colour.
 */
export function envelopeHue(index) {
  if (!Number.isFinite(index) || index < 0) return ENVELOPE_HUES[0];
  return ENVELOPE_HUES[Math.floor(index) % ENVELOPE_HUES.length];
}
