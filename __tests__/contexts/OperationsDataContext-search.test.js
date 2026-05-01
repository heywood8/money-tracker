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
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

// Mock dependencies
jest.mock('../../app/services/OperationsDB');
jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: {
    on: jest.fn((event, listener) => jest.fn()),
    emit: jest.fn(),
  },
  EVENTS: {
    RELOAD_ALL: 'reload:all',
    OPERATION_CHANGED: 'operation:changed',
  },
}));

// Mock AccountsDataContext
jest.mock('../../app/contexts/AccountsDataContext', () => ({
  AccountsDataProvider: ({ children }) => children,
  useAccountsData: () => ({
    accounts: [],
    loading: false,
  }),
}));

// Mock AccountsActionsContext
const mockReloadAccounts = jest.fn();
jest.mock('../../app/contexts/AccountsActionsContext', () => ({
  AccountsActionsProvider: ({ children }) => children,
  useAccountsActions: () => ({
    reloadAccounts: mockReloadAccounts,
  }),
}));

// Mock CategoriesContext
jest.mock('../../app/contexts/CategoriesContext', () => ({
  CategoriesProvider: ({ children }) => children,
  useCategoriesData: () => ({
    categories: [],
    loading: false,
  }),
}));

// Mock LocalizationContext
jest.mock('../../app/contexts/LocalizationContext', () => ({
  LocalizationProvider: ({ children }) => children,
  useLocalization: () => ({
    t: (key) => key,
    currentLanguage: 'en',
  }),
}));

// Mock DialogContext
const mockShowDialog = jest.fn();
jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({
    showDialog: mockShowDialog,
    hideDialog: jest.fn(),
  }),
}));

describe('OperationsDataContext - Search API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    OperationsDB.getOperationsByWeekOffset.mockResolvedValue([]);
  });

  const wrapper = ({ children }) => (
    <OperationsProvider>{children}</OperationsProvider>
  );

  describe('searchState initialization', () => {
    it('initializes with empty searchState', () => {
      const { result } = renderHook(() => useOperationsData(), { wrapper });

      expect(result.current.searchState).toEqual({
        text: '',
        types: [],
        accountIds: [],
        categoryIds: [],
        dateRange: { startDate: null, endDate: null },
        amountRange: { min: null, max: null },
      });
    });

    it('initializes hasActiveSearch as false', () => {
      const { result } = renderHook(() => useOperationsData(), { wrapper });
      expect(result.current.hasActiveSearch).toBe(false);
    });
  });

  describe('setSearchText', () => {
    it('updates searchState.text', () => {
      const { result } = renderHook(
        () => ({
          data: useOperationsData(),
          actions: useOperationsActions(),
        }),
        { wrapper },
      );

      act(() => {
        result.current.actions.setSearchText('coffee');
      });

      expect(result.current.data.searchState.text).toBe('coffee');
    });
  });

  describe('updateSearchFilters', () => {
    it('merges partial filter updates', () => {
      const { result } = renderHook(
        () => ({
          data: useOperationsData(),
          actions: useOperationsActions(),
        }),
        { wrapper },
      );

      act(() => {
        result.current.actions.updateSearchFilters({ types: ['expense'] });
      });

      expect(result.current.data.searchState.types).toEqual(['expense']);
      expect(result.current.data.searchState.text).toBe('');

      act(() => {
        result.current.actions.updateSearchFilters({ accountIds: ['acc-1'] });
      });

      expect(result.current.data.searchState.types).toEqual(['expense']);
      expect(result.current.data.searchState.accountIds).toEqual(['acc-1']);
    });
  });

  describe('clearAllSearch', () => {
    it('resets all searchState fields', () => {
      const { result } = renderHook(
        () => ({
          data: useOperationsData(),
          actions: useOperationsActions(),
        }),
        { wrapper },
      );

      act(() => {
        result.current.actions.setSearchText('coffee');
        result.current.actions.updateSearchFilters({ types: ['expense'], accountIds: ['acc-1'] });
      });

      act(() => {
        result.current.actions.clearAllSearch();
      });

      expect(result.current.data.searchState).toEqual({
        text: '',
        types: [],
        accountIds: [],
        categoryIds: [],
        dateRange: { startDate: null, endDate: null },
        amountRange: { min: null, max: null },
      });
    });
  });

  describe('hasActiveSearch', () => {
    it('returns true when text search is active', () => {
      const { result } = renderHook(
        () => ({
          data: useOperationsData(),
          actions: useOperationsActions(),
        }),
        { wrapper },
      );

      act(() => {
        result.current.actions.setSearchText('coffee');
      });

      expect(result.current.data.hasActiveSearch).toBe(true);
    });

    it('returns true when type filter is active', () => {
      const { result } = renderHook(
        () => ({
          data: useOperationsData(),
          actions: useOperationsActions(),
        }),
        { wrapper },
      );

      act(() => {
        result.current.actions.updateSearchFilters({ types: ['expense'] });
      });

      expect(result.current.data.hasActiveSearch).toBe(true);
    });

    it('returns false when all filters are empty', () => {
      const { result } = renderHook(() => useOperationsData(), { wrapper });
      expect(result.current.hasActiveSearch).toBe(false);
    });
  });

  describe('getSearchFilterCount', () => {
    it('returns count of active non-text filters', () => {
      const { result } = renderHook(
        () => ({
          data: useOperationsData(),
          actions: useOperationsActions(),
        }),
        { wrapper },
      );

      act(() => {
        result.current.actions.updateSearchFilters({
          types: ['expense'],
          accountIds: ['acc-1', 'acc-2'],
          dateRange: { startDate: '2026-01-01', endDate: null },
        });
      });

      expect(result.current.data.getSearchFilterCount()).toBe(3);
    });

    it('does not count text in filter count', () => {
      const { result } = renderHook(
        () => ({
          data: useOperationsData(),
          actions: useOperationsActions(),
        }),
        { wrapper },
      );

      act(() => {
        result.current.actions.setSearchText('coffee');
      });

      expect(result.current.data.getSearchFilterCount()).toBe(0);
    });
  });
});
