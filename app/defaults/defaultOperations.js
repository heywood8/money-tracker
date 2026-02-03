/**
 * Default operations for first app launch
 * These provide sample data to demonstrate app functionality
 *
 * Note: accountId will be resolved dynamically during initialization
 * since account IDs are auto-generated. The operations use the first
 * visible account (typically "Ameria card" with AMD currency).
 */

/**
 * Get default operations for app initialization
 * @param {string} today - Today's date in YYYY-MM-DD format
 * @param {number} accountId - ID of the account to use for operations
 * @returns {Array} Array of operation objects
 */
const getDefaultOperations = (today, accountId) => [
  {
    type: 'income',
    amount: '50000',
    accountId: accountId,
    categoryId: 'income-salary',
    date: today,
    description: 'Sample salary',
  },
  {
    type: 'expense',
    amount: '5000',
    accountId: accountId,
    categoryId: 'expense-food-groceries',
    date: today,
    description: 'Weekly groceries',
  },
  {
    type: 'expense',
    amount: '800',
    accountId: accountId,
    categoryId: 'expense-food-coffee-cafe',
    date: today,
    description: 'Morning coffee',
  },
  {
    type: 'expense',
    amount: '300',
    accountId: accountId,
    categoryId: 'expense-transportation-public-transport',
    date: today,
    description: 'Metro fare',
  },
  {
    type: 'expense',
    amount: '3500',
    accountId: accountId,
    categoryId: 'expense-food-restaurants',
    date: today,
    description: 'Dinner with friends',
  },
];

export default getDefaultOperations;
