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
 *
 * And because the header IS the budget, it is also what the person usually
 * wants to read: a tap folds the children away, and the envelopes stay folded
 * by default. A plan of five envelopes with six lines each is forty rows to
 * scroll for five figures. Editing the envelope moved to the long-press sheet
 * (where every other whole-row action already lives) so that the tap can mean
 * one thing — the sheet's first item is still Edit group.
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
  collapsed = true,
  onMove = null,
  onToggle,
  onLongPress,
}) {
  const isUnconvertible = status?.status === 'unconvertible';
  // A group is "tracked" once its actual is known — which only the async plan
  // status can supply (per-line actuals are not computed on the client). Until
  // then the row prints its target alone, exactly like a line does.
  const tracked = !!status && !isUnconvertible && status.actual != null;
  const ratio = tracked ? status.percentage / 100 : 0;

  const target = status?.amount ?? displayAmount;
  // Leads with how full the envelope is, like a line does — and it has to be
  // the same figure as a line's, because an envelope sits directly above its
  // children: a header stating one kind of number over rows stating another is
  // a column that cannot be read down. Both the percentage and the remaining
  // that colours the row come from the pair's own two figures rather than from
  // `status.percentage` / `status.remaining`, for the reason PlanLineRow does
  // the same: the numbers on the row have to follow from each other.
  const showPair = tracked && target != null;
  let primaryText;
  let pairText = null;
  let remaining = null;
  if (target == null) {
    primaryText = CONVERTING_PLACEHOLDER;
  } else if (showPair) {
    remaining = Currency.subtract(target, status.actual, planCurrency);
    // A zero budget has no percentage to state — see PlanLineRow.
    primaryText = Currency.formatFillPercent(status.actual, target)
      ?? Currency.formatCompact(remaining);
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
      onPress={() => onToggle(group)}
      onLongPress={() => onLongPress(group, index, listLength, onMove)}
      accessibilityRole="button"
      // Names the envelope and its figures; what the tap DOES is the hint, and
      // whether it is open is the state — a label that said "Edit group" was
      // both wrong (the tap folds now) and the wrong place to say it.
      accessibilityLabel={`${group.label}, ${primaryText}${pairText ? `, ${pairText}` : ''}, ${childCount} ${t('allocations')}`}
      accessibilityHint={collapsed ? t('expand_group') : t('collapse_group')}
      accessibilityState={{ expanded: !collapsed }}
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
              identifies without becoming decoration.
              It is also the disclosure state, open or shut. A separate chevron
              would have to go somewhere, and both places it could go are
              columns this screen aligns deliberately: to its left it pushes the
              folder past the icon column its own children sit in (the indent
              inverts), and to the right of the amount it pulls the header's
              figure out of the column every row's figure shares. A folder that
              is open when its contents are showing costs neither. */}
          <Icon
            name={collapsed ? 'folder' : 'folder-open'}
            size={20}
            color={envelopeColor}
            testID={`plan-group-folder-${group.id}`}
          />
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
  collapsed: PropTypes.bool,
  onMove: PropTypes.func,
  onToggle: PropTypes.func.isRequired,
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
