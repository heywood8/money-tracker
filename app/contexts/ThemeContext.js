import React, { createContext, useContext, useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';
const ThemeContext = createContext();

const lightTheme = {
  mode: 'light',
  colors: {
    background: '#ffffff',
    surface: '#ffffff',
    primary: '#007AFF',
    secondary: '#e0e0e0',
    text: '#111111',
    mutedText: '#666666',
    border: '#e6e6e6',
    card: '#fff',
    modalBackground: 'rgba(0,0,0,0.65)',
    inputBackground: '#fff',
    inputBorder: '#cccccc',
    danger: 'red',
    delete: '#d9534f',
    selected: '#c0e0ff',
    altRow: '#f6f8fa', // Added for alternating rows
    expense: '#5a3030',
    income: '#44aa44',
    transfer: '#4444ff',
    expenseBackground: '#f5f0f0',
    incomeBackground: '#e5ffe5',
    transferBackground: '#e5e5ff',
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
    border: '#2a2a2a',
    card: '#222222',
    modalBackground: 'rgba(0,0,0,0.65)',
    inputBackground: '#333333',
    inputBorder: '#555555',
    danger: 'red',
    delete: '#ff6b6b',
    selected: '#005fa3',
    altRow: '#181c20', // Added for alternating rows
    expense: '#e6cccc',
    income: '#66dd66',
    transfer: '#6b6bff',
    expenseBackground: '#2a2020',
    incomeBackground: '#204a20',
    transferBackground: '#20204a',
  },
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('system');
  const [osColorScheme, setOsColorScheme] = useState(Appearance.getColorScheme() || 'light');
  const [colorScheme, setColorScheme] = useState('light');
  const [isWaveAnimating, setIsWaveAnimating] = useState(false);
  const [waveOrigin, setWaveOrigin] = useState(null);
  const [nextColorScheme, setNextColorScheme] = useState(null);

  useEffect(() => {
    getPreference(PREF_KEYS.THEME, 'system').then(stored => {
      if (stored) setTheme(stored);
    });
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setOsColorScheme(colorScheme || 'light'));
    setOsColorScheme(Appearance.getColorScheme() || 'light');
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // compute effective color scheme: if user selected 'system', use OS scheme
    if (theme === 'system') {
      setColorScheme(osColorScheme);
    } else {
      setColorScheme(theme);
    }
  }, [theme, osColorScheme]);

  const updateTheme = async (newTheme, origin = null) => {
    // Calculate what the next color scheme will be
    let futureColorScheme;
    if (newTheme === 'system') {
      futureColorScheme = osColorScheme;
    } else {
      futureColorScheme = newTheme;
    }

    // Only animate if the color scheme is actually changing
    if (futureColorScheme !== colorScheme && origin) {
      // Start wave animation with the future theme colors
      setNextColorScheme(futureColorScheme);
      setWaveOrigin(origin);
      setIsWaveAnimating(true);

      // Wait for animation to cover screen before switching theme
      setTimeout(() => {
        setTheme(newTheme);
        setPreference(PREF_KEYS.THEME, newTheme);
      }, 300); // Switch theme halfway through the animation
    } else {
      // No animation needed, just switch theme
      setTheme(newTheme);
      await setPreference(PREF_KEYS.THEME, newTheme);
    }
  };

  const onWaveComplete = () => {
    setIsWaveAnimating(false);
    setWaveOrigin(null);
    setNextColorScheme(null);
  };

  const colors = colorScheme === 'dark' ? darkTheme.colors : lightTheme.colors;
  const waveColor = nextColorScheme === 'dark' ? darkTheme.colors.background : lightTheme.colors.background;

  return (
    <ThemeContext.Provider
      value={{
        theme,
        colorScheme,
        colors,
        setTheme: updateTheme,
        isWaveAnimating,
        waveOrigin,
        waveColor,
        onWaveComplete,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
