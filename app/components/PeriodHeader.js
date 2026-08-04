import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import currencyMeta from '../../assets/currencies.json';
import { BORDER_RADIUS, SPACING } from '../styles/designTokens';

/**
 * The sticky "what am I looking at" header shared by the Budgets and Graphs
 * tabs: a ‹ Period › pager whose title opens a picker, an optional jump back to
 * the current period, and the currency the whole screen is read in.
 *
 * Both tabs are scoped the same way — one period, one currency, everything
 * below read in those two units — so they get one header rather than two that
 * have to be kept looking alike by hand. Graphs arrived at it second, and
 * copying the markup across would have left the two free to drift apart on the
 * very axis the two screens are supposed to agree on.
 *
 * The layout's one rule: the pager row is three regions and the outer two are
 * both `flex: 1`, so whatever they hold — one arrow, or an arrow and a jump
 * button — the period name stays on the screen's centre line. The jump button
 * is mirrored by an empty slot of its own width for the same reason: mounting
 * it must not shift the title sideways.
 *
 * What the header does *not* own is the choice surfaces themselves. The host
 * keeps its own MonthPickerSheet and CurrencySheet, because what a period means
 * differs between the tabs (Graphs periods may be a whole year) and the
 * currency sheet carries a convert-all switch only one of them has.
 *
 * `children` render under the two rows, inside the same padded container: the
 * Budgets tab's headline remainder figure is the month's own value, so it
 * belongs to the header rather than to the list that scrolls under it.
 */

const PeriodHeader = memo(({
  label,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  onPressTitle,
  titleLabel,
  titleActive = false,
  showJumpToCurrent = false,
  onJumpToCurrent,
  jumpLabel,
  currencies,
  selectedCurrency = '',
  onPressCurrency,
  currencyActive = false,
  currencyLabel,
  colors,
  testIDPrefix,
  children = null,
}) => {
  // Blank for anything the catalogue has no symbol for, and blank when the
  // symbol *is* the code (CHF, and every currency the catalogue lists that
  // way) — a chip reading "CHF CHF" is worse than one reading "CHF".
  const symbol = currencyMeta[selectedCurrency]?.symbol;
  const displaySymbol = symbol && symbol !== selectedCurrency ? symbol : '';

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
      testID={`${testIDPrefix}-header`}
    >
      {/* The row is the pager and nothing else — both arrows and the period they
          step, with no third control competing for the thumb that works its
          outer edges. */}
      <View style={styles.row}>
        <View style={styles.navSlot}>
          <Pressable
            onPress={onPrev}
            hitSlop={8}
            style={styles.navButton}
            accessibilityRole="button"
            accessibilityLabel={prevLabel}
            testID={`${testIDPrefix}-prev`}
          >
            <Icon name="chevron-left" size={26} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.titleWrap}>
          {showJumpToCurrent && <View style={styles.jumpSlot} />}
          {/* The period name is the tap target for the picker. The chevron is
              what says so — without it the only pressable thing in the header
              that is not a glyph would look like a caption. It rides inside the
              same box as the label rather than in a slot of its own, so what the
              equal end slots centre is the name-plus-chevron the user reaches
              for, which is how every "tap the title" header is built. */}
          <Pressable
            onPress={onPressTitle}
            hitSlop={8}
            style={styles.titleButton}
            accessibilityRole="button"
            accessibilityLabel={titleLabel}
            testID={`${testIDPrefix}-picker`}
          >
            <Text
              style={[styles.title, { color: colors.text }]}
              numberOfLines={1}
              testID={`${testIDPrefix}-label`}
            >
              {label}
            </Text>
            <Icon
              name="chevron-down"
              size={18}
              color={titleActive ? colors.primary : colors.mutedText}
            />
          </Pressable>
          {/* Both screens stay mounted across tab switches, so a user who
              wanders off-period and returns later needs an explicit, visible way
              back — silently auto-resetting would be surprising. A glyph beside
              the label rather than a labelled button on a row of its own, which
              pushed everything below it down by ~22dp the moment you stepped one
              period back: content shifting under the thumb that navigated. */}
          {showJumpToCurrent && (
            <Pressable
              onPress={onJumpToCurrent}
              style={styles.jumpSlot}
              // The glyph's own box is 26×18; the slop is what brings the target
              // up to a thumb's worth without widening the slot the label is
              // centred against.
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={jumpLabel}
              testID={`${testIDPrefix}-jump-current`}
            >
              <Icon name="calendar-today" size={18} color={colors.primary} />
            </Pressable>
          )}
        </View>
        <View style={[styles.navSlot, styles.navSlotEnd]}>
          <Pressable
            onPress={onNext}
            hitSlop={8}
            style={styles.navButton}
            accessibilityRole="button"
            accessibilityLabel={nextLabel}
            testID={`${testIDPrefix}-next`}
          >
            <Icon name="chevron-right" size={26} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* The chip names the unit the whole screen is read in — the period's
          co-scope — so it sits directly under the period name on the same centre
          line, reading as the title's second line rather than as one more thing
          on the pager row. Mounted only when there is more than one account
          currency to pick between: with a single one there is nothing to choose,
          and the pager runs straight into the content instead of over an empty
          band. It carries the currency's mark as well as its code, and goes
          tonal while its sheet is open. */}
      {currencies.length > 1 && (
        <View style={styles.currencyRow}>
          <Pressable
            onPress={onPressCurrency}
            style={[styles.currencyChip, {
              borderColor: currencyActive ? colors.primary : colors.border,
              backgroundColor: currencyActive ? colors.primary + '1F' : undefined,
            }]}
            android_ripple={{ color: colors.primary + '1F' }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={currencyLabel}
            testID={`${testIDPrefix}-currency-chip`}
          >
            {!!displaySymbol && (
              <Text style={[styles.currencySymbol, { color: colors.mutedText }]}>{displaySymbol}</Text>
            )}
            <Text style={[styles.currencyChipText, { color: colors.text }]}>{selectedCurrency}</Text>
            <Icon name="chevron-down" size={16} color={colors.mutedText} />
          </Pressable>
        </View>
      )}

      {children}
    </View>
  );
});

PeriodHeader.displayName = 'PeriodHeader';

PeriodHeader.propTypes = {
  /** The period's name, already formatted and localized by the host. */
  label: PropTypes.string.isRequired,
  onPrev: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  prevLabel: PropTypes.string.isRequired,
  nextLabel: PropTypes.string.isRequired,
  /** Opens the host's period picker. */
  onPressTitle: PropTypes.func.isRequired,
  titleLabel: PropTypes.string.isRequired,
  /** True while that picker is open — tints the title's chevron. */
  titleActive: PropTypes.bool,
  showJumpToCurrent: PropTypes.bool,
  onJumpToCurrent: PropTypes.func,
  jumpLabel: PropTypes.string,
  /** Account currency codes; the chip is mounted only when there are 2+. */
  currencies: PropTypes.arrayOf(PropTypes.string).isRequired,
  selectedCurrency: PropTypes.string,
  onPressCurrency: PropTypes.func,
  currencyActive: PropTypes.bool,
  currencyLabel: PropTypes.string,
  colors: PropTypes.object.isRequired,
  testIDPrefix: PropTypes.string.isRequired,
  children: PropTypes.node,
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  // Set against the title (17/700) rather than against any sub-label: the chip
  // is the title block's second line, not a caption on it.
  currencyChip: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 3,
    height: 34,
    // The ripple is drawn by the platform on the view's own rectangle, so
    // without this it spills past the pill's rounded ends.
    overflow: 'hidden',
    paddingHorizontal: SPACING.md,
  },
  currencyChipText: {
    fontSize: 15,
    fontWeight: '700',
  },
  currencyRow: {
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  currencySymbol: {
    fontSize: 15,
    fontWeight: '700',
  },
  // Both sides of the label reserve the same box, so mounting the jump button
  // never moves the period name off centre.
  jumpSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
  },
  navButton: {
    padding: 4,
  },
  // The two end regions of the pager row. Equal by construction, whatever they
  // hold: that is what keeps the period name on the screen's centre line even
  // when the two sides' contents are not the same width.
  navSlot: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  navSlotEnd: {
    justifyContent: 'flex-end',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  titleButton: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 2,
  },
  // Sized by its own content and centred by the equal `flex: 1` slots on either
  // side of it, not by a flex of its own — a `flex: 1` here would centre the
  // title in the space the slots leave over, which is not the screen's centre.
  titleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 2,
    justifyContent: 'center',
  },
});

export default PeriodHeader;
