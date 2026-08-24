import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { TouchableRipple } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import PropTypes from 'prop-types';
import currencies from '../../../assets/currencies.json';
import { parseLabels, visibleListLabels, displayLabel, isHiddenLabel } from '../../utils/labelUtils';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { add as addAmounts } from '../../services/currency';
import { SPACING, FONT_SIZE, FONT_WEIGHT, ICON_SIZE, HEIGHTS } from '../../styles/designTokens';
import { CHIP, CHIP_TEXT } from '../../styles/componentStyles';

// Chips beside the title, matching OperationListItem's cap on the same row.
const MAX_VISIBLE_LABELS = 3;

// Rows rendered before the "show all" button appears. The list renders plain
// Views (see below) so every row mounts at once — a category with a year of
// operations behind it would otherwise cost hundreds of views in one frame for
// a panel that only shows a handful of them.
export const INITIAL_ROW_LIMIT = 25;

export const SORT_DATE = 'date';
export const SORT_AMOUNT = 'amount';

const amountOf = (op) => (op.convertedAmount != null ? op.convertedAmount : op.amount);

const numericAmount = (op) => {
  const value = parseFloat(amountOf(op));
  return Number.isNaN(value) ? 0 : Math.abs(value);
};

const sumOf = (ops) => ops.reduce((sum, op) => addAmounts(sum, amountOf(op)), '0');

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
 * List of a single category's operations, shown in place of the donut once the
 * pie-chart drill-down reaches a leaf category. Renders plain Views (no inner
 * ScrollView / FlatList) so the parent chart ScrollView measures and animates
 * its height — hence the row limit above rather than virtualisation.
 *
 * The row is the Operations tab's row (see OperationListItem), not a layout of
 * its own: category icon, a title with label chips beside it, a muted subtitle,
 * and the amount closing the row. Only the title differs, and only because the
 * category is a constant here — every row would carry the same word — so the
 * operation's first label takes the title and the rest stay chips. An operation
 * with no labels falls back to the category name, so no row is anonymous.
 *
 * Days are separated the way the Operations tab separates them, by a header
 * carrying the date and that day's total, rather than by a date column that
 * would stand empty on most rows. Sorting by amount dissolves the day runs, so
 * there the date joins the subtitle instead and no headers are drawn.
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
  categoryName = '',
  categoryIcon = 'shape-outline',
  getAccountName = null,
  onOperationPress = null,
}) => {
  const { hideBalances } = useDisplaySettings();
  const [sortBy, setSortBy] = useState(SORT_DATE);
  const [showAll, setShowAll] = useState(false);

  const toggleSort = useCallback(() => {
    setSortBy((current) => (current === SORT_DATE ? SORT_AMOUNT : SORT_DATE));
  }, []);

  const revealAll = useCallback(() => setShowAll(true), []);

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

  // Sum of exactly what the rows show — converted amounts where the operation
  // was in a foreign currency, so the total matches the slice it came from.
  // It covers the whole category, not just the rows currently revealed.
  const total = useMemo(() => sumOf(operations), [operations]);

  // The DB hands the list back in date order; sorting by amount is done here
  // rather than in SQL because the rows are already in memory and a re-query
  // would blank the panel and re-run its height animation.
  const sorted = useMemo(() => {
    if (sortBy !== SORT_AMOUNT) return operations;
    return [...operations].sort((a, b) => numericAmount(b) - numericAmount(a));
  }, [operations, sortBy]);

  // The limit cuts the rows, not the days — a day long enough to overrun it on
  // its own must still be bounded. That can leave the last day partly listed, so
  // a day carries a total only when all of its operations are on screen: a
  // header summing three of a day's eight operations would read as the day's
  // spending and be wrong. Sorted by amount there are no days at all.
  const visible = showAll ? sorted : sorted.slice(0, INITIAL_ROW_LIMIT);
  const hiddenCount = sorted.length - visible.length;

  const groups = useMemo(() => {
    if (sortBy === SORT_AMOUNT) return [{ key: 'all', date: null, items: visible, complete: false }];

    const perDay = new Map();
    for (const op of sorted) perDay.set(op.date, (perDay.get(op.date) ?? 0) + 1);

    const byDay = [];
    for (const op of visible) {
      const last = byDay[byDay.length - 1];
      if (last && last.date === op.date) last.items.push(op);
      else byDay.push({ key: op.date, date: op.date, items: [op] });
    }
    return byDay.map(group => ({ ...group, complete: group.items.length === perDay.get(group.date) }));
  }, [sorted, sortBy, visible]);

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

  const renderRow = (op, isLast) => {
    const labels = visibleListLabels(parseLabels(op.description));
    // The category names every row here, so it cannot be the title the way it is
    // on the Operations tab — the operation's own first label takes that place.
    // Not the [MoneyOK] import marker though: it leads the description of every
    // imported operation, so titling with it would put the same word down the
    // whole list — the very thing the category could not be the title for. It
    // stays a chip, as it is on the Operations tab.
    const titleIndex = labels.findIndex((label) => !isHiddenLabel(label));
    const titleLabel = titleIndex === -1 ? null : labels[titleIndex];
    const title = titleLabel ? displayLabel(titleLabel) : (categoryName || t('unknown_category'));
    const restLabels = labels.filter((_, index) => index !== titleIndex);
    const chips = restLabels.slice(0, MAX_VISIBLE_LABELS);
    const overflowCount = restLabels.length - chips.length;
    const amountColor = (op.type === 'income' ? colors.income : colors.expense) ?? colors.text;
    const accountName = getAccountName ? getAccountName(op.accountId) : '';
    // Sorted by amount the date has no header to live in, so it leads the
    // subtitle — the same "context · account" shape the Operations tab uses.
    const subtitle = sortBy === SORT_AMOUNT
      ? [formatOpDate(op.date, language), accountName].filter(Boolean).join(' · ')
      : accountName;
    const shownAmount = amountOf(op);
    const formattedAmount = hideBalances
      ? '••••'
      : formatOpAmount(shownAmount, currency, language);
    // The chips sit inside the row's accessibility group, so a screen reader
    // reads only what this label names: every label has to be in it, and the
    // date too, which in date order lives in the header rather than the row.
    const accessibilityLabel = [
      formatOpDate(op.date, language),
      title,
      ...restLabels.map(displayLabel),
      accountName,
      hideBalances ? '' : formattedAmount,
    ].filter(Boolean).join(', ');

    const body = (
      <View style={styles.row}>
        <View style={styles.iconContainer}>
          <Icon name={categoryIcon} size={ICON_SIZE.md} color={amountColor} />
        </View>

        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            {chips.map((label) => (
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
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.mutedText }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.amountContainer}>
          <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
            {formattedAmount}
          </Text>
          {/* For a converted foreign operation, show the original amount too */}
          {!hideBalances && op.convertedAmount != null && op.accountCurrency && op.accountCurrency !== currency ? (
            <Text style={[styles.foreignAmount, { color: colors.mutedText }]} numberOfLines={1}>
              {formatOpAmount(op.amount, op.accountCurrency, language)}
            </Text>
          ) : null}
        </View>
      </View>
    );

    const separator = isLast ? null : (
      <View style={[styles.separator, { backgroundColor: colors.border }]} />
    );

    if (!onOperationPress) {
      return (
        <View key={op.id}>
          {body}
          {separator}
        </View>
      );
    }

    return (
      <View key={op.id}>
        <TouchableRipple
          testID={`category-operation-${op.id}`}
          onPress={() => onOperationPress(op)}
          rippleColor="rgba(0, 0, 0, .08)"
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={t('graph_operation_row_hint')}
        >
          {body}
        </TouchableRipple>
        {separator}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {header}

      {/* One operation has nothing to be sorted against. */}
      {operations.length > 1 ? (
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

      {groups.map((group) => (
        <View key={group.key}>
          {group.date ? (
            <View style={styles.dayHeader} testID={`category-operations-day-${group.date}`}>
              <Text style={[styles.dayLabel, { color: colors.mutedText }]}>
                {formatOpDate(group.date, language).toUpperCase()}
              </Text>
              {/* A one-operation day would only echo the row's own figure. */}
              {group.complete && group.items.length > 1 ? (
                <Text style={[styles.dayTotal, { color: colors.mutedText }]} numberOfLines={1}>
                  {hideBalances ? '••••' : formatOpAmount(sumOf(group.items), currency, language)}
                </Text>
              ) : null}
            </View>
          ) : null}
          {group.items.map((op, index) => renderRow(op, index === group.items.length - 1))}
        </View>
      ))}

      {hiddenCount > 0 ? (
        <TouchableOpacity
          testID="category-operations-show-all"
          style={[styles.showAll, { borderTopColor: colors.border }]}
          onPress={revealAll}
          accessibilityRole="button"
        >
          <Text style={[styles.showAllText, { color: colors.primary }]}>
            {t('show_all_operations').replace('{count}', String(operations.length))}
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
  // Titles a row that carries no labels of its own.
  categoryName: PropTypes.string,
  // Drawn in every row's icon slot — the whole list is one category.
  categoryIcon: PropTypes.string,
  // Resolves an account id to its display name for the row's subtitle.
  getAccountName: PropTypes.func,
  // Opens an operation for editing. Rows are read-only when it is not given.
  onOperationPress: PropTypes.func,
};

const styles = StyleSheet.create({
  amount: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    includeFontPadding: false,
    textAlign: 'right',
  },
  amountContainer: {
    alignItems: 'flex-end',
    marginLeft: SPACING.md,
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
  dayHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: SPACING.xs,
    paddingTop: SPACING.md,
  },
  dayLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: 0.6,
  },
  dayTotal: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  empty: {
    fontSize: FONT_SIZE.md,
    paddingVertical: 32,
    textAlign: 'center',
  },
  foreignAmount: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.regular,
    marginTop: 2,
    textAlign: 'right',
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
  iconContainer: {
    alignItems: 'center',
    marginRight: SPACING.md,
    width: 32,
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
    maxWidth: 140,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: HEIGHTS.listItem,
    paddingVertical: SPACING.xs,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 32 + SPACING.md,
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
    fontSize: FONT_SIZE.sm,
    includeFontPadding: false,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  title: {
    flexShrink: 1,
    fontSize: FONT_SIZE.md + 1,
    fontWeight: FONT_WEIGHT.medium,
    includeFontPadding: false,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
});

export default CategoryOperationsList;
