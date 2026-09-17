/**
 * Tests for driveBackupStatus.js
 *
 * The helper exists so the settings panel and the search pill never disagree
 * about what a run is doing, so what matters here is that every phase has a line
 * of its own, that the upload phase carries its file count, and that a pending
 * cancel outranks whatever the run was busy with when the user tapped.
 */
import { getDriveBackupStatusLabel } from '../../app/utils/driveBackupStatus';

const t = (key) => key;

describe('getDriveBackupStatusLabel', () => {
  it.each([
    ['preparing', 'drive_backup_status_preparing'],
    ['folder', 'drive_backup_status_connecting'],
    ['cleanup', 'drive_backup_status_cleanup'],
  ])('names the %s phase', (phase, expected) => {
    expect(getDriveBackupStatusLabel({ phase }, t)).toBe(expected);
  });

  it('counts the files as they upload', () => {
    const progress = { phase: 'uploading', current: 2, total: 3 };
    expect(getDriveBackupStatusLabel(progress, t)).toBe('drive_backup_status_uploading 2/3');
  });

  it('falls back to a generic line for an unrecognised phase', () => {
    expect(getDriveBackupStatusLabel({ phase: 'something-new' }, t)).toBe('drive_backup_status_running');
  });

  it('falls back to a generic line before the first progress event lands', () => {
    expect(getDriveBackupStatusLabel(null, t)).toBe('drive_backup_status_running');
  });

  it('says it is cancelling rather than repeating the phase it was in', () => {
    const progress = { phase: 'uploading', current: 1, total: 3 };
    expect(getDriveBackupStatusLabel(progress, t, { cancelling: true }))
      .toBe('drive_backup_status_cancelling');
  });

  it('uses the English fallback when a translation is missing', () => {
    const missing = () => '';
    expect(getDriveBackupStatusLabel({ phase: 'preparing' }, missing)).toBe('Preparing backup…');
  });
});
