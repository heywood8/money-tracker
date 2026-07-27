import React, { memo, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import * as Currency from '../../services/currency';
import StatusProgressBar from '../StatusProgressBar';
import { SPACING } from '../../styles/layout';

// Stands in for a foreign-currency amount while its exchange rate resolves — an
// em dash rather than the stored figure, which would read as a number in the
// screen's currency for the frame or two before the real one replaces it.
const CONVERTING_PLACEHOLDER = '—';

/**
 * One row of the unified Budgets list (Budgets v3 phase 3).
 *
 * A row is a monthly target that MAY carry an executable template — the single
 * concept that absorbed the old per-category budget, the plan allocation and the
 * planned operation. It renders:
 *   - the target amount (in the line's own currency when it has one),
 *   - plan-vs-actual progress for expense/transfer lines (income lines are
 *     compared as a whole against the month's real income, so they get no bar),
 *   - swipe actions for a line with a template: execute / mark done, or undo once
 *     it is done this month.
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
  listLength,
  onMove = null,
  onPress,
  onLongPress,
  onExecute = null,
  onMarkExecuted = null,
  onUndo = null,
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
  let amountText;
  if (isUnconvertible) {
    amountText = `${Currency.formatAmount(line.amount, lineCurrency)} ${lineCurrency}`;
  } else if (displayAmount != null) {
    amountText = Currency.formatAmount(displayAmount, planCurrency);
  } else {
    amountText = CONVERTING_PLACEHOLDER;
  }
  // Both gates are decided by the host (they depend on the month being shown):
  // execution only makes sense for the current month, and so does undoing it.
  const swipeEnabled = canExecute || canUndo;

  // A done row collapses to a single line: its bar would read 100% by
  // construction of "executed", which is what the check badge already says. The
  // exception is real overspend — actual above target is news, and burying it
  // under a state the user set by hand is how a row stops being worth reading.
  const showBar = showProgress && !!status && (!executed || status.isExceeded);

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

  // The scope and template state moved from a text line into a glyph and an icon
  // badge, which a screen reader cannot announce — so they are spelled out here
  // instead. Sighted density and non-visual completeness are not the same
  // problem and don't get the same answer.
  const stateWords = [
    line.isRecurring ? t('recurring') : t('one_time'),
    line.hasTemplate ? (executed ? t('done') : t('pending_execution')) : null,
  ].filter(Boolean).join(', ');

  const content = (
    <Pressable
      style={[styles.lineRow, index % 2 === 1 && { backgroundColor: colors.altRow }]}
      onPress={() => onPress(line)}
      // The row renders nothing from `listLength`/`onMove` — it forwards them so
      // the host can build the move actions. Keeping them as props (rather than
      // having the host close over them in an inline callback) is what lets
      // `onLongPress` stay a stable reference, and therefore what keeps this
      // component's memo() from being defeated on every parent render.
      onLongPress={() => onLongPress(line, index, listLength, onMove)}
      accessibilityRole="button"
      accessibilityLabel={`${t('edit_allocation')}: ${name}, ${amountText}, ${stateWords}`}
      testID={`plan-line-${line.id}`}
    >
      <View style={styles.lineTop}>
        <View>
          <Icon name={icon} size={20} color={executed ? colors.mutedText : colors.text} />
          {/* Template state rides on the category icon instead of a text line:
              done is a check, still-to-run is a dot in the accent colour. Both
              occupy the same 13dp corner, so the row height doesn't move
              between states. */}
          {executed ? (
            <View
              testID={`plan-line-check-${line.id}`}
              style={[styles.checkBadge, { borderColor: colors.surface, backgroundColor: colors.income }]}
            >
              <Icon name="check" size={7} color="white" />
            </View>
          ) : line.hasTemplate ? (
            <View
              testID={`plan-line-pending-${line.id}`}
              style={[styles.checkBadge, { borderColor: colors.surface, backgroundColor: colors.primary }]}
            >
              <Icon name="play" size={7} color="white" />
            </View>
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
            {/* Replaces a full uppercase "RECURRING" line that sat on nearly
                every row, saying the same thing each time while being the
                loudest thing after the amount. A one-off line gets no marker:
                the glyph is the exception, not the label. */}
            {line.isRecurring && (
              <Icon
                name="repeat"
                size={13}
                color={colors.mutedText}
                testID={`plan-line-recurring-${line.id}`}
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
        <Text style={[styles.lineAmount, { color: executed ? colors.mutedText : colors.text }]}>
          {amountText}
        </Text>
      </View>
      {isBroken ? (
        <View style={styles.brokenRow} testID={`plan-line-broken-${line.id}`}>
          <Icon name="alert-circle-outline" size={14} color={colors.danger} />
          <Text style={[styles.brokenText, { color: colors.danger }]} numberOfLines={1}>
            {t('relink_target')}
          </Text>
        </View>
      ) : isUnconvertible ? (
        // No rate to express this line's own currency in the screen's — so the
        // amount column above kept the stored figure and its own code, and this
        // row explains why it is the one number on screen in a foreign unit.
        // There is deliberately no progress bar: comparing it against actuals in
        // another currency is exactly the mismatch this branch exists to avoid.
        <View style={styles.brokenRow} testID={`plan-line-unconvertible-${line.id}`}>
          <Icon name="alert-circle-outline" size={14} color={colors.mutedText} />
          <Text style={[styles.brokenText, { color: colors.mutedText }]} numberOfLines={1}>
            {t('graphs_currencies_not_converted')}
          </Text>
        </View>
      ) : showBar ? (
        <StatusProgressBar
          status={{ ...status, spent: status.actual, currency: planCurrency }}
          compact
          showDetails
          style={styles.lineProgress}
        />
      ) : null}
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
      testID: `plan-line-undo-${line.id}`,
      background: colors.mutedText,
      icon: 'undo',
      caption: t('undo'),
      label: t('undo'),
      handler: onUndo,
    })
    : () => (
      <View style={styles.swipeActionsRow}>
        {swipeButton({
          testID: `plan-line-execute-${line.id}`,
          background: colors.primary,
          icon: 'play',
          caption: t('execute'),
          label: t('execute'),
          handler: onExecute,
        })}
        {swipeButton({
          testID: `plan-line-done-${line.id}`,
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
  onMove: PropTypes.func,
  onPress: PropTypes.func.isRequired,
  onLongPress: PropTypes.func.isRequired,
  onExecute: PropTypes.func,
  onMarkExecuted: PropTypes.func,
  onUndo: PropTypes.func,
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
    fontSize: 12,
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
    fontWeight: '600',
    marginLeft: 8,
  },
  lineBody: {
    flex: 1,
    marginLeft: 10,
  },
  lineComment: {
    fontSize: 12,
    marginTop: 1,
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
  lineProgress: {
    marginBottom: 0,
    marginTop: 6,
  },
  lineRow: {
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: SPACING.sm,
  },
  lineTop: {
    alignItems: 'center',
    flexDirection: 'row',
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
    fontSize: 12,
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
