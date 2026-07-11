import { executeQuery, queryAll, queryFirst, executeTransaction, isSearchNormAvailable } from './db';
import { normalizeSearchText, buildSearchNormSql } from './searchNormalize';
import { parseLabels, isHiddenLabel } from '../utils/labelUtils';

// Build the SQL expression that normalizes a searchable column. When the
// SEARCH_NORM custom function registered (full Cyrillic case-folding + ё/е
// equivalence) use it; otherwise fall back to an inline LOWER()+REPLACE()
// expression that still folds the Russian Cyrillic alphabet and ё/е. (expo-sqlite
// exposes no custom-function API today, so the fallback is what runs on device —
// see db.js.) Both halves of the LIKE comparison must use the same alphabet, so
// the query side is always normalized with normalizeSearchText().
const searchNormExpr = (columnExpr) =>
  isSearchNormAvailable() ? `SEARCH_NORM(${columnExpr})` : buildSearchNormSql(columnExpr);
const normalizeSearchQuery = (text) => normalizeSearchText(text);
import * as Currency from './currency';
import { formatDate, updateTodayBalance } from './BalanceHistoryDB';
import * as AccountsDB from './AccountsDB';
import getDefaultOperations from '../defaults/defaultOperations';

// Operation types currently supported. Used as the upper bound for the
// "all types selected → no type filter" optimization.
const OPERATION_TYPES = ['expense', 'income', 'transfer'];
const VALID_OPERATION_TYPES = new Set(OPERATION_TYPES);

/**
 * Map database field names to camelCase for application use.
 * Returns null for rows with an invalid type so callers can filter them out.
 * @param {Object} dbOperation - Operation object from database with snake_case fields
 * @returns {Object|null} Operation object with camelCase fields, or null if type is invalid
 */
const mapOperationFields = (dbOperation) => {
  if (!dbOperation) return null;

  if (!VALID_OPERATION_TYPES.has(dbOperation.type)) {
    console.warn(`[OperationsDB] Dropping operation id=${dbOperation.id} with invalid type: "${dbOperation.type}"`);
    return null;
  }

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
    latitude: dbOperation.latitude,
    longitude: dbOperation.longitude,
    // Exposed as a boolean for the form/toggle. Stored as 0/1 (nullable) — the
    // integer column coerces any legacy string value, so !! is safe here.
    excludeFromAvg: !!dbOperation.exclude_from_avg,
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
    return (operations || []).map(mapOperationFields).filter(Boolean);
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
      console.debug('[OperationsDB] No accounts found, skipping default operations initialization');
      return;
    }

    // Find visible accounts (hidden === 0)
    const visibleAccounts = accounts.filter(acc => acc.hidden === 0);

    if (visibleAccounts.length === 0) {
      console.warn('[OperationsDB] No visible accounts found, using first available account');
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
      console.debug(`[OperationsDB] Created default operation: ${op.type}`);
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
    return (operations || []).map(mapOperationFields).filter(Boolean);
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
    return (operations || []).map(mapOperationFields).filter(Boolean);
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
    return (operations || []).map(mapOperationFields).filter(Boolean);
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
      LEFT JOIN categories pc ON c.parent_id = pc.id
      WHERE o.date >= ? AND o.date <= ?
    `;

    const params = [startDate, endDate];

    // Apply type filters
    if (filters.types && filters.types.length > 0 && filters.types.length < OPERATION_TYPES.length) {
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
      const searchLower = `%${normalizeSearchQuery(filters.searchText.trim())}%`;
      sql += ` AND (
        ${searchNormExpr('o.description')} LIKE ?
        OR o.amount LIKE ?
        OR ${searchNormExpr('a.name')} LIKE ?
        OR ${searchNormExpr('to_a.name')} LIKE ?
        OR ${searchNormExpr('c.name')} LIKE ?
        OR ${searchNormExpr('pc.name')} LIKE ?
      )`;
      params.push(searchLower, searchLower, searchLower, searchLower, searchLower, searchLower);
    }

    sql += ' ORDER BY o.date DESC, o.created_at DESC';

    console.debug(`Loading filtered operations from ${startDate} to ${endDate}`);

    const operations = await queryAll(sql, params);

    console.debug(`Filtered operations loaded: ${operations?.length || 0} operations`);

    return (operations || []).map(mapOperationFields).filter(Boolean);
  } catch (error) {
    console.error('Failed to get filtered operations by date range:', error);
    throw error;
  }
};

/**
 * Get all operations matching the given filters across all dates (no date-window limit).
 * Used for text search so results are not confined to a 7-day window.
 * @param {Object} filters - Filter object with types, accountIds, categoryIds, searchText, dateRange, amountRange
 * @returns {Promise<Array>}
 */
export const getFilteredOperationsAllDates = async (filters = {}) => {
  try {
    let sql = `
      SELECT DISTINCT o.*
      FROM operations o
      LEFT JOIN accounts a ON o.account_id = a.id
      LEFT JOIN accounts to_a ON o.to_account_id = to_a.id
      LEFT JOIN categories c ON o.category_id = c.id
      LEFT JOIN categories pc ON c.parent_id = pc.id
      WHERE 1=1
    `;

    const params = [];

    if (filters.types && filters.types.length > 0 && filters.types.length < OPERATION_TYPES.length) {
      const placeholders = filters.types.map(() => '?').join(',');
      sql += ` AND o.type IN (${placeholders})`;
      params.push(...filters.types);
    }

    if (filters.accountIds && filters.accountIds.length > 0) {
      const placeholders = filters.accountIds.map(() => '?').join(',');
      sql += ` AND (o.account_id IN (${placeholders}) OR o.to_account_id IN (${placeholders}))`;
      params.push(...filters.accountIds, ...filters.accountIds);
    }

    if (filters.categoryIds && filters.categoryIds.length > 0) {
      const placeholders = filters.categoryIds.map(() => '?').join(',');
      sql += ` AND o.category_id IN (${placeholders})`;
      params.push(...filters.categoryIds);
    }

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

    if (filters.searchText && filters.searchText.trim()) {
      const searchLower = `%${normalizeSearchQuery(filters.searchText.trim())}%`;
      sql += ` AND (
        ${searchNormExpr('o.description')} LIKE ?
        OR o.amount LIKE ?
        OR ${searchNormExpr('a.name')} LIKE ?
        OR ${searchNormExpr('to_a.name')} LIKE ?
        OR ${searchNormExpr('c.name')} LIKE ?
        OR ${searchNormExpr('pc.name')} LIKE ?
      )`;
      params.push(searchLower, searchLower, searchLower, searchLower, searchLower, searchLower);
    }

    sql += ' ORDER BY o.date DESC, o.created_at DESC';

    const operations = await queryAll(sql, params);
    return (operations || []).map(mapOperationFields).filter(Boolean);
  } catch (error) {
    console.error('Failed to get filtered operations (all dates):', error);
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
    return (operations || []).map(mapOperationFields).filter(Boolean);
  } catch (error) {
    console.error('Failed to get operations by type:', error);
    throw error;
  }
};

/**
 * Calculate balance changes for an operation
 * Handles multi-currency transfers by using destination_amount when available.
 * When destination_amount is null on a transfer, queries account currencies to
 * detect cross-currency transfers and recomputes the amount via exchange_rate.
 * @param {Object} operation
 * @param {Object} db - Transaction-scoped database instance
 * @returns {Promise<Map<string, string>>} Map of accountId → string delta (Decimal-safe)
 */
const calculateBalanceChanges = async (operation, db) => {
  const balanceChanges = new Map();
  const amount = String(operation.amount || '0');

  if (operation.type === 'expense') {
    balanceChanges.set(operation.account_id, Currency.subtract('0', amount));
  } else if (operation.type === 'income') {
    balanceChanges.set(operation.account_id, amount);
  } else if (operation.type === 'transfer') {
    balanceChanges.set(operation.account_id, Currency.subtract('0', amount));

    if (operation.to_account_id) {
      let destinationAmount;
      if (operation.destination_amount) {
        destinationAmount = String(operation.destination_amount);
      } else {
        // Query account currencies to detect cross-currency transfers where
        // destination_amount was lost (old schema, import, or UI bug).
        const fromAcc = await db.getFirstAsync(
          'SELECT currency FROM accounts WHERE id = ?',
          [operation.account_id],
        );
        const toAcc = await db.getFirstAsync(
          'SELECT currency FROM accounts WHERE id = ?',
          [operation.to_account_id],
        );
        const fromCurrency = fromAcc?.currency;
        const toCurrency = toAcc?.currency;

        if (fromCurrency && toCurrency && fromCurrency !== toCurrency) {
          if (!operation.exchange_rate) {
            throw new Error(
              `Multi-currency transfer ${operation.id} is missing destination_amount and exchange_rate`,
            );
          }
          const converted = Currency.convertAmount(amount, fromCurrency, toCurrency, operation.exchange_rate);
          if (!converted) {
            throw new Error(
              `Failed to convert transfer ${operation.id} amount from ${fromCurrency} to ${toCurrency}`,
            );
          }
          destinationAmount = converted;
        } else {
          destinationAmount = amount;
        }
      }

      const toChange = balanceChanges.get(operation.to_account_id) || '0';
      balanceChanges.set(operation.to_account_id, Currency.add(toChange, destinationAmount));
    }
  }

  return balanceChanges;
};

/**
 * Insert a new operation and update account balances within an existing transaction.
 * Callers that need to combine this work with other SQL (e.g. marking a planned
 * operation as executed) should call this inside their own executeTransaction so
 * all writes are committed or rolled back together.
 *
 * @param {Object} db - The transaction-scoped database instance
 * @param {Object} operation - Operation data (camelCase, same shape as createOperation)
 * @returns {Promise<Object>} Created operation data with snake_case fields and auto-generated id
 */
export const createOperationInTx = async (db, operation) => {
  if (!OPERATION_TYPES.includes(operation.type)) {
    throw new Error(`Invalid operation type: "${operation.type}". Must be one of: ${OPERATION_TYPES.join(', ')}`);
  }

  const now = new Date().toISOString();

  const extractId = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'object' && value !== null && value.id !== undefined) return value.id;
    return value;
  };

  const operationData = {
    type: operation.type,
    amount: operation.amount,
    account_id: extractId(operation.accountId),
    category_id: extractId(operation.categoryId),
    to_account_id: extractId(operation.toAccountId),
    date: operation.date,
    created_at: now,
    description: operation.description || null,
    exchange_rate: operation.exchangeRate || null,
    destination_amount: operation.destinationAmount || null,
    source_currency: operation.sourceCurrency || null,
    destination_currency: operation.destinationCurrency || null,
    // 1 when the operation is excluded from the spending average / burndown
    // forecast; 0 (counted) by default. Listed before latitude/longitude so those
    // stay the last two columns/params.
    exclude_from_avg: operation.excludeFromAvg ? 1 : 0,
    // ?? (not ||) so a valid 0.0 coordinate (equator / prime meridian) survives.
    latitude: operation.latitude ?? null,
    longitude: operation.longitude ?? null,
  };

  const result = await db.runAsync(
    'INSERT INTO operations (type, amount, account_id, category_id, to_account_id, date, created_at, description, exchange_rate, destination_amount, source_currency, destination_currency, exclude_from_avg, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      operationData.type, operationData.amount, operationData.account_id,
      operationData.category_id, operationData.to_account_id, operationData.date,
      operationData.created_at, operationData.description, operationData.exchange_rate,
      operationData.destination_amount, operationData.source_currency, operationData.destination_currency,
      operationData.exclude_from_avg, operationData.latitude, operationData.longitude,
    ],
  );

  operationData.id = result.lastInsertRowId;

  const balanceChanges = await calculateBalanceChanges(operationData, db);
  const updateTime = new Date().toISOString();

  for (const [accountId, delta] of balanceChanges.entries()) {
    if (Currency.isZero(delta)) continue;

    const account = await db.getFirstAsync('SELECT balance FROM accounts WHERE id = ?', [accountId]);

    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    const newBalance = Currency.add(account.balance, delta);

    await db.runAsync(
      'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
      [newBalance, updateTime, accountId],
    );

    await updateTodayBalance(accountId, newBalance, db);
  }

  return operationData;
};

/**
 * Create a new operation
 * @param {Object} operation - Operation data (ID will be auto-generated)
 * @returns {Promise<Object>}
 */
export const createOperation = async (operation) => {
  try {
    if (!OPERATION_TYPES.includes(operation.type)) {
      throw new Error(`Invalid operation type: "${operation.type}". Must be one of: ${OPERATION_TYPES.join(', ')}`);
    }
    let operationData;
    await executeTransaction(async (db) => {
      operationData = await createOperationInTx(db, operation);
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
        if (!OPERATION_TYPES.includes(updates.type)) {
          throw new Error(`Invalid operation type: "${updates.type}". Must be one of: ${OPERATION_TYPES.join(', ')}`);
        }
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
      if (updates.latitude !== undefined) {
        fields.push('latitude = ?');
        values.push(updates.latitude ?? null); // ?? keeps a valid 0.0 coordinate
      }
      if (updates.longitude !== undefined) {
        fields.push('longitude = ?');
        values.push(updates.longitude ?? null);
      }
      if (updates.excludeFromAvg !== undefined) {
        fields.push('exclude_from_avg = ?');
        values.push(updates.excludeFromAvg ? 1 : 0);
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
      const oldChanges = await calculateBalanceChanges(oldOperation, db);
      for (const [accountId, delta] of oldChanges.entries()) {
        balanceChanges.set(accountId, Currency.subtract(balanceChanges.get(accountId) || '0', delta));
      }

      // Apply new operation — track which accounts the new operation requires
      const newChanges = await calculateBalanceChanges(newOperation, db);
      const newOperationAccountIds = new Set(newChanges.keys());
      for (const [accountId, delta] of newChanges.entries()) {
        balanceChanges.set(accountId, Currency.add(balanceChanges.get(accountId) || '0', delta));
      }

      // Update account balances within the same transaction
      const updateTime = new Date().toISOString();
      for (const [accountId, delta] of balanceChanges.entries()) {
        if (Currency.isZero(delta)) continue;

        // Get current balance
        const account = await db.getFirstAsync(
          'SELECT balance FROM accounts WHERE id = ?',
          [accountId],
        );

        if (!account) {
          if (newOperationAccountIds.has(accountId)) {
            // Account required by the new operation is missing — the operation
            // record was already updated above, so we must abort the entire
            // transaction to prevent corrupted balance state (#745).
            throw new Error(
              `Account ${accountId} not found. Cannot update operation ${id}: the account was deleted. Rolling back.`,
            );
          }
          // Account was only referenced by the old operation and has since been
          // deleted — its balance is already gone so skipping is safe.
          console.warn(`Account ${accountId} not found (old operation only), skipping balance update`);
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
 * Atomically reduce the original operation's amount and insert a new sibling
 * operation for the split portion. Both the UPDATE and INSERT run inside a
 * single executeTransaction so a partial failure cannot corrupt the database.
 *
 * @param {number} id - ID of the operation to reduce
 * @param {Object} updates - Fields to apply to the original (camelCase, same shape as updateOperation)
 * @param {Object} newOperationData - Data for the new split sibling (camelCase, same shape as createOperation)
 * @returns {Promise<Object>} The newly created split operation
 */
export const splitOperation = async (id, updates, newOperationData) => {
  try {
    const now = new Date().toISOString();

    const extractId = (value) => {
      if (value === null || value === undefined || value === '') return null;
      if (typeof value === 'object' && value.id !== undefined) return value.id;
      return value;
    };

    let createdOperation;

    await executeTransaction(async (db) => {
      // Step 1: fetch old operation for balance reversal
      const oldOperation = await db.getFirstAsync(
        'SELECT * FROM operations WHERE id = ?',
        [id],
      );

      if (!oldOperation) {
        throw new Error(`Operation ${id} not found`);
      }

      // Step 2: apply updates to original operation
      const fields = [];
      const vals = [];

      if (updates.type !== undefined) { fields.push('type = ?'); vals.push(updates.type); }
      if (updates.amount !== undefined) { fields.push('amount = ?'); vals.push(updates.amount); }
      if (updates.accountId !== undefined) { fields.push('account_id = ?'); vals.push(extractId(updates.accountId)); }
      if (updates.categoryId !== undefined) { fields.push('category_id = ?'); vals.push(extractId(updates.categoryId)); }
      if (updates.toAccountId !== undefined) { fields.push('to_account_id = ?'); vals.push(extractId(updates.toAccountId)); }
      if (updates.date !== undefined) { fields.push('date = ?'); vals.push(updates.date); }
      if (updates.description !== undefined) { fields.push('description = ?'); vals.push(updates.description || null); }
      if (updates.exchangeRate !== undefined) { fields.push('exchange_rate = ?'); vals.push(updates.exchangeRate || null); }
      if (updates.destinationAmount !== undefined) { fields.push('destination_amount = ?'); vals.push(updates.destinationAmount || null); }
      if (updates.sourceCurrency !== undefined) { fields.push('source_currency = ?'); vals.push(updates.sourceCurrency || null); }
      if (updates.destinationCurrency !== undefined) { fields.push('destination_currency = ?'); vals.push(updates.destinationCurrency || null); }
      if (updates.latitude !== undefined) { fields.push('latitude = ?'); vals.push(updates.latitude ?? null); }
      if (updates.longitude !== undefined) { fields.push('longitude = ?'); vals.push(updates.longitude ?? null); }

      if (fields.length > 0) {
        vals.push(id);
        await db.runAsync(`UPDATE operations SET ${fields.join(', ')} WHERE id = ?`, vals);
      }

      const updatedOperation = await db.getFirstAsync(
        'SELECT * FROM operations WHERE id = ?',
        [id],
      );

      // Step 3: insert new (split) operation. The sibling inherits the parent's
      // coordinates (same place) unless the caller explicitly supplies its own.
      const newRow = {
        type: newOperationData.type,
        amount: newOperationData.amount,
        account_id: extractId(newOperationData.accountId),
        category_id: extractId(newOperationData.categoryId),
        to_account_id: extractId(newOperationData.toAccountId) || null,
        date: newOperationData.date,
        created_at: now,
        description: newOperationData.description || null,
        exchange_rate: newOperationData.exchangeRate || null,
        destination_amount: newOperationData.destinationAmount || null,
        source_currency: newOperationData.sourceCurrency || null,
        destination_currency: newOperationData.destinationCurrency || null,
        // The split-off sibling is part of the same expense, so it inherits the
        // parent's average-exclusion flag unless the caller overrides it.
        exclude_from_avg: newOperationData.excludeFromAvg !== undefined
          ? (newOperationData.excludeFromAvg ? 1 : 0)
          : (oldOperation.exclude_from_avg ? 1 : 0),
        latitude: newOperationData.latitude !== undefined
          ? (newOperationData.latitude ?? null)
          : (oldOperation.latitude ?? null),
        longitude: newOperationData.longitude !== undefined
          ? (newOperationData.longitude ?? null)
          : (oldOperation.longitude ?? null),
      };

      const result = await db.runAsync(
        'INSERT INTO operations (type, amount, account_id, category_id, to_account_id, date, created_at, description, exchange_rate, destination_amount, source_currency, destination_currency, exclude_from_avg, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          newRow.type, newRow.amount, newRow.account_id, newRow.category_id,
          newRow.to_account_id, newRow.date, newRow.created_at, newRow.description,
          newRow.exchange_rate, newRow.destination_amount, newRow.source_currency, newRow.destination_currency,
          newRow.exclude_from_avg, newRow.latitude, newRow.longitude,
        ],
      );

      createdOperation = { ...newRow, id: result.lastInsertRowId };

      // Step 4: compute net balance changes across all three operations
      // Net effect on any account: reverse(old) + apply(updated) + apply(new)
      const balanceChanges = new Map();

      const applyChanges = (changes, negate) => {
        for (const [accountId, delta] of changes.entries()) {
          const existing = balanceChanges.get(accountId) || '0';
          balanceChanges.set(
            accountId,
            negate ? Currency.subtract(existing, delta) : Currency.add(existing, delta),
          );
        }
      };

      applyChanges(await calculateBalanceChanges(oldOperation, db), true);
      applyChanges(await calculateBalanceChanges(updatedOperation, db), false);
      applyChanges(await calculateBalanceChanges(createdOperation, db), false);

      // Step 5: update account balances and balance history
      const updateTime = new Date().toISOString();
      for (const [accountId, delta] of balanceChanges.entries()) {
        if (Currency.isZero(delta)) continue;

        const account = await db.getFirstAsync(
          'SELECT balance FROM accounts WHERE id = ?',
          [accountId],
        );

        if (!account) {
          throw new Error(`Account ${accountId} not found`);
        }

        const newBalance = Currency.add(account.balance, delta);

        await db.runAsync(
          'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
          [newBalance, updateTime, accountId],
        );

        await updateTodayBalance(accountId, newBalance, db);
      }
    });

    return createdOperation;
  } catch (error) {
    console.error('Failed to split operation:', error);
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
      const balanceChanges = await calculateBalanceChanges(operation, db);
      const reverseChanges = new Map();
      for (const [accountId, delta] of balanceChanges.entries()) {
        reverseChanges.set(accountId, Currency.subtract('0', delta));
      }

      // Update account balances within the same transaction
      const updateTime = new Date().toISOString();
      for (const [accountId, delta] of reverseChanges.entries()) {
        if (Currency.isZero(delta)) continue;

        // Get current balance
        const account = await db.getFirstAsync(
          'SELECT balance FROM accounts WHERE id = ?',
          [accountId],
        );

        if (!account) {
          throw new Error(`Account ${accountId} not found`);
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
 * @returns {Promise<string>} Decimal-safe string representation of total
 */
export const getTotalExpenses = async (accountId, startDate, endDate) => {
  try {
    // Shadow-category ops are balance adjustments, not real spending — exclude
    // them so these totals agree with the pie charts, which filter shadows out.
    // Operations flagged exclude_from_avg = 1 are user-marked one-offs kept out of
    // the daily spending average / burndown forecast (this total is only consumed
    // by the prediction, so excluding them here is exactly the intended scope).
    const results = await queryAll(
      `SELECT o.amount FROM operations o
       LEFT JOIN categories c ON o.category_id = c.id
       WHERE o.account_id = ? AND o.type = 'expense' AND o.date >= ? AND o.date <= ?
         AND (c.is_shadow IS NULL OR c.is_shadow = 0)
         AND (o.exclude_from_avg IS NULL OR o.exclude_from_avg = 0)`,
      [accountId, startDate, endDate],
    );
    if (!results || results.length === 0) return '0';
    return results.reduce((sum, row) => Currency.add(sum, String(row.amount || '0')), '0');
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
 * @returns {Promise<string>} Decimal-safe string representation of total
 */
export const getTotalIncome = async (accountId, startDate, endDate) => {
  try {
    const results = await queryAll(
      `SELECT o.amount FROM operations o
       LEFT JOIN categories c ON o.category_id = c.id
       WHERE o.account_id = ? AND o.type = 'income' AND o.date >= ? AND o.date <= ?
         AND (c.is_shadow IS NULL OR c.is_shadow = 0)`,
      [accountId, startDate, endDate],
    );
    if (!results || results.length === 0) return '0';
    return results.reduce((sum, row) => Currency.add(sum, String(row.amount || '0')), '0');
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
 * Get the individual operations of a single category, filtered by account
 * currency and date range. Used by the Graphs pie chart drill-down: once a leaf
 * category is selected there are no sub-categories left to break down, so the
 * chart shows the actual operations instead. Only the exact category_id is
 * matched (a leaf has no descendants), so no hierarchy walk is needed.
 * @param {string} categoryId
 * @param {string} currency - Currency code (e.g., 'USD', 'AMD')
 * @param {string} startDate - ISO date string (YYYY-MM-DD)
 * @param {string} endDate - ISO date string (YYYY-MM-DD)
 * @param {string} [type] - Optional operation type filter ('expense' | 'income')
 * @returns {Promise<Array>}
 */
export const getOperationsByCategoryAndCurrency = async (categoryId, currency, startDate, endDate, type = null) => {
  try {
    let sql = `SELECT o.* FROM operations o
       JOIN accounts a ON o.account_id = a.id
       WHERE o.category_id = ?
         AND a.currency = ?
         AND o.date >= ?
         AND o.date <= ?`;

    const params = [categoryId, currency, startDate, endDate];

    if (type) {
      sql += ' AND o.type = ?';
      params.push(type);
    }

    sql += ' ORDER BY o.date DESC, o.created_at DESC';

    const results = await queryAll(sql, params);
    return (results || []).map(mapOperationFields).filter(Boolean);
  } catch (error) {
    console.error('Failed to get operations by category and currency:', error);
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

    console.debug(`Loading week ${weekOffset}: ${startDateStr} to ${endDateStr}`);

    const operations = await queryAll(
      'SELECT * FROM operations WHERE date >= ? AND date <= ? ORDER BY date DESC, created_at DESC',
      [startDateStr, endDateStr],
    );

    console.debug(`Week ${weekOffset} loaded: ${operations?.length || 0} operations`);

    return (operations || []).map(mapOperationFields).filter(Boolean);
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

    console.debug(`Loading week from ${startDateStr} to ${endDateStr}`);

    const operations = await queryAll(
      'SELECT * FROM operations WHERE date >= ? AND date <= ? ORDER BY date DESC, created_at DESC',
      [startDateStr, endDateStr],
    );

    console.debug(`Week loaded: ${operations?.length || 0} operations`);

    return (operations || []).map(mapOperationFields).filter(Boolean);
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
      LEFT JOIN categories pc ON c.parent_id = pc.id
      WHERE o.date >= ? AND o.date <= ?
    `;

    const params = [startDateStr, endDateStr];

    // Apply type filters
    if (filters.types && filters.types.length > 0 && filters.types.length < OPERATION_TYPES.length) {
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
      const searchLower = `%${normalizeSearchQuery(filters.searchText.trim())}%`;
      sql += ` AND (
        ${searchNormExpr('o.description')} LIKE ?
        OR o.amount LIKE ?
        OR ${searchNormExpr('a.name')} LIKE ?
        OR ${searchNormExpr('to_a.name')} LIKE ?
        OR ${searchNormExpr('c.name')} LIKE ?
        OR ${searchNormExpr('pc.name')} LIKE ?
      )`;
      params.push(searchLower, searchLower, searchLower, searchLower, searchLower, searchLower);
    }

    sql += ' ORDER BY o.date DESC, o.created_at DESC';

    console.debug(`Loading filtered week from ${startDateStr} to ${endDateStr}`);

    const operations = await queryAll(sql, params);

    console.debug(`Filtered week loaded: ${operations?.length || 0} operations`);

    return (operations || []).map(mapOperationFields).filter(Boolean);
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
      LEFT JOIN categories pc ON c.parent_id = pc.id
      WHERE o.date < ?
    `;

    const params = [beforeDate];

    // Apply type filters
    if (filters.types && filters.types.length > 0 && filters.types.length < OPERATION_TYPES.length) {
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
      const searchLower = `%${normalizeSearchQuery(filters.searchText.trim())}%`;
      sql += ` AND (
        ${searchNormExpr('o.description')} LIKE ?
        OR o.amount LIKE ?
        OR ${searchNormExpr('a.name')} LIKE ?
        OR ${searchNormExpr('to_a.name')} LIKE ?
        OR ${searchNormExpr('c.name')} LIKE ?
        OR ${searchNormExpr('pc.name')} LIKE ?
      )`;
      params.push(searchLower, searchLower, searchLower, searchLower, searchLower, searchLower);
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

    console.debug(`Loading week from ${startDateStr} to ${endDateStr}`);

    const operations = await queryAll(
      'SELECT * FROM operations WHERE date >= ? AND date <= ? ORDER BY date DESC, created_at DESC',
      [startDateStr, endDateStr],
    );

    console.debug(`Week loaded: ${operations?.length || 0} operations`);

    return (operations || []).map(mapOperationFields).filter(Boolean);
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
      LEFT JOIN categories pc ON c.parent_id = pc.id
      WHERE o.date > ?
    `;

    const params = [afterDate];

    // Apply type filters
    if (filters.types && filters.types.length > 0 && filters.types.length < OPERATION_TYPES.length) {
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
      const searchLower = `%${normalizeSearchQuery(filters.searchText.trim())}%`;
      sql += ` AND (
        ${searchNormExpr('o.description')} LIKE ?
        OR o.amount LIKE ?
        OR ${searchNormExpr('a.name')} LIKE ?
        OR ${searchNormExpr('to_a.name')} LIKE ?
        OR ${searchNormExpr('c.name')} LIKE ?
        OR ${searchNormExpr('pc.name')} LIKE ?
      )`;
      params.push(searchLower, searchLower, searchLower, searchLower, searchLower, searchLower);
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
      LEFT JOIN categories pc ON c.parent_id = pc.id
      WHERE o.date >= ? AND o.date <= ?
    `;

    const params = [startDateStr, endDateStr];

    // Apply type filters
    if (filters.types && filters.types.length > 0 && filters.types.length < OPERATION_TYPES.length) {
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
      const searchLower = `%${normalizeSearchQuery(filters.searchText.trim())}%`;
      sql += ` AND (
        ${searchNormExpr('o.description')} LIKE ?
        OR o.amount LIKE ?
        OR ${searchNormExpr('a.name')} LIKE ?
        OR ${searchNormExpr('to_a.name')} LIKE ?
        OR ${searchNormExpr('c.name')} LIKE ?
        OR ${searchNormExpr('pc.name')} LIKE ?
      )`;
      params.push(searchLower, searchLower, searchLower, searchLower, searchLower, searchLower);
    }

    sql += ' ORDER BY o.date DESC, o.created_at DESC';

    console.debug(`Loading filtered week from ${startDateStr} to ${endDateStr}`);

    const operations = await queryAll(sql, params);

    console.debug(`Filtered week loaded: ${operations?.length || 0} operations`);

    return (operations || []).map(mapOperationFields).filter(Boolean);
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
 * @returns {Promise<Array<{month: number, total: string}>>} Monthly totals (month is 1-12), total as Decimal-safe string
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
         o.amount
       FROM operations o
       JOIN accounts a ON o.account_id = a.id
       WHERE o.type = 'expense'
         AND a.currency = ?
         AND o.date >= ?
         AND o.date <= ?
         AND o.category_id IN (${placeholders})
       ORDER BY month ASC`,
      [currency, startDate, endDate, ...categoryIds],
    );

    const monthTotals = new Map();
    for (const row of results || []) {
      const prev = monthTotals.get(row.month) || '0';
      monthTotals.set(row.month, Currency.add(prev, String(row.amount || '0')));
    }

    return Array.from(monthTotals.entries())
      .sort(([a], [b]) => a - b)
      .map(([month, total]) => ({ month, total }));
  } catch (error) {
    console.error('Failed to get monthly spending by categories:', error);
    throw error;
  }
};

/**
 * Get spending by categories for the last 12 months (rolling)
 * @param {string} currency - Currency code
 * @param {Array<string>} categoryIds - Category IDs to include
 * @returns {Promise<Array<{yearMonth: string, total: string}>>} Array of {yearMonth: 'YYYY-MM', total as Decimal-safe string}
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
         o.amount
       FROM operations o
       JOIN accounts a ON o.account_id = a.id
       WHERE o.type = 'expense'
         AND a.currency = ?
         AND o.date >= ?
         AND o.date <= ?
         AND o.category_id IN (${placeholders})
       ORDER BY year_month ASC`,
      [currency, startDateStr, endDateStr, ...categoryIds],
    );

    const monthTotals = new Map();
    for (const row of results || []) {
      const prev = monthTotals.get(row.year_month) || '0';
      monthTotals.set(row.year_month, Currency.add(prev, String(row.amount || '0')));
    }

    return Array.from(monthTotals.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([yearMonth, total]) => ({ yearMonth, total }));
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

export const getTopSourceCurrencies = async (limit = 5) => {
  try {
    const results = await queryAll(
      `SELECT source_currency, COUNT(*) as count
       FROM operations
       WHERE source_currency IS NOT NULL
         AND destination_currency IS NOT NULL
         AND source_currency != destination_currency
         AND type != 'transfer'
       GROUP BY source_currency
       ORDER BY count DESC
       LIMIT ?`,
      [limit],
    );
    return (results || []).map(row => row.source_currency);
  } catch (error) {
    console.error('Failed to get top source currencies:', error);
    return [];
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

/**
 * Get distinct operation descriptions ordered by usage frequency (most used first).
 * When categoryId is provided, descriptions used in that category are listed first.
 * When amount is also provided, same-category descriptions are further sorted by
 * closest historical amount (ascending absolute difference) before frequency.
 * Used for autocomplete suggestions in the operation form.
 * @param {number} limit - Maximum number of descriptions to return
 * @param {string|null} categoryId - If provided, descriptions from this category appear first
 * @param {number|null} amount - If provided alongside categoryId, same-category descriptions
 *   are sorted by closest amount match first
 * @returns {Promise<string[]>} Array of description strings
 */
export const getDistinctDescriptions = async (limit = 100, categoryId = null, amount = null) => {
  try {
    let results;
    const baseWhere = 'description IS NOT NULL AND description != \'\' AND description NOT LIKE \'[MoneyOK]%\'';
    if (categoryId && amount !== null) {
      results = await queryAll(
        `SELECT description
         FROM operations
         WHERE ${baseWhere}
         GROUP BY description
         ORDER BY MAX(CASE WHEN category_id = ? THEN 1 ELSE 0 END) DESC,
                  MIN(CASE WHEN category_id = ? THEN ABS(CAST(amount AS REAL) - ?) ELSE NULL END) ASC,
                  COUNT(*) DESC,
                  description ASC
         LIMIT ?`,
        [categoryId, categoryId, amount, limit],
      );
    } else if (categoryId) {
      results = await queryAll(
        `SELECT description
         FROM operations
         WHERE ${baseWhere}
         GROUP BY description
         ORDER BY MAX(CASE WHEN category_id = ? THEN 1 ELSE 0 END) DESC,
                  COUNT(*) DESC,
                  description ASC
         LIMIT ?`,
        [categoryId, limit],
      );
    } else {
      results = await queryAll(
        `SELECT description
         FROM operations
         WHERE ${baseWhere}
         GROUP BY description
         ORDER BY COUNT(*) DESC, description ASC
         LIMIT ?`,
        [limit],
      );
    }
    return (results || []).map(row => row.description);
  } catch (error) {
    console.error('Failed to get distinct descriptions:', error);
    throw error;
  }
};

/**
 * Aggregate raw {description, cnt, category_id?} rows into a ranked label list.
 * Single source of truth for the label-ranking rules shared by getDistinctLabels
 * and getLabelsNearLocation: parse labels out of each description, drop hidden /
 * system labels (imported Account:/Category:/... metadata + the [MoneyOK] marker),
 * sum per-label frequency, then order by — when a categoryId is given —
 * in-category first → frequency desc → locale-aware label compare.
 * @param {Array<{description: string, cnt: number, category_id?: *}>} rows
 * @param {Object} [opts]
 * @param {number} opts.limit - Maximum number of labels to return
 * @param {string|null} [opts.categoryId] - When set, labels used in this category rank first
 * @returns {string[]}
 */
const aggregateLabelRows = (rows, { limit, categoryId = null } = {}) => {
  const byLabel = new Map(); // lowercased label -> { label, count, inCategory }
  for (const row of (rows || [])) {
    const labels = parseLabels(row.description);
    for (const label of labels) {
      if (isHiddenLabel(label)) continue;
      const key = label.toLowerCase();
      let entry = byLabel.get(key);
      if (!entry) {
        entry = { label, count: 0, inCategory: false };
        byLabel.set(key, entry);
      }
      entry.count += Number(row.cnt) || 0;
      if (categoryId != null && row.category_id != null && String(row.category_id) === String(categoryId)) {
        entry.inCategory = true;
      }
    }
  }

  const sorted = Array.from(byLabel.values()).sort((a, b) => {
    if (categoryId != null && a.inCategory !== b.inCategory) {
      return a.inCategory ? -1 : 1;
    }
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });

  return sorted.slice(0, limit).map(entry => entry.label);
};

/**
 * Get distinct labels across all operations, ordered by usage frequency.
 * Labels are parsed out of the description column (see labelUtils). When a
 * categoryId is provided, labels that have been used in that category are
 * surfaced first, mirroring getDistinctDescriptions' category-aware ordering.
 * Used for label autocomplete in the operation form and for the label filter UI.
 * @param {number} limit - Maximum number of labels to return
 * @param {string|null} categoryId - If provided, labels used in this category appear first
 * @returns {Promise<string[]>} Array of label strings
 */
export const getDistinctLabels = async (limit = 50, categoryId = null) => {
  try {
    // Bound the work: take the most-used distinct (description, category) groups
    // rather than scanning and parsing the entire history in JS on every modal/
    // overlay open. The cap is well above any realistic distinct-description count
    // for personal use, and ordering by frequency keeps the labels users actually
    // care about (the most common ones) within the window.
    const SCAN_GROUP_LIMIT = 2000;
    const rows = await queryAll(
      `SELECT description, category_id, COUNT(*) AS cnt
       FROM operations
       WHERE description IS NOT NULL AND description != ''
       GROUP BY description, category_id
       ORDER BY cnt DESC
       LIMIT ${SCAN_GROUP_LIMIT}`,
    );

    return aggregateLabelRows(rows, { limit, categoryId });
  } catch (error) {
    console.error('Failed to get distinct labels:', error);
    throw error;
  }
};

/**
 * Most-frequent labels used on past operations within a ~radiusMeters bounding
 * box of (lat, lng) — "proximity recall". Mirrors getDistinctLabels' shape: a
 * single bounded SELECT grouped by description, then per-label frequency
 * aggregation in JS with hidden/system labels excluded.
 *
 * The query is a square bounding box (no haversine refine, no distance
 * weighting) — simple and well within usable accuracy at a ~150 m radius.
 * Rows with null coordinates are skipped by the IS NOT NULL filter and never
 * poison the result. Never throws: any failure resolves to [] so a save or the
 * suggestion strip is never blocked.
 *
 * @param {number|string} lat - Latitude in decimal degrees
 * @param {number|string} lng - Longitude in decimal degrees
 * @param {Object} [opts]
 * @param {number} [opts.radiusMeters=150] - Half-size of the bounding box in metres
 * @param {number} [opts.limit=8] - Maximum number of labels to return
 * @returns {Promise<string[]>} Labels ranked by frequency, de-duplicated, hidden labels excluded
 */
export const getLabelsNearLocation = async (lat, lng, { radiusMeters = 150, limit = 8 } = {}) => {
  try {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (!isFinite(latNum) || !isFinite(lngNum)) return [];

    // Convert the metre radius to lat/lng deltas. 1° latitude ≈ 111320 m anywhere;
    // 1° longitude shrinks by cos(latitude). Floor |cos| so a fix near the poles
    // can't blow the longitude delta up to infinity.
    const dLat = radiusMeters / 111320;
    const cosLat = Math.cos((latNum * Math.PI) / 180);
    const dLng = radiusMeters / (111320 * Math.max(Math.abs(cosLat), 1e-6));

    const minLat = latNum - dLat;
    const maxLat = latNum + dLat;
    const minLng = lngNum - dLng;
    const maxLng = lngNum + dLng;

    // Bounding-box filter. Coordinates are stored as text, so CAST to REAL for a
    // numeric (not lexicographic) range comparison; this also means a text index
    // can't serve the range, which is why none exists (see migration 0009). The
    // scan window is capped like getDistinctLabels so modal open stays fast even
    // with a large history.
    const SCAN_GROUP_LIMIT = 2000;
    const rows = await queryAll(
      `SELECT description, COUNT(*) AS cnt
       FROM operations
       WHERE latitude IS NOT NULL
         AND longitude IS NOT NULL
         AND CAST(latitude AS REAL) BETWEEN ? AND ?
         AND CAST(longitude AS REAL) BETWEEN ? AND ?
         AND description IS NOT NULL AND description != ''
       GROUP BY description
       ORDER BY cnt DESC
       LIMIT ${SCAN_GROUP_LIMIT}`,
      [minLat, maxLat, minLng, maxLng],
    );

    // Rank by frequency (no category dimension here) using the shared aggregator,
    // so the hidden-label rules and tie-break stay single-sourced with getDistinctLabels.
    return aggregateLabelRows(rows, { limit });
  } catch (error) {
    console.error('Failed to get labels near location:', error);
    return [];
  }
};
