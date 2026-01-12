import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import LanguageSelectionScreen from './LanguageSelectionScreen';
import SimpleTabs from '../navigation/SimpleTabs';
import { useThemeColors } from '../contexts/ThemeColorsContext';

/**
 * AppInitializer handles first-time setup and app initialization
 * Shows language selection screen on first launch, then initializes categories
 */
const AppInitializer = () => {
  const { isFirstLaunch, setFirstLaunchComplete, language } = useLocalization();
  const { colors } = useThemeColors();
  const [isInitializing, setIsInitializing] = useState(false);

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
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});

export default AppInitializer;
