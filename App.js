import { logService } from './app/services/LogService';
logService.install();
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
import { PlannedOperationsProvider } from './app/contexts/PlannedOperationsContext';
import { LocalizationProvider } from './app/contexts/LocalizationContext';
import { DialogProvider } from './app/contexts/DialogContext';
import { ImportProgressProvider } from './app/contexts/ImportProgressContext';
import { AppBlurProvider, useAppBlur } from './app/contexts/AppBlurContext';
import { DisplaySettingsProvider } from './app/contexts/DisplaySettingsContext';
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

  return (
    <View style={[styles.container, blurCount > 0 && styles.blurred]}>
      <PaperProvider theme={paperTheme}>
        <ThemedStatusBar />
        <AppInitializer />
        <ImportProgressModal />
      </PaperProvider>
    </View>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaProvider>
          <LocalizationProvider>
            <ThemeConfigProvider>
              <DisplaySettingsProvider>
              <ThemeColorsProvider>
                <AppBlurProvider>
                  <DialogProvider>
                    <ImportProgressProvider>
                      <AccountsDataProvider>
                        <AccountsActionsProvider>
                          <CategoriesProvider>
                            <OperationsDataProvider>
                              <OperationsActionsProvider>
                                <BudgetsProvider>
                                  <PlannedOperationsProvider>
                                    <AppContent />
                                  </PlannedOperationsProvider>
                                </BudgetsProvider>
                              </OperationsActionsProvider>
                            </OperationsDataProvider>
                          </CategoriesProvider>
                        </AccountsActionsProvider>
                      </AccountsDataProvider>
                    </ImportProgressProvider>
                  </DialogProvider>
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

const styles = StyleSheet.create({
  blurred: {
    filter: [{ blur: 10 }],
  },
  container: {
    flex: 1,
  },
});