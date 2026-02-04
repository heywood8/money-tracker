/**
 * Default operations for seeding the database on first launch or reset.
 * These provide sample data for smoke testing and demonstrating app functionality.
 *
 * All operations use today's date (dynamically generated) so balance history
 * entries are created for the current day via createOperation().
 */

/**
 * Get default operations for seeding the database
 * @param {number} accountId - Primary account ID for operations
 * @param {number|null} toAccountId - Secondary account ID for transfer (optional)
 * @returns {Array} Array of operation objects ready for createOperation()
 */
const getDefaultOperations = (accountId, toAccountId = null) => {
  // Use today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  const operations = [
    {
      type: 'income',
      amount: '2500.00',
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
