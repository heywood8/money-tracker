import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';

const FilterBadge = ({ count = 0, colors }) => {
  if (!count || count === 0) {
    return null;
  }

  return (
    <View
      testID="filter-badge"
      style={[styles.badge, { backgroundColor: colors.primary }]}
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
};

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: 9,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});

export default FilterBadge;
