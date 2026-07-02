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
    it('validates budget with all required fields', async () => {
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

    it('rejects budget without category', async () => {
      const budget = {
        amount: '100.00',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      const error = BudgetsDB.validateBudget(budget);
      expect(error).toBe('Category is required');
    });

    it('rejects budget without amount', async () => {
      const budget = {
        categoryId: 'cat1',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      const error = BudgetsDB.validateBudget(budget);
      expect(error).toBe('Amount must be greater than zero');
    });

    it('rejects budget with zero amount', async () => {
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

    it('rejects budget with negative amount', async () => {
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

    it('rejects budget without currency', async () => {
      const budget = {
        categoryId: 'cat1',
        amount: '100.00',
        periodType: 'monthly',
        startDate: '2025-01-01',
      };

      const error = BudgetsDB.validateBudget(budget);
      expect(error).toBe('Currency is required');
    });

    it('rejects budget with invalid period type', async () => {
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

    it('accepts valid period types', async () => {
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

    it('rejects budget without start date', async () => {
      const budget = {
        categoryId: 'cat1',
        amount: '100.00',
        currency: 'USD',
        periodType: 'monthly',
      };

      const error = BudgetsDB.validateBudget(budget);
      expect(error).toBe('Start date is required');
    });

    it('rejects budget with end date before start date', async () => {
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

    it('rejects budget with end date equal to start date', async () => {
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

    it('accepts budget with valid end date', async () => {
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

    it('accepts budget without end date (indefinite)', async () => {
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

      it('throws error when duplicate budget exists', async () => {
        const existingBudget = {
          id: 'budget-existing',
          category_id: 'cat1',
          amount: '300.00',
          currency: 'USD',
          period_type: 'monthly',
          start_date: '2025-01-01',
          end_date: null,
          is_recurring: 1,
          rollover_enabled: 0,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        };
        queryFirst.mockResolvedValue(existingBudget);

        const budget = {
          id: 'budget-new',
          categoryId: 'cat1',
          amount: '500.00',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-02-01',
        };

        await expect(BudgetsDB.createBudget(budget))
          .rejects.toThrow('A budget for this category, currency, and period already exists');

        expect(executeQuery).not.toHaveBeenCalled();
      });

      it('does not check for duplicates when validation fails', async () => {
        const invalidBudget = {
          categoryId: 'cat1',
          currency: 'USD',
          periodType: 'monthly',
          startDate: '2025-01-01',
          // Missing amount
        };

        await expect(BudgetsDB.createBudget(invalidBudget))
          .rejects.toThrow('Amount must be greater than zero');

        expect(queryFirst).not.toHaveBeenCalled();
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
    describe('getWeekStartDay', () => {
      it('returns 7 (Sunday) for en-US', async () => {
        expect(BudgetsDB.getWeekStartDay('en-US')).toBe(7);
      });

      it('returns 1 (Monday) for en-GB', async () => {
        expect(BudgetsDB.getWeekStartDay('en-GB')).toBe(1);
      });

      it('returns 1 (Monday) for ru', async () => {
        expect(BudgetsDB.getWeekStartDay('ru')).toBe(1);
      });

      it('returns 1 (Monday) for unknown locale (ISO 8601 default)', async () => {
        expect(BudgetsDB.getWeekStartDay('xx-UNKNOWN')).toBe(1);
      });

      it('returns 1 (Monday) for null locale (ISO 8601 default)', async () => {
        expect(BudgetsDB.getWeekStartDay(null)).toBe(1);
      });

      it('returns 1 (Monday) for undefined locale (ISO 8601 default)', async () => {
        expect(BudgetsDB.getWeekStartDay(undefined)).toBe(1);
      });

      it('returns locale-determined day for en (generic English, engine-dependent)', async () => {
        // 'en' without a region subtag is ambiguous — different JS engines may resolve
        // it to en-US (Sunday=7) or en-001 (Monday=1). Just verify it returns a valid value.
        const result = BudgetsDB.getWeekStartDay('en');
        expect([1, 7]).toContain(result);
      });

      it('returns 1 (Monday) for fr', async () => {
        expect(BudgetsDB.getWeekStartDay('fr')).toBe(1);
      });

      it('returns 1 (Monday) for de', async () => {
        expect(BudgetsDB.getWeekStartDay('de')).toBe(1);
      });
    });

    describe('getCurrentPeriodDates', () => {
      it('calculates weekly period dates defaulting to Monday start (ISO 8601)', async () => {
        // 2025-12-10 is a Wednesday; Monday of that week is Dec 8, Sunday is Dec 14
        const referenceDate = new Date('2025-12-10');
        const { start, end } = BudgetsDB.getCurrentPeriodDates('weekly', referenceDate);

        expect(start.getDay()).toBe(1); // Monday
        expect(end.getDay()).toBe(0);   // Sunday
      });

      it('calculates weekly period dates with Sunday start for en-US locale', async () => {
        // 2025-12-10 is a Wednesday; Sunday of that week is Dec 7, Saturday is Dec 13
        const referenceDate = new Date('2025-12-10');
        const { start, end } = BudgetsDB.getCurrentPeriodDates('weekly', referenceDate, 'en-US');

        expect(start.getDay()).toBe(0); // Sunday
        expect(end.getDay()).toBe(6);   // Saturday
      });

      it('calculates monthly period dates', async () => {
        const referenceDate = new Date('2025-12-15');
        const { start, end } = BudgetsDB.getCurrentPeriodDates('monthly', referenceDate);

        expect(start.getDate()).toBe(1);
        expect(end.getDate()).toBe(31); // December has 31 days
      });

      it('calculates yearly period dates', async () => {
        const referenceDate = new Date('2025-06-15');
        const { start, end } = BudgetsDB.getCurrentPeriodDates('yearly', referenceDate);

        expect(start.getMonth()).toBe(0); // January
        expect(start.getDate()).toBe(1);
        expect(end.getMonth()).toBe(11); // December
        expect(end.getDate()).toBe(31);
      });

      it('throws error for invalid period type', async () => {
        expect(() => {
          BudgetsDB.getCurrentPeriodDates('invalid');
        }).toThrow('Invalid period type: invalid');
      });

      describe('Regression Tests', () => {
        it('weekly period spans exactly 7 days when the week starts in the previous month', async () => {
          // Thu Jul 2 2026: Monday of that week is Jun 29. The end must be
          // Sun Jul 5 — the old code applied start's day-of-month (29+6=35)
          // to a July-based date, producing Aug 4 (a ~5 week "week").
          const referenceDate = new Date(2026, 6, 2);
          const { start, end } = BudgetsDB.getCurrentPeriodDates('weekly', referenceDate);

          expect(start.getFullYear()).toBe(2026);
          expect(start.getMonth()).toBe(5); // June
          expect(start.getDate()).toBe(29);
          expect(end.getFullYear()).toBe(2026);
          expect(end.getMonth()).toBe(6); // July
          expect(end.getDate()).toBe(5);
        });

        it('monthly period ends in the same month when the reference day does not exist in the next month', async () => {
          // Jan 31: setMonth(+1) on the 31st used to roll to Mar 3, then
          // setDate(0) yielded Feb 28 — a two-month "monthly" period.
          const referenceDate = new Date(2026, 0, 31);
          const { start, end } = BudgetsDB.getCurrentPeriodDates('monthly', referenceDate);

          expect(start.getMonth()).toBe(0); // January
          expect(start.getDate()).toBe(1);
          expect(end.getMonth()).toBe(0); // January
          expect(end.getDate()).toBe(31);
        });

        it('monthly period is correct on the 31st of months preceding 30-day months', async () => {
          const referenceDate = new Date(2026, 2, 31); // Mar 31
          const { start, end } = BudgetsDB.getCurrentPeriodDates('monthly', referenceDate);

          expect(end.getMonth()).toBe(2); // March
          expect(end.getDate()).toBe(31);
        });
      });
    });

    describe('getNextPeriodDates', () => {
      it('calculates next weekly period (Monday-start default)', async () => {
        // 2025-12-08 is a Monday — start of the week with ISO 8601 default
        const currentStart = new Date('2025-12-08');
        const { start } = BudgetsDB.getNextPeriodDates('weekly', currentStart);

        expect(start.getDate()).toBe(15); // Next Monday
        expect(start.getDay()).toBe(1);
      });

      it('calculates next monthly period', async () => {
        const currentStart = new Date('2025-12-01');
        const { start } = BudgetsDB.getNextPeriodDates('monthly', currentStart);

        expect(start.getMonth()).toBe(0); // January (next month)
        expect(start.getFullYear()).toBe(2026);
      });

      it('calculates next yearly period', async () => {
        const currentStart = new Date('2025-01-01');
        const { start } = BudgetsDB.getNextPeriodDates('yearly', currentStart);

        expect(start.getFullYear()).toBe(2026);
      });
    });

    describe('getPreviousPeriodDates', () => {
      it('calculates previous weekly period (Monday-start default)', async () => {
        // 2025-12-08 is a Monday; previous week's Monday is Dec 1
        const currentStart = new Date('2025-12-08');
        const { start } = BudgetsDB.getPreviousPeriodDates('weekly', currentStart);

        expect(start.getDate()).toBe(1);  // Dec 1
        expect(start.getDay()).toBe(1);   // Monday
      });

      it('calculates previous monthly period', async () => {
        const currentStart = new Date('2025-12-01');
        const { start } = BudgetsDB.getPreviousPeriodDates('monthly', currentStart);

        expect(start.getMonth()).toBe(10); // November (previous month)
      });

      it('calculates previous yearly period', async () => {
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

        expect(result).toBe('250.5');
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

        expect(result).toBe('0');
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
        expect(result.spent).toBe('300');
        expect(result.remaining).toBe('200.00');
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

    it('handles null values in field mapping', async () => {
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
