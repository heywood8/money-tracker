import {
  getBurndownData
} from '../../app/services/BurndownDB';
import * as db from '../../app/services/db';

// Mock the db module
jest.mock('../../app/services/db');

describe('BurndownDB', () => {
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      getAllAsync: jest.fn(),
      getFirstAsync: jest.fn(),
      runAsync: jest.fn(),
      execAsync: jest.fn()
    };

    db.getDatabase.mockResolvedValue({ raw: mockDb, drizzle: {} });
    db.queryAll.mockImplementation(async (query, params) => {
      // Default: return empty array
      return [];
    });
  });

  describe('Balance Calculations', () => {
    it('calculates correct balances with expenses and income', async () => {
      // Mock current balance
      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000.00' });

      // Mock operations
      db.queryAll.mockResolvedValue([
        {
          id: 'op1',
          type: 'expense',
          amount: '100.00',
          account_id: 'acc1',
          date: '2025-01-10',
          created_at: '2025-01-10T10:00:00Z'
        },
        {
          id: 'op2',
          type: 'income',
          amount: '50.00',
          account_id: 'acc1',
          date: '2025-01-15',
          created_at: '2025-01-15T10:00:00Z'
        }
      ]);

      const data = await getBurndownData('acc1', 2025, 0); // January

      // Check that operations are applied correctly
      // Current balance (today): 1000
      // Reverse from today: -50 (income) +100 (expense) = 1050 at Dec 31
      // Day 1-9: 1050 (no operations yet)
      // Day 10: 1050 - 100 (expense) = 950
      expect(data.currentMonthData[9].balance).toBe('950.00');
      // Day 15: 950 + 50 (income) = 1000
      expect(data.currentMonthData[14].balance).toBe('1000.00');
    });

    it('handles transfers correctly', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ balance: '500.00' });

      db.queryAll.mockResolvedValue([
        {
          id: 'transfer1',
          type: 'transfer',
          amount: '200.00',
          account_id: 'acc1',
          to_account_id: 'acc2',
          date: '2025-01-10',
          created_at: '2025-01-10T10:00:00Z'
        }
      ]);

      const data = await getBurndownData('acc1', 2025, 0);

      // Current balance (today): 500
      // Reverse transfer out from Jan 10: 500 + 200 = 700 at Dec 31
      // Day 1-9: 700 (no operations yet)
      // Day 10: 700 - 200 (transfer out) = 500
      expect(data.currentMonthData[9].balance).toBe('500.00');
    });

    it('handles multi-currency transfers with destination_amount', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ balance: '100.00' });

      db.queryAll.mockResolvedValue([
        {
          id: 'transfer1',
          type: 'transfer',
          amount: '100.00',
          destination_amount: '400.00',
          account_id: 'acc2',
          to_account_id: 'acc1',
          date: '2025-01-10',
          created_at: '2025-01-10T10:00:00Z'
        }
      ]);

      const data = await getBurndownData('acc1', 2025, 0);

      // Current balance (today): 100
      // Reverse transfer in from Jan 10: 100 - 400 = -300 at Dec 31
      // Day 1-9: -300 (no operations yet)
      // Day 10: -300 + 400 (transfer in) = 100
      expect(data.currentMonthData[9].balance).toBe('100.00');
    });
  });

  describe('Daily Balances', () => {
    it('fills in missing days with previous balance', async () => {
      // Mock starting balance
      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000.00' });
      db.queryAll.mockResolvedValue([
        {
          id: 'op1',
          type: 'expense',
          amount: '100.00',
          account_id: 'acc1',
          date: '2025-01-01',
          created_at: '2025-01-01T10:00:00Z'
        },
        {
          id: 'op2',
          type: 'expense',
          amount: '50.00',
          account_id: 'acc1',
          date: '2025-01-03',
          created_at: '2025-01-03T10:00:00Z'
        }
      ]);

      const data = await getBurndownData('acc1', 2025, 0);
      const balances = data.currentMonthData;

      expect(balances).toHaveLength(31);
      // Current: 1000, reverse ops: +100 +50 = 1150 at Dec 31
      expect(balances[0]).toEqual({
        day: 1,
        date: '2025-01-01',
        balance: '1050.00'  // 1150 - 100 (expense on Jan 1)
      });
      expect(balances[1]).toEqual({
        day: 2,
        date: '2025-01-02',
        balance: '1050.00'  // No operation, same as previous
      });
      expect(balances[2]).toEqual({
        day: 3,
        date: '2025-01-03',
        balance: '1000.00'  // 1050 - 50 (expense on Jan 3)
      });
    });

    it('handles month boundaries correctly', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000.00' });
      db.queryAll.mockResolvedValue([
        {
          id: 'op1',
          type: 'income',
          amount: '100.00',
          account_id: 'acc1',
          date: '2025-11-30',
          created_at: '2025-11-30T10:00:00Z'
        }
      ]);

      const data = await getBurndownData('acc1', 2025, 10); // November
      const balances = data.currentMonthData;

      expect(balances).toHaveLength(30);
      // Current: 1000, operation on Nov 30: +100
      // Working backwards from today to Nov: reverse +100 = 900
      // Nov 30: 900 + 100 = 1000
      expect(balances[29].balance).toBe('1000.00');
    });

    it('applies multiple operations on the same day in order', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000.00' });
      db.queryAll.mockResolvedValue([
        {
          id: 'op1',
          type: 'expense',
          amount: '100.00',
          account_id: 'acc1',
          date: '2025-01-01',
          created_at: '2025-01-01T10:00:00Z'
        },
        {
          id: 'op2',
          type: 'income',
          amount: '50.00',
          account_id: 'acc1',
          date: '2025-01-01',
          created_at: '2025-01-01T11:00:00Z'
        },
        {
          id: 'op3',
          type: 'expense',
          amount: '25.00',
          account_id: 'acc1',
          date: '2025-01-01',
          created_at: '2025-01-01T12:00:00Z'
        }
      ]);

      const data = await getBurndownData('acc1', 2025, 0);
      const balances = data.currentMonthData;

      expect(balances).toHaveLength(31);
      // Current: 1000, reverse all Jan 1 ops: +100 -50 +25 = 1075 at Dec 31
      // Jan 1: 1075 - 100 + 50 - 25 = 1000
      expect(balances[0].balance).toBe('1000.00');
    });
  });

  describe('Mean Calculation', () => {
    it('calculates mean across multiple months', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000.00' });
      db.queryAll.mockResolvedValue([]);

      const data = await getBurndownData('acc1', 2025, 0); // January

      // Should have mean data for all days in January
      expect(data.meanData).toHaveLength(31);
      expect(data.mean).toHaveLength(31);
    });

    it('handles months with different day counts', async () => {
      // February has 28/29 days, others have 30/31
      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000.00' });
      db.queryAll.mockResolvedValue([]);

      // Test February (28 days in 2025)
      const data = await getBurndownData('acc1', 2025, 1); // February

      expect(data.meanData.length).toBeLessThanOrEqual(29);
      expect(data.meanData.length).toBeGreaterThanOrEqual(28);
    });

    it('handles day positions that dont exist in some months', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000.00' });
      db.queryAll.mockResolvedValue([]);

      // Test March (31 days) - looking back should skip Feb 30/31
      const data = await getBurndownData('acc1', 2025, 2); // March

      // Should have 31 entries
      expect(data.meanData).toHaveLength(31);

      // Day 30 should exist and not throw error even though Feb doesn't have day 30
      expect(data.meanData[29].day).toBe(30);
    });
  });

  describe('getBurndownData', () => {
    it('returns all 4 lines with correct data structure', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000.00' });
      db.queryAll.mockResolvedValue([]);

      const data = await getBurndownData('acc1', 2025, 11);  // December

      expect(data).toHaveProperty('current');
      expect(data).toHaveProperty('previous');
      expect(data).toHaveProperty('planned');
      expect(data).toHaveProperty('mean');
      expect(data).toHaveProperty('daysInMonth');
      expect(data).toHaveProperty('currentDay');
      expect(data).toHaveProperty('isCurrentMonth');

      expect(data.daysInMonth).toBe(31);
      expect(data.current).toHaveLength(31);
      expect(data.previous).toHaveLength(31);  // Padded to match current month
      expect(data.mean).toHaveLength(31);
      expect(data.planned).toHaveLength(31);
    });

    it('uses highest balance from current month for planned line', async () => {
      // Mock balance calls
      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000.00' });

      // Mock operations with varying balances (peak at day 5)
      db.queryAll.mockResolvedValue([
        { id: 'op1', type: 'income', amount: '500.00', account_id: 'acc1', date: '2025-01-05', created_at: '2025-01-05T10:00:00Z' },
        { id: 'op2', type: 'expense', amount: '200.00', account_id: 'acc1', date: '2025-01-10', created_at: '2025-01-10T10:00:00Z' }
      ]);

      const data = await getBurndownData('acc1', 2025, 0);  // January (31 days)

      expect(data.planned).toHaveLength(31);

      // The planned line should start from the highest balance in current month
      // Current: 1000, reverse ops: -500 +200 = 700 at Dec 31
      // Day 5: 700 + 500 = 1200 (peak)
      // Day 10: 1200 - 200 = 1000
      // Max balance = 1200
      // Planned line: 1200 / 31 = 38.71 per day
      // Day 1: 1200 - (38.71 * 1) ≈ 1161.29
      expect(data.planned[0]).toBeCloseTo(1161.29, 0);
      // Day 31: 1200 - (38.71 * 31) ≈ 0
      expect(data.planned[30]).toBeCloseTo(0, 0);
    });

    it('uses highest balance even with no operations', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ balance: '1500.00' });

      db.queryAll.mockResolvedValue([]);  // No operations

      const data = await getBurndownData('acc1', 2025, 0);  // January

      // With no operations, all days have same balance (1500)
      // Max balance = 1500
      // Planned line: 1500 / 31 = 48.39 per day
      // Day 1: 1500 - (48.39 * 1) ≈ 1451.61
      expect(data.planned[0]).toBeCloseTo(1451.61, 0);
      // Day 31: 1500 - (48.39 * 31) ≈ 0
      expect(data.planned[30]).toBeCloseTo(0, 0);
    });
  });

  describe('Regression Tests', () => {
    it('handles retroactive transaction edits by recalculating on next view', async () => {
      // This is implicitly tested by the on-demand calculation approach
      // Each call to getBurndownData uses current operations data
      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000.00' });
      db.queryAll.mockResolvedValue([
        {
          id: 'op1',
          type: 'expense',
          amount: '200.00',  // Edited amount (was 100)
          account_id: 'acc1',
          date: '2025-01-01',
          created_at: '2025-01-01T10:00:00Z'
        }
      ]);

      const data = await getBurndownData('acc1', 2025, 0);

      // Current: 1000, reverse expense 200 = 1200 at Dec 31
      // Jan 1: 1200 - 200 = 1000
      expect(data.currentMonthData[0].balance).toBe('1000.00');
    });

    it('handles accounts with no operations', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ balance: '500.00' });
      db.queryAll.mockResolvedValue([]);

      const data = await getBurndownData('acc1', 2025, 0);
      const balances = data.currentMonthData;

      expect(balances).toHaveLength(31);
      // All days should have the same balance (no operations)
      expect(balances[0].balance).toBe('500.00');
      expect(balances[1].balance).toBe('500.00');
      expect(balances[2].balance).toBe('500.00');
    });

    it('handles negative balances correctly', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ balance: '-100.00' });
      db.queryAll.mockResolvedValue([
        {
          id: 'op1',
          type: 'expense',
          amount: '50.00',
          account_id: 'acc1',
          date: '2025-01-01',
          created_at: '2025-01-01T10:00:00Z'
        }
      ]);

      const data = await getBurndownData('acc1', 2025, 0);

      // Current: -100, reverse expense 50 = -50 at Dec 31
      // Jan 1: -50 - 50 = -100
      expect(data.currentMonthData[0].balance).toBe('-100.00');
    });
  });
});
