import React from 'react';
import SimpleTabs from './app/SimpleTabs';
import { ThemeProvider } from './app/ThemeContext';
import { AccountsProvider } from './app/AccountsContext';
import { CategoriesProvider } from './app/CategoriesContext';
import { OperationsProvider } from './app/OperationsContext';
import { LocalizationProvider } from './app/LocalizationContext';
import ErrorBoundary from './app/ErrorBoundary';
import { StatusBar, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { useMaterialTheme } from './app/useMaterialTheme';

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

function AppContent() {
  const paperTheme = useMaterialTheme();

  return (
    <PaperProvider theme={paperTheme}>
      <ThemedStatusBar />
      <SimpleTabs />
    </PaperProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <LocalizationProvider>
            <ThemeProvider>
              <AccountsProvider>
                <CategoriesProvider>
                  <OperationsProvider>
                    <AppContent />
                  </OperationsProvider>
                </CategoriesProvider>
              </AccountsProvider>
            </ThemeProvider>
          </LocalizationProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
