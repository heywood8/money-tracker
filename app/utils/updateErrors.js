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
};

// Picks the message that describes where the update actually failed, falling back to the caller's
// own wording for an error that carries no code (a network failure inside expo-file-system, say).
export const describeUpdateError = (error, t, fallbackKey, fallbackText) => {
  const known = error?.code ? UPDATE_ERROR_MESSAGES[error.code] : null;
  const [key, text] = known || [fallbackKey, fallbackText];
  return t(key) || text;
};

export default describeUpdateError;
