import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import PropTypes from 'prop-types';

/**
 * Shows the category a summary tab is currently drilled into, and pops back to
 * its parent when tapped.
 *
 * Rendered by GraphsScreen as an overlay above the tab strip rather than inside
 * the tab itself: the tab is already a button, and a button nested in a button
 * reads as two controls to a screen reader. `box-none` on the wrapper lets taps
 * that miss the chip fall through to the tab underneath.
 */
const CategoryBackChip = ({ colors, label, backLabel, onPress, side, testID }) => (
  <View
    style={[styles.overlay, side === 'left' ? styles.overlayLeft : styles.overlayRight]}
    pointerEvents="box-none"
  >
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
  </View>
);

CategoryBackChip.propTypes = {
  colors: PropTypes.object.isRequired,
  label: PropTypes.string.isRequired,
  backLabel: PropTypes.string.isRequired,
  onPress: PropTypes.func.isRequired,
  side: PropTypes.oneOf(['left', 'right']).isRequired,
  testID: PropTypes.string,
};

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    maxWidth: '75%',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  overlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    // Each tab owns half the strip, so the chip is centred over its own half
    width: '50%',
  },
  overlayLeft: {
    left: 0,
  },
  overlayRight: {
    right: 0,
  },
});

export default CategoryBackChip;
