import React from 'react';
import PropTypes from 'prop-types';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { HORIZONTAL_PADDING } from '../styles/layout';
import { useThemeColors } from '../contexts/ThemeColorsContext';

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
  visible,
  title,
  message,
  buttons = [],
  onDismiss,
}) {
  const { colors } = useThemeColors();

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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable
        style={styles.overlay}
        onPress={onDismiss}
      >
        <Pressable
          style={[styles.dialog, { backgroundColor: colors.card }]}
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
        </Pressable>
      </Pressable>
    </Modal>
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

MaterialDialog.defaultProps = {
  visible: false,
  title: undefined,
  message: undefined,
  buttons: [],
  onDismiss: undefined,
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
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
});
