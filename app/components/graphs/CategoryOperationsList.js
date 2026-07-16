import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import PropTypes from 'prop-types';
import currencies from '../../../assets/currencies.json';
import { parseLabels, visibleListLabels, displayLabel } from '../../utils/labelUtils';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';

const formatOpAmount = (amount, currency) => {
  const info = currencies[currency];
  const symbol = info?.symbol ?? currency;
  const decimals = info?.decimal_digits ?? 2;
  return `${symbol}${parseFloat(amount).toFixed(decimals)}`;
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
 */
const CategoryOperationsList = ({ operations = [], loading = false, currency, colors, language, emptyText = '' }) => {
  const { hideBalances } = useDisplaySettings();

  if (loading) {
    return (
      <View testID="category-operations-loading" style={styles.centerBox}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!operations || operations.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.mutedText }]}>{emptyText}</Text>
    );
  }

  return (
    <View style={styles.container}>
      {operations.map((op, index) => {
        const labels = visibleListLabels(parseLabels(op.description));
        const dateText = formatOpDate(op.date, language);
        const primary = labels.length ? labels.map(displayLabel).join(', ') : dateText;
        const secondary = labels.length ? dateText : null;
        const isLast = index === operations.length - 1;

        return (
          <View
            key={op.id}
            style={[
              styles.row,
              !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
            ]}
          >
            <View style={styles.textCol}>
              <Text style={[styles.primary, { color: colors.text }]} numberOfLines={1}>
                {primary}
              </Text>
              {secondary ? (
                <Text style={[styles.secondary, { color: colors.mutedText }]} numberOfLines={1}>
                  {secondary}
                </Text>
              ) : null}
            </View>
            <View style={styles.amountCol}>
              <Text style={[styles.amount, { color: colors.text }]} numberOfLines={1}>
                {hideBalances ? '••••' : formatOpAmount(op.convertedAmount != null ? op.convertedAmount : op.amount, currency)}
              </Text>
              {/* For a converted foreign operation, show the original amount too */}
              {!hideBalances && op.convertedAmount != null && op.accountCurrency && op.accountCurrency !== currency ? (
                <Text style={[styles.amountOriginal, { color: colors.mutedText }]} numberOfLines={1}>
                  {formatOpAmount(op.amount, op.accountCurrency)}
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
      accountCurrency: PropTypes.string,
      convertedAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    }),
  ),
  loading: PropTypes.bool,
  currency: PropTypes.string.isRequired,
  colors: PropTypes.object.isRequired,
  language: PropTypes.string,
  emptyText: PropTypes.string,
};

const styles = StyleSheet.create({
  amount: {
    fontSize: 13,
    fontWeight: '600',
  },
  amountCol: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  amountOriginal: {
    fontSize: 11,
    marginTop: 2,
  },
  centerBox: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  container: {
    flex: 1,
    marginTop: 4,
  },
  empty: {
    fontSize: 14,
    paddingVertical: 32,
    textAlign: 'center',
  },
  primary: {
    fontSize: 13,
    fontWeight: '500',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingVertical: 10,
  },
  secondary: {
    fontSize: 11,
    marginTop: 2,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
});

export default CategoryOperationsList;
