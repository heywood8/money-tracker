/**
 * Tests for BudgetsContext - State management for budgets
 * These tests ensure the context provides correct state and operations
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { BudgetsProvider, useBudgets } from '../../app/contexts/BudgetsContext';
import * as BudgetsDB from '../../app/services/BudgetsDB';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

// Mock dependencies
jest.mock('../../app/services/BudgetsDB');
jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: {
    on: jest.fn(),
    emit: jest.fn(),
  },
  EVENTS: {
    OPERATION_CHANGED: 'OPERATION_CHANGED',
    RELOAD_ALL: 'RELOAD_ALL',
    DATABASE_RESET: 'DATABASE_RESET',
  },
}));

// Mock DialogContext
const mockShowDialog = jest.fn();
jest.mock('../../app/contexts/DialogContext', () => ({
  DialogProvider: ({ children }) => children,
  useDialog: () => ({
    showDialog: mockShowDialog,
    hideDialog: jest.fn(),
  }),
}));

describe('BudgetsContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShowDialog.mockClear();
    // Default mock implementations
    BudgetsDB.getAllBudgets.mockResolvedValue([]);
    BudgetsDB.calculateAllBudgetStatuses.mockResolvedValue(new Map());
    // Return realistic created budget object with numeric id
    let _budgetId = 2000;
    BudgetsDB.createBudget.mockImplementation(async (budget) => {
      _budgetId += 1;
      return {
        ...budget,
        id: _budgetId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
    BudgetsDB.updateBudget.mockResolvedValue(undefined);
    BudgetsDB.deleteBudget.mockResolvedValue(undefined);
    BudgetsDB.validateBudget.mockReturnValue(null);
    BudgetsDB.findDuplicateBudget.mockResolvedValue(null);
  });

  const wrapper = ({ children }) => <BudgetsProvider>{children}</BudgetsProvider>;

  describe('Initialization', () => {
    it('provides budgets context with initial values', async () => {
      const mockBudgets = [
        {
          id: '1',
          categoryId: 'cat1',
          amount: '1000',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
          endDate: null,
          isRecurring: true,
          rolloverEnabled: false,
        },
        {
          id: '2',
          categoryId: 'cat2',
          amount: '500',
          currency: 'EUR',
          periodType: 'weekly',
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          isRecurring: false,
          rolloverEnabled: true,
        },
      ];
      BudgetsDB.getAllBudgets.mockResolvedValue(mockBudgets);

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.budgets).toEqual(mockBudgets);
      expect(result.current.saveError).toBeNull();
      expect(BudgetsDB.getAllBudgets).toHaveBeenCalled();
      expect(BudgetsDB.calculateAllBudgetStatuses).toHaveBeenCalled();
    });

    it('handles empty budget list', async () => {
      BudgetsDB.getAllBudgets.mockResolvedValue([]);

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.budgets).toEqual([]);
      expect(result.current.saveError).toBeNull();
    });

    it('handles load error gracefully', async () => {
      const error = new Error('Database connection failed');
      BudgetsDB.getAllBudgets.mockRejectedValue(error);

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.budgets).toEqual([]);
      expect(result.current.saveError).toBe('Database connection failed');
    });

    it('throws error when used outside provider', () => {
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = jest.fn();

      expect(() => {
        renderHook(() => useBudgets());
      }).toThrow('useBudgets must be used within a BudgetsProvider');

      console.error = originalError;
    });
  });

  describe('Budget Status Loading', () => {
    it('loads budget statuses on initialization', async () => {
      const mockStatuses = new Map([
        ['1', { budgetId: '1', spent: 500, remaining: 500, percentage: 50, isExceeded: false }],
        ['2', { budgetId: '2', spent: 300, remaining: 200, percentage: 60, isExceeded: false }],
      ]);
      BudgetsDB.calculateAllBudgetStatuses.mockResolvedValue(mockStatuses);

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.budgetStatuses).toEqual(mockStatuses);
    });

    it('handles status calculation error gracefully', async () => {
      BudgetsDB.calculateAllBudgetStatuses.mockRejectedValue(new Error('Calculation failed'));

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should not throw, budgetStatuses should be initialized Map
      expect(result.current.budgetStatuses).toBeInstanceOf(Map);
    });
  });

  describe('Adding Budgets', () => {
    it('adds a new budget successfully', async () => {
      const newBudget = {
        categoryId: 'cat1',
        amount: '1000',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
        endDate: null,
        isRecurring: true,
        rolloverEnabled: false,
      };

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let addedBudget;
      await act(async () => {
        addedBudget = await result.current.addBudget(newBudget);
      });

      expect(addedBudget.id).toEqual(expect.any(Number));
      expect(result.current.budgets).toHaveLength(1);
      expect(result.current.budgets[0]).toEqual(addedBudget);
      expect(BudgetsDB.createBudget).toHaveBeenCalledWith(
        expect.objectContaining({
          ...newBudget,
        })
      );
      expect(BudgetsDB.calculateAllBudgetStatuses).toHaveBeenCalledTimes(2); // Once on init, once after add
    });

    it('rejects invalid budget data', async () => {
      BudgetsDB.validateBudget.mockReturnValue('Amount must be greater than zero');

      const invalidBudget = {
        categoryId: 'cat1',
        amount: '0',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.addBudget(invalidBudget);
        })
      ).rejects.toThrow('Amount must be greater than zero');

      expect(result.current.budgets).toHaveLength(0);
      expect(BudgetsDB.createBudget).not.toHaveBeenCalled();
      expect(mockShowDialog).toHaveBeenCalledWith(
        'Error',
        'Amount must be greater than zero',
        [{ text: 'OK' }]
      );
    });

    it('prevents duplicate budgets', async () => {
      const existingBudget = {
        id: 'existing-1',
        categoryId: 'cat1',
        currency: 'USD',
        periodType: 'monthly',
        amount: '500',
      };
      BudgetsDB.findDuplicateBudget.mockResolvedValue(existingBudget);

      const duplicateBudget = {
        categoryId: 'cat1',
        amount: '1000',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.addBudget(duplicateBudget);
        })
      ).rejects.toThrow('A budget already exists for this category, currency, and period type');

      expect(result.current.budgets).toHaveLength(0);
      expect(BudgetsDB.createBudget).not.toHaveBeenCalled();
    });

    it('sets saveError on add failure', async () => {
      BudgetsDB.createBudget.mockRejectedValue(new Error('Database insert failed'));

      const budget = {
        categoryId: 'cat1',
        amount: '1000',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.addBudget(budget);
        })
      ).rejects.toThrow('Database insert failed');

      await waitFor(() => {
        expect(mockShowDialog).toHaveBeenCalledWith(
          'Error',
          'Database insert failed',
          [{ text: 'OK' }]
        );
      });
    });
  });

  describe('Updating Budgets', () => {
    it('updates an existing budget successfully', async () => {
      const existingBudgets = [
        {
          id: '1',
          categoryId: 'cat1',
          amount: '1000',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
        },
      ];
      BudgetsDB.getAllBudgets.mockResolvedValue(existingBudgets);

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const updates = { amount: '1500' };

      await act(async () => {
        await result.current.updateBudget('1', updates);
      });

      expect(BudgetsDB.updateBudget).toHaveBeenCalledWith('1', updates);
      expect(result.current.budgets[0].amount).toBe('1500');
      expect(BudgetsDB.calculateAllBudgetStatuses).toHaveBeenCalledTimes(2);
    });

    it('rejects update for non-existent budget', async () => {
      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.updateBudget('non-existent', { amount: '1000' });
        })
      ).rejects.toThrow('Budget not found');

      expect(BudgetsDB.updateBudget).not.toHaveBeenCalled();
    });

    it('validates updated budget data', async () => {
      const existingBudgets = [
        {
          id: '1',
          categoryId: 'cat1',
          amount: '1000',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
        },
      ];
      BudgetsDB.getAllBudgets.mockResolvedValue(existingBudgets);
      BudgetsDB.validateBudget.mockReturnValue('Invalid period type');

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.updateBudget('1', { periodType: 'invalid' });
        })
      ).rejects.toThrow('Invalid period type');

      expect(BudgetsDB.updateBudget).not.toHaveBeenCalled();
      expect(mockShowDialog).toHaveBeenCalledWith('Error', 'Invalid period type', [{ text: 'OK' }]);
    });

    it('checks for duplicates when updating category/currency/period', async () => {
      const existingBudgets = [
        {
          id: '1',
          categoryId: 'cat1',
          amount: '1000',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
        },
      ];
      BudgetsDB.getAllBudgets.mockResolvedValue(existingBudgets);
      BudgetsDB.findDuplicateBudget.mockResolvedValue({
        id: '2',
        categoryId: 'cat2',
        currency: 'USD',
        periodType: 'monthly',
      });

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.updateBudget('1', { categoryId: 'cat2' });
        })
      ).rejects.toThrow('A budget already exists for this category, currency, and period type');

      expect(BudgetsDB.updateBudget).not.toHaveBeenCalled();
    });

    it('sets saveError on update failure', async () => {
      const existingBudgets = [
        {
          id: '1',
          categoryId: 'cat1',
          amount: '1000',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
        },
      ];
      BudgetsDB.getAllBudgets.mockResolvedValue(existingBudgets);
      BudgetsDB.updateBudget.mockRejectedValue(new Error('Database update failed'));

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.updateBudget('1', { amount: '1500' });
        })
      ).rejects.toThrow('Database update failed');

      expect(mockShowDialog).toHaveBeenCalledWith(
        'Error',
        'Database update failed',
        [{ text: 'OK' }]
      );
    });
  });

  describe('Deleting Budgets', () => {
    it('deletes a budget successfully', async () => {
      const existingBudgets = [
        {
          id: '1',
          categoryId: 'cat1',
          amount: '1000',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
        },
        {
          id: '2',
          categoryId: 'cat2',
          amount: '500',
          currency: 'EUR',
          periodType: 'weekly',
          startDate: '2025-01-01',
        },
      ];
      BudgetsDB.getAllBudgets.mockResolvedValue(existingBudgets);

      const mockStatuses = new Map([
        ['1', { budgetId: '1', spent: 500, remaining: 500 }],
        ['2', { budgetId: '2', spent: 300, remaining: 200 }],
      ]);
      BudgetsDB.calculateAllBudgetStatuses.mockResolvedValue(mockStatuses);

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteBudget('1');
      });

      expect(BudgetsDB.deleteBudget).toHaveBeenCalledWith('1');
      expect(result.current.budgets).toHaveLength(1);
      expect(result.current.budgets[0].id).toBe('2');
      expect(result.current.budgetStatuses.has('1')).toBe(false);
      expect(result.current.budgetStatuses.has('2')).toBe(true);
    });

    it('shows dialog on delete failure', async () => {
      const existingBudgets = [
        {
          id: '1',
          categoryId: 'cat1',
          amount: '1000',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
        },
      ];
      BudgetsDB.getAllBudgets.mockResolvedValue(existingBudgets);
      BudgetsDB.deleteBudget.mockRejectedValue(new Error('Foreign key constraint'));

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.deleteBudget('1');
        })
      ).rejects.toThrow('Foreign key constraint');

      expect(mockShowDialog).toHaveBeenCalledWith(
        'Error',
        'Failed to delete budget. Please try again.',
        [{ text: 'OK' }]
      );
    });
  });

  describe('Query Functions', () => {
    beforeEach(async () => {
      const mockBudgets = [
        {
          id: '1',
          categoryId: 'cat1',
          amount: '1000',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
          endDate: null,
        },
        {
          id: '2',
          categoryId: 'cat2',
          amount: '500',
          currency: 'USD',
          periodType: 'weekly',
          startDate: '2025-01-01',
          endDate: '2025-12-31',
        },
        {
          id: '3',
          categoryId: 'cat1',
          amount: '2000',
          currency: 'EUR',
          periodType: 'monthly',
          startDate: '2025-01-01',
          endDate: null,
        },
      ];
      BudgetsDB.getAllBudgets.mockResolvedValue(mockBudgets);
    });

    it('gets budget for category', async () => {
      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const budget = result.current.getBudgetForCategory('cat1');
      expect(budget).toBeDefined();
      expect(budget.categoryId).toBe('cat1');
    });

    it('gets budget for category with currency filter', async () => {
      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const budget = result.current.getBudgetForCategory('cat1', 'EUR');
      expect(budget).toBeDefined();
      expect(budget.currency).toBe('EUR');
    });

    it('gets budget for category with period type filter', async () => {
      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const budget = result.current.getBudgetForCategory('cat2', null, 'weekly');
      expect(budget).toBeDefined();
      expect(budget.periodType).toBe('weekly');
    });

    it('returns undefined for non-existent category', async () => {
      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const budget = result.current.getBudgetForCategory('non-existent');
      expect(budget).toBeUndefined();
    });

    it('gets budgets by period type', async () => {
      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const monthlyBudgets = result.current.getBudgetsByPeriod('monthly');
      expect(monthlyBudgets).toHaveLength(2);
      expect(monthlyBudgets.every(b => b.periodType === 'monthly')).toBe(true);

      const weeklyBudgets = result.current.getBudgetsByPeriod('weekly');
      expect(weeklyBudgets).toHaveLength(1);
      expect(weeklyBudgets[0].periodType).toBe('weekly');
    });

    it('checks if category has active budget', async () => {
      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.hasActiveBudget('cat1')).toBe(true);
      expect(result.current.hasActiveBudget('cat2')).toBe(true);
      expect(result.current.hasActiveBudget('non-existent')).toBe(false);
    });

    it('checks active budget with currency filter', async () => {
      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.hasActiveBudget('cat1', 'USD')).toBe(true);
      expect(result.current.hasActiveBudget('cat1', 'EUR')).toBe(true);
      expect(result.current.hasActiveBudget('cat1', 'GBP')).toBe(false);
    });
  });

  describe('Budget Status Functions', () => {
    beforeEach(async () => {
      const mockBudgets = [
        {
          id: '1',
          categoryId: 'cat1',
          amount: '1000',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
        },
      ];
      BudgetsDB.getAllBudgets.mockResolvedValue(mockBudgets);
    });

    it('gets budget status', async () => {
      const mockStatus = {
        budgetId: '1',
        spent: 500,
        remaining: 500,
        percentage: 50,
        isExceeded: false,
      };
      const mockStatuses = new Map([['1', mockStatus]]);
      BudgetsDB.calculateAllBudgetStatuses.mockResolvedValue(mockStatuses);

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const status = result.current.getBudgetStatus('1');
      expect(status).toEqual(mockStatus);
    });

    it('returns null for non-existent budget status', async () => {
      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const status = result.current.getBudgetStatus('non-existent');
      expect(status).toBeNull();
    });

    it('checks if budget is exceeded', async () => {
      const mockStatuses = new Map([
        ['1', { budgetId: '1', spent: 1200, remaining: -200, isExceeded: true }],
      ]);
      BudgetsDB.calculateAllBudgetStatuses.mockResolvedValue(mockStatuses);

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isBudgetExceeded('1')).toBe(true);
    });

    it('returns false for non-existent budget exceeded check', async () => {
      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isBudgetExceeded('non-existent')).toBe(false);
    });

    it('gets budget progress percentage', async () => {
      const mockStatuses = new Map([
        ['1', { budgetId: '1', spent: 750, remaining: 250, percentage: 75 }],
      ]);
      BudgetsDB.calculateAllBudgetStatuses.mockResolvedValue(mockStatuses);

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.getBudgetProgress('1')).toBe(75);
    });

    it('returns 0 for non-existent budget progress', async () => {
      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.getBudgetProgress('non-existent')).toBe(0);
    });

    it('gets remaining budget amount', async () => {
      const mockStatuses = new Map([
        ['1', { budgetId: '1', spent: 300, remaining: 700 }],
      ]);
      BudgetsDB.calculateAllBudgetStatuses.mockResolvedValue(mockStatuses);

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.getRemainingBudget('1')).toBe(700);
    });

    it('returns 0 for non-existent budget remaining', async () => {
      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.getRemainingBudget('non-existent')).toBe(0);
    });
  });

  describe('Reload Functions', () => {
    it('reloads budgets manually', async () => {
      BudgetsDB.getAllBudgets.mockResolvedValue([]);

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newBudgets = [
        {
          id: '1',
          categoryId: 'cat1',
          amount: '1000',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
        },
      ];
      BudgetsDB.getAllBudgets.mockResolvedValue(newBudgets);

      await act(async () => {
        await result.current.reloadBudgets();
      });

      expect(result.current.budgets).toEqual(newBudgets);
      expect(BudgetsDB.getAllBudgets).toHaveBeenCalledTimes(2);
    });

    it('refreshes budget statuses manually', async () => {
      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newStatuses = new Map([
        ['1', { budgetId: '1', spent: 800, remaining: 200 }],
      ]);
      BudgetsDB.calculateAllBudgetStatuses.mockResolvedValue(newStatuses);

      await act(async () => {
        await result.current.refreshBudgetStatuses();
      });

      expect(result.current.budgetStatuses).toEqual(newStatuses);
      expect(BudgetsDB.calculateAllBudgetStatuses).toHaveBeenCalledTimes(2);
    });
  });

  describe('Event Handling', () => {
    it('listens to OPERATION_CHANGED event', async () => {
      let operationChangedCallback;
      appEvents.on.mockImplementation((event, callback) => {
        if (event === EVENTS.OPERATION_CHANGED) {
          operationChangedCallback = callback;
        }
        return jest.fn(); // Return unsubscribe function
      });

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(appEvents.on).toHaveBeenCalledWith(
        EVENTS.OPERATION_CHANGED,
        expect.any(Function)
      );

      // Simulate operation change
      const newStatuses = new Map([
        ['1', { budgetId: '1', spent: 600, remaining: 400 }],
      ]);
      BudgetsDB.calculateAllBudgetStatuses.mockResolvedValue(newStatuses);

      await act(async () => {
        operationChangedCallback();
      });

      await waitFor(() => {
        expect(BudgetsDB.calculateAllBudgetStatuses).toHaveBeenCalledTimes(2);
      });
    });

    it('listens to RELOAD_ALL event', async () => {
      let reloadAllCallback;
      appEvents.on.mockImplementation((event, callback) => {
        if (event === EVENTS.RELOAD_ALL) {
          reloadAllCallback = callback;
        }
        return jest.fn();
      });

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(appEvents.on).toHaveBeenCalledWith(EVENTS.RELOAD_ALL, expect.any(Function));

      // Simulate reload event
      const newBudgets = [
        {
          id: 'new1',
          categoryId: 'cat1',
          amount: '2000',
          currency: 'USD',
          periodType: 'yearly',
          startDate: '2025-01-01',
        },
      ];
      BudgetsDB.getAllBudgets.mockResolvedValue(newBudgets);

      await act(async () => {
        reloadAllCallback();
      });

      await waitFor(() => {
        expect(result.current.budgets).toEqual(newBudgets);
      });
    });

    it('listens to DATABASE_RESET event', async () => {
      let databaseResetCallback;
      appEvents.on.mockImplementation((event, callback) => {
        if (event === EVENTS.DATABASE_RESET) {
          databaseResetCallback = callback;
        }
        return jest.fn();
      });

      const mockBudgets = [
        {
          id: '1',
          categoryId: 'cat1',
          amount: '1000',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
        },
      ];
      BudgetsDB.getAllBudgets.mockResolvedValue(mockBudgets);

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.budgets).toHaveLength(1);
      });

      expect(appEvents.on).toHaveBeenCalledWith(
        EVENTS.DATABASE_RESET,
        expect.any(Function)
      );

      // Simulate database reset
      act(() => {
        databaseResetCallback();
      });

      expect(result.current.budgets).toEqual([]);
      expect(result.current.budgetStatuses).toEqual(new Map());
    });

    it('unsubscribes from events on unmount', async () => {
      const unsubscribeMocks = {
        operationChanged: jest.fn(),
        reloadAll: jest.fn(),
        databaseReset: jest.fn(),
      };

      appEvents.on.mockImplementation((event) => {
        if (event === EVENTS.OPERATION_CHANGED) return unsubscribeMocks.operationChanged;
        if (event === EVENTS.RELOAD_ALL) return unsubscribeMocks.reloadAll;
        if (event === EVENTS.DATABASE_RESET) return unsubscribeMocks.databaseReset;
        return jest.fn();
      });

      const { unmount } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(appEvents.on).toHaveBeenCalledTimes(3);
      });

      unmount();

      expect(unsubscribeMocks.operationChanged).toHaveBeenCalled();
      expect(unsubscribeMocks.reloadAll).toHaveBeenCalled();
      expect(unsubscribeMocks.databaseReset).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles concurrent budget operations', async () => {
      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const budget1 = {
        categoryId: 'cat1',
        amount: '1000',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      const budget2 = {
        categoryId: 'cat2',
        amount: '500',
        currency: 'EUR',
        periodType: 'weekly',
        startDate: '2025-01-01',
      };

      await act(async () => {
        await Promise.all([
          result.current.addBudget(budget1),
          result.current.addBudget(budget2),
        ]);
      });

      expect(result.current.budgets).toHaveLength(2);
    });

    it('maintains state consistency after multiple operations', async () => {
      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Add budget
      const budget = {
        categoryId: 'cat1',
        amount: '1000',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      let addedBudget;
      await act(async () => {
        addedBudget = await result.current.addBudget(budget);
      });

      // Update budget
      await act(async () => {
        await result.current.updateBudget(addedBudget.id, { amount: '1500' });
      });

      // Delete budget
      await act(async () => {
        await result.current.deleteBudget(addedBudget.id);
      });

      expect(result.current.budgets).toHaveLength(0);
      expect(result.current.saveError).toBeNull();
    });

    it('handles empty status map gracefully', async () => {
      BudgetsDB.calculateAllBudgetStatuses.mockResolvedValue(new Map());

      const { result } = renderHook(() => useBudgets(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.getBudgetStatus('any-id')).toBeNull();
      expect(result.current.isBudgetExceeded('any-id')).toBe(false);
      expect(result.current.getBudgetProgress('any-id')).toBe(0);
      expect(result.current.getRemainingBudget('any-id')).toBe(0);
    });
  });
});
