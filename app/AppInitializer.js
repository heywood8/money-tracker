import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalization } from './LocalizationContext';
import LanguageSelectionScreen from './LanguageSelectionScreen';
import SimpleTabs from './SimpleTabs';
import { useTheme } from './ThemeContext';
import { initializeWidgets, setupWidgetTaskHandler } from './widgets/registerWidgets';
import { initializeWidgetEventListeners, cleanupWidgetEventListeners } from './services/widgetEventListener';
import { updateWidgets } from './hooks/useWidgetUpdate';

/**
 * AppInitializer handles first-time setup and app initialization
 * Shows language selection screen on first launch, then initializes categories
 */
const AppInitializer = () => {
  const { isFirstLaunch, setFirstLaunchComplete, language } = useLocalization();
  const { colors } = useTheme();
  const [isInitializing, setIsInitializing] = useState(false);

  // Initialize widgets on app startup
  useEffect(() => {
    const initWidgets = async () => {
      try {
        initializeWidgets();
        setupWidgetTaskHandler();
        initializeWidgetEventListeners();

        // Initial widget data update
        console.log('Performing initial widget data update...');
        await updateWidgets();
        console.log('Initial widget data update complete');
      } catch (error) {
        console.log('Widget initialization skipped:', error.message);
      }
    };

    initWidgets();

    // Cleanup on unmount
    return () => {
      try {
        cleanupWidgetEventListeners();
      } catch (error) {
        console.log('Widget cleanup skipped:', error.message);
      }
    };
  }, []);

  const handleLanguageSelected = async (selectedLanguage) => {
    try {
      setIsInitializing(true);

      // Set the language preference (this marks first launch as complete)
      // This will trigger CategoriesContext to automatically initialize categories
      await setFirstLaunchComplete(selectedLanguage);

      // Initialization complete, will automatically show main app
    } catch (error) {
      console.error('Failed to initialize app with selected language:', error);
    } finally {
      setIsInitializing(false);
    }
  };

  // If showing language selection or initializing, don't show main app yet
  if (isFirstLaunch) {
    if (isInitializing) {
      return (
        <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    return <LanguageSelectionScreen onLanguageSelected={handleLanguageSelected} />;
  }

  // Normal app flow - not first launch
  return <SimpleTabs />;
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AppInitializer;
