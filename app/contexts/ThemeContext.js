import React from 'react';
import PropTypes from 'prop-types';
import { ThemeConfigProvider, useThemeConfig } from './ThemeConfigContext';
import { ThemeColorsProvider, useThemeColors } from './ThemeColorsContext';

/**
 * DEPRECATED: This file provides backward compatibility wrappers.
 *
 * ThemeContext has been split into two separate contexts:
 * - ThemeConfigContext (theme configuration and preferences)
 * - ThemeColorsContext (computed color values)
 *
 * New code should import useThemeConfig and useThemeColors directly.
 * This wrapper is maintained for backward compatibility with existing tests.
 *
 * Migration guide:
 * Before:
 *   const { colors, colorScheme, theme, setTheme } = useTheme();
 *
 * After:
 *   const { colorScheme, theme, setTheme } = useThemeConfig();
 *   const { colors } = useThemeColors();
 */

/**
 * Deprecated hook that combines both config and colors.
 * Use useThemeConfig() and useThemeColors() separately instead.
 */
export const useTheme = () => {
  const config = useThemeConfig();
  const colors = useThemeColors();

  return {
    ...config,
    ...colors,
  };
};

/**
 * Deprecated provider that wraps both split contexts.
 * Use ThemeConfigProvider and ThemeColorsProvider directly in App.js.
 */
export const ThemeProvider = ({ children }) => {
  return (
    <ThemeConfigProvider>
      <ThemeColorsProvider>
        {children}
      </ThemeColorsProvider>
    </ThemeConfigProvider>
  );
};

ThemeProvider.propTypes = {
  children: PropTypes.node,
};
