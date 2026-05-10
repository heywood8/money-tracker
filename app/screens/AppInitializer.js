import React, { useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import LanguageSelectionScreen from './LanguageSelectionScreen';
import SimpleTabs from '../navigation/SimpleTabs';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { performDailyBackupIfNeeded } from '../services/DailyBackupService';
import { useDialog } from '../contexts/DialogContext';
import { checkForAppUpdate } from '../services/AppUpdateService';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';
import { useUpdateDownload } from '../contexts/UpdateDownloadContext';
import UpdateAvailableModal from '../modals/UpdateAvailableModal';

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
  const { startDownload } = useUpdateDownload();
  const [isInitializing, setIsInitializing] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState(null);

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

          setPendingUpdate({
            latestVersion: result.latestVersion,
            currentVersion: result.currentVersion,
            downloadUrl: result.downloadUrl,
            releaseNotes: result.releaseNotes || null,
          });
        } catch (error) {
          console.warn('[AppInitializer] Failed to auto-check updates:', error);
        }
      };

      runUpdateCheck();
    }
  }, [isFirstLaunch]);

  const handleUpdateDismiss = useCallback(async () => {
    if (pendingUpdate) {
      const suppressUntil = new Date(
        Date.now() + UPDATE_REMINDER_DELAY_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      await setPreference(PREF_KEYS.UPDATE_SKIP_UNTIL, suppressUntil);
      await setPreference(PREF_KEYS.UPDATE_LAST_PROMPTED_VERSION, pendingUpdate.latestVersion);
    }
    setPendingUpdate(null);
  }, [pendingUpdate]);

  const handleUpdateNow = useCallback(async (downloadUrl) => {
    if (pendingUpdate) {
      await setPreference(PREF_KEYS.UPDATE_LAST_PROMPTED_VERSION, pendingUpdate.latestVersion);
    }
    setPendingUpdate(null);
    startDownload(downloadUrl, {
      onError: () => {
        showDialog(
          t('error') || 'Error',
          t('update_download_failed') || 'Could not download the update. Please try again.',
          [{ text: t('ok') || 'OK' }],
        );
      },
    });
  }, [pendingUpdate, startDownload, showDialog, t]);

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
  return (
    <>
      <SimpleTabs />
      <UpdateAvailableModal
        visible={!!pendingUpdate}
        onDismiss={handleUpdateDismiss}
        onUpdate={handleUpdateNow}
        updateData={pendingUpdate}
      />
    </>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});

export default AppInitializer;
