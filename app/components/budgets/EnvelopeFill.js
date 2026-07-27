import React from 'react';
import { View, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';

// Tint strength for the fill, as a hex alpha channel appended to a 6-digit
// colour. Low enough that the row's name and figures keep their contrast on top
// of it, high enough to read as a filled bar at a glance on both themes.
const FILL_ALPHA = '26'; // ~15%
const PACE_ALPHA = '99'; // ~60%

/**
 * A plan row's progress, drawn as the row's own background rather than as a
 * separate track beneath it.
 *
 * A 6dp track plus its own label was a third and fourth line in a row that was
 * already four lines tall; as a background wash the same information costs no
 * vertical space at all, and ten envelopes read as ten filled bars in one
 * glance instead of ten paragraphs.
 *
 * The vertical hairline is TODAY. Without it a percentage is not a judgement:
 * 99% of an envelope spent is unremarkable on the 27th and alarming on the 3rd,
 * and the old four-band colour scale could not tell those apart because it never
 * knew the date. Fill to the left of the marker means on pace; fill past it
 * means spending faster than the month is passing.
 *
 * @param {number} fraction - Spent / target, 0..1+ (clamped when drawn)
 * @param {?number} paceFraction - How far through the month today is, or null
 *   when the shown month is not the current one and pace means nothing
 * @param {string} tone - 6-digit hex signal colour for the fill and its edge
 */
const EnvelopeFill = ({ fraction, paceFraction, tone, mutedColor, testID }) => {
  const fillPercent = Math.min(Math.max(fraction, 0), 1) * 100;
  // Hidden at the very edges: a marker pinned to either end of the row reads as
  // a border, not as a date.
  const showPace = paceFraction != null && paceFraction > 0.02 && paceFraction < 0.98;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID={testID}>
      {fillPercent > 0 && (
        <View
          testID={testID ? `${testID}-bar` : undefined}
          style={[
            styles.fill,
            {
              width: `${fillPercent}%`,
              backgroundColor: `${tone}${FILL_ALPHA}`,
              borderRightColor: tone,
            },
          ]}
        />
      )}
      {showPace && (
        <View
          testID={testID ? `${testID}-pace` : undefined}
          style={[
            styles.pace,
            { left: `${paceFraction * 100}%`, backgroundColor: `${mutedColor}${PACE_ALPHA}` },
          ]}
        />
      )}
    </View>
  );
};

EnvelopeFill.propTypes = {
  fraction: PropTypes.number.isRequired,
  paceFraction: PropTypes.number,
  tone: PropTypes.string.isRequired,
  mutedColor: PropTypes.string.isRequired,
  testID: PropTypes.string,
};

export default EnvelopeFill;

const styles = StyleSheet.create({
  fill: {
    // The leading edge, at full strength: the wash alone reads as a soft
    // gradient at the boundary, and the boundary is the whole point.
    borderRightWidth: 2,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  pace: {
    bottom: 0,
    position: 'absolute',
    top: 0,
    width: 1,
  },
});
