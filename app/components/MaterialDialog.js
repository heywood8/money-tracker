import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import {
  SPACING,
  BORDER_RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  ICON_SIZE,
  ELEVATION,
} from '../styles/designTokens';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import ModalBlurOverlay from './ModalBlurOverlay';
import { TIMING_ENTER } from '../utils/motion';

// The card grows a hair as it fades in. 4%, not 10%: this dialog interrupts,
// which is a reason to arrive quickly and stop, not to make an entrance.
const OPEN_SCALE_FROM = 0.96;
const OPEN_DURATION = 200;

// Material 3's scrim: black at 32%. The root blur (App.js, `filter: [{ blur: 10 }]`)
// only blurs, it does not dim — and on Android that filter needs API 31's
// RenderEffect, so on an older device there was nothing at all between the card
// and the screen. The blur is the atmosphere; this is the separation.
const SCRIM = 'rgba(0,0,0,0.32)';

// The confirming action is a tonal button: its accent at low alpha behind the
// same accent at full strength. Tonal rather than solid because a solid fill has
// to pick a legible text colour on top of it, and there is no single answer —
// the light delete red (#d9534f) wants white, the dark one (#ff6b6b) wants
// black. A tonal button never has to choose, so one rule covers both themes.
const FILL_ALPHA = '22';
const RIPPLE_ALPHA = '33';

/**
 * Append an alpha channel to a 6-digit hex colour.
 *
 * Returns the colour untouched if it is anything else — a CSS keyword like the
 * theme's `danger: 'red'`, or an rgba() string. `'red22'` is not a colour, and
 * a caller passing one would get a silently invisible button rather than an
 * error, so the guard is the difference between a tint and a disappearance.
 */
const withAlpha = (color, alpha) => (
  /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color
);

// The card is a Pressable (it swallows taps so they don't reach the dismissing
// overlay behind it) AND the thing that scales. Animating the Pressable itself
// rather than wrapping it in an Animated.View keeps `styles.dialog` — which sizes
// the card — on a single node; a bare wrapper would have had to size itself from
// its own child's percentage width.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Material Design 3 Dialog Component
 * Replaces React Native Alert with a themed modal dialog
 *
 * @param {boolean} visible - Controls dialog visibility
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message/content
 * @param {Array} buttons - Array of button configurations
 *   Each button: { text: string, onPress: function, style: 'default'|'cancel'|'destructive' }
 * @param {string|null} icon - MaterialCommunityIcons glyph shown above the title.
 *   Omitted, a dialog carrying a destructive action gets `alert-outline`; pass
 *   `null` to suppress that, or a name to override it.
 * @param {function} onDismiss - Called when dialog is dismissed
 */
export default function MaterialDialog({
  visible = false,
  title,
  message,
  buttons = [],
  icon,
  onDismiss,
}) {
  const { colors } = useThemeColors();

  // Every other surface in the app arrives from somewhere — panels slide, sheets
  // rise, the graph panel grows out of its header. This dialog was the one that
  // simply existed at full size the moment it was there.
  //
  // Only the entry is scripted. The exit stays with `animationType="fade"`,
  // which unmounts the children as it runs: a scripted exit would need the card
  // to outlive `visible`, and buying a 150ms shrink with a second copy of the
  // dialog's visibility state is the wrong trade for the app's most-used modal.
  //
  // Scale only. The Modal's own fade already carries the opacity, and animating
  // it here too would double it into a slower-looking arrival — so the shared
  // value is the scale itself rather than a 0..1 progress to interpolate off.
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!visible) return;
    scale.value = OPEN_SCALE_FROM;
    scale.value = withTiming(1, { ...TIMING_ENTER, duration: OPEN_DURATION });
  }, [visible, scale]);

  const dialogStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handleButtonPress = (button) => {
    if (button.onPress) {
      button.onPress();
    }
    if (onDismiss) {
      onDismiss();
    }
  };

  const destructiveColor = colors.destructive;

  /** The accent a button speaks in — its label colour, and the base of its fill. */
  const accentFor = (style) => {
    switch (style) {
    case 'destructive':
      return destructiveColor;
    case 'cancel':
      return colors.mutedText;
    default:
      return colors.primary;
    }
  };

  // The last action is the one the dialog is asking for, so it gets the fill —
  // unless it is a cancel, in which case the dialog is not asking for anything.
  const confirmIndex = buttons.length - 1;
  const isConfirmAction = (button, index) => (
    index === confirmIndex && button.style !== 'cancel'
  );

  const hasDestructive = buttons.some((button) => button.style === 'destructive');
  // `undefined` means "decide for me"; `null` means "no icon". Distinguishing the
  // two is what lets a destructive dialog get the glyph for free at all 10 call
  // sites while still leaving any one of them able to opt out.
  const resolvedIcon = icon === undefined ? (hasDestructive ? 'alert-outline' : null) : icon;
  // Material 3 centres the headline and supporting text when a hero icon is
  // present, and left-aligns them when it is not.
  const centered = !!resolvedIcon;

  return (
    <>
      {visible && <ModalBlurOverlay />}
      <Modal
        visible={visible}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={onDismiss}
      >
        <Pressable
          testID="material-dialog-overlay"
          style={[styles.overlay, { backgroundColor: colors.scrim || SCRIM }]}
          onPress={onDismiss}
        >
          <AnimatedPressable
            testID="material-dialog-content"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.dialog, { backgroundColor: colors.card }, dialogStyle]}
            onPress={() => {}}
          >
            {/* Hero icon */}
            {resolvedIcon && (
              <MaterialCommunityIcons
                testID="material-dialog-icon"
                name={resolvedIcon}
                size={ICON_SIZE.base}
                color={hasDestructive ? destructiveColor : colors.primary}
                style={styles.icon}
              />
            )}

            {/* Title */}
            {title && (
              <Text style={[styles.title, centered && styles.centeredText, { color: colors.text }]}>
                {title}
              </Text>
            )}

            {/* Message */}
            {message && (
              <Text
                style={[
                  styles.message,
                  centered && styles.centeredText,
                  { color: colors.mutedText },
                ]}
              >
                {message}
              </Text>
            )}

            {/* Actions. A row that wraps rather than a measured row/column
                switch: two labels that do not fit side by side (German, or a
                long Russian verb) fall onto separate lines in the order Material
                3 stacks them anyway — confirming action last, both flush right. */}
            <View testID="material-dialog-actions" style={styles.actions}>
              {buttons.map((button, index) => {
                const accent = accentFor(button.style);
                const filled = isConfirmAction(button, index);
                return (
                  <Pressable
                    key={index}
                    accessibilityRole="button"
                    accessibilityLabel={typeof button.text === 'string' ? button.text : undefined}
                    android_ripple={{
                      color: filled
                        ? withAlpha(accent, RIPPLE_ALPHA)
                        : colors.glassSurfaceStrong,
                      borderless: false,
                    }}
                    style={({ pressed }) => [
                      styles.action,
                      filled && { backgroundColor: withAlpha(accent, FILL_ALPHA) },
                      // Ripple covers Android; this keeps the press readable
                      // anywhere it does not run (older API levels, tests).
                      pressed && !filled && { backgroundColor: colors.glassSurfaceStrong },
                    ]}
                    onPress={() => handleButtonPress(button)}
                  >
                    <Text style={[styles.actionLabel, { color: accent }]}>
                      {button.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </AnimatedPressable>
        </Pressable>
      </Modal>
    </>
  );
}

MaterialDialog.propTypes = {
  visible: PropTypes.bool,
  title: PropTypes.string,
  message: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  buttons: PropTypes.arrayOf(
    PropTypes.shape({
      text: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
      onPress: PropTypes.func,
      style: PropTypes.oneOf(['default', 'cancel', 'destructive']),
    }),
  ),
  icon: PropTypes.string,
  onDismiss: PropTypes.func,
};

const styles = StyleSheet.create({
  // Content-sized and right-aligned, which is also the fix for a hazard the old
  // column layout had: its buttons stretched the full width of the card with
  // only the label drawn at the right end, so a tap on the empty space to the
  // left of "Delete" deleted.
  action: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: SPACING.xl,
  },
  actionLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
    letterSpacing: 0.1,
  },
  // No `textTransform: 'uppercase'`. Material dropped all-caps labels in M3, and
  // the translations are already sentence case, so every language gets the fix
  // for free — Cyrillic and CJK most of all, where capitals cost the reader the
  // shape of the word.
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    justifyContent: 'flex-end',
  },
  centeredText: {
    textAlign: 'center',
  },
  dialog: {
    borderRadius: BORDER_RADIUS.xl,
    maxWidth: 560,
    minWidth: 280,
    padding: SPACING.xxl,
    width: '90%',
    ...ELEVATION.medium,
  },
  icon: {
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.xxl,
  },
  overlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.regular,
    lineHeight: 32,
    marginBottom: SPACING.lg,
  },
});
