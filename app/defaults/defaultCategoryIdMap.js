/**
 * Mapping from legacy UUID-based category IDs to new integer IDs
 * This ensures consistency across all installations and during migration
 *
 * Default categories: IDs 1-71
 * User-created categories: Auto-increment starting from 1000
 */

export const defaultCategoryIdMap = {
  // Food categories: 1-9
  'expense-food': 1,
  'expense-food-groceries': 2,
  'expense-food-coffee-cafe': 3,
  'expense-food-restaurants': 4,
  'expense-food-fast-food': 5,
  'expense-food-lunches': 6,
  'expense-food-breakfasts': 7,
  'expense-food-tips': 8,
  'expense-food-other': 9,

  // Transportation categories: 10-16
  'expense-transportation': 10,
  'expense-transportation-public-transport': 11,
  'expense-transportation-taxi': 12,
  'expense-transportation-fuel': 13,
  'expense-transportation-repair': 14,
  'expense-transportation-car-rent': 15,
  'expense-transportation-other': 16,

  // Entertainment categories: 17-25
  'expense-entertainment': 17,
  'expense-entertainment-movies': 18,
  'expense-entertainment-cultural': 19,
  'expense-entertainment-bars': 20,
  'expense-entertainment-drinks': 21,
  'expense-entertainment-celebrations': 22,
  'expense-entertainment-sports': 23,
  'expense-entertainment-hobbies': 24,
  'expense-entertainment-other': 25,

  // Monthly categories: 26-35
  'expense-monthly': 26,
  'expense-monthly-rent': 27,
  'expense-monthly-electricity': 28,
  'expense-monthly-water': 29,
  'expense-monthly-gas': 30,
  'expense-monthly-internet': 31,
  'expense-monthly-phone': 32,
  'expense-monthly-subscriptions': 33,
  'expense-monthly-credit-card': 34,
  'expense-monthly-other': 35,

  // Shopping categories: 36-41
  'expense-shopping': 36,
  'expense-shopping-clothing': 37,
  'expense-shopping-electronics': 38,
  'expense-shopping-books': 39,
  'expense-shopping-gifts': 40,
  'expense-shopping-other': 41,

  // Family categories: 42-46
  'expense-family': 42,
  'expense-family-pocket-money': 43,
  'expense-family-gifts': 44,
  'expense-family-animals': 45,
  'expense-family-other': 46,

  // Travelling categories: 47-54
  'expense-travelling': 47,
  'expense-travelling-transportation': 48,
  'expense-travelling-accommodation': 49,
  'expense-travelling-food': 50,
  'expense-travelling-cultural': 51,
  'expense-travelling-souvenirs': 52,
  'expense-travelling-package-tour': 53,
  'expense-travelling-other': 54,

  // Health categories: 55-59
  'expense-health': 55,
  'expense-health-hospitals': 56,
  'expense-health-medicine': 57,
  'expense-health-veterinary': 58,
  'expense-health-other': 59,

  // House categories: 60-64
  'expense-house': 60,
  'expense-house-renovations': 61,
  'expense-house-furniture': 62,
  'expense-house-household-goods': 63,
  'expense-house-other': 64,

  // Income categories: 65-69
  'income-salary': 65,
  'income-business': 66,
  'income-investments': 67,
  'income-gifts': 68,
  'income-other': 69,

  // Shadow categories: 70-71
  'shadow-adjustment-expense': 70,
  'shadow-adjustment-income': 71,
};

/**
 * Reverse mapping: Integer ID → UUID string
 * Useful for debugging and migration validation
 */
export const reverseIdMap = Object.fromEntries(
  Object.entries(defaultCategoryIdMap).map(([key, value]) => [value, key])
);

/**
 * Get integer ID for a category UUID
 * @param {string} uuid - Category UUID
 * @returns {number|null} Integer ID or null if not found
 */
export const getIntegerId = (uuid) => defaultCategoryIdMap[uuid] || null;

/**
 * Get UUID for a category integer ID
 * @param {number} id - Category integer ID
 * @returns {string|null} UUID or null if not found
 */
export const getUuid = (id) => reverseIdMap[id] || null;

/**
 * Check if an ID is a default category ID (1-71)
 * @param {number} id - Category integer ID
 * @returns {boolean}
 */
export const isDefaultCategoryId = (id) => id >= 1 && id <= 71;

/**
 * Check if an ID is a user-created category ID (>= 1000)
 * @param {number} id - Category integer ID
 * @returns {boolean}
 */
export const isUserCategoryId = (id) => id >= 1000;
