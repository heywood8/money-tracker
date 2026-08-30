import { logService } from './app/services/LogService';
logService.install();
import { initSentry, Sentry } from './app/services/sentry';
initSentry();
import * as SplashScreen from 'expo-splash-screen';
SplashScreen.preventAutoHideAsync().catch(() => {});
import React from 'react';
import PropTypes from 'prop-types';
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
import { DriveBackupProvider } from './app/contexts/DriveBackupContext';
import DriveBackupStatusBanner from './app/components/DriveBackupStatusBanner';
import { AppBlurProvider, useAppBlurState } from './app/contexts/AppBlurContext';
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

// The only subscriber to the blur count, deliberately: a modal opening or
// closing re-renders this wrapper and nothing else. `children` arrives as an
// element built by AppContent (which does not subscribe), so its reference is
// unchanged and React skips the whole app subtree — otherwise applying and
// removing the blur dragged a full re-render of the tree along with it, and the
// blur visibly outlived the modal that asked for it.
function BlurHost({ hostRef, children }) {
  const blurCount = useAppBlurState();

  return (
    <View
      ref={hostRef}
      collapsable={false}
      style={[styles.container, blurCount > 0 && styles.blurred]}
    >
      {children}
    </View>
  );
}

BlurHost.propTypes = {
  hostRef: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
  children: PropTypes.node,
};

function AppContent() {
  const paperTheme = useMaterialTheme();
  const { hostRef } = useOverlayHost();

  // The content view and the overlay outlet are siblings filling the same parent, so
  // they share an origin: anything measured against `hostRef` can be positioned in the
  // outlet with no coordinate translation. Overlays sit outside the blurred view on
  // purpose — the blur is for what's behind them (see OverlayHostContext).
  return (
    <PaperProvider theme={paperTheme}>
      <View style={styles.container}>
        <BlurHost hostRef={hostRef}>
          <ThemedStatusBar />
          <AppInitializer />
          <ImportProgressModal />
          <DriveBackupStatusBanner />
        </BlurHost>
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
                            <DriveBackupProvider>
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
                            </DriveBackupProvider>
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