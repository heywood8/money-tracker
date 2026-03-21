import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import LanguageSelectionScreen from './LanguageSelectionScreen';
import SimpleTabs from '../navigation/SimpleTabs';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { performDailyBackupIfNeeded } from '../services/DailyBackupService';
import { useDialog } from '../contexts/DialogContext';
import { checkForAppUpdate } from '../services/AppUpdateService';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';
import { Linking } from 'react-native';

const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_REMINDER_DELAY_DAYS = 3;

/**
 * AppInitializer handles first-time setup and app initialization
 * Shows language selection screen on first launch, then initializes categories
 */
const AppInitializer = () => {
  const { isFirstLaunch, setFirstLaunchComplete, t } = useLocalization();
  const { colors } = useThemeColors();
  const { showDialog } = useDialog();
  const [isInitializing, setIsInitializing] = useState(false);

  // Run once on every app open (after first launch is complete)
  useEffect(() => {
    if (!isFirstLaunch) {
      performDailyBackupIfNeeded();

      const runUpdateCheck = async () => {
        try {
          const now = Date.now();
          const lastCheckIso = await getPreference(PREF_KEYS.UPDATE_LAST_CHECK_AT, null);
          const lastCheckMs = lastCheckIso ? Date.parse(lastCheckIso) : NaN;

          if (Number.isFinite(lastCheckMs) && now - lastCheckMs < AUTO_CHECK_INTERVAL_MS) {
            return;
          }

          await setPreference(PREF_KEYS.UPDATE_LAST_CHECK_AT, new Date(now).toISOString());

          const result = await checkForAppUpdate();
          if (!result.success || !result.isUpdateAvailable) {
            return;
          }

          const skipUntilIso = await getPreference(PREF_KEYS.UPDATE_SKIP_UNTIL, null);
          const skipUntilMs = skipUntilIso ? Date.parse(skipUntilIso) : NaN;
          if (Number.isFinite(skipUntilMs) && skipUntilMs > now) {
            return;
          }

          showDialog(
            t('update_available_title') || 'Update available',
            `${(t('update_available_message') || 'A newer app version ({latestVersion}) is available. Install it from GitHub release APK.')
              .replace('{latestVersion}', result.latestVersion)}\n\n${
              t('update_install_hint')
              || 'If installation is blocked, allow "Install unknown apps" for your browser or file manager in Android settings.'
            }`,
            [
              {
                text: t('later') || 'Later',
                onPress: async () => {
                  const suppressUntil = new Date(
                    Date.now() + UPDATE_REMINDER_DELAY_DAYS * 24 * 60 * 60 * 1000,
                  ).toISOString();
                  await setPreference(PREF_KEYS.UPDATE_SKIP_UNTIL, suppressUntil);
                  await setPreference(PREF_KEYS.UPDATE_LAST_PROMPTED_VERSION, result.latestVersion);
                },
              },
              {
                text: t('update_now') || 'Update now',
                onPress: async () => {
                  await setPreference(PREF_KEYS.UPDATE_LAST_PROMPTED_VERSION, result.latestVersion);
                  await Linking.openURL(result.downloadUrl);
                },
              },
            ],
          );
        } catch (error) {
          console.warn('[AppInitializer] Failed to auto-check updates:', error);
        }
      };

      runUpdateCheck();
    }
  }, [isFirstLaunch, showDialog, t]);

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
