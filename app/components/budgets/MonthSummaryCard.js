import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import * as Currency from '../../services/currency';
import { BORDER_RADIUS, FONT_SIZE, FONT_WEIGHT, SPACING } from '../../styles/designTokens';
import { CARD_SURFACE, SECTION_LABEL } from '../../styles/componentStyles';
import { currentMonthKey, monthElapsedFraction } from '../../utils/monthUtils';

/**
 * Stands in for the remainder until the plan section has computed and reported
 * one. The label alone would read as a value that failed to load, and reserving
 * the line keeps the block from jumping a row taller once the figure arrives.
 */
const PENDING_PLACEHOLDER = '—';

/** Height of the flow bar, and the pill radius it is drawn with. */
const BAR_HEIGHT = 10;

/**
 * How far the pace mark sticks out above and below the bar.
 *
 * It has to read over a saturated segment, over the pale committed one and over
 * the bare track alike, and a tick that stops at the bar's edges disappears into
 * whichever of those it happens to land on. The overhang is what makes it a mark
 * ON a scale rather than a stripe IN a segment.
 */
const PACE_OVERHANG = 4;

/** Bare track showing between two segments, so the break between them is legible. */
const SEGMENT_GAP = 2;

/**
 * Floor for a segment that exists at all. A 0.3% segment rounds to a sub-pixel
 * width and vanishes, which says "none" about something there is some of.
 */
const MIN_SEGMENT_WIDTH = 3;

/** Dot in the legend, matching each segment's colour. */
const DOT_SIZE = 8;

/**
 * A fraction as a percentage string, without binary-float debris — the same
 * helper PlanProgressBar keeps, for the same reason: `(1 - 0.728) * 100` is
 * "27.200000000000003", which Yoga parses fine and which turns every style
 * assertion in the tests into a guess about rounding.
 */
const pct = (fraction) => `${Number((fraction * 100).toFixed(4))}%`;

/** Geometry only — never money. A non-numeric amount contributes nothing. */
const num = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const minAmount = (a, b) => (Currency.compare(a, b) <= 0 ? a : b);
const maxAmount = (a, b) => (Currency.compare(a, b) >= 0 ? a : b);

/**
 * The month split into the four things money can be in, in the order it passes
 * through them: spent, spent past the plan, committed but not yet spent,
 * committed past the income, and whatever is left free.
 *
 * The bar's full width is their sum rather than a fixed maximum, which is what
 * lets the same geometry describe an ordinary month (the sum IS the expected
 * income) and an over-committed one (the sum is the allocation, and the free
 * zone has closed to nothing) without a special case for either.
 *
 * With no income declared the income-relative pieces are dropped rather than
 * counted as overruns: a first-time user who has planned before recording a
 * salary would otherwise get a bar entirely in the alarm colours, which is the
 * same degenerate reading the remainder figure already guards against.
 */
const computeFlow = (totals) => {
  const hasActual = totals.actual != null;
  const income = Math.max(num(totals.expectedIncome), 0);
  const allocated = Math.max(num(totals.allocated), 0);
  const actual = hasActual ? Math.max(num(totals.actual), 0) : 0;
  const basis = income > 0 ? income : allocated;

  const spent = Math.min(actual, allocated);
  const overspent = Math.max(0, actual - allocated);
  const committed = Math.max(0, Math.min(allocated, basis) - actual);
  const overCommitted = income > 0 ? Math.max(0, allocated - Math.max(income, actual)) : 0;
  const free = income > 0 ? Math.max(0, income - allocated) : 0;

  return {
    hasActual,
    hasIncome: income > 0,
    allocated,
    spent,
    overspent,
    committed,
    overCommitted,
    free,
    total: spent + overspent + committed + overCommitted + free,
  };
};

/**
 * The month's own figures, as a bar with a legend rather than as a line of prose.
 *
 * What was here before was the same numbers written out — "Allocated 1.94M ·
 * Actual 1.66M" under the remainder — which is a report of three quantities that
 * are only meaningful against each other. As a bar the relation IS the picture:
 * how much of the month's income is already spent, how much is committed and
 * still to go, and how much is genuinely free is one glance rather than three
 * subtractions.
 *
 * The pace mark is the one thing here that is not in the numbers at all. It sits
 * where an evenly-paced month would have spent to by today, so a bar that is
 * ahead of it and a bar that is behind it read differently even when they carry
 * the same figure. PlanProgressBar deliberately dropped its own copy of that
 * mark: with every row drawing a bar, a per-row vertical was furniture. At the
 * month level it appears exactly once, which is where a calendar fact belongs.
 */
const MonthSummaryCard = ({
  totals = null,
  month,
  showCurrencyCode = false,
  colors,
  t,
  testID = 'budget-summary-card',
}) => {
  const flow = useMemo(() => (totals ? computeFlow(totals) : null), [totals]);

  // Only for the month in progress. A finished month has nothing to be ahead or
  // behind of, and a future one has not started.
  //
  // Gated on the month key rather than on the elapsed fraction: the last day of
  // a month is fully elapsed, so a `fraction >= 1` test would take the mark away
  // on the one day it is most worth having — and would take it away only on the
  // 31st, which is the kind of thing that is found in production rather than in
  // a test suite that happened to run on the 12th.
  const paceFraction = useMemo(() => {
    if (!flow || flow.total <= 0 || flow.allocated <= 0) return null;
    if (month !== currentMonthKey()) return null;
    return Math.min(1, (monthElapsedFraction(month) * flow.allocated) / flow.total);
  }, [flow, month]);

  const segments = useMemo(() => {
    if (!flow || flow.total <= 0) return [];
    return [
      { key: 'spent', value: flow.spent, style: null, color: colors.primary },
      { key: 'overspent', value: flow.overspent, style: null, color: colors.overspend },
      { key: 'committed', value: flow.committed, style: styles.committed, color: colors.primary },
      {
        key: 'over-committed',
        value: flow.overCommitted,
        style: styles.overCommitted,
        color: colors.warning,
      },
    ].filter(segment => segment.value > 0);
  }, [flow, colors]);

  // At most three: what is spent, what that leaves of the plan (or how far past
  // it the month already is), and what is free (or how far past the income the
  // plan itself is). The pairs are mutually exclusive by construction — a month
  // cannot be both under and over its plan — so the row never grows a fourth
  // column and never has to wrap.
  const legend = useMemo(() => {
    if (!flow || flow.total <= 0) return [];
    const items = [];
    if (flow.hasActual) {
      items.push({
        key: 'spent',
        label: t('spent_amount'),
        // The segment's own amount, not the whole actual: past the plan the
        // excess is the entry beside this one, and printing the full figure
        // here would count it twice under two dots that are drawn side by side.
        amount: minAmount(totals.actual, totals.allocated),
        color: colors.primary,
      });
    }
    if (flow.overspent > 0) {
      items.push({
        key: 'overspent',
        label: t('budget_overspent'),
        amount: Currency.subtract(totals.actual, totals.allocated),
        color: colors.overspend,
        alert: true,
      });
    } else if (flow.committed > 0) {
      // The segment stops at the income when the plan runs past it, so its
      // amount does too — the part beyond is the over-income entry below.
      const ceiling = flow.hasIncome
        ? minAmount(totals.allocated, totals.expectedIncome)
        : totals.allocated;
      items.push({
        key: 'committed',
        // Naming it as the plan is only true where the segment IS the plan:
        // nothing spent against it yet, and none of it past the income. Any
        // other shape and it is a part of the plan, which is what "in plan"
        // says and what the amount beside it means.
        label: flow.hasActual || flow.overCommitted > 0 ? t('budget_committed') : t('allocated'),
        amount: flow.hasActual ? Currency.subtract(ceiling, totals.actual) : ceiling,
        color: colors.primary,
        dim: true,
      });
    }
    if (flow.overCommitted > 0) {
      items.push({
        key: 'over-committed',
        label: t('budget_over_allocated'),
        amount: Currency.subtract(
          totals.allocated,
          maxAmount(totals.expectedIncome, totals.actual ?? '0'),
        ),
        color: colors.warning,
        alert: true,
      });
    } else if (flow.free > 0) {
      items.push({
        key: 'free',
        label: t('budget_free'),
        amount: totals.remainder,
        color: colors.mutedText,
        // The free zone is the one part of the bar nothing is painted over, so
        // its key is an outline rather than a filled dot: a solid dot would put
        // a colour in the legend that does not appear on the bar at all.
        hollow: true,
      });
    }
    return items;
  }, [flow, totals, colors, t]);

  // How full the plan is, in the same words every envelope row below uses. Only
  // where there is an actual to state it about and a plan to state it against.
  const fillPercent = flow?.hasActual ? Currency.formatFillPercent(totals.actual, totals.allocated) : null;
  const overPlan = fillPercent != null && Currency.compare(totals.actual, totals.allocated) > 0;

  const hasIncomeBasis = totals?.hasIncomeBasis !== false;
  const negativeRemainder = totals != null && Currency.isNegative(totals.remainder);

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={testID}
    >
      <View style={styles.heroRow}>
        <View style={styles.heroFigure}>
          <Text style={[styles.heroLabel, { color: colors.mutedText }]} numberOfLines={1}>
            {hasIncomeBasis ? t('remainder') : t('add_income_for_remainder')}
          </Text>
          {hasIncomeBasis && (
            <Text
              style={[styles.heroValue, {
                color: negativeRemainder ? colors.overspend : colors.text,
              }]}
              numberOfLines={1}
              testID="budget-remainder"
            >
              {/* The code hangs off the figure only when the header has no
                  currency control to carry it — with one up there, printing it
                  here says "AMD" twice on one screen. */}
              {totals
                ? `${Currency.formatAmountTrimmed(totals.remainder, totals.currency)}${showCurrencyCode ? ` ${totals.currency}` : ''}`
                : PENDING_PLACEHOLDER}
            </Text>
          )}
        </View>

        {fillPercent && (
          <View
            style={[styles.pill, {
              backgroundColor: overPlan ? `${colors.overspend}1F` : colors.glassSurfaceStrong,
            }]}
            testID="budget-summary-percent"
          >
            <Text style={[styles.pillValue, { color: overPlan ? colors.overspend : colors.text }]}>
              {fillPercent}
            </Text>
            <Text style={[styles.pillLabel, { color: colors.mutedText }]} numberOfLines={1}>
              {t('budget_of_plan')}
            </Text>
          </View>
        )}
      </View>

      {/* The track is the free zone: only the filled segments are drawn, so the
          gaps between them and the tail after them are one continuous piece of
          bare track rather than a fifth view that has to be kept in step. */}
      <View style={styles.barWrapper}>
        <View style={[styles.track, { backgroundColor: colors.border }]} testID="budget-flow-bar">
          {segments.map(segment => (
            <View
              key={segment.key}
              testID={`budget-flow-${segment.key}`}
              style={[
                styles.segment,
                segment.style,
                { backgroundColor: segment.color, width: pct(segment.value / flow.total) },
              ]}
            />
          ))}
        </View>
        {paceFraction != null && (
          <View
            style={[styles.pace, { backgroundColor: colors.mutedText, left: pct(paceFraction) }]}
            accessible
            accessibilityLabel={t('budget_pace_today')}
            testID="budget-flow-pace"
          />
        )}
      </View>

      {legend.length > 0 && (
        <View style={styles.legend} testID="budget-summary-legend">
          {legend.map(item => (
            <View key={item.key} style={styles.legendItem} testID={`budget-legend-${item.key}`}>
              <View style={styles.legendHead}>
                <View
                  testID={`budget-legend-dot-${item.key}`}
                  style={[
                    styles.dot,
                    item.dim && styles.dotDim,
                    item.hollow
                      ? { borderColor: item.color }
                      : { backgroundColor: item.color },
                    item.hollow && styles.dotHollow,
                  ]}
                />
                <Text style={[styles.legendLabel, { color: colors.mutedText }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
              <Text
                style={[styles.legendAmount, { color: item.alert ? colors.overspend : colors.text }]}
                numberOfLines={1}
              >
                {Currency.formatCompact(item.amount)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

MonthSummaryCard.propTypes = {
  /**
   * What MonthlyPlanSection reports up: remainder, allocated, actual (null until
   * the plan status lands), expectedIncome, currency and hasIncomeBasis. Null
   * until the first report.
   */
  totals: PropTypes.shape({
    remainder: PropTypes.string,
    allocated: PropTypes.string,
    actual: PropTypes.string,
    expectedIncome: PropTypes.string,
    currency: PropTypes.string,
    hasIncomeBasis: PropTypes.bool,
  }),
  month: PropTypes.string.isRequired,
  showCurrencyCode: PropTypes.bool,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  testID: PropTypes.string,
};

export default MonthSummaryCard;

const styles = StyleSheet.create({
  barWrapper: {
    justifyContent: 'center',
    marginTop: SPACING.md,
    paddingVertical: PACE_OVERHANG,
  },
  card: {
    ...CARD_SURFACE,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  // The committed zone is the same colour as the spent one at a lower strength:
  // it is the same money one step earlier, not a different kind of money.
  committed: {
    opacity: 0.38,
  },
  dot: {
    borderRadius: BORDER_RADIUS.pill,
    height: DOT_SIZE,
    width: DOT_SIZE,
  },
  // The dot for the committed zone, which is the same colour as the spent one
  // and has to stay distinguishable from it. Not the segment's own 0.38: an 8dp
  // dot at that strength reads as disabled rather than as paler.
  dotDim: {
    opacity: 0.5,
  },
  dotHollow: {
    borderWidth: 1.5,
  },
  heroFigure: {
    flexShrink: 1,
  },
  heroLabel: SECTION_LABEL,
  heroRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroValue: {
    fontSize: FONT_SIZE.xxl,
    fontVariant: ['tabular-nums'],
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  legend: {
    flexDirection: 'row',
    marginTop: SPACING.sm,
  },
  legendAmount: {
    fontSize: FONT_SIZE.md,
    fontVariant: ['tabular-nums'],
    fontWeight: FONT_WEIGHT.semibold,
    marginTop: 2,
  },
  legendHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  legendItem: {
    flex: 1,
    paddingRight: SPACING.xs,
  },
  legendLabel: {
    flexShrink: 1,
    fontSize: FONT_SIZE.sm,
  },
  overCommitted: {
    opacity: 0.55,
  },
  pace: {
    borderRadius: 1,
    bottom: 0,
    // Half the mark's own width, so it straddles the position it names instead
    // of starting at it.
    marginLeft: -1,
    position: 'absolute',
    top: 0,
    width: 2,
  },
  pill: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    marginLeft: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  pillLabel: {
    fontSize: FONT_SIZE.xs,
  },
  pillValue: {
    fontSize: FONT_SIZE.base,
    fontVariant: ['tabular-nums'],
    fontWeight: FONT_WEIGHT.bold,
  },
  segment: {
    height: '100%',
    marginRight: SEGMENT_GAP,
    minWidth: MIN_SEGMENT_WIDTH,
  },
  track: {
    borderRadius: BORDER_RADIUS.pill,
    flexDirection: 'row',
    height: BAR_HEIGHT,
    // Clips the last segment's trailing gap, and the rounded ends of the fills.
    overflow: 'hidden',
    width: '100%',
  },
});
