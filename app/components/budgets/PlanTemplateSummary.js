import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import { SPACING } from '../../styles/layout';

const formatSummaryAmount = (amount) => {
  if (amount === 0) return '0';
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${Math.round(amount / 1000)}K`;
  return String(Math.round(amount));
};

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
 * Amounts are summed as plain numbers, matching the strip's original behaviour:
 * it is a coarse "how much is still to pay this month" gauge, not an accounting
 * figure (the per-line amounts and the totals row below are). With templates in
 * several currencies the sum mixes them — the same caveat the Planned tab had.
 */
export default function PlanTemplateSummary({ lines, month, colors, t }) {
  const summary = useMemo(() => {
    let pendingOut = 0;
    let pendingIn = 0;
    let totalOut = 0;
    let totalIn = 0;
    let doneCount = 0;
    let total = 0;
    for (const line of lines) {
      if (!line.hasTemplate) continue;
      total++;
      const amount = parseFloat(line.amount || '0');
      const isIn = line.kind === 'income';
      if (isIn) {
        totalIn += amount;
      } else {
        totalOut += amount;
      }
      if (line.lastExecutedMonth === month) {
        doneCount++;
      } else if (isIn) {
        pendingIn += amount;
      } else {
        pendingOut += amount;
      }
    }
    return {
      pendingOut, pendingIn, totalOut, totalIn, doneCount, total,
      progressFraction: total > 0 ? doneCount / total : 0,
    };
  }, [lines, month]);

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
          value={`${formatSummaryAmount(summary.pendingOut)} / ${formatSummaryAmount(summary.totalOut)}`}
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
          value={`${formatSummaryAmount(summary.pendingIn)} / ${formatSummaryAmount(summary.totalIn)}`}
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
      {/* "<n> <word>" needs a counter form, not the button caption `done` or the
          noun `remaining`: those produced "3 Готово" / "2 остаток" in Russian.
          Label-first keeps every language grammatical. */}
      <View style={styles.progressLabels}>
        <Text style={[styles.progressLabel, { color: colors.mutedText }]}>
          {`${t('done_count')}: ${summary.doneCount}`}
        </Text>
        <Text style={[styles.progressLabel, { color: colors.mutedText }]}>
          {`${t('remaining_count')}: ${summary.total - summary.doneCount}`}
        </Text>
      </View>
    </View>
  );
}

PlanTemplateSummary.propTypes = {
  lines: PropTypes.array.isRequired,
  month: PropTypes.string.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  progressFill: {
    borderRadius: 2,
    height: 3,
  },
  progressLabel: {
    fontSize: 11,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
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
