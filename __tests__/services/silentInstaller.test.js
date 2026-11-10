/**
 * The JS half of the silent self-updater: when it is used, and how Android's answer for an
 * install session becomes something the update UI can say.
 *
 * The native half (modules/penny-installer) cannot run under Jest; it is replaced here by the
 * shape it promises: getCapabilities() and install(uri) -> { sessionId, status, message }.
 */

// addListener stands in for the Expo module's event emitter: the test fires `emitStatus` where
// the native side would send onInstallStatus for a status nobody was waiting on.
let mockStatusListener = null;
const mockRemove = jest.fn(() => { mockStatusListener = null; });
const mockNative = {
  getCapabilities: jest.fn(),
  install: jest.fn(),
  addListener: jest.fn((event, listener) => {
    mockStatusListener = listener;
    return { remove: mockRemove };
  }),
};
const emitStatus = (event) => mockStatusListener?.(event);

// Read through a getter so a test can take the module away: Babel reads `default` on every use.
let mockNativeModule = mockNative;
jest.mock('../../modules/penny-installer', () => ({
  __esModule: true,
  get default() { return mockNativeModule; },
}));

jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: jest.fn(() => Promise.resolve()),
}));

const FileSystem = require('expo-file-system/legacy');
const { UPDATE_ERROR } = require('../../app/utils/updateErrors');
const {
  canInstallSilently,
  installSilently,
  onLateInstallFailure,
  SILENT_INSTALL_TIMEOUT_MS,
} = require('../../app/services/silentInstaller');

// Lets queued promise callbacks (the late-failure path is async) run before asserting.
const flush = () => new Promise((resolve) => setImmediate(resolve));

const APK = 'file:///data/user/0/com.heywood8.monkeep/cache/penny-v1.2.3.apk';
const nativeError = (code, message = code) => Object.assign(new Error(message), { code });

describe('silentInstaller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNative.getCapabilities.mockReturnValue({ silentUpdate: true });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    mockNativeModule = mockNative;
  });

  describe('canInstallSilently', () => {
    it('is true when the native side says the update can skip the confirmation', () => {
      expect(canInstallSilently()).toBe(true);
    });

    it('is false when it cannot (Android 11 or older, no install permission yet, a Play build)', () => {
      mockNative.getCapabilities.mockReturnValue({
        silentUpdate: false,
        canRequestPackageInstalls: false,
        declaresSilentUpdatePermission: true,
      });
      expect(canInstallSilently()).toBe(false);
    });

    it('is false, not an error, when the native side throws', () => {
      mockNative.getCapabilities.mockImplementation(() => { throw new Error('context lost'); });
      expect(canInstallSilently()).toBe(false);
    });

    it('takes nothing but true for an answer', () => {
      mockNative.getCapabilities.mockReturnValue({ silentUpdate: 'yes' });
      expect(canInstallSilently()).toBe(false);
      mockNative.getCapabilities.mockReturnValue(null);
      expect(canInstallSilently()).toBe(false);
    });

    it('is false on a build without the native module', () => {
      // An OTA bundle can run on a binary that predates the module (runtimeVersion follows the
      // SDK version), so its absence is an ordinary state, not a crash.
      mockNativeModule = null;
      expect(canInstallSilently()).toBe(false);
    });
  });

  describe('installSilently', () => {
    it('hands the cached APK to the native installer', async () => {
      mockNative.install.mockResolvedValue({ sessionId: 5, status: 'pending_user_action' });

      await installSilently(APK);

      expect(mockNative.install).toHaveBeenCalledWith(APK);
    });

    it.each(['pending_user_action', 'aborted', 'success'])('settles quietly on "%s"', async (status) => {
      // pending_user_action: Android showed its own confirmation after all, the screen the old
      // route always showed. aborted: that screen was dismissed. Neither is an error to report.
      mockNative.install.mockResolvedValue({ sessionId: 5, status });

      await expect(installSilently(APK)).resolves.toEqual({ status, sessionId: 5 });
      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    });

    it.each([
      ['conflict', UPDATE_ERROR.INSTALL_REJECTED],
      ['incompatible', UPDATE_ERROR.INSTALL_INCOMPATIBLE],
      ['blocked', UPDATE_ERROR.INSTALL_BLOCKED],
      ['storage', UPDATE_ERROR.INSUFFICIENT_STORAGE],
      ['timeout', UPDATE_ERROR.INSTALL_ERROR],
      ['failure', UPDATE_ERROR.INSTALL_ERROR],
      ['something new', UPDATE_ERROR.INSTALL_ERROR],
    ])('turns the "%s" status into %s', async (status, code) => {
      mockNative.install.mockResolvedValue({ sessionId: 5, status, message: 'INSTALL_FAILED_X' });

      await expect(installSilently(APK)).rejects.toMatchObject({ code });
      // Only a file Android cannot read is worth throwing away.
      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    });

    it('deletes an APK Android calls invalid, so the next attempt downloads it again', async () => {
      mockNative.install.mockResolvedValue({ sessionId: 5, status: 'invalid', message: 'INSTALL_PARSE_FAILED' });

      await expect(installSilently(APK)).rejects.toMatchObject({ code: UPDATE_ERROR.INCOMPLETE_DOWNLOAD });
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(APK, { idempotent: true });
    });

    it('deletes an APK the native side could not even read', async () => {
      mockNative.install.mockRejectedValue(nativeError('ERR_INVALID_APK'));

      await expect(installSilently(APK)).rejects.toMatchObject({ code: UPDATE_ERROR.INCOMPLETE_DOWNLOAD });
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(APK, { idempotent: true });
    });

    it('still reports the broken file when deleting it fails', async () => {
      mockNative.install.mockResolvedValue({ sessionId: 5, status: 'invalid' });
      FileSystem.deleteAsync.mockRejectedValueOnce(new Error('read-only'));

      await expect(installSilently(APK)).rejects.toMatchObject({ code: UPDATE_ERROR.INCOMPLETE_DOWNLOAD });
    });

    it('reports a file that vanished from the cache as missing', async () => {
      mockNative.install.mockRejectedValue(nativeError('ERR_FILE_MISSING'));

      await expect(installSilently(APK)).rejects.toMatchObject({ code: UPDATE_ERROR.FILE_MISSING });
    });

    it('says an update is already running when the native side refuses a second session', async () => {
      mockNative.install.mockRejectedValue(nativeError('ERR_INSTALL_IN_PROGRESS'));

      await expect(installSilently(APK)).rejects.toMatchObject({ code: UPDATE_ERROR.UPDATE_IN_PROGRESS });
      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    });

    it('deletes an APK that is not Penny, since retrying it can never work', async () => {
      mockNative.install.mockRejectedValue(nativeError('ERR_PACKAGE_MISMATCH'));

      await expect(installSilently(APK)).rejects.toMatchObject({ code: UPDATE_ERROR.INSTALL_ERROR });
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(APK, { idempotent: true });
    });

    it.each(['ERR_INVALID_PATH', 'ERR_INSTALL_STAGING_FAILED', 'ERR_INSTALLER_GONE', undefined])(
      'reports any other native rejection (%s) as an install error',
      async (code) => {
        mockNative.install.mockRejectedValue(nativeError(code, 'nope'));

        await expect(installSilently(APK)).rejects.toMatchObject({ code: UPDATE_ERROR.INSTALL_ERROR });
        expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
      },
    );

    it('gives up waiting rather than leave "Installing…" on screen for good', async () => {
      // A silent update that works kills the process before anything resolves; one whose status
      // never arrives must still let the UI go back to normal.
      jest.useFakeTimers();
      mockNative.install.mockReturnValue(new Promise(() => {}));

      const pending = installSilently(APK, { timeoutMs: 1000 });
      jest.advanceTimersByTime(1000);

      await expect(pending).resolves.toEqual({ status: 'pending' });
    });

    it('waits two minutes by default', async () => {
      jest.useFakeTimers();
      mockNative.install.mockReturnValue(new Promise(() => {}));
      let settled = false;

      installSilently(APK).then(() => { settled = true; });
      await jest.advanceTimersByTimeAsync(SILENT_INSTALL_TIMEOUT_MS - 1000);
      expect(settled).toBe(false);

      await jest.advanceTimersByTimeAsync(1000);
      expect(settled).toBe(true);
      expect(SILENT_INSTALL_TIMEOUT_MS).toBe(120000);
    });

    it('refuses when the build has no native module', async () => {
      mockNativeModule = null;
      await expect(installSilently(APK)).rejects.toMatchObject({ code: UPDATE_ERROR.INSTALL_ERROR });
    });
  });

  // installSilently returns at the first status. What Android says after that, nobody awaits.
  describe('onLateInstallFailure', () => {
    let unsubscribe = null;
    const late = jest.fn();

    beforeEach(() => {
      late.mockClear();
      unsubscribe = onLateInstallFailure(late);
    });

    afterEach(() => {
      unsubscribe?.();
      unsubscribe = null;
    });

    it('hears a failure after Android showed its own confirmation and the user went ahead', async () => {
      mockNative.install.mockResolvedValue({ sessionId: 9, status: 'pending_user_action' });
      await installSilently(APK);

      emitStatus({ sessionId: 9, status: 'blocked', message: 'Play Protect' });
      await flush();

      expect(late).toHaveBeenCalledWith(expect.objectContaining({ code: UPDATE_ERROR.INSTALL_BLOCKED }));
    });

    it('deletes the APK of a session Android later calls invalid', async () => {
      mockNative.install.mockResolvedValue({ sessionId: 9, status: 'pending_user_action' });
      await installSilently(APK);

      emitStatus({ sessionId: 9, status: 'invalid' });
      await flush();

      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(APK, { idempotent: true });
      expect(late).toHaveBeenCalledWith(expect.objectContaining({ code: UPDATE_ERROR.INCOMPLETE_DOWNLOAD }));
    });

    it.each(['success', 'aborted', 'pending_user_action'])('stays quiet about a later "%s"', async (status) => {
      // aborted: the user dismissed Android's confirmation, which is their answer, not an error.
      emitStatus({ sessionId: 9, status });
      await flush();

      expect(late).not.toHaveBeenCalled();
    });

    it('hears what Android says after the wait for it ran out', async () => {
      jest.useFakeTimers();
      let answer;
      mockNative.install.mockReturnValue(new Promise((resolve) => { answer = resolve; }));

      const pending = installSilently(APK, { timeoutMs: 1000 });
      await jest.advanceTimersByTimeAsync(1000);
      await expect(pending).resolves.toEqual({ status: 'pending' });
      expect(late).not.toHaveBeenCalled();

      jest.useRealTimers();
      answer({ sessionId: 4, status: 'storage' });
      await flush();

      expect(late).toHaveBeenCalledWith(expect.objectContaining({ code: UPDATE_ERROR.INSUFFICIENT_STORAGE }));
    });

    it('still deletes the APK when Android, answering late, shows its screen and then calls it invalid', async () => {
      jest.useFakeTimers();
      let answer;
      mockNative.install.mockReturnValue(new Promise((resolve) => { answer = resolve; }));

      const pending = installSilently(APK, { timeoutMs: 1000 });
      await jest.advanceTimersByTimeAsync(1000);
      await pending;
      jest.useRealTimers();

      answer({ sessionId: 6, status: 'pending_user_action' });
      await flush();
      expect(late).not.toHaveBeenCalled();

      emitStatus({ sessionId: 6, status: 'invalid' });
      await flush();

      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(APK, { idempotent: true });
      expect(late).toHaveBeenCalledWith(expect.objectContaining({ code: UPDATE_ERROR.INCOMPLETE_DOWNLOAD }));
    });

    it('subscribes to the native events once, and lets go when the last listener does', () => {
      const second = onLateInstallFailure(jest.fn());
      expect(mockNative.addListener).toHaveBeenCalledTimes(1);
      expect(mockNative.addListener).toHaveBeenCalledWith('onInstallStatus', expect.any(Function));

      second();
      expect(mockRemove).not.toHaveBeenCalled();
      unsubscribe();
      unsubscribe = null;
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });

    it('is harmless on a build without the native module', () => {
      unsubscribe();
      unsubscribe = null;
      mockNativeModule = null;
      const off = onLateInstallFailure(jest.fn());
      expect(() => off()).not.toThrow();
    });
  });
});
