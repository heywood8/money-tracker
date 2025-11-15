import React from 'react';
import AccountsScreen from './AccountsScreen';
import { ThemeProvider } from './ThemeContext';
import { AccountsProvider } from './AccountsContext';
import { StatusBar, Platform } from 'react-native';

function ThemedStatusBar() {
  const { colorScheme, colors } = require('./ThemeContext').useTheme();
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
    <ThemeProvider>
      <AccountsProvider>
        <ThemedStatusBar />
        <AccountsScreen />
      </AccountsProvider>
    </ThemeProvider>
  );
}
