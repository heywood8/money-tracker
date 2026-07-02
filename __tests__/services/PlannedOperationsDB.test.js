/**
 * Tests for PlannedOperationsDB Service
 */

import * as PlannedOperationsDB from '../../app/services/PlannedOperationsDB';
import { executeQuery, queryAll, queryFirst, executeTransaction } from '../../app/services/db';
import { createOperationInTx } from '../../app/services/OperationsDB';

jest.mock('../../app/services/db');
jest.mock('../../app/services/OperationsDB', () => ({
  createOperationInTx: jest.fn(),
}));

describe('PlannedOperationsDB Service', () => {
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();
    executeQuery.mockResolvedValue(undefined);
    queryAll.mockResolvedValue([]);
    queryFirst.mockResolvedValue(null);

    mockDb = { runAsync: jest.fn().mockResolvedValue({}) };
    executeTransaction.mockImplementation(async (callback) => callback(mockDb));
    createOperationInTx.mockResolvedValue({ id: 999, type: 'expense', amount: '500' });
  });

  describe('Validation', () => {
    const validOp = {
      name: 'Rent',
      type: 'expense',
      amount: '500.00',
      accountId: 1,
      categoryId: 'cat1',
    };

    it('validates a valid expense planned operation', async () => {
      const error = PlannedOperationsDB.validatePlannedOperation(validOp);
      expect(error).toBeNull();
    });

    it('validates a valid transfer planned operation', async () => {
      const transferOp = {
        name: 'Savings Transfer',
        type: 'transfer',
        amount: '200',
        accountId: 1,
        toAccountId: 2,
      };
      expect(PlannedOperationsDB.validatePlannedOperation(transferOp)).toBeNull();
    });

    it('rejects missing name', async () => {
      const op = { ...validOp, name: '' };
      expect(PlannedOperationsDB.validatePlannedOperation(op)).toBe('planned_name_required');
    });

    it('rejects whitespace-only name', async () => {
      const op = { ...validOp, name: '   ' };
      expect(PlannedOperationsDB.validatePlannedOperation(op)).toBe('planned_name_required');
    });

    it('rejects missing type', async () => {
      const op = { ...validOp, type: null };
      expect(PlannedOperationsDB.validatePlannedOperation(op)).toBe('operation_type_required');
    });

    it('rejects invalid type', async () => {
      const op = { ...validOp, type: 'refund' };
      expect(PlannedOperationsDB.validatePlannedOperation(op)).toBe('operation_type_required');
    });

    it('rejects zero amount', async () => {
      const op = { ...validOp, amount: '0' };
      expect(PlannedOperationsDB.validatePlannedOperation(op)).toBe('valid_amount_required');
    });

    it('rejects negative amount', async () => {
      const op = { ...validOp, amount: '-50' };
      expect(PlannedOperationsDB.validatePlannedOperation(op)).toBe('valid_amount_required');
    });

    it('rejects Infinity as amount', async () => {
      const op = { ...validOp, amount: 'Infinity' };
      expect(PlannedOperationsDB.validatePlannedOperation(op)).toBe('valid_amount_required');
    });

    it('rejects -Infinity as amount', async () => {
      const op = { ...validOp, amount: '-Infinity' };
      expect(PlannedOperationsDB.validatePlannedOperation(op)).toBe('valid_amount_required');
    });

    it('rejects NaN as amount', async () => {
      const op = { ...validOp, amount: 'NaN' };
      expect(PlannedOperationsDB.validatePlannedOperation(op)).toBe('valid_amount_required');
    });

    it('rejects amount above 1e12', async () => {
      const op = { ...validOp, amount: '2000000000000' };
      expect(PlannedOperationsDB.validatePlannedOperation(op)).toBe('valid_amount_required');
    });

    it('rejects missing accountId', async () => {
      const op = { ...validOp, accountId: null };
      expect(PlannedOperationsDB.validatePlannedOperation(op)).toBe('account_required');
    });

    it('rejects expense without categoryId', async () => {
      const op = { ...validOp, categoryId: null };
      expect(PlannedOperationsDB.validatePlannedOperation(op)).toBe('category_required');
    });

    it('rejects transfer without toAccountId', async () => {
      const op = { name: 'Transfer', type: 'transfer', amount: '100', accountId: 1 };
      expect(PlannedOperationsDB.validatePlannedOperation(op)).toBe('destination_account_required');
    });

    it('rejects transfer with same accounts', async () => {
      const op = { name: 'Transfer', type: 'transfer', amount: '100', accountId: 1, toAccountId: 1 };
      expect(PlannedOperationsDB.validatePlannedOperation(op)).toBe('accounts_must_be_different');
    });
  });

  describe('CRUD Operations', () => {
    it('creates a planned operation', async () => {
      const op = {
        id: 'test-uuid',
        name: 'Rent',
        type: 'expense',
        amount: '500',
        accountId: 1,
        categoryId: 'cat1',
        isRecurring: true,
      };

      const result = await PlannedOperationsDB.createPlannedOperation(op);

      expect(executeQuery).toHaveBeenCalledTimes(1);
      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO planned_operations'),
        expect.arrayContaining(['test-uuid', 'Rent', 'expense', '500', 1, 'cat1']),
      );
      expect(result).toEqual(expect.objectContaining({
        id: 'test-uuid',
        name: 'Rent',
        type: 'expense',
        amount: '500',
        accountId: 1,
        categoryId: 'cat1',
        isRecurring: true,
      }));
    });

    it('creates a non-recurring planned operation', async () => {
      const op = {
        id: 'test-uuid-2',
        name: 'One-time Purchase',
        type: 'expense',
        amount: '100',
        accountId: 1,
        categoryId: 'cat1',
        isRecurring: false,
      };

      const result = await PlannedOperationsDB.createPlannedOperation(op);
      expect(result.isRecurring).toBe(false);
      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO planned_operations'),
        expect.arrayContaining([0]),
      );
    });

    it('rejects creating invalid planned operation', async () => {
      const invalidOp = { name: '', type: 'expense', amount: '500', accountId: 1, categoryId: 'cat1' };
      await expect(PlannedOperationsDB.createPlannedOperation(invalidOp)).rejects.toThrow();
    });

    it('gets planned operation by id', async () => {
      const mockRow = {
        id: 'test-uuid',
        name: 'Rent',
        type: 'expense',
        amount: '500',
        account_id: 1,
        category_id: 'cat1',
        to_account_id: null,
        description: null,
        is_recurring: 1,
        last_executed_month: null,
        display_order: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      queryFirst.mockResolvedValue(mockRow);

      const result = await PlannedOperationsDB.getPlannedOperationById('test-uuid');

      expect(queryFirst).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM planned_operations WHERE id = ?'),
        ['test-uuid'],
      );
      expect(result).toEqual(expect.objectContaining({
        id: 'test-uuid',
        name: 'Rent',
        accountId: 1,
        isRecurring: true,
      }));
    });

    it('returns null for non-existent planned operation', async () => {
      queryFirst.mockResolvedValue(null);
      const result = await PlannedOperationsDB.getPlannedOperationById('nonexistent');
      expect(result).toBeNull();
    });

    it('gets all planned operations', async () => {
      const mockRows = [
        { id: '1', name: 'Rent', type: 'expense', amount: '500', account_id: 1, category_id: 'cat1', to_account_id: null, description: null, is_recurring: 1, last_executed_month: null, display_order: 0, created_at: '', updated_at: '' },
        { id: '2', name: 'Netflix', type: 'expense', amount: '15', account_id: 1, category_id: 'cat2', to_account_id: null, description: null, is_recurring: 1, last_executed_month: null, display_order: 1, created_at: '', updated_at: '' },
      ];
      queryAll.mockResolvedValue(mockRows);

      const result = await PlannedOperationsDB.getAllPlannedOperations();

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM planned_operations ORDER BY'),
      );
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Rent');
      expect(result[1].name).toBe('Netflix');
    });

    it('returns empty array when no planned operations', async () => {
      queryAll.mockResolvedValue([]);
      const result = await PlannedOperationsDB.getAllPlannedOperations();
      expect(result).toEqual([]);
    });

    it('gets recurring planned operations', async () => {
      queryAll.mockResolvedValue([]);
      await PlannedOperationsDB.getRecurringPlannedOperations();
      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('is_recurring = 1'),
      );
    });

    it('gets one-time planned operations', async () => {
      queryAll.mockResolvedValue([]);
      await PlannedOperationsDB.getOneTimePlannedOperations();
      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('is_recurring = 0'),
      );
    });

    it('updates a planned operation', async () => {
      await PlannedOperationsDB.updatePlannedOperation('test-uuid', {
        name: 'Updated Rent',
        amount: '600',
      });

      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE planned_operations SET'),
        expect.arrayContaining(['Updated Rent', '600', 'test-uuid']),
      );
    });

    it('skips update with no fields', async () => {
      await PlannedOperationsDB.updatePlannedOperation('test-uuid', {});
      expect(executeQuery).not.toHaveBeenCalled();
    });

    it('deletes a planned operation', async () => {
      await PlannedOperationsDB.deletePlannedOperation('test-uuid');

      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM planned_operations WHERE id = ?'),
        ['test-uuid'],
      );
    });
  });

  describe('Execution Tracking', () => {
    it('marks a planned operation as executed', async () => {
      await PlannedOperationsDB.markExecuted('test-uuid', '2026-03');

      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE planned_operations SET last_executed_month'),
        expect.arrayContaining(['2026-03', 'test-uuid']),
      );
    });
  });

  describe('executeAndMark (atomic execution)', () => {
    const recurringOp = {
      id: 'plan-1',
      isRecurring: true,
    };

    const oneTimeOp = {
      id: 'plan-2',
      isRecurring: false,
    };

    const operationData = {
      type: 'expense',
      amount: '500',
      accountId: 1,
      categoryId: 'cat1',
      date: '2026-05-19',
      description: 'Rent',
    };

    it('runs everything in a single transaction', async () => {
      await PlannedOperationsDB.executeAndMark(recurringOp, operationData, '2026-05');

      expect(executeTransaction).toHaveBeenCalledTimes(1);
    });

    it('calls createOperationInTx inside the transaction', async () => {
      await PlannedOperationsDB.executeAndMark(recurringOp, operationData, '2026-05');

      expect(createOperationInTx).toHaveBeenCalledWith(mockDb, operationData);
    });

    it('updates last_executed_month for recurring planned operation', async () => {
      await PlannedOperationsDB.executeAndMark(recurringOp, operationData, '2026-05');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE planned_operations SET last_executed_month'),
        expect.arrayContaining(['2026-05', 'plan-1']),
      );
    });

    it('does NOT delete a recurring planned operation', async () => {
      await PlannedOperationsDB.executeAndMark(recurringOp, operationData, '2026-05');

      const deleteCalls = mockDb.runAsync.mock.calls.filter(
        ([sql]) => sql.includes('DELETE FROM planned_operations'),
      );
      expect(deleteCalls).toHaveLength(0);
    });

    it('deletes a one-time planned operation after marking executed', async () => {
      await PlannedOperationsDB.executeAndMark(oneTimeOp, operationData, '2026-05');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM planned_operations WHERE id = ?'),
        ['plan-2'],
      );
    });

    it('returns the created operation from createOperationInTx', async () => {
      const fakeCreated = { id: 42, type: 'expense' };
      createOperationInTx.mockResolvedValue(fakeCreated);

      const result = await PlannedOperationsDB.executeAndMark(recurringOp, operationData, '2026-05');

      expect(result).toBe(fakeCreated);
    });

    it('propagates errors and rolls back (no partial state)', async () => {
      createOperationInTx.mockRejectedValue(new Error('insert failed'));
      executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await expect(
        PlannedOperationsDB.executeAndMark(recurringOp, operationData, '2026-05'),
      ).rejects.toThrow('insert failed');

      // markExecuted UPDATE should not have been called because transaction failed
      const markCalls = mockDb.runAsync.mock.calls.filter(
        ([sql]) => sql.includes('UPDATE planned_operations'),
      );
      expect(markCalls).toHaveLength(0);
    });
  });

  describe('markExecutedOnly (mark executed without creating an operation)', () => {
    const recurringOp = {
      id: 'plan-1',
      isRecurring: true,
    };

    const oneTimeOp = {
      id: 'plan-2',
      isRecurring: false,
    };

    it('runs everything in a single transaction', async () => {
      await PlannedOperationsDB.markExecutedOnly(recurringOp, '2026-05');

      expect(executeTransaction).toHaveBeenCalledTimes(1);
    });

    it('does NOT create a real operation', async () => {
      await PlannedOperationsDB.markExecutedOnly(recurringOp, '2026-05');

      expect(createOperationInTx).not.toHaveBeenCalled();
    });

    it('updates last_executed_month for recurring planned operation', async () => {
      await PlannedOperationsDB.markExecutedOnly(recurringOp, '2026-05');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE planned_operations SET last_executed_month'),
        expect.arrayContaining(['2026-05', 'plan-1']),
      );
    });

    it('does NOT delete a recurring planned operation', async () => {
      await PlannedOperationsDB.markExecutedOnly(recurringOp, '2026-05');

      const deleteCalls = mockDb.runAsync.mock.calls.filter(
        ([sql]) => sql.includes('DELETE FROM planned_operations'),
      );
      expect(deleteCalls).toHaveLength(0);
    });

    it('deletes a one-time planned operation after marking executed', async () => {
      await PlannedOperationsDB.markExecutedOnly(oneTimeOp, '2026-05');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM planned_operations WHERE id = ?'),
        ['plan-2'],
      );
    });

    it('propagates errors and rolls back (no partial state)', async () => {
      executeTransaction.mockImplementation(async () => {
        throw new Error('write failed');
      });

      await expect(
        PlannedOperationsDB.markExecutedOnly(recurringOp, '2026-05'),
      ).rejects.toThrow('write failed');
    });
  });
});
