import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import PropTypes from 'prop-types';
import { TIMING_ENTER } from '../../utils/motion';

/**
 * Where the target sits inside the track, as a fraction of its width.
 *
 * Not at the right edge, which is where a progress bar normally puts 100%. On
 * this screen going over target is ordinary rather than exceptional — by the end
 * of a month most envelopes are at or past their number — so a bar that simply
 * saturates at the end would flatten 101% and 348% into the same full bar, which
 * is exactly what the old background wash did (it clamped the fraction to 1).
 * Reserving the last quarter or so of the track for the overspend means the bar
 * keeps saying something after the target is passed.
 */
const PLAN_STOP = 0.72;

/**
 * A hairline of nothing at the target, separating the two zones.
 *
 * The step in brightness between the zones was supposed to be the target mark,
 * and it is — right up until the fill covers it. Every row at or past its target
 * paints the whole plan zone solid, and on a month-end plan that is most of
 * them, so the one place the mark is needed is the one place it disappeared.
 * What was left on such a row was a single vertical line, the pace tick, sitting
 * some 7% to its left — and a reader looking for the target boundary reads
 * whatever vertical is there as the boundary. It is a gap rather than a drawn
 * tick because the track has no background of its own: the zones are the
 * background, so leaving a slice unpainted shows the card through it, and it
 * reads over the fill and the overspend alike without needing to know either
 * colour. It also says "boundary" in a different language than the pace tick
 * does — negative space against a line — so the two can no longer be confused.
 *
 * As a fraction of the track: ~2dp on the ~250dp bar this screen draws.
 */
const BOUNDARY_GAP = 0.008;

/** Left edge of the overspend zone: the target, plus the gap that marks it. */
const OVER_START = PLAN_STOP + BOUNDARY_GAP;

/** What is left of the track for the overspend to grow into. */
const OVER_ZONE = 1 - OVER_START;

/**
 * A fraction as a percentage string, without binary-float debris.
 *
 * `${(1 - 0.728) * 100}%` is "27.200000000000003%" — which Yoga parses fine, but
 * which turns every style assertion in the tests into a guess about rounding.
 */
const pct = (fraction) => `${Number((fraction * 100).toFixed(4))}%`;

/**
 * How the overspend zone is compressed.
 *
 * The plan zone is linear — half the target spent is half the zone filled — but
 * the overspend zone cannot be: it has no upper bound, and a linear scale would
 * need a maximum nobody can name. `1 − 1/ratio` maps the whole unbounded range
 * into it and never reaches the end: 2× fills half of it, 3.5× fills 71%, 10×
 * fills 90%. So a row at 101% shows a sliver, a row at 348% shows a bar that is
 * visibly nearly full, and neither is ever mistaken for the other.
 *
 * @param {number} ratio - actual / target, > 1.
 * @returns {number} Fraction of the overspend zone to fill, in [0, 1).
 */
export function overspendFraction(ratio) {
  return 1 - 1 / ratio;
}

/**
 * A plan row's progress against its target.
 *
 * Replaces EnvelopeFill, which drew the same information as a coloured wash
 * across the row's entire background. Two things went wrong with that. It
 * clamped at 100%, so it could not distinguish a row that is barely over from
 * one that is three times over — the majority of rows on a real month-end plan.
 * And because it tinted the row itself, status colour was applied to nearly
 * every row at once, which is the hierarchy problem it had been introduced to
 * solve, re-created in colour. Colour now identifies which envelope a row
 * belongs to (see envelopePalette) and this bar carries the status, in
 * geometry, where more spending always means more bar.
 *
 * @param {number} ratio - actual / target. May exceed 1; that is the point.
 * @param {?number} pace - How far through the month we are, 0..1, or null when
 *   the month is not the current one (a finished month has no "should be here").
 */
const PlanProgressBar = ({
  ratio,
  pace = null,
  trackColor,
  fillColor,
  overspendColor,
  paceColor,
  height = 4,
  testID,
}) => {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
  const planPart = Math.min(safeRatio, 1);
  const overPart = safeRatio > 1 ? overspendFraction(safeRatio) : 0;

  // Both segments are drawn at their full zone width and scaled from the left,
  // for the reason EnvelopeFill scaled rather than sized: `width` is a layout
  // prop, so animating it re-lays-out the row on the JS thread every frame,
  // while `scaleX` is a transform and runs on the UI thread.
  //
  // Seeded at their current values so a row that mounts at 60% renders there —
  // this only animates a bar that changes while it is on screen, which is what
  // makes executing a line above it read as a consequence rather than as a
  // re-render.
  const planFill = useSharedValue(planPart);
  const overFill = useSharedValue(overPart);
  useEffect(() => {
    planFill.value = withTiming(planPart, { ...TIMING_ENTER, duration: 300 });
    overFill.value = withTiming(overPart, { ...TIMING_ENTER, duration: 300 });
  }, [planPart, overPart, planFill, overFill]);

  const planStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: planFill.value }] }));
  const overStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: overFill.value }] }));

  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]} testID={testID}>
      {/* Two track zones rather than one track plus a tick at the boundary, with
          BOUNDARY_GAP of bare card between them. The step in brightness plus that
          gap IS the target marker, so the bar reads "this much was the plan"
          without carrying a separate mark for it — one fewer element on a 4dp
          strip that repeats down the whole screen. */}
      <View
        testID={testID ? `${testID}-plan-zone` : undefined}
        style={[styles.planZone, { backgroundColor: trackColor }]}
      />
      <View
        testID={testID ? `${testID}-over-zone` : undefined}
        style={[styles.overZone, { backgroundColor: trackColor }]}
      />

      <Animated.View
        testID={testID ? `${testID}-plan` : undefined}
        style={[styles.planFill, { backgroundColor: fillColor }, planStyle]}
      />
      {overPart > 0 && (
        <Animated.View
          testID={testID ? `${testID}-over` : undefined}
          style={[styles.overFill, { backgroundColor: overspendColor }, overStyle]}
        />
      )}

      {/* Where the month says the spending should have reached by today. This is
          the marker EnvelopeFill had to drop: as a dashed hairline across a
          full-height row wash, Android drew it solid, and every row carrying one
          at the same x stacked into an unbroken line down the card that read as
          a rendering artefact. On a 4dp strip there is no such stack — the marks
          sit at different x on every row and are 4dp tall. Being ahead of pace
          used to be said with an amber tone that was indistinguishable from the
          red one at the alpha it was drawn with; it is a position now. */}
      {pace != null && (
        <View
          testID={testID ? `${testID}-pace` : undefined}
          style={[styles.paceTick, { backgroundColor: paceColor, left: pct(Math.min(Math.max(pace, 0), 1) * PLAN_STOP) }]}
        />
      )}
    </View>
  );
};

PlanProgressBar.propTypes = {
  ratio: PropTypes.number.isRequired,
  pace: PropTypes.number,
  trackColor: PropTypes.string.isRequired,
  fillColor: PropTypes.string.isRequired,
  overspendColor: PropTypes.string.isRequired,
  paceColor: PropTypes.string.isRequired,
  height: PropTypes.number,
  testID: PropTypes.string,
};

export default PlanProgressBar;

/**
 * Width of the actual/target column that sits to the right of a bar.
 *
 * Shared by PlanLineRow and PlanGroupRow, and it has to be: the column is a
 * fixed width precisely so that every bar on the screen ENDS at the same x. Two
 * columns of different widths put the envelope's bar and its children's bars on
 * different scales, and a column of bars that cannot be compared against each
 * other is the only thing a reader ever does with one.
 *
 * Sized for the longest realistic pair ("124M / 124M").
 */
export const PAIR_COLUMN_WIDTH = 96;

const styles = StyleSheet.create({
  overFill: {
    bottom: 0,
    left: pct(OVER_START),
    position: 'absolute',
    top: 0,
    // Without this the segment grows from its centre and detaches from the
    // target boundary it is supposed to spill out of.
    transformOrigin: 'left',
    width: pct(OVER_ZONE),
  },
  overZone: {
    bottom: 0,
    left: pct(OVER_START),
    // Dimmer than the plan zone, so that on a track the fill has not reached the
    // step in brightness says where the target is even before the gap does.
    opacity: 0.4,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  paceTick: {
    bottom: 0,
    position: 'absolute',
    top: 0,
    width: 1.5,
  },
  planFill: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    transformOrigin: 'left',
    width: pct(PLAN_STOP),
  },
  planZone: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: pct(PLAN_STOP),
  },
  track: {
    // Clips the overspend segment to the rounded ends.
    overflow: 'hidden',
    width: '100%',
  },
});
