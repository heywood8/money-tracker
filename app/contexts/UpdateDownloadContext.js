import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { backupBeforeUpdate, downloadAndInstallApk, installApk } from '../services/AppUpdateService';
import { canInstallSilently, onLateInstallFailure } from '../services/silentInstaller';
import { supportsInAppUpdates } from '../services/distribution';
import { UPDATE_ERROR, createUpdateError, describeUpdateError } from '../utils/updateErrors';
import { useDialog } from './DialogContext';
import { useLocalization } from './LocalizationContext';

const UpdateDownloadContext = createContext(null);

export function UpdateDownloadProvider({ children }) {
  const { showDialog } = useDialog();
  const { t } = useLocalization();
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [downloadPhase, setDownloadPhase] = useState(null);
  // One download or install at a time: both end in the same installer.
  const isDownloadingRef = useRef(false);

  const showInstallError = useCallback((error) => {
    showDialog(
      t('error') || 'Error',
      describeUpdateError(
        error,
        t,
        'update_install_error',
        'Android could not install the update. Please try again.',
      ),
      [{ text: t('ok') || 'OK' }],
    );
  }, [showDialog, t]);

  // A silent install can fail after it stopped being awaited: once Android showed its own
  // confirmation and the user went ahead, or after the wait for an answer ran out. Nobody else
  // is listening by then, so the failure is shown from here.
  useEffect(() => onLateInstallFailure(showInstallError), [showInstallError]);

  // Installs an APK already in the cache. Every install backs up first: the snapshot belongs to
  // the moment of the install, and a download whose silent install was deferred took none. A
  // silent install then shows "Installing…" while Penny stages the APK, since nothing else is on
  // screen until Android closes the app; the system installer is its own screen.
  //
  // onStarted({ silent }) runs once the install is really going ahead, so a caller can get out of
  // the way without first closing itself for a tap that turns out to be refused.
  const installDownloaded = useCallback(async (localUri, { onError, onStarted } = {}) => {
    const fail = onError || showInstallError;
    // Play delivers updates itself and forbids any other route (see services/distribution).
    if (!supportsInAppUpdates()) return;
    if (isDownloadingRef.current) {
      fail(createUpdateError(UPDATE_ERROR.UPDATE_IN_PROGRESS, 'Another download or install is running'));
      return;
    }
    isDownloadingRef.current = true;
    const silent = canInstallSilently();
    try {
      onStarted?.({ silent });
      setDownloadPhase('backing_up');
      setDownloadProgress(1);
      await backupBeforeUpdate();
      if (silent) {
        setDownloadPhase('installing');
      } else {
        setDownloadProgress(null);
        setDownloadPhase(null);
      }
      await installApk(localUri, { silent });
    } catch (e) {
      console.error(`[AppUpdate] install failed (${e?.code || 'unknown'}):`, e?.message);
      fail(e);
    } finally {
      isDownloadingRef.current = false;
      setDownloadProgress(null);
      setDownloadPhase(null);
    }
  }, [showInstallError]);

  // The download finished somewhere in the background. Installing now would close Penny without
  // a word, so ask; "Later" leaves the APK in the cache, where the update panel offers it again.
  // Asking cannot hold the download open: a dialog dismissed with the back button reports
  // nothing back, and an await on it would never end.
  const offerInstall = useCallback((localUri) => {
    showDialog(
      t('update_ready_title') || 'Update ready',
      t('update_ready_message') || 'The update has been downloaded. Install it now? Penny will close while it installs.',
      [
        { text: t('later') || 'Later', style: 'cancel' },
        { text: t('install') || 'Install', onPress: () => { installDownloaded(localUri); } },
      ],
    );
  }, [showDialog, t, installDownloaded]);

  const startDownload = useCallback(async (downloadUrl, { onError, checksumUrl = null } = {}) => {
    if (isDownloadingRef.current) {
      onError?.(createUpdateError(UPDATE_ERROR.UPDATE_IN_PROGRESS, 'Another download or install is running'));
      return;
    }
    isDownloadingRef.current = true;
    setDownloadPhase('downloading');
    setDownloadProgress(0);
    let deferredUri = null;
    try {
      const result = await downloadAndInstallApk(downloadUrl, setDownloadProgress, {
        checksumUrl,
        deferSilentInstall: true,
        onPhaseChange: (phase) => {
          setDownloadPhase(phase);
          if (phase === 'verifying') setDownloadProgress(0);
        },
      });
      if (result?.installDeferred) deferredUri = result.localUri;
    } catch (e) {
      // The only record of what actually went wrong: the panel that shows the failure has long
      // since closed, and without this line a failed update leaves nothing in the logs between
      // "pre-update backup saved" and silence — which is exactly how the field report of
      // 2026-09-12 had to be diagnosed from the absence of entries.
      console.error(`[AppUpdate] update failed (${e?.code || 'unknown'}):`, e?.message);
      onError?.(e);
    } finally {
      isDownloadingRef.current = false;
      setDownloadProgress(null);
      setDownloadPhase(null);
    }
    if (deferredUri) offerInstall(deferredUri);
  }, [offerInstall]);

  const value = useMemo(() => ({
    downloadProgress,
    downloadPhase,
    isDownloading: downloadProgress !== null,
    startDownload,
    installDownloaded,
  }), [downloadProgress, downloadPhase, startDownload, installDownloaded]);

  return (
    <UpdateDownloadContext.Provider value={value}>
      {children}
    </UpdateDownloadContext.Provider>
  );
}

UpdateDownloadProvider.propTypes = {
  children: PropTypes.node,
};

export function useUpdateDownload() {
  const ctx = useContext(UpdateDownloadContext);
  if (!ctx) throw new Error('useUpdateDownload must be used within UpdateDownloadProvider');
  return ctx;
}
