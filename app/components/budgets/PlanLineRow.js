import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import * as Currency from '../../services/currency';
import StatusProgressBar from '../StatusProgressBar';
import { SPACING } from '../../styles/layout';

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
  listLength,
  name,
  icon,
  status = null,
  planCurrency,
  colors,
  t,
  executed = false,
  canExecute = false,
  canUndo = false,
  showProgress = true,
  showMove = true,
  onPress,
  onLongPress,
  onMove = null,
  onExecute = null,
  onMarkExecuted = null,
  onUndo = null,
}) {
  const lineCurrency = line.currency || planCurrency;
  const isBroken = line.isBroken || status?.broken;
  // Both gates are decided by the host (they depend on the month being shown):
  // execution only makes sense for the current month, and so does undoing it.
  const swipeEnabled = canExecute || canUndo;

  const content = (
    <Pressable
      style={[styles.lineRow, index % 2 === 1 && { backgroundColor: colors.altRow }]}
      onPress={() => onPress(line)}
      onLongPress={() => onLongPress(line)}
      accessibilityRole="button"
      accessibilityLabel={`${t('edit_allocation')}: ${name}`}
      testID={`plan-line-${line.id}`}
    >
      <View style={styles.lineTop}>
        <View>
          <Icon name={icon} size={20} color={executed ? colors.mutedText : colors.text} />
          {executed && (
            <View
              testID={`plan-line-check-${line.id}`}
              style={[styles.checkBadge, { borderColor: colors.surface, backgroundColor: colors.income }]}
            >
              <Icon name="check" size={7} color="white" />
            </View>
          )}
        </View>
        <View style={styles.lineBody}>
          <Text
            style={[styles.lineName, { color: executed ? colors.mutedText : colors.text }]}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text style={[styles.lineMeta, { color: colors.mutedText }]} numberOfLines={1}>
            {line.isRecurring ? t('recurring') : t('one_time')}
            {line.hasTemplate ? ` · ${executed ? t('done') : t('execute')}` : ''}
          </Text>
          {!!line.comment && (
            <Text style={[styles.lineComment, { color: colors.mutedText }]} numberOfLines={1}>
              {line.comment}
            </Text>
          )}
        </View>
        <Text style={[styles.lineAmount, { color: executed ? colors.mutedText : colors.text }]}>
          {Currency.formatAmount(line.amount, lineCurrency)} {line.currency ? lineCurrency : ''}
        </Text>
        {showMove && onMove && (
          <View style={styles.moveButtons}>
            <Pressable
              onPress={() => onMove(index, -1)}
              disabled={index === 0}
              hitSlop={6}
              style={styles.moveButton}
              accessibilityRole="button"
              accessibilityLabel={t('move_up')}
              testID={`plan-line-up-${line.id}`}
            >
              <Icon name="chevron-up" size={20} color={index === 0 ? colors.border : colors.mutedText} />
            </Pressable>
            <Pressable
              onPress={() => onMove(index, 1)}
              disabled={index === listLength - 1}
              hitSlop={6}
              style={styles.moveButton}
              accessibilityRole="button"
              accessibilityLabel={t('move_down')}
              testID={`plan-line-down-${line.id}`}
            >
              <Icon name="chevron-down" size={20} color={index === listLength - 1 ? colors.border : colors.mutedText} />
            </Pressable>
          </View>
        )}
      </View>
      {isBroken ? (
        <View style={styles.brokenRow} testID={`plan-line-broken-${line.id}`}>
          <Icon name="alert-circle-outline" size={14} color={colors.danger} />
          <Text style={[styles.brokenText, { color: colors.danger }]} numberOfLines={1}>
            {t('relink_target')}
          </Text>
        </View>
      ) : status?.status === 'unconvertible' ? (
        // calculatePlanStatus found no rate to express this line's own currency in
        // the plan's currency — showing its amount labeled as planCurrency (like
        // the progress bar below does) would silently mislabel the real value.
        <View style={styles.brokenRow} testID={`plan-line-unconvertible-${line.id}`}>
          <Icon name="alert-circle-outline" size={14} color={colors.mutedText} />
          <Text style={[styles.brokenText, { color: colors.mutedText }]} numberOfLines={1}>
            {t('graphs_currencies_not_converted')}: {Currency.formatAmount(status.amount, lineCurrency)} {lineCurrency}
          </Text>
        </View>
      ) : showProgress && status ? (
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

  const rightActions = executed
    ? () => (
      <Pressable
        testID={`plan-line-undo-${line.id}`}
        style={[styles.swipeAction, { backgroundColor: colors.mutedText }]}
        onPress={() => onUndo(line)}
        accessibilityRole="button"
        accessibilityLabel={t('undo')}
      >
        <Icon name="undo" size={20} color="white" />
        <Text style={styles.swipeActionText}>{t('undo')}</Text>
      </Pressable>
    )
    : () => (
      <View style={styles.swipeActionsRow}>
        <Pressable
          testID={`plan-line-execute-${line.id}`}
          style={[styles.swipeAction, { backgroundColor: colors.primary }]}
          onPress={() => onExecute(line)}
          accessibilityRole="button"
          accessibilityLabel={t('execute')}
        >
          <Icon name="play" size={20} color="white" />
          <Text style={styles.swipeActionText}>{t('execute')}</Text>
        </Pressable>
        <Pressable
          testID={`plan-line-done-${line.id}`}
          style={[styles.swipeAction, { backgroundColor: colors.income }]}
          onPress={() => onMarkExecuted(line)}
          accessibilityRole="button"
          accessibilityLabel={t('mark_as_executed')}
        >
          <Icon name="check-bold" size={20} color="white" />
          <Text style={styles.swipeActionText}>{t('done')}</Text>
        </Pressable>
      </View>
    );

  return (
    <View style={executed ? styles.executedWrapper : undefined}>
      <Swipeable
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
    </View>
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
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  executed: PropTypes.bool,
  canExecute: PropTypes.bool,
  canUndo: PropTypes.bool,
  showProgress: PropTypes.bool,
  showMove: PropTypes.bool,
  onPress: PropTypes.func.isRequired,
  onLongPress: PropTypes.func.isRequired,
  onMove: PropTypes.func,
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
  executedWrapper: {
    opacity: 0.5,
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
  lineMeta: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
    textTransform: 'uppercase',
  },
  lineName: {
    fontSize: 15,
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
  moveButton: {
    paddingHorizontal: 2,
  },
  moveButtons: {
    flexDirection: 'row',
    marginLeft: 6,
  },
  swipeAction: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    marginBottom: SPACING.xs,
    marginLeft: SPACING.xs,
    paddingHorizontal: SPACING.md,
    width: 72,
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
