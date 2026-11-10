import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { UpdateDownloadProvider, useUpdateDownload } from '../../app/contexts/UpdateDownloadContext';

let capturedOnPhaseChange = null;
let capturedOnProgress = null;

jest.mock('../../app/services/AppUpdateService', () => ({
  downloadAndInstallApk: jest.fn(),
  installApk: jest.fn(() => Promise.resolve()),
  backupBeforeUpdate: jest.fn(() => Promise.resolve()),
}));

const mockShowDialog = jest.fn();
jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: mockShowDialog }),
}));
jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));

const mockCanInstallSilently = jest.fn(() => false);
let mockLateFailureListener = null;
jest.mock('../../app/services/silentInstaller', () => ({
  canInstallSilently: () => mockCanInstallSilently(),
  onLateInstallFailure: (listener) => {
    mockLateFailureListener = listener;
    return () => { mockLateFailureListener = null; };
  },
}));

const mockSupportsInAppUpdates = jest.fn(() => true);
jest.mock('../../app/services/distribution', () => ({
  supportsInAppUpdates: () => mockSupportsInAppUpdates(),
}));

const wrapper = ({ children }) => (
  <UpdateDownloadProvider>{children}</UpdateDownloadProvider>
);

describe('UpdateDownloadContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanInstallSilently.mockReturnValue(false);
    mockSupportsInAppUpdates.mockReturnValue(true);
    // clearAllMocks keeps implementations; a test that parks one of these on a promise of its
    // own must not leave the next test waiting on it.
    const services = require('../../app/services/AppUpdateService');
    services.installApk.mockImplementation(() => Promise.resolve());
    services.backupBeforeUpdate.mockImplementation(() => Promise.resolve());
    capturedOnPhaseChange = null;
    capturedOnProgress = null;
    const { downloadAndInstallApk } = require('../../app/services/AppUpdateService');
    downloadAndInstallApk.mockImplementation((url, onProgress, options) => {
      capturedOnProgress = onProgress;
      capturedOnPhaseChange = options?.onPhaseChange ?? null;
      return Promise.resolve();
    });
  });

  it('exposes null downloadPhase initially', async () => {
    const { result } = await renderHook(() => useUpdateDownload(), { wrapper });
    expect(result.current.downloadPhase).toBeNull();
  });

  it('sets downloadPhase to "downloading" when startDownload is called', async () => {
    const { downloadAndInstallApk } = require('../../app/services/AppUpdateService');
    let resolveDownload;
    downloadAndInstallApk.mockImplementation((url, onProgress, options) => {
      capturedOnPhaseChange = options?.onPhaseChange ?? null;
      return new Promise((resolve) => { resolveDownload = resolve; });
    });

    const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

    await act(async () => {
      result.current.startDownload('https://example.com/penny.apk');
    });

    expect(result.current.downloadPhase).toBe('downloading');

    await act(async () => { resolveDownload(); });
  });

  it('resets downloadPhase to null after download completes', async () => {
    const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

    await act(async () => {
      await result.current.startDownload('https://example.com/penny.apk');
    });

    expect(result.current.downloadPhase).toBeNull();
  });

  it('sets downloadPhase to "verifying" and resets downloadProgress to 0 when onPhaseChange fires', async () => {
    const { downloadAndInstallApk } = require('../../app/services/AppUpdateService');
    let resolveDownload;
    downloadAndInstallApk.mockImplementation((url, onProgress, options) => {
      capturedOnPhaseChange = options?.onPhaseChange ?? null;
      capturedOnProgress = onProgress;
      return new Promise((resolve) => { resolveDownload = resolve; });
    });

    const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

    await act(async () => {
      result.current.startDownload('https://example.com/penny.apk', { checksumUrl: 'https://example.com/penny.apk.sha256' });
    });

    await act(async () => { capturedOnProgress?.(1); });
    expect(result.current.downloadProgress).toBe(1);

    await act(async () => { capturedOnPhaseChange?.('verifying'); });
    expect(result.current.downloadPhase).toBe('verifying');
    expect(result.current.downloadProgress).toBe(0);

    await act(async () => { resolveDownload(); });
  });

  it('passes checksumUrl to downloadAndInstallApk', async () => {
    const { downloadAndInstallApk } = require('../../app/services/AppUpdateService');
    const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

    await act(async () => {
      await result.current.startDownload('https://example.com/penny.apk', { checksumUrl: 'https://example.com/penny.apk.sha256' });
    });

    expect(downloadAndInstallApk).toHaveBeenCalledWith(
      'https://example.com/penny.apk',
      expect.any(Function),
      expect.objectContaining({ checksumUrl: 'https://example.com/penny.apk.sha256' }),
    );
  });

  // A silent install closes Penny. The download runs while the user does other things, so the
  // install it ends in waits for a tap on Install.
  describe('an update that installs without a confirmation screen', () => {
    const APK = 'file:///cache/penny-v1.1.0.apk';
    const lastDialogButtons = () => mockShowDialog.mock.calls.at(-1)[2];
    const buttonNamed = (key) => lastDialogButtons().find((b) => b.text === key);

    beforeEach(() => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const { downloadAndInstallApk } = require('../../app/services/AppUpdateService');
      downloadAndInstallApk.mockResolvedValue({ localUri: APK, installDeferred: true });
      mockCanInstallSilently.mockReturnValue(true);
    });

    it('asks the download to leave the install to the context', async () => {
      const { downloadAndInstallApk } = require('../../app/services/AppUpdateService');
      const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

      await act(async () => { await result.current.startDownload('https://example.com/penny.apk'); });

      expect(downloadAndInstallApk).toHaveBeenCalledWith(
        'https://example.com/penny.apk',
        expect.any(Function),
        expect.objectContaining({ deferSilentInstall: true }),
      );
    });

    it('offers Install and Later once the download is ready, with the download state cleared', async () => {
      const { installApk } = require('../../app/services/AppUpdateService');
      const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

      await act(async () => { await result.current.startDownload('https://example.com/penny.apk'); });

      expect(mockShowDialog).toHaveBeenCalledWith(
        'update_ready_title',
        'update_ready_message',
        expect.any(Array),
      );
      expect(buttonNamed('later').style).toBe('cancel');
      expect(buttonNamed('install')).toBeDefined();
      // Nothing is installed until the tap.
      expect(installApk).not.toHaveBeenCalled();
      expect(result.current.isDownloading).toBe(false);
      expect(result.current.downloadPhase).toBeNull();
    });

    it('backs up, then installs, when Install is tapped, showing each step meanwhile', async () => {
      const { installApk, backupBeforeUpdate } = require('../../app/services/AppUpdateService');
      let finishBackup;
      let finishInstall;
      backupBeforeUpdate.mockImplementation(() => new Promise((resolve) => { finishBackup = resolve; }));
      installApk.mockImplementation(() => new Promise((resolve) => { finishInstall = resolve; }));
      const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

      await act(async () => { await result.current.startDownload('https://example.com/penny.apk'); });
      await act(async () => { buttonNamed('install').onPress(); });

      // The snapshot is taken at the tap, not when the download finished.
      expect(result.current.downloadPhase).toBe('backing_up');
      expect(result.current.isDownloading).toBe(true);
      expect(installApk).not.toHaveBeenCalled();

      await act(async () => { finishBackup(); });
      expect(result.current.downloadPhase).toBe('installing');
      // Decided once, at the tap, and passed down.
      expect(installApk).toHaveBeenCalledWith(APK, { silent: true });

      await act(async () => { finishInstall({ silent: true, status: 'pending' }); });
      expect(result.current.downloadPhase).toBeNull();
      expect(result.current.isDownloading).toBe(false);
    });

    it('shows a failure Android reports after the install stopped being awaited', async () => {
      await renderHook(() => useUpdateDownload(), { wrapper });

      await act(async () => {
        mockLateFailureListener(Object.assign(new Error('blocked'), { code: 'install_blocked' }));
      });

      expect(mockShowDialog).toHaveBeenCalledWith('error', 'update_install_blocked', expect.any(Array));
    });

    it('does nothing more when the user chooses Later', async () => {
      const { installApk } = require('../../app/services/AppUpdateService');
      const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

      await act(async () => { await result.current.startDownload('https://example.com/penny.apk'); });
      buttonNamed('later').onPress?.();

      expect(installApk).not.toHaveBeenCalled();
    });

    it('explains a refused install in a dialog of its own', async () => {
      const { installApk } = require('../../app/services/AppUpdateService');
      installApk.mockRejectedValue(Object.assign(new Error('refused'), { code: 'install_rejected' }));
      const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

      await act(async () => { await result.current.startDownload('https://example.com/penny.apk'); });
      // The dialog's button does not hand back the install's promise; wait for what it leads to.
      await act(async () => { buttonNamed('install').onPress(); });

      await waitFor(() => expect(mockShowDialog)
        .toHaveBeenLastCalledWith('error', 'update_install_rejected', expect.any(Array)));
      expect(result.current.downloadPhase).toBeNull();
    });

    it('offers nothing when the download installed through the system installer itself', async () => {
      const { downloadAndInstallApk } = require('../../app/services/AppUpdateService');
      downloadAndInstallApk.mockResolvedValue({ localUri: APK, installDeferred: false });
      const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

      await act(async () => { await result.current.startDownload('https://example.com/penny.apk'); });

      expect(mockShowDialog).not.toHaveBeenCalled();
    });

    it('offers nothing when the download failed', async () => {
      const { downloadAndInstallApk } = require('../../app/services/AppUpdateService');
      const failure = Object.assign(new Error('checksum'), { code: 'checksum_mismatch' });
      downloadAndInstallApk.mockRejectedValue(failure);
      const onError = jest.fn();
      const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

      await act(async () => { await result.current.startDownload('https://example.com/penny.apk', { onError }); });

      expect(onError).toHaveBeenCalledWith(failure);
      expect(mockShowDialog).not.toHaveBeenCalled();
    });
  });

  describe('installDownloaded', () => {
    beforeEach(() => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('hands errors to the caller when it brings its own handler', async () => {
      const { installApk } = require('../../app/services/AppUpdateService');
      const failure = Object.assign(new Error('busy'), { code: 'installer_busy' });
      installApk.mockRejectedValue(failure);
      const onError = jest.fn();
      const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

      await act(async () => { await result.current.installDownloaded('file:///cache/a.apk', { onError }); });

      expect(onError).toHaveBeenCalledWith(failure);
      expect(mockShowDialog).not.toHaveBeenCalled();
    });

    it('backs up on the system-installer route too, then gets out of that screen\'s way', async () => {
      // A download whose silent install was deferred took no backup, and the route can change
      // before the tap (the user revokes "Install unknown apps"), so every install backs up.
      const { installApk, backupBeforeUpdate } = require('../../app/services/AppUpdateService');
      let finishBackup;
      let finishInstall;
      backupBeforeUpdate.mockImplementation(() => new Promise((resolve) => { finishBackup = resolve; }));
      installApk.mockImplementation(() => new Promise((resolve) => { finishInstall = resolve; }));
      const onStarted = jest.fn();
      const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

      await act(async () => { result.current.installDownloaded('file:///cache/a.apk', { onStarted }); });
      expect(onStarted).toHaveBeenCalledWith({ silent: false });
      expect(result.current.downloadPhase).toBe('backing_up');
      expect(installApk).not.toHaveBeenCalled();

      await act(async () => { finishBackup(); });
      // The system installer is its own screen: no "Installing…" under it.
      expect(installApk).toHaveBeenCalledWith('file:///cache/a.apk', { silent: false });
      expect(result.current.downloadPhase).toBeNull();
      expect(result.current.isDownloading).toBe(false);

      await act(async () => { finishInstall({ resultDelivered: false }); });
    });

    it.each([
      [Object.assign(new Error('pending'), { code: 'installer_busy' }), 'update_installer_busy'],
      [Object.assign(new Error('gone'), { code: 'file_missing' }), 'update_apk_missing'],
      [new Error('something unexpected'), 'update_install_error'],
    ])('explains a failed install in its own dialog (%s)', async (failure, key) => {
      const { installApk } = require('../../app/services/AppUpdateService');
      installApk.mockRejectedValue(failure);
      const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

      await act(async () => { await result.current.installDownloaded('file:///cache/a.apk'); });

      expect(mockShowDialog).toHaveBeenCalledWith('error', key, expect.any(Array));
      expect(result.current.isDownloading).toBe(false);
    });

    it('lets go of the lock when the caller\'s onStarted throws', async () => {
      const { installApk } = require('../../app/services/AppUpdateService');
      const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

      await act(async () => {
        await result.current.installDownloaded('file:///cache/a.apk', {
          onStarted: () => { throw new Error('panel already gone'); },
          onError: () => {},
        });
      });
      await act(async () => { await result.current.installDownloaded('file:///cache/b.apk'); });

      expect(installApk).toHaveBeenCalledWith('file:///cache/b.apk', { silent: false });
    });

    it('tells the caller whether the install it started is silent', async () => {
      mockCanInstallSilently.mockReturnValue(true);
      const onStarted = jest.fn();
      const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

      await act(async () => { await result.current.installDownloaded('file:///cache/a.apk', { onStarted }); });

      expect(onStarted).toHaveBeenCalledWith({ silent: true });
    });

    it('says so, rather than nothing, when another install or download is running', async () => {
      const { installApk, downloadAndInstallApk } = require('../../app/services/AppUpdateService');
      let finishInstall;
      installApk.mockImplementation(() => new Promise((resolve) => { finishInstall = resolve; }));
      const onError = jest.fn();
      const onStarted = jest.fn();
      const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

      const onDownloadError = jest.fn();

      await act(async () => { result.current.installDownloaded('file:///cache/a.apk'); });
      await act(async () => { await result.current.installDownloaded('file:///cache/a.apk', { onError, onStarted }); });
      await act(async () => { await result.current.startDownload('https://example.com/penny.apk', { onError: onDownloadError }); });

      expect(installApk).toHaveBeenCalledTimes(1);
      expect(downloadAndInstallApk).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'update_in_progress' }));
      expect(onDownloadError).toHaveBeenCalledWith(expect.objectContaining({ code: 'update_in_progress' }));
      // The refused tap never counts as started, so a caller does not close itself for it.
      expect(onStarted).not.toHaveBeenCalled();

      await act(async () => { finishInstall({}); });
    });

    it('installs nothing on a Play build', async () => {
      mockSupportsInAppUpdates.mockReturnValue(false);
      const { installApk } = require('../../app/services/AppUpdateService');
      const onStarted = jest.fn();
      const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

      await act(async () => { await result.current.installDownloaded('file:///cache/a.apk', { onStarted }); });

      expect(installApk).not.toHaveBeenCalled();
      expect(onStarted).not.toHaveBeenCalled();
    });
  });
});
