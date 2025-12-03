import React from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from './ThemeContext';

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
  onDismiss
}) {
  const { colors } = useTheme();

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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    width: '80%',
    maxWidth: 400,
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 4,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'flex-end',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  boldText: {
    fontWeight: '700',
  },
});
