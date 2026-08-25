/* eslint-disable react/display-name */
/**
 * Tests for the update subpanel: the check it runs on open, the poller that
 * follows a release still building on CI, and the hand-off to the app-wide
 * downloader.
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import UpdatePanel from '../../../app/components/settings/UpdatePanel';

const mockCheckForAppUpdate = jest.fn();
const mockListDownloadedApks = jest.fn(() => Promise.resolve([]));
const mockInstallApk = jest.fn(() => Promise.resolve());
const mockDeleteDownloadedApk = jest.fn(() => Promise.resolve(true));
const mockVerifyCachedApk = jest.fn(() => Promise.resolve({ exists: false }));
const mockSetPreference = jest.fn(() => Promise.resolve());
const mockStartDownload = jest.fn();
const mockShowDialog = jest.fn();

const UP_TO_DATE = { success: true, isUpdateAvailable: false, currentVersion: '1.0.0' };
const AVAILABLE = {
  success: true,
  isUpdateAvailable: true,
  latestVersion: '1.1.0',
  currentVersion: '1.0.0',
  downloadUrl: 'https://apk',
  checksumUrl: 'https://sum',
};
const BUILDING = {
  success: false,
  errorCode: 'releases_without_apks',
  currentVersion: '1.0.0',
  buildProgress: { percent: 40 },
};

jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));
jest.mock('../../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: mockShowDialog }),
}));
jest.mock('../../../app/contexts/UpdateDownloadContext', () => ({
  useUpdateDownload: () => ({ startDownload: mockStartDownload }),
}));
jest.mock('../../../app/services/AppUpdateService', () => ({
  checkForAppUpdate: (...a) => mockCheckForAppUpdate(...a),
  listDownloadedApks: (...a) => mockListDownloadedApks(...a),
  installApk: (...a) => mockInstallApk(...a),
  deleteDownloadedApk: (...a) => mockDeleteDownloadedApk(...a),
  verifyCachedApk: (...a) => mockVerifyCachedApk(...a),
}));
jest.mock('../../../app/services/PreferencesDB', () => ({
  setPreference: (...a) => mockSetPreference(...a),
  PREF_KEYS: {
    UPDATE_LAST_CHECK_AT: 'lastCheck',
    UPDATE_LAST_PROMPTED_VERSION: 'lastPrompted',
  },
}));

// The content panel is someone else's test; stand it up as a probe that exposes
// what this panel handed it.
let lastContentProps = null;
jest.mock('../../../app/components/UpdateContentPanel', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return (props) => {
    lastContentProps = props;
    return React.createElement(Text, { testID: 'update-content' }, 'content');
  };
});

const noop = () => {};

const setup = (props = {}) => render(
  <UpdatePanel onRegisterTitle={noop} onDone={noop} {...props} />,
);

describe('UpdatePanel', () => {
  beforeEach(() => {
    // The polling block installs fake timers; make sure no later test inherits
    // them, or its `await render` never settles.
    jest.useRealTimers();
    jest.clearAllMocks();
    lastContentProps = null;
    mockCheckForAppUpdate.mockImplementation(() => Promise.resolve(UP_TO_DATE));
    mockVerifyCachedApk.mockImplementation(() => Promise.resolve({ exists: false }));
  });

  describe('checking', () => {
    it('checks as soon as it opens, without being asked', async () => {
      await setup();
      await waitFor(() => expect(mockCheckForAppUpdate).toHaveBeenCalledTimes(1));
    });

    it('records when the check ran', async () => {
      await setup();
      await waitFor(() => expect(mockSetPreference).toHaveBeenCalledWith('lastCheck', expect.any(String)));
    });

    it('reports being up to date', async () => {
      await setup();
      await waitFor(() => expect(lastContentProps.updateResult?.type).toBe('up_to_date'));
      expect(lastContentProps.isChecking).toBe(false);
    });

    it('offers a found update, with any verified download alongside it', async () => {
      mockCheckForAppUpdate.mockImplementation(() => Promise.resolve(AVAILABLE));
      mockVerifyCachedApk.mockImplementation(() => Promise.resolve({ exists: true, uri: 'file:///a.apk' }));

      await setup();

      await waitFor(() => expect(lastContentProps.updateResult?.type).toBe('available'));
      expect(lastContentProps.updateResult.alreadyDownloaded).toBe(true);
      expect(lastContentProps.updateResult.localUri).toBe('file:///a.apk');
    });

    it('surfaces a thrown check as an error rather than an empty panel', async () => {
      mockCheckForAppUpdate.mockImplementation(() => Promise.reject(new Error('offline')));

      await setup();

      await waitFor(() => expect(lastContentProps.updateResult?.type).toBe('error'));
    });
  });

  describe('header title', () => {
    it('names itself while checking and when nothing is new', async () => {
      const onRegisterTitle = jest.fn();
      await setup({ onRegisterTitle });

      await waitFor(() => expect(onRegisterTitle).toHaveBeenLastCalledWith('check_updates'));
    });

    it('says so once it finds an update', async () => {
      mockCheckForAppUpdate.mockImplementation(() => Promise.resolve(AVAILABLE));
      const onRegisterTitle = jest.fn();
      await setup({ onRegisterTitle });

      await waitFor(() => expect(onRegisterTitle).toHaveBeenLastCalledWith('update_available_title'));
    });

    it('gives the title back when it closes', async () => {
      const onRegisterTitle = jest.fn();
      const { unmount } = await setup({ onRegisterTitle });

      await act(async () => { unmount(); });
      expect(onRegisterTitle).toHaveBeenLastCalledWith(null);
    });
  });

  describe('build progress polling', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('re-checks on an interval while a release is still building', async () => {
      mockCheckForAppUpdate.mockImplementation(() => Promise.resolve(BUILDING));
      await setup();
      await waitFor(() => expect(mockCheckForAppUpdate).toHaveBeenCalledTimes(1));

      await act(async () => { jest.advanceTimersByTime(5000); });
      expect(mockCheckForAppUpdate).toHaveBeenCalledTimes(2);

      await act(async () => { jest.advanceTimersByTime(5000); });
      expect(mockCheckForAppUpdate).toHaveBeenCalledTimes(3);
    });

    it('does not poll when nothing is building', async () => {
      await setup();
      await waitFor(() => expect(mockCheckForAppUpdate).toHaveBeenCalledTimes(1));

      await act(async () => { jest.advanceTimersByTime(20000); });
      expect(mockCheckForAppUpdate).toHaveBeenCalledTimes(1);
    });

    it('stops polling once the panel closes', async () => {
      mockCheckForAppUpdate.mockImplementation(() => Promise.resolve(BUILDING));
      const { unmount } = await setup();
      await waitFor(() => expect(mockCheckForAppUpdate).toHaveBeenCalledTimes(1));

      await act(async () => { unmount(); });
      await act(async () => { jest.advanceTimersByTime(20000); });

      expect(mockCheckForAppUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('handing off a download', () => {
    beforeEach(() => {
      mockCheckForAppUpdate.mockImplementation(() => Promise.resolve(AVAILABLE));
    });

    it('closes the panel and starts the app-wide download', async () => {
      const onDone = jest.fn();
      await setup({ onDone });
      await waitFor(() => expect(lastContentProps.updateResult?.type).toBe('available'));

      await act(async () => {
        await lastContentProps.onUpdate('https://apk', 'https://sum', '1.1.0');
      });

      expect(onDone).toHaveBeenCalled();
      expect(mockStartDownload).toHaveBeenCalledWith('https://apk', expect.objectContaining({
        checksumUrl: 'https://sum',
      }));
    });

    it('remembers the version chosen so startup does not re-nag for it', async () => {
      await setup();
      await waitFor(() => expect(lastContentProps.updateResult?.type).toBe('available'));

      await act(async () => {
        await lastContentProps.onUpdate('https://apk', null, '1.2.0');
      });

      expect(mockSetPreference).toHaveBeenCalledWith('lastPrompted', '1.2.0');
    });

    it('falls back to the highlighted version when a row does not name one', async () => {
      await setup();
      await waitFor(() => expect(lastContentProps.updateResult?.type).toBe('available'));

      await act(async () => {
        await lastContentProps.onUpdate('https://apk', null, undefined);
      });

      expect(mockSetPreference).toHaveBeenCalledWith('lastPrompted', '1.1.0');
    });

    it('throws the cached APK away before downloading it again', async () => {
      const onDone = jest.fn();
      await setup({ onDone });
      await waitFor(() => expect(lastContentProps.updateResult?.type).toBe('available'));

      await act(async () => {
        await lastContentProps.onRedownload('https://apk', 'https://sum', '1.1.0', 'file:///cache/penny-1.1.0.apk');
      });

      // Deleting first is the whole point: the download must not reuse the suspect file.
      expect(mockDeleteDownloadedApk).toHaveBeenCalledWith('file:///cache/penny-1.1.0.apk');
      expect(mockDeleteDownloadedApk.mock.invocationCallOrder[0])
        .toBeLessThan(mockStartDownload.mock.invocationCallOrder[0]);
      expect(mockStartDownload).toHaveBeenCalledWith('https://apk', expect.objectContaining({
        checksumUrl: 'https://sum',
      }));
      expect(onDone).toHaveBeenCalled();
    });

    it('still downloads again when the cached file could not be deleted', async () => {
      mockDeleteDownloadedApk.mockImplementationOnce(() => Promise.resolve(false));
      await setup();
      await waitFor(() => expect(lastContentProps.updateResult?.type).toBe('available'));

      await act(async () => {
        await lastContentProps.onRedownload('https://apk', 'https://sum', '1.1.0', 'file:///cache/penny-1.1.0.apk');
      });

      expect(mockStartDownload).toHaveBeenCalled();
    });

    it('explains a download that could not start', async () => {
      await setup();
      await waitFor(() => expect(lastContentProps.updateResult?.type).toBe('available'));

      await act(async () => {
        await lastContentProps.onUpdate('https://apk', null, '1.1.0');
      });
      // The downloader reports failure through the callback it was handed.
      const { onError } = mockStartDownload.mock.calls[0][1];
      await act(async () => { onError(); });

      expect(mockShowDialog).toHaveBeenCalled();
    });
  });

  it('explains an APK that could no longer be installed', async () => {
    mockInstallApk.mockImplementation(() => Promise.reject(new Error('file gone')));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    await setup();
    await waitFor(() => expect(lastContentProps).not.toBeNull());

    await act(async () => {
      await lastContentProps.onInstallApk('file:///gone.apk');
    });

    expect(mockShowDialog).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
