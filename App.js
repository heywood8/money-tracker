import React from 'react';
import AccountsScreen from './app/AccountsScreen';
import { ThemeProvider } from './app/ThemeContext';
import { AccountsProvider } from './app/AccountsContext';
import { LocalizationProvider } from './app/LocalizationContext';
import { StatusBar, Platform } from 'react-native';

function ThemedStatusBar() {
  const { colorScheme, colors } = require('./app/ThemeContext').useTheme();
  const barStyle = colorScheme === 'dark' ? 'light-content' : 'dark-content';
  React.useEffect(() => {
    try {
      StatusBar.setBarStyle(barStyle, true);
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor(colors.background, true);
      }
    } catch (e) {
      // ignore
    }
  }, [barStyle, colors.background]);

  return <StatusBar translucent={false} />;
}

export default function App() {
  return (
    <LocalizationProvider>
      <ThemeProvider>
        <AccountsProvider>
          <ThemedStatusBar />
          <AccountsScreen />
        </AccountsProvider>
      </ThemeProvider>
    </LocalizationProvider>
  );
}
