import React, { useState, useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useDialog } from '../../contexts/DialogContext';
import { useUpdateDownload } from '../../contexts/UpdateDownloadContext';
import {
  checkForAppUpdate,
  listDownloadedApks,
  installApk,
  verifyCachedApk,
} from '../../services/AppUpdateService';
import { setPreference, PREF_KEYS } from '../../services/PreferencesDB';
import UpdateContentPanel from '../UpdateContentPanel';

// How often to re-poll CI build progress while the panel shows an in-progress build.
const BUILD_PROGRESS_POLL_MS = 5000;

// The update subpanel. Its content is UpdateContentPanel; what lives here is the
// check itself — running it, polling a release that is still building, and
// handing a chosen download off to the app-wide downloader.
//
// The check starts when the panel mounts rather than when the settings row is
// tapped, so opening the panel and looking for an update are the same act.
export default function UpdatePanel({ onRegisterTitle, onDone, bottomInset }) {
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { startDownload } = useUpdateDownload();

  const [updateResult, setUpdateResult] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [downloadedApks, setDownloadedApks] = useState([]);

  // The header says what the panel found, which no step name can express.
  useEffect(() => {
    const title = !isChecking && updateResult?.type === 'available'
      ? (t('update_available_title') || 'Update available')
      : (t('check_updates') || 'Check for updates');
    onRegisterTitle(title);
    return () => onRegisterTitle(null);
  }, [isChecking, updateResult, onRegisterTitle, t]);

  const loadDownloadedApks = useCallback(async () => {
    const apks = await listDownloadedApks();
    setDownloadedApks(apks);
  }, []);

  const handleInstallApk = useCallback(async (uri) => {
    try {
      await installApk(uri);
    } catch (error) {
      console.error('Failed to install APK:', error);
      showDialog(
        t('error') || 'Error',
        t('update_download_failed') || 'Could not install the APK. The file may have been removed.',
        [{ text: t('ok') || 'OK' }],
      );
    }
  }, [showDialog, t]);

  const runUpdateCheck = useCallback(async ({ silent = false } = {}) => {
    // A silent re-check (used by the build-progress poller) keeps the current panel content
    // in place and skips the loading spinner, so the build percentage updates without flicker.
    if (!silent) {
      setUpdateResult(null);
      setIsChecking(true);
    }
    loadDownloadedApks();
    try {
      const result = await checkForAppUpdate();
      await setPreference(PREF_KEYS.UPDATE_LAST_CHECK_AT, new Date().toISOString());

      if (!result.success) {
        setUpdateResult({
          type: 'error',
          errorCode: result.errorCode,
          currentVersion: result.currentVersion,
          releaseNotes: result.releaseNotes || null,
          recentReleaseNotes: result.recentReleaseNotes || null,
          releasesUrl: result.releasesUrl || null,
          buildProgress: result.buildProgress || null,
        });
      } else if (!result.isUpdateAvailable) {
        setUpdateResult({
          type: 'up_to_date',
          currentVersion: result.currentVersion,
          recentReleaseNotes: result.recentReleaseNotes || null,
          releasesUrl: result.releasesUrl || null,
        });
      } else {
        // Verify any cached APK against the release checksum. A corrupt leftover download is
        // deleted here so we offer a fresh "Update now" (re-download) instead of an "Install now"
        // that would launch a broken installer.
        const cached = await verifyCachedApk(result.downloadUrl, { checksumUrl: result.checksumUrl });
        // Re-scan the cache so the per-release install buttons reflect reality: a corrupt file just
        // deleted by verifyCachedApk drops out, and a freshly verified one shows as installable.
        await loadDownloadedApks();
        setUpdateResult({
          type: 'available',
          latestVersion: result.latestVersion,
          currentVersion: result.currentVersion,
          downloadUrl: result.downloadUrl,
          checksumUrl: result.checksumUrl || null,
          releaseNotes: result.releaseNotes || null,
          recentReleaseNotes: result.recentReleaseNotes || null,
          releasesUrl: result.releasesUrl || null,
          alreadyDownloaded: cached.exists,
          localUri: cached.exists ? cached.uri : null,
          previousDownloadCorrupted: !!cached.corrupted,
        });
      }
    } catch (error) {
      if (!silent) setUpdateResult({ type: 'error', errorCode: null });
    } finally {
      if (!silent) setIsChecking(false);
    }
  }, [loadDownloadedApks]);

  // Check as soon as the panel opens. The ref keeps this to one run even though
  // runUpdateCheck is recreated whenever its own dependencies change.
  const checkOnOpen = useRef(runUpdateCheck);
  checkOnOpen.current = runUpdateCheck;
  useEffect(() => { checkOnOpen.current(); }, []);

  // While a release is still waiting on its CI build, poll the build progress so the
  // "Building N%" chip advances and flips to "Update now" once the APK is published.
  // Polling stops as soon as the build finishes — or as soon as the panel closes,
  // because the panel closing is this effect unmounting.
  useEffect(() => {
    const buildInProgress = updateResult?.errorCode === 'releases_without_apks'
      && !!updateResult?.buildProgress;
    if (!buildInProgress) return undefined;
    const intervalId = setInterval(() => {
      runUpdateCheck({ silent: true });
    }, BUILD_PROGRESS_POLL_MS);
    return () => clearInterval(intervalId);
  }, [updateResult, runUpdateCheck]);

  const handleUpdate = useCallback(async (downloadUrl, checksumUrl, version) => {
    // Record the version actually chosen so the startup reminder doesn't re-nag for it. The
    // per-release buttons pass their own version; fall back to the highlighted candidate.
    const promptedVersion = version || updateResult?.latestVersion;
    if (promptedVersion) {
      await setPreference(PREF_KEYS.UPDATE_LAST_PROMPTED_VERSION, promptedVersion);
    }
    // The download continues app-wide, reported on the settings row, so the panel
    // has nothing left to show.
    onDone();
    startDownload(downloadUrl, {
      checksumUrl: checksumUrl || null,
      onError: () => {
        showDialog(
          t('error') || 'Error',
          t('update_download_failed') || 'Could not download the update. Please try again.',
          [{ text: t('ok') || 'OK' }],
        );
      },
    });
  }, [updateResult, onDone, startDownload, showDialog, t]);

  return (
    <View style={styles.fill}>
      <UpdateContentPanel
        isChecking={isChecking}
        updateResult={updateResult}
        downloadedApks={downloadedApks}
        onUpdate={handleUpdate}
        onInstallApk={handleInstallApk}
        onRefresh={runUpdateCheck}
        bottomInset={bottomInset}
      />
    </View>
  );
}

UpdatePanel.propTypes = {
  // Offers the host a header title, since what the check found is not something
  // the step name can say.
  onRegisterTitle: PropTypes.func.isRequired,
  // Close the subpanel — the download takes over from the settings row.
  onDone: PropTypes.func.isRequired,
  bottomInset: PropTypes.number,
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
