/* eslint-disable react/prop-types */
/**
 * The appearance subpanel: theme plus the three toggles that decide what the
 * bottom navigation and the operations screen offer. Moved here from the
 * settings root when the preferences were grouped into panels.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import AppearancePanel from '../../../app/components/settings/AppearancePanel';

const mockSetTheme = jest.fn();
const mockSetShowAccountsTab = jest.fn();
const mockSetShowBudgetTab = jest.fn();
const mockSetShowQuickAddPanel = jest.fn();

const display = {
  showAccountsTab: false,
  showBudgetTab: true,
  showQuickAddPanel: true,
};
const themeState = { colorScheme: 'light' };

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
jest.mock('../../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: () => ({
    showAccountsTab: display.showAccountsTab,
    setShowAccountsTab: mockSetShowAccountsTab,
    showBudgetTab: display.showBudgetTab,
    setShowBudgetTab: mockSetShowBudgetTab,
    showQuickAddPanel: display.showQuickAddPanel,
    setShowQuickAddPanel: mockSetShowQuickAddPanel,
  }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => React.createElement(Text, { testID: `icon-${name}` }, name);
  return Icon;
});

const setup = () => render(<AppearancePanel bottomInset={0} />);

describe('AppearancePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    display.showAccountsTab = false;
    display.showBudgetTab = true;
    display.showQuickAddPanel = true;
    themeState.colorScheme = 'light';
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
});
