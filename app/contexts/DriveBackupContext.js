import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { getValidAccessToken, signIn as googleSignIn } from '../services/GoogleSheetsService';
import {
  performDriveBackup,
  getLastDriveBackupResult,
  DRIVE_BACKUP_PROGRESS_EVENT,
} from '../services/GoogleDriveBackupService';
import { appEvents } from '../services/eventEmitter';

const DriveBackupContext = createContext(null);

/**
 * Live state of the Google Drive backup.
 *
 * The upload is not something the user waits on — it is started and then runs
 * alongside whatever they do next — so its state cannot live inside the settings
 * panel that started it: closing the panel would take the only indication that
 * anything is happening with it. It lives here so the header can show a status
 * while a run is in flight, wherever the user has navigated to.
 *
 * The provider listens for the service's progress events rather than being
 * called by it, so a run started at app launch (before any of this is mounted)
 * is reported exactly like one started from the button.
 */
export function DriveBackupProvider({ children }) {
  const [progress, setProgress] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getLastDriveBackupResult().then((result) => {
      if (!cancelled) setLastResult(result);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const unsubscribe = appEvents.on(DRIVE_BACKUP_PROGRESS_EVENT, (payload) => {
      const terminal = payload.phase === 'done'
        || payload.phase === 'error'
        || payload.phase === 'skipped';
      setProgress(terminal ? null : payload);
      if (terminal) {
        // The service has already persisted the outcome by the time it emits, so
        // re-reading it keeps one source of truth for what the status line shows.
        getLastDriveBackupResult().then(setLastResult);
      }
    });
    return unsubscribe;
  }, []);

  /**
   * Start a backup. Resolves when the run finishes, but nothing in the UI has to
   * await it — the progress event drives the indicator either way.
   *
   * `interactive` decides what happens when there is no usable Google session: a
   * manual run may open the sign-in sheet, a scheduled one must never interrupt
   * the user with it and simply does not run.
   */
  // Overlapping runs are refused by the service itself, which is the only guard
  // that also covers the run started at app launch, before this provider exists.
  const startBackup = useCallback(async ({ mode = 'manual', interactive = true } = {}) => {
    return performDriveBackup({
      mode,
      getAccessToken: async () => {
        try {
          return await getValidAccessToken();
        } catch (error) {
          // A revoked session ('refresh_failed') is exactly the case signing in
          // again fixes, so an interactive run offers that rather than showing
          // the user an error code they can only clear by toggling the feature
          // off and on. A scheduled run never opens the sheet.
          if (!interactive) throw error;
          return googleSignIn();
        }
      },
    });
  }, []);

  const value = useMemo(() => ({
    progress,
    isRunning: progress !== null,
    lastResult,
    startBackup,
    refreshLastResult: () => getLastDriveBackupResult().then(setLastResult),
  }), [progress, lastResult, startBackup]);

  return (
    <DriveBackupContext.Provider value={value}>
      {children}
    </DriveBackupContext.Provider>
  );
}

DriveBackupProvider.propTypes = {
  children: PropTypes.node,
};

export function useDriveBackup() {
  const ctx = useContext(DriveBackupContext);
  if (!ctx) throw new Error('useDriveBackup must be used within DriveBackupProvider');
  return ctx;
}
