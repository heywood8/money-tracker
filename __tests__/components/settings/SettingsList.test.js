/* eslint-disable react/prop-types */
/**
 * Tests for the settings root. The rows themselves are covered end-to-end
 * through SettingsScreen; what is worth testing here is the part with decisions
 * in it — the toggles, and in particular the two that can be refused by the OS.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import SettingsList from '../../../app/components/settings/SettingsList';

const mockSetTheme = jest.fn();
const mockSetHideBalances = jest.fn();
const mockSetAttachLocation = jest.fn();
const mockSetShowAccountsTab = jest.fn();
const mockSetShowBudgetTab = jest.fn();
const mockSetShowQuickAddPanel = jest.fn();
const mockAuthenticate = jest.fn();
const mockEnsureLocationPermission = jest.fn();
const mockShowDialog = jest.fn();

const display = {
  hideBalances: false,
  attachLocation: false,
  showAccountsTab: false,
  showBudgetTab: true,
  showQuickAddPanel: true,
};
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
  useThemeConfig: () => ({ colorScheme: themeState.colorScheme, setTheme: mockSetTheme }),
}));
jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key, language: 'en' }),
}));
jest.mock('../../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: mockShowDialog }),
}));
jest.mock('../../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: () => ({
    hideBalances: display.hideBalances,
    setHideBalances: mockSetHideBalances,
    attachLocation: display.attachLocation,
    setAttachLocation: mockSetAttachLocation,
    showAccountsTab: display.showAccountsTab,
    setShowAccountsTab: mockSetShowAccountsTab,
    showBudgetTab: display.showBudgetTab,
    setShowBudgetTab: mockSetShowBudgetTab,
    showQuickAddPanel: display.showQuickAddPanel,
    setShowQuickAddPanel: mockSetShowQuickAddPanel,
  }),
}));
jest.mock('../../../app/contexts/UpdateDownloadContext', () => ({
  useUpdateDownload: () => ({ ...downloadState }),
}));
jest.mock('../../../app/services/BiometricService', () => ({
  authenticateWithBiometrics: (...a) => mockAuthenticate(...a),
  BiometricResult: {
    SUCCESS: 'success',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    NOT_AVAILABLE: 'not_available',
    NOT_ENROLLED: 'not_enrolled',
  },
}));
jest.mock('../../../app/services/LocationService', () => ({
  ensureLocationPermission: (...a) => mockEnsureLocationPermission(...a),
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
    display.hideBalances = false;
    display.attachLocation = false;
    display.showAccountsTab = false;
    display.showBudgetTab = true;
    display.showQuickAddPanel = true;
    themeState.colorScheme = 'light';
    downloadState.isDownloading = false;
    downloadState.downloadProgress = 0;
    downloadState.downloadPhase = null;
  });

  describe('opening panels', () => {
    it.each([
      ['settings-language-row', 'language'],
      ['settings-accounts-row', 'accounts'],
      ['settings-categories-row', 'categories'],
      ['settings-notification-processing-row', 'notificationProcessing'],
      ['settings-export-row', 'export'],
      ['logs-row', 'logs'],
      ['check-updates-row', 'update'],
    ])('asks the host to open %s', async (testID, panel) => {
      const onOpenPanel = jest.fn();
      const { getByTestId } = await setup({ onOpenPanel });

      await act(async () => {
        fireEvent.press(getByTestId(testID));
      });

      expect(onOpenPanel).toHaveBeenCalledWith(panel);
    });
  });

  describe('theme', () => {
    it('switches to dark from light', async () => {
      const { getByTestId } = await setup();
      await act(async () => { fireEvent.press(getByTestId('settings-theme-row')); });
      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });

    it('switches back to light from dark', async () => {
      themeState.colorScheme = 'dark';
      const { getByTestId } = await setup();
      await act(async () => { fireEvent.press(getByTestId('settings-theme-row')); });
      expect(mockSetTheme).toHaveBeenCalledWith('light');
    });
  });

  describe('tab visibility', () => {
    it('turns the accounts tab on', async () => {
      const { getByTestId } = await setup();
      await act(async () => { fireEvent.press(getByTestId('settings-show-accounts-tab-row')); });
      expect(mockSetShowAccountsTab).toHaveBeenCalledWith(true);
    });

    it('turns the budget tab off', async () => {
      const { getByTestId } = await setup();
      await act(async () => { fireEvent.press(getByTestId('settings-show-budget-tab-row')); });
      expect(mockSetShowBudgetTab).toHaveBeenCalledWith(false);
    });
  });

  describe('quick-add panel', () => {
    it('collapses the panel behind the + button', async () => {
      const { getByTestId } = await setup();
      await act(async () => { fireEvent.press(getByTestId('settings-show-quickadd-panel-row')); });
      expect(mockSetShowQuickAddPanel).toHaveBeenCalledWith(false);
    });

    it('pins the panel open again', async () => {
      display.showQuickAddPanel = false;
      const { getByTestId } = await setup();
      await act(async () => { fireEvent.press(getByTestId('settings-show-quickadd-panel-row')); });
      expect(mockSetShowQuickAddPanel).toHaveBeenCalledWith(true);
    });
  });

  describe('hiding balances', () => {
    it('hides without asking — there is nothing to protect yet', async () => {
      const { getByText } = await setup();

      await act(async () => { fireEvent.press(getByText('hide_balances')); });

      expect(mockSetHideBalances).toHaveBeenCalledWith(true);
      expect(mockAuthenticate).not.toHaveBeenCalled();
    });

    it('asks for biometrics before revealing them again', async () => {
      display.hideBalances = true;
      mockAuthenticate.mockResolvedValue('success');
      const { getByText } = await setup();

      await act(async () => { fireEvent.press(getByText('hide_balances')); });

      expect(mockAuthenticate).toHaveBeenCalled();
      expect(mockSetHideBalances).toHaveBeenCalledWith(false);
    });

    it.each(['not_available', 'not_enrolled'])(
      'reveals anyway when the device cannot check (%s)',
      async (result) => {
        // Refusing here would lock the user out of their own balances on a
        // device that simply has no biometrics set up.
        display.hideBalances = true;
        mockAuthenticate.mockResolvedValue(result);
        const { getByText } = await setup();

        await act(async () => { fireEvent.press(getByText('hide_balances')); });

        expect(mockSetHideBalances).toHaveBeenCalledWith(false);
      },
    );

    it('keeps them hidden and says so when authentication fails', async () => {
      display.hideBalances = true;
      mockAuthenticate.mockResolvedValue('failed');
      const { getByText } = await setup();

      await act(async () => { fireEvent.press(getByText('hide_balances')); });

      expect(mockSetHideBalances).not.toHaveBeenCalled();
      expect(mockShowDialog).toHaveBeenCalled();
    });

    it('keeps them hidden and stays quiet when the prompt is cancelled', async () => {
      display.hideBalances = true;
      mockAuthenticate.mockResolvedValue('cancelled');
      const { getByText } = await setup();

      await act(async () => { fireEvent.press(getByText('hide_balances')); });

      expect(mockSetHideBalances).not.toHaveBeenCalled();
      expect(mockShowDialog).not.toHaveBeenCalled();
    });
  });

  describe('attaching location', () => {
    it('asks the OS before turning on, and turns on when granted', async () => {
      mockEnsureLocationPermission.mockResolvedValue({ granted: true });
      const { getByTestId } = await setup();

      await act(async () => { fireEvent.press(getByTestId('settings-location-row')); });

      expect(mockSetAttachLocation).toHaveBeenCalledWith(true);
    });

    it('stays off and explains itself when the OS refuses', async () => {
      mockEnsureLocationPermission.mockResolvedValue({ granted: false });
      const { getByTestId, getByText } = await setup();

      await act(async () => { fireEvent.press(getByTestId('settings-location-row')); });

      // Never flipped on without permission, and the row says why.
      expect(mockSetAttachLocation).toHaveBeenCalledWith(false);
      expect(getByText('location_permission_denied')).toBeTruthy();
    });

    it('turns off without asking for anything', async () => {
      display.attachLocation = true;
      const { getByTestId } = await setup();

      await act(async () => { fireEvent.press(getByTestId('settings-location-row')); });

      expect(mockEnsureLocationPermission).not.toHaveBeenCalled();
      expect(mockSetAttachLocation).toHaveBeenCalledWith(false);
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
