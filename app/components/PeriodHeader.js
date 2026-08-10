import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, PixelRatio } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import currencyMeta from '../../assets/currencies.json';
import { SPACING } from '../styles/designTokens';
import { withAlpha } from '../utils/colorUtils';

/**
 * The sticky "what am I looking at" header shared by the Budgets and Graphs
 * tabs: a ‹ Period › pager whose title opens a picker, the currency the screen
 * is read in beside it, and an optional jump back to the current period. One
 * line, always — the header never grows a second row.
 *
 * Both tabs are scoped the same way — one period, one currency, everything
 * below read in those two units — so they get one header rather than two that
 * have to be kept looking alike by hand.
 *
 *     ‹ ⊙        August 2026 ⌄  │  ֏ AMD ⌄        ›
 *
 * Period and currency are a pair, and the pair as a whole is what sits on the
 * screen's centre line. A hairline parts them, not a middot: a rule says "two
 * facets of one scope", a dot says only "two words in a row".
 *
 * The pair's two halves are deliberately *not* of equal rank. They are two tap
 * targets a thumb's width apart, and if both are dressed as buttons the reader
 * has to work out which one the screen is actually about. So the period is
 * 17/700 in `colors.text` under an 18dp chevron, the currency 15/600 in
 * `colors.mutedText` under a 14dp one — a qualifier on the period, not a
 * second subject. Neither carries a border, a fill or a ripple; the only thing
 * that changes when a sheet opens is that the half that opened it — text and
 * chevron both — goes to `colors.primary`.
 *
 * Width is the constraint the row is designed against, not one it is checked
 * for afterwards: 360dp at a 1.3× font scale with a long month name and the
 * jump glyph up is the case that has to fit. It gives way in a fixed order.
 * First the currency's mark, which is dropped outright above a 1.15× scale —
 * the code is what disambiguates and the mark is what starts to blur (`֏` and
 * `₽` are harder to tell apart at 15dp than `AMD` and `RUB` are). Then, and
 * only then, the period name, which shrinks and truncates. The code and its
 * chevron never shrink: a clipped currency code says nothing at all.
 *
 * It is a glass overlay, not a band the content starts below: the screen's list
 * runs underneath it and shows through, and the last few pixels of the header
 * dissolve into that content instead of ending on a hard edge. This is the
 * floating tab bar's treatment turned upside down — the same theme-background
 * tint at the same fraction of opacity, and the same cubic fade — so the two
 * ends of every screen are made of the same material. A tint toward the theme
 * background rather than toward black is also what makes it read as a
 * *lightening* on the light theme and a *darkening* on the dark one; a black
 * scrim would be a smudge on the light theme.
 *
 * Because it overlays, the host has to know how tall it is: `onHeightChange`
 * reports the solid part's measured height, and the host pads the top of its
 * scroll content by that plus one gap. Measuring rather than assuming a
 * constant is what keeps it correct at any font scale, even though the row
 * count itself never varies.
 *
 * The layout's one rule: the row is three regions and the outer two are both
 * `flex: 1` — which in RN means `flexBasis: 0`, so they stay equal whatever
 * they hold — and the pair in the middle is sized by its own content. That is
 * what keeps the pair centred, and it is why the jump glyph needs no mirror
 * spacer: it lives in the left slot, hard against the ‹ arrow, because a jump
 * to the current period is navigation and belongs with the other navigation
 * rather than inside the name it would otherwise shove sideways. The one place
 * that gives is a narrow screen with the glyph up and a long month name, where
 * the ends hit their floors and the pair ends up a few dp right of centre; see
 * `navSlot` for why that is the loss worth taking.
 *
 * What the header does *not* own is the choice surfaces themselves. The host
 * keeps its own MonthPickerSheet and CurrencySheet, because what a period means
 * differs between the tabs (Graphs periods may be a whole year) and the
 * currency sheet carries a convert-all switch only one of them has.
 */

// The glass. 0.88 sits in the same family as the floating tab bar's 0.87 pill
// and the search pill: enough of the list shows through to say the content
// continues under it, not enough to fight the title for legibility.
const SURFACE_ALPHA = 0.88;

// The dissolve below the solid part, and how many bands draw it. Stepped views
// rather than a gradient library, exactly as the tab bar does it — the app
// carries no gradient dependency and 12 bands over 28dp is under 2.5dp each,
// which no screen resolves as banding.
const FADE_HEIGHT = 28;
const FADE_STEPS = 12;

// Above this the currency's mark is dropped and only its code is drawn.
const SYMBOL_MAX_FONT_SCALE = 1.15;

// What each end slot holds: an arrow (a 26dp glyph in a 4dp-padded box) and, on
// the left only, the jump glyph (18dp behind a 2dp gap). Each end floors itself
// at its own contents — see `navSlot`.
const ARROW_BOX = 34;
const JUMP_BOX = 20;

// Both halves of the pair are bare text, so their own boxes are only as tall as
// a line of type. Generous vertically, where there is room to spare; held to
// the arrows' 8 horizontally, because the two halves are 16.5dp apart and any
// more would make their targets overlap across the hairline.
const SCOPE_HIT_SLOP = { bottom: 12, left: 8, right: 8, top: 12 };

// Transparent-at-the-bottom → glass-at-the-top, on the tab bar's cubic. Strong
// where it meets the header and gone within a few pixels, so the fade reads as
// the header's own edge rather than as a veil over the first card.
const buildFadeSteps = (backgroundHex) =>
  Array.from({ length: FADE_STEPS }, (_, i) => {
    const u = 1 - i / (FADE_STEPS - 1);
    return withAlpha(backgroundHex, u * u * u * SURFACE_ALPHA);
  });

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
  onHeightChange,
  testIDPrefix,
}) => {
  // Blank for anything the catalogue has no symbol for; blank when the symbol
  // *is* the code (CHF, and every currency the catalogue lists that way), since
  // "CHF CHF" is worse than "CHF"; and blank once the text is large enough that
  // the row needs the width more than the reader needs the mark.
  const symbol = currencyMeta[selectedCurrency]?.symbol;
  const displaySymbol = symbol
    && symbol !== selectedCurrency
    && PixelRatio.getFontScale() <= SYMBOL_MAX_FONT_SCALE
    ? symbol
    : '';

  const titleColor = titleActive ? colors.primary : colors.text;
  const currencyColor = currencyActive ? colors.primary : colors.mutedText;

  const fadeSteps = useMemo(() => buildFadeSteps(colors.background), [colors.background]);

  const handleLayout = useCallback((event) => {
    onHeightChange?.(event.nativeEvent.layout.height);
  }, [onHeightChange]);

  return (
    // `box-none` so the header's own box — which extends past the controls to
    // carry the fade — never swallows a tap meant for the content under it.
    <View style={styles.overlay} pointerEvents="box-none" testID={`${testIDPrefix}-header`}>
      <View
        style={[styles.surface, { backgroundColor: withAlpha(colors.background, SURFACE_ALPHA) }]}
        onLayout={handleLayout}
        testID={`${testIDPrefix}-surface`}
      >
        <View style={styles.row}>
          {/* Both arrows keep the edges to themselves; the jump glyph is the
              only thing allowed to join one of them, and only because it is
              navigation too. */}
          <View
            style={[
              styles.navSlot,
              showJumpToCurrent ? styles.navSlotStartWithJump : styles.navSlotStart,
            ]}
            testID={`${testIDPrefix}-nav-start`}
          >
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
            {/* Both screens stay mounted across tab switches, so a user who
                wanders off-period and returns later needs an explicit, visible
                way back — silently auto-resetting would be surprising. */}
            {showJumpToCurrent && (
              <Pressable
                onPress={onJumpToCurrent}
                style={styles.jumpButton}
                // The glyph's own box is 18dp; the slop is what brings the
                // target up to a thumb's worth without widening the slot.
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={jumpLabel}
                testID={`${testIDPrefix}-jump-current`}
              >
                <Icon name="calendar-today" size={18} color={colors.primary} />
              </Pressable>
            )}
          </View>

          {/* The period and the currency it is read in, as one centred pair.
              Baseline-aligned rather than centre-aligned, so the two type sizes
              sit on one line of writing instead of on one band of pixels. */}
          <View style={styles.scope} testID={`${testIDPrefix}-scope`}>
            {/* The period name is the tap target for the picker. The chevron is
                what says so — without it the only pressable thing here that is
                not a glyph would look like a caption. */}
            <Pressable
              onPress={onPressTitle}
              hitSlop={SCOPE_HIT_SLOP}
              style={styles.titleButton}
              accessibilityRole="button"
              accessibilityLabel={titleLabel}
              testID={`${testIDPrefix}-picker`}
            >
              <Text
                style={[styles.title, { color: titleColor }]}
                numberOfLines={1}
                testID={`${testIDPrefix}-label`}
              >
                {label}
              </Text>
              <Icon
                name="chevron-down"
                size={18}
                color={titleColor}
                testID={`${testIDPrefix}-title-chevron`}
              />
            </Pressable>

            {/* Mounted only when there is more than one account currency to
                pick between: with a single one there is nothing to choose, and
                the period should not be parted from a label nobody can act on.
                The Budgets hero prints the code itself in that case. */}
            {currencies.length > 1 && (
              <>
                <View
                  style={[styles.divider, { backgroundColor: colors.border }]}
                  testID={`${testIDPrefix}-divider`}
                />
                <Pressable
                  onPress={onPressCurrency}
                  hitSlop={SCOPE_HIT_SLOP}
                  style={styles.currencyButton}
                  accessibilityRole="button"
                  accessibilityLabel={currencyLabel}
                  testID={`${testIDPrefix}-currency-chip`}
                >
                  {!!displaySymbol && (
                    <Text style={[styles.currencyText, { color: currencyColor }]}>
                      {displaySymbol}
                    </Text>
                  )}
                  <Text style={[styles.currencyText, { color: currencyColor }]}>
                    {selectedCurrency}
                  </Text>
                  <Icon
                    name="chevron-down"
                    size={14}
                    color={currencyColor}
                    testID={`${testIDPrefix}-currency-chevron`}
                  />
                </Pressable>
              </>
            )}
          </View>

          <View
            style={[styles.navSlot, styles.navSlotEnd]}
            testID={`${testIDPrefix}-nav-end`}
          >
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
      </View>

      <View style={styles.fade} pointerEvents="none" testID={`${testIDPrefix}-fade`}>
        {fadeSteps.map((color, i) => (
          <View key={i} style={[styles.fadeStep, { backgroundColor: color }]} />
        ))}
      </View>
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
  /** True while that picker is open — accents the period half. */
  titleActive: PropTypes.bool,
  showJumpToCurrent: PropTypes.bool,
  onJumpToCurrent: PropTypes.func,
  jumpLabel: PropTypes.string,
  /** Account currency codes; the currency half is mounted only when there are 2+. */
  currencies: PropTypes.arrayOf(PropTypes.string).isRequired,
  selectedCurrency: PropTypes.string,
  onPressCurrency: PropTypes.func,
  /** True while the host's currency sheet is open — accents the currency half. */
  currencyActive: PropTypes.bool,
  currencyLabel: PropTypes.string,
  colors: PropTypes.object.isRequired,
  /** Measured height of the solid part, for the host's scroll padding. */
  onHeightChange: PropTypes.func,
  testIDPrefix: PropTypes.string.isRequired,
};

const styles = StyleSheet.create({
  // Never shrinks and never truncates: half a currency code is no code at all.
  currencyButton: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 3,
  },
  currencyText: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Centred against the pair's own box rather than sat on its baseline, which
  // for a view holding no text would be its bottom edge.
  divider: {
    alignSelf: 'center',
    height: 16,
    marginHorizontal: SPACING.sm,
    width: StyleSheet.hairlineWidth,
  },
  fade: {
    height: FADE_HEIGHT,
  },
  // Even bands over whatever height the strip is given, so the ramp needs no
  // arithmetic against FADE_HEIGHT and cannot fall out of sync with it.
  fadeStep: {
    flex: 1,
  },
  // The arrow's own 4dp padding already parts the two glyphs; this is the 2dp
  // that keeps them from reading as one control. Its box is 18 + 2 = JUMP_BOX.
  jumpButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  navButton: {
    padding: 4,
  },
  // The two end regions of the row. `flex: 1` is `flexBasis: 0` in RN, so while
  // the row has slack the two share it evenly and the pair sits on the screen's
  // centre line whatever each end happens to hold — that is why the jump glyph
  // needs no mirror. Yoga has no CSS-style automatic minimum size, though, so
  // with no slack left a slot would resolve narrower than its own contents and
  // the glyph inside it would draw over the period name; each end therefore
  // floors itself at what it actually holds (`ARROW_BOX`, plus the glyph on the
  // left). Reaching that floor on a narrow screen leaves the pair a few dp off
  // centre, which is the cheapest of the three losses available — the other two
  // being an overlap and a truncated year.
  navSlot: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  navSlotEnd: {
    justifyContent: 'flex-end',
    minWidth: ARROW_BOX,
  },
  navSlotStart: {
    minWidth: ARROW_BOX,
  },
  navSlotStartWithJump: {
    minWidth: ARROW_BOX + JUMP_BOX,
  },
  overlay: {
    // Matches the elevation the tab bar and its fade carry, so the header draws
    // over the screen's content on Android as well as over an elevated panel.
    elevation: 8,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  // Sized by its own content and centred by the equal `flex: 1` slots on either
  // side of it, not by a flex of its own — a `flex: 1` here would centre the
  // pair in the space the slots leave over, which is not the screen's centre.
  scope: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexShrink: 1,
    justifyContent: 'center',
  },
  surface: {
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
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
});

export default PeriodHeader;
