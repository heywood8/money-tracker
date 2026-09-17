/**
 * One phrasing of "what the Drive backup is doing right now", shared by the
 * places that show it.
 *
 * The status is read in two places that look nothing alike — the settings panel
 * that started the run, and the search pill that takes over the top of the
 * Operations screen while it runs — and a run that names its phase one way in
 * one and another way in the other reads as two different things happening. So
 * the phrasing lives here and both call it.
 */

/**
 * @param {?{phase: string, current?: number, total?: number}} progress
 *   Latest progress payload, or null when nothing is in flight.
 * @param {(key: string) => string} t
 * @param {Object} [options]
 * @param {boolean} [options.cancelling] - A cancel has been asked for and the
 *   run has not reached its next checkpoint yet.
 * @returns {string}
 */
export const getDriveBackupStatusLabel = (progress, t, { cancelling = false } = {}) => {
  // Takes precedence over the phase: the phase is still whatever the run was
  // doing when the user tapped cancel, and repeating it would read as if the
  // tap had not registered.
  if (cancelling) return t('drive_backup_status_cancelling') || 'Cancelling…';

  // Each phase gets its own line rather than one generic "working…": the upload
  // phase is the long one, and it is the only one that can name a file count.
  switch (progress?.phase) {
  case 'preparing':
    return t('drive_backup_status_preparing') || 'Preparing backup…';
  case 'folder':
    return t('drive_backup_status_connecting') || 'Connecting to Google Drive…';
  case 'uploading':
    return `${t('drive_backup_status_uploading') || 'Uploading to Drive'} ${progress.current}/${progress.total}`;
  case 'cleanup':
    return t('drive_backup_status_cleanup') || 'Tidying up old backups…';
  default:
    return t('drive_backup_status_running') || 'Backing up to Google Drive…';
  }
};

export default getDriveBackupStatusLabel;
