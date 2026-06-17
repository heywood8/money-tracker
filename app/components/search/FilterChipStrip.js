import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { HORIZONTAL_PADDING } from '../../styles/layout';

const formatDateLabel = (dateRange) => {
  const { startDate, endDate } = dateRange;
  // Parse "YYYY-MM-DD" as local time so the displayed day doesn't shift in
  // timezones west of UTC (where new Date("YYYY-MM-DD") yields the previous day).
  const fmt = (d) => {
    if (!d) return '';
    const [y, m, day] = d.split('-').map(Number);
    if (!y || !m || !day) return '';
    return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  if (startDate && endDate) return `${fmt(startDate)} – ${fmt(endDate)}`;
  if (startDate) return `${fmt(startDate)} –`;
  if (endDate) return `– ${fmt(endDate)}`;
  return null;
};

const formatAmountLabel = (amountRange) => {
  const { min, max } = amountRange;
  if (min !== null && max !== null) return `${min} – ${max}`;
  if (min !== null) return `> ${min}`;
  if (max !== null) return `< ${max}`;
  return null;
};

const FilterChipStrip = ({ searchState, onClearGroup, colors, t }) => {
  const chips = [];

  if (searchState.text && searchState.text.trim().length > 0) {
    const trimmed = searchState.text.trim();
    const display = trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
    chips.push({ key: 'text', label: `"${display}"` });
  }

  if (searchState.types.length > 0) {
    const label =
      searchState.types.length === 1
        ? t(searchState.types[0])
        : `${t('operation_type')}: ${searchState.types.length}`;
    chips.push({ key: 'types', label });
  }

  if (searchState.dateRange.startDate || searchState.dateRange.endDate) {
    chips.push({ key: 'dateRange', label: formatDateLabel(searchState.dateRange) });
  }

  if (searchState.amountRange.min !== null || searchState.amountRange.max !== null) {
    chips.push({ key: 'amountRange', label: formatAmountLabel(searchState.amountRange) });
  }

  if (searchState.accountIds.length > 0) {
    chips.push({ key: 'accountIds', label: `${t('accounts')}: ${searchState.accountIds.length}` });
  }

  if (searchState.labels && searchState.labels.length > 0) {
    const label = searchState.labels.length === 1
      ? searchState.labels[0]
      : `${t('labels')}: ${searchState.labels.length}`;
    chips.push({ key: 'labels', label });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.container, { backgroundColor: colors.background, borderBottomColor: colors.border }]}
      contentContainerStyle={styles.content}
    >
      {chips.map(({ key, label }) => (
        <View
          key={key}
          testID={`chip-${key}`}
          style={[
            styles.chip,
            { backgroundColor: `${colors.primary}20`, borderColor: colors.primary },
          ]}
        >
          <Text style={[styles.chipText, { color: colors.primary }]}>{label}</Text>
          <TouchableOpacity
            testID={`clear-chip-${key}`}
            onPress={() => onClearGroup(key)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          >
            <Icon name="close" size={13} color={colors.primary} />
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
};

FilterChipStrip.propTypes = {
  searchState: PropTypes.shape({
    text: PropTypes.string,
    types: PropTypes.array.isRequired,
    accountIds: PropTypes.array.isRequired,
    categoryIds: PropTypes.array.isRequired,
    labels: PropTypes.array,
    dateRange: PropTypes.shape({
      startDate: PropTypes.string,
      endDate: PropTypes.string,
    }).isRequired,
    amountRange: PropTypes.shape({
      min: PropTypes.number,
      max: PropTypes.number,
    }).isRequired,
  }).isRequired,
  onClearGroup: PropTypes.func.isRequired,
  colors: PropTypes.shape({
    background: PropTypes.string.isRequired,
    primary: PropTypes.string.isRequired,
    border: PropTypes.string.isRequired,
  }).isRequired,
  t: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  container: {
    borderBottomWidth: 1,
  },
  content: {
    gap: 7,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 7,
  },
});

export default FilterChipStrip;
