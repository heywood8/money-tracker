import * as FileSystem from 'expo-file-system/legacy';
import PennyInstaller from '../../modules/penny-installer';
import { UPDATE_ERROR, createUpdateError } from '../utils/updateErrors';
import { settleWithin } from '../utils/settleWithin';

// Installing an update without Android's "Do you want to update this app?" screen.
//
// The GitHub build used to hand every APK to the system installer (an ACTION_VIEW intent), and
// that screen cannot be skipped. A PackageInstaller session can, on Android 12+, when the app
// updates itself, declares UPDATE_PACKAGES_WITHOUT_USER_ACTION and has been allowed to install
// apps. modules/penny-installer does the native half; this is what the update flow reads.
//
// Without a confirmation screen nothing stands between "install" and Penny closing, so the
// install only ever starts from the user's tap on Install (see UpdateDownloadContext).

// A silent update ends with Android killing this process, so the promise for it never settles.
// Something else may: a status that never arrives (the result activity was not allowed to start
// because Penny went to the background) must not leave "Installing…" on screen for good.
export const SILENT_INSTALL_TIMEOUT_MS = 120000;

// The native module's event for a status nobody was waiting on (see onLateInstallFailure).
const STATUS_EVENT = 'onInstallStatus';

// Whether the next install can skip the confirmation screen. Read fresh each time: the user can
// grant or revoke "Install unknown apps" whenever they like. Until it is granted, the system
// installer is the one that knows how to ask for it, so this stays false and the old route runs.
export const canInstallSilently = () => {
  if (!PennyInstaller?.getCapabilities) return false;
  try {
    return PennyInstaller.getCapabilities()?.silentUpdate === true;
  } catch (e) {
    console.warn('[AppUpdate] could not read the installer capabilities:', e?.message);
    return false;
  }
};

// Session statuses that end the attempt without anything to tell the user. "pending_user_action"
// is Android showing its own confirmation after all (an older target API, a vendor build), which
// is the screen the old route always showed. "aborted" is that screen being dismissed.
const QUIET_STATUSES = new Set(['success', 'pending_user_action', 'aborted']);

// What a refusal means for the user, by the status name the native side reports.
const FAILURE_CODES = {
  // Mostly INSTALL_FAILED_UPDATE_INCOMPATIBLE: the APK is signed with another key.
  conflict: UPDATE_ERROR.INSTALL_REJECTED,
  // INSTALL_FAILED_VERSION_DOWNGRADE, CPU_ABI_INCOMPATIBLE, OLDER_SDK and the like.
  incompatible: UPDATE_ERROR.INSTALL_INCOMPATIBLE,
  blocked: UPDATE_ERROR.INSTALL_BLOCKED,
  storage: UPDATE_ERROR.INSUFFICIENT_STORAGE,
};

// Errors the native side raises before Android ever sees the APK.
const REJECTION_CODES = {
  ERR_FILE_MISSING: UPDATE_ERROR.FILE_MISSING,
  ERR_INSTALL_IN_PROGRESS: UPDATE_ERROR.UPDATE_IN_PROGRESS,
};

// Files the next attempt must not be offered again. An unreadable APK is a damaged download, and
// one that is not Penny's cannot become installable by retrying; deleting either is what makes
// the update panel download afresh instead.
const DISCARD_REJECTIONS = new Set(['ERR_INVALID_APK', 'ERR_PACKAGE_MISMATCH']);

const discardApk = async (localUri) => {
  if (!localUri) return;
  try {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
  } catch (e) {
    console.warn('[AppUpdate] could not delete the unusable APK', e?.message);
  }
};

// The error a reported status stands for, or null when it needs no word to the user. Deletes the
// APK when Android called it invalid.
const errorForStatus = async ({ status, message } = {}, localUri) => {
  if (QUIET_STATUSES.has(status)) return null;
  if (status === 'invalid') {
    await discardApk(localUri);
    return createUpdateError(UPDATE_ERROR.INCOMPLETE_DOWNLOAD, `Android rejected the APK as invalid: ${message || ''}`);
  }
  return createUpdateError(
    FAILURE_CODES[status] || UPDATE_ERROR.INSTALL_ERROR,
    `Android refused the update (${status || 'unknown'}): ${message || ''}`,
  );
};

// A failure can come after installSilently has returned: once Android's own confirmation was
// shown and the user went ahead, or after the wait timed out. Nothing awaits it then, so it goes
// to these listeners (UpdateDownloadContext shows it).
const lateFailureListeners = new Set();
const sessionUris = new Map();
let nativeSubscription = null;

// A session whose first answer was Android's own confirmation ends later, as an event; keep its
// APK at hand so a verdict of "invalid" can still delete it.
const rememberAwaitingUser = (result, localUri) => {
  if (result?.status === 'pending_user_action' && result?.sessionId != null) {
    sessionUris.set(result.sessionId, localUri);
  }
};

const reportLate = async (result, localUri) => {
  rememberAwaitingUser(result, localUri);
  const error = await errorForStatus(result, localUri);
  if (!error) return;
  console.error(`[AppUpdate] install session ${result?.sessionId} failed later (${error.code}):`, error.message);
  lateFailureListeners.forEach((listener) => listener(error));
};

export const onLateInstallFailure = (listener) => {
  lateFailureListeners.add(listener);
  if (!nativeSubscription && PennyInstaller?.addListener) {
    nativeSubscription = PennyInstaller.addListener(STATUS_EVENT, (event) => {
      const localUri = sessionUris.get(event?.sessionId);
      sessionUris.delete(event?.sessionId);
      reportLate(event, localUri);
    });
  }
  return () => {
    lateFailureListeners.delete(listener);
    if (lateFailureListeners.size === 0 && nativeSubscription) {
      nativeSubscription.remove();
      nativeSubscription = null;
    }
  };
};

// Installs the APK at localUri (a file:// URI in the cache) through a session. Resolves with the
// status Android reported, or "pending" when it said nothing in time. Throws an error with an
// UPDATE_ERROR code when the install was refused or never reached Android.
export const installSilently = async (localUri, { timeoutMs = SILENT_INSTALL_TIMEOUT_MS } = {}) => {
  if (!PennyInstaller?.install) {
    throw createUpdateError(UPDATE_ERROR.INSTALL_ERROR, 'The silent installer is not part of this build');
  }

  const install = PennyInstaller.install(localUri);
  const outcome = await settleWithin(install, timeoutMs);

  if (outcome.status === 'pending') {
    console.warn(`[AppUpdate] no install status after ${timeoutMs} ms`);
    // Whatever Android says later still deserves an answer.
    install.then((late) => reportLate(late, localUri), () => {});
    return { status: 'pending' };
  }

  if (outcome.status === 'rejected') {
    const e = outcome.error;
    console.error(`[AppUpdate] silent install could not start (${e?.code || 'unknown'}):`, e?.message);
    if (DISCARD_REJECTIONS.has(e?.code)) {
      await discardApk(localUri);
      if (e?.code === 'ERR_INVALID_APK') {
        throw createUpdateError(UPDATE_ERROR.INCOMPLETE_DOWNLOAD, `Android could not read the APK: ${e?.message}`, e);
      }
    }
    throw createUpdateError(REJECTION_CODES[e?.code] || UPDATE_ERROR.INSTALL_ERROR, e?.message || 'Silent install failed', e);
  }

  const result = outcome.value || {};
  const { status, message, sessionId } = result;
  console.log(`[AppUpdate] install session ${sessionId} reported ${status}${message ? `: ${message}` : ''}`);
  const error = await errorForStatus(result, localUri);
  if (error) throw error;
  // The user decides on Android's screen now; how that ends arrives as an event.
  rememberAwaitingUser(result, localUri);
  return { status, sessionId };
};
