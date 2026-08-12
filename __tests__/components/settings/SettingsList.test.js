/* eslint-disable react/prop-types */
/**
 * Tests for the settings root. Since the preference toggles moved into the
 * Appearance and Privacy panels, what is left here is navigation — every row
 * asks the host to open a panel — plus the update row, the one row that shows
 * state of its own.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import SettingsList from '../../../app/components/settings/SettingsList';

const themeState = { colorScheme: 'light' };
const downloadState = { isDownloading: false, downloadProgress: 0, downloadPhase: null };

jest.mock('../../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      text: '#000', mutedText: '#888', border: '#ddd',
      primary: '#6200ee', destructive: '#d9534f', background: '#fff',
    },
  }),
}));
jest.mock('../../../app/contexts/ThemeConfigContext', () => ({
  useThemeConfig: () => ({ colorScheme: themeState.colorScheme, setTheme: jest.fn() }),
}));
jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key, language: 'en' }),
}));
jest.mock('../../../app/contexts/UpdateDownloadContext', () => ({
  useUpdateDownload: () => ({ ...downloadState }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => React.createElement(Text, { testID: `icon-${name}` }, name);
  return Icon;
});

const setup = (props = {}) => render(<SettingsList onOpenPanel={jest.fn()} {...props} />);

describe('SettingsList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    themeState.colorScheme = 'light';
    downloadState.isDownloading = false;
    downloadState.downloadProgress = 0;
    downloadState.downloadPhase = null;
  });

  describe('opening panels', () => {
    it.each([
      ['settings-language-row', 'language'],
      ['settings-appearance-row', 'appearance'],
      ['settings-privacy-row', 'privacy'],
      ['settings-accounts-row', 'accounts'],
      ['settings-categories-row', 'categories'],
      ['settings-notification-processing-row', 'notificationProcessing'],
      ['settings-export-row', 'export'],
      ['settings-import-row', 'import'],
      ['logs-row', 'logs'],
      ['check-updates-row', 'update'],
      ['settings-reset-row', 'reset'],
    ])('asks the host to open %s', async (testID, panel) => {
      const onOpenPanel = jest.fn();
      const { getByTestId } = await setup({ onOpenPanel });

      await act(async () => {
        fireEvent.press(getByTestId(testID));
      });

      expect(onOpenPanel).toHaveBeenCalledWith(panel);
    });
  });

  describe('grouping', () => {
    // The whole point of the grouping: the preferences are one tap in, not on
    // the root pushing everything else below the fold.
    it('does not render the grouped preference rows itself', async () => {
      const { queryByTestId } = await setup();

      expect(queryByTestId('settings-theme-row')).toBeNull();
      expect(queryByTestId('settings-show-accounts-tab-row')).toBeNull();
      expect(queryByTestId('settings-show-budget-tab-row')).toBeNull();
      expect(queryByTestId('settings-show-quickadd-panel-row')).toBeNull();
      expect(queryByTestId('settings-hide-balances-row')).toBeNull();
      expect(queryByTestId('settings-location-row')).toBeNull();
    });

    it('follows the theme in the appearance row icon', async () => {
      themeState.colorScheme = 'dark';
      const { getByTestId } = await setup();
      expect(getByTestId('icon-moon-outline')).toBeTruthy();
    });
  });

  describe('the update row', () => {
    it('shows the installed version when idle', async () => {
      const { getByText } = await setup();
      expect(getByText(/^v\d/)).toBeTruthy();
    });

    it('reports download progress instead of opening the panel', async () => {
      downloadState.isDownloading = true;
      downloadState.downloadProgress = 0.42;
      const onOpenPanel = jest.fn();
      const { getByText, getByTestId } = await setup({ onOpenPanel });

      expect(getByText('42%')).toBeTruthy();

      await act(async () => { fireEvent.press(getByTestId('check-updates-row')); });
      expect(onOpenPanel).not.toHaveBeenCalled();
    });

    it.each([
      ['verifying', 'update_phase_verifying'],
      ['backing_up', 'update_phase_backing_up'],
    ])('names the %s phase rather than showing a percentage', async (phase, label) => {
      downloadState.isDownloading = true;
      downloadState.downloadPhase = phase;
      const { getByText } = await setup();
      expect(getByText(label)).toBeTruthy();
    });
  });
});
