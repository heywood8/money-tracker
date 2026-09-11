// Unmock the split contexts to use real implementations
jest.unmock('../../app/contexts/OperationsDataContext');
jest.unmock('../../app/contexts/OperationsActionsContext');
jest.unmock('../../app/contexts/AccountsDataContext');
jest.unmock('../../app/contexts/AccountsActionsContext');

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useOperationsActions } from '../../app/contexts/OperationsActionsContext';
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

jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: { on: jest.fn(() => jest.fn()), emit: jest.fn() },
  EVENTS: { RELOAD_ALL: 'reload:all', OPERATION_CHANGED: 'operation:changed' },
}));

jest.mock('../../app/contexts/AccountsDataContext', () => ({
  AccountsDataProvider: ({ children }) => children,
  useAccountsData: () => ({ accounts: [], loading: false }),
}));

jest.mock('../../app/contexts/AccountsActionsContext', () => ({
  AccountsActionsProvider: ({ children }) => children,
  useAccountsActions: () => ({ reloadAccounts: jest.fn() }),
}));

// A three-level tree: Travel > Flights > Long haul. The SQL search joins the
// operation's category and its immediate parent only, so "Travel" reaches
// "Long haul" solely through the ancestor walk under test.
const mockCategories = [
  { id: 'cat-travel', name: 'Travel', type: 'folder', parentId: null },
  { id: 'cat-flights', name: 'Flights', type: 'folder', parentId: 'cat-travel' },
  { id: 'cat-longhaul', name: 'Long haul', type: 'expense', parentId: 'cat-flights' },
  { id: 'cat-food', name: 'Food', type: 'expense', parentId: null },
];

jest.mock('../../app/contexts/CategoriesContext', () => ({
  CategoriesProvider: ({ children }) => children,
  useCategories: () => ({
    categories: mockCategories,
    getCategoryPath: (id) => {
      const path = [];
      let current = mockCategories.find(c => c.id === id);
      while (current) {
        path.unshift(current);
        current = mockCategories.find(c => c.id === current.parentId);
      }
      return path;
    },
    loading: false,
  }),
}));

// A subscribable store, so publishing new translations re-renders consumers the
// way the real LocalizationContext does when its language finishes loading.
const mockLangStore = {
  translations: { transfer: 'transfer', expense: 'expense', income: 'income' },
  listeners: new Set(),
  publish(translations) {
    this.translations = translations;
    this.listeners.forEach(listener => listener());
  },
};

jest.mock('../../app/contexts/LocalizationContext', () => {
  const { useSyncExternalStore } = require('react');
  return {
    LocalizationProvider: ({ children }) => children,
    useLocalization: () => {
      const translations = useSyncExternalStore(
        (onChange) => {
          mockLangStore.listeners.add(onChange);
          return () => mockLangStore.listeners.delete(onChange);
        },
        () => mockLangStore.translations,
      );
      // A fresh function on every render, like the real provider — the contexts
      // must not treat that alone as a filter change.
      return { t: (key) => translations[key] ?? key, currentLanguage: 'en' };
    },
  };
});

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: jest.fn(), hideDialog: jest.fn() }),
}));

const wrapper = ({ children }) => <OperationsProvider>{children}</OperationsProvider>;

const lastAllDatesFilters = () => {
  const calls = OperationsDB.getFilteredOperationsAllDates.mock.calls;
  return calls[calls.length - 1][0];
};

describe('search matches resolved in JavaScript and handed to SQL', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLangStore.publish({ transfer: 'transfer', expense: 'expense', income: 'income' });
    OperationsDB.getOperationsByWeekOffset.mockResolvedValue([]);
    OperationsDB.getFilteredOperationsAllDates.mockResolvedValue([]);
  });

  const setupHook = async () => await renderHook(() => useOperationsActions(), { wrapper });

  it('passes the matching operation types down with the query', async () => {
    const { result } = await setupHook();
    await waitFor(() => expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalled());

    await act(async () => { result.current.setSearchText('transfer'); });

    await waitFor(() => {
      expect(lastAllDatesFilters().searchTypes).toEqual(['transfer']);
    });
  });

  it('passes every descendant of a matching ancestor category down with the query', async () => {
    const { result } = await setupHook();
    await waitFor(() => expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalled());

    await act(async () => { result.current.setSearchText('travel'); });

    await waitFor(() => {
      const ids = lastAllDatesFilters().searchCategoryIds;
      // The folder itself, its child and its grandchild — the grandchild is the
      // one SQL's own two-level join could never have reached.
      expect(ids).toEqual(expect.arrayContaining(['cat-travel', 'cat-flights', 'cat-longhaul']));
      expect(ids).not.toContain('cat-food');
    });
  });

  it('sends no local matches when the query matches neither a type nor a category', async () => {
    const { result } = await setupHook();
    await waitFor(() => expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalled());

    await act(async () => { result.current.setSearchText('zzzz'); });

    await waitFor(() => {
      expect(lastAllDatesFilters().searchTypes).toBeUndefined();
      expect(lastAllDatesFilters().searchCategoryIds).toBeUndefined();
    });
  });

  it('reissues the query when translations arrive after the search was set', async () => {
    // Russian UI, but the translations have not loaded yet, so "перевод" folds
    // to nothing and the first query carries no type match.
    const { result } = await setupHook();
    await waitFor(() => expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalled());

    await act(async () => { result.current.setSearchText('перевод'); });
    await waitFor(() => expect(OperationsDB.getFilteredOperationsAllDates).toHaveBeenCalled());
    expect(lastAllDatesFilters().searchTypes).toBeUndefined();

    const callsBefore = OperationsDB.getFilteredOperationsAllDates.mock.calls.length;

    // Translations land. Nothing about the user's filters changed — the
    // persisted fields keep their previous values and references — so only the
    // newly resolved type match can trigger the reload, and it has to, or the
    // transfers stay missing until the user edits the text.
    await act(async () => {
      mockLangStore.publish({ transfer: 'Перевод', expense: 'Расход', income: 'Доход' });
    });

    await waitFor(() => {
      expect(OperationsDB.getFilteredOperationsAllDates.mock.calls.length).toBeGreaterThan(callsBefore);
      expect(lastAllDatesFilters().searchTypes).toEqual(['transfer']);
    });
  });
});
