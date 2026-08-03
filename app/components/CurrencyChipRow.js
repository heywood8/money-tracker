import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import currencies from '../../assets/currencies.json';
import { SPACING, BORDER_RADIUS, FONT_SIZE, FONT_WEIGHT } from '../styles/designTokens';

/**
 * The inline form counterpart of `CurrencySheet`: a row of M3 filter chips for
 * the currency of the *field being edited*, where the choice is one of a
 * handful and the form has room to show them all.
 *
 * Both budget modals grew their own copy of this and drifted apart — the line
 * editor tinted the selected chip at 33% primary over a rounded rectangle, the
 * group editor filled it solid primary while leaving the label `colors.text`,
 * which on the light theme put near-black text on a saturated blue. Neither
 * drew M3's leading checkmark, so a selected chip and a merely-emphasised one
 * were the same object. One component, one selected state: tonal fill, primary
 * outline, primary label, check.
 */

const TINT = '1F';

const CurrencyChipRow = memo(({
  codes,
  selectedCode,
  onSelect,
  colors,
  showSymbol = false,
  testIDPrefix,
  style,
}) => (
  <View style={[styles.row, style]}>
    {codes.map((code) => {
      const selected = selectedCode === code;
      const symbol = showSymbol ? currencies[code]?.symbol : null;
      return (
        <Pressable
          key={code}
          onPress={() => onSelect(code)}
          android_ripple={{ color: colors.primary + TINT }}
          style={[
            styles.chip,
            { borderColor: selected ? colors.primary : colors.border },
            selected && { backgroundColor: colors.primary + TINT },
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={code}
          testID={`${testIDPrefix}-${code}`}
        >
          {selected && <Icon name="check" size={16} color={colors.primary} />}
          <Text style={[styles.chipText, { color: selected ? colors.primary : colors.mutedText }]}>
            {symbol && symbol !== code ? `${symbol} ${code}` : code}
          </Text>
        </Pressable>
      );
    })}
  </View>
));

CurrencyChipRow.displayName = 'CurrencyChipRow';

CurrencyChipRow.propTypes = {
  codes: PropTypes.arrayOf(PropTypes.string).isRequired,
  selectedCode: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
  showSymbol: PropTypes.bool,
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

export default CurrencyChipRow;
