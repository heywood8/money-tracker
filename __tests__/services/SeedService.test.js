jest.mock('../../app/utils/resetDatabase', () => ({ resetDatabase: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../app/services/AccountsDB', () => ({ createAccount: jest.fn() }));
jest.mock('../../app/services/CategoriesDB', () => ({ createCategory: jest.fn() }));
jest.mock('../../app/services/OperationsDB', () => ({ createOperation: jest.fn() }));
jest.mock('../../app/services/BudgetsDB', () => ({ createBudget: jest.fn() }));
jest.mock('../../app/services/PlannedOperationsDB', () => ({ createPlannedOperation: jest.fn() }));
jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: { emit: jest.fn() },
  EVENTS: { RELOAD_ALL: 'RELOAD_ALL' },
}));

import { seedDatabase } from '../../app/services/SeedService';
import { resetDatabase } from '../../app/utils/resetDatabase';
import * as AccountsDB from '../../app/services/AccountsDB';
import * as CategoriesDB from '../../app/services/CategoriesDB';
import * as OperationsDB from '../../app/services/OperationsDB';
import * as BudgetsDB from '../../app/services/BudgetsDB';
import * as PlannedOperationsDB from '../../app/services/PlannedOperationsDB';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

describe('seedDatabase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AccountsDB.createAccount
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce({ id: 3 });
    CategoriesDB.createCategory.mockResolvedValue({});
    OperationsDB.createOperation.mockResolvedValue({});
    BudgetsDB.createBudget.mockResolvedValue({});
    PlannedOperationsDB.createPlannedOperation.mockResolvedValue({});
  });

  it('calls resetDatabase first', async () => {
    await seedDatabase();
    expect(resetDatabase).toHaveBeenCalledTimes(1);
  });

  it('creates 3 accounts', async () => {
    await seedDatabase();
    expect(AccountsDB.createAccount).toHaveBeenCalledTimes(3);
  });

  it('creates 10 categories', async () => {
    await seedDatabase();
    expect(CategoriesDB.createCategory).toHaveBeenCalledTimes(10);
  });

  it('creates 60 operations', async () => {
    await seedDatabase();
    expect(OperationsDB.createOperation).toHaveBeenCalledTimes(60);
  });

  it('resolves accountIndex 0 to integer id 1', async () => {
    await seedDatabase();
    expect(OperationsDB.createOperation.mock.calls[0][0].accountId).toBe(1);
  });

  it('resolves toAccountIndex for transfer operations', async () => {
    await seedDatabase();
    const transferCall = OperationsDB.createOperation.mock.calls.find(c => c[0].toAccountId != null);
    expect(transferCall).toBeDefined();
    expect(transferCall[0].toAccountId).toBe(3);
  });

  it('passes categoryId strings to createOperation', async () => {
    await seedDatabase();
    const firstNonTransfer = OperationsDB.createOperation.mock.calls.find(c => c[0].toAccountId == null);
    expect(typeof firstNonTransfer[0].categoryId).toBe('string');
  });

  it('creates 2 budgets', async () => {
    await seedDatabase();
    expect(BudgetsDB.createBudget).toHaveBeenCalledTimes(2);
  });

  it('creates 2 planned operations', async () => {
    await seedDatabase();
    expect(PlannedOperationsDB.createPlannedOperation).toHaveBeenCalledTimes(2);
  });

  it('emits RELOAD_ALL after all inserts', async () => {
    await seedDatabase();
    expect(appEvents.emit).toHaveBeenCalledWith(EVENTS.RELOAD_ALL);
  });
});
