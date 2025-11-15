
import React from 'react';
import AccountsScreen from './AccountsScreen';
import { ThemeProvider, useTheme } from './ThemeContext';
import { StatusBar, Platform } from 'react-native';

function ThemedStatusBar() {
  const { colorScheme, colors } = useTheme();
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
      <ThemedStatusBar />
      <AccountsScreen />
    </ThemeProvider>
  );
}
