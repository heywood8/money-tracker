import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import * as Currency from '../../services/currency';
import PlanProgressBar, { PAIR_COLUMN_WIDTH } from './PlanProgressBar';
import { BORDER_RADIUS, FONT_SIZE, SPACING } from '../../styles/designTokens';

// Stands in for a figure whose exchange rate is still resolving — same em dash
// PlanLineRow uses, for the same reason.
const CONVERTING_PLACEHOLDER = '—';

// Track / fill tints, matching PlanLineRow so an envelope's bar and its
// children's bars read as the same instrument at two sizes.
const TRACK_ALPHA = '26'; // ~15%
const FILL_ALPHA = '99'; // ~60%

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
 * section title: it carries the same figures, the same bar and the same rules,
 * because it IS a budget — the thing the person actually tracks when they say
 * "we spend 50k on the car". Its children sit beneath it, joined to it by the
 * rail that starts here and continues down their left edge.
 */
const PlanGroupRow = memo(function PlanGroupRow({
  group,
  index,
  status = null,
  displayAmount = null,
  converting = false,
  childCount,
  envelopeColor,
  planCurrency,
  colors,
  t,
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
  const ratio = tracked ? status.percentage / 100 : 0;

  const target = status?.amount ?? displayAmount;
  // Leads with what is left, like a line does — an envelope is the level most
  // people actually budget at, so it is the level where "can I still spend
  // here?" gets asked most often. Subtracted from the pair's own two figures
  // rather than read off `status.remaining`, for the reason PlanLineRow does the
  // same: the three numbers on the row have to add up to each other.
  const showPair = tracked && target != null;
  let primaryText;
  let pairText = null;
  let remaining = null;
  if (target == null) {
    primaryText = CONVERTING_PLACEHOLDER;
  } else if (showPair) {
    remaining = Currency.subtract(target, status.actual, planCurrency);
    primaryText = Currency.formatCompact(remaining);
    pairText = `${Currency.formatCompact(status.actual)} / ${Currency.formatCompact(target)}`;
  } else {
    primaryText = Currency.formatCompact(target);
  }

  const overspent = remaining != null && Currency.isNegative(remaining);

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
      style={styles.groupRow}
      onPress={() => onPress(group)}
      onLongPress={() => onLongPress(group, index, listLength, onMove)}
      accessibilityRole="button"
      accessibilityLabel={`${t('edit_group')}: ${group.label}, ${primaryText}${pairText ? `, ${pairText}` : ''}, ${childCount} ${t('allocations')}`}
      testID={`plan-group-${group.id}`}
    >
      {/* The head of the rail that runs down this envelope's children. At full
          strength here and dimmed on them: the header is the thing being
          identified, the rows below it are its parts. */}
      <View
        style={[styles.rail, { backgroundColor: envelopeColor }]}
        testID={`plan-group-rail-${group.id}`}
      />
      <View style={styles.groupInner}>
        <View style={styles.groupTop}>
          {/* The envelope's colour, on the one glyph that means "envelope". Two
              places carry it and no more — this and the rail — so the palette
              identifies without becoming decoration. */}
          <Icon name="folder" size={20} color={envelopeColor} />
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
          <Text
            style={[styles.groupAmount, { color: overspent ? colors.overspend : colors.text }]}
            testID={`plan-group-primary-${group.id}`}
          >
            {converting && target == null ? CONVERTING_PLACEHOLDER : primaryText}
          </Text>
        </View>

        {tracked && (
          <View style={styles.meterRow}>
            <View style={styles.meterBar}>
              <PlanProgressBar
                ratio={ratio}
                trackColor={`${colors.mutedText}${TRACK_ALPHA}`}
                fillColor={`${colors.mutedText}${FILL_ALPHA}`}
                overspendColor={colors.overspend}
                height={5}
                testID={`plan-group-bar-${group.id}`}
              />
            </View>
            {pairText && (
              <Text
                style={[styles.groupPair, { color: colors.mutedText }]}
                numberOfLines={1}
                testID={`plan-group-pair-${group.id}`}
              >
                {pairText}
              </Text>
            )}
          </View>
        )}

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
      </View>
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
  envelopeColor: PropTypes.string.isRequired,
  planCurrency: PropTypes.string.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  onMove: PropTypes.func,
  onPress: PropTypes.func.isRequired,
  onLongPress: PropTypes.func.isRequired,
};

export default PlanGroupRow;

const styles = StyleSheet.create({
  groupAmount: {
    fontSize: FONT_SIZE.base,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    marginLeft: 8,
  },
  groupBody: {
    flex: 1,
    marginLeft: 10,
  },
  groupInner: {
    paddingHorizontal: SPACING.sm,
  },
  groupMeta: {
    fontSize: 11,
  },
  groupMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: 1,
  },
  groupName: {
    fontSize: FONT_SIZE.base,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  groupPair: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    marginLeft: SPACING.sm,
    textAlign: 'right',
    width: PAIR_COLUMN_WIDTH,
  },
  groupRow: {
    // No hairline under the header any more: the rail down the left edge is what
    // joins this row to its children now, and a rule plus an indent plus a rail
    // would be three devices for one relationship.
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.sm,
    overflow: 'hidden',
    paddingVertical: 7,
  },
  groupTop: {
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
  noteRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  noteText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
  },
  rail: {
    borderRadius: BORDER_RADIUS.pill,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 2,
  },
});
