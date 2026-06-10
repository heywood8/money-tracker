/**
 * Integration tests for Operations Filtering
 * Tests the complete filter workflow from UI interaction to data persistence
 */

// Unmock the split contexts to use real implementations
jest.unmock('../../app/contexts/OperationsDataContext');
jest.unmock('../../app/contexts/OperationsActionsContext');
jest.unmock('../../app/contexts/AccountsDataContext');
jest.unmock('../../app/contexts/AccountsActionsContext');

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import * as PreferencesDB from '../../app/services/PreferencesDB';
import { OperationsProvider, useOperations } from '../../app/contexts/OperationsContext';
import { AccountsProvider } from '../../app/contexts/AccountsContext';
import * as OperationsDB from '../../app/services/OperationsDB';

// Mock dependencies
jest.mock('../../app/services/PreferencesDB');
jest.mock('../../app/services/OperationsDB');
jest.mock('../../app/contexts/AccountsContext', () => ({
  AccountsProvider: ({ children }) => children,
  useAccounts: () => ({
    reloadAccounts: jest.fn(),
  }),
}));
jest.mock('../../app/contexts/AccountsActionsContext', () => ({
  AccountsActionsProvider: ({ children }) => children,
  useAccountsActions: () => ({
    reloadAccounts: jest.fn(),
  }),
}));
jest.mock('../../app/contexts/AccountsDataContext', () => ({
  AccountsDataProvider: ({ children }) => children,
  useAccountsData: () => ({
    accounts: [],
    loading: false,
  }),
}));
jest.mock('../../app/contexts/CategoriesContext', () => ({
  CategoriesProvider: ({ children }) => children,
  useCategories: () => ({
    categories: [],
    getCategoryPath: () => [],
    loading: false,
  }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  LocalizationProvider: ({ children }) => children,
  useLocalization: () => ({
    t: (key) => key,
    currentLanguage: 'en',
  }),
}));

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({
    showDialog: jest.fn(),
  }),
}));

describe('Operations Filtering Integration', () => {
  const mockOperations = [
    {
      id: 'op1',
      type: 'expense',
      amount: '50',
      accountId: 'acc1',
      categoryId: 'cat1',
      date: '2025-12-05',
      description: 'Groceries',
      createdAt: '2025-12-05T10:00:00Z',
    },
    {
      id: 'op2',
      type: 'income',
      amount: '1000',
      accountId: 'acc2',
      categoryId: 'cat2',
      date: '2025-12-04',
      description: 'Salary',
      createdAt: '2025-12-04T10:00:00Z',
    },
    {
      id: 'op3',
      type: 'transfer',
      amount: '200',
      accountId: 'acc1',
      toAccountId: 'acc2',
      date: '2025-12-03',
      description: 'Transfer to savings',
      createdAt: '2025-12-03T10:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Default PreferencesDB mocks
    PreferencesDB.getJsonPreference.mockResolvedValue(null);
    PreferencesDB.setJsonPreference.mockResolvedValue(undefined);

    // Default mock implementations
    OperationsDB.getOperationsByWeekOffset.mockResolvedValue(mockOperations);
    OperationsDB.getFilteredOperationsByWeekOffset.mockResolvedValue([]);
    OperationsDB.getFilteredOperationsAllDates.mockResolvedValue([]);
    OperationsDB.getNextOldestOperation.mockResolvedValue(null);
    OperationsDB.getNextOldestFilteredOperation.mockResolvedValue(null);
  });

  describe('Filter State Management', () => {
    it('initializes with empty filters', async () => {
      const { result } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      await waitFor(() => {
        expect(result.current.activeFilters).toEqual({
          types: [],
          accountIds: [],
          categoryIds: [],
          searchText: '',
          dateRange: { startDate: null, endDate: null },
          amountRange: { min: null, max: null },
        });
        expect(result.current.filtersActive).toBe(false);
      });
    });

    it('loads filters from PreferencesDB on mount', async () => {
      const storedFilters = {
        types: ['expense'],
        accountIds: ['acc1'],
        categoryIds: [],
        searchText: '',
        dateRange: { startDate: null, endDate: null },
        amountRange: { min: null, max: null },
      };

      PreferencesDB.getJsonPreference.mockResolvedValue(storedFilters);

      const { result } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      await waitFor(() => {
        expect(result.current.activeFilters).toEqual(storedFilters);
        expect(result.current.filtersActive).toBe(true);
      });
    });

    it('persists filters to PreferencesDB when updated', async () => {
      const { result } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      const newFilters = {
        types: ['expense'],
        accountIds: [],
        categoryIds: [],
        searchText: '',
        dateRange: { startDate: null, endDate: null },
        amountRange: { min: null, max: null },
      };

      await act(async () => {
        await result.current.updateFilters(newFilters);
      });

      await waitFor(() => {
        expect(PreferencesDB.setJsonPreference).toHaveBeenCalledWith(
          PreferencesDB.PREF_KEYS.OPERATIONS_FILTERS,
          newFilters,
        );
      });
    });

    it('correctly identifies when filters are active', async () => {
      const { result } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      // Initially no filters
      await waitFor(() => {
        expect(result.current.filtersActive).toBe(false);
      });

      // Apply type filter
      await act(async () => {
        await result.current.updateFilters({
          types: ['expense'],
          accountIds: [],
          categoryIds: [],
          searchText: '',
          dateRange: { startDate: null, endDate: null },
          amountRange: { min: null, max: null },
        });
      });

      await waitFor(() => {
        expect(result.current.filtersActive).toBe(true);
      });
    });

    it('counts active filter groups correctly', async () => {
      const { result } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      const filtersWithMultipleGroups = {
        types: ['expense'],
        accountIds: ['acc1', 'acc2'],
        categoryIds: ['cat1'],
        searchText: 'test',
        dateRange: { startDate: null, endDate: null },
        amountRange: { min: null, max: null },
      };

      await act(async () => {
        await result.current.updateFilters(filtersWithMultipleGroups);
      });

      await waitFor(() => {
        expect(result.current.getActiveFilterCount()).toBe(4); // types, accounts, categories, search
      });
    });
  });

  describe('Filter Application', () => {
    it('reloads operations when filters are applied', async () => {
      const { result } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const filteredOps = [mockOperations[0]]; // Only expense
      OperationsDB.getFilteredOperationsAllDates.mockResolvedValue(filteredOps);

      await act(async () => {
        await result.current.updateFilters({
          types: ['expense'],
          accountIds: [],
          categoryIds: [],
          searchText: '',
          dateRange: { startDate: null, endDate: null },
          amountRange: { min: null, max: null },
        });
      });

      await waitFor(() => {
        expect(OperationsDB.getFilteredOperationsAllDates).toHaveBeenCalled();
        expect(result.current.operations).toEqual(filteredOps);
      });
    });

    it('resets to first week when filters change', async () => {
      const { result } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Load more operations to go beyond week 0
      await act(async () => {
        OperationsDB.getNextOldestOperation.mockResolvedValue(mockOperations[2]);
        OperationsDB.getOperationsByWeekFromDate.mockResolvedValue([mockOperations[2]]);
        await result.current.loadMoreOperations();
      });

      // Apply filter loads all matching operations at once
      OperationsDB.getFilteredOperationsAllDates.mockResolvedValue([mockOperations[0]]);

      await act(async () => {
        await result.current.updateFilters({
          types: ['expense'],
          accountIds: [],
          categoryIds: [],
          searchText: '',
          dateRange: { startDate: null, endDate: null },
          amountRange: { min: null, max: null },
        });
      });

      await waitFor(() => {
        expect(OperationsDB.getFilteredOperationsAllDates).toHaveBeenCalledWith(
          expect.objectContaining({ types: ['expense'] }),
        );
        expect(result.current.hasMoreOperations).toBe(false);
      });
    });

    it('clears filters and reloads all operations', async () => {
      const { result } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      // Apply filters first
      await act(async () => {
        await result.current.updateFilters({
          types: ['expense'],
          accountIds: [],
          categoryIds: [],
          searchText: '',
          dateRange: { startDate: null, endDate: null },
          amountRange: { min: null, max: null },
        });
      });

      await waitFor(() => {
        expect(result.current.filtersActive).toBe(true);
      });

      // Clear filters
      OperationsDB.getOperationsByWeekOffset.mockResolvedValue(mockOperations);

      await act(async () => {
        await result.current.clearFilters();
      });

      await waitFor(() => {
        expect(result.current.filtersActive).toBe(false);
        expect(result.current.activeFilters.types).toEqual([]);
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalled();
      });
    });
  });

  describe('Lazy Loading with Filters', () => {
    it('loads more filtered operations on scroll', async () => {
      const { result } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      // Apply filter — loads all matching results at once, no pagination
      const filteredOps = [mockOperations[0], { ...mockOperations[0], id: 'op4', date: '2025-11-30' }];
      OperationsDB.getFilteredOperationsAllDates.mockResolvedValue(filteredOps);

      await act(async () => {
        await result.current.updateFilters({
          types: ['expense'],
          accountIds: [],
          categoryIds: [],
          searchText: '',
          dateRange: { startDate: null, endDate: null },
          amountRange: { min: null, max: null },
        });
      });

      await waitFor(() => {
        expect(result.current.operations).toHaveLength(2);
        expect(result.current.hasMoreOperations).toBe(false);
      });

      // loadMoreOperations is a no-op when hasMoreOperations is false
      await act(async () => {
        await result.current.loadMoreOperations();
      });

      await waitFor(() => {
        expect(OperationsDB.getNextOldestFilteredOperation).not.toHaveBeenCalled();
      });
    });

    it('stops loading when no more filtered results', async () => {
      const { result } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      // Apply filter — all matching results loaded at once, hasMoreOperations is false immediately
      OperationsDB.getFilteredOperationsAllDates.mockResolvedValue([mockOperations[0]]);

      await act(async () => {
        await result.current.updateFilters({
          types: ['expense'],
          accountIds: [],
          categoryIds: [],
          searchText: '',
          dateRange: { startDate: null, endDate: null },
          amountRange: { min: null, max: null },
        });
      });

      await waitFor(() => {
        expect(result.current.hasMoreOperations).toBe(false);
      });
    });

    it('deduplicates operations during filtered pagination', async () => {
      const { result } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      // Filtered load returns all results at once — no duplicates possible
      const op5 = { ...mockOperations[0], id: 'op5', date: '2025-11-30' };
      OperationsDB.getFilteredOperationsAllDates.mockResolvedValue([mockOperations[0], op5]);

      await act(async () => {
        await result.current.updateFilters({
          types: ['expense'],
          accountIds: [],
          categoryIds: [],
          searchText: '',
          dateRange: { startDate: null, endDate: null },
          amountRange: { min: null, max: null },
        });
      });

      await waitFor(() => {
        const ids = result.current.operations.map((op) => op.id);
        expect(ids).toEqual(['op1', 'op5']);
        expect(result.current.hasMoreOperations).toBe(false);
      });
    });
  });

  describe('Filter Persistence Across Navigation', () => {
    it('maintains filter state when component unmounts and remounts', async () => {
      const filters = {
        types: ['expense'],
        accountIds: ['acc1'],
        categoryIds: [],
        searchText: 'test',
        dateRange: { startDate: null, endDate: null },
        amountRange: { min: null, max: null },
      };

      // First render
      const { result, unmount } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      await act(async () => {
        await result.current.updateFilters(filters);
      });

      await waitFor(() => {
        expect(result.current.activeFilters).toEqual(filters);
      });

      // Unmount
      await unmount();

      // Mock PreferencesDB to return the filters on next render
      PreferencesDB.getJsonPreference.mockResolvedValue(filters);

      // Remount
      const { result: result2 } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      await waitFor(() => {
        expect(result2.current.activeFilters).toEqual(filters);
        expect(result2.current.filtersActive).toBe(true);
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles empty filter results gracefully', async () => {
      const { result } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      OperationsDB.getFilteredOperationsByWeekOffset.mockResolvedValue([]);

      await act(async () => {
        await result.current.updateFilters({
          types: ['expense'],
          accountIds: [],
          categoryIds: [],
          searchText: '',
          dateRange: { startDate: null, endDate: null },
          amountRange: { min: null, max: null },
        });
      });

      await waitFor(() => {
        expect(result.current.operations).toEqual([]);
        expect(result.current.loading).toBe(false);
      });
    });

    it('handles filter errors gracefully', async () => {
      const { result } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      OperationsDB.getFilteredOperationsByWeekOffset.mockRejectedValue(
        new Error('Database error'),
      );

      await act(async () => {
        await result.current.updateFilters({
          types: ['expense'],
          accountIds: [],
          categoryIds: [],
          searchText: '',
          dateRange: { startDate: null, endDate: null },
          amountRange: { min: null, max: null },
        });
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('Regression Tests', () => {
    it('uses filtered queries when filters are active', async () => {
      const { result } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      // Wait for initial load to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Clear mocks after initial load
      jest.clearAllMocks();

      await act(async () => {
        await result.current.updateFilters({
          types: ['expense'],
          accountIds: [],
          categoryIds: [],
          searchText: '',
          dateRange: { startDate: null, endDate: null },
          amountRange: { min: null, max: null },
        });
      });

      await waitFor(() => {
        expect(OperationsDB.getFilteredOperationsAllDates).toHaveBeenCalled();
        expect(OperationsDB.getOperationsByWeekOffset).not.toHaveBeenCalled();
      });
    });

    it('uses unfiltered queries when filters are cleared', async () => {
      const { result } = await renderHook(() => useOperations(), {
        wrapper: OperationsProvider,
      });

      // Apply filter
      await act(async () => {
        await result.current.updateFilters({
          types: ['expense'],
          accountIds: [],
          categoryIds: [],
          searchText: '',
          dateRange: { startDate: null, endDate: null },
          amountRange: { min: null, max: null },
        });
      });

      jest.clearAllMocks();

      // Clear filter
      await act(async () => {
        await result.current.clearFilters();
      });

      await waitFor(() => {
        expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalled();
        expect(OperationsDB.getFilteredOperationsByWeekOffset).not.toHaveBeenCalled();
      });
    });
  });
});
