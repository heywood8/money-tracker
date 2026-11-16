import React, { memo, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import PropTypes from 'prop-types';
import * as Currency from '../../services/currency';
import { getMonthAbbreviations } from '../graphs/monthLabels';
import { CARD_SURFACE } from '../../styles/componentStyles';
import { SPACING, FONT_SIZE, FONT_WEIGHT, ICON_SIZE, HORIZONTAL_PADDING, BORDER_RADIUS } from '../../styles/designTokens';

// Tallest bar. Small on purpose: this is a glance above a list, not a chart to
// read values off, and every dp it takes pushes the first result down.
const BAR_MAX_HEIGHT = 36;
// A month with any money keeps at least this much bar, so a small month next to
// a large one still reads as "something" rather than as an empty slot.
const BAR_MIN_HEIGHT = 3;
// An empty month draws a stub on the baseline, so the six slots stay legible
// as six months even when most of them are empty.
const BAR_EMPTY_HEIGHT = 2;

// Expenses print with a leading minus, income with a plus, as the day headers
// and the rows do — the sign is what tells the two apart without colour.
const formatTotal = (type, amount, currency, language) => (
  type === 'expense'
    ? Currency.formatMoney(Currency.multiply(amount, -1, currency), currency, { language })
    : `+${Currency.formatMoney(amount, currency, { language })}`
);

/**
 * The card above a search's results: what the search is (for a search by one
 * label or one category — the long-press menu's "Find by" chips), how many
 * operations it found and what they add up to, and for a label or category the
 * last months as bars, the current month in the accent.
 *
 * Figures come from `insight` (utils/searchInsight), which sums the result rows
 * themselves; this component only lays them out.
 */
const SearchInsightCard = ({ subject = null, insight, colors, t, language, onClear }) => {
  const { count, totals, chart } = insight;

  const totalParts = useMemo(() => ['expense', 'income'].flatMap((type) => (
    Object.entries(totals[type]).map(([currency, amount]) => ({
      key: `${type}-${currency}`,
      type,
      text: formatTotal(type, amount, currency, language),
    }))
  )), [totals, language]);

  const bars = useMemo(() => {
    if (!chart) return null;
    const abbreviations = getMonthAbbreviations(t);
    const values = chart.months.map((month) => Math.max(0, parseFloat(month.amount) || 0));
    const max = Math.max(...values);
    return chart.months.map((month, index) => {
      const value = values[index];
      let height = BAR_EMPTY_HEIGHT;
      if (value > 0 && max > 0) {
        height = Math.max(BAR_MIN_HEIGHT, Math.round((value / max) * BAR_MAX_HEIGHT));
      }
      return {
        key: month.key,
        label: abbreviations[month.month],
        height,
        empty: value === 0,
        current: index === chart.months.length - 1,
        spoken: `${abbreviations[month.month]} ${Currency.formatMoney(month.amount, chart.currency, { language })}`,
      };
    });
  }, [chart, t, language]);

  const amountColor = (type) => (type === 'expense' ? colors.expense : colors.income);

  return (
    <View
      testID="search-insight"
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {subject && (
        <View style={styles.header}>
          <Icon name={subject.icon} size={ICON_SIZE.sm} color={colors.primary} />
          <Text
            testID="search-insight-title"
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {subject.name}
          </Text>
          <Pressable
            testID="search-insight-clear"
            onPress={onClear}
            hitSlop={SPACING.md}
            accessibilityRole="button"
            accessibilityLabel={t('clear_filters')}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Icon name="close" size={ICON_SIZE.sm} color={colors.mutedText} />
          </Pressable>
        </View>
      )}

      <View style={styles.summary}>
        <Text testID="search-insight-count" style={[styles.count, { color: colors.mutedText }]}>
          {t('operations_count').replace('{count}', String(count))}
        </Text>
        {totalParts.length > 0 && (
          <Text testID="search-insight-totals" style={styles.totals}>
            {totalParts.map((part, index) => (
              <Text key={part.key} style={{ color: amountColor(part.type) }}>
                {index > 0 ? '  ' : ''}
                {part.text}
              </Text>
            ))}
          </Text>
        )}
      </View>

      {bars && (
        <View
          testID="search-insight-chart"
          style={styles.chart}
          accessible
          accessibilityRole="image"
          accessibilityLabel={bars.map((bar) => bar.spoken).join(', ')}
        >
          {bars.map((bar) => (
            <View key={bar.key} style={styles.column}>
              <View style={styles.track}>
                <View
                  testID={`search-insight-bar-${bar.key}`}
                  style={[
                    styles.bar,
                    {
                      height: bar.height,
                      backgroundColor: bar.current ? colors.primary : colors.mutedText,
                    },
                    !bar.current && styles.barPast,
                    bar.empty && styles.barEmpty,
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.month,
                  { color: bar.current ? colors.text : colors.mutedText },
                  bar.current && styles.monthCurrent,
                ]}
                numberOfLines={1}
              >
                {bar.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const monthShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  month: PropTypes.number.isRequired,
  amount: PropTypes.string.isRequired,
});

SearchInsightCard.propTypes = {
  // What the search is about, when it is about one thing; null for any other
  // search, which gets the count and totals without a title.
  subject: PropTypes.shape({
    name: PropTypes.string.isRequired,
    icon: PropTypes.string.isRequired,
  }),
  insight: PropTypes.shape({
    count: PropTypes.number.isRequired,
    totals: PropTypes.shape({
      expense: PropTypes.object.isRequired,
      income: PropTypes.object.isRequired,
    }).isRequired,
    chart: PropTypes.shape({
      currency: PropTypes.string.isRequired,
      months: PropTypes.arrayOf(monthShape).isRequired,
    }),
  }).isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  language: PropTypes.string,
  onClear: PropTypes.func,
};

const styles = StyleSheet.create({
  bar: {
    borderRadius: BORDER_RADIUS.sm,
    width: '100%',
  },
  barEmpty: {
    opacity: 0.2,
  },
  barPast: {
    opacity: 0.35,
  },
  card: {
    ...CARD_SURFACE,
    gap: SPACING.sm,
    marginHorizontal: HORIZONTAL_PADDING,
    marginTop: SPACING.sm,
    padding: SPACING.md,
  },
  chart: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  column: {
    alignItems: 'center',
    flex: 1,
    gap: SPACING.xs,
  },
  count: {
    fontSize: FONT_SIZE.sm,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  month: {
    fontSize: FONT_SIZE.xs,
  },
  monthCurrent: {
    fontWeight: FONT_WEIGHT.semibold,
  },
  pressed: {
    opacity: 0.55,
  },
  summary: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: SPACING.md,
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  totals: {
    flexShrink: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    textAlign: 'right',
  },
  track: {
    height: BAR_MAX_HEIGHT,
    justifyContent: 'flex-end',
    width: '70%',
  },
});

export default memo(SearchInsightCard);
