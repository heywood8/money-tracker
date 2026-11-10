import { createUpdateError, describeUpdateError, UPDATE_ERROR } from '../../app/utils/updateErrors';

// t() in these tests echoes the key, so the assertions read as "which string did the user get".
const t = (key) => key;

describe('describeUpdateError', () => {
  it('falls back to the caller wording when the error carries no code', () => {
    expect(describeUpdateError(new Error('socket hang up'), t, 'update_download_failed', 'fallback'))
      .toBe('update_download_failed');
    expect(describeUpdateError(undefined, t, 'update_download_failed', 'fallback'))
      .toBe('update_download_failed');
  });

  // Regression: an APK that downloaded and passed its checksum but never reached Android's
  // installer was reported as a failed download, which sent people re-downloading a good file.
  it('names the install step when that is what failed', () => {
    const failed = Object.assign(new Error('no activity'), { code: UPDATE_ERROR.INSTALL_FAILED });
    expect(describeUpdateError(failed, t, 'update_download_failed', 'fallback'))
      .toBe('update_install_failed');
  });

  it('has a message for every code it can be handed', () => {
    for (const code of Object.values(UPDATE_ERROR)) {
      const message = describeUpdateError({ code }, t, 'update_download_failed', 'fallback');
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    }
  });

  // The silent installer hears why Android refused an update, which the system installer only
  // ever told the user on its own screen. Each reason has a remedy of its own.
  it.each([
    [UPDATE_ERROR.INSTALL_REJECTED, 'update_install_rejected'],
    [UPDATE_ERROR.INSTALL_INCOMPATIBLE, 'update_install_incompatible'],
    [UPDATE_ERROR.INSTALL_BLOCKED, 'update_install_blocked'],
    [UPDATE_ERROR.INSUFFICIENT_STORAGE, 'update_install_storage'],
    [UPDATE_ERROR.INSTALL_ERROR, 'update_install_error'],
    [UPDATE_ERROR.UPDATE_IN_PROGRESS, 'update_in_progress'],
  ])('says why a silent install of %s failed', (code, key) => {
    expect(describeUpdateError({ code }, t, 'update_download_failed', 'fallback')).toBe(key);
  });

  it('has every message it can show translated into every language', () => {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '../../assets/i18n');
    const keys = Object.values(UPDATE_ERROR)
      .map((code) => describeUpdateError({ code }, t, null, null))
      .filter(Boolean);
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.json'))) {
      const strings = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const key of keys) {
        expect([file, key, typeof strings[key]]).toEqual([file, key, 'string']);
      }
    }
  });

  it('builds errors that carry their code and cause', () => {
    const cause = new Error('root');
    const error = createUpdateError(UPDATE_ERROR.INSTALL_BLOCKED, 'blocked', cause);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code: UPDATE_ERROR.INSTALL_BLOCKED, message: 'blocked', cause });
    expect(createUpdateError(UPDATE_ERROR.INSTALL_ERROR, 'x')).not.toHaveProperty('cause');
  });

  it('uses the English fallback when a translation is missing', () => {
    const busy = Object.assign(new Error('pending'), { code: UPDATE_ERROR.INSTALLER_BUSY });
    expect(describeUpdateError(busy, () => '', 'update_download_failed', 'fallback'))
      .toMatch(/install prompt is still open/);
  });
});
