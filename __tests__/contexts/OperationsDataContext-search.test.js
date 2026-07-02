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
  // Cyrillic categories for Unicode search tests
  { id: 'cat-5', name: 'Транспорт', nameKey: null, type: 'expense', parentId: 'cat-6' },
  { id: 'cat-6', name: 'Путешествия', nameKey: null, type: 'expense', parentId: null },
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
    OperationsDB.getFilteredOperationsAllDates.mockResolvedValue(mockOperations);
    OperationsDB.getAllOperations.mockResolvedValue(mockOperations);
  });

  const wrapper = ({ children }) => (
    <OperationsProvider>{children}</OperationsProvider>
  );

  describe('searchState initialization', () => {
    it('initializes with empty searchState', async () => {
      const { result } = await renderHook(() => useOperationsData(), { wrapper });

      expect(result.current.searchState).toEqual({
        text: '',
        types: [],
        accountIds: [],
        categoryIds: [],
        labels: [],
        dateRange: { startDate: null, endDate: null },
        amountRange: { min: null, max: null },
      });
    });

    it('initializes hasActiveSearch as false', async () => {
      const { result } = await renderHook(() => useOperationsData(), { wrapper });
      expect(result.current.hasActiveSearch).toBe(false);
    });
  });

  describe('setSearchText', () => {
    it('updates searchState.text', async () => {
      const { result } = await renderHook(
        () => ({
          data: useOperationsData(),
          actions: useOperationsActions(),
        }),
        { wrapper },
      );

      await act(async () => {
        result.current.actions.setSearchText('coffee');
      });

      expect(result.current.data.searchState.text).toBe('coffee');
    });
  });

  describe('updateSearchFilters', () => {
    it('merges partial filter updates', async () => {
      const { result } = await renderHook(
        () => ({
          data: useOperationsData(),
          actions: useOperationsActions(),
        }),
        { wrapper },
      );

      await act(async () => {
        result.current.actions.updateSearchFilters({ types: ['expense'] });
      });

      expect(result.current.data.searchState.types).toEqual(['expense']);
      expect(result.current.data.searchState.text).toBe('');

      await act(async () => {
        result.current.actions.updateSearchFilters({ accountIds: ['acc-1'] });
      });

      expect(result.current.data.searchState.types).toEqual(['expense']);
      expect(result.current.data.searchState.accountIds).toEqual(['acc-1']);
    });
  });

  describe('clearAllSearch', () => {
    it('resets all searchState fields', async () => {
      const { result } = await renderHook(
        () => ({
          data: useOperationsData(),
          actions: useOperationsActions(),
        }),
        { wrapper },
      );

      await act(async () => {
        result.current.actions.setSearchText('coffee');
        result.current.actions.updateSearchFilters({ types: ['expense'], accountIds: ['acc-1'] });
      });

      await act(async () => {
        result.current.actions.clearAllSearch();
      });

      expect(result.current.data.searchState).toEqual({
        text: '',
        types: [],
        accountIds: [],
        categoryIds: [],
        labels: [],
        dateRange: { startDate: null, endDate: null },
        amountRange: { min: null, max: null },
      });
    });
  });

  describe('hasActiveSearch', () => {
    it('returns true when text search is active', async () => {
      const { result } = await renderHook(
        () => ({
          data: useOperationsData(),
          actions: useOperationsActions(),
        }),
        { wrapper },
      );

      await act(async () => {
        result.current.actions.setSearchText('coffee');
      });

      expect(result.current.data.hasActiveSearch).toBe(true);
    });

    it('returns true when type filter is active', async () => {
      const { result } = await renderHook(
        () => ({
          data: useOperationsData(),
          actions: useOperationsActions(),
        }),
        { wrapper },
      );

      await act(async () => {
        result.current.actions.updateSearchFilters({ types: ['expense'] });
      });

      expect(result.current.data.hasActiveSearch).toBe(true);
    });

    it('returns false when all filters are empty', async () => {
      const { result } = await renderHook(() => useOperationsData(), { wrapper });
      expect(result.current.hasActiveSearch).toBe(false);
    });
  });

  describe('getSearchFilterCount', () => {
    it('returns count of active non-text filters', async () => {
      const { result } = await renderHook(
        () => ({
          data: useOperationsData(),
          actions: useOperationsActions(),
        }),
        { wrapper },
      );

      await act(async () => {
        result.current.actions.updateSearchFilters({
          types: ['expense'],
          accountIds: ['acc-1', 'acc-2'],
          dateRange: { startDate: '2026-01-01', endDate: null },
        });
      });

      expect(result.current.data.getSearchFilterCount()).toBe(3);
    });

    it('does not count text in filter count', async () => {
      const { result } = await renderHook(
        () => ({
          data: useOperationsData(),
          actions: useOperationsActions(),
        }),
        { wrapper },
      );

      await act(async () => {
        result.current.actions.setSearchText('coffee');
      });

      expect(result.current.data.getSearchFilterCount()).toBe(0);
    });
  });

  describe('Filtering Integration Tests', () => {
    // helper to setup context with mock operations
    const setupWithOperations = async () => {
      // mock the database to return our mock operations
      OperationsDB.getOperationsByWeekOffset.mockResolvedValue(mockOperations);

      const { result } = await renderHook(
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
          result.current.actions.setSearchText('coffee');
        });

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(1);
          expect(result.current.data.operations[0].id).toBe('op-1');
        });
      });

      it('filters by account name match', async () => {
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
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
        const allOps = [
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
        ];
        OperationsDB.getOperationsByWeekOffset.mockResolvedValue(allOps);
        OperationsDB.getFilteredOperationsAllDates.mockResolvedValue(allOps);
        OperationsDB.getAllOperations.mockResolvedValue(allOps);

        const { result } = await renderHook(
          () => ({
            data: useOperationsData(),
            actions: useOperationsActions(),
          }),
          { wrapper },
        );

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(6);
        });

        await act(async () => {
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
          result.current.actions.setSearchText('5000');
        });

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(1);
          expect(result.current.data.operations[0].id).toBe('op-2');
        });
      });

      it('is case insensitive', async () => {
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
          result.current.actions.updateSearchFilters({ types: ['expense'] });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(3);
          expect(filtered.every(op => op.type === 'expense')).toBe(true);
        });
      });

      it('filters by multiple types', async () => {
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
          result.current.actions.updateSearchFilters({ accountIds: ['acc-1'] });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(3);
          expect(filtered.every(op => op.accountId === 'acc-1')).toBe(true);
        });
      });

      it('filters by multiple accounts', async () => {
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
          result.current.actions.updateSearchFilters({ accountIds: ['acc-1', 'acc-2'] });
        });

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });
      });

      it('includes incoming transfers when filtering by the destination account (regression)', async () => {
        // op-4 is a transfer acc-1 → acc-2. Filtering by acc-2 must show it —
        // the SQL layer matches account_id OR to_account_id, and the in-memory
        // filter used to drop incoming transfers silently.
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
          result.current.actions.updateSearchFilters({ accountIds: ['acc-2'] });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered.map(op => op.id).sort()).toEqual(['op-2', 'op-4', 'op-5']);
        });
      });
    });

    describe('destination account text search (regression)', () => {
      it('finds transfers by the destination account name', async () => {
        // "Bank Account" is acc-2's name; op-4 transfers INTO acc-2 and its
        // description ("Transfer to bank") does not contain the full phrase.
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
          result.current.actions.updateSearchFilters({ text: 'Bank Account' });
        });

        await waitFor(() => {
          const ids = result.current.data.operations.map(op => op.id);
          expect(ids).toContain('op-4');
        });
      });
    });

    describe('category filtering', () => {
      it('filters by single category', async () => {
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
          result.current.actions.updateSearchFilters({ categoryIds: ['cat-1'] });
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          expect(filtered).toHaveLength(2);
          expect(filtered.every(op => op.categoryId === 'cat-1')).toBe(true);
        });
      });

      it('filters by multiple categories', async () => {
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        // deliberately swap dates (start > end)
        await act(async () => {
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
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
        const result = await setupWithOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(5);
        });

        await act(async () => {
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

    describe('Cyrillic text search filtering', () => {
      const cyrillicOperations = [
        {
          id: 'op-cyr-1',
          type: 'expense',
          accountId: 'acc-1',
          categoryId: 'cat-3',
          amount: '250',
          description: 'Самолет Москва-Лондон',
          date: '2026-04-18',
        },
        {
          id: 'op-cyr-2',
          type: 'expense',
          accountId: 'acc-1',
          categoryId: 'cat-5', // Транспорт (child of Путешествия)
          amount: '30',
          description: 'Автобус',
          date: '2026-04-19',
        },
        {
          id: 'op-cyr-3',
          type: 'expense',
          accountId: 'acc-2',
          categoryId: 'cat-6', // Путешествия (parent category)
          amount: '500',
          description: 'Отель',
          date: '2026-04-20',
        },
      ];

      const setupWithCyrillicOperations = async () => {
        OperationsDB.getOperationsByWeekOffset.mockResolvedValue(cyrillicOperations);
        OperationsDB.getFilteredOperationsAllDates.mockResolvedValue(cyrillicOperations);
        OperationsDB.getAllOperations.mockResolvedValue(cyrillicOperations);

        const { result } = await renderHook(
          () => ({
            data: useOperationsData(),
            actions: useOperationsActions(),
          }),
          { wrapper },
        );

        return result;
      };

      it('matches Cyrillic description case-insensitively (uppercase search finds lowercase data)', async () => {
        const result = await setupWithCyrillicOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(3);
        });

        await act(async () => {
          result.current.actions.setSearchText('САМОЛЕТ');
        });

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(1);
          expect(result.current.data.operations[0].id).toBe('op-cyr-1');
        });
      });

      it('matches Cyrillic description case-insensitively (lowercase search finds mixed-case data)', async () => {
        const result = await setupWithCyrillicOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(3);
        });

        await act(async () => {
          result.current.actions.setSearchText('самолет');
        });

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(1);
          expect(result.current.data.operations[0].id).toBe('op-cyr-1');
        });
      });

      it('matches Cyrillic category name case-insensitively', async () => {
        const result = await setupWithCyrillicOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(3);
        });

        // Search for category name "Транспорт" using uppercase
        await act(async () => {
          result.current.actions.setSearchText('ТРАНСПОРТ');
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          // op-cyr-2 has category Транспорт (cat-5)
          expect(filtered.some(op => op.id === 'op-cyr-2')).toBe(true);
        });
      });

      it('matches Cyrillic parent category name via hierarchy traversal', async () => {
        const result = await setupWithCyrillicOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(3);
        });

        // "путешествия" is the parent of "Транспорт"; searching for it should find op-cyr-2
        await act(async () => {
          result.current.actions.setSearchText('путешествия');
        });

        await waitFor(() => {
          const filtered = result.current.data.operations;
          // op-cyr-2 has cat-5 (Транспорт, child of Путешествия)
          // op-cyr-3 has cat-6 (Путешествия directly)
          expect(filtered.map(op => op.id).sort()).toEqual(['op-cyr-2', 'op-cyr-3']);
        });
      });

      it('matches partial Cyrillic text in description', async () => {
        const result = await setupWithCyrillicOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(3);
        });

        await act(async () => {
          result.current.actions.setSearchText('моск');
        });

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(1);
          expect(result.current.data.operations[0].id).toBe('op-cyr-1');
        });
      });
    });

    describe('Russian ё/е equivalence (yo-folding) — regression for keyboard autocomplete bug', () => {
      // The screenshot bug: user typed "Самолет" (with е); Russian keyboard autocomplete
      // submitted "Самолёт" (with ё), and the visible "Самолет" transaction in the list
      // no longer matched. The fix folds ё → е so both spellings normalize to the same
      // string. Same behaviour as Elasticsearch's russian analyzer.
      const yoOperations = [
        {
          id: 'op-yo-plain',
          type: 'expense',
          accountId: 'acc-1',
          categoryId: 'cat-3',
          amount: '252000',
          description: 'Самолет', // plain е
          date: '2026-04-11',
        },
        {
          id: 'op-yo-dot',
          type: 'expense',
          accountId: 'acc-1',
          categoryId: 'cat-3',
          amount: '200',
          description: 'Покупка Самолёт', // with ё
          date: '2019-07-10',
        },
      ];

      const setupWithYoOperations = async () => {
        OperationsDB.getOperationsByWeekOffset.mockResolvedValue(yoOperations);
        OperationsDB.getFilteredOperationsAllDates.mockResolvedValue(yoOperations);
        OperationsDB.getAllOperations.mockResolvedValue(yoOperations);
        const { result } = await renderHook(
          () => ({
            data: useOperationsData(),
            actions: useOperationsActions(),
          }),
          { wrapper },
        );
        return result;
      };

      it('search with е finds descriptions written with ё', async () => {
        const result = await setupWithYoOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(2);
        });

        // Type with plain е — should find BOTH the plain and the ё version.
        await act(async () => {
          result.current.actions.setSearchText('Самолет');
        });

        await waitFor(() => {
          expect(result.current.data.operations.map(op => op.id).sort())
            .toEqual(['op-yo-dot', 'op-yo-plain']);
        });
      });

      it('search with ё finds descriptions written with е', async () => {
        const result = await setupWithYoOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(2);
        });

        // Type with ё (or keyboard autocomplete supplies it) — should still match plain е.
        await act(async () => {
          result.current.actions.setSearchText('Самолёт');
        });

        await waitFor(() => {
          expect(result.current.data.operations.map(op => op.id).sort())
            .toEqual(['op-yo-dot', 'op-yo-plain']);
        });
      });

      it('yo-fold combines with case-folding', async () => {
        const result = await setupWithYoOperations();

        await waitFor(() => {
          expect(result.current.data.operations).toHaveLength(2);
        });

        // ALL-CAPS with ё — should still match both.
        await act(async () => {
          result.current.actions.setSearchText('САМОЛЁТ');
        });

        await waitFor(() => {
          expect(result.current.data.operations.map(op => op.id).sort())
            .toEqual(['op-yo-dot', 'op-yo-plain']);
        });
      });
    });
  });
});
