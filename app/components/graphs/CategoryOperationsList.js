import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import PropTypes from 'prop-types';
import currencies from '../../../assets/currencies.json';
import { parseLabels, visibleListLabels, displayLabel } from '../../utils/labelUtils';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { add as addAmounts } from '../../services/currency';
import { SPACING, FONT_SIZE, FONT_WEIGHT } from '../../styles/designTokens';

// Cap the chips per row so a heavily-labelled operation can't blow up the row
// height inside the fixed-height chart panel; the remainder becomes "+N".
const MAX_VISIBLE_LABELS = 3;

// Group digits ("₽100 000", not "₽100000"). The amounts here are exact rather
// than the compact "₽100.0K" the charts use — this is the one place in Graphs
// that shows individual operations, so the figure has to be readable in full.
const formatOpAmount = (amount, currency, language) => {
  const info = currencies[currency];
  const symbol = info?.symbol ?? currency;
  const decimals = info?.decimal_digits ?? 2;
  const value = parseFloat(amount);
  if (Number.isNaN(value)) return `${symbol}${amount}`;
  try {
    return `${symbol}${value.toLocaleString(language || undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  } catch {
    return `${symbol}${value.toFixed(decimals)}`;
  }
};

// Format "day month" in the app's language. Formatting day + month together lets
// ICU pick the *genitive* month form used in dates ("5 июля", not the standalone
// "Июль") and yields locale-correct ordering/spelling for every language. The
// T00:00:00 suffix pins the bare YYYY-MM-DD to local midnight so it never slips
// a day west of Greenwich.
const formatOpDate = (dateStr, language) => {
  if (typeof dateStr !== 'string') return '';
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  try {
    return date.toLocaleDateString(language || undefined, { day: 'numeric', month: 'long' });
  } catch {
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  }
};

/**
 * Flat, read-only list of a single category's operations, shown in place of the
 * donut once the pie-chart drill-down reaches a leaf category. Renders plain
 * Views (no inner ScrollView) so the parent chart ScrollView measures and
 * animates its height.
 *
 * Layout mirrors the Operations tab rather than inventing its own: the date
 * leads the row in muted small caps, labels ride beside it as chips, and the
 * amount closes the row in the type's colour. A date only prints on the first
 * operation of its day, so same-day operations read as one block without
 * needing a separator row of their own.
 *
 * `headerChip` is the drill-down back chip: with no donut to sit under, it
 * heads the list instead, paired with the category's total for the period.
 */
const CategoryOperationsList = ({
  operations = [],
  loading = false,
  currency,
  colors,
  language,
  emptyText = '',
  headerChip = null,
}) => {
  const { hideBalances } = useDisplaySettings();

  // Sum of exactly what the rows show — converted amounts where the operation
  // was in a foreign currency, so the total matches the slice it came from.
  const total = useMemo(
    () => operations.reduce(
      (sum, op) => addAmounts(sum, op.convertedAmount != null ? op.convertedAmount : op.amount),
      '0',
    ),
    [operations],
  );

  const header = headerChip ? (
    <View style={styles.header}>
      <View style={styles.headerChip}>{headerChip}</View>
      {operations.length > 0 && !loading ? (
        <Text style={[styles.headerTotal, { color: colors.text }]} numberOfLines={1}>
          {hideBalances ? '••••' : formatOpAmount(total, currency, language)}
        </Text>
      ) : null}
    </View>
  ) : null;

  if (loading) {
    return (
      <View>
        {header}
        <View testID="category-operations-loading" style={styles.centerBox}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!operations || operations.length === 0) {
    return (
      <View>
        {header}
        <Text style={[styles.empty, { color: colors.mutedText }]}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      {operations.map((op, index) => {
        const labels = visibleListLabels(parseLabels(op.description));
        const visibleLabels = labels.slice(0, MAX_VISIBLE_LABELS);
        const overflowCount = labels.length - visibleLabels.length;
        // Repeat the date only when the day changes — the list arrives sorted by
        // date, so equal neighbours are the same day.
        const startsDay = index === 0 || op.date !== operations[index - 1].date;
        const amountColor = (op.type === 'income' ? colors.income : colors.expense) ?? colors.text;

        return (
          <View
            key={op.id}
            style={[
              styles.row,
              startsDay && index > 0 && {
                borderTopColor: colors.border,
                borderTopWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <View style={styles.dateCol}>
              {startsDay ? (
                <Text style={[styles.date, { color: colors.mutedText }]} numberOfLines={1}>
                  {formatOpDate(op.date, language)}
                </Text>
              ) : null}
            </View>

            <View style={styles.labelsCol}>
              {visibleLabels.map((label) => (
                <View
                  key={label}
                  style={[styles.labelChip, { backgroundColor: colors.altRow, borderColor: colors.border }]}
                >
                  <Text style={[styles.labelChipText, { color: colors.mutedText }]} numberOfLines={1}>
                    {displayLabel(label)}
                  </Text>
                </View>
              ))}
              {overflowCount > 0 ? (
                <View style={[styles.labelChip, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
                  <Text style={[styles.labelChipText, { color: colors.mutedText }]}>{`+${overflowCount}`}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.amountCol}>
              <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
                {hideBalances
                  ? '••••'
                  : formatOpAmount(op.convertedAmount != null ? op.convertedAmount : op.amount, currency, language)}
              </Text>
              {/* For a converted foreign operation, show the original amount too */}
              {!hideBalances && op.convertedAmount != null && op.accountCurrency && op.accountCurrency !== currency ? (
                <Text style={[styles.amountOriginal, { color: colors.mutedText }]} numberOfLines={1}>
                  {formatOpAmount(op.amount, op.accountCurrency, language)}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
};

CategoryOperationsList.propTypes = {
  operations: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      date: PropTypes.string,
      description: PropTypes.string,
      type: PropTypes.string,
      accountCurrency: PropTypes.string,
      convertedAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    }),
  ),
  loading: PropTypes.bool,
  currency: PropTypes.string.isRequired,
  colors: PropTypes.object.isRequired,
  language: PropTypes.string,
  emptyText: PropTypes.string,
  // Drill-down back chip; heads the list when there is no donut to sit under.
  headerChip: PropTypes.node,
};

const styles = StyleSheet.create({
  amount: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    includeFontPadding: false,
    textAlign: 'right',
  },
  amountCol: {
    alignItems: 'flex-end',
    marginLeft: SPACING.sm,
  },
  amountOriginal: {
    fontSize: FONT_SIZE.xs,
    includeFontPadding: false,
    marginTop: 2,
    textAlign: 'right',
  },
  centerBox: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  container: {
    flex: 1,
  },
  date: {
    fontSize: FONT_SIZE.sm,
    includeFontPadding: false,
  },
  dateCol: {
    justifyContent: 'center',
    marginRight: SPACING.sm,
    minWidth: 76,
  },
  empty: {
    fontSize: FONT_SIZE.md,
    paddingVertical: 32,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
    paddingBottom: SPACING.sm,
  },
  headerChip: {
    flexShrink: 1,
    marginRight: SPACING.sm,
  },
  headerTotal: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    includeFontPadding: false,
  },
  labelChip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 1,
  },
  labelChipText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
    maxWidth: 120,
  },
  labelsCol: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    minWidth: 0,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: SPACING.sm,
  },
});

export default CategoryOperationsList;
