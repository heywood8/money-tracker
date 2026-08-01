import React, { createContext, useContext, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useThemeConfig } from './ThemeConfigContext';
import { DESTRUCTIVE } from '../styles/semanticColors';

const ThemeColorsContext = createContext();

const lightTheme = {
  mode: 'light',
  colors: {
    background: '#f8f8f8',
    surface: '#ffffff',
    primary: '#007AFF',
    secondary: '#e0e0e0',
    text: '#111111',
    mutedText: '#666666',
    border: '#e6e6e6',
    card: '#fff',
    modalBackground: 'rgba(0,0,0,0.65)',
    // Material 3's dialog scrim. Lighter than `modalBackground` on purpose: a
    // dialog is already sitting on the root blur (App.js), so this only has to
    // supply the separation the blur does not — and 0.65 on top of a blurred
    // screen reads as a blackout rather than as a layer.
    scrim: 'rgba(0,0,0,0.32)',
    inputBackground: '#fff',
    inputBorder: '#cccccc',
    calcButtonBackground: '#ffffff',
    // The one red. Every "this went wrong" or "this destroys something" in the
    // app resolves here: validation text, delete affordances, error banners,
    // Paper's `error` role. It used to be nine different reds — `danger` was the
    // bare CSS keyword `red` (#f00, which no other colour in either palette came
    // near), and eight more were hardcoded at their call sites, four of them
    // hardcoding the *dark* red so it rendered unchanged on the light theme.
    destructive: DESTRUCTIVE.light,
    // Aliases kept because both names are load-bearing across the app and its
    // tests. They are the same colour now, which is the point: `danger` (a
    // negative signal) and `delete` (a destructive act) never wanted to differ.
    danger: DESTRUCTIVE.light,
    delete: DESTRUCTIVE.light,
    error: DESTRUCTIVE.light,
    // Budget-row signal colours. Separate from `destructive` on purpose: these
    // are a plan row's *status*, not an error, and a row tints its background
    // with them at a low alpha — which needs an appendable hex channel.
    // `overspend` means "past the target".
    warning: '#C77700',
    overspend: '#C62828',
    selected: '#a8d0f5',
    altRow: '#ffffff', // Added for alternating rows
    expense: '#5a3030',
    income: '#4a8a4a',
    transfer: '#5575aa',
    expenseBackground: '#f5f0f0',
    incomeBackground: '#e5ffe5',
    transferBackground: '#e5e5ff',
    // Frosted-glass surfaces for the search filters panel. The panel reads as a
    // continuation of the search pill, so glassSurface matches `surface` at a
    // high alpha (near-opaque to avoid list bleed-through, no real backdrop blur
    // on Android). glassSurfaceStrong tints the inner section tiles.
    glassSurface: 'rgba(255,255,255,0.97)',
    glassSurfaceStrong: 'rgba(120,120,120,0.08)',
    glassBorder: 'rgba(0,0,0,0.06)',
  },
};

const darkTheme = {
  mode: 'dark',
  colors: {
    background: '#111111',
    surface: '#1a1a1a',
    primary: '#4da3ff',
    secondary: '#333333',
    text: '#ffffff',
    mutedText: '#aaaaaa',
    border: '#3a3a3a',
    card: '#222222',
    modalBackground: 'rgba(0,0,0,0.65)',
    // See lightTheme note. Same value in both themes — M3 states the scrim as
    // black at 32% regardless of scheme, and a dark-theme dialog needs the
    // separation more, not less, since card and background are closer together.
    scrim: 'rgba(0,0,0,0.32)',
    inputBackground: '#333333',
    inputBorder: '#555555',
    calcButtonBackground: '#1e1e1e',
    // See lightTheme note. Lifted off the light-theme red so it holds contrast
    // against a near-black surface.
    destructive: DESTRUCTIVE.dark,
    danger: DESTRUCTIVE.dark,
    delete: DESTRUCTIVE.dark,
    error: DESTRUCTIVE.dark,
    // See lightTheme note. Lifted for legibility as a tint on a near-black
    // surface.
    warning: '#F2A93B',
    overspend: '#FF6B6B',
    selected: '#003a7a',
    altRow: '#1a1a1a', // Added for alternating rows
    expense: '#e6cccc',
    income: '#66aa66',
    transfer: '#7799cc',
    expenseBackground: '#2a2020',
    incomeBackground: '#204a20',
    transferBackground: '#20204a',
    // See lightTheme note. Dark variant matches `surface` (#1a1a1a) at a high
    // alpha so filter labels stay readable over the operations behind the panel.
    glassSurface: 'rgba(26,26,26,0.97)',
    glassSurfaceStrong: 'rgba(120,120,120,0.12)',
    glassBorder: 'rgba(255,255,255,0.08)',
  },
};

export const ThemeColorsProvider = ({ children }) => {
  const { colorScheme } = useThemeConfig();

  const value = useMemo(() => ({
    colors: colorScheme === 'dark' ? darkTheme.colors : lightTheme.colors,
  }), [colorScheme]);

  return (
    <ThemeColorsContext.Provider value={value}>
      {children}
    </ThemeColorsContext.Provider>
  );
};

ThemeColorsProvider.propTypes = {
  children: PropTypes.node,
};

export const useThemeColors = () => useContext(ThemeColorsContext);
