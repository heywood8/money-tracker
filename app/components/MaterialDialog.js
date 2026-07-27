import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { HORIZONTAL_PADDING } from '../styles/layout';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import ModalBlurOverlay from './ModalBlurOverlay';
import { TIMING_ENTER } from '../utils/motion';

// The card grows a hair as it fades in. 4%, not 10%: this dialog interrupts,
// which is a reason to arrive quickly and stop, not to make an entrance.
const OPEN_SCALE_FROM = 0.96;
const OPEN_DURATION = 200;

// The card is a Pressable (it swallows taps so they don't reach the dismissing
// overlay behind it) AND the thing that scales. Animating the Pressable itself
// rather than wrapping it in an Animated.View keeps `styles.dialog` — which sizes
// the card at 80% of the overlay — on a single node; a bare wrapper would have
// had to size itself from its own child's percentage width.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Material Design Dialog Component
 * Replaces React Native Alert with a themed modal dialog
 *
 * @param {boolean} visible - Controls dialog visibility
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message/content
 * @param {Array} buttons - Array of button configurations
 *   Each button: { text: string, onPress: function, style: 'default'|'cancel'|'destructive' }
 * @param {function} onDismiss - Called when dialog is dismissed
 */
export default function MaterialDialog({
  visible = false,
  title,
  message,
  buttons = [],
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

  const getButtonStyle = (style) => {
    switch (style) {
    case 'destructive':
      return { color: colors.delete || '#d32f2f' };
    case 'cancel':
      return { color: colors.mutedText };
    default:
      return { color: colors.primary };
    }
  };

  return (
    <>
      {visible && <ModalBlurOverlay />}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onDismiss}
      >
        <Pressable
          testID="material-dialog-overlay"
          style={styles.overlay}
          onPress={onDismiss}
        >
          <AnimatedPressable
            testID="material-dialog-content"
            style={[styles.dialog, { backgroundColor: colors.card }, dialogStyle]}
            onPress={() => {}}
          >
            {/* Title */}
            {title && (
              <Text style={[styles.title, { color: colors.text }]}>
                {title}
              </Text>
            )}

            {/* Message */}
            {message && (
              <Text style={[styles.message, { color: colors.text }]}>
                {message}
              </Text>
            )}

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              {buttons.map((button, index) => (
                <Pressable
                  key={index}
                  style={({ pressed }) => [
                    styles.button,
                    pressed && { backgroundColor: colors.selected },
                  ]}
                  onPress={() => handleButtonPress(button)}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      getButtonStyle(button.style),
                      button.style === 'destructive' && styles.boldText,
                    ]}
                  >
                    {button.text}
                  </Text>
                </Pressable>
              ))}
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
  onDismiss: PropTypes.func,
};

const styles = StyleSheet.create({
  boldText: {
    fontWeight: '700',
  },
  button: {
    alignItems: 'flex-end',
    borderRadius: 8,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 12,
  },
  buttonContainer: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: 4,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  dialog: {
    borderRadius: 12,
    elevation: 8,
    maxWidth: 400,
    padding: HORIZONTAL_PADDING + 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    width: '80%',
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  overlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
});
