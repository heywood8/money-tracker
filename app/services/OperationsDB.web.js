import { idb } from './db.web';

const STORE_NAME = 'operations';

/**
 * Get all operations
 * @returns {Promise<Array>}
 */
export const getAllOperations = async () => {
  try {
    const operations = await idb.getAll(STORE_NAME);
    // Sort by date DESC, created_at DESC
    operations.sort((a, b) => {
      const dateCompare = new Date(b.date) - new Date(a.date);
      if (dateCompare !== 0) return dateCompare;
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return operations || [];
  } catch (error) {
    console.error('Failed to get operations:', error);
    throw error;
  }
};

/**
 * Get operation by ID
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export const getOperationById = async (id) => {
  try {
    const operation = await idb.get(STORE_NAME, id);
    return operation || null;
  } catch (error) {
    console.error('Failed to get operation:', error);
    throw error;
  }
};

/**
 * Get operations by account
 * @param {string} accountId
 * @returns {Promise<Array>}
 */
export const getOperationsByAccount = async (accountId) => {
  try {
    const operations = await idb.getAllByIndex(STORE_NAME, 'account_id', accountId);
    const toAccountOps = await idb.getAllByIndex(STORE_NAME, 'to_account_id', accountId);

    const combined = [...operations, ...toAccountOps];
    // Remove duplicates by id
    const uniqueOps = Array.from(new Map(combined.map(op => [op.id, op])).values());

    // Sort by date DESC, created_at DESC
    uniqueOps.sort((a, b) => {
      const dateCompare = new Date(b.date) - new Date(a.date);
      if (dateCompare !== 0) return dateCompare;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return uniqueOps;
  } catch (error) {
    console.error('Failed to get operations by account:', error);
    throw error;
  }
};

/**
 * Get operations by category
 * @param {string} categoryId
 * @returns {Promise<Array>}
 */
export const getOperationsByCategory = async (categoryId) => {
  try {
    const operations = await idb.getAllByIndex(STORE_NAME, 'category_id', categoryId);
    // Sort by date DESC, created_at DESC
    operations.sort((a, b) => {
      const dateCompare = new Date(b.date) - new Date(a.date);
      if (dateCompare !== 0) return dateCompare;
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return operations || [];
  } catch (error) {
    console.error('Failed to get operations by category:', error);
    throw error;
  }
};

/**
 * Get operations by date range
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {Promise<Array>}
 */
export const getOperationsByDateRange = async (startDate, endDate) => {
  try {
    const allOperations = await idb.getAll(STORE_NAME);
    const filtered = allOperations.filter(op => {
      return op.date >= startDate && op.date <= endDate;
    });

    // Sort by date DESC, created_at DESC
    filtered.sort((a, b) => {
      const dateCompare = new Date(b.date) - new Date(a.date);
      if (dateCompare !== 0) return dateCompare;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return filtered;
  } catch (error) {
    console.error('Failed to get operations by date range:', error);
    throw error;
  }
};

/**
 * Get operations by type
 * @param {string} type - 'expense', 'income', or 'transfer'
 * @returns {Promise<Array>}
 */
export const getOperationsByType = async (type) => {
  try {
    const operations = await idb.getAllByIndex(STORE_NAME, 'type', type);
    // Sort by date DESC, created_at DESC
    operations.sort((a, b) => {
      const dateCompare = new Date(b.date) - new Date(a.date);
      if (dateCompare !== 0) return dateCompare;
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return operations || [];
  } catch (error) {
    console.error('Failed to get operations by type:', error);
    throw error;
  }
};

/**
 * Calculate balance changes for an operation
 * @param {Object} operation
 * @returns {Map<string, number>}
 */
const calculateBalanceChanges = (operation) => {
  const balanceChanges = new Map();
  const amount = parseFloat(operation.amount) || 0;

  if (operation.type === 'expense') {
    balanceChanges.set(operation.account_id, -amount);
  } else if (operation.type === 'income') {
    balanceChanges.set(operation.account_id, amount);
  } else if (operation.type === 'transfer') {
    balanceChanges.set(operation.account_id, -amount);
    if (operation.to_account_id) {
      const toChange = balanceChanges.get(operation.to_account_id) || 0;
      balanceChanges.set(operation.to_account_id, toChange + amount);
    }
  }

  return balanceChanges;
};

/**
 * Create a new operation
 * @param {Object} operation - Operation data
 * @returns {Promise<Object>}
 */
export const createOperation = async (operation) => {
  try {
    const now = new Date().toISOString();
    const operationData = {
      id: operation.id,
      type: operation.type,
      amount: operation.amount,
      account_id: operation.accountId,
      category_id: operation.categoryId || null,
      to_account_id: operation.toAccountId || null,
      date: operation.date,
      created_at: now,
      description: operation.description || null,
    };

    // Insert operation
    await idb.put(STORE_NAME, operationData);

    // Update account balances
    const balanceChanges = calculateBalanceChanges(operationData);
    const updateTime = new Date().toISOString();

    for (const [accountId, delta] of balanceChanges.entries()) {
      if (delta === 0) continue;

      // Get current account
      const account = await idb.get('accounts', accountId);

      if (!account) {
        console.warn(`Account ${accountId} not found, skipping balance update`);
        continue;
      }

      const currentBalance = parseFloat(account.balance) || 0;
      const newBalance = currentBalance + delta;

      // Update balance
      await idb.put('accounts', {
        ...account,
        balance: newBalance.toString(),
        updated_at: updateTime,
      });
    }

    return operationData;
  } catch (error) {
    console.error('Failed to create operation:', error);
    throw error;
  }
};

/**
 * Update an existing operation
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateOperation = async (id, updates) => {
  try {
    // Get old operation
    const oldOperation = await idb.get(STORE_NAME, id);

    if (!oldOperation) {
      throw new Error(`Operation ${id} not found`);
    }

    // Build updated operation
    const updatedOperation = { ...oldOperation };

    if (updates.type !== undefined) {
      updatedOperation.type = updates.type;
    }
    if (updates.amount !== undefined) {
      updatedOperation.amount = updates.amount;
    }
    if (updates.accountId !== undefined) {
      updatedOperation.account_id = updates.accountId;
    }
    if (updates.categoryId !== undefined) {
      updatedOperation.category_id = updates.categoryId || null;
    }
    if (updates.toAccountId !== undefined) {
      updatedOperation.to_account_id = updates.toAccountId || null;
    }
    if (updates.date !== undefined) {
      updatedOperation.date = updates.date;
    }
    if (updates.description !== undefined) {
      updatedOperation.description = updates.description || null;
    }

    // Update operation
    await idb.put(STORE_NAME, updatedOperation);

    // Calculate balance changes (reverse old + apply new)
    const balanceChanges = new Map();

    // Reverse old operation
    const oldChanges = calculateBalanceChanges(oldOperation);
    for (const [accountId, delta] of oldChanges.entries()) {
      balanceChanges.set(accountId, (balanceChanges.get(accountId) || 0) - delta);
    }

    // Apply new operation
    const newChanges = calculateBalanceChanges(updatedOperation);
    for (const [accountId, delta] of newChanges.entries()) {
      balanceChanges.set(accountId, (balanceChanges.get(accountId) || 0) + delta);
    }

    // Update account balances
    const updateTime = new Date().toISOString();
    for (const [accountId, delta] of balanceChanges.entries()) {
      if (delta === 0) continue;

      // Get current account
      const account = await idb.get('accounts', accountId);

      if (!account) {
        console.warn(`Account ${accountId} not found, skipping balance update`);
        continue;
      }

      const currentBalance = parseFloat(account.balance) || 0;
      const newBalance = currentBalance + delta;

      // Update balance
      await idb.put('accounts', {
        ...account,
        balance: newBalance.toString(),
        updated_at: updateTime,
      });
    }
  } catch (error) {
    console.error('Failed to update operation:', error);
    throw error;
  }
};

/**
 * Delete an operation
 * @param {string} id
 * @returns {Promise<void>}
 */
export const deleteOperation = async (id) => {
  try {
    // Get operation before deletion
    const operation = await idb.get(STORE_NAME, id);

    if (!operation) {
      throw new Error(`Operation ${id} not found`);
    }

    // Delete operation
    await idb.delete(STORE_NAME, id);

    // Reverse balance changes
    const balanceChanges = calculateBalanceChanges(operation);
    const reverseChanges = new Map();
    for (const [accountId, delta] of balanceChanges.entries()) {
      reverseChanges.set(accountId, -delta);
    }

    // Update account balances
    const updateTime = new Date().toISOString();
    for (const [accountId, delta] of reverseChanges.entries()) {
      if (delta === 0) continue;

      // Get current account
      const account = await idb.get('accounts', accountId);

      if (!account) {
        console.warn(`Account ${accountId} not found, skipping balance update`);
        continue;
      }

      const currentBalance = parseFloat(account.balance) || 0;
      const newBalance = currentBalance + delta;

      // Update balance
      await idb.put('accounts', {
        ...account,
        balance: newBalance.toString(),
        updated_at: updateTime,
      });
    }
  } catch (error) {
    console.error('Failed to delete operation:', error);
    throw error;
  }
};

/**
 * Get total expenses for account in date range
 * @param {string} accountId
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<number>}
 */
export const getTotalExpenses = async (accountId, startDate, endDate) => {
  try {
    const operations = await getOperationsByAccount(accountId);
    const total = operations
      .filter(op => op.type === 'expense' && op.date >= startDate && op.date <= endDate)
      .reduce((sum, op) => sum + parseFloat(op.amount), 0);
    return total;
  } catch (error) {
    console.error('Failed to get total expenses:', error);
    throw error;
  }
};

/**
 * Get total income for account in date range
 * @param {string} accountId
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<number>}
 */
export const getTotalIncome = async (accountId, startDate, endDate) => {
  try {
    const operations = await getOperationsByAccount(accountId);
    const total = operations
      .filter(op => op.type === 'income' && op.date >= startDate && op.date <= endDate)
      .reduce((sum, op) => sum + parseFloat(op.amount), 0);
    return total;
  } catch (error) {
    console.error('Failed to get total income:', error);
    throw error;
  }
};

/**
 * Get spending by category for date range
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<Array>}
 */
export const getSpendingByCategory = async (startDate, endDate) => {
  try {
    const allOperations = await idb.getAll(STORE_NAME);
    const filtered = allOperations.filter(
      op => op.type === 'expense' && op.date >= startDate && op.date <= endDate && op.category_id
    );

    // Group by category
    const categoryTotals = new Map();
    for (const op of filtered) {
      const current = categoryTotals.get(op.category_id) || 0;
      categoryTotals.set(op.category_id, current + parseFloat(op.amount));
    }

    // Convert to array and sort by total DESC
    const results = Array.from(categoryTotals.entries()).map(([category_id, total]) => ({
      category_id,
      total,
    }));
    results.sort((a, b) => b.total - a.total);

    return results;
  } catch (error) {
    console.error('Failed to get spending by category:', error);
    throw error;
  }
};

/**
 * Get income by category for date range
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<Array>}
 */
export const getIncomeByCategory = async (startDate, endDate) => {
  try {
    const allOperations = await idb.getAll(STORE_NAME);
    const filtered = allOperations.filter(
      op => op.type === 'income' && op.date >= startDate && op.date <= endDate && op.category_id
    );

    // Group by category
    const categoryTotals = new Map();
    for (const op of filtered) {
      const current = categoryTotals.get(op.category_id) || 0;
      categoryTotals.set(op.category_id, current + parseFloat(op.amount));
    }

    // Convert to array and sort by total DESC
    const results = Array.from(categoryTotals.entries()).map(([category_id, total]) => ({
      category_id,
      total,
    }));
    results.sort((a, b) => b.total - a.total);

    return results;
  } catch (error) {
    console.error('Failed to get income by category:', error);
    throw error;
  }
};

/**
 * Get spending by category filtered by currency and date range
 * @param {string} currency - Currency code (e.g., 'USD', 'AMD')
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {Promise<Array>}
 */
export const getSpendingByCategoryAndCurrency = async (currency, startDate, endDate) => {
  try {
    const allOperations = await idb.getAll(STORE_NAME);
    const allAccounts = await idb.getAll('accounts');

    // Create a map of account_id to currency
    const accountCurrencyMap = new Map();
    for (const account of allAccounts) {
      accountCurrencyMap.set(account.id, account.currency);
    }

    // Filter operations by currency, date range, and type
    const filtered = allOperations.filter(op => {
      const accountCurrency = accountCurrencyMap.get(op.account_id);
      return (
        op.type === 'expense' &&
        accountCurrency === currency &&
        op.date >= startDate &&
        op.date <= endDate &&
        op.category_id
      );
    });

    // Group by category
    const categoryTotals = new Map();
    for (const op of filtered) {
      const current = categoryTotals.get(op.category_id) || 0;
      categoryTotals.set(op.category_id, current + parseFloat(op.amount));
    }

    // Convert to array and sort by total DESC
    const results = Array.from(categoryTotals.entries()).map(([category_id, total]) => ({
      category_id,
      total,
    }));
    results.sort((a, b) => b.total - a.total);

    return results;
  } catch (error) {
    console.error('Failed to get spending by category and currency:', error);
    throw error;
  }
};

/**
 * Check if operation exists
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export const operationExists = async (id) => {
  try {
    const operation = await idb.get(STORE_NAME, id);
    return !!operation;
  } catch (error) {
    console.error('Failed to check operation existence:', error);
    throw error;
  }
};

/**
 * Get distinct year/month combinations that have operations
 * @returns {Promise<Array<{year: number, month: number}>>}
 */
export const getAvailableMonths = async () => {
  try {
    const allOperations = await idb.getAll(STORE_NAME);

    // Extract unique year/month combinations
    const yearMonthSet = new Set();
    for (const op of allOperations) {
      const date = new Date(op.date);
      const year = date.getFullYear();
      const month = date.getMonth(); // 0-11
      yearMonthSet.add(`${year}-${month}`);
    }

    // Convert to array of objects
    const results = Array.from(yearMonthSet).map(key => {
      const [year, month] = key.split('-');
      return {
        year: parseInt(year, 10),
        month: parseInt(month, 10)
      };
    });

    // Sort by year DESC, month DESC
    results.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    return results;
  } catch (error) {
    console.error('Failed to get available months:', error);
    throw error;
  }
};
