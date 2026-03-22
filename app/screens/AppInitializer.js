import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import LanguageSelectionScreen from './LanguageSelectionScreen';
import SimpleTabs from '../navigation/SimpleTabs';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { performDailyBackupIfNeeded } from '../services/DailyBackupService';
import { useDialog } from '../contexts/DialogContext';
import { checkForAppUpdate, downloadAndInstallApk } from '../services/AppUpdateService';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';
import { Portal, Modal, ProgressBar, Text } from 'react-native-paper';

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
  const [apkDownloadProgress, setApkDownloadProgress] = useState(null);

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
                  setApkDownloadProgress(0);
                  try {
                    await downloadAndInstallApk(result.downloadUrl, setApkDownloadProgress);
                  } catch (e) {
                    showDialog(
                      t('error') || 'Error',
                      t('update_download_failed') || 'Could not download the update. Please try again.',
                      [{ text: t('ok') || 'OK' }],
                    );
                  } finally {
                    setApkDownloadProgress(null);
                  }
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
  return (
    <>
      <SimpleTabs />
      {apkDownloadProgress !== null && (
        <Portal>
          <Modal
            visible
            dismissable={false}
            contentContainerStyle={[styles.downloadModal, { backgroundColor: colors.card }]}
          >
            <Text variant="bodyLarge" style={[styles.downloadTitle, { color: colors.text }]}>
              {t('downloading_update') || 'Downloading update...'}
            </Text>
            <ProgressBar
              progress={apkDownloadProgress}
              color={colors.primary}
              style={styles.downloadProgressBar}
            />
            <Text variant="bodySmall" style={[styles.downloadPercent, { color: colors.mutedText }]}>
              {`${Math.round(apkDownloadProgress * 100)}%`}
            </Text>
          </Modal>
        </Portal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  downloadModal: {
    alignItems: 'center',
    borderRadius: 12,
    margin: 40,
    padding: 24,
  },
  downloadPercent: {
    marginTop: 8,
  },
  downloadProgressBar: {
    borderRadius: 4,
    height: 8,
    marginTop: 16,
    width: '100%',
  },
  downloadTitle: {
    marginBottom: 4,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});

export default AppInitializer;
