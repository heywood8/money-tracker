import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { SPACING } from '../styles/designTokens';
import { withAlpha } from '../utils/colorUtils';

/**
 * The sticky "what am I looking at" header shared by the Budgets and Graphs
 * tabs: a ‹ Period › pager whose title opens a picker, plus an optional jump
 * back to the current period. That is the whole of it — one line, always.
 *
 * The currency the screen is read in used to live here too, as a second row
 * under the period name. It moved out to sit beside the figure it actually
 * measures (a hero amount on Budgets, a pair of summary cards on Graphs) —
 * `components/CurrencyScopeChip.js`, mounted by each host next to its own
 * numbers. A unit belongs to the value it scopes, not to the pager that
 * merely steps time; keeping it here also meant this header changed height
 * depending on how many account currencies existed, for a reason a reader
 * two screens away from the number could not see.
 *
 * Both tabs still share this exact pager, because they are scoped by period
 * the same way and a hand-kept-in-sync pair of near-identical headers is
 * worse than one.
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
 * count itself no longer varies.
 *
 * The layout's one rule: the pager row is three regions and the outer two are
 * both `flex: 1`, so whatever they hold — one arrow, or an arrow and a jump
 * button — the period name stays on the screen's centre line. The jump button
 * is mirrored by an empty slot of its own width for the same reason: mounting
 * it must not shift the title sideways.
 *
 * What the header does *not* own is the choice surface itself. The host keeps
 * its own MonthPickerSheet, because what a period means differs between the
 * tabs (Graphs periods may be a whole year).
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
  colors,
  onHeightChange,
  testIDPrefix,
}) => {
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
        {/* The row is the pager and nothing else — both arrows and the period
            they step, with no third control competing for the thumb that works
            its outer edges. */}
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
                that is not a glyph would look like a caption. It rides inside
                the same box as the label rather than in a slot of its own, so
                what the equal end slots centre is the name-plus-chevron the user
                reaches for, which is how every "tap the title" header is
                built. */}
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
                wanders off-period and returns later needs an explicit, visible
                way back — silently auto-resetting would be surprising. A glyph
                beside the label rather than a labelled button on a row of its
                own, which pushed everything below it down by ~22dp the moment
                you stepped one period back: content shifting under the thumb
                that navigated. */}
            {showJumpToCurrent && (
              <Pressable
                onPress={onJumpToCurrent}
                style={styles.jumpSlot}
                // The glyph's own box is 26×18; the slop is what brings the
                // target up to a thumb's worth without widening the slot the
                // label is centred against.
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
  /** True while that picker is open — tints the title's chevron. */
  titleActive: PropTypes.bool,
  showJumpToCurrent: PropTypes.bool,
  onJumpToCurrent: PropTypes.func,
  jumpLabel: PropTypes.string,
  colors: PropTypes.object.isRequired,
  /** Measured height of the solid part, for the host's scroll padding. */
  onHeightChange: PropTypes.func,
  testIDPrefix: PropTypes.string.isRequired,
};

const styles = StyleSheet.create({
  fade: {
    height: FADE_HEIGHT,
  },
  // Even bands over whatever height the strip is given, so the ramp needs no
  // arithmetic against FADE_HEIGHT and cannot fall out of sync with it.
  fadeStep: {
    flex: 1,
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
