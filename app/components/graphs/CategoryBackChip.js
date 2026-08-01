import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import PropTypes from 'prop-types';
import { CHIP, CHIP_TEXT } from '../../styles/componentStyles';

/**
 * Shows the category a summary tab is currently drilled into, and pops back to
 * its parent when tapped.
 *
 * Rendered inside the open chart — under the donut, or above the operations list
 * once the drill-down bottoms out — rather than over the tab strip: as an overlay
 * it sat on top of the tab's own title. It stays outside the tab button either
 * way, since a button nested in a button reads as two controls to a screen reader.
 */
const CategoryBackChip = ({ colors, label, backLabel, onPress, testID }) => (
  <TouchableOpacity
    testID={testID}
    onPress={onPress}
    style={[styles.chip, { backgroundColor: colors.altRow, borderColor: colors.border }]}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityLabel={backLabel}
  >
    <Text style={[styles.chipText, { color: colors.text }]} numberOfLines={1}>
      {label}
    </Text>
    <Icon name="close-circle" size={14} color={colors.mutedText} />
  </TouchableOpacity>
);

CategoryBackChip.propTypes = {
  colors: PropTypes.object.isRequired,
  label: PropTypes.string.isRequired,
  backLabel: PropTypes.string.isRequired,
  onPress: PropTypes.func.isRequired,
  testID: PropTypes.string,
};

const styles = StyleSheet.create({
  chip: {
    ...CHIP,
    // Never wider than the slot it sits in — under the donut that slot is the
    // donut's own width, so a long category name ellipsises instead of pushing
    // the legend around.
    maxWidth: '100%',
  },
  chipText: {
    ...CHIP_TEXT,
    flexShrink: 1,
  },
});

export default CategoryBackChip;
