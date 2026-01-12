import React from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { BORDER_RADIUS, SPACING, HEIGHTS, FONT_SIZE, OPACITY } from '../styles/designTokens';

/**
 * FormInput - Standardized input component
 *
 * Provides consistent styling for text inputs across the app with:
 * - Standard 48px height
 * - 4px border radius
 * - Optional left icon
 * - Error state support
 * - Multiline support
 *
 * Usage examples:
 *
 * // Basic input
 * <FormInput
 *   value={name}
 *   onChangeText={setName}
 *   placeholder="Enter name"
 * />
 *
 * // Input with icon and error
 * <FormInput
 *   value={amount}
 *   onChangeText={setAmount}
 *   placeholder="Amount"
 *   leftIcon="currency-usd"
 *   error={errors.amount}
 *   keyboardType="numeric"
 * />
 *
 * // Multiline input
 * <FormInput
 *   value={description}
 *   onChangeText={setDescription}
 *   placeholder="Description"
 *   multiline
 *   numberOfLines={3}
 * />
 */
export default function FormInput({
  value,
  onChangeText,
  placeholder,
  error,
  leftIcon,
  multiline = false,
  numberOfLines = 1,
  keyboardType = 'default',
  editable = true,
  autoFocus = false,
  returnKeyType = 'done',
  onSubmitEditing,
  secureTextEntry = false,
  style,
  inputRef,
}) {
  const { colors } = useThemeColors();

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.inputBackground || colors.surface,
            borderColor: error ? colors.delete : (colors.inputBorder || colors.border),
          },
          multiline && styles.multilineContainer,
          !editable && styles.disabled,
        ]}
      >
        {/* Left Icon */}
        {leftIcon && (
          <Icon
            name={leftIcon}
            size={20}
            color={colors.mutedText}
            style={styles.leftIcon}
          />
        )}

        {/* Text Input */}
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            { color: colors.text },
            multiline && styles.multilineInput,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedText}
          multiline={multiline}
          numberOfLines={numberOfLines}
          keyboardType={keyboardType}
          editable={editable}
          autoFocus={autoFocus}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          secureTextEntry={secureTextEntry}
        />
      </View>

      {/* Error Message */}
      {error && (
        <Text style={[styles.errorText, { color: colors.delete }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.sm,
  },
  disabled: {
    opacity: OPACITY.disabled,
  },
  errorText: {
    fontSize: FONT_SIZE.sm,
    marginLeft: SPACING.md,
    marginTop: SPACING.xs,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE.base,
  },
  inputContainer: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: HEIGHTS.input,
    paddingHorizontal: SPACING.md,
  },
  leftIcon: {
    marginRight: SPACING.sm,
  },
  multilineContainer: {
    alignItems: 'flex-start',
    minHeight: HEIGHTS.input * 2,
    paddingVertical: SPACING.md,
  },
  multilineInput: {
    textAlignVertical: 'top',
  },
});

FormInput.propTypes = {
  /**
   * Current value of the input
   */
  value: PropTypes.string,

  /**
   * Callback when text changes
   */
  onChangeText: PropTypes.func,

  /**
   * Placeholder text
   */
  placeholder: PropTypes.string,

  /**
   * Error message to display below input
   */
  error: PropTypes.string,

  /**
   * Material Community Icon name for left icon
   */
  leftIcon: PropTypes.string,

  /**
   * Whether input should be multiline
   */
  multiline: PropTypes.bool,

  /**
   * Number of lines for multiline input
   */
  numberOfLines: PropTypes.number,

  /**
   * Keyboard type (default, numeric, email-address, etc.)
   */
  keyboardType: PropTypes.string,

  /**
   * Whether input is editable
   */
  editable: PropTypes.bool,

  /**
   * Whether to auto-focus on mount
   */
  autoFocus: PropTypes.bool,

  /**
   * Return key type (done, next, search, etc.)
   */
  returnKeyType: PropTypes.string,

  /**
   * Callback when return key is pressed
   */
  onSubmitEditing: PropTypes.func,

  /**
   * Whether to obscure text entry (for passwords)
   */
  secureTextEntry: PropTypes.bool,

  /**
   * Additional style overrides
   */
  style: PropTypes.object,

  /**
   * Ref to the TextInput component
   */
  inputRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.instanceOf(TextInput) }),
  ]),
};
