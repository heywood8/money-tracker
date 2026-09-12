import { describeUpdateError, UPDATE_ERROR } from '../../app/utils/updateErrors';

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

  it('uses the English fallback when a translation is missing', () => {
    const busy = Object.assign(new Error('pending'), { code: UPDATE_ERROR.INSTALLER_BUSY });
    expect(describeUpdateError(busy, () => '', 'update_download_failed', 'fallback'))
      .toMatch(/install prompt is still open/);
  });
});
