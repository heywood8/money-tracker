import React, { createContext, useContext, useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = 'theme_preference';
const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('system');
  const [colorScheme, setColorScheme] = useState(Appearance.getColorScheme() || 'light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(stored => {
      if (stored) setTheme(stored);
    });
  }, []);

  useEffect(() => {
    if (theme === 'system') {
      const sub = Appearance.addChangeListener(({ colorScheme }) => setColorScheme(colorScheme || 'light'));
      setColorScheme(Appearance.getColorScheme() || 'light');
      return () => sub.remove();
    } else {
      setColorScheme(theme);
    }
  }, [theme]);

  const updateTheme = async (newTheme) => {
    setTheme(newTheme);
    await AsyncStorage.setItem(THEME_KEY, newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, colorScheme, setTheme: updateTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
