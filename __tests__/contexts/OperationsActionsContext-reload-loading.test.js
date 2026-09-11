/**
 * Regression test for issue #1703 (OperationsActionsContext half).
 *
 * RELOAD_ALL is a background refresh (a balance edit, the bank-notification
 * pipeline on every foreground, a category change). OperationsScreen passes
 * `operationsLoading` straight into the list as `initialLoading`, which swaps
 * the rows for the skeleton, so the reload must not raise it.
 *
 * The refetch is driven through a promise the test resolves by hand: React
 * would otherwise batch the flag up and back down inside one act() and the
 * intermediate render would never happen.
 */

jest.unmock('../../app/contexts/OperationsDataContext');
jest.unmock('../../app/contexts/OperationsActionsContext');

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useOperationsData } from '../../app/contexts/OperationsDataContext';
import { OperationsProvider } from '../../app/contexts/OperationsContext';
import * as OperationsDB from '../../app/services/OperationsDB';

jest.mock('../../app/services/OperationsDB');
jest.mock('../../app/services/PreferencesDB', () => ({
  setJsonPreference: jest.fn(() => Promise.resolve()),
  getJsonPreference: jest.fn(() => Promise.resolve(null)),
  setPreference: jest.fn(() => Promise.resolve()),
  getPreference: jest.fn(() => Promise.resolve(null)),
  PREF_KEYS: { OPERATIONS_FILTERS: 'operations_active_filters' },
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
      RELOAD_ALL: 'reload:all',
      DATABASE_RESET: 'database:reset',
      OPERATION_CHANGED: 'operation:changed',
    },
  };
});

const mockAccounts = [{ id: 'acc-1', name: 'Cash', balance: '100', currency: 'USD' }];
const mockAccountsValue = { accounts: mockAccounts, loading: false };
jest.mock('../../app/contexts/AccountsDataContext', () => ({
  AccountsDataProvider: ({ children }) => children,
  useAccountsData: () => mockAccountsValue,
}));

const mockActionsValue = { reloadAccounts: jest.fn() };
jest.mock('../../app/contexts/AccountsActionsContext', () => ({
  AccountsActionsProvider: ({ children }) => children,
  useAccountsActions: () => mockActionsValue,
}));

const mockCategoriesValue = { categories: [], getCategoryPath: () => [], loading: false };
jest.mock('../../app/contexts/CategoriesContext', () => ({
  CategoriesProvider: ({ children }) => children,
  useCategories: () => mockCategoriesValue,
}));

const mockLocalizationValue = { t: (key) => key, currentLanguage: 'en' };
jest.mock('../../app/contexts/LocalizationContext', () => ({
  LocalizationProvider: ({ children }) => children,
  useLocalization: () => mockLocalizationValue,
}));

const mockDialogValue = { showDialog: jest.fn(), hideDialog: jest.fn() };
jest.mock('../../app/contexts/DialogContext', () => ({
  DialogProvider: ({ children }) => children,
  useDialog: () => mockDialogValue,
}));

const { appEvents, EVENTS } = require('../../app/services/eventEmitter');

const OPERATIONS = [
  { id: 'op-1', amount: '10', type: 'expense', date: '2026-09-01', accountId: 'acc-1' },
];

const wrapper = ({ children }) => <OperationsProvider>{children}</OperationsProvider>;

describe('OperationsActionsContext - RELOAD_ALL loading state (#1703)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appEvents._reset();
    OperationsDB.getOperationsByWeekOffset.mockResolvedValue(OPERATIONS);
    OperationsDB.getFilteredOperationsAllDates.mockResolvedValue([]);
    OperationsDB.getAllOperations.mockResolvedValue([]);
  });

  it('keeps loading false while RELOAD_ALL refetches the page', async () => {
    const { result, unmount } = await renderHook(() => useOperationsData(), { wrapper });

    await waitFor(() => expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let finish;
    OperationsDB.getOperationsByWeekOffset.mockImplementationOnce(
      () => new Promise((resolve) => { finish = () => resolve(OPERATIONS); }),
    );

    await act(async () => { appEvents.emit(EVENTS.RELOAD_ALL); });

    // Mid-reload: the rows already rendered are still valid, so the list must
    // not fall back to its skeleton.
    expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);

    await act(async () => { finish(); });
    expect(result.current.loading).toBe(false);
    unmount();
  });

  it('still raises loading when RELOAD_ALL arrives with an empty list', async () => {
    // First launch: seeding the categories and the default operations emits
    // RELOAD_ALL over a list that has nothing to preserve, so the skeleton is
    // the right answer and the empty state would be a lie.
    OperationsDB.getOperationsByWeekOffset.mockResolvedValue([]);
    const { result, unmount } = await renderHook(() => useOperationsData(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.operations).toHaveLength(0);

    let finish;
    OperationsDB.getOperationsByWeekOffset.mockImplementationOnce(
      () => new Promise((resolve) => { finish = () => resolve(OPERATIONS); }),
    );

    await act(async () => { appEvents.emit(EVENTS.RELOAD_ALL); });
    expect(result.current.loading).toBe(true);

    await act(async () => { finish(); });
    expect(result.current.loading).toBe(false);
    unmount();
  });
});
