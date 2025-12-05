import React from 'react';
import AppInitializer from './app/screens/AppInitializer';
import { ThemeProvider } from './app/contexts/ThemeContext';
import { AccountsProvider } from './app/contexts/AccountsContext';
import { CategoriesProvider } from './app/contexts/CategoriesContext';
import { OperationsProvider } from './app/contexts/OperationsContext';
import { BudgetsProvider } from './app/contexts/BudgetsContext';
import { LocalizationProvider } from './app/contexts/LocalizationContext';
import { DialogProvider } from './app/contexts/DialogContext';
import ErrorBoundary from './app/components/ErrorBoundary';
import { StatusBar, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { useMaterialTheme } from './app/hooks/useMaterialTheme';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://f06a0b39f8c767ce0baa256f79dabe5b@o4510430127980544.ingest.de.sentry.io/4510430145740880',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

function ThemedStatusBar() {
  const { colorScheme, colors } = require('./app/contexts/ThemeContext').useTheme();
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
      <AppInitializer />
    </PaperProvider>
  );
}

export default Sentry.wrap(function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <LocalizationProvider>
            <ThemeProvider>
              <DialogProvider>
                <AccountsProvider>
                  <CategoriesProvider>
                    <OperationsProvider>
                      <BudgetsProvider>
                        <AppContent />
                      </BudgetsProvider>
                    </OperationsProvider>
                  </CategoriesProvider>
                </AccountsProvider>
              </DialogProvider>
            </ThemeProvider>
          </LocalizationProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
});