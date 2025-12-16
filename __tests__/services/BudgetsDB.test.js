/**
 * Tests for BudgetsDB Service - Database operations for budgets
 * These tests ensure CRUD operations, validation, queries, and calculations work correctly
 */

import * as BudgetsDB from '../../app/services/BudgetsDB';
import * as CategoriesDB from '../../app/services/CategoriesDB';
import { executeQuery, queryAll, queryFirst, executeTransaction } from '../../app/services/db';

// Mock dependencies
jest.mock('../../app/services/db');
jest.mock('../../app/services/CategoriesDB');

describe('BudgetsDB Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    executeQuery.mockResolvedValue(undefined);
    queryAll.mockResolvedValue([]);
    queryFirst.mockResolvedValue(null);
  });

  describe('Validation', () => {
    it('validates budget with all required fields', () => {
      const validBudget = {
        categoryId: 'cat1',
        amount: '100.00',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      const error = BudgetsDB.validateBudget(validBudget);
      expect(error).toBeNull();
    });

    it('rejects budget without category', () => {
      const budget = {
        amount: '100.00',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      const error = BudgetsDB.validateBudget(budget);
      expect(error).toBe('Category is required');
    });

    it('rejects budget without amount', () => {
      const budget = {
        categoryId: 'cat1',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      const error = BudgetsDB.validateBudget(budget);
      expect(error).toBe('Amount must be greater than zero');
    });

    it('rejects budget with zero amount', () => {
      const budget = {
        categoryId: 'cat1',
        amount: '0',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      const error = BudgetsDB.validateBudget(budget);
      expect(error).toBe('Amount must be greater than zero');
    });

    it('rejects budget with negative amount', () => {
      const budget = {
        categoryId: 'cat1',
        amount: '-100',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      const error = BudgetsDB.validateBudget(budget);
      expect(error).toBe('Amount must be greater than zero');
    });

    it('rejects budget without currency', () => {
      const budget = {
        categoryId: 'cat1',
        amount: '100.00',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      const error = BudgetsDB.validateBudget(budget);
      expect(error).toBe('Currency is required');
    });

    it('rejects budget with invalid period type', () => {
      const budget = {
        categoryId: 'cat1',
        amount: '100.00',
        currency: 'USD',
        periodType: 'daily',
        startDate: '2025-01-01',
      };

      const error = BudgetsDB.validateBudget(budget);
      expect(error).toBe('Invalid period type');
    });

    it('accepts valid period types', () => {
      const periodTypes = ['weekly', 'monthly', 'yearly'];

      periodTypes.forEach(periodType => {
        const budget = {
          categoryId: 'cat1',
          amount: '100.00',
          currency: 'USD',
          periodType,
          startDate: '2025-01-01',
        };

        const error = BudgetsDB.validateBudget(budget);
        expect(error).toBeNull();
      });
    });

    it('rejects budget without start date', () => {
      const budget = {
        categoryId: 'cat1',
        amount: '100.00',
        currency: 'USD',
        periodType: 'monthly',
      };

      const error = BudgetsDB.validateBudget(budget);
      expect(error).toBe('Start date is required');
    });

    it('rejects budget with end date before start date', () => {
      const budget = {
        categoryId: 'cat1',
        amount: '100.00',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
        endDate: '2024-12-31',
      };

      const error = BudgetsDB.validateBudget(budget);
      expect(error).toBe('End date must be after start date');
    });

    it('rejects budget with end date equal to start date', () => {
      const budget = {
        categoryId: 'cat1',
        amount: '100.00',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
        endDate: '2025-01-01',
      };

      const error = BudgetsDB.validateBudget(budget);
      expect(error).toBe('End date must be after start date');
    });

    it('accepts budget with valid end date', () => {
      const budget = {
        categoryId: 'cat1',
        amount: '100.00',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      };

      const error = BudgetsDB.validateBudget(budget);
      expect(error).toBeNull();
    });

    it('accepts budget without end date (indefinite)', () => {
      const budget = {
        categoryId: 'cat1',
        amount: '100.00',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      const error = BudgetsDB.validateBudget(budget);
      expect(error).toBeNull();
    });
  });

  describe('CRUD Operations', () => {
    describe('createBudget', () => {
      it('creates a new budget with valid data', async () => {
        const budget = {
          id: 'budget1',
          categoryId: 'cat1',
          amount: '500.00',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
          isRecurring: true,
        };

        await BudgetsDB.createBudget(budget);

        expect(executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO budgets'),
          expect.arrayContaining([
            'budget1',
            'cat1',
            '500.00',
            'USD',
            'monthly',
            '2025-01-01',
          ]),
        );
      });

      it('throws error for invalid budget', async () => {
        const invalidBudget = {
          categoryId: 'cat1',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
          // Missing amount
        };

        await expect(BudgetsDB.createBudget(invalidBudget))
          .rejects.toThrow('Amount must be greater than zero');
      });

      it('sets isRecurring to 1 by default', async () => {
        const budget = {
          id: 'budget1',
          categoryId: 'cat1',
          amount: '500.00',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
        };

        await BudgetsDB.createBudget(budget);

        expect(executeQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([1]), // is_recurring defaults to 1
        );
      });

      it('handles rolloverEnabled flag', async () => {
        const budget = {
          id: 'budget1',
          categoryId: 'cat1',
          amount: '500.00',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
          rolloverEnabled: true,
        };

        await BudgetsDB.createBudget(budget);

        expect(executeQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([1]), // rollover_enabled set to 1
        );
      });
    });

    describe('getBudgetById', () => {
      it('retrieves budget by ID', async () => {
        const mockBudget = {
          id: 'budget1',
          category_id: 'cat1',
          amount: '500.00',
          currency: 'USD',
          period_type: 'monthly',
          start_date: '2025-01-01',
          end_date: null,
          is_recurring: 1,
          rollover_enabled: 0,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        };
        queryFirst.mockResolvedValue(mockBudget);

        const result = await BudgetsDB.getBudgetById('budget1');

        expect(queryFirst).toHaveBeenCalledWith(
          'SELECT * FROM budgets WHERE id = ?',
          ['budget1'],
        );
        expect(result.categoryId).toBe('cat1');
        expect(result.isRecurring).toBe(true);
        expect(result.rolloverEnabled).toBe(false);
      });

      it('returns null for non-existent budget', async () => {
        queryFirst.mockResolvedValue(null);

        const result = await BudgetsDB.getBudgetById('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('getAllBudgets', () => {
      it('retrieves all budgets', async () => {
        const mockBudgets = [
          {
            id: 'budget1',
            category_id: 'cat1',
            amount: '500.00',
            currency: 'USD',
            period_type: 'monthly',
            start_date: '2025-01-01',
            end_date: null,
            is_recurring: 1,
            rollover_enabled: 0,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ];
        queryAll.mockResolvedValue(mockBudgets);

        const result = await BudgetsDB.getAllBudgets();

        expect(queryAll).toHaveBeenCalledWith(
          'SELECT * FROM budgets ORDER BY created_at DESC',
        );
        expect(result).toHaveLength(1);
        expect(result[0].categoryId).toBe('cat1');
      });

      it('handles empty budgets list', async () => {
        queryAll.mockResolvedValue([]);

        const result = await BudgetsDB.getAllBudgets();

        expect(result).toEqual([]);
      });
    });

    describe('getBudgetsByCategory', () => {
      it('retrieves budgets for specific category', async () => {
        const mockBudgets = [
          {
            id: 'budget1',
            category_id: 'cat1',
            amount: '500.00',
            currency: 'USD',
            period_type: 'monthly',
            start_date: '2025-01-01',
            end_date: null,
            is_recurring: 1,
            rollover_enabled: 0,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ];
        queryAll.mockResolvedValue(mockBudgets);

        const result = await BudgetsDB.getBudgetsByCategory('cat1');

        expect(queryAll).toHaveBeenCalledWith(
          'SELECT * FROM budgets WHERE category_id = ? ORDER BY created_at DESC',
          ['cat1'],
        );
        expect(result).toHaveLength(1);
      });
    });

    describe('getBudgetsByCurrency', () => {
      it('retrieves budgets for specific currency', async () => {
        const mockBudgets = [
          {
            id: 'budget1',
            category_id: 'cat1',
            amount: '500.00',
            currency: 'EUR',
            period_type: 'monthly',
            start_date: '2025-01-01',
            end_date: null,
            is_recurring: 1,
            rollover_enabled: 0,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ];
        queryAll.mockResolvedValue(mockBudgets);

        const result = await BudgetsDB.getBudgetsByCurrency('EUR');

        expect(queryAll).toHaveBeenCalledWith(
          'SELECT * FROM budgets WHERE currency = ? ORDER BY created_at DESC',
          ['EUR'],
        );
        expect(result).toHaveLength(1);
      });
    });

    describe('getBudgetsByPeriodType', () => {
      it('retrieves budgets for specific period type', async () => {
        const mockBudgets = [
          {
            id: 'budget1',
            category_id: 'cat1',
            amount: '500.00',
            currency: 'USD',
            period_type: 'weekly',
            start_date: '2025-01-01',
            end_date: null,
            is_recurring: 1,
            rollover_enabled: 0,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ];
        queryAll.mockResolvedValue(mockBudgets);

        const result = await BudgetsDB.getBudgetsByPeriodType('weekly');

        expect(queryAll).toHaveBeenCalledWith(
          'SELECT * FROM budgets WHERE period_type = ? ORDER BY created_at DESC',
          ['weekly'],
        );
        expect(result).toHaveLength(1);
      });
    });

    describe('updateBudget', () => {
      it('updates budget with new values', async () => {
        await BudgetsDB.updateBudget('budget1', {
          amount: '750.00',
          currency: 'EUR',
        });

        expect(executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE budgets SET'),
          expect.arrayContaining(['750.00', 'EUR', 'budget1']),
        );
      });

      it('handles partial updates', async () => {
        await BudgetsDB.updateBudget('budget1', {
          amount: '1000.00',
        });

        expect(executeQuery).toHaveBeenCalledWith(
          expect.stringMatching(/UPDATE budgets SET amount = \?, updated_at = \? WHERE id = \?/),
          expect.arrayContaining(['1000.00', 'budget1']),
        );
      });

      it('does nothing when no updates provided', async () => {
        await BudgetsDB.updateBudget('budget1', {});

        expect(executeQuery).not.toHaveBeenCalled();
      });

      it('updates isRecurring flag', async () => {
        await BudgetsDB.updateBudget('budget1', {
          isRecurring: false,
        });

        expect(executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('is_recurring = ?'),
          expect.arrayContaining([0]),
        );
      });

      it('updates rolloverEnabled flag', async () => {
        await BudgetsDB.updateBudget('budget1', {
          rolloverEnabled: true,
        });

        expect(executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('rollover_enabled = ?'),
          expect.arrayContaining([1]),
        );
      });

      it('clears end date when set to null', async () => {
        await BudgetsDB.updateBudget('budget1', {
          endDate: null,
        });

        expect(executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('end_date = ?'),
          expect.arrayContaining([null]),
        );
      });
    });

    describe('deleteBudget', () => {
      it('deletes budget by ID', async () => {
        await BudgetsDB.deleteBudget('budget1');

        expect(executeQuery).toHaveBeenCalledWith(
          'DELETE FROM budgets WHERE id = ?',
          ['budget1'],
        );
      });
    });
  });

  describe('Query Functions', () => {
    describe('getActiveBudgets', () => {
      it('retrieves active budgets for today', async () => {
        const mockBudgets = [
          {
            id: 'budget1',
            category_id: 'cat1',
            amount: '500.00',
            currency: 'USD',
            period_type: 'monthly',
            start_date: '2025-01-01',
            end_date: null,
            is_recurring: 1,
            rollover_enabled: 0,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ];
        queryAll.mockResolvedValue(mockBudgets);

        const result = await BudgetsDB.getActiveBudgets();

        expect(queryAll).toHaveBeenCalledWith(
          expect.stringContaining('WHERE start_date <= ?'),
          expect.arrayContaining([expect.any(String), expect.any(String)]),
        );
        expect(result).toHaveLength(1);
      });

      it('retrieves active budgets for specific date', async () => {
        const testDate = new Date('2025-06-15');
        queryAll.mockResolvedValue([]);

        await BudgetsDB.getActiveBudgets(testDate);

        expect(queryAll).toHaveBeenCalledWith(
          expect.any(String),
          ['2025-06-15', '2025-06-15'],
        );
      });
    });

    describe('hasActiveBudget', () => {
      it('returns true when category has active budget', async () => {
        queryFirst.mockResolvedValue({ '1': 1 });

        const result = await BudgetsDB.hasActiveBudget('cat1');

        expect(result).toBe(true);
      });

      it('returns false when category has no active budget', async () => {
        queryFirst.mockResolvedValue(null);

        const result = await BudgetsDB.hasActiveBudget('cat1');

        expect(result).toBe(false);
      });

      it('checks for specific date', async () => {
        const testDate = new Date('2025-06-15');
        queryFirst.mockResolvedValue(null);

        await BudgetsDB.hasActiveBudget('cat1', testDate);

        expect(queryFirst).toHaveBeenCalledWith(
          expect.any(String),
          ['cat1', '2025-06-15', '2025-06-15'],
        );
      });
    });

    describe('getRecurringBudgets', () => {
      it('retrieves only recurring budgets', async () => {
        const mockBudgets = [
          {
            id: 'budget1',
            category_id: 'cat1',
            amount: '500.00',
            currency: 'USD',
            period_type: 'monthly',
            start_date: '2025-01-01',
            end_date: null,
            is_recurring: 1,
            rollover_enabled: 0,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ];
        queryAll.mockResolvedValue(mockBudgets);

        const result = await BudgetsDB.getRecurringBudgets();

        expect(queryAll).toHaveBeenCalledWith(
          'SELECT * FROM budgets WHERE is_recurring = 1 ORDER BY created_at ASC',
        );
        expect(result).toHaveLength(1);
      });
    });

    describe('findDuplicateBudget', () => {
      it('finds duplicate budget', async () => {
        const mockBudget = {
          id: 'budget1',
          category_id: 'cat1',
          amount: '500.00',
          currency: 'USD',
          period_type: 'monthly',
          start_date: '2025-01-01',
          end_date: null,
          is_recurring: 1,
          rollover_enabled: 0,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        };
        queryFirst.mockResolvedValue(mockBudget);

        const result = await BudgetsDB.findDuplicateBudget('cat1', 'USD', 'monthly');

        expect(result).not.toBeNull();
        expect(result.categoryId).toBe('cat1');
      });

      it('excludes specific budget ID from check', async () => {
        queryFirst.mockResolvedValue(null);

        await BudgetsDB.findDuplicateBudget('cat1', 'USD', 'monthly', 'budget1');

        expect(queryFirst).toHaveBeenCalledWith(
          expect.stringContaining('AND id != ?'),
          ['cat1', 'USD', 'monthly', 'budget1'],
        );
      });

      it('returns null when no duplicate found', async () => {
        queryFirst.mockResolvedValue(null);

        const result = await BudgetsDB.findDuplicateBudget('cat1', 'USD', 'monthly');

        expect(result).toBeNull();
      });
    });

    describe('budgetExists', () => {
      it('returns true when budget exists', async () => {
        queryFirst.mockResolvedValue({ '1': 1 });

        const result = await BudgetsDB.budgetExists('budget1');

        expect(result).toBe(true);
      });

      it('returns false when budget does not exist', async () => {
        queryFirst.mockResolvedValue(null);

        const result = await BudgetsDB.budgetExists('non-existent');

        expect(result).toBe(false);
      });
    });
  });

  describe('Period Date Calculations', () => {
    describe('getCurrentPeriodDates', () => {
      it('calculates weekly period dates', () => {
        const referenceDate = new Date('2025-12-10'); // Wednesday
        const { start, end } = BudgetsDB.getCurrentPeriodDates('weekly', referenceDate);

        expect(start.getDay()).toBe(0); // Sunday
        expect(end.getDay()).toBe(6); // Saturday
      });

      it('calculates monthly period dates', () => {
        const referenceDate = new Date('2025-12-15');
        const { start, end } = BudgetsDB.getCurrentPeriodDates('monthly', referenceDate);

        expect(start.getDate()).toBe(1);
        expect(end.getDate()).toBe(31); // December has 31 days
      });

      it('calculates yearly period dates', () => {
        const referenceDate = new Date('2025-06-15');
        const { start, end } = BudgetsDB.getCurrentPeriodDates('yearly', referenceDate);

        expect(start.getMonth()).toBe(0); // January
        expect(start.getDate()).toBe(1);
        expect(end.getMonth()).toBe(11); // December
        expect(end.getDate()).toBe(31);
      });

      it('throws error for invalid period type', () => {
        expect(() => {
          BudgetsDB.getCurrentPeriodDates('invalid');
        }).toThrow('Invalid period type: invalid');
      });
    });

    describe('getNextPeriodDates', () => {
      it('calculates next weekly period', () => {
        const currentStart = new Date('2025-12-07'); // Sunday
        const { start } = BudgetsDB.getNextPeriodDates('weekly', currentStart);

        expect(start.getDate()).toBe(14); // Next Sunday
      });

      it('calculates next monthly period', () => {
        const currentStart = new Date('2025-12-01');
        const { start } = BudgetsDB.getNextPeriodDates('monthly', currentStart);

        expect(start.getMonth()).toBe(0); // January (next month)
        expect(start.getFullYear()).toBe(2026);
      });

      it('calculates next yearly period', () => {
        const currentStart = new Date('2025-01-01');
        const { start } = BudgetsDB.getNextPeriodDates('yearly', currentStart);

        expect(start.getFullYear()).toBe(2026);
      });
    });

    describe('getPreviousPeriodDates', () => {
      it('calculates previous weekly period', () => {
        const currentStart = new Date('2025-12-07'); // Sunday
        const { start } = BudgetsDB.getPreviousPeriodDates('weekly', currentStart);

        expect(start.getDate()).toBe(30); // Previous Sunday (Nov 30)
      });

      it('calculates previous monthly period', () => {
        const currentStart = new Date('2025-12-01');
        const { start } = BudgetsDB.getPreviousPeriodDates('monthly', currentStart);

        expect(start.getMonth()).toBe(10); // November (previous month)
      });

      it('calculates previous yearly period', () => {
        const currentStart = new Date('2025-01-01');
        const { start } = BudgetsDB.getPreviousPeriodDates('yearly', currentStart);

        expect(start.getFullYear()).toBe(2024);
      });
    });
  });

  describe('Spending Calculations', () => {
    describe('calculateSpendingForBudget', () => {
      it('calculates spending for budget category', async () => {
        CategoriesDB.getAllDescendants.mockResolvedValue([]);
        queryFirst.mockResolvedValue({ total: 250.50 });

        const result = await BudgetsDB.calculateSpendingForBudget(
          'cat1',
          'USD',
          '2025-12-01',
          '2025-12-31',
          false,
        );

        expect(result).toBe(250.50);
      });

      it('includes child categories when requested', async () => {
        CategoriesDB.getAllDescendants.mockResolvedValue([
          { id: 'cat2' },
          { id: 'cat3' },
        ]);
        queryFirst.mockResolvedValue({ total: 500 });

        await BudgetsDB.calculateSpendingForBudget(
          'cat1',
          'USD',
          '2025-12-01',
          '2025-12-31',
          true,
        );

        expect(CategoriesDB.getAllDescendants).toHaveBeenCalledWith('cat1');
        expect(queryFirst).toHaveBeenCalledWith(
          expect.stringContaining('category_id IN (?,?,?)'),
          expect.arrayContaining(['cat1', 'cat2', 'cat3', 'USD', '2025-12-01', '2025-12-31']),
        );
      });

      it('returns 0 when no spending found', async () => {
        CategoriesDB.getAllDescendants.mockResolvedValue([]);
        queryFirst.mockResolvedValue({ total: null });

        const result = await BudgetsDB.calculateSpendingForBudget(
          'cat1',
          'USD',
          '2025-12-01',
          '2025-12-31',
          false,
        );

        expect(result).toBe(0);
      });
    });

    describe('calculateBudgetStatus', () => {
      beforeEach(() => {
        CategoriesDB.getAllDescendants.mockResolvedValue([]);
      });

      it('calculates budget status with spending', async () => {
        const mockBudget = {
          id: 'budget1',
          category_id: 'cat1',
          amount: '500.00',
          currency: 'USD',
          period_type: 'monthly',
          start_date: '2025-12-01',
          end_date: null,
          is_recurring: 1,
          rollover_enabled: 0,
          created_at: '2025-12-01T00:00:00Z',
          updated_at: '2025-12-01T00:00:00Z',
        };
        queryFirst
          .mockResolvedValueOnce(mockBudget) // getBudgetById
          .mockResolvedValueOnce({ total: 300 }); // calculateSpendingForBudget

        const result = await BudgetsDB.calculateBudgetStatus('budget1');

        expect(result.budgetId).toBe('budget1');
        expect(result.amount).toBe('500.00');
        expect(result.spent).toBe(300);
        expect(result.remaining).toBe(200);
        expect(result.percentage).toBe(60);
        expect(result.isExceeded).toBe(false);
        expect(result.status).toBe('safe');
      });

      it('marks budget as exceeded when spending is over limit', async () => {
        const mockBudget = {
          id: 'budget1',
          category_id: 'cat1',
          amount: '500.00',
          currency: 'USD',
          period_type: 'monthly',
          start_date: '2025-12-01',
          end_date: null,
          is_recurring: 1,
          rollover_enabled: 0,
          created_at: '2025-12-01T00:00:00Z',
          updated_at: '2025-12-01T00:00:00Z',
        };
        queryFirst
          .mockResolvedValueOnce(mockBudget)
          .mockResolvedValueOnce({ total: 600 });

        const result = await BudgetsDB.calculateBudgetStatus('budget1');

        expect(result.isExceeded).toBe(true);
        expect(result.status).toBe('exceeded');
      });

      it('marks budget as danger when spending is >= 90%', async () => {
        const mockBudget = {
          id: 'budget1',
          category_id: 'cat1',
          amount: '500.00',
          currency: 'USD',
          period_type: 'monthly',
          start_date: '2025-12-01',
          end_date: null,
          is_recurring: 1,
          rollover_enabled: 0,
          created_at: '2025-12-01T00:00:00Z',
          updated_at: '2025-12-01T00:00:00Z',
        };
        queryFirst
          .mockResolvedValueOnce(mockBudget)
          .mockResolvedValueOnce({ total: 450 });

        const result = await BudgetsDB.calculateBudgetStatus('budget1');

        expect(result.percentage).toBe(90);
        expect(result.status).toBe('danger');
      });

      it('marks budget as warning when spending is >= 70%', async () => {
        const mockBudget = {
          id: 'budget1',
          category_id: 'cat1',
          amount: '500.00',
          currency: 'USD',
          period_type: 'monthly',
          start_date: '2025-12-01',
          end_date: null,
          is_recurring: 1,
          rollover_enabled: 0,
          created_at: '2025-12-01T00:00:00Z',
          updated_at: '2025-12-01T00:00:00Z',
        };
        queryFirst
          .mockResolvedValueOnce(mockBudget)
          .mockResolvedValueOnce({ total: 350 });

        const result = await BudgetsDB.calculateBudgetStatus('budget1');

        expect(result.percentage).toBe(70);
        expect(result.status).toBe('warning');
      });

      it('throws error when budget not found', async () => {
        queryFirst.mockResolvedValue(null);

        await expect(BudgetsDB.calculateBudgetStatus('non-existent'))
          .rejects.toThrow('Budget non-existent not found');
      });
    });

    describe('calculateAllBudgetStatuses', () => {
      it('calculates statuses for all active budgets', async () => {
        const mockBudgets = [
          {
            id: 'budget1',
            category_id: 'cat1',
            amount: '500.00',
            currency: 'USD',
            period_type: 'monthly',
            start_date: '2025-12-01',
            end_date: null,
            is_recurring: 1,
            rollover_enabled: 0,
            created_at: '2025-12-01T00:00:00Z',
            updated_at: '2025-12-01T00:00:00Z',
          },
        ];
        queryAll.mockResolvedValue(mockBudgets);
        queryFirst
          .mockResolvedValueOnce(mockBudgets[0]) // getBudgetById
          .mockResolvedValueOnce({ total: 300 }); // calculateSpendingForBudget
        CategoriesDB.getAllDescendants.mockResolvedValue([]);

        const result = await BudgetsDB.calculateAllBudgetStatuses();

        expect(result.size).toBe(1);
        expect(result.has('budget1')).toBe(true);
      });

      it('continues calculating even when one budget fails', async () => {
        const mockBudgets = [
          {
            id: 'budget1',
            category_id: 'cat1',
            amount: '500.00',
            currency: 'USD',
            period_type: 'monthly',
            start_date: '2025-12-01',
            end_date: null,
            is_recurring: 1,
            rollover_enabled: 0,
            created_at: '2025-12-01T00:00:00Z',
            updated_at: '2025-12-01T00:00:00Z',
          },
        ];
        queryAll.mockResolvedValue(mockBudgets);
        queryFirst.mockRejectedValue(new Error('Failed to get budget'));

        const result = await BudgetsDB.calculateAllBudgetStatuses();

        expect(result.size).toBe(0);
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles database errors gracefully in getAllBudgets', async () => {
      queryAll.mockRejectedValue(new Error('Database error'));

      await expect(BudgetsDB.getAllBudgets()).rejects.toThrow('Database error');
    });

    it('handles database errors gracefully in createBudget', async () => {
      executeQuery.mockRejectedValue(new Error('Insert failed'));

      const validBudget = {
        id: 'budget1',
        categoryId: 'cat1',
        amount: '500.00',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      await expect(BudgetsDB.createBudget(validBudget)).rejects.toThrow('Insert failed');
    });

    it('handles null values in field mapping', () => {
      // This is tested internally but good to verify the mapBudgetFields function handles null
      const mockBudget = {
        id: 'budget1',
        category_id: 'cat1',
        amount: '500.00',
        currency: 'USD',
        period_type: 'monthly',
        start_date: '2025-01-01',
        end_date: null,
        is_recurring: 1,
        rollover_enabled: 0,
        created_at: '2025-12-01T00:00:00Z',
        updated_at: '2025-12-01T00:00:00Z',
      };
      queryFirst.mockResolvedValue(mockBudget);

      // Should not throw when budget has null endDate
      expect(BudgetsDB.getBudgetById('budget1')).resolves.toBeTruthy();
    });
  });
});
