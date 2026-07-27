import React from 'react';
import { View, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';

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
const PACE_ALPHA = '59'; // ~35%

/**
 * A plan row's progress, drawn as the row's own background rather than as a
 * separate track beneath it.
 *
 * A 6dp track plus its own label was a third and fourth line in a row that was
 * already four lines tall; as a background wash the same information costs no
 * vertical space at all.
 *
 * The dashed vertical line is TODAY. Without it a percentage is not a judgement:
 * 99% of an envelope spent is unremarkable on the 27th and alarming on the 3rd.
 * Fill short of the marker means on pace; fill past it means spending faster
 * than the month is passing.
 *
 * @param {number} fraction - Spent / target, 0..1+ (clamped when drawn)
 * @param {?number} paceFraction - How far through the month today is, or null
 *   when the shown month is not the current one and pace means nothing
 * @param {?string} tone - 6-digit hex signal colour, or null for a row with
 *   nothing to flag, which is washed in neutral grey instead
 */
const EnvelopeFill = ({ fraction, paceFraction, tone = null, mutedColor, testID }) => {
  const fillPercent = Math.min(Math.max(fraction, 0), 1) * 100;
  // Hidden at the very edges: a marker pinned to either end of the row reads as
  // a border, not as a date.
  const showPace = paceFraction != null && paceFraction > 0.02 && paceFraction < 0.98;
  const fillColor = tone ? `${tone}${SIGNAL_ALPHA}` : `${mutedColor}${CALM_ALPHA}`;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID={testID}>
      {fillPercent > 0 && (
        <View
          testID={testID ? `${testID}-bar` : undefined}
          style={[styles.fill, { width: `${fillPercent}%`, backgroundColor: fillColor }]}
        />
      )}
      {showPace && (
        <View
          testID={testID ? `${testID}-pace` : undefined}
          style={[
            styles.pace,
            { left: `${paceFraction * 100}%`, borderLeftColor: `${mutedColor}${PACE_ALPHA}` },
          ]}
        />
      )}
    </View>
  );
};

EnvelopeFill.propTypes = {
  fraction: PropTypes.number.isRequired,
  paceFraction: PropTypes.number,
  tone: PropTypes.string,
  mutedColor: PropTypes.string.isRequired,
  testID: PropTypes.string,
};

export default EnvelopeFill;

const styles = StyleSheet.create({
  fill: {
    // No hard leading edge. A 2dp bar at full strength sat right next to the
    // pace marker on every row — two unexplained vertical lines a few
    // millimetres apart, competing for the reading the marker exists to give.
    // The wash boundary is the boundary.
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  pace: {
    // Dashed, so it reads as an annotation on the bar rather than as a divider
    // or a rendering artefact — which is exactly what a solid full-height
    // hairline looked like when every row had one at the same x.
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    bottom: 0,
    position: 'absolute',
    top: 0,
  },
});
