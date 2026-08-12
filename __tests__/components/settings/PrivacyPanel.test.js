/* eslint-disable react/prop-types */
/**
 * The privacy subpanel: the two toggles that can be refused by the OS. Moved
 * here from the settings root when the preferences were grouped into panels —
 * the biometric and location-permission paths are the part worth testing.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import PrivacyPanel from '../../../app/components/settings/PrivacyPanel';

const mockSetHideBalances = jest.fn();
const mockSetAttachLocation = jest.fn();
const mockAuthenticate = jest.fn();
const mockEnsureLocationPermission = jest.fn();
const mockShowDialog = jest.fn();

const display = {
  hideBalances: false,
  attachLocation: false,
};

jest.mock('../../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      text: '#000', mutedText: '#888', border: '#ddd',
      primary: '#6200ee', destructive: '#d9534f', background: '#fff',
    },
  }),
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
  }),
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

const mockBusyChange = jest.fn();

const setup = () => render(<PrivacyPanel onBusyChange={mockBusyChange} bottomInset={0} />);

describe('PrivacyPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    display.hideBalances = false;
    display.attachLocation = false;
  });

  describe('hiding balances', () => {
    it('hides without asking — there is nothing to protect yet', async () => {
      const { getByTestId } = await setup();

      await act(async () => { fireEvent.press(getByTestId('settings-hide-balances-row')); });

      expect(mockSetHideBalances).toHaveBeenCalledWith(true);
      expect(mockAuthenticate).not.toHaveBeenCalled();
    });

    it('asks for biometrics before revealing them again', async () => {
      display.hideBalances = true;
      mockAuthenticate.mockResolvedValue('success');
      const { getByTestId } = await setup();

      await act(async () => { fireEvent.press(getByTestId('settings-hide-balances-row')); });

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
        const { getByTestId } = await setup();

        await act(async () => { fireEvent.press(getByTestId('settings-hide-balances-row')); });

        expect(mockSetHideBalances).toHaveBeenCalledWith(false);
      },
    );

    it('keeps them hidden and says so when authentication fails', async () => {
      display.hideBalances = true;
      mockAuthenticate.mockResolvedValue('failed');
      const { getByTestId } = await setup();

      await act(async () => { fireEvent.press(getByTestId('settings-hide-balances-row')); });

      expect(mockSetHideBalances).not.toHaveBeenCalled();
      expect(mockShowDialog).toHaveBeenCalled();
    });

    it('keeps them hidden and stays quiet when the prompt is cancelled', async () => {
      display.hideBalances = true;
      mockAuthenticate.mockResolvedValue('cancelled');
      const { getByTestId } = await setup();

      await act(async () => { fireEvent.press(getByTestId('settings-hide-balances-row')); });

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

  // A system prompt pauses the activity, which the host reads as the app being
  // backgrounded and answers by closing the subpanel. Declaring the panel busy
  // while a prompt is up is what keeps it mounted long enough to record the
  // answer — without it, a denial's inline hint would never be shown.
  describe('while a system prompt is up', () => {
    it('holds the panel open through the location permission request', async () => {
      let resolvePermission;
      mockEnsureLocationPermission.mockReturnValue(new Promise((resolve) => { resolvePermission = resolve; }));
      const { getByTestId, getByText } = await setup();

      await act(async () => { fireEvent.press(getByTestId('settings-location-row')); });
      expect(mockBusyChange).toHaveBeenCalledWith(true);

      await act(async () => { resolvePermission({ granted: false }); });
      expect(mockBusyChange).toHaveBeenLastCalledWith(false);
      expect(getByText('location_permission_denied')).toBeTruthy();
    });

    it('holds the panel open through the biometric prompt', async () => {
      display.hideBalances = true;
      let resolveAuth;
      mockAuthenticate.mockReturnValue(new Promise((resolve) => { resolveAuth = resolve; }));
      const { getByTestId } = await setup();

      await act(async () => { fireEvent.press(getByTestId('settings-hide-balances-row')); });
      expect(mockBusyChange).toHaveBeenCalledWith(true);

      await act(async () => { resolveAuth('success'); });
      expect(mockBusyChange).toHaveBeenLastCalledWith(false);
      expect(mockSetHideBalances).toHaveBeenCalledWith(false);
    });

    it('releases the lock even when the prompt throws', async () => {
      mockEnsureLocationPermission.mockRejectedValue(new Error('permission module unavailable'));
      const { getByTestId } = await setup();

      await act(async () => {
        try {
          await fireEvent.press(getByTestId('settings-location-row'));
        } catch {
          // The rejection propagates out of the handler; what matters here is
          // that the panel does not stay locked behind a prompt that is gone.
        }
      });

      expect(mockBusyChange).toHaveBeenLastCalledWith(false);
    });
  });
});
