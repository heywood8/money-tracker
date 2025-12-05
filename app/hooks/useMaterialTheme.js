import { useMemo } from 'react';
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Hook to bridge our existing ThemeContext with React Native Paper's theme
 * Maps our custom colors to Material Design 3 color tokens
 */
export function useMaterialTheme() {
  const { colorScheme, colors } = useTheme();

  const paperTheme = useMemo(() => {
    const baseTheme = colorScheme === 'dark' ? MD3DarkTheme : MD3LightTheme;

    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        // Primary colors
        primary: colors.primary,
        primaryContainer: colorScheme === 'dark' ? '#004a77' : '#c0e0ff',
        onPrimary: colorScheme === 'dark' ? '#ffffff' : '#ffffff',
        onPrimaryContainer: colorScheme === 'dark' ? '#c0e0ff' : '#001d35',

        // Secondary colors
        secondary: colors.secondary,
        secondaryContainer: colorScheme === 'dark' ? '#444444' : '#e8e8e8',
        onSecondary: colors.text,
        onSecondaryContainer: colors.text,

        // Background & Surface
        background: colors.background,
        onBackground: colors.text,
        surface: colors.surface,
        onSurface: colors.text,
        surfaceVariant: colors.altRow,
        onSurfaceVariant: colors.mutedText,

        // Elevation
        elevation: {
          level0: 'transparent',
          level1: colors.surface,
          level2: colors.card,
          level3: colors.surface,
          level4: colors.surface,
          level5: colors.surface,
        },

        // Error/Danger
        error: colors.danger,
        errorContainer: colorScheme === 'dark' ? '#93000a' : '#ffdad6',
        onError: '#ffffff',
        onErrorContainer: colorScheme === 'dark' ? '#ffdad6' : '#410002',

        // Outline/Border
        outline: colors.border,
        outlineVariant: colors.inputBorder,

        // Surface tints
        surfaceDisabled: colorScheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
        onSurfaceDisabled: colorScheme === 'dark' ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.38)',

        // Scrim for modals
        backdrop: colors.modalBackground,

        // Custom colors from our theme
        custom: {
          expense: colors.expense,
          income: colors.income,
          transfer: colors.transfer,
          expenseBackground: colors.expenseBackground,
          incomeBackground: colors.incomeBackground,
          transferBackground: colors.transferBackground,
          selected: colors.selected,
          altRow: colors.altRow,
          mutedText: colors.mutedText,
          delete: colors.delete,
        },
      },
      // Animation configs
      animation: {
        scale: 1.0,
      },
      // Roundness for Material Design
      roundness: 8,
    };
  }, [colorScheme, colors]);

  return paperTheme;
}
