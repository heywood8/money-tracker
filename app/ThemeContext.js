import React, { createContext, useContext, useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = 'theme_preference';
const ThemeContext = createContext();

const lightTheme = {
  mode: 'light',
  colors: {
    background: '#f5f7fa',
    surface: 'rgba(255, 255, 255, 0.7)',
    primary: '#007AFF',
    secondary: 'rgba(224, 224, 224, 0.6)',
    text: '#111111',
    mutedText: '#666666',
    border: 'rgba(0, 0, 0, 0.08)',
    card: 'rgba(255, 255, 255, 0.85)',
    modalBackground: 'rgba(0,0,0,0.4)',
    inputBackground: 'rgba(255, 255, 255, 0.5)',
    inputBorder: 'rgba(0, 0, 0, 0.12)',
    danger: 'red',
    delete: '#d9534f',
    selected: 'rgba(192, 224, 255, 0.6)',
    altRow: 'rgba(246, 248, 250, 0.5)', // Added for alternating rows
    expense: '#5a3030',
    income: '#44aa44',
    transfer: '#4444ff',
    expenseBackground: 'rgba(245, 240, 240, 0.7)',
    incomeBackground: 'rgba(229, 255, 229, 0.7)',
    transferBackground: 'rgba(229, 229, 255, 0.7)',
    // Glassmorphism-specific colors
    glassBackground: 'rgba(255, 255, 255, 0.25)',
    glassBorder: 'rgba(255, 255, 255, 0.5)',
    glassShadow: 'rgba(0, 0, 0, 0.1)',
  },
};

const darkTheme = {
  mode: 'dark',
  colors: {
    background: '#0a0a0a',
    surface: 'rgba(26, 26, 26, 0.7)',
    primary: '#4da3ff',
    secondary: 'rgba(51, 51, 51, 0.6)',
    text: '#ffffff',
    mutedText: '#aaaaaa',
    border: 'rgba(255, 255, 255, 0.08)',
    card: 'rgba(34, 34, 34, 0.85)',
    modalBackground: 'rgba(0,0,0,0.5)',
    inputBackground: 'rgba(51, 51, 51, 0.5)',
    inputBorder: 'rgba(255, 255, 255, 0.12)',
    danger: 'red',
    delete: '#ff6b6b',
    selected: 'rgba(0, 95, 163, 0.6)',
    altRow: 'rgba(24, 28, 32, 0.5)', // Added for alternating rows
    expense: '#e6cccc',
    income: '#66dd66',
    transfer: '#6b6bff',
    expenseBackground: 'rgba(42, 32, 32, 0.7)',
    incomeBackground: 'rgba(32, 74, 32, 0.7)',
    transferBackground: 'rgba(32, 32, 74, 0.7)',
    // Glassmorphism-specific colors
    glassBackground: 'rgba(30, 30, 30, 0.25)',
    glassBorder: 'rgba(255, 255, 255, 0.2)',
    glassShadow: 'rgba(0, 0, 0, 0.3)',
  },
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('system');
  const [osColorScheme, setOsColorScheme] = useState(Appearance.getColorScheme() || 'light');
  const [colorScheme, setColorScheme] = useState('light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(stored => {
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

  const updateTheme = async (newTheme) => {
    setTheme(newTheme);
    await AsyncStorage.setItem(THEME_KEY, newTheme);
  };

  const colors = colorScheme === 'dark' ? darkTheme.colors : lightTheme.colors;

  return (
    <ThemeContext.Provider value={{ theme, colorScheme, colors, setTheme: updateTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
