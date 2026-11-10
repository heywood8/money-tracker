// Why an update failed, in the shape both the thrower (AppUpdateService) and the UI need. A
// download that never finished and an APK that downloaded and verified fine but could not be
// handed to Android's installer are different problems with different remedies.
export const UPDATE_ERROR = {
  DOWNLOAD_FAILED: 'download_failed',
  CHECKSUM_MISMATCH: 'checksum_mismatch',
  INCOMPLETE_DOWNLOAD: 'incomplete_download',
  INSTALL_FAILED: 'install_failed',
  INSTALLER_BUSY: 'installer_busy',
  FILE_MISSING: 'file_missing',
  // The silent installer (app/services/silentInstaller.js) reaches Android itself, so it hears
  // why an install was refused, which the system installer only ever told the user.
  INSTALL_REJECTED: 'install_rejected',
  INSTALL_INCOMPATIBLE: 'install_incompatible',
  INSTALL_BLOCKED: 'install_blocked',
  INSUFFICIENT_STORAGE: 'insufficient_storage',
  INSTALL_ERROR: 'install_error',
  // A second download or install while one is still running.
  UPDATE_IN_PROGRESS: 'update_in_progress',
};

// An Error carrying one of the codes above, which is what describeUpdateError reads.
export const createUpdateError = (code, message, cause = null) => {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
};

// What to tell the user for each of those. Reporting a failed install as a failed download sent
// people re-downloading a file that was already on disk, intact, when what they needed was to
// close the stale install prompt.
//
// Every entry is [translation key, English fallback], matching how the rest of the app calls t().
const UPDATE_ERROR_MESSAGES = {
  [UPDATE_ERROR.INSTALLER_BUSY]: [
    'update_installer_busy',
    'An install prompt is still open. Close it, restart Penny, then install the downloaded APK.',
  ],
  [UPDATE_ERROR.INSTALL_FAILED]: [
    'update_install_failed',
    'The update was downloaded, but Android would not open the installer. Try installing it again from the downloaded builds.',
  ],
  [UPDATE_ERROR.FILE_MISSING]: [
    'update_apk_missing',
    'The downloaded file is no longer available. Please download the update again.',
  ],
  [UPDATE_ERROR.CHECKSUM_MISMATCH]: [
    'update_checksum_mismatch',
    'The downloaded file did not match its checksum and was deleted. Please try again.',
  ],
  [UPDATE_ERROR.INCOMPLETE_DOWNLOAD]: [
    'update_download_incomplete',
    'The download was incomplete and the file was deleted. Please try again.',
  ],
  // STATUS_FAILURE_CONFLICT: mostly INSTALL_FAILED_UPDATE_INCOMPATIBLE, another signing key.
  [UPDATE_ERROR.INSTALL_REJECTED]: [
    'update_install_rejected',
    'Android refused this update: it conflicts with the installed app, usually because it is signed with a different key.',
  ],
  // STATUS_FAILURE_INCOMPATIBLE: a downgrade, another CPU architecture, a too-new minSdk.
  [UPDATE_ERROR.INSTALL_INCOMPATIBLE]: [
    'update_install_incompatible',
    'Android refused this update: it is older than the installed version or not built for this device.',
  ],
  [UPDATE_ERROR.INSTALL_BLOCKED]: [
    'update_install_blocked',
    'Android blocked the installation. Check Google Play Protect and try again.',
  ],
  [UPDATE_ERROR.INSUFFICIENT_STORAGE]: [
    'update_install_storage',
    'Not enough free space to install the update. Free up some storage and try again.',
  ],
  [UPDATE_ERROR.INSTALL_ERROR]: [
    'update_install_error',
    'Android could not install the update. Please try again.',
  ],
  [UPDATE_ERROR.UPDATE_IN_PROGRESS]: [
    'update_in_progress',
    'An update is already being downloaded or installed. Wait for it to finish, then try again.',
  ],
};

// Picks the message that describes where the update actually failed, falling back to the caller's
// own wording for an error that carries no code (a network failure inside expo-file-system, say).
export const describeUpdateError = (error, t, fallbackKey, fallbackText) => {
  const known = error?.code ? UPDATE_ERROR_MESSAGES[error.code] : null;
  const [key, text] = known || [fallbackKey, fallbackText];
  return t(key) || text;
};

export default describeUpdateError;
