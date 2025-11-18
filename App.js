import React from 'react';
import SimpleTabs from './app/SimpleTabs';
import { ThemeProvider } from './app/ThemeContext';
import { AccountsProvider } from './app/AccountsContext';
import { CategoriesProvider } from './app/CategoriesContext';
import { LocalizationProvider } from './app/LocalizationContext';
import ErrorBoundary from './app/ErrorBoundary';
import { StatusBar, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
    <ErrorBoundary>
      <SafeAreaProvider>
        <LocalizationProvider>
          <ThemeProvider>
            <AccountsProvider>
              <CategoriesProvider>
                <ThemedStatusBar />
                <SimpleTabs />
              </CategoriesProvider>
            </AccountsProvider>
          </ThemeProvider>
        </LocalizationProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
