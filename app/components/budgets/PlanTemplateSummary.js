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
        <View style={styles.summaryItem}>
          <Text
            testID="summary-pending-out"
            style={[styles.summaryValue, { color: colors.expense }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {`${formatSummaryAmount(summary.pendingOut)} / ${formatSummaryAmount(summary.totalOut)}`}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>
            {t('pending_out')}
          </Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text
            testID="summary-done-count"
            style={[styles.summaryValue, { color: colors.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {`${summary.doneCount} / ${summary.total}`}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>
            {t('done_this_month')}
          </Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text
            testID="summary-pending-in"
            style={[styles.summaryValue, { color: colors.income }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {`${formatSummaryAmount(summary.pendingIn)} / ${formatSummaryAmount(summary.totalIn)}`}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>
            {t('pending_in')}
          </Text>
        </View>
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
      <View style={styles.progressLabels}>
        <Text style={[styles.progressLabel, { color: colors.mutedText }]}>
          {`${summary.doneCount} ${t('done')}`}
        </Text>
        <Text style={[styles.progressLabel, { color: colors.mutedText }]}>
          {`${summary.total - summary.doneCount} ${t('remaining')}`}
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
  },
  summaryLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  summaryRow: {
    alignItems: 'center',
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
