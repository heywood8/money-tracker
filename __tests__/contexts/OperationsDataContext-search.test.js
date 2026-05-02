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

// Mock data for filtering tests
const mockAccounts = [
  { id: 'acc-1', name: 'Cash Wallet', balance: '500', currency: 'USD' },
  { id: 'acc-2', name: 'Bank Account', balance: '1000', currency: 'USD' },
];

const mockCategories = [
  { id: 'cat-1', name: 'Food', nameKey: 'category.food', type: 'expense', parentId: null },
  { id: 'cat-2', name: 'Salary', nameKey: 'category.salary', type: 'income', parentId: null },
  { id: 'cat-3', name: 'Transport', nameKey: 'category.transport', type: 'expense', parentId: null },
  { id: 'cat-4', name: 'Restaurants', nameKey: null, type: 'expense', parentId: 'cat-1' },
];

const mockOperations = [
  {
    id: 'op-1',
    type: 'expense',
    accountId: 'acc-1',
    categoryId: 'cat-1',
    amount: '25.50',
    description: 'Coffee and breakfast',
    date: '2026-04-15',
  },
  {
    id: 'op-2',
    type: 'income',
    accountId: 'acc-2',
    categoryId: 'cat-2',
    amount: '5000',
    description: 'Monthly salary',
    date: '2026-04-01',
  },
  {
    id: 'op-3',
    type: 'expense',
    accountId: 'acc-1',
    categoryId: 'cat-3',
    amount: '15',
    description: 'Bus ticket',
    date: '2026-04-10',
  },
  {
    id: 'op-4',
    type: 'transfer',
    accountId: 'acc-1',
    toAccountId: 'acc-2',
    amount: '100',
    description: 'Transfer to bank',
    date: '2026-04-20',
  },
  {
    id: 'op-5',
    type: 'expense',
    accountId: 'acc-2',
    categoryId: 'cat-1',
    amount: '50',
    description: 'Grocery shopping',
    date: '2026-03-25',
  },
];

// Mock AccountsDataContext
jest.mock('../../app/contexts/AccountsDataContext', () => ({
  AccountsDataProvider: ({ children }) => children,
  useAccountsData: () => ({
    accounts: mockAccounts,
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
const mockGetCategoryPath = (categoryId) => {
  const path = [];
  let current = mockCategories.find(cat => cat.id === categoryId);
  while (current) {
    path.unshift(current);
    current = mockCategories.find(cat => cat.id === current.parentId);
  }
  return path;
};

jest.mock('../../app/contexts/CategoriesContext', () => ({
  CategoriesProvider: ({ children }) => children,
  useCategories: () => ({
    categories: mockCategories,
    getCategoryPath: mockGetCategoryPath,
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

  describe('Filtering Integration Tests', () => {
    // helper to setup context with mock operations
    const setupWithOperations = () => {
      // mock the database to return our mock operations
      OperationsDB.getOperationsByWeekOffset.mockResolvedValue(mockOperations);

      const { result } = renderHook(
        () => ({
          data: useOperationsData(),
          actions: useOperationsActions(),
        }),
        { wrapper },
      );

      return result;
    };

    describe('text search filtering', () => {
      it('filters by description match', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.setSearchText('coffee');
        });

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(1);
          expect(result.current.data.operations[0].id).toBe('op-1');
        });
      });

      it('filters by account name match', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.setSearchText('bank');
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          // matches "Bank Account" and "Transfer to bank" description
          expect(filtered).toHaveLength(3);
          expect(filtered.map(op => op.id).sort()).toEqual(['op-2', 'op-4', 'op-5']);
        });
      });

      it('filters by category name match', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.setSearchText('food');
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(2);
          expect(filtered.map(op => op.id).sort()).toEqual(['op-1', 'op-5']);
        });
      });

      it('filters by parent category name match (hierarchy traversal)', async () => {
        // Add an operation categorized under 'Restaurants' (child of 'Food')
        OperationsDB.getOperationsByWeekOffset.mockResolvedValue([
          ...mockOperations,
          {
            id: 'op-6',
            type: 'expense',
            accountId: 'acc-1',
            categoryId: 'cat-4', // Restaurants, child of Food
            amount: '30',
            description: 'Dinner out',
            date: '2026-04-12',
          },
        ]);

        const { result } = renderHook(
          () => ({
            data: useOperationsData(),
            actions: useOperationsActions(),
          }),
          { wrapper },
        );

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(6);
        });

        act(() => {
          result.current.actions.setSearchText('food');
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          // op-1, op-5 have cat-1 (Food), op-6 has cat-4 (Restaurants, child of Food)
          expect(filtered).toHaveLength(3);
          expect(filtered.map(op => op.id).sort()).toEqual(['op-1', 'op-5', 'op-6']);
        });
      });

      it('filters by amount match', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.setSearchText('5000');
        });

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(1);
          expect(result.current.data.operations[0].id).toBe('op-2');
        });
      });

      it('is case insensitive', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.setSearchText('COFFEE');
        });

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(1);
          expect(result.current.data.operations[0].id).toBe('op-1');
        });
      });
    });

    describe('type filtering', () => {
      it('filters by single type', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.updateSearchFilters({ types: ['expense'] });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(3);
          expect(filtered.every(op => op.type === 'expense')).toBe(true);
        });
      });

      it('filters by multiple types', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.updateSearchFilters({ types: ['expense', 'income'] });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(4);
          expect(filtered.every(op => op.type === 'expense' || op.type === 'income')).toBe(true);
        });
      });
    });

    describe('account filtering', () => {
      it('filters by single account', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.updateSearchFilters({ accountIds: ['acc-1'] });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(3);
          expect(filtered.every(op => op.accountId === 'acc-1')).toBe(true);
        });
      });

      it('filters by multiple accounts', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.updateSearchFilters({ accountIds: ['acc-1', 'acc-2'] });
        });

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });
      });
    });

    describe('category filtering', () => {
      it('filters by single category', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.updateSearchFilters({ categoryIds: ['cat-1'] });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(2);
          expect(filtered.every(op => op.categoryId === 'cat-1')).toBe(true);
        });
      });

      it('filters by multiple categories', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.updateSearchFilters({ categoryIds: ['cat-1', 'cat-2'] });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(3);
          expect(filtered.map(op => op.id).sort()).toEqual(['op-1', 'op-2', 'op-5']);
        });
      });
    });

    describe('date range filtering', () => {
      it('filters with both start and end date', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.updateSearchFilters({
            dateRange: { startDate: '2026-04-01', endDate: '2026-04-15' },
          });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(3);
          expect(filtered.map(op => op.id).sort()).toEqual(['op-1', 'op-2', 'op-3']);
        });
      });

      it('filters with only start date', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.updateSearchFilters({
            dateRange: { startDate: '2026-04-10', endDate: null },
          });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(3);
          expect(filtered.map(op => op.id).sort()).toEqual(['op-1', 'op-3', 'op-4']);
        });
      });

      it('filters with only end date', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.updateSearchFilters({
            dateRange: { startDate: null, endDate: '2026-04-01' },
          });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(2);
          expect(filtered.map(op => op.id).sort()).toEqual(['op-2', 'op-5']);
        });
      });

      it('swaps dates when start > end (regression test for issue #3)', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        // deliberately swap dates (start > end)
        act(() => {
          result.current.actions.updateSearchFilters({
            dateRange: { startDate: '2026-04-15', endDate: '2026-04-01' },
          });
        });

        await waitFor(() => {
          // should still filter correctly by swapping internally
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(3);
          expect(filtered.map(op => op.id).sort()).toEqual(['op-1', 'op-2', 'op-3']);
        });
      });
    });

    describe('amount range filtering', () => {
      it('filters with both min and max', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.updateSearchFilters({
            amountRange: { min: 20, max: 100 },
          });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(3);
          expect(filtered.map(op => op.id).sort()).toEqual(['op-1', 'op-4', 'op-5']);
        });
      });

      it('filters with only min', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.updateSearchFilters({
            amountRange: { min: 50, max: null },
          });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(3);
          expect(filtered.map(op => op.id).sort()).toEqual(['op-2', 'op-4', 'op-5']);
        });
      });

      it('filters with only max', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.updateSearchFilters({
            amountRange: { min: null, max: 50 },
          });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(3);
          expect(filtered.map(op => op.id).sort()).toEqual(['op-1', 'op-3', 'op-5']);
        });
      });
    });

    describe('combined filters (and logic)', () => {
      it('applies text search and type filter together', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.setSearchText('food');
          result.current.actions.updateSearchFilters({ types: ['expense'] });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(2);
          expect(filtered.every(op => op.type === 'expense')).toBe(true);
        });
      });

      it('applies account and category filters together', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.updateSearchFilters({
            accountIds: ['acc-1'],
            categoryIds: ['cat-1'],
          });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(1);
          expect(filtered[0].id).toBe('op-1');
        });
      });

      it('applies all filters together', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.setSearchText('shopping');
          result.current.actions.updateSearchFilters({
            types: ['expense'],
            accountIds: ['acc-2'],
            categoryIds: ['cat-1'],
            dateRange: { startDate: '2026-03-01', endDate: '2026-03-31' },
            amountRange: { min: 40, max: 60 },
          });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(1);
          expect(filtered[0].id).toBe('op-5');
        });
      });

      it('returns empty when no operations match combined filters', async () => {
        const result = setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        act(() => {
          result.current.actions.updateSearchFilters({
            types: ['income'],
            accountIds: ['acc-1'], // income operation is in acc-2, not acc-1
          });
        });

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(0);
        });
      });
    });
  });
});
