import React, { createContext, useContext, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Appearance } from 'react-native';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';

const ThemeConfigContext = createContext();

export const ThemeConfigProvider = ({ children }) => {
  const [theme, setTheme] = useState('system'); // 'light' | 'dark' | 'system'
  const [osColorScheme, setOsColorScheme] = useState(Appearance.getColorScheme() || 'light');
  // Whether the stored preference has been read yet. Until it has, `theme` is
  // the 'system' default and `colorScheme` therefore reports the OS scheme —
  // which is the wrong answer for anyone who chose the other one. Callers that
  // act on the scheme during the first frames (ColdStartScreen) need to know.
  const [isThemeLoaded, setIsThemeLoaded] = useState(false);
  // Load theme preference from storage
  useEffect(() => {
    getPreference(PREF_KEYS.THEME, 'system')
      .then(stored => {
        if (stored) setTheme(stored);
      })
      .finally(() => setIsThemeLoaded(true));
  }, []);

  // Listen to OS color scheme changes
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setOsColorScheme(colorScheme || 'light'));
    setOsColorScheme(Appearance.getColorScheme() || 'light');
    return () => sub.remove();
  }, []);

  const colorScheme = theme === 'system' ? osColorScheme : theme;

  const updateTheme = async (newTheme) => {
    setTheme(newTheme);
    await setPreference(PREF_KEYS.THEME, newTheme);
  };

  return (
    <ThemeConfigContext.Provider value={{ theme, colorScheme, isThemeLoaded, setTheme: updateTheme }}>
      {children}
    </ThemeConfigContext.Provider>
  );
};

ThemeConfigProvider.propTypes = {
  children: PropTypes.node,
};

export const useThemeConfig = () => useContext(ThemeConfigContext);
