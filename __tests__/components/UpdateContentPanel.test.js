import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';
// fireEvent is used for update button press tests
import UpdateContentPanel, { parseReleaseNotes } from '../../app/components/UpdateContentPanel';

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));

jest.mock('../../app/styles/layout', () => ({
  HORIZONTAL_PADDING: 16,
  SPACING: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  BORDER_RADIUS: { md: 8, lg: 16 },
}));


const baseProps = {
  isChecking: false,
  updateResult: null,
  downloadedApks: [],
  onUpdate: jest.fn(),
  onInstallApk: jest.fn(),
};

describe('parseReleaseNotes', () => {
  it('lifts the date out of a semantic-release heading and removes the duplicate line', () => {
    const notes = '## 0.134.15 (2026-06-17)\n\n### Performance Improvements\n\n* icon-picker tweak';
    const { date, body } = parseReleaseNotes(notes, '0.134.15');
    expect(date).toBe('2026-06-17');
    expect(body).not.toContain('0.134.15');
    expect(body).toContain('Performance Improvements');
    expect(body).toContain('icon-picker tweak');
  });

  it('keeps the whole body and returns no date when there is no version heading', () => {
    const { date, body } = parseReleaseNotes('Bug fix release', '1.2.0');
    expect(date).toBeNull();
    expect(body).toBe('Bug fix release');
  });

  it('handles empty notes gracefully', () => {
    expect(parseReleaseNotes('', '1.0.0')).toEqual({ date: null, body: '' });
  });
});

describe('UpdateContentPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when updateResult is null', async () => {
    const { toJSON } = await render(<UpdateContentPanel {...baseProps} />);
    expect(toJSON()).toBeNull();
  });

  it('shows activity indicator while checking', async () => {
    const { getByText } = await render(
      <UpdateContentPanel {...baseProps} isChecking updateResult={null} />,
    );
    expect(getByText('checking_for_updates')).toBeTruthy();
  });

  describe('up_to_date', () => {
    it('shows up-to-date message when no recentReleaseNotes', async () => {
      const { getByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{ type: 'up_to_date', recentReleaseNotes: null, releasesUrl: null }}
        />,
      );
      expect(getByText('up_to_date')).toBeTruthy();
    });

    it('shows release history when recentReleaseNotes present', async () => {
      const { getByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{
            type: 'up_to_date',
            recentReleaseNotes: [
              { version: '1.2.0', notes: 'Bug fix release' },
              { version: '1.1.0', notes: 'Initial feature' },
            ],
            releasesUrl: 'https://github.com/example/releases',
          }}
        />,
      );
      expect(getByText('release_history')).toBeTruthy();
      expect(getByText('v1.2.0')).toBeTruthy();
      expect(getByText('Bug fix release')).toBeTruthy();
    });

    it('shows more_releases link when releasesUrl is present', async () => {
      const { getByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{
            type: 'up_to_date',
            recentReleaseNotes: [{ version: '1.0.0', notes: 'Notes' }],
            releasesUrl: 'https://github.com/example/releases',
          }}
        />,
      );
      expect(getByText('more_releases')).toBeTruthy();
    });

    it('shows an inline install button on the release matching a downloaded APK', async () => {
      const { getByLabelText, queryByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{
            type: 'up_to_date',
            recentReleaseNotes: [{ version: '1.0.0', notes: 'Notes' }],
            releasesUrl: null,
          }}
          downloadedApks={[{ uri: 'file:///cache/penny-1.0.0.apk', version: '1.0.0', filename: 'penny-1.0.0.apk', modificationTime: 1700000000 }]}
        />,
      );
      // Matching APK is shown inline on its release, not in a separate list.
      expect(getByLabelText('Install version 1.0.0')).toBeTruthy();
      expect(queryByText('downloaded_apks')).toBeNull();
    });

    it('installs the matching APK when its inline button is pressed', async () => {
      const onInstallApk = jest.fn();
      const { getByLabelText } = await render(
        <UpdateContentPanel
          {...baseProps}
          onInstallApk={onInstallApk}
          updateResult={{
            type: 'up_to_date',
            recentReleaseNotes: [{ version: '1.0.0', notes: 'Notes' }],
            releasesUrl: null,
          }}
          downloadedApks={[{ uri: 'file:///cache/penny-1.0.0.apk', version: '1.0.0', filename: 'penny-1.0.0.apk', modificationTime: 1700000000 }]}
        />,
      );
      fireEvent.press(getByLabelText('Install version 1.0.0'));
      expect(onInstallApk).toHaveBeenCalledWith('file:///cache/penny-1.0.0.apk');
    });

    it('lists downloaded APKs that do not match any displayed release', async () => {
      const { getByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{
            type: 'up_to_date',
            recentReleaseNotes: [{ version: '1.0.0', notes: 'Notes' }],
            releasesUrl: null,
          }}
          downloadedApks={[{ uri: 'file:///cache/penny-0.9.0.apk', version: '0.9.0', filename: 'penny-0.9.0.apk', modificationTime: 1700000000 }]}
        />,
      );
      expect(getByText('downloaded_apks')).toBeTruthy();
    });
  });

  describe('error — generic', () => {
    it('shows error message for generic errors', async () => {
      const { getByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{ type: 'error', errorCode: 'network_error' }}
        />,
      );
      expect(getByText('update_check_failed')).toBeTruthy();
    });
  });

  describe('error — releases_without_apks', () => {
    it('shows release history with NO_APK_ATTACHED badge for releases without APK', async () => {
      const { getByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{
            type: 'error',
            errorCode: 'releases_without_apks',
            releaseNotes: [{ version: '1.3.0', notes: 'Changelog entry', hasApk: false }],
            recentReleaseNotes: null,
            releasesUrl: null,
          }}
        />,
      );
      expect(getByText('release_history')).toBeTruthy();
      expect(getByText(/no_apk_attached/)).toBeTruthy();
      expect(getByText('Changelog entry')).toBeTruthy();
    });

    it('shows older APK releases below the no-APK entry', async () => {
      const { getByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{
            type: 'error',
            errorCode: 'releases_without_apks',
            releaseNotes: [{ version: '1.3.0', notes: 'New release, no APK yet', hasApk: false }],
            recentReleaseNotes: [
              { version: '1.2.0', notes: 'Previous stable release' },
              { version: '1.1.0', notes: 'Older release' },
            ],
            releasesUrl: null,
          }}
        />,
      );
      expect(getByText('v1.2.0')).toBeTruthy();
      expect(getByText('Previous stable release')).toBeTruthy();
      expect(getByText('v1.1.0')).toBeTruthy();
    });

    it('shows history when only recentReleaseNotes is present (no releaseNotes)', async () => {
      const { getByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{
            type: 'error',
            errorCode: 'releases_without_apks',
            releaseNotes: null,
            recentReleaseNotes: [{ version: '1.2.0', notes: 'Some notes' }],
            releasesUrl: null,
          }}
        />,
      );
      expect(getByText('release_history')).toBeTruthy();
      expect(getByText('v1.2.0')).toBeTruthy();
    });

    it('falls through to error view when neither releaseNotes nor recentReleaseNotes present', async () => {
      const { getByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{
            type: 'error',
            errorCode: 'releases_without_apks',
            releaseNotes: null,
            recentReleaseNotes: null,
          }}
        />,
      );
      expect(getByText('update_releases_without_apks')).toBeTruthy();
    });

    it('shows more_releases link when releasesUrl is present', async () => {
      const { getByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{
            type: 'error',
            errorCode: 'releases_without_apks',
            releaseNotes: [{ version: '1.3.0', notes: 'No APK', hasApk: false }],
            recentReleaseNotes: null,
            releasesUrl: 'https://github.com/example/releases',
          }}
        />,
      );
      expect(getByText('more_releases')).toBeTruthy();
    });
  });

  describe('available', () => {
    const availableResult = {
      type: 'available',
      latestVersion: '2.0.0',
      currentVersion: '1.0.0',
      downloadUrl: 'https://example.com/penny-2.0.0.apk',
      checksumUrl: null,
      releaseNotes: [{ version: '2.0.0', notes: 'Major update', hasApk: true }],
      recentReleaseNotes: null,
      releasesUrl: 'https://github.com/example/releases',
      alreadyDownloaded: false,
      localUri: null,
    };

    it('shows update button and release notes', async () => {
      const { getByText } = await render(
        <UpdateContentPanel {...baseProps} updateResult={availableResult} />,
      );
      expect(getByText('update_now')).toBeTruthy();
      expect(getByText('Major update')).toBeTruthy();
    });

    it('calls onUpdate when update button pressed', async () => {
      const onUpdate = jest.fn();
      const { getByText } = await render(
        <UpdateContentPanel {...baseProps} updateResult={availableResult} onUpdate={onUpdate} />,
      );
      fireEvent.press(getByText('update_now'));
      expect(onUpdate).toHaveBeenCalledWith('https://example.com/penny-2.0.0.apk', null);
    });

    it('shows install button when already downloaded', async () => {
      const { getByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{ ...availableResult, alreadyDownloaded: true, localUri: 'file:///cache/penny-2.0.0.apk' }}
        />,
      );
      expect(getByText('update_install_now')).toBeTruthy();
    });

    it('shows install hint when no releaseNotes', async () => {
      const { getByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{ ...availableResult, releaseNotes: null, recentReleaseNotes: null }}
        />,
      );
      expect(getByText('update_install_hint')).toBeTruthy();
    });

    it('renders #PR references as links to the GitHub pull request', async () => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue();
      const { getByLabelText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{
            ...availableResult,
            releasesUrl: 'https://github.com/heywood8/money-tracker/releases',
            releaseNotes: [{ version: '2.0.0', notes: 'Fix crash (#916)', hasApk: true }],
          }}
        />,
      );
      const link = getByLabelText('Pull request 916');
      expect(link).toBeTruthy();
      fireEvent.press(link);
      expect(openURL).toHaveBeenCalledWith('https://github.com/heywood8/money-tracker/pull/916');
      openURL.mockRestore();
    });

    it('uses recentReleaseNotes when releaseNotes is null but recentReleaseNotes is present', async () => {
      const { getByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{
            ...availableResult,
            releaseNotes: null,
            recentReleaseNotes: [{ version: '1.9.0', notes: 'Recent release notes' }],
          }}
        />,
      );
      expect(getByText('Recent release notes')).toBeTruthy();
    });
  });

  describe('installed version highlighting', () => {
    it('marks the installed version as latest with a checkmark hint when up to date', async () => {
      const { getAllByText, getByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{
            type: 'up_to_date',
            currentVersion: '1.2.0',
            recentReleaseNotes: [
              { version: '1.2.0', notes: 'Latest release' },
              { version: '1.1.0', notes: 'Older release' },
            ],
            releasesUrl: null,
          }}
        />,
      );
      // The installed (and latest) release shows the "Installed" chip and the latest hint.
      expect(getAllByText('installed').length).toBeGreaterThan(0);
      expect(getByText('installed_latest_hint')).toBeTruthy();
    });

    it('marks the installed version without the latest hint when an update is available', async () => {
      const { getByText, queryByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{
            type: 'available',
            latestVersion: '2.0.0',
            currentVersion: '1.9.0',
            downloadUrl: 'https://example.com/penny-2.0.0.apk',
            checksumUrl: null,
            releaseNotes: null,
            recentReleaseNotes: [
              { version: '2.0.0', notes: 'New release' },
              { version: '1.9.0', notes: 'Installed release' },
            ],
            releasesUrl: null,
            alreadyDownloaded: false,
            localUri: null,
          }}
        />,
      );
      // Installed version is highlighted, but it is not the latest, so no green hint.
      expect(getByText('installed')).toBeTruthy();
      expect(queryByText('installed_latest_hint')).toBeNull();
    });

    it('does not highlight any release when the installed version is not in the list', async () => {
      const { queryByText } = await render(
        <UpdateContentPanel
          {...baseProps}
          updateResult={{
            type: 'up_to_date',
            currentVersion: '9.9.9',
            recentReleaseNotes: [{ version: '1.2.0', notes: 'Latest release' }],
            releasesUrl: null,
          }}
        />,
      );
      expect(queryByText('installed')).toBeNull();
      expect(queryByText('installed_latest_hint')).toBeNull();
    });
  });
});
