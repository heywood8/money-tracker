import React, { createContext, useContext, useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = 'theme_preference';
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
    modalBackground: 'rgba(0,0,0,0.3)',
    inputBackground: '#fff',
    inputBorder: '#cccccc',
    danger: 'red',
    selected: '#c0e0ff',
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
    modalBackground: 'rgba(0,0,0,0.3)',
    inputBackground: '#333333',
    inputBorder: '#555555',
    danger: 'red',
    selected: '#005fa3',
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
