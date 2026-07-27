import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import * as Currency from '../../services/currency';
import { SPACING } from '../../styles/layout';

/** One of the strip's three identical value-over-label columns. */
const SummaryItem = ({ testID, color, mutedColor, value, label }) => (
  <View style={styles.summaryItem}>
    <Text testID={testID} style={[styles.summaryValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
    {/* Translated labels run 1.5-2× the English length and wrap here, so the
        columns are top-aligned and the text is centred within its third. */}
    <Text style={[styles.summaryLabel, { color: mutedColor }]} numberOfLines={2}>
      {label}
    </Text>
  </View>
);

SummaryItem.propTypes = {
  testID: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
  mutedColor: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
};

/**
 * Execution progress across the month's executable templates — pending money out,
 * how many are done, pending money in — ported from the former Planned tab and
 * now computed from the plan lines that carry a template (Budgets v3 phase 3).
 *
 * Amounts come from `amountById`, already converted into the screen's single
 * currency by the host. They used to be summed as bare `parseFloat` values across
 * whatever currencies the templates happened to store, and printed with no unit
 * at all — so a 300000 AMD rent showed up as "300K" one row above an income
 * header reading "535745 / 450000 RUB", two panels disagreeing about the same
 * month. Precise decimal math and one labelled currency now, matching the totals
 * row below exactly.
 */
export default function PlanTemplateSummary({
  lines, month, amountById, planCurrency, currencySuffix = '', colors, t,
}) {
  const summary = useMemo(() => {
    let pendingOut = '0';
    let pendingIn = '0';
    let totalOut = '0';
    let totalIn = '0';
    let doneCount = 0;
    let total = 0;
    for (const line of lines) {
      if (!line.hasTemplate) continue;
      total++;
      if (line.lastExecutedMonth === month) {
        doneCount++;
      }
      // A line with no rate into the screen's currency has no figure that can be
      // added here; it drops out of the money columns (the row itself carries the
      // "not converted" warning) but still counts toward the execution tally,
      // which is currency-free.
      const amount = amountById.get(line.id);
      if (amount == null) continue;
      const isIn = line.kind === 'income';
      const pending = line.lastExecutedMonth !== month;
      if (isIn) {
        totalIn = Currency.add(totalIn, amount, planCurrency);
        if (pending) pendingIn = Currency.add(pendingIn, amount, planCurrency);
      } else {
        totalOut = Currency.add(totalOut, amount, planCurrency);
        if (pending) pendingOut = Currency.add(pendingOut, amount, planCurrency);
      }
    }
    return {
      pendingOut, pendingIn, totalOut, totalIn, doneCount, total,
      progressFraction: total > 0 ? doneCount / total : 0,
    };
  }, [lines, month, amountById, planCurrency]);

  if (summary.total === 0) return null;

  return (
    <View
      style={[styles.summaryStrip, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="planned-summary-strip"
    >
      <View style={styles.summaryRow}>
        <SummaryItem
          testID="summary-pending-out"
          color={colors.expense}
          mutedColor={colors.mutedText}
          value={`${Currency.formatCompact(summary.pendingOut)} / ${Currency.formatCompact(summary.totalOut)}${currencySuffix}`}
          label={t('pending_out')}
        />
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <SummaryItem
          testID="summary-done-count"
          color={colors.text}
          mutedColor={colors.mutedText}
          value={`${summary.doneCount} / ${summary.total}`}
          label={t('done_this_month')}
        />
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <SummaryItem
          testID="summary-pending-in"
          color={colors.income}
          mutedColor={colors.mutedText}
          value={`${Currency.formatCompact(summary.pendingIn)} / ${Currency.formatCompact(summary.totalIn)}${currencySuffix}`}
          label={t('pending_in')}
        />
      </View>
      <View
        testID="summary-progress-bar"
        style={[styles.progressTrack, { backgroundColor: colors.border }]}
      >
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round(summary.progressFraction * 100)}%`, backgroundColor: colors.primary },
          ]}
        />
      </View>
      {/* No "done: 2 / remaining: 1" line under the bar. The middle column
          already reads "2 / 3" and the bar already draws the same ratio — a
          third and fourth statement of one fact, in a strip whose whole job is
          to state it once. */}
    </View>
  );
}

PlanTemplateSummary.propTypes = {
  lines: PropTypes.array.isRequired,
  month: PropTypes.string.isRequired,
  amountById: PropTypes.instanceOf(Map).isRequired,
  planCurrency: PropTypes.string.isRequired,
  currencySuffix: PropTypes.string,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  progressFill: {
    borderRadius: 2,
    height: 3,
  },
  progressTrack: {
    borderRadius: 2,
    height: 3,
    marginTop: SPACING.sm,
    overflow: 'hidden',
  },
  summaryDivider: {
    height: 30,
    width: StyleSheet.hairlineWidth,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 2,
  },
  summaryLabel: {
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  summaryRow: {
    // flex-start, not center: translated labels wrap to two lines at different
    // points, and centring made the three columns' numbers sit at different
    // heights.
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryStrip: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
  },
});
