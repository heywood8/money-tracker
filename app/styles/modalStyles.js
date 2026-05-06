// app/styles/modalStyles.js
import { StyleSheet } from 'react-native';
import { SPACING, BORDER_RADIUS } from './designTokens';

/**
 * Static styles shared across all modal form content.
 * Colors are applied inline since they depend on the active theme.
 */
export const modalSharedStyles = StyleSheet.create({
  // Small-caps label rendered above each input or picker row
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 2,
    marginTop: SPACING.sm,
  },
  // TouchableRipple container for tappable picker rows
  pickerRow: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.xs,
    overflow: 'hidden',
  },
  // Inner row: value text + chevron
  pickerRowInner: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  // Selected value text inside a picker row
  pickerRowValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  // Spacing below PaperTextInput
  textInput: {
    marginBottom: SPACING.xs,
  },
});

/**
 * Returns a react-native-paper theme object that maps app colors
 * onto Paper's TextInput outlined style.
 * Call inside the component after reading colors from ThemeColorsContext.
 *
 * Usage:
 *   const { colors } = useThemeColors();
 *   const { paperInputTheme } = makeModalStyles(colors);
 *   <PaperTextInput mode="outlined" theme={paperInputTheme} ... />
 */
export function makeModalStyles(colors) {
  return {
    paperInputTheme: {
      colors: {
        primary: colors.primary,
        outline: colors.border,
        background: colors.card,
        onSurfaceVariant: colors.mutedText,
        onSurface: colors.text,
        error: colors.error,
      },
    },
  };
}
