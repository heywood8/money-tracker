/* eslint-disable react/prop-types */
/**
 * Tests for the reset-database confirmation subpanel. The interesting part is
 * not the wipe — it is the busy signal the panel owes its host, because the host
 * locks back navigation on it and would strand the user if it were ever left on.
 */

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import ResetPanel from '../../../app/components/settings/ResetPanel';

const mockResetDatabase = jest.fn(() => Promise.resolve());
const mockShowDialog = jest.fn();

jest.mock('../../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: { text: '#000', destructive: '#d9534f' },
  }),
}));

jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));

jest.mock('../../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: mockShowDialog }),
}));

jest.mock('../../../app/contexts/AccountsActionsContext', () => ({
  useAccountsActions: () => ({ resetDatabase: mockResetDatabase }),
}));

jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => React.createElement(Text, { testID: `icon-${name}` }, name);
  return Icon;
});

describe('ResetPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResetDatabase.mockImplementation(() => Promise.resolve());
  });

  it('warns before offering the destructive action', async () => {
    const { getByText, getByTestId } = await render(
      <ResetPanel onDone={jest.fn()} onBusyChange={jest.fn()} />,
    );

    expect(getByTestId('icon-warning-outline')).toBeTruthy();
    expect(getByText('reset_database_confirm')).toBeTruthy();
    expect(getByText('reset')).toBeTruthy();
  });

  it('reports not-busy on mount so a fresh panel never arrives locked', async () => {
    const onBusyChange = jest.fn();
    await render(<ResetPanel onDone={jest.fn()} onBusyChange={onBusyChange} />);

    expect(onBusyChange).toHaveBeenCalledWith(false);
  });

  it('wipes the database and hands completion back to the host', async () => {
    const onDone = jest.fn();
    const { getByText } = await render(
      <ResetPanel onDone={onDone} onBusyChange={jest.fn()} />,
    );

    await act(async () => {
      fireEvent.press(getByText('reset'));
    });

    expect(mockResetDatabase).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it('holds the panel open with a spinner while the wipe runs', async () => {
    let release;
    mockResetDatabase.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const onBusyChange = jest.fn();
    const { getByText, queryByText } = await render(
      <ResetPanel onDone={jest.fn()} onBusyChange={onBusyChange} />,
    );

    await act(async () => {
      fireEvent.press(getByText('reset'));
    });

    // Busy: the host is told to lock back navigation, and the button reads as
    // working rather than sitting there looking untapped (QoL-13).
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(getByText('resetting_database')).toBeTruthy();
    expect(queryByText('reset')).toBeNull();

    await act(async () => {
      release();
    });
  });

  it('ignores a second tap while a wipe is already running', async () => {
    let release;
    mockResetDatabase.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const { getByText } = await render(
      <ResetPanel onDone={jest.fn()} onBusyChange={jest.fn()} />,
    );

    await act(async () => {
      fireEvent.press(getByText('reset'));
    });
    await act(async () => {
      fireEvent.press(getByText('resetting_database'));
    });

    expect(mockResetDatabase).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
    });
  });

  it('releases the busy lock and reports the failure when the wipe throws', async () => {
    mockResetDatabase.mockImplementation(() => Promise.reject(new Error('disk on fire')));
    const onBusyChange = jest.fn();
    const onDone = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { getByText } = await render(
      <ResetPanel onDone={onDone} onBusyChange={onBusyChange} />,
    );

    await act(async () => {
      fireEvent.press(getByText('reset'));
    });

    await waitFor(() => expect(mockShowDialog).toHaveBeenCalled());
    // A failed wipe must not leave the host locked out of its own back button.
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(onDone).not.toHaveBeenCalled();
    expect(mockShowDialog.mock.calls[0][1]).toBe('disk on fire');

    consoleError.mockRestore();
  });

  it('releases the busy lock when unmounted mid-wipe', async () => {
    let release;
    mockResetDatabase.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const onBusyChange = jest.fn();
    const { getByText, unmount } = await render(
      <ResetPanel onDone={jest.fn()} onBusyChange={onBusyChange} />,
    );

    await act(async () => {
      fireEvent.press(getByText('reset'));
    });
    expect(onBusyChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      unmount();
    });

    // Otherwise the host keeps refusing back gestures for a panel that is gone.
    expect(onBusyChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      release();
    });
  });
});
