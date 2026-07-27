import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import PropTypes from 'prop-types';
import { TIMING_ENTER } from '../../utils/motion';

// Tint strength as a hex alpha channel appended to a 6-digit colour.
//
// Two strengths, not one. The first pass washed EVERY row at a single ~15%:
// ten coloured blocks butted together, so nothing stood out and the eye had
// nowhere to land — the exact hierarchy problem the redesign set out to fix,
// re-created in colour. A row that is simply on pace now gets a neutral grey
// wash that reads as a bar and nothing more; the tone (and the strength) is
// spent only where there is something to say.
const CALM_ALPHA = '14'; // ~8%, neutral grey
const SIGNAL_ALPHA = '2E'; // ~18%, warning / overspend

// How long the wash takes to travel to a new fraction. The curve comes from
// TIMING_ENTER, so a row settling reads as the same material as the graph panel
// opening or the quick-add sliding back.
const FILL_DURATION = 300;

/**
 * A plan row's progress, drawn as the row's own background rather than as a
 * separate track beneath it.
 *
 * A 6dp track plus its own label was a third and fourth line in a row that was
 * already four lines tall; as a background wash the same information costs no
 * vertical space at all.
 *
 * There is no "today" marker on the fill anymore. It was meant to read as a
 * dashed annotation, but Android draws a 1dp dashed border solid, so every row
 * carried a full-height hairline at the same x — which stacked into one
 * unbroken grey line down the whole card and read as a rendering artefact
 * rather than as a date. Being ahead of the month's pace still shows: the row
 * takes the warning tone (see PlanLineRow), which needs no extra geometry.
 *
 * @param {number} fraction - Spent / target, 0..1+ (clamped when drawn)
 * @param {?string} tone - 6-digit hex signal colour, or null for a row with
 *   nothing to flag, which is washed in neutral grey instead
 */
const EnvelopeFill = ({ fraction, tone = null, mutedColor, testID }) => {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const fillColor = tone ? `${tone}${SIGNAL_ALPHA}` : `${mutedColor}${CALM_ALPHA}`;

  // Drawn as a full-width bar scaled from its left edge rather than as a
  // percentage width, for two reasons. A `width` in percent is a layout prop, so
  // animating it re-lays-out the row on the JS thread every frame; `scaleX` is a
  // transform and runs on the UI thread. And the row is what changes when the
  // user executes a line right above it — the wash sliding to its new length is
  // the visible result of that action, where a jump is just a different picture.
  const fill = useSharedValue(clamped);
  useEffect(() => {
    // Seeded with `clamped`, so a row that mounts already at 60% renders there:
    // this only animates a fraction that changes while the row is on screen.
    fill.value = withTiming(clamped, { ...TIMING_ENTER, duration: FILL_DURATION });
  }, [clamped, fill]);

  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID={testID}>
      <Animated.View
        testID={testID ? `${testID}-bar` : undefined}
        style={[styles.fill, { backgroundColor: fillColor }, fillStyle]}
      />
    </View>
  );
};

EnvelopeFill.propTypes = {
  fraction: PropTypes.number.isRequired,
  tone: PropTypes.string,
  mutedColor: PropTypes.string.isRequired,
  testID: PropTypes.string,
};

export default EnvelopeFill;

const styles = StyleSheet.create({
  fill: {
    // No hard leading edge: the wash boundary is the boundary. A 2dp bar at full
    // strength was one more vertical line on a row that already had too many.
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    // Without this the bar would grow from its centre and the wash would detach
    // from the row's left edge.
    transformOrigin: 'left',
  },
});
