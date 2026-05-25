import React, { createContext, useContext, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useThemeConfig } from './ThemeConfigContext';

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
    inputBackground: '#fff',
    inputBorder: '#cccccc',
    calcButtonBackground: '#ffffff',
    danger: 'red',
    delete: '#d9534f',
    selected: '#a8d0f5',
    altRow: '#ffffff', // Added for alternating rows
    expense: '#5a3030',
    income: '#4a8a4a',
    transfer: '#5575aa',
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
    border: '#3a3a3a',
    card: '#222222',
    modalBackground: 'rgba(0,0,0,0.65)',
    inputBackground: '#333333',
    inputBorder: '#555555',
    calcButtonBackground: '#1e1e1e',
    danger: 'red',
    delete: '#ff6b6b',
    selected: '#003a7a',
    altRow: '#1a1a1a', // Added for alternating rows
    expense: '#e6cccc',
    income: '#66aa66',
    transfer: '#7799cc',
    expenseBackground: '#2a2020',
    incomeBackground: '#204a20',
    transferBackground: '#20204a',
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
