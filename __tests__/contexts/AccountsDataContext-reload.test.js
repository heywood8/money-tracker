/**
 * Regression tests for issue #1703 (AccountsDataContext half).
 *
 * RELOAD_ALL is a *background* refresh: it fires after a balance edit, from the
 * bank-notification pipeline on every foreground, and on category changes. The
 * accounts already on screen stay valid, so the reload must not raise `loading`
 * — AccountsScreen reads that flag as "there is nothing to show yet" and returns
 * a LoadingView instead of the list, remounting it and losing scroll position.
 *
 * Each reload is driven through a promise the test resolves by hand, so the
 * in-flight state is observable: React would otherwise batch the flag up and
 * back down inside one act() and the intermediate render would never happen.
 */

jest.unmock('../../app/contexts/AccountsDataContext');
jest.unmock('../../app/contexts/AccountsActionsContext');

jest.mock('../../app/services/PreferencesDB');

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AccountsProvider } from '../../app/contexts/AccountsContext';
import { useAccountsData } from '../../app/contexts/AccountsDataContext';
import * as AccountsDB from '../../app/services/AccountsDB';

jest.mock('../../app/services/AccountsDB');
jest.mock('../../app/services/OperationsDB', () => ({
  initializeDefaultOperations: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../app/services/CategoriesDB', () => ({
  getAllCategories: jest.fn().mockResolvedValue([]),
}));

// Stable identity: a fresh object per render would change `loadAccounts`'
// dependencies and re-run the mount effect on every render.
const mockDialogValue = { showDialog: jest.fn(), hideDialog: jest.fn() };
jest.mock('../../app/contexts/DialogContext', () => ({
  DialogProvider: ({ children }) => children,
  useDialog: () => mockDialogValue,
}));

// A real (tiny) emitter, so the test fires RELOAD_ALL at the listener the
// context actually registered rather than asserting on an implementation detail.
jest.mock('../../app/services/eventEmitter', () => {
  const listeners = {};
  return {
    appEvents: {
      on: (event, handler) => {
        (listeners[event] = listeners[event] || []).push(handler);
        return () => {
          listeners[event] = (listeners[event] || []).filter(h => h !== handler);
        };
      },
      emit: (event, payload) => {
        (listeners[event] || []).slice().forEach(h => h(payload));
      },
      _reset: () => { Object.keys(listeners).forEach(k => delete listeners[k]); },
    },
    EVENTS: {
      RELOAD_ALL: 'RELOAD_ALL',
      DATABASE_RESET: 'DATABASE_RESET',
      OPERATION_CHANGED: 'OPERATION_CHANGED',
    },
  };
});

const { appEvents, EVENTS } = require('../../app/services/eventEmitter');

const ACCOUNTS = [{ id: 'acc-1', name: 'Cash', balance: '100', currency: 'USD' }];

/** Queues a getAllAccounts call the test resolves by hand. */
const pendingLoad = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  AccountsDB.getAllAccounts.mockImplementationOnce(() => promise);
  return (accounts = ACCOUNTS) => resolve(accounts);
};

const wrapper = ({ children }) => <AccountsProvider>{children}</AccountsProvider>;

describe('AccountsDataContext - RELOAD_ALL loading state (#1703)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appEvents._reset();
    AccountsDB.getAllAccounts.mockResolvedValue(ACCOUNTS);
  });

  const mountLoaded = async () => {
    const view = await renderHook(() => useAccountsData(), { wrapper });
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(view.result.current.accounts).toHaveLength(1);
    return view;
  };

  it('raises loading for the very first load', async () => {
    const finish = pendingLoad();
    const { result, unmount } = await renderHook(() => useAccountsData(), { wrapper });

    expect(result.current.loading).toBe(true);
    expect(result.current.refreshing).toBe(false);

    await act(async () => { finish(); });
    expect(result.current.loading).toBe(false);
    unmount();
  });

  it('keeps loading false on RELOAD_ALL and reports it through refreshing', async () => {
    const { result, unmount } = await mountLoaded();

    const finish = pendingLoad();
    await act(async () => { appEvents.emit(EVENTS.RELOAD_ALL); });

    // Mid-reload: the previously loaded accounts are still on hand, so the
    // screen must keep rendering the list rather than a LoadingView.
    expect(AccountsDB.getAllAccounts).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(true);
    expect(result.current.accounts).toHaveLength(1);

    await act(async () => { finish(); });
    expect(result.current.refreshing).toBe(false);
    expect(result.current.loading).toBe(false);
    unmount();
  });

  it('raises loading, not refreshing, when a retry follows a failed first load', async () => {
    AccountsDB.getAllAccounts.mockRejectedValueOnce(new Error('db is gone'));
    const { result, unmount } = await renderHook(() => useAccountsData(), { wrapper });

    await waitFor(() => expect(result.current.error).toBe('db is gone'));
    expect(result.current.accounts).toHaveLength(0);

    // Nothing was ever shown, so the retry is still a foreground load: the
    // error screen must not sit there with no feedback.
    const finish = pendingLoad();
    await act(async () => { appEvents.emit(EVENTS.RELOAD_ALL); });
    expect(result.current.loading).toBe(true);
    expect(result.current.refreshing).toBe(false);

    await act(async () => { finish(); });
    expect(result.current.loading).toBe(false);
    expect(result.current.accounts).toHaveLength(1);
    unmount();
  });

  it('raises loading again for the reload that follows a database reset', async () => {
    const { result, unmount } = await mountLoaded();

    const finish = pendingLoad();
    await act(async () => {
      appEvents.emit(EVENTS.DATABASE_RESET);
      appEvents.emit(EVENTS.RELOAD_ALL);
    });

    // Nothing to show after a reset, so this one is a foreground load again.
    expect(result.current.loading).toBe(true);
    expect(result.current.refreshing).toBe(false);

    await act(async () => { finish(); });
    expect(result.current.loading).toBe(false);
    unmount();
  });
});
