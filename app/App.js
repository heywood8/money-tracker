
import React from 'react';
import AccountsScreen from './AccountsScreen';
import { ThemeProvider } from './ThemeContext';


export default function App() {
  return (
    <ThemeProvider>
      <AccountsScreen />
    </ThemeProvider>
  );
}
