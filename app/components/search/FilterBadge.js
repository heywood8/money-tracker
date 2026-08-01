import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import { BADGE, BADGE_TEXT } from '../../styles/componentStyles';

/**
 * The small round count that rides on the corner of an icon — active filters on
 * the search button, and the same thing on the collapsed search pill.
 *
 * `testID` and `style` are props because SearchBar renders two of these (the
 * collapsed pill and the open row's filter button) and its tests address them
 * separately. Before that they were not props, so SearchBar carried its own
 * byte-identical copy of the badge instead of rendering this one.
 */
const FilterBadge = ({ count = 0, colors, testID = 'filter-badge', style }) => {
  if (!count || count === 0) {
    return null;
  }

  return (
    <View
      testID={testID}
      style={[styles.badge, { backgroundColor: colors.primary }, style]}
    >
      <Text style={styles.badgeText}>{count}</Text>
    </View>
  );
};

FilterBadge.propTypes = {
  count: PropTypes.number,
  colors: PropTypes.shape({
    primary: PropTypes.string.isRequired,
  }).isRequired,
  testID: PropTypes.string,
  style: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
};

const styles = StyleSheet.create({
  badge: {
    ...BADGE,
    // Overlaps the icon it counts for, rather than sitting beside it.
    position: 'absolute',
    right: -4,
    top: -4,
  },
  badgeText: {
    ...BADGE_TEXT,
    color: '#fff',
  },
});

export default FilterBadge;
