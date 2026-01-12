import React, { createContext, useContext, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Appearance } from 'react-native';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';

const ThemeConfigContext = createContext();

export const ThemeConfigProvider = ({ children }) => {
  const [theme, setTheme] = useState('system'); // 'light' | 'dark' | 'system'
  const [osColorScheme, setOsColorScheme] = useState(Appearance.getColorScheme() || 'light');
  const [colorScheme, setColorScheme] = useState('light'); // Effective color scheme

  // Load theme preference from storage
  useEffect(() => {
    getPreference(PREF_KEYS.THEME, 'system').then(stored => {
      if (stored) setTheme(stored);
    });
  }, []);

  // Listen to OS color scheme changes
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setOsColorScheme(colorScheme || 'light'));
    setOsColorScheme(Appearance.getColorScheme() || 'light');
    return () => sub.remove();
  }, []);

  // Compute effective color scheme: if user selected 'system', use OS scheme
  useEffect(() => {
    if (theme === 'system') {
      setColorScheme(osColorScheme);
    } else {
      setColorScheme(theme);
    }
  }, [theme, osColorScheme]);

  const updateTheme = async (newTheme) => {
    setTheme(newTheme);
    await setPreference(PREF_KEYS.THEME, newTheme);
  };

  return (
    <ThemeConfigContext.Provider value={{ theme, colorScheme, setTheme: updateTheme }}>
      {children}
    </ThemeConfigContext.Provider>
  );
};

ThemeConfigProvider.propTypes = {
  children: PropTypes.node,
};

export const useThemeConfig = () => useContext(ThemeConfigContext);
