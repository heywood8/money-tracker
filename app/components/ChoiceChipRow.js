import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { SPACING, BORDER_RADIUS, FONT_SIZE, FONT_WEIGHT } from '../styles/designTokens';

/**
 * A row of M3 filter chips for a single choice among a handful of values the
 * form has room to show all of: tonal fill, primary outline, primary label and
 * a leading check on the selected chip.
 *
 * With `selectedValues` instead of `selected` it is a multi-select: every
 * chosen chip is marked, each tap reports its value and the host keeps the
 * array, the way AccountGridSelector's and CategoryGridSelector's options of
 * the same shape work.
 *
 * `CurrencyChipRow` is this row with currency codes for values; the rate-chart
 * editor uses it bare for its amount and period. One component so the two kinds
 * of row stacked in one form cannot drift apart in height or selected state —
 * which is how the two budget modals' copies of the currency row ended up
 * disagreeing before it was shared.
 */

const TINT = '1F';

const ChoiceChipRow = memo(({
  options,
  selected,
  selectedValues = null,
  onSelect,
  colors,
  testIDPrefix,
  style,
}) => {
  const multiSelect = Array.isArray(selectedValues);
  return (
    <View style={[styles.row, style]}>
      {options.map(({ value, label, accessibilityLabel }) => {
        const isSelected = multiSelect ? selectedValues.includes(value) : selected === value;
        return (
          <Pressable
            key={String(value)}
            onPress={() => onSelect(value)}
            android_ripple={{ color: colors.primary + TINT }}
            style={[
              styles.chip,
              { borderColor: isSelected ? colors.primary : colors.border },
              isSelected && { backgroundColor: colors.primary + TINT },
            ]}
            accessibilityRole={multiSelect ? 'checkbox' : 'button'}
            accessibilityState={multiSelect ? { checked: isSelected } : { selected: isSelected }}
            accessibilityLabel={accessibilityLabel ?? label}
            testID={`${testIDPrefix}-${value}`}
          >
            {isSelected && <Icon name="check" size={16} color={colors.primary} />}
            <Text style={[styles.chipText, { color: isSelected ? colors.primary : colors.mutedText }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

ChoiceChipRow.displayName = 'ChoiceChipRow';

ChoiceChipRow.propTypes = {
  options: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    label: PropTypes.string.isRequired,
    // Defaults to the label.
    accessibilityLabel: PropTypes.string,
  })).isRequired,
  selected: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  // Multi-select: takes precedence over `selected`.
  selectedValues: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number])),
  onSelect: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
  testIDPrefix: PropTypes.string.isRequired,
  // The row's placement in its host's layout (a margin, a flex) — never its
  // chips' own look, which is the whole point of the component.
  style: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
};

const styles = StyleSheet.create({
  // Height, not vertical padding: the check appearing on select would otherwise
  // grow the chip a little taller than its neighbours and reflow the row.
  chip: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    height: 36,
    overflow: 'hidden',
    paddingHorizontal: SPACING.md,
  },
  chipText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
});

export default ChoiceChipRow;
