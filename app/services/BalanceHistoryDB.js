/**
 * Balance History Database Service
 *
 * Manages daily balance snapshots for accounts
 * - Snapshots previous day balances on app open
 * - Calculates historical balances from operations
 * - Populates current month history during migration
 */

import { queryAll, executeTransaction } from './db';
import * as AccountsDB from './AccountsDB';
import * as Currency from './currency';

/**
 * Format Date object to YYYY-MM-DD string
 * @param {Date} date
 * @returns {string}
 */
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Calculate account balance at end of specific date
 * Works backwards from current balance by reversing operations
 *
 * @param {number} accountId
 * @param {string} targetDate - YYYY-MM-DD format
 * @param {Object} db - Optional database instance (for use within transactions)
 * @returns {Promise<string>} Balance as string
 */
const calculateBalanceOnDate = async (accountId, targetDate, db = null) => {
  try {
    // Get current balance
    let account;
    if (db) {
      // Use provided db instance (within transaction)
      const result = await db.getAllAsync(
        'SELECT * FROM accounts WHERE id = ? LIMIT 1',
        [accountId]
      );
      account = result && result.length > 0 ? result[0] : null;
    } else {
      // Use external function (outside transaction)
      account = await AccountsDB.getAccountById(accountId);
    }

    if (!account) return '0';

    let currentBalance = account.balance;

    // Get all operations after target date (these need to be reversed)
    let operations;
    if (db) {
      // Use provided db instance (within transaction)
      operations = await db.getAllAsync(
        `SELECT * FROM operations
         WHERE (account_id = ? OR to_account_id = ?)
           AND date > ?
         ORDER BY date DESC, created_at DESC`,
        [accountId, accountId, targetDate]
      );
    } else {
      // Use external function (outside transaction)
      operations = await queryAll(
        `SELECT * FROM operations
         WHERE (account_id = ? OR to_account_id = ?)
           AND date > ?
         ORDER BY date DESC, created_at DESC`,
        [accountId, accountId, targetDate]
      );
    }

    // Reverse each operation to get balance on target date
    for (const op of operations) {
      if (op.type === 'expense' && op.account_id === accountId) {
        // Expense was deducted, add it back
        currentBalance = Currency.add(currentBalance, op.amount);
      } else if (op.type === 'income' && op.account_id === accountId) {
        // Income was added, subtract it back
        currentBalance = Currency.subtract(currentBalance, op.amount);
      } else if (op.type === 'transfer') {
        if (op.account_id === accountId) {
          // Was debit (money out), add back
          currentBalance = Currency.add(currentBalance, op.amount);
        } else if (op.to_account_id === accountId) {
          // Was credit (money in), subtract back
          const creditAmount = op.destination_amount || op.amount;
          currentBalance = Currency.subtract(currentBalance, creditAmount);
        }
      }
    }

    return currentBalance;
  } catch (error) {
    console.error('Failed to calculate balance on date:', error);
    throw error;
  }
};

/**
 * Snapshot previous day's balances for all accounts
 * DISABLED: This functionality has been removed
 *
 * @returns {Promise<void>}
 */
export const snapshotPreviousDayBalances = async () => {
  // Functionality removed - no-op
  return;
};

/**
 * Populate current month's balance history
 * Works backwards from today to beginning of month
 * 
 * NOTE: This is now handled by migration 0003's post-migration handler.
 * This function remains for manual re-population if needed.
 *
 * @param {Object} providedDb - Optional database instance (for use within existing transaction)
 * @returns {Promise<void>}
 */
export const populateCurrentMonthHistory = async (providedDb = null) => {
  try {
    // Get first day of current month
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayStr = formatDate(firstDayOfMonth);
    const todayStr = formatDate(now);

    // Define the population logic
    const populateLogic = async (db) => {
      // Get all accounts (use db parameter directly)
      const accounts = await db.getAllAsync('SELECT * FROM accounts ORDER BY display_order ASC, created_at DESC');

      for (const account of accounts) {
        // Get account creation date
        const accountCreatedDate = account.created_at ? new Date(account.created_at) : firstDayOfMonth;
        const startDate = accountCreatedDate > firstDayOfMonth ? formatDate(accountCreatedDate) : firstDayStr;

        // Build list of dates to snapshot (working backwards from today)
        const datesToSnapshot = [];
        const currentDate = new Date(now);

        while (currentDate >= firstDayOfMonth && currentDate >= accountCreatedDate) {
          const dateStr = formatDate(currentDate);
          if (dateStr < todayStr) { // Don't snapshot today
            datesToSnapshot.push(dateStr);
          }
          currentDate.setDate(currentDate.getDate() - 1);
        }

        // Calculate balance for each date and create snapshots
        let lastSnapshotBalance = null;

        for (const targetDate of datesToSnapshot) {
          // Calculate balance on this date (pass db instance)
          const balanceOnDate = await calculateBalanceOnDate(account.id, targetDate, db);

          // Only create snapshot if balance changed
          if (lastSnapshotBalance === null || lastSnapshotBalance !== balanceOnDate) {
            await db.runAsync(
              'INSERT OR IGNORE INTO accounts_balance_history (account_id, date, balance, created_at) VALUES (?, ?, ?, ?)',
              [account.id, targetDate, balanceOnDate, new Date().toISOString()]
            );
            lastSnapshotBalance = balanceOnDate;
          }
        }
      }
    };

    // If a database instance is provided, use it directly (already outside a transaction context)
    if (providedDb) {
      await populateLogic(providedDb);
    } else {
      // Otherwise, create our own transaction
      await executeTransaction(populateLogic);
    }

    console.log('Current month balance history populated successfully');
  } catch (error) {
    // Gracefully handle transaction errors - can happen during concurrent operations
    if (error.message && (
      error.message.includes('transaction within a transaction') ||
      error.message.includes('cannot rollback') ||
      error.message.includes('no transaction is active')
    )) {
      console.log('Skipping balance history population - transaction conflict detected');
      return;
    }
    console.error('Failed to populate current month history:', error);
    // Don't throw from migration context - allow app to continue
    if (providedDb) {
      console.warn('Population failed during migration, but continuing...');
      return;
    }
    throw error;
  }
};

/**
 * Get balance history for an account within date range
 *
 * @param {number} accountId
 * @param {string} startDate - YYYY-MM-DD format
 * @param {string} endDate - YYYY-MM-DD format
 * @returns {Promise<Array>} Array of {date, balance, created_at}
 */
export const getBalanceHistory = async (accountId, startDate, endDate) => {
  try {
    const results = await queryAll(
      `SELECT date, balance, created_at
       FROM accounts_balance_history
       WHERE account_id = ?
         AND date >= ?
         AND date <= ?
       ORDER BY date ASC`,
      [accountId, startDate, endDate]
    );
    return results || [];
  } catch (error) {
    console.error('Failed to get balance history:', error);
    throw error;
  }
};

/**
 * Get all accounts' balances on a specific date
 *
 * @param {string} date - YYYY-MM-DD format
 * @returns {Promise<Array>} Array of {account_id, name, currency, balance}
 */
export const getAllAccountsBalanceOnDate = async (date) => {
  try {
    const results = await queryAll(
      `SELECT abh.account_id, a.name, a.currency, abh.balance
       FROM accounts_balance_history abh
       JOIN accounts a ON abh.account_id = a.id
       WHERE abh.date = ?
       ORDER BY a.display_order ASC`,
      [date]
    );
    return results || [];
  } catch (error) {
    console.error('Failed to get all accounts balance on date:', error);
    throw error;
  }
};

/**
 * Get account balance on a specific date
 * Returns null if no snapshot exists for that date
 *
 * @param {number} accountId
 * @param {string} date - YYYY-MM-DD format
 * @returns {Promise<string|null>} Balance as string, or null
 */
export const getAccountBalanceOnDate = async (accountId, date) => {
  try {
    const result = await queryAll(
      `SELECT balance
       FROM accounts_balance_history
       WHERE account_id = ? AND date = ?
       LIMIT 1`,
      [accountId, date]
    );
    return result && result.length > 0 ? result[0].balance : null;
  } catch (error) {
    console.error('Failed to get account balance on date:', error);
    throw error;
  }
};

/**
 * Get most recent snapshot date for an account
 *
 * @param {number} accountId
 * @returns {Promise<string|null>} Date in YYYY-MM-DD format, or null
 */
export const getLastSnapshotDate = async (accountId) => {
  try {
    const result = await queryAll(
      `SELECT date
       FROM accounts_balance_history
       WHERE account_id = ?
       ORDER BY date DESC
       LIMIT 1`,
      [accountId]
    );
    return result && result.length > 0 ? result[0].date : null;
  } catch (error) {
    console.error('Failed to get last snapshot date:', error);
    throw error;
  }
};

/**
 * Update or insert balance for a specific account and date
 *
 * @param {number} accountId
 * @param {string} date - YYYY-MM-DD format
 * @param {string} balance - Balance as string
 * @returns {Promise<void>}
 */
export const upsertBalanceHistory = async (accountId, date, balance) => {
  try {
    await executeTransaction(async (db) => {
      const now = new Date().toISOString();

      // Use INSERT OR REPLACE to update or insert
      await db.runAsync(
        `INSERT OR REPLACE INTO accounts_balance_history (account_id, date, balance, created_at)
         VALUES (?, ?, ?, ?)`,
        [accountId, date, balance, now]
      );
    });
  } catch (error) {
    console.error('Failed to upsert balance history:', error);
    throw error;
  }
};

/**
 * Delete balance history entry for a specific account and date
 *
 * @param {number} accountId
 * @param {string} date - YYYY-MM-DD format
 * @returns {Promise<void>}
 */
export const deleteBalanceHistory = async (accountId, date) => {
  try {
    await executeTransaction(async (db) => {
      await db.runAsync(
        `DELETE FROM accounts_balance_history
         WHERE account_id = ? AND date = ?`,
        [accountId, date]
      );
    });
  } catch (error) {
    console.error('Failed to delete balance history:', error);
    throw error;
  }
};
