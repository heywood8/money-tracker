import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import * as Currency from '../../services/currency';
import EnvelopeFill from './EnvelopeFill';
import { SPACING } from '../../styles/layout';

// Stands in for a figure whose exchange rate is still resolving — same em dash
// PlanLineRow uses, for the same reason.
const CONVERTING_PLACEHOLDER = '—';

/**
 * The header row of a GROUP of allocations (migration 0022).
 *
 * A group is an envelope over several lines that need not have anything in
 * common structurally — categories from unrelated trees, transfer targets, a
 * recurring line beside a one-off one. Its budget is the sum of its children by
 * default, or a figure the user set explicitly; its actual is always the sum of
 * theirs.
 *
 * The row deliberately looks like a heavier PlanLineRow rather than like a
 * section title: it carries the same amount pair, the same progress wash and the
 * same tone rules, because it IS a budget — the thing the person actually tracks
 * when they say "we spend 50k on the car". Its children sit indented beneath it
 * and read as its parts.
 */
const PlanGroupRow = memo(function PlanGroupRow({
  group,
  index,
  status = null,
  displayAmount = null,
  converting = false,
  childCount,
  colors,
  t,
  pace = null,
  listLength,
  onMove = null,
  onPress,
  onLongPress,
}) {
  const isUnconvertible = status?.status === 'unconvertible';
  // A group is "tracked" once its actual is known — which only the async plan
  // status can supply (per-line actuals are not computed on the client). Until
  // then the row prints its target alone, exactly like a line does.
  const tracked = !!status && !isUnconvertible && status.actual != null;
  const spentFraction = tracked ? status.percentage / 100 : 0;

  let tone = null;
  if (tracked && status.isExceeded) {
    tone = colors.overspend;
  } else if (tracked && pace != null && spentFraction > pace) {
    tone = colors.warning;
  }

  const target = status?.amount ?? displayAmount;
  let amountText;
  if (target == null) {
    amountText = CONVERTING_PLACEHOLDER;
  } else if (tracked) {
    amountText = `${Currency.formatCompact(status.actual)} / ${Currency.formatCompact(target)}`;
  } else {
    amountText = Currency.formatCompact(target);
  }

  // What the children add up to, shown ONLY when the group's own budget says
  // something different — that disagreement is the entire content of an
  // override, and hiding it would leave the user to do the subtraction. A
  // derived group's children sum IS its budget, so repeating it would be noise.
  const childSum = status?.overrideApplied
    && status.childAmount != null
    && Currency.compare(status.childAmount, status.amount) !== 0
    ? Currency.formatCompact(status.childAmount)
    : null;

  return (
    <Pressable
      style={[styles.groupRow, { borderColor: colors.border }]}
      onPress={() => onPress(group)}
      onLongPress={() => onLongPress(group, index, listLength, onMove)}
      accessibilityRole="button"
      accessibilityLabel={`${t('edit_group')}: ${group.label}, ${amountText}, ${childCount} ${t('allocations')}`}
      testID={`plan-group-${group.id}`}
    >
      {tracked && (
        <EnvelopeFill
          fraction={spentFraction}
          tone={tone}
          mutedColor={colors.mutedText}
          testID={`plan-group-fill-${group.id}`}
        />
      )}
      <View style={styles.groupTop}>
        <Icon name="folder-outline" size={20} color={colors.text} />
        <View style={styles.groupBody}>
          <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>
            {group.label}
          </Text>
          <View style={styles.groupMetaRow}>
            {/* A glyph and a number rather than "3 allocations": the phrase
                needs plural agreement in most of the eleven shipped locales,
                and the row has no space for the longest of them. The screen
                reader gets the words (see accessibilityLabel above). */}
            <Icon name="format-list-bulleted" size={11} color={colors.mutedText} />
            <Text style={[styles.groupMeta, { color: colors.mutedText }]} numberOfLines={1}>
              {childCount}
            </Text>
            {childSum && (
              <Text
                style={[styles.groupMeta, { color: colors.mutedText }]}
                numberOfLines={1}
                testID={`plan-group-childsum-${group.id}`}
              >
                · Σ {childSum}
              </Text>
            )}
          </View>
        </View>
        <Text style={[styles.groupAmount, { color: colors.text }]}>
          {converting && target == null ? CONVERTING_PLACEHOLDER : amountText}
        </Text>
      </View>
      {isUnconvertible && (
        // The group's own budget is in a currency with no rate to the screen's,
        // so the figure above fell back to its children's sum — say why rather
        // than quietly printing a different number than the user typed.
        <View style={styles.noteRow} testID={`plan-group-unconvertible-${group.id}`}>
          <Icon name="alert-circle-outline" size={14} color={colors.mutedText} />
          <Text style={[styles.noteText, { color: colors.mutedText }]} numberOfLines={1}>
            {t('graphs_currencies_not_converted')}
          </Text>
        </View>
      )}
    </Pressable>
  );
});

PlanGroupRow.propTypes = {
  group: PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    amount: PropTypes.string,
    currency: PropTypes.string,
    isDerived: PropTypes.bool,
  }).isRequired,
  index: PropTypes.number.isRequired,
  listLength: PropTypes.number.isRequired,
  status: PropTypes.object,
  displayAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  converting: PropTypes.bool,
  childCount: PropTypes.number.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  pace: PropTypes.number,
  onMove: PropTypes.func,
  onPress: PropTypes.func.isRequired,
  onLongPress: PropTypes.func.isRequired,
};

export default PlanGroupRow;

const styles = StyleSheet.create({
  groupAmount: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  groupBody: {
    flex: 1,
    marginLeft: 10,
  },
  groupMeta: {
    fontSize: 11,
  },
  groupMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '700',
  },
  groupRow: {
    // A hairline under the header instead of a filled bar: the children below it
    // are already indented, and two devices for one relationship is one too many.
    borderBottomWidth: 1,
    borderRadius: 8,
    marginTop: SPACING.xs,
    overflow: 'hidden',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  groupTop: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  noteRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
  },
});
