import React, { memo, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import * as Currency from '../../services/currency';
import PlanProgressBar, { PAIR_COLUMN_WIDTH } from './PlanProgressBar';
import { useOverlayHost } from '../../contexts/OverlayHostContext';
import { measureAnchorRect } from '../../utils/overlayGeometry';
import { BORDER_RADIUS, FONT_SIZE, SPACING } from '../../styles/designTokens';
import { ENVELOPE_RAIL_CHILD_ALPHA } from '../../styles/envelopePalette';
import { SPRING_BADGE_POP } from '../../utils/motion';

// Where the badge springs from when its state flips. Not 0: a glyph growing out
// of nothing reads as an element arriving, and this one was already there — it
// changed what it says.
const BADGE_POP_FROM = 0.4;

// Stands in for a foreign-currency amount while its exchange rate resolves — an
// em dash rather than the stored figure, which would read as a number in the
// screen's currency for the frame or two before the real one replaces it.
const CONVERTING_PLACEHOLDER = '—';

// Tint of the bar's unfilled track, as a hex alpha channel on the muted text
// colour.
const TRACK_ALPHA = '26'; // ~15%
// Tint of the filled part. Deliberately NOT a signal colour: how much of the
// target is gone is said by the length, and the only saturated colour left on
// this screen is the overspend segment past the target mark.
const FILL_ALPHA = '99'; // ~60%

/**
 * One row of the unified Budgets list (Budgets v3 phase 3).
 *
 * A row is a monthly target that MAY carry an executable template — the single
 * concept that absorbed the old per-category budget, the plan allocation and the
 * planned operation. It renders:
 *   - what is LEFT of the target (the figure a person acts on), with the
 *     actual/target pair under it as the supporting detail,
 *   - plan-vs-actual progress as a bar for expense/transfer lines (income lines
 *     are compared as a whole against the month's real income, so they get no
 *     bar),
 *   - swipe actions for a line with a template: execute / mark done, or undo
 *     once it is done this month.
 *
 * Memoized because a row is nontrivial to build — a Swipeable brings a gesture
 * handler and animated values with it — so rows whose props are unchanged (the
 * common case when an unrelated bit of the section's state flips) skip the
 * rebuild entirely.
 */
const PlanLineRow = memo(function PlanLineRow({
  line,
  index,
  name,
  icon,
  status = null,
  planCurrency,
  displayAmount = null,
  converting = false,
  colors,
  t,
  executed = false,
  canExecute = false,
  canUndo = false,
  showProgress = true,
  indented = false,
  envelopeColor = null,
  listLength,
  onMove = null,
  onPress,
  onLongPress,
  onExecute = null,
  onMarkExecuted = null,
  onUndo = null,
  testIDPrefix = 'plan-line',
}) {
  const lineCurrency = line.currency || planCurrency;
  const isBroken = line.isBroken || status?.broken;
  // The screen shows exactly one currency, so a row prints a bare number in it —
  // no per-row code to read, and never the stored figure of a line that keeps its
  // own currency (a 300000 AMD target rendered next to a RUB progress bar was two
  // different units stacked with nothing saying so).
  //
  // `displayAmount` is the converted figure supplied by the host; it is absent
  // only while rates are still resolving or when no rate exists at all. Those two
  // are NOT the same: converting shows a placeholder, unconvertible falls back to
  // the stored amount WITH its own code, because a labelled foreign number is
  // honest and an unlabelled one is not.
  const isUnconvertible = status?.status === 'unconvertible'
    || (displayAmount == null && lineCurrency !== planCurrency && !converting);
  // Both gates are decided by the host (they depend on the month being shown):
  // execution only makes sense for the current month, and so does undoing it.
  const swipeEnabled = canExecute || canUndo;

  // A done row collapses to a single line: no bar and no pair. Both would read
  // 100% by construction of "executed", which is what the check badge already
  // says. The exception is real overspend — actual above target is news, and
  // burying it under a state the user set by hand is how a row stops being worth
  // reading.
  const tracked = showProgress && !!status && !isBroken && !isUnconvertible;
  const showMeter = tracked && (!executed || status.isExceeded);
  const ratio = tracked ? status.percentage / 100 : 0;

  // The row leads with HOW FULL the budget is, as a percentage.
  //
  // It used to lead with what was left, and before that with `actual / target`
  // alone. The pair alone made the reader do arithmetic on every row; the
  // remaining amount answered that arithmetic but only in isolation — 2K left
  // is most of a 2.5K budget and a rounding error on a 200K one, so a column of
  // remainders could not be scanned down, which is the one thing a column is
  // for. A percentage is already normalized, so the rows compare to each other
  // and to the bar beside them. The exact figures stay one step down in the
  // hierarchy as the pair, and in full in the editor one tap away.
  //
  // Unbounded above on purpose: past the target it keeps counting (125%, 348%)
  // rather than saturating, exactly like the bar's overspend segment.
  //
  // Both the percentage and the remaining that colours the row are derived from
  // the very figures the pair prints, rather than read off `status.percentage` /
  // `status.remaining`, so every number on the row agrees with every other. The
  // status is computed from the plan's own stored amount while `displayAmount`
  // is the host's converted one; they normally match, but when they do not (a
  // rounding step apart on a converted line, a status a beat behind a just-saved
  // edit) a headline that does not follow from the pair under it is arithmetic
  // the reader can watch fail.
  //
  // A row with no actual to compare against — no status yet, or an unconvertible
  // line — has no fill to state, so it falls back to printing its target. An
  // unconvertible one keeps its stored figure in full and says what unit that
  // is, because with no rate a labelled foreign number is honest and an
  // unlabelled one is not.
  const showPair = showMeter && status.actual != null && displayAmount != null;
  let primaryText;
  let pairText = null;
  let remaining = null;
  if (isUnconvertible) {
    primaryText = `${Currency.formatAmount(line.amount, lineCurrency)} ${lineCurrency}`;
  } else if (displayAmount == null) {
    primaryText = CONVERTING_PLACEHOLDER;
  } else if (showPair) {
    remaining = Currency.subtract(displayAmount, status.actual, planCurrency);
    // A zero target has no percentage (nothing to be a fraction of), so such a
    // row says what is left instead of printing a meaningless 0%.
    primaryText = Currency.formatFillPercent(status.actual, displayAmount)
      ?? Currency.formatCompact(remaining);
    pairText = `${Currency.formatCompact(status.actual)} / ${Currency.formatCompact(displayAmount)}`;
  } else {
    primaryText = Currency.formatCompact(displayAmount);
  }

  // Over target is the one thing on this row that gets a colour. Everything else
  // — barely started, half gone, nearly spent — is said by the bar's length,
  // because colouring those too is how the previous design ended up with ten
  // tinted rows and no hierarchy.
  const overspent = remaining != null && Currency.isNegative(remaining);
  let primaryColor = colors.text;
  if (overspent) primaryColor = colors.overspend;
  else if (executed) primaryColor = colors.mutedText;

  // Acting on a row leaves the Swipeable open otherwise: the actions are replaced
  // (execute -> undo) but the row stays dragged aside, so its name and progress
  // figures remain clipped until the user swipes back by hand.
  // Not memoized on purpose: RNGH's Swipeable is a plain Component, so it
  // re-renders with its parent regardless, and `renderRightActions` is rebuilt
  // every render anyway — a useCallback here would cost a deps compare and save
  // no allocation.
  const swipeableRef = useRef(null);
  const runAndClose = (handler) => () => {
    swipeableRef.current?.close();
    handler?.(line);
  };

  // Executing a line is a swipe, a row that slides back, and then a 13dp glyph
  // that silently becomes a different glyph — the only evidence on the row that
  // anything happened at all (the figures move too, but by an amount the user
  // cannot predict, so they do not read as a confirmation). The pop is that
  // confirmation.
  //
  // Skipped on the first render: rows arrive already done or already pending
  // when the month loads, and a card full of popping badges on every mount would
  // announce nothing.
  const badgeScale = useSharedValue(1);
  const badgeSettled = useRef(false);
  useEffect(() => {
    if (!badgeSettled.current) {
      badgeSettled.current = true;
      return;
    }
    badgeScale.value = BADGE_POP_FROM;
    badgeScale.value = withSpring(1, SPRING_BADGE_POP);
  }, [executed, badgeScale]);
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: badgeScale.value }] }));

  // The scope and template state moved from a text line into a glyph and an icon
  // badge, and the amount pair moved below the figure it supports — none of
  // which a screen reader conveys by position. They are spelled out here
  // instead. Sighted density and non-visual completeness are not the same
  // problem and don't get the same answer.
  const stateWords = [
    pairText,
    line.isRecurring ? t('recurring') : t('one_time'),
    line.hasTemplate ? (executed ? t('done') : t('pending_execution')) : null,
  ].filter(Boolean).join(', ');

  // Measured on long-press so the host can lift a copy of this exact row above the
  // blurred backdrop and float its action bar over it (see RowActionMenu). Measured
  // against the overlay host — the shared ancestor of this row and of the layer the
  // copy is drawn in — so the two coordinate spaces cannot disagree.
  const rowRef = useRef(null);
  const { hostRef } = useOverlayHost();
  const handleLongPress = () => {
    measureAnchorRect(rowRef.current, hostRef?.current, (layout) => {
      onLongPress(line, index, listLength, onMove, layout);
    });
  };

  const content = (
    <Pressable
      ref={rowRef}
      style={styles.lineRow}
      onPress={() => onPress(line)}
      // The row renders nothing from `listLength`/`onMove` — it forwards them so
      // the host can build the move actions. Keeping them as props (rather than
      // having the host close over them in an inline callback) is what lets
      // `onLongPress` stay a stable reference, and therefore what keeps this
      // component's memo() from being defeated on every parent render.
      onLongPress={handleLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('edit_allocation')}: ${name}, ${primaryText}, ${stateWords}`}
      testID={`${testIDPrefix}-${line.id}`}
    >
      {/* The envelope's rail, continued down past its header through every one
          of its children — one bracket down the side of the group rather than a
          colour restated per row. This is also the only thing that says a row is
          inside an envelope: the indent alone was a 24dp difference that read as
          a typo next to a full-width sibling. Loose rows get no rail, so
          "belongs to something" and "belongs to nothing" look different rather
          than merely offset. */}
      {indented && envelopeColor && (
        <View
          style={[styles.rail, { backgroundColor: `${envelopeColor}${ENVELOPE_RAIL_CHILD_ALPHA}` }]}
          testID={`${testIDPrefix}-rail-${line.id}`}
        />
      )}
      <View style={[styles.lineInner, indented && styles.lineInnerIndented]}>
        <View style={styles.lineTop}>
          <View>
            <Icon name={icon} size={20} color={executed ? colors.mutedText : colors.text} />
            {/* Template state rides on the category icon instead of a text line:
                done is a check, still-to-run is a dot in the accent colour. Both
                occupy the same 13dp corner, so the row height doesn't move
                between states. */}
            {executed ? (
              <Animated.View
                testID={`${testIDPrefix}-check-${line.id}`}
                style={[styles.checkBadge, { borderColor: colors.surface, backgroundColor: colors.income }, badgeStyle]}
              >
                <Icon name="check" size={7} color="white" />
              </Animated.View>
            ) : line.hasTemplate ? (
              <Animated.View
                testID={`${testIDPrefix}-pending-${line.id}`}
                style={[styles.checkBadge, { borderColor: colors.surface, backgroundColor: colors.primary }, badgeStyle]}
              >
                <Icon name="play" size={7} color="white" />
              </Animated.View>
            ) : null}
          </View>
          <View style={styles.lineBody}>
            <View style={styles.lineNameRow}>
              <Text
                style={[styles.lineName, { color: colors.text }]}
                numberOfLines={1}
              >
                {name}
              </Text>
              {/* Marks the EXCEPTION, not the rule. A plan line repeats every
                  month by default — that is what a monthly plan is — so a
                  repeat glyph on nearly every row was a column of identical
                  marks carrying no information. What a reader actually needs to
                  spot is the row that lives for this month only, and that is
                  what gets the glyph. */}
              {!line.isRecurring && (
                <Icon
                  name="numeric-1-circle-outline"
                  size={13}
                  color={colors.mutedText}
                  testID={`${testIDPrefix}-one-time-${line.id}`}
                />
              )}
            </View>
            {/* User-authored, so it never repeats what the row already says —
                unlike the scope/state line it now sits alone under. Hidden on a
                done row, which collapses to a single line. */}
            {!!line.comment && !executed && (
              <Text style={[styles.lineComment, { color: colors.mutedText }]} numberOfLines={1}>
                {line.comment}
              </Text>
            )}
          </View>
          <Text
            style={[styles.lineAmount, { color: primaryColor }]}
            testID={`${testIDPrefix}-primary-${line.id}`}
          >
            {primaryText}
          </Text>
        </View>

        {/* Bar and pair share a line, in that order, because they are the same
            statement twice — the shape of the spend and its two figures. The
            pair's column is a fixed width so that every bar on the screen ends
            at the same x: bars of varying length cannot be compared against each
            other, which is the only thing a reader does with a column of them. */}
        {showMeter && (
          <View style={styles.meterRow}>
            <View style={styles.meterBar}>
              <PlanProgressBar
                ratio={ratio}
                trackColor={`${colors.mutedText}${TRACK_ALPHA}`}
                fillColor={`${colors.mutedText}${FILL_ALPHA}`}
                overspendColor={colors.overspend}
                testID={`${testIDPrefix}-bar-${line.id}`}
              />
            </View>
            {pairText && (
              <Text
                style={[styles.linePair, { color: colors.mutedText }]}
                numberOfLines={1}
                testID={`${testIDPrefix}-pair-${line.id}`}
              >
                {pairText}
              </Text>
            )}
          </View>
        )}

        {isBroken ? (
          <View style={styles.brokenRow} testID={`${testIDPrefix}-broken-${line.id}`}>
            <Icon name="alert-circle-outline" size={14} color={colors.danger} />
            <Text style={[styles.brokenText, { color: colors.danger }]} numberOfLines={1}>
              {t('relink_target')}
            </Text>
          </View>
        ) : isUnconvertible ? (
          // No rate to express this line's own currency in the screen's — so the
          // amount column above kept the stored figure and its own code, and this
          // row explains why it is the one number on screen in a foreign unit.
          // There is deliberately no bar: comparing it against actuals in another
          // currency is exactly the mismatch this branch exists to avoid.
          <View style={styles.brokenRow} testID={`${testIDPrefix}-unconvertible-${line.id}`}>
            <Icon name="alert-circle-outline" size={14} color={colors.mutedText} />
            <Text style={[styles.brokenText, { color: colors.mutedText }]} numberOfLines={1}>
              {t('graphs_currencies_not_converted')}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );

  if (!swipeEnabled) {
    return content;
  }

  const swipeButton = ({ testID, background, icon, caption, label, handler }) => (
    <Pressable
      testID={testID}
      style={[styles.swipeAction, { backgroundColor: background }]}
      onPress={runAndClose(handler)}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={20} color="white" />
      <Text style={styles.swipeActionText} numberOfLines={1}>{caption}</Text>
    </Pressable>
  );

  const rightActions = executed
    ? () => swipeButton({
      testID: `${testIDPrefix}-undo-${line.id}`,
      background: colors.mutedText,
      icon: 'undo',
      caption: t('undo'),
      label: t('undo'),
      handler: onUndo,
    })
    : () => (
      <View style={styles.swipeActionsRow}>
        {swipeButton({
          testID: `${testIDPrefix}-execute-${line.id}`,
          background: colors.primary,
          icon: 'play',
          caption: t('execute'),
          label: t('execute'),
          handler: onExecute,
        })}
        {swipeButton({
          testID: `${testIDPrefix}-done-${line.id}`,
          background: colors.income,
          icon: 'check-bold',
          caption: t('done'),
          label: t('mark_as_executed'),
          handler: onMarkExecuted,
        })}
      </View>
    );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={rightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={60}
      // Only leftward drags reveal actions; leave rightward unrecognized so a
      // rightward swipe passes through to the tab-strip swipe navigation.
      dragOffsetFromLeftEdge={Number.MAX_SAFE_INTEGER}
    >
      <View style={[styles.swipeRowCover, { backgroundColor: colors.surface }]}>
        {content}
      </View>
    </Swipeable>
  );
});

PlanLineRow.propTypes = {
  line: PropTypes.shape({
    id: PropTypes.string.isRequired,
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    comment: PropTypes.string,
    currency: PropTypes.string,
    isRecurring: PropTypes.bool,
    isBroken: PropTypes.bool,
    hasTemplate: PropTypes.bool,
  }).isRequired,
  index: PropTypes.number.isRequired,
  listLength: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  status: PropTypes.object,
  planCurrency: PropTypes.string.isRequired,
  displayAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  converting: PropTypes.bool,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  executed: PropTypes.bool,
  canExecute: PropTypes.bool,
  canUndo: PropTypes.bool,
  showProgress: PropTypes.bool,
  indented: PropTypes.bool,
  envelopeColor: PropTypes.string,
  onMove: PropTypes.func,
  onPress: PropTypes.func.isRequired,
  onLongPress: PropTypes.func.isRequired,
  onExecute: PropTypes.func,
  onMarkExecuted: PropTypes.func,
  onUndo: PropTypes.func,
  // Namespaces every testID the row renders. The host overrides it for the static
  // copy it lifts into the action menu, so the copy and the row it covers don't
  // answer to the same testID.
  testIDPrefix: PropTypes.string,
};

export default PlanLineRow;

const styles = StyleSheet.create({
  brokenRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  brokenText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
  },
  checkBadge: {
    alignItems: 'center',
    borderRadius: 7,
    borderWidth: 1.5,
    bottom: -4,
    height: 13,
    justifyContent: 'center',
    position: 'absolute',
    right: -6,
    width: 13,
  },
  lineAmount: {
    fontSize: 15,
    // Lining, fixed-width digits: this column is read down, and proportional
    // figures make a stack of amounts ragged even when every one of them is
    // right-aligned.
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    marginLeft: 8,
  },
  lineBody: {
    flex: 1,
    marginLeft: 10,
  },
  lineComment: {
    fontSize: FONT_SIZE.sm,
    marginTop: 1,
  },
  lineInner: {
    paddingHorizontal: SPACING.sm,
  },
  lineInnerIndented: {
    // Clears the rail and then some — deep enough to read as a level of nesting
    // at a glance, shallow enough that the child's own icon still lines up under
    // the envelope's text rather than drifting into the middle of the row.
    paddingLeft: SPACING.md + SPACING.sm,
  },
  lineName: {
    flexShrink: 1,
    fontSize: 15,
  },
  lineNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  linePair: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    marginLeft: SPACING.sm,
    textAlign: 'right',
    width: PAIR_COLUMN_WIDTH,
  },
  lineRow: {
    borderRadius: BORDER_RADIUS.md,
    // Clips the rail to the row's rounded corners.
    overflow: 'hidden',
    paddingVertical: 7,
  },
  lineTop: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  meterBar: {
    flex: 1,
  },
  meterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 6,
  },
  rail: {
    borderRadius: BORDER_RADIUS.pill,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 2,
  },
  swipeAction: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    marginBottom: SPACING.xs,
    marginLeft: SPACING.xs,
    // 72 wide minus 2×12 padding left 48dp of text box — enough for "Execute"
    // but not for its translations ("Выполнить" wrapped mid-word). 92 minus
    // 2×4 gives 84dp, which clears the longest caption in every shipped locale.
    paddingHorizontal: SPACING.xs,
    width: 92,
  },
  swipeActionText: {
    color: 'white',
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    marginTop: 2,
  },
  swipeActionsRow: {
    flexDirection: 'row',
  },
  swipeRowCover: {
    borderRadius: 10,
  },
});
