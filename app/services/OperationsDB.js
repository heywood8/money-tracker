import { executeQuery, queryAll, queryFirst, executeTransaction } from './db';
import * as Currency from './currency';
import { formatDate, updateTodayBalance } from './BalanceHistoryDB';
import * as AccountsDB from './AccountsDB';
import getDefaultOperations from '../defaults/defaultOperations';

/**
 * Map database field names to camelCase for application use
 * @param {Object} dbOperation - Operation object from database with snake_case fields
 * @returns {Object} Operation object with camelCase fields
 */
const mapOperationFields = (dbOperation) => {
  if (!dbOperation) return null;

  return {
    id: dbOperation.id,
    type: dbOperation.type,
    amount: dbOperation.amount,
    accountId: dbOperation.account_id,
    categoryId: dbOperation.category_id,
    toAccountId: dbOperation.to_account_id,
    date: dbOperation.date,
    description: dbOperation.description,
    createdAt: dbOperation.created_at,
    exchangeRate: dbOperation.exchange_rate,
    destinationAmount: dbOperation.destination_amount,
    sourceCurrency: dbOperation.source_currency,
    destinationCurrency: dbOperation.destination_currency,
  };
};

/**
 * Get all operations
 * @returns {Promise<Array>}
 */
export const getAllOperations = async () => {
  try {
    const operations = await queryAll(
      'SELECT * FROM operations ORDER BY date DESC, created_at DESC',
    );
    return (operations || []).map(mapOperationFields);
  } catch (error) {
    console.error('Failed to get operations:', error);
    throw error;
  }
};

/**
 * Initialize default operations for first-time setup or database reset.
 * Creates sample operations using today's date.
 * Balance history is automatically updated via createOperation() -> updateTodayBalance().
 *
 * @returns {Promise<void>}
 */
export const initializeDefaultOperations = async () => {
  try {
    // Get all accounts
    const accounts = await AccountsDB.getAllAccounts();

    if (!accounts || accounts.length === 0) {
      console.log('[OperationsDB] No accounts found, skipping default operations initialization');
      return;
    }

    // Find visible accounts (hidden === 0)
    const visibleAccounts = accounts.filter(acc => acc.hidden === 0);

    if (visibleAccounts.length === 0) {
      console.log('[OperationsDB] No visible accounts found, using first available account');
      visibleAccounts.push(accounts[0]);
    }

    // Use first visible account as primary
    const primaryAccount = visibleAccounts[0];

    // Use second visible account for transfers (if available)
    const secondaryAccount = visibleAccounts.length > 1 ? visibleAccounts[1] : null;

    console.log('[OperationsDB] Initializing default operations with accounts:', {
      primary: primaryAccount.id,
      secondary: secondaryAccount?.id || null,
    });

    // Get default operations
    const defaultOps = getDefaultOperations(
      primaryAccount.id,
      secondaryAccount?.id || null,
    );

    // Create each operation (this also updates account balances and balance history)
    for (const op of defaultOps) {
      await createOperation(op);
      console.log(`[OperationsDB] Created default operation: ${op.type} - ${op.amount}`);
    }

    console.log(`[OperationsDB] Successfully initialized ${defaultOps.length} default operations`);
  } catch (error) {
    console.error('[OperationsDB] Failed to initialize default operations:', error);
    throw error;
  }
};

/**
 * Get operation by ID
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
export const getOperationById = async (id) => {
  try {
    const operation = await queryFirst(
      'SELECT * FROM operations WHERE id = ?',
      [id],
    );
    return mapOperationFields(operation);
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
    const operations = await queryAll(
      'SELECT * FROM operations WHERE account_id = ? OR to_account_id = ? ORDER BY date DESC, created_at DESC',
      [accountId, accountId],
    );
    return (operations || []).map(mapOperationFields);
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
    const operations = await queryAll(
      'SELECT * FROM operations WHERE category_id = ? ORDER BY date DESC, created_at DESC',
      [categoryId],
    );
    return (operations || []).map(mapOperationFields);
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
    const operations = await queryAll(
      'SELECT * FROM operations WHERE date >= ? AND date <= ? ORDER BY date DESC, created_at DESC',
      [startDate, endDate],
    );
    return (operations || []).map(mapOperationFields);
  } catch (error) {
    console.error('Failed to get operations by date range:', error);
    throw error;
  }
};

/**
 * Get filtered operations by date range
 * @param {string} startDate - ISO date string (YYYY-MM-DD)
 * @param {string} endDate - ISO date string (YYYY-MM-DD)
 * @param {Object} filters - Filter object with types, accountIds, categoryIds, searchText, dateRange, amountRange
 * @returns {Promise<Array>}
 */
export const getFilteredOperationsByDateRange = async (startDate, endDate, filters = {}) => {
  try {
    // Build dynamic SQL query
    let sql = `
      SELECT DISTINCT o.*
      FROM operations o
      LEFT JOIN accounts a ON o.account_id = a.id
      LEFT JOIN accounts to_a ON o.to_account_id = to_a.id
      LEFT JOIN categories c ON o.category_id = c.id
      WHERE o.date >= ? AND o.date <= ?
    `;

    const params = [startDate, endDate];

    // Apply type filters
    if (filters.types && filters.types.length > 0 && filters.types.length < 3) {
      const placeholders = filters.types.map(() => '?').join(',');
      sql += ` AND o.type IN (${placeholders})`;
      params.push(...filters.types);
    }

    // Apply account filters
    if (filters.accountIds && filters.accountIds.length > 0) {
      const placeholders = filters.accountIds.map(() => '?').join(',');
      sql += ` AND (o.account_id IN (${placeholders}) OR o.to_account_id IN (${placeholders}))`;
      params.push(...filters.accountIds, ...filters.accountIds);
    }

    // Apply category filters
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      const placeholders = filters.categoryIds.map(() => '?').join(',');
      sql += ` AND o.category_id IN (${placeholders})`;
      params.push(...filters.categoryIds);
    }

    // Apply amount range filters
    if (filters.amountRange) {
      if (filters.amountRange.min !== null && filters.amountRange.min !== undefined) {
        sql += ' AND CAST(o.amount AS REAL) >= ?';
        params.push(filters.amountRange.min);
      }
      if (filters.amountRange.max !== null && filters.amountRange.max !== undefined) {
        sql += ' AND CAST(o.amount AS REAL) <= ?';
        params.push(filters.amountRange.max);
      }
    }

    // Apply additional date range filters (independent of main range)
    if (filters.dateRange) {
      if (filters.dateRange.startDate) {
        sql += ' AND o.date >= ?';
        params.push(filters.dateRange.startDate);
      }
      if (filters.dateRange.endDate) {
        sql += ' AND o.date <= ?';
        params.push(filters.dateRange.endDate);
      }
    }

    // Apply search text filter (searches across multiple fields)
    if (filters.searchText && filters.searchText.trim()) {
      const searchTerm = `%${filters.searchText.trim()}%`;
      sql += ` AND (
        o.description LIKE ? COLLATE NOCASE
        OR o.amount LIKE ?
        OR a.name LIKE ? COLLATE NOCASE
        OR to_a.name LIKE ? COLLATE NOCASE
        OR c.name LIKE ? COLLATE NOCASE
      )`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY o.date DESC, o.created_at DESC';

    console.log(`Loading filtered operations from ${startDate} to ${endDate}`, filters);

    const operations = await queryAll(sql, params);

    console.log(`Filtered operations loaded: ${operations?.length || 0} operations`);

    return (operations || []).map(mapOperationFields);
  } catch (error) {
    console.error('Failed to get filtered operations by date range:', error);
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
    const operations = await queryAll(
      'SELECT * FROM operations WHERE type = ? ORDER BY date DESC, created_at DESC',
      [type],
    );
    return (operations || []).map(mapOperationFields);
  } catch (error) {
    console.error('Failed to get operations by type:', error);
    throw error;
  }
};

/**
 * Calculate balance changes for an operation
 * Handles multi-currency transfers by using destination_amount when available
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
    // Deduct from source account
    balanceChanges.set(operation.account_id, -amount);

    if (operation.to_account_id) {
      // For multi-currency transfers, use destination_amount if available
      // Otherwise fall back to source amount (same currency transfer)
      const destinationAmount = operation.destination_amount
        ? parseFloat(operation.destination_amount)
        : amount;

      const toChange = balanceChanges.get(operation.to_account_id) || 0;
      balanceChanges.set(operation.to_account_id, toChange + destinationAmount);
    }
  }

  return balanceChanges;
};

/**
 * Create a new operation
 * @param {Object} operation - Operation data (ID will be auto-generated)
 * @returns {Promise<Object>}
 */
export const createOperation = async (operation) => {
  try {
    console.log('[OperationsDB] createOperation - type:', operation.type, 'amount:', operation.amount, typeof operation.amount, 'accountId:', operation.accountId, typeof operation.accountId, 'toAccountId:', operation.toAccountId, typeof operation.toAccountId, 'categoryId:', operation.categoryId, typeof operation.categoryId, 'date:', operation.date);
    
    const now = new Date().toISOString();
    
    // Safely extract primitive IDs (handle case where objects might be passed)
    const extractId = (value, fieldName) => {
      if (value === null || value === undefined || value === '') {
        console.log(`[OperationsDB] ${fieldName}: null/undefined/empty`);
        return null;
      }
      if (typeof value === 'object' && value !== null) {
        console.log(`[OperationsDB] ${fieldName}: object with id=${value.id} (${typeof value.id})`);
        if (value.id !== undefined) {
          return value.id;
        }
      }
      return value;
    };
    
    const operationData = {
      type: operation.type,
      amount: operation.amount,
      account_id: extractId(operation.accountId, 'accountId'),
      category_id: extractId(operation.categoryId, 'categoryId'),
      to_account_id: extractId(operation.toAccountId, 'toAccountId'),
      date: operation.date,
      created_at: now,
      description: operation.description || null,
      exchange_rate: operation.exchangeRate || null,
      destination_amount: operation.destinationAmount || null,
      source_currency: operation.sourceCurrency || null,
      destination_currency: operation.destinationCurrency || null,
    };
    
    console.log('[OperationsDB] operationData - account_id:', operationData.account_id, typeof operationData.account_id, 'to_account_id:', operationData.to_account_id, typeof operationData.to_account_id, 'category_id:', operationData.category_id, typeof operationData.category_id);

    let newOperationId;

    await executeTransaction(async (db) => {
      // Insert operation (ID will be auto-generated)
      const insertParams = [
        operationData.type,
        operationData.amount,
        operationData.account_id,
        operationData.category_id,
        operationData.to_account_id,
        operationData.date,
        operationData.created_at,
        operationData.description,
        operationData.exchange_rate,
        operationData.destination_amount,
        operationData.source_currency,
        operationData.destination_currency,
      ];
      
      console.log('[OperationsDB] INSERT params:', insertParams.map((p, i) => 
        `[${i}]: ${JSON.stringify(p)} (${typeof p})`,
      ).join(', '));
      
      const result = await db.runAsync(
        'INSERT INTO operations (type, amount, account_id, category_id, to_account_id, date, created_at, description, exchange_rate, destination_amount, source_currency, destination_currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        insertParams,
      );

      // Store the auto-generated ID
      newOperationId = result.lastInsertRowId;
      operationData.id = newOperationId;

      // Update account balances within the same transaction
      const balanceChanges = calculateBalanceChanges(operationData);
      const updateTime = new Date().toISOString();

      for (const [accountId, delta] of balanceChanges.entries()) {
        if (delta === 0) continue;

        // Get current balance
        const account = await db.getFirstAsync(
          'SELECT balance FROM accounts WHERE id = ?',
          [accountId],
        );

        if (!account) {
          console.warn(`Account ${accountId} not found, skipping balance update`);
          continue;
        }

        // Use Currency utilities for precise arithmetic
        const newBalance = Currency.add(account.balance, delta);

        // Update balance
        await db.runAsync(
          'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
          [newBalance, updateTime, accountId],
        );

        // Update today's balance history
        await updateTodayBalance(accountId, newBalance, db);
      }
    });

    return operationData;
  } catch (error) {
    console.error('Failed to create operation:', error);
    throw error;
  }
};

/**
 * Update an existing operation
 * @param {number} id
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateOperation = async (id, updates) => {
  try {
    // Safely extract primitive IDs (handle case where objects might be passed)
    const extractId = (value) => {
      if (value === null || value === undefined || value === '') return null;
      if (typeof value === 'object' && value.id !== undefined) return value.id;
      return value;
    };
    
    await executeTransaction(async (db) => {
      // Get old operation
      const oldOperation = await db.getFirstAsync(
        'SELECT * FROM operations WHERE id = ?',
        [id],
      );

      if (!oldOperation) {
        throw new Error(`Operation ${id} not found`);
      }

      // Build update query
      const fields = [];
      const values = [];

      if (updates.type !== undefined) {
        fields.push('type = ?');
        values.push(updates.type);
      }
      if (updates.amount !== undefined) {
        fields.push('amount = ?');
        values.push(updates.amount);
      }
      if (updates.accountId !== undefined) {
        fields.push('account_id = ?');
        values.push(extractId(updates.accountId));
      }
      if (updates.categoryId !== undefined) {
        fields.push('category_id = ?');
        values.push(extractId(updates.categoryId));
      }
      if (updates.toAccountId !== undefined) {
        fields.push('to_account_id = ?');
        values.push(extractId(updates.toAccountId));
      }
      if (updates.date !== undefined) {
        fields.push('date = ?');
        values.push(updates.date);
      }
      if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description || null);
      }
      if (updates.exchangeRate !== undefined) {
        fields.push('exchange_rate = ?');
        values.push(updates.exchangeRate || null);
      }
      if (updates.destinationAmount !== undefined) {
        fields.push('destination_amount = ?');
        values.push(updates.destinationAmount || null);
      }
      if (updates.sourceCurrency !== undefined) {
        fields.push('source_currency = ?');
        values.push(updates.sourceCurrency || null);
      }
      if (updates.destinationCurrency !== undefined) {
        fields.push('destination_currency = ?');
        values.push(updates.destinationCurrency || null);
      }

      if (fields.length === 0) {
        return; // Nothing to update
      }

      values.push(id); // Add ID for WHERE clause

      // Update operation
      const sql = `UPDATE operations SET ${fields.join(', ')} WHERE id = ?`;
      await db.runAsync(sql, values);

      // Get updated operation
      const newOperation = await db.getFirstAsync(
        'SELECT * FROM operations WHERE id = ?',
        [id],
      );

      // Calculate balance changes (reverse old + apply new)
      const balanceChanges = new Map();

      // Reverse old operation
      const oldChanges = calculateBalanceChanges(oldOperation);
      for (const [accountId, delta] of oldChanges.entries()) {
        balanceChanges.set(accountId, (balanceChanges.get(accountId) || 0) - delta);
      }

      // Apply new operation
      const newChanges = calculateBalanceChanges(newOperation);
      for (const [accountId, delta] of newChanges.entries()) {
        balanceChanges.set(accountId, (balanceChanges.get(accountId) || 0) + delta);
      }

      // Update account balances within the same transaction
      const updateTime = new Date().toISOString();
      for (const [accountId, delta] of balanceChanges.entries()) {
        if (delta === 0) continue;

        // Get current balance
        const account = await db.getFirstAsync(
          'SELECT balance FROM accounts WHERE id = ?',
          [accountId],
        );

        if (!account) {
          console.warn(`Account ${accountId} not found, skipping balance update`);
          continue;
        }

        // Use Currency utilities for precise arithmetic
        const newBalance = Currency.add(account.balance, delta);

        // Update balance
        await db.runAsync(
          'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
          [newBalance, updateTime, accountId],
        );

        // Update today's balance history
        await updateTodayBalance(accountId, newBalance, db);
      }
    });
  } catch (error) {
    console.error('Failed to update operation:', error);
    throw error;
  }
};

/**
 * Delete an operation
 * @param {number} id
 * @returns {Promise<void>}
 */
export const deleteOperation = async (id) => {
  try {
    await executeTransaction(async (db) => {
      // Get operation before deletion
      const operation = await db.getFirstAsync(
        'SELECT * FROM operations WHERE id = ?',
        [id],
      );

      if (!operation) {
        throw new Error(`Operation ${id} not found`);
      }

      // Delete operation
      await db.runAsync('DELETE FROM operations WHERE id = ?', [id]);

      // Reverse balance changes
      const balanceChanges = calculateBalanceChanges(operation);
      const reverseChanges = new Map();
      for (const [accountId, delta] of balanceChanges.entries()) {
        reverseChanges.set(accountId, -delta);
      }

      // Update account balances within the same transaction
      const updateTime = new Date().toISOString();
      for (const [accountId, delta] of reverseChanges.entries()) {
        if (delta === 0) continue;

        // Get current balance
        const account = await db.getFirstAsync(
          'SELECT balance FROM accounts WHERE id = ?',
          [accountId],
        );

        if (!account) {
          console.warn(`Account ${accountId} not found, skipping balance update`);
          continue;
        }

        // Use Currency utilities for precise arithmetic
        const newBalance = Currency.add(account.balance, delta);

        // Update balance
        await db.runAsync(
          'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
          [newBalance, updateTime, accountId],
        );

        // Update today's balance history
        await updateTodayBalance(accountId, newBalance, db);
      }
    });
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
    const result = await queryFirst(
      `SELECT SUM(CAST(amount AS REAL)) as total
       FROM operations
       WHERE account_id = ? AND type = 'expense' AND date >= ? AND date <= ?`,
      [accountId, startDate, endDate],
    );
    return result && result.total ? parseFloat(result.total) : 0;
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
    const result = await queryFirst(
      `SELECT SUM(CAST(amount AS REAL)) as total
       FROM operations
       WHERE account_id = ? AND type = 'income' AND date >= ? AND date <= ?`,
      [accountId, startDate, endDate],
    );
    return result && result.total ? parseFloat(result.total) : 0;
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
    const results = await queryAll(
      `SELECT category_id, SUM(CAST(amount AS REAL)) as total
       FROM operations
       WHERE type = 'expense' AND date >= ? AND date <= ? AND category_id IS NOT NULL
       GROUP BY category_id
       ORDER BY total DESC`,
      [startDate, endDate],
    );
    return results || [];
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
    const results = await queryAll(
      `SELECT category_id, SUM(CAST(amount AS REAL)) as total
       FROM operations
       WHERE type = 'income' AND date >= ? AND date <= ? AND category_id IS NOT NULL
       GROUP BY category_id
       ORDER BY total DESC`,
      [startDate, endDate],
    );
    return results || [];
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
 * @param {string} [accountId] - Optional account ID to filter by specific account
 * @returns {Promise<Array>}
 */
export const getSpendingByCategoryAndCurrency = async (currency, startDate, endDate, accountId = null) => {
  try {
    let sql = `SELECT o.category_id, SUM(CAST(o.amount AS REAL)) as total
       FROM operations o
       JOIN accounts a ON o.account_id = a.id
       WHERE o.type = 'expense'
         AND a.currency = ?
         AND o.date >= ?
         AND o.date <= ?
         AND o.category_id IS NOT NULL`;

    const params = [currency, startDate, endDate];

    // Filter by specific account if provided
    if (accountId) {
      sql += ' AND o.account_id = ?';
      params.push(accountId);
    }

    sql += ' GROUP BY o.category_id ORDER BY total DESC';

    const results = await queryAll(sql, params);
    return results || [];
  } catch (error) {
    console.error('Failed to get spending by category and currency:', error);
    throw error;
  }
};

/**
 * Get income by category filtered by currency and date range
 * @param {string} currency - Currency code (e.g., 'USD', 'AMD')
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {Promise<Array>}
 */
export const getIncomeByCategoryAndCurrency = async (currency, startDate, endDate) => {
  try {
    const results = await queryAll(
      `SELECT o.category_id, SUM(CAST(o.amount AS REAL)) as total
       FROM operations o
       JOIN accounts a ON o.account_id = a.id
       WHERE o.type = 'income'
         AND a.currency = ?
         AND o.date >= ?
         AND o.date <= ?
         AND o.category_id IS NOT NULL
       GROUP BY o.category_id
       ORDER BY total DESC`,
      [currency, startDate, endDate],
    );
    return results || [];
  } catch (error) {
    console.error('Failed to get income by category and currency:', error);
    throw error;
  }
};

/**
 * Check if operation exists
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export const operationExists = async (id) => {
  try {
    const result = await queryFirst(
      'SELECT 1 FROM operations WHERE id = ? LIMIT 1',
      [id],
    );
    return !!result;
  } catch (error) {
    console.error('Failed to check operation existence:', error);
    throw error;
  }
};

/**
 * Get today's adjustment operation for an account
 * @param {string} accountId
 * @returns {Promise<Object|null>}
 */
export const getTodayAdjustmentOperation = async (accountId) => {
  try {
    // Get today's date in YYYY-MM-DD format (local timezone)
    const today = formatDate(new Date());

    // Look for adjustment operations (using shadow categories)
    const operation = await queryFirst(
      `SELECT o.* FROM operations o
       JOIN categories c ON o.category_id = c.id
       WHERE o.account_id = ?
         AND o.date = ?
         AND c.is_shadow = 1
       ORDER BY o.created_at DESC
       LIMIT 1`,
      [accountId, today],
    );

    return mapOperationFields(operation);
  } catch (error) {
    console.error('Failed to get today adjustment operation:', error);
    throw error;
  }
};

/**
 * Get distinct year/month combinations that have operations
 * @returns {Promise<Array<{year: number, month: number}>>}
 */
export const getAvailableMonths = async () => {
  try {
    const results = await queryAll(
      `SELECT DISTINCT
         CAST(strftime('%Y', date) AS INTEGER) as year,
         CAST(strftime('%m', date) AS INTEGER) as month
       FROM operations
       ORDER BY year DESC, month DESC`,
    );

    return (results || []).map(row => ({
      year: row.year,
      month: row.month - 1, // Convert to 0-based month (0-11) for JavaScript Date
    }));
  } catch (error) {
    console.error('Failed to get available months:', error);
    throw error;
  }
};

/**
 * Format date to local YYYY-MM-DD string
 * @param {Date} date
 * @returns {string}
 */
const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get operations for a specific week offset from today
 * Week 0 is the current week (last 7 days including today)
 * Week 1 is days 8-14 ago, week 2 is days 15-21 ago, etc.
 * @param {number} weekOffset - Number of weeks before current week (0 = current week)
 * @returns {Promise<Array>}
 */
export const getOperationsByWeekOffset = async (weekOffset) => {
  try {
    // Calculate date range for the week
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // For week 0: today to 6 days ago
    // For week 1: 7 days ago to 13 days ago
    // For week N: (N*7) days ago to (N*7+6) days ago
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - (weekOffset * 7));

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);

    const startDateStr = formatLocalDate(startDate);
    const endDateStr = formatLocalDate(endDate);

    console.log(`Loading week ${weekOffset}: ${startDateStr} to ${endDateStr}`);

    const operations = await queryAll(
      'SELECT * FROM operations WHERE date >= ? AND date <= ? ORDER BY date DESC, created_at DESC',
      [startDateStr, endDateStr],
    );

    console.log(`Week ${weekOffset} loaded: ${operations?.length || 0} operations`);

    return (operations || []).map(mapOperationFields);
  } catch (error) {
    console.error('Failed to get operations by week offset:', error);
    throw error;
  }
};

/**
 * Get the next oldest operation before a given date
 * @param {string} beforeDate - ISO date string (YYYY-MM-DD)
 * @returns {Promise<Object|null>}
 */
export const getNextOldestOperation = async (beforeDate) => {
  try {
    const operation = await queryFirst(
      'SELECT * FROM operations WHERE date < ? ORDER BY date DESC, created_at DESC LIMIT 1',
      [beforeDate],
    );
    return mapOperationFields(operation);
  } catch (error) {
    console.error('Failed to get next oldest operation:', error);
    throw error;
  }
};

/**
 * Get operations for a week starting from (and including) a specific date, going back 6 days
 * @param {string} endDate - ISO date string (YYYY-MM-DD) - the most recent date in the range
 * @returns {Promise<Array>}
 */
export const getOperationsByWeekFromDate = async (endDate) => {
  try {
    // Parse the end date
    const end = new Date(endDate + 'T00:00:00');

    // Calculate start date (6 days before end date)
    const start = new Date(end);
    start.setDate(start.getDate() - 6);

    const startDateStr = formatLocalDate(start);
    const endDateStr = formatLocalDate(end);

    console.log(`Loading week from ${startDateStr} to ${endDateStr}`);

    const operations = await queryAll(
      'SELECT * FROM operations WHERE date >= ? AND date <= ? ORDER BY date DESC, created_at DESC',
      [startDateStr, endDateStr],
    );

    console.log(`Week loaded: ${operations?.length || 0} operations`);

    return (operations || []).map(mapOperationFields);
  } catch (error) {
    console.error('Failed to get operations by week from date:', error);
    throw error;
  }
};

/**
 * Get filtered operations for a week starting from a specific date, going back 6 days
 * Applies multiple filter criteria while maintaining week-based pagination
 * @param {string} endDate - ISO date string (YYYY-MM-DD) - the most recent date in the range
 * @param {Object} filters - Filter criteria object
 * @param {string[]} filters.types - Array of operation types to include (['expense', 'income', 'transfer'])
 * @param {string[]} filters.accountIds - Array of account IDs to filter by
 * @param {string[]} filters.categoryIds - Array of category IDs to filter by
 * @param {string} filters.searchText - Text to search in description, amount, account names, category names
 * @param {Object} filters.dateRange - {startDate, endDate} for additional date filtering
 * @param {Object} filters.amountRange - {min, max} for amount filtering
 * @returns {Promise<Array>}
 */
export const getFilteredOperationsByWeekFromDate = async (endDate, filters = {}) => {
  try {
    // Calculate week bounds (6 days before endDate)
    const end = new Date(endDate + 'T00:00:00');
    const start = new Date(end);
    start.setDate(start.getDate() - 6);

    const startDateStr = formatLocalDate(start);
    const endDateStr = formatLocalDate(end);

    // Build dynamic SQL query
    let sql = `
      SELECT DISTINCT o.*
      FROM operations o
      LEFT JOIN accounts a ON o.account_id = a.id
      LEFT JOIN accounts to_a ON o.to_account_id = to_a.id
      LEFT JOIN categories c ON o.category_id = c.id
      WHERE o.date >= ? AND o.date <= ?
    `;

    const params = [startDateStr, endDateStr];

    // Apply type filters
    if (filters.types && filters.types.length > 0 && filters.types.length < 3) {
      const placeholders = filters.types.map(() => '?').join(',');
      sql += ` AND o.type IN (${placeholders})`;
      params.push(...filters.types);
    }

    // Apply account filters
    if (filters.accountIds && filters.accountIds.length > 0) {
      const placeholders = filters.accountIds.map(() => '?').join(',');
      sql += ` AND (o.account_id IN (${placeholders}) OR o.to_account_id IN (${placeholders}))`;
      params.push(...filters.accountIds, ...filters.accountIds);
    }

    // Apply category filters
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      const placeholders = filters.categoryIds.map(() => '?').join(',');
      sql += ` AND o.category_id IN (${placeholders})`;
      params.push(...filters.categoryIds);
    }

    // Apply amount range filters
    if (filters.amountRange) {
      if (filters.amountRange.min !== null && filters.amountRange.min !== undefined) {
        sql += ' AND CAST(o.amount AS REAL) >= ?';
        params.push(filters.amountRange.min);
      }
      if (filters.amountRange.max !== null && filters.amountRange.max !== undefined) {
        sql += ' AND CAST(o.amount AS REAL) <= ?';
        params.push(filters.amountRange.max);
      }
    }

    // Apply additional date range filters (independent of week range)
    if (filters.dateRange) {
      if (filters.dateRange.startDate) {
        sql += ' AND o.date >= ?';
        params.push(filters.dateRange.startDate);
      }
      if (filters.dateRange.endDate) {
        sql += ' AND o.date <= ?';
        params.push(filters.dateRange.endDate);
      }
    }

    // Apply search text filter (searches across multiple fields)
    if (filters.searchText && filters.searchText.trim()) {
      const searchTerm = `%${filters.searchText.trim()}%`;
      sql += ` AND (
        o.description LIKE ? COLLATE NOCASE
        OR o.amount LIKE ?
        OR a.name LIKE ? COLLATE NOCASE
        OR to_a.name LIKE ? COLLATE NOCASE
        OR c.name LIKE ? COLLATE NOCASE
      )`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY o.date DESC, o.created_at DESC';

    console.log(`Loading filtered week from ${startDateStr} to ${endDateStr}`, filters);

    const operations = await queryAll(sql, params);

    console.log(`Filtered week loaded: ${operations?.length || 0} operations`);

    return (operations || []).map(mapOperationFields);
  } catch (error) {
    console.error('Failed to get filtered operations by week from date:', error);
    throw error;
  }
};

/**
 * Get the next oldest operation before a given date that matches filters
 * @param {string} beforeDate - ISO date string (YYYY-MM-DD)
 * @param {Object} filters - Same filter object as getFilteredOperationsByWeekFromDate
 * @returns {Promise<Object|null>}
 */
export const getNextOldestFilteredOperation = async (beforeDate, filters = {}) => {
  try {
    // Build dynamic SQL query similar to getFilteredOperationsByWeekFromDate
    let sql = `
      SELECT DISTINCT o.*
      FROM operations o
      LEFT JOIN accounts a ON o.account_id = a.id
      LEFT JOIN accounts to_a ON o.to_account_id = to_a.id
      LEFT JOIN categories c ON o.category_id = c.id
      WHERE o.date < ?
    `;

    const params = [beforeDate];

    // Apply type filters
    if (filters.types && filters.types.length > 0 && filters.types.length < 3) {
      const placeholders = filters.types.map(() => '?').join(',');
      sql += ` AND o.type IN (${placeholders})`;
      params.push(...filters.types);
    }

    // Apply account filters
    if (filters.accountIds && filters.accountIds.length > 0) {
      const placeholders = filters.accountIds.map(() => '?').join(',');
      sql += ` AND (o.account_id IN (${placeholders}) OR o.to_account_id IN (${placeholders}))`;
      params.push(...filters.accountIds, ...filters.accountIds);
    }

    // Apply category filters
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      const placeholders = filters.categoryIds.map(() => '?').join(',');
      sql += ` AND o.category_id IN (${placeholders})`;
      params.push(...filters.categoryIds);
    }

    // Apply amount range filters
    if (filters.amountRange) {
      if (filters.amountRange.min !== null && filters.amountRange.min !== undefined) {
        sql += ' AND CAST(o.amount AS REAL) >= ?';
        params.push(filters.amountRange.min);
      }
      if (filters.amountRange.max !== null && filters.amountRange.max !== undefined) {
        sql += ' AND CAST(o.amount AS REAL) <= ?';
        params.push(filters.amountRange.max);
      }
    }

    // Apply date range filters
    if (filters.dateRange) {
      if (filters.dateRange.startDate) {
        sql += ' AND o.date >= ?';
        params.push(filters.dateRange.startDate);
      }
      if (filters.dateRange.endDate) {
        sql += ' AND o.date <= ?';
        params.push(filters.dateRange.endDate);
      }
    }

    // Apply search text filter
    if (filters.searchText && filters.searchText.trim()) {
      const searchTerm = `%${filters.searchText.trim()}%`;
      sql += ` AND (
        o.description LIKE ? COLLATE NOCASE
        OR o.amount LIKE ?
        OR a.name LIKE ? COLLATE NOCASE
        OR to_a.name LIKE ? COLLATE NOCASE
        OR c.name LIKE ? COLLATE NOCASE
      )`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY o.date DESC, o.created_at DESC LIMIT 1';

    const operation = await queryFirst(sql, params);
    return mapOperationFields(operation);
  } catch (error) {
    console.error('Failed to get next oldest filtered operation:', error);
    throw error;
  }
};

/**
 * Get filtered operations for a specific week offset from today
 * @param {number} weekOffset - Week offset (0 = current week)
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Array>}
 */
export const getFilteredOperationsByWeekOffset = async (weekOffset, filters = {}) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - (weekOffset * 7));

    const endDateStr = formatLocalDate(endDate);

    return await getFilteredOperationsByWeekFromDate(endDateStr, filters);
  } catch (error) {
    console.error('Failed to get filtered operations by week offset:', error);
    throw error;
  }
};

/**
 * Get the next newest operation after a given date
 * @param {string} afterDate - ISO date string (YYYY-MM-DD)
 * @returns {Promise<Object|null>}
 */
export const getNextNewestOperation = async (afterDate) => {
  try {
    const operation = await queryFirst(
      'SELECT * FROM operations WHERE date > ? ORDER BY date ASC, created_at ASC LIMIT 1',
      [afterDate],
    );
    return mapOperationFields(operation);
  } catch (error) {
    console.error('Failed to get next newest operation:', error);
    throw error;
  }
};

/**
 * Get operations for a week ending at (and including) a specific date, going forward 6 days
 * @param {string} startDate - ISO date string (YYYY-MM-DD) - the oldest date in the range
 * @returns {Promise<Array>}
 */
export const getOperationsByWeekToDate = async (startDate) => {
  try {
    // Parse the start date
    const start = new Date(startDate + 'T00:00:00');

    // Calculate end date (6 days after start date)
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const startDateStr = formatLocalDate(start);
    const endDateStr = formatLocalDate(end);

    console.log(`Loading week from ${startDateStr} to ${endDateStr}`);

    const operations = await queryAll(
      'SELECT * FROM operations WHERE date >= ? AND date <= ? ORDER BY date DESC, created_at DESC',
      [startDateStr, endDateStr],
    );

    console.log(`Week loaded: ${operations?.length || 0} operations`);

    return (operations || []).map(mapOperationFields);
  } catch (error) {
    console.error('Failed to get operations by week to date:', error);
    throw error;
  }
};

/**
 * Get the next newest operation after a given date that matches filters
 * @param {string} afterDate - ISO date string (YYYY-MM-DD)
 * @param {Object} filters - Same filter object as getFilteredOperationsByWeekFromDate
 * @returns {Promise<Object|null>}
 */
export const getNextNewestFilteredOperation = async (afterDate, filters = {}) => {
  try {
    // Build dynamic SQL query similar to getNextOldestFilteredOperation
    let sql = `
      SELECT DISTINCT o.*
      FROM operations o
      LEFT JOIN accounts a ON o.account_id = a.id
      LEFT JOIN accounts to_a ON o.to_account_id = to_a.id
      LEFT JOIN categories c ON o.category_id = c.id
      WHERE o.date > ?
    `;

    const params = [afterDate];

    // Apply type filters
    if (filters.types && filters.types.length > 0 && filters.types.length < 3) {
      const placeholders = filters.types.map(() => '?').join(',');
      sql += ` AND o.type IN (${placeholders})`;
      params.push(...filters.types);
    }

    // Apply account filters
    if (filters.accountIds && filters.accountIds.length > 0) {
      const placeholders = filters.accountIds.map(() => '?').join(',');
      sql += ` AND (o.account_id IN (${placeholders}) OR o.to_account_id IN (${placeholders}))`;
      params.push(...filters.accountIds, ...filters.accountIds);
    }

    // Apply category filters
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      const placeholders = filters.categoryIds.map(() => '?').join(',');
      sql += ` AND o.category_id IN (${placeholders})`;
      params.push(...filters.categoryIds);
    }

    // Apply amount range filters
    if (filters.amountRange) {
      if (filters.amountRange.min !== null && filters.amountRange.min !== undefined) {
        sql += ' AND CAST(o.amount AS REAL) >= ?';
        params.push(filters.amountRange.min);
      }
      if (filters.amountRange.max !== null && filters.amountRange.max !== undefined) {
        sql += ' AND CAST(o.amount AS REAL) <= ?';
        params.push(filters.amountRange.max);
      }
    }

    // Apply date range filters
    if (filters.dateRange) {
      if (filters.dateRange.startDate) {
        sql += ' AND o.date >= ?';
        params.push(filters.dateRange.startDate);
      }
      if (filters.dateRange.endDate) {
        sql += ' AND o.date <= ?';
        params.push(filters.dateRange.endDate);
      }
    }

    // Apply search text filter
    if (filters.searchText && filters.searchText.trim()) {
      const searchTerm = `%${filters.searchText.trim()}%`;
      sql += ` AND (
        o.description LIKE ? COLLATE NOCASE
        OR o.amount LIKE ?
        OR a.name LIKE ? COLLATE NOCASE
        OR to_a.name LIKE ? COLLATE NOCASE
        OR c.name LIKE ? COLLATE NOCASE
      )`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY o.date ASC, o.created_at ASC LIMIT 1';

    const operation = await queryFirst(sql, params);
    return mapOperationFields(operation);
  } catch (error) {
    console.error('Failed to get next newest filtered operation:', error);
    throw error;
  }
};

/**
 * Get filtered operations for a week ending at a specific date, going forward 6 days
 * Applies multiple filter criteria while maintaining week-based pagination
 * @param {string} startDate - ISO date string (YYYY-MM-DD) - the oldest date in the range
 * @param {Object} filters - Filter criteria object
 * @param {string[]} filters.types - Array of operation types to include (['expense', 'income', 'transfer'])
 * @param {string[]} filters.accountIds - Array of account IDs to filter by
 * @param {string[]} filters.categoryIds - Array of category IDs to filter by
 * @param {string} filters.searchText - Text to search in description, amount, account names, category names
 * @param {Object} filters.dateRange - {startDate, endDate} for additional date filtering
 * @param {Object} filters.amountRange - {min, max} for amount filtering
 * @returns {Promise<Array>}
 */
export const getFilteredOperationsByWeekToDate = async (startDate, filters = {}) => {
  try {
    // Parse the start date
    const start = new Date(startDate + 'T00:00:00');

    // Calculate end date (6 days after start date)
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const startDateStr = formatLocalDate(start);
    const endDateStr = formatLocalDate(end);

    // Build dynamic SQL query
    let sql = `
      SELECT DISTINCT o.*
      FROM operations o
      LEFT JOIN accounts a ON o.account_id = a.id
      LEFT JOIN accounts to_a ON o.to_account_id = to_a.id
      LEFT JOIN categories c ON o.category_id = c.id
      WHERE o.date >= ? AND o.date <= ?
    `;

    const params = [startDateStr, endDateStr];

    // Apply type filters
    if (filters.types && filters.types.length > 0 && filters.types.length < 3) {
      const placeholders = filters.types.map(() => '?').join(',');
      sql += ` AND o.type IN (${placeholders})`;
      params.push(...filters.types);
    }

    // Apply account filters
    if (filters.accountIds && filters.accountIds.length > 0) {
      const placeholders = filters.accountIds.map(() => '?').join(',');
      sql += ` AND (o.account_id IN (${placeholders}) OR o.to_account_id IN (${placeholders}))`;
      params.push(...filters.accountIds, ...filters.accountIds);
    }

    // Apply category filters
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      const placeholders = filters.categoryIds.map(() => '?').join(',');
      sql += ` AND o.category_id IN (${placeholders})`;
      params.push(...filters.categoryIds);
    }

    // Apply amount range filters
    if (filters.amountRange) {
      if (filters.amountRange.min !== null && filters.amountRange.min !== undefined) {
        sql += ' AND CAST(o.amount AS REAL) >= ?';
        params.push(filters.amountRange.min);
      }
      if (filters.amountRange.max !== null && filters.amountRange.max !== undefined) {
        sql += ' AND CAST(o.amount AS REAL) <= ?';
        params.push(filters.amountRange.max);
      }
    }

    // Apply date range filters (additional constraints on top of week range)
    if (filters.dateRange) {
      if (filters.dateRange.startDate) {
        sql += ' AND o.date >= ?';
        params.push(filters.dateRange.startDate);
      }
      if (filters.dateRange.endDate) {
        sql += ' AND o.date <= ?';
        params.push(filters.dateRange.endDate);
      }
    }

    // Apply search text filter
    if (filters.searchText && filters.searchText.trim()) {
      const searchTerm = `%${filters.searchText.trim()}%`;
      sql += ` AND (
        o.description LIKE ? COLLATE NOCASE
        OR o.amount LIKE ?
        OR a.name LIKE ? COLLATE NOCASE
        OR to_a.name LIKE ? COLLATE NOCASE
        OR c.name LIKE ? COLLATE NOCASE
      )`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY o.date DESC, o.created_at DESC';

    console.log(`Loading filtered week from ${startDateStr} to ${endDateStr}`, filters);

    const operations = await queryAll(sql, params);

    console.log(`Filtered week loaded: ${operations?.length || 0} operations`);

    return (operations || []).map(mapOperationFields);
  } catch (error) {
    console.error('Failed to get filtered operations by week to date:', error);
    throw error;
  }
};

/**
 * Get monthly spending totals for specified categories within a year
 * Groups expenses by month (1-12) for the given category IDs
 * @param {string} currency - Currency code (e.g., 'USD', 'AMD')
 * @param {number} year - Year to query (e.g., 2024)
 * @param {string[]} categoryIds - Array of category IDs to include
 * @returns {Promise<Array<{month: number, total: number}>>} Monthly totals (month is 1-12)
 */
export const getMonthlySpendingByCategories = async (currency, year, categoryIds) => {
  try {
    if (!categoryIds || categoryIds.length === 0) {
      return [];
    }

    const placeholders = categoryIds.map(() => '?').join(',');
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const results = await queryAll(
      `SELECT
         CAST(strftime('%m', o.date) AS INTEGER) as month,
         SUM(CAST(o.amount AS REAL)) as total
       FROM operations o
       JOIN accounts a ON o.account_id = a.id
       WHERE o.type = 'expense'
         AND a.currency = ?
         AND o.date >= ?
         AND o.date <= ?
         AND o.category_id IN (${placeholders})
       GROUP BY strftime('%m', o.date)
       ORDER BY month ASC`,
      [currency, startDate, endDate, ...categoryIds],
    );

    return (results || []).map(row => ({
      month: row.month,
      total: parseFloat(row.total) || 0,
    }));
  } catch (error) {
    console.error('Failed to get monthly spending by categories:', error);
    throw error;
  }
};

/**
 * Get spending by categories for the last 12 months (rolling)
 * @param {string} currency - Currency code
 * @param {Array<string>} categoryIds - Category IDs to include
 * @returns {Promise<Array<{yearMonth: string, total: number}>>} Array of {yearMonth: 'YYYY-MM', total}
 */
export const getLast12MonthsSpendingByCategories = async (currency, categoryIds) => {
  try {
    if (!categoryIds || categoryIds.length === 0) {
      return [];
    }

    const placeholders = categoryIds.map(() => '?').join(',');

    // Calculate date 12 months ago from today
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`;
    const endDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;

    const results = await queryAll(
      `SELECT
         strftime('%Y-%m', o.date) as year_month,
         SUM(CAST(o.amount AS REAL)) as total
       FROM operations o
       JOIN accounts a ON o.account_id = a.id
       WHERE o.type = 'expense'
         AND a.currency = ?
         AND o.date >= ?
         AND o.date <= ?
         AND o.category_id IN (${placeholders})
       GROUP BY strftime('%Y-%m', o.date)
       ORDER BY year_month ASC`,
      [currency, startDateStr, endDateStr, ...categoryIds],
    );

    return (results || []).map(row => ({
      yearMonth: row.year_month,
      total: parseFloat(row.total) || 0,
    }));
  } catch (error) {
    console.error('Failed to get last 12 months spending by categories:', error);
    throw error;
  }
};

/**
 * Get top N most frequently used categories per type from the last 3 months.
 * Returns top categories for both expense and income types, ensuring
 * each type is represented independently.
 * @param {number} limitPerType - Number of top categories per type (default: 3)
 * @returns {Promise<Array<{categoryId: string, count: number}>>} Array of category IDs with usage count
 */
export const getTopTransferTargetAccounts = async (limit = 3) => {
  try {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);

    const startDateStr = formatLocalDate(ninetyDaysAgo);
    const endDateStr = formatLocalDate(now);

    const results = await queryAll(
      `SELECT to_account_id, COUNT(*) as count
       FROM operations
       WHERE date >= ? AND date <= ?
         AND type = 'transfer'
         AND to_account_id IS NOT NULL
       GROUP BY to_account_id
       ORDER BY count DESC
       LIMIT ?`,
      [startDateStr, endDateStr, limit],
    );

    return (results || []).map(row => ({
      accountId: row.to_account_id,
      count: row.count,
    }));
  } catch (error) {
    console.error('Failed to get top transfer target accounts:', error);
    throw error;
  }
};

export const getTopCategoriesFromLastMonth = async (limitPerType = 3) => {
  try {
    // Calculate date range for last 90 days (includes today)
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);

    const startDateStr = formatLocalDate(ninetyDaysAgo);
    const endDateStr = formatLocalDate(now);

    // Fetch top categories per type using UNION ALL so both expense and
    // income categories are represented independently
    const results = await queryAll(
      `SELECT category_id, count FROM (
         SELECT category_id, COUNT(*) as count
         FROM operations
         WHERE date >= ? AND date <= ?
           AND category_id IS NOT NULL AND type = 'expense'
         GROUP BY category_id
         ORDER BY count DESC
         LIMIT ?
       )
       UNION ALL
       SELECT category_id, count FROM (
         SELECT category_id, COUNT(*) as count
         FROM operations
         WHERE date >= ? AND date <= ?
           AND category_id IS NOT NULL AND type = 'income'
         GROUP BY category_id
         ORDER BY count DESC
         LIMIT ?
       )`,
      [startDateStr, endDateStr, limitPerType, startDateStr, endDateStr, limitPerType],
    );

    return (results || []).map(row => ({
      categoryId: row.category_id,
      count: row.count,
    }));
  } catch (error) {
    console.error('Failed to get top categories from last month:', error);
    throw error;
  }
};
