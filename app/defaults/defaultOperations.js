/**
 * Default operations for seeding the database on first launch or reset.
 * These provide sample data for smoke testing and demonstrating app functionality.
 *
 * All operations use today's date (dynamically generated) so balance history
 * entries are created for the current day via createOperation().
 */

import { todayLocalDate } from '../utils/dateUtils';

/**
 * Get default operations for seeding the database
 * @param {number} accountId - Primary account ID for operations
 * @param {number|null} toAccountId - Secondary account ID for transfer (optional)
 * @returns {Array} Array of operation objects ready for createOperation()
 */
const getDefaultOperations = (accountId, toAccountId = null) => {
  // Today's *local* calendar day: the seed rows must land on the same day the
  // rest of the app books to, or a fresh install in UTC+4 opens with yesterday's
  // demo data and a balance-history entry on the wrong date.
  const today = todayLocalDate();

  const operations = [
    {
      type: 'income',
      amount: '1000.00',
      accountId,
      categoryId: 'income-salary',
      date: today,
      description: 'Monthly salary',
    },
    {
      type: 'expense',
      amount: '25.50',
      accountId,
      categoryId: 'expense-food-groceries',
      date: today,
      description: 'Weekly groceries',
    },
    {
      type: 'expense',
      amount: '4.50',
      accountId,
      categoryId: 'expense-food-coffee-cafe',
      date: today,
      description: 'Morning coffee',
    },
    {
      type: 'expense',
      amount: '12.00',
      accountId,
      categoryId: 'expense-transportation-public-transport',
      date: today,
      description: 'Metro pass',
    },
  ];

  // Add transfer operation only if we have a different secondary account
  if (toAccountId && toAccountId !== accountId) {
    operations.push({
      type: 'transfer',
      amount: '100.00',
      accountId,
      toAccountId,
      categoryId: null,
      date: today,
      description: 'Savings transfer',
    });
  }

  return operations;
};

export default getDefaultOperations;
