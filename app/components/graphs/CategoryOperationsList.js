import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { TouchableRipple } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import PropTypes from 'prop-types';
import currencies from '../../../assets/currencies.json';
import { parseLabels, visibleListLabels, displayLabel } from '../../utils/labelUtils';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { add as addAmounts } from '../../services/currency';
import { SPACING, FONT_SIZE, FONT_WEIGHT, ICON_SIZE, BORDER_RADIUS } from '../../styles/designTokens';
import { CHIP, CHIP_TEXT } from '../../styles/componentStyles';

// Cap the chips per row so a heavily-labelled operation can't blow up the row
// height inside the fixed-height chart panel; the remainder becomes "+N".
const MAX_VISIBLE_LABELS = 3;

// Rows rendered before the "show all" button appears. The list renders plain
// Views (see below) so every row mounts at once — a category with a year of
// operations behind it would otherwise cost hundreds of views in one frame for
// a panel that only shows a handful of them.
export const INITIAL_ROW_LIMIT = 25;

export const SORT_DATE = 'date';
export const SORT_AMOUNT = 'amount';

// Height of the magnitude bar under a row. Deliberately hairline-thin: it is a
// reading aid for comparing neighbouring rows, not a chart of its own.
const SHARE_BAR_HEIGHT = 2;

const numericAmount = (op) => {
  const value = parseFloat(op.convertedAmount != null ? op.convertedAmount : op.amount);
  return Number.isNaN(value) ? 0 : Math.abs(value);
};

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
 * Flat list of a single category's operations, shown in place of the donut once
 * the pie-chart drill-down reaches a leaf category. Renders plain Views (no
 * inner ScrollView / FlatList) so the parent chart ScrollView measures and
 * animates its height — hence the row limit above rather than virtualisation.
 *
 * Layout mirrors the Operations tab rather than inventing its own: the date
 * leads the row in muted small caps, labels ride beside it as chips, and the
 * amount closes the row in the type's colour. A date only prints on the first
 * operation of its day, so same-day operations read as one block without
 * needing a separator row of their own — but only while the list is in date
 * order; sorted by amount, neighbouring rows are no longer the same day and
 * every row carries its date.
 *
 * A row identifies itself even with no labels on it: the account name stands in
 * as the row's text, and it is shown alongside the labels too whenever the list
 * spans more than one account (in converted mode it usually does). Under each
 * row a bar draws the operation's size against the largest in the category, so
 * "which of these actually matters" is answered without reading the digits.
 *
 * `headerChip` is the drill-down back chip: with no donut to sit under, it
 * heads the list instead, paired with the category's total for the period.
 * `onOperationPress` makes the rows open the operation for editing; without it
 * the list stays read-only.
 */
const CategoryOperationsList = ({
  operations = [],
  loading = false,
  currency,
  colors,
  language,
  emptyText = '',
  headerChip = null,
  t = (key) => key,
  getAccountName = null,
  onOperationPress = null,
}) => {
  const { hideBalances } = useDisplaySettings();
  const [sortBy, setSortBy] = useState(SORT_DATE);
  const [showAll, setShowAll] = useState(false);

  // The limit is a bound on how many rows mount at once, so it has to come back
  // whenever the category holds a different number of them: the chart subtree is
  // keyed on the category, not on the period, so widening a revealed month to a
  // whole year would otherwise mount the year's operations in one frame. Keyed
  // on the count rather than the array identity, which is replaced on every
  // reload — editing a listed operation should not fold the list back up.
  const [countAtReveal, setCountAtReveal] = useState(operations.length);
  if (countAtReveal !== operations.length) {
    setCountAtReveal(operations.length);
    if (showAll) setShowAll(false);
  }

  const toggleSort = useCallback(() => {
    setSortBy((current) => (current === SORT_DATE ? SORT_AMOUNT : SORT_DATE));
  }, []);

  const revealAll = useCallback(() => setShowAll(true), []);

  // Sum of exactly what the rows show — converted amounts where the operation
  // was in a foreign currency, so the total matches the slice it came from.
  // It covers the whole category, not just the rows currently revealed.
  const total = useMemo(
    () => operations.reduce(
      (sum, op) => addAmounts(sum, op.convertedAmount != null ? op.convertedAmount : op.amount),
      '0',
    ),
    [operations],
  );

  // The bar scale is the largest operation in the WHOLE category, not in the
  // revealed slice — otherwise pressing "show all" would silently rescale every
  // bar the reader had already compared.
  const maxAmount = useMemo(
    () => operations.reduce((max, op) => Math.max(max, numericAmount(op)), 0),
    [operations],
  );

  // Repeating one account name down every row says nothing; it only earns its
  // line when the list actually mixes accounts.
  const spansAccounts = useMemo(() => {
    if (!getAccountName) return false;
    const seen = new Set();
    for (const op of operations) {
      seen.add(op.accountId);
      if (seen.size > 1) return true;
    }
    return false;
  }, [operations, getAccountName]);

  // The DB hands the list back in date order; sorting by amount is done here
  // rather than in SQL because the rows are already in memory and a re-query
  // would blank the panel and re-run its height animation.
  const sorted = useMemo(() => {
    if (sortBy !== SORT_AMOUNT) return operations;
    return [...operations].sort((a, b) => numericAmount(b) - numericAmount(a));
  }, [operations, sortBy]);

  const visible = showAll ? sorted : sorted.slice(0, INITIAL_ROW_LIMIT);
  const hiddenCount = sorted.length - visible.length;

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

  // One operation has nothing to be sorted against, and nothing to compare its
  // size to either.
  const showSort = operations.length > 1;
  const showBars = operations.length > 1 && !hideBalances && maxAmount > 0;

  return (
    <View style={styles.container}>
      {header}

      {showSort ? (
        <View style={styles.controls}>
          <TouchableOpacity
            testID="category-operations-sort"
            style={[styles.sortChip, { borderColor: colors.border, backgroundColor: colors.altRow }]}
            onPress={toggleSort}
            accessibilityRole="button"
            accessibilityLabel={sortBy === SORT_DATE ? t('sort_by_date') : t('sort_by_amount')}
            accessibilityHint={t('sort_operations_hint')}
          >
            <Icon name="swap-vertical" size={ICON_SIZE.xs} color={colors.mutedText} />
            <Text style={[styles.sortChipText, { color: colors.mutedText }]}>
              {sortBy === SORT_DATE ? t('sort_by_date') : t('sort_by_amount')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {visible.map((op, index) => {
        const labels = visibleListLabels(parseLabels(op.description));
        const visibleLabels = labels.slice(0, MAX_VISIBLE_LABELS);
        const overflowCount = labels.length - visibleLabels.length;
        // Repeat the date only when the day changes — in date order the list
        // arrives sorted, so equal neighbours are the same day. Sorted by
        // amount there are no day runs left to collapse.
        const startsDay = sortBy === SORT_AMOUNT
          || index === 0
          || op.date !== visible[index - 1].date;
        const amountColor = (op.type === 'income' ? colors.income : colors.expense) ?? colors.text;
        const accountName = getAccountName ? getAccountName(op.accountId) : '';
        // With no labels the account name IS the row's text — otherwise the row
        // would be a bare date and a number, identifying nothing.
        const subtitle = accountName && (spansAccounts || labels.length === 0) ? accountName : '';
        const shownAmount = op.convertedAmount != null ? op.convertedAmount : op.amount;
        const sharePercent = showBars
          ? Math.max(2, Math.round((numericAmount(op) / maxAmount) * 100))
          : 0;

        const accessibilityLabel = [
          formatOpDate(op.date, language),
          labels.map(displayLabel).join(', '),
          accountName,
          hideBalances ? '' : formatOpAmount(shownAmount, currency, language),
        ].filter(Boolean).join(', ');

        const body = (
          <View
            style={[
              styles.row,
              startsDay && index > 0 && {
                borderTopColor: colors.border,
                borderTopWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <View style={styles.rowMain}>
              <View style={styles.dateCol}>
                {startsDay ? (
                  <Text style={[styles.date, { color: colors.mutedText }]} numberOfLines={1}>
                    {formatOpDate(op.date, language)}
                  </Text>
                ) : null}
              </View>

              <View style={styles.detailCol}>
                {visibleLabels.length > 0 || overflowCount > 0 ? (
                  <View style={styles.labelsRow}>
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
                ) : null}
                {subtitle ? (
                  <Text style={[styles.subtitle, { color: colors.mutedText }]} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>

              <View style={styles.amountCol}>
                <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
                  {hideBalances ? '••••' : formatOpAmount(shownAmount, currency, language)}
                </Text>
                {/* For a converted foreign operation, show the original amount too */}
                {!hideBalances && op.convertedAmount != null && op.accountCurrency && op.accountCurrency !== currency ? (
                  <Text style={[styles.amountOriginal, { color: colors.mutedText }]} numberOfLines={1}>
                    {formatOpAmount(op.amount, op.accountCurrency, language)}
                  </Text>
                ) : null}
              </View>
            </View>

            {showBars ? (
              <View
                testID={`category-operation-bar-${op.id}`}
                style={[styles.shareBar, { width: `${sharePercent}%`, backgroundColor: amountColor }]}
              />
            ) : null}
          </View>
        );

        if (!onOperationPress) {
          return <View key={op.id}>{body}</View>;
        }

        return (
          <TouchableRipple
            key={op.id}
            testID={`category-operation-${op.id}`}
            onPress={() => onOperationPress(op)}
            rippleColor="rgba(0, 0, 0, .08)"
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={t('graph_operation_row_hint')}
          >
            {body}
          </TouchableRipple>
        );
      })}

      {hiddenCount > 0 ? (
        <TouchableOpacity
          testID="category-operations-show-all"
          style={[styles.showAll, { borderTopColor: colors.border }]}
          onPress={revealAll}
          accessibilityRole="button"
        >
          <Text style={[styles.showAllText, { color: colors.primary }]}>
            {t('show_all_operations').replace('{count}', String(sorted.length))}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

CategoryOperationsList.propTypes = {
  operations: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      accountId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
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
  t: PropTypes.func,
  // Resolves an account id to its display name; without it the account line and
  // the no-label fallback are simply not drawn.
  getAccountName: PropTypes.func,
  // Opens an operation for editing. Rows are read-only when it is not given.
  onOperationPress: PropTypes.func,
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
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: SPACING.xs,
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
  detailCol: {
    flex: 1,
    gap: SPACING.xs,
    minWidth: 0,
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
  labelsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  row: {
    paddingVertical: SPACING.sm,
  },
  rowMain: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  shareBar: {
    borderRadius: BORDER_RADIUS.pill,
    height: SHARE_BAR_HEIGHT,
    marginTop: SPACING.xs,
    opacity: 0.5,
  },
  showAll: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: SPACING.xs,
    paddingVertical: SPACING.md,
  },
  showAllText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
  },
  sortChip: CHIP,
  sortChipText: {
    ...CHIP_TEXT,
    fontSize: FONT_SIZE.xs,
  },
  subtitle: {
    fontSize: FONT_SIZE.xs,
    includeFontPadding: false,
  },
});

export default CategoryOperationsList;
