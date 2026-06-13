// app/services/SeedService.js
import { resetDatabase } from '../utils/resetDatabase';
import { createAccount } from './AccountsDB';
import { createCategory } from './CategoriesDB';
import { createOperation } from './OperationsDB';
import { createBudget } from './BudgetsDB';
import { createPlannedOperation } from './PlannedOperationsDB';
import { generateSeedData } from '../defaults/seedData';
import { appEvents, EVENTS } from './eventEmitter';

export const seedDatabase = async () => {
  await resetDatabase();

  const data = generateSeedData(new Date());

  // Create accounts and capture their auto-increment integer IDs
  const accountIds = [];
  for (const template of data.accountTemplates) {
    const created = await createAccount(template);
    accountIds.push(created.id);
  }

  for (const category of data.categories) {
    await createCategory(category);
  }

  for (const template of data.operationTemplates) {
    const { accountIndex, toAccountIndex, daysAgo, ...rest } = template;
    await createOperation({
      ...rest,
      accountId: accountIds[accountIndex],
      toAccountId: toAccountIndex != null ? accountIds[toAccountIndex] : null,
    });
  }

  for (const budget of data.budgets) {
    await createBudget(budget);
  }

  for (const template of data.plannedOperations) {
    const { accountIndex, toAccountIndex, ...rest } = template;
    await createPlannedOperation({
      ...rest,
      accountId: accountIds[accountIndex],
      toAccountId: toAccountIndex != null ? accountIds[toAccountIndex] : null,
    });
  }

  appEvents.emit(EVENTS.RELOAD_ALL);
};
