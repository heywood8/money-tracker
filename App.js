import { logService } from './app/services/LogService';
logService.install();
import { initSentry, Sentry } from './app/services/sentry';
initSentry();
import * as SplashScreen from 'expo-splash-screen';
SplashScreen.preventAutoHideAsync().catch(() => {});
import React from 'react';
import AppInitializer from './app/screens/AppInitializer';
import { ThemeConfigProvider } from './app/contexts/ThemeConfigContext';
import { ThemeColorsProvider } from './app/contexts/ThemeColorsContext';
import { AccountsDataProvider } from './app/contexts/AccountsDataContext';
import { AccountsActionsProvider } from './app/contexts/AccountsActionsContext';
import { CategoriesProvider } from './app/contexts/CategoriesContext';
import { OperationsDataProvider } from './app/contexts/OperationsDataContext';
import { OperationsActionsProvider } from './app/contexts/OperationsActionsContext';
import { BudgetsProvider } from './app/contexts/BudgetsContext';
import { BudgetPlansProvider } from './app/contexts/BudgetPlansContext';
import { LocalizationProvider } from './app/contexts/LocalizationContext';
import { DialogProvider } from './app/contexts/DialogContext';
import { ImportProgressProvider } from './app/contexts/ImportProgressContext';
import { UpdateDownloadProvider } from './app/contexts/UpdateDownloadContext';
import { AppBlurProvider, useAppBlur } from './app/contexts/AppBlurContext';
import { OverlayHostProvider, OverlayOutlet, useOverlayHost } from './app/contexts/OverlayHostContext';
import { DisplaySettingsProvider } from './app/contexts/DisplaySettingsContext';
import { SearchProvider } from './app/contexts/SearchContext';
import ErrorBoundary from './app/components/ErrorBoundary';
import ImportProgressModal from './app/modals/ImportProgressModal';
import { StatusBar, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { useMaterialTheme } from './app/hooks/useMaterialTheme';

function ThemedStatusBar() {
  const { colorScheme } = require('./app/contexts/ThemeConfigContext').useThemeConfig();
  const { colors } = require('./app/contexts/ThemeColorsContext').useThemeColors();
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
  const { blurCount } = useAppBlur();
  const { hostRef } = useOverlayHost();

  // The content view and the overlay outlet are siblings filling the same parent, so
  // they share an origin: anything measured against `hostRef` can be positioned in the
  // outlet with no coordinate translation. Overlays sit outside the blurred view on
  // purpose — the blur is for what's behind them (see OverlayHostContext).
  return (
    <PaperProvider theme={paperTheme}>
      <View style={styles.container}>
        <View
          ref={hostRef}
          collapsable={false}
          style={[styles.container, blurCount > 0 && styles.blurred]}
        >
          <ThemedStatusBar />
          <AppInitializer />
          <ImportProgressModal />
        </View>
        <OverlayOutlet />
      </View>
    </PaperProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaProvider>
          <LocalizationProvider>
            <ThemeConfigProvider>
              <DisplaySettingsProvider>
                <ThemeColorsProvider>
                  <AppBlurProvider>
                    <OverlayHostProvider>
                      <SearchProvider>
                        <DialogProvider>
                          <UpdateDownloadProvider>
                            <ImportProgressProvider>
                              <AccountsDataProvider>
                                <AccountsActionsProvider>
                                  <CategoriesProvider>
                                    <OperationsDataProvider>
                                      <OperationsActionsProvider>
                                        <BudgetsProvider>
                                          <BudgetPlansProvider>
                                            <AppContent />
                                          </BudgetPlansProvider>
                                        </BudgetsProvider>
                                      </OperationsActionsProvider>
                                    </OperationsDataProvider>
                                  </CategoriesProvider>
                                </AccountsActionsProvider>
                              </AccountsDataProvider>
                            </ImportProgressProvider>
                          </UpdateDownloadProvider>
                        </DialogProvider>
                      </SearchProvider>
                    </OverlayHostProvider>
                  </AppBlurProvider>
                </ThemeColorsProvider>
              </DisplaySettingsProvider>
            </ThemeConfigProvider>
          </LocalizationProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(App);

const styles = StyleSheet.create({
  blurred: {
    filter: [{ blur: 10 }],
  },
  container: {
    flex: 1,
  },
});