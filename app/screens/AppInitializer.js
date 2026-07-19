import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, AppState } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import { processBankNotifications } from '../services/notifications/processBankNotifications';
import LanguageSelectionScreen from './LanguageSelectionScreen';
import SimpleTabs from '../navigation/SimpleTabs';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { performDailyBackupIfNeeded } from '../services/DailyBackupService';
import { useDialog } from '../contexts/DialogContext';
import { checkForAppUpdate } from '../services/AppUpdateService';
import { useUpdateDownload } from '../contexts/UpdateDownloadContext';
import { useSqliteFileImport } from '../hooks/useSqliteFileImport';
import useNotificationResponseRouter from '../hooks/useNotificationResponseRouter';
import { syncBackgroundBankTaskRegistrationAsync } from '../services/notifications/backgroundBankTask';
import { useAppBlur } from '../contexts/AppBlurContext';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';
import UpdateAvailableModal from '../modals/UpdateAvailableModal';

// Poll for a newer release this often while the app is open and in the foreground.
const UPDATE_CHECK_INTERVAL_MS = 60 * 1000;

// How long "Later" silences a specific version across app restarts. A newer version
// bypasses the snooze; the same version stays quiet until this window elapses.
const UPDATE_SNOOZE_MS = 24 * 60 * 60 * 1000;

/**
 * AppInitializer handles first-time setup and app initialization
 * Shows language selection screen on first launch, then initializes categories
 */
const AppInitializer = () => {
  const { isFirstLaunch, isLoading, setFirstLaunchComplete, t } = useLocalization();
  const { colors } = useThemeColors();
  const { showDialog } = useDialog();
  const { startDownload, isDownloading } = useUpdateDownload();
  const { blurCount } = useAppBlur();
  const [isInitializing, setIsInitializing] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState(null);

  // Versions the user has already dealt with this session (dismissed or chose to install).
  // Held in a ref for the session; "Later" additionally persists a time-boxed snooze
  // (persistedSnoozeRef) so the same version stays quiet across app restarts.
  const dismissedVersionsRef = useRef(new Set());
  // Persisted "remind me later" state loaded on mount: { version, skipUntil (ISO) }.
  // A prompt is suppressed while the latest version matches and now < skipUntil.
  const persistedSnoozeRef = useRef({ version: null, skipUntil: null });
  // Resolves once the persisted snooze has been read. runUpdateCheck awaits this before
  // deciding to prompt, so the very first (cold-start) check can't re-nag a deferred version
  // by racing ahead of the DB read.
  const snoozeLoadedRef = useRef(null);
  // Latest-value mirrors read inside the long-lived interval callback, so its closure
  // never acts on stale state.
  const pendingUpdateRef = useRef(null);
  const isDownloadingRef = useRef(false);
  const isCheckingRef = useRef(false);
  // Whether any blur-backed modal (operation editor, pickers, dialogs) is open. The update
  // prompt must not pop over an in-progress task, so we hold off while this is set.
  const blurCountRef = useRef(0);

  useEffect(() => {
    pendingUpdateRef.current = pendingUpdate;
  }, [pendingUpdate]);

  useEffect(() => {
    isDownloadingRef.current = isDownloading;
  }, [isDownloading]);

  useEffect(() => {
    blurCountRef.current = blurCount;
  }, [blurCount]);

  // Load the persisted "Later" snooze once so a restart within the snooze window doesn't
  // re-nag for a version the user already deferred.
  useEffect(() => {
    let cancelled = false;
    snoozeLoadedRef.current = (async () => {
      try {
        const [version, skipUntil] = await Promise.all([
          getPreference(PREF_KEYS.UPDATE_LAST_PROMPTED_VERSION),
          getPreference(PREF_KEYS.UPDATE_SKIP_UNTIL),
        ]);
        if (!cancelled) {
          persistedSnoozeRef.current = { version: version || null, skipUntil: skipUntil || null };
        }
      } catch (error) {
        console.warn('[AppInitializer] Failed to load update snooze:', error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Handle SQLite/backup files opened with the app (Android ACTION_VIEW).
  // Disabled during first launch so the import warning doesn't appear before
  // the user has finished initial language setup.
  useSqliteFileImport({ enabled: !isFirstLaunch });

  // Deep-link a tapped "transactions to review" notification into the
  // notification-processing screen (handles both cold-start and warm taps).
  useNotificationResponseRouter();

  // Run the daily backup once on every app open (after first launch is complete).
  useEffect(() => {
    if (!isFirstLaunch) {
      performDailyBackupIfNeeded();
    }
  }, [isFirstLaunch]);

  // Poll for app updates every minute while the app is open, regardless of which screen
  // the user is viewing. When a newer release is found we surface the update dialog. A
  // version the user dismisses is silenced for the rest of the session (handleUpdateDismiss),
  // while re-checks keep running so a still-newer release can prompt again.
  useEffect(() => {
    if (isFirstLaunch) {
      return undefined;
    }

    let cancelled = false;

    const runUpdateCheck = async () => {
      // Never stack work or prompts, and never pop over an open task: skip while a check is
      // already running, a download is in progress, the update dialog is already on screen,
      // or a blur-backed modal (operation editor, picker, dialog) is open.
      if (isCheckingRef.current || isDownloadingRef.current || pendingUpdateRef.current || blurCountRef.current > 0) {
        return;
      }
      isCheckingRef.current = true;
      try {
        const result = await checkForAppUpdate();
        if (cancelled || !result.success || !result.isUpdateAvailable) {
          return;
        }
        // The user already dealt with this version this session — stay quiet until restart.
        if (dismissedVersionsRef.current.has(result.latestVersion)) {
          return;
        }
        // Make sure the persisted snooze has been read before deciding — otherwise the first
        // cold-start check could race ahead of the DB read and re-nag a deferred version.
        if (snoozeLoadedRef.current) {
          await snoozeLoadedRef.current;
          if (cancelled) return;
        }
        // Respect a persisted "Later": same version still inside its snooze window stays quiet
        // even across restarts. A newer version has a different value and prompts as usual.
        const snooze = persistedSnoozeRef.current;
        if (snooze.version === result.latestVersion && snooze.skipUntil
          && new Date().toISOString() < snooze.skipUntil) {
          return;
        }
        // Guard again: state may have changed while the network request was in flight.
        if (pendingUpdateRef.current || isDownloadingRef.current || blurCountRef.current > 0) {
          return;
        }
        setPendingUpdate({
          latestVersion: result.latestVersion,
          currentVersion: result.currentVersion,
          downloadUrl: result.downloadUrl,
          checksumUrl: result.checksumUrl || null,
          releaseNotes: result.releaseNotes || null,
        });
      } catch (error) {
        console.warn('[AppInitializer] Failed to auto-check updates:', error);
      } finally {
        isCheckingRef.current = false;
      }
    };

    // Check immediately on open, then once a minute.
    runUpdateCheck();
    const intervalId = setInterval(runUpdateCheck, UPDATE_CHECK_INTERVAL_MS);

    // Re-check the moment the app returns to the foreground, so a user coming back to an
    // open screen sees a current result without waiting for the next interval tick.
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        runUpdateCheck();
      }
    });

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [isFirstLaunch]);

  // Process any bank notifications captured while the app was backgrounded.
  // Runs once on open and again whenever the app returns to the foreground.
  // The pipeline is a no-op when the feature is disabled and skips already-seen
  // notifications, so calling it eagerly is safe.
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    if (isFirstLaunch) return undefined;

    const runIngestion = () => {
      processBankNotifications().catch((error) => {
        console.warn('[AppInitializer] Bank notification processing failed:', error);
      });
    };

    runIngestion();

    const subscription = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState === 'active' && prev && prev.match(/inactive|background/)) {
        runIngestion();
      }
    });

    return () => subscription.remove();
  }, [isFirstLaunch]);

  // Keep the OS background-task registration in sync with the stored preferences
  // on every app open, so it survives reinstalls/updates and reflects toggles
  // made in a previous session.
  useEffect(() => {
    if (isFirstLaunch) return;
    syncBackgroundBankTaskRegistrationAsync().catch((error) => {
      console.warn('[AppInitializer] Background task sync failed:', error);
    });
  }, [isFirstLaunch]);

  const handleUpdateDismiss = useCallback(() => {
    // "Later" silences this version for the session and, persisted, across restarts for
    // UPDATE_SNOOZE_MS. A newer release still prompts because it carries a different version.
    const version = pendingUpdate?.latestVersion;
    if (version) {
      dismissedVersionsRef.current.add(version);
      const skipUntil = new Date(Date.now() + UPDATE_SNOOZE_MS).toISOString();
      persistedSnoozeRef.current = { version, skipUntil };
      setPreference(PREF_KEYS.UPDATE_LAST_PROMPTED_VERSION, version).catch((error) => {
        console.warn('[AppInitializer] Failed to persist update snooze:', error);
      });
      setPreference(PREF_KEYS.UPDATE_SKIP_UNTIL, skipUntil).catch(() => {});
    }
    setPendingUpdate(null);
  }, [pendingUpdate]);

  const handleUpdateNow = useCallback((downloadUrl) => {
    // Treat "update now" as resolving this version too, so we don't re-prompt for it this
    // session (e.g. if the user backs out of the Android package installer).
    if (pendingUpdate?.latestVersion) {
      dismissedVersionsRef.current.add(pendingUpdate.latestVersion);
    }
    const checksumUrl = pendingUpdate?.checksumUrl || null;
    setPendingUpdate(null);
    startDownload(downloadUrl, {
      checksumUrl,
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

  // While the stored language preference is still loading, render nothing so the
  // native splash screen stays up. This avoids briefly flashing the language
  // selection (welcome) screen before we know whether this is truly a first
  // launch — isFirstLaunch defaults to true until the preference is read.
  if (isLoading) {
    return null;
  }

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
