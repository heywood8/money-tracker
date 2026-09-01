/**
 * Tests for getAccountDayDeltas — one account's signed balance moves across a
 * single calendar day, in the order they were entered.
 *
 * This is what the balance chart's day-zero anchor walks backwards from: the
 * day's snapshot is its *closing* balance, so recovering the balances the
 * account passed through during the day needs the individual moves, not a total.
 *
 * The real currency module is used here: these deltas are reconciled against a
 * stored balance, so the arithmetic has to be the decimal-safe one.
 */

import { getAccountDayDeltas } from '../../app/services/OperationsDB';
import { queryAll } from '../../app/services/db';

jest.mock('../../app/services/db');
jest.mock('../../app/services/AccountsDB');
jest.mock('../../app/defaults/defaultOperations');

describe('OperationsDB.getAccountDayDeltas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryAll.mockResolvedValue([]);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  const deltasOf = rows => rows.map(row => row.delta);

  it('signs an expense negative and income positive', async () => {
    queryAll.mockResolvedValue([
      { id: 1, type: 'expense', amount: '20000', account_id: 'a', to_account_id: null, created_at: '2024-01-01T09:00:00Z' },
      { id: 2, type: 'income', amount: '5000', account_id: 'a', to_account_id: null, created_at: '2024-01-01T10:00:00Z' },
    ]);

    const rows = await getAccountDayDeltas('a', '2024-01-01');

    expect(deltasOf(rows)).toEqual(['-20000.00', '5000.00']);
    expect(rows[0]).toMatchObject({ id: 1, createdAt: '2024-01-01T09:00:00Z' });
  });

  it('debits the source and credits the destination of a transfer', async () => {
    const row = {
      id: 3, type: 'transfer', amount: '1000', destination_amount: null,
      account_id: 'a', to_account_id: 'b', created_at: '2024-01-01T11:00:00Z',
    };
    queryAll.mockResolvedValue([row]);

    await expect(getAccountDayDeltas('a', '2024-01-01').then(deltasOf)).resolves.toEqual(['-1000.00']);
    await expect(getAccountDayDeltas('b', '2024-01-01').then(deltasOf)).resolves.toEqual(['1000.00']);
  });

  it('credits the converted amount on a multi-currency transfer', async () => {
    queryAll.mockResolvedValue([{
      id: 4, type: 'transfer', amount: '8000', destination_amount: '21.92',
      account_id: 'a', to_account_id: 'b', created_at: '2024-01-01T11:00:00Z',
    }]);

    await expect(getAccountDayDeltas('b', '2024-01-01').then(deltasOf)).resolves.toEqual(['21.92']);
  });

  it('nets a self-transfer to zero', async () => {
    queryAll.mockResolvedValue([{
      id: 5, type: 'transfer', amount: '1000', destination_amount: null,
      account_id: 'a', to_account_id: 'a', created_at: '2024-01-01T11:00:00Z',
    }]);

    await expect(getAccountDayDeltas('a', '2024-01-01').then(deltasOf)).resolves.toEqual(['0.00']);
  });

  it('matches ids across types — an integer column against a string id', async () => {
    // Account ids come back from SQLite as integers but reach this layer as
    // whatever the caller is holding; a strict compare would sign every row zero.
    queryAll.mockResolvedValue([
      { id: 6, type: 'expense', amount: '300', account_id: 7, to_account_id: null, created_at: '2024-01-01T09:00:00Z' },
    ]);

    await expect(getAccountDayDeltas('7', '2024-01-01').then(deltasOf)).resolves.toEqual(['-300.00']);
  });

  it('leaves an operation that does not touch this account at zero', async () => {
    // The query filters on the account, so this is a guard rather than a real
    // shape; it must contribute nothing rather than mis-signing the walk.
    queryAll.mockResolvedValue([
      { id: 8, type: 'expense', amount: '300', account_id: 'other', to_account_id: null, created_at: '2024-01-01T09:00:00Z' },
    ]);

    await expect(getAccountDayDeltas('a', '2024-01-01').then(deltasOf)).resolves.toEqual(['0']);
  });

  it('asks for one calendar day, oldest operation first', async () => {
    await getAccountDayDeltas('a', '2024-01-01');

    const [sql, params] = queryAll.mock.calls[0];
    expect(sql).toContain('date(date) = date(?)');
    expect(sql).toContain('ORDER BY created_at ASC');
    expect(params).toEqual(['a', 'a', '2024-01-01']);
  });

  it('returns an empty list for a day with no operations', async () => {
    await expect(getAccountDayDeltas('a', '2024-01-01')).resolves.toEqual([]);
  });
});
