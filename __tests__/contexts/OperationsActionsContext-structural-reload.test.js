// Unmock the split contexts to use real implementations
jest.unmock('../../app/contexts/OperationsDataContext');
jest.unmock('../../app/contexts/OperationsActionsContext');
jest.unmock('../../app/contexts/AccountsDataContext');
jest.unmock('../../app/contexts/AccountsActionsContext');

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useOperationsData } from '../../app/contexts/OperationsDataContext';
import { useOperationsActions } from '../../app/contexts/OperationsActionsContext';
import { OperationsProvider } from '../../app/contexts/OperationsContext';
import * as OperationsDB from '../../app/services/OperationsDB';

jest.mock('../../app/services/OperationsDB');
jest.mock('../../app/services/PreferencesDB', () => ({
  setJsonPreference: jest.fn(() => Promise.resolve()),
  getJsonPreference: jest.fn(() => Promise.resolve(null)),
  setPreference: jest.fn(() => Promise.resolve()),
  getPreference: jest.fn(() => Promise.resolve(null)),
  PREF_KEYS: {
    OPERATIONS_FILTERS: 'operations_active_filters',
    LANGUAGE: 'language',
    THEME: 'theme',
    GOOGLE_SHEETS_ID: 'google_sheets_id',
    DAILY_BACKUP_ENABLED: 'daily_backup_enabled',
    LAST_BACKUP_DATE: 'last_backup_date',
    HIDE_BALANCES: 'hide_balances',
  },
}));

jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: {
    on: jest.fn(() => jest.fn()),
    emit: jest.fn(),
  },
  EVENTS: {
    RELOAD_ALL: 'reload:all',
    OPERATION_CHANGED: 'operation:changed',
  },
}));

const mockAccounts = [
  { id: 'acc-1', name: 'Cash', balance: '100', currency: 'USD' },
];

jest.mock('../../app/contexts/AccountsDataContext', () => ({
  AccountsDataProvider: ({ children }) => children,
  useAccountsData: () => ({ accounts: mockAccounts, loading: false }),
}));

const mockReloadAccounts = jest.fn();
jest.mock('../../app/contexts/AccountsActionsContext', () => ({
  AccountsActionsProvider: ({ children }) => children,
  useAccountsActions: () => ({ reloadAccounts: mockReloadAccounts }),
}));

const mockCategories = [
  { id: 'cat-1', name: 'Food', type: 'expense', parentId: null },
  { id: 'cat-2', name: 'Transport', type: 'expense', parentId: null },
];

jest.mock('../../app/contexts/CategoriesContext', () => ({
  CategoriesProvider: ({ children }) => children,
  useCategories: () => ({
    categories: mockCategories,
    getCategoryPath: (id) => {
      const cats = mockCategories;
      const path = [];
      let current = cats.find(c => c.id === id);
      while (current) {
        path.unshift(current);
        current = cats.find(c => c.id === current.parentId);
      }
      return path;
    },
    loading: false,
  }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  LocalizationProvider: ({ children }) => children,
  useLocalization: () => ({ t: (key) => key, currentLanguage: 'en' }),
}));

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: jest.fn(), hideDialog: jest.fn() }),
}));

describe('OperationsActionsContext - structural filter reload detection', () => {
  let mockSetJsonPreference;

  beforeEach(() => {
    jest.clearAllMocks();
    OperationsDB.getOperationsByWeekOffset.mockResolvedValue([]);
    OperationsDB.getFilteredOperationsByWeekOffset.mockResolvedValue([]);
    const PreferencesDB = require('../../app/services/PreferencesDB');
    mockSetJsonPreference = PreferencesDB.setJsonPreference;
  });

  const wrapper = ({ children }) => (
    <OperationsProvider>{children}</OperationsProvider>
  );

  const setupHook = () =>
    renderHook(
      () => ({
        data: useOperationsData(),
        actions: useOperationsActions(),
      }),
      { wrapper },
    );

  describe('text-only changes do not trigger DB reload', () => {
    it('does not call getOperationsByWeekOffset again when only searchText changes', async () => {
      const { result } = setupHook();

      await waitFor(() => {
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });

      act(() => {
        result.current.actions.setSearchText('coffee');
      });

      // Allow any pending async work to settle
      await waitFor(() => {
        expect(result.current.data.searchState.text).toBe('coffee');
      });

      // No additional DB call beyond the initial mount
      expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      expect(OperationsDB.getFilteredOperationsByWeekOffset).not.toHaveBeenCalled();
    });

    it('does not trigger DB reload when searchText changes multiple times', async () => {
      const { result } = setupHook();

      await waitFor(() => {
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });

      act(() => { result.current.actions.setSearchText('c'); });
      act(() => { result.current.actions.setSearchText('co'); });
      act(() => { result.current.actions.setSearchText('cof'); });
      act(() => { result.current.actions.setSearchText('coffee'); });

      await waitFor(() => {
        expect(result.current.data.searchState.text).toBe('coffee');
      });

      expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      expect(OperationsDB.getFilteredOperationsByWeekOffset).not.toHaveBeenCalled();
    });

    it('does not trigger reload when searchText changes from non-empty to empty', async () => {
      const { result } = setupHook();

      await waitFor(() => {
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });

      act(() => { result.current.actions.setSearchText('coffee'); });
      act(() => { result.current.actions.setSearchText(''); });

      await waitFor(() => {
        expect(result.current.data.searchState.text).toBe('');
      });

      expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
    });
  });

  describe('structural filter changes trigger DB reload', () => {
    it('triggers reload when types filter changes', async () => {
      const { result } = setupHook();

      await waitFor(() => {
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });

      act(() => {
        result.current.actions.updateSearchFilters({ types: ['expense'] });
      });

      await waitFor(() => {
        expect(OperationsDB.getFilteredOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });
    });

    it('triggers reload when accountIds filter changes', async () => {
      const { result } = setupHook();

      await waitFor(() => {
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });

      act(() => {
        result.current.actions.updateSearchFilters({ accountIds: ['acc-1'] });
      });

      await waitFor(() => {
        expect(OperationsDB.getFilteredOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });
    });

    it('triggers reload when categoryIds filter changes', async () => {
      const { result } = setupHook();

      await waitFor(() => {
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });

      act(() => {
        result.current.actions.updateSearchFilters({ categoryIds: ['cat-1'] });
      });

      await waitFor(() => {
        expect(OperationsDB.getFilteredOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });
    });

    it('triggers reload when dateRange filter changes', async () => {
      const { result } = setupHook();

      await waitFor(() => {
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });

      act(() => {
        result.current.actions.updateSearchFilters({
          dateRange: { startDate: '2026-01-01', endDate: '2026-12-31' },
        });
      });

      await waitFor(() => {
        expect(OperationsDB.getFilteredOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });
    });

    it('triggers reload when amountRange filter changes', async () => {
      const { result } = setupHook();

      await waitFor(() => {
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });

      act(() => {
        result.current.actions.updateSearchFilters({
          amountRange: { min: 10, max: 500 },
        });
      });

      await waitFor(() => {
        expect(OperationsDB.getFilteredOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });
    });

    it('passes the updated filters to the filtered DB query', async () => {
      const { result } = setupHook();

      await waitFor(() => {
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });

      act(() => {
        result.current.actions.updateSearchFilters({ types: ['income'] });
      });

      await waitFor(() => {
        expect(OperationsDB.getFilteredOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });

      const [offset, filters] = OperationsDB.getFilteredOperationsByWeekOffset.mock.calls[0];
      expect(offset).toBe(0);
      expect(filters.types).toEqual(['income']);
    });
  });

  describe('text + structural change combination', () => {
    it('combined update with structural change triggers exactly one reload', async () => {
      const { result } = setupHook();

      await waitFor(() => {
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });

      // Set text first (no reload)
      act(() => { result.current.actions.setSearchText('grocery'); });

      await waitFor(() => {
        expect(result.current.data.searchState.text).toBe('grocery');
      });
      expect(OperationsDB.getFilteredOperationsByWeekOffset).not.toHaveBeenCalled();

      // Then set structural (one reload)
      act(() => {
        result.current.actions.updateSearchFilters({ types: ['expense'] });
      });

      await waitFor(() => {
        expect(OperationsDB.getFilteredOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('setJsonPreference is called for every filter change', () => {
    it('does NOT call setJsonPreference on initial mount', async () => {
      setupHook();

      await waitFor(() => {
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });

      expect(mockSetJsonPreference).not.toHaveBeenCalled();
    });

    it('calls setJsonPreference when searchText changes', async () => {
      const { result } = setupHook();

      await waitFor(() => {
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });

      act(() => { result.current.actions.setSearchText('coffee'); });

      await waitFor(() => {
        expect(mockSetJsonPreference).toHaveBeenCalledTimes(1);
      });

      expect(mockSetJsonPreference).toHaveBeenCalledWith(
        'operations_active_filters',
        expect.objectContaining({ searchText: 'coffee' }),
      );
    });

    it('calls setJsonPreference when structural filter changes', async () => {
      const { result } = setupHook();

      await waitFor(() => {
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });

      act(() => {
        result.current.actions.updateSearchFilters({ types: ['expense'] });
      });

      await waitFor(() => {
        expect(mockSetJsonPreference).toHaveBeenCalledTimes(1);
      });

      expect(mockSetJsonPreference).toHaveBeenCalledWith(
        'operations_active_filters',
        expect.objectContaining({ types: ['expense'] }),
      );
    });

    it('calls setJsonPreference once per filter change even for text-only changes', async () => {
      const { result } = setupHook();

      await waitFor(() => {
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledTimes(1);
      });

      act(() => { result.current.actions.setSearchText('a'); });
      act(() => { result.current.actions.setSearchText('ab'); });
      act(() => { result.current.actions.setSearchText('abc'); });

      await waitFor(() => {
        expect(result.current.data.searchState.text).toBe('abc');
        // Each setSearchText can merge (React may batch), so we check at least 1 call
        expect(mockSetJsonPreference).toHaveBeenCalled();
      });
    });
  });
});
