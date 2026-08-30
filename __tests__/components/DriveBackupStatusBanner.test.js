/**
 * Tests for DriveBackupStatusBanner.js
 *
 * The banner is the only sign an automatic backup is happening once the user has
 * navigated away from settings, so what matters is that it appears exactly while
 * a run is in flight, names the phase it is in, and never intercepts touches.
 *
 * Note on the two-spinner bug this component was fixed for: Paper's
 * ActivityIndicator drew its ring as two half-layers clipped with
 * `overflow: hidden`, and the clip failed inside this elevated, animated pill, so
 * the lower half escaped below the plate. That is native clipping behaviour with
 * no representation in the test renderer — it cannot be asserted here, and was
 * verified on the device instead.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import DriveBackupStatusBanner from '../../app/components/DriveBackupStatusBanner';

let mockDriveState = { isRunning: false, progress: null };

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: { text: '#000', mutedText: '#888', primary: '#6200ee', border: '#ddd', surface: '#fff' },
  }),
}));
jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));
jest.mock('../../app/contexts/DriveBackupContext', () => ({
  useDriveBackup: () => mockDriveState,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React2 = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => React2.createElement(Text, { testID: `icon-${name}` }, name);
  return Icon;
});

beforeEach(() => {
  mockDriveState = { isRunning: false, progress: null };
});

describe('DriveBackupStatusBanner', () => {
  it('stays out of the way while no backup is running', async () => {
    const { queryByTestId } = await render(<DriveBackupStatusBanner />);
    expect(queryByTestId('drive-backup-status-banner')).toBeNull();
  });

  it('appears while a run is in flight', async () => {
    mockDriveState = { isRunning: true, progress: { phase: 'preparing' } };
    const { getByTestId } = await render(<DriveBackupStatusBanner />);
    expect(getByTestId('drive-backup-status-banner')).toBeTruthy();
  });

  // One render per case: the pill starts an entry animation on mount, and
  // several renders inside a single test overlap each other's act() scopes.
  it.each([
    ['preparing', 'drive_backup_status_preparing'],
    ['folder', 'drive_backup_status_connecting'],
    ['cleanup', 'drive_backup_status_cleanup'],
  ])('names the %s phase', async (phase, expected) => {
    mockDriveState = { isRunning: true, progress: { phase } };
    const { getByText } = await render(<DriveBackupStatusBanner />);
    expect(getByText(expected)).toBeTruthy();
  });

  it('counts the files as they upload', async () => {
    mockDriveState = { isRunning: true, progress: { phase: 'uploading', current: 2, total: 3 } };
    const { getByText } = await render(<DriveBackupStatusBanner />);
    expect(getByText('drive_backup_status_uploading 2/3')).toBeTruthy();
  });

  it('falls back to a generic line for an unrecognised phase', async () => {
    mockDriveState = { isRunning: true, progress: { phase: 'something-new' } };
    const { getByText } = await render(<DriveBackupStatusBanner />);
    expect(getByText('drive_backup_status_running')).toBeTruthy();
  });

  it('takes no touches, so it cannot block the screen underneath', async () => {
    mockDriveState = { isRunning: true, progress: { phase: 'uploading', current: 1, total: 3 } };
    const { getByTestId } = await render(<DriveBackupStatusBanner />);
    const pill = getByTestId('drive-backup-status-banner');
    // The host wraps the pill and is the view that owns pointerEvents.
    expect(pill.parent.props.pointerEvents ?? pill.parent.parent.props.pointerEvents).toBe('none');
  });
});
