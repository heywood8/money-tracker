import { executeQuery, queryAll, queryFirst, executeTransaction } from './db';
import * as Currency from './currency';

/**
 * Get all accounts
 * @returns {Promise<Array>}
 */
export const getAllAccounts = async () => {
  try {
    const accounts = await queryAll(
      'SELECT * FROM accounts ORDER BY display_order ASC, created_at DESC'
    );
    return accounts || [];
  } catch (error) {
    console.error('Failed to get accounts:', error);
    throw error;
  }
};

/**
 * Get account by ID
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export const getAccountById = async (id) => {
  try {
    const account = await queryFirst(
      'SELECT * FROM accounts WHERE id = ?',
      [id]
    );
    return account;
  } catch (error) {
    console.error('Failed to get account:', error);
    throw error;
  }
};

/**
 * Create a new account
 * @param {Object} account - Account data
 * @returns {Promise<Object>}
 */
export const createAccount = async (account) => {
  try {
    const now = new Date().toISOString();

    // Get max order value and add 1 for new account
    const maxOrderResult = await queryFirst(
      'SELECT MAX(display_order) as max_order FROM accounts'
    );
    const newOrder = (maxOrderResult?.max_order ?? -1) + 1;

    const accountData = {
      id: account.id,
      name: account.name,
      balance: account.balance || '0',
      currency: account.currency || 'USD',
      display_order: account.display_order ?? newOrder,
      created_at: now,
      updated_at: now,
    };

    await executeQuery(
      'INSERT INTO accounts (id, name, balance, currency, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        accountData.id,
        accountData.name,
        accountData.balance,
        accountData.currency,
        accountData.display_order,
        accountData.created_at,
        accountData.updated_at,
      ]
    );

    return accountData;
  } catch (error) {
    console.error('Failed to create account:', error);
    throw error;
  }
};

/**
 * Update an existing account
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateAccount = async (id, updates) => {
  try {
    const updatedAt = new Date().toISOString();
    const fields = [];
    const values = [];

    // Build dynamic UPDATE query based on provided fields
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.balance !== undefined) {
      fields.push('balance = ?');
      values.push(updates.balance);
    }
    if (updates.currency !== undefined) {
      fields.push('currency = ?');
      values.push(updates.currency);
    }

    if (fields.length === 0) {
      return; // Nothing to update
    }

    fields.push('updated_at = ?');
    values.push(updatedAt);
    values.push(id); // Add ID at the end for WHERE clause

    const sql = `UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`;
    await executeQuery(sql, values);
  } catch (error) {
    console.error('Failed to update account:', error);
    throw error;
  }
};

/**
 * Transfer all operations from one account to another
 * @param {string} fromAccountId - Account to transfer operations from
 * @param {string} toAccountId - Account to transfer operations to
 * @returns {Promise<number>} Number of operations transferred
 */
export const transferOperations = async (fromAccountId, toAccountId) => {
  try {
    return await executeTransaction(async (db) => {
      // Update operations where the account is the source (account_id)
      const sourceResult = await db.runAsync(
        'UPDATE operations SET account_id = ? WHERE account_id = ?',
        [toAccountId, fromAccountId]
      );

      // Update operations where the account is the destination (to_account_id) for transfers
      const destResult = await db.runAsync(
        'UPDATE operations SET to_account_id = ? WHERE to_account_id = ?',
        [toAccountId, fromAccountId]
      );

      const totalTransferred = (sourceResult.changes || 0) + (destResult.changes || 0);
      console.log(`Transferred ${totalTransferred} operations from ${fromAccountId} to ${toAccountId}`);

      return totalTransferred;
    });
  } catch (error) {
    console.error('Failed to transfer operations:', error);
    throw error;
  }
};

/**
 * Get the count of operations linked to an account
 * @param {string} id - Account ID
 * @returns {Promise<number>} Number of operations
 */
export const getOperationCount = async (id) => {
  try {
    const result = await queryFirst(
      `SELECT COUNT(*) as count FROM operations
       WHERE account_id = ? OR to_account_id = ?`,
      [id, id]
    );
    return result ? result.count : 0;
  } catch (error) {
    console.error('Failed to get operation count:', error);
    throw error;
  }
};

/**
 * Delete an account (with optional operation transfer)
 * @param {string} id - Account ID to delete
 * @param {string|null} transferToAccountId - Optional account ID to transfer operations to
 * @returns {Promise<void>}
 * @throws {Error} If account has associated operations and no transfer account is specified
 */
export const deleteAccount = async (id, transferToAccountId = null) => {
  try {
    // Check if account has any operations (expense, income, or transfers)
    const operationCount = await getOperationCount(id);

    if (operationCount > 0) {
      if (!transferToAccountId) {
        // No transfer account specified, throw error with count
        throw new Error(
          `Cannot delete account: ${operationCount} transaction(s) are associated with this account. Please delete or reassign the transactions first.`
        );
      }

      // Transfer operations to the specified account
      await transferOperations(id, transferToAccountId);
      console.log(`Transferred ${operationCount} operations before deleting account ${id}`);
    }

    // Safe to delete - no operations are linked or they've been transferred
    await executeQuery('DELETE FROM accounts WHERE id = ?', [id]);
  } catch (error) {
    console.error('Failed to delete account:', error);
    throw error;
  }
};

/**
 * Update account balance (atomic operation)
 * @param {string} id
 * @param {number} delta - Amount to add (can be negative)
 * @returns {Promise<void>}
 */
export const updateAccountBalance = async (id, delta) => {
  try {
    await executeTransaction(async (db) => {
      // Get current balance
      const account = await db.getFirstAsync(
        'SELECT balance FROM accounts WHERE id = ?',
        [id]
      );

      if (!account) {
        throw new Error(`Account ${id} not found`);
      }

      // Use Currency utilities for precise arithmetic
      const newBalance = Currency.add(account.balance, delta);

      // Update balance
      await db.runAsync(
        'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
        [newBalance, new Date().toISOString(), id]
      );
    });
  } catch (error) {
    console.error('Failed to update account balance:', error);
    throw error;
  }
};

/**
 * Batch update account balances (atomic operation)
 * @param {Map<string, number>} balanceChanges - Map of account ID to delta
 * @returns {Promise<void>}
 */
export const batchUpdateBalances = async (balanceChanges) => {
  if (balanceChanges.size === 0) {
    return;
  }

  try {
    await executeTransaction(async (db) => {
      const now = new Date().toISOString();

      for (const [accountId, delta] of balanceChanges.entries()) {
        if (delta === 0) continue;

        // Get current balance
        const account = await db.getFirstAsync(
          'SELECT balance FROM accounts WHERE id = ?',
          [accountId]
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
          [newBalance, now, accountId]
        );
      }
    });
  } catch (error) {
    console.error('Failed to batch update balances:', error);
    throw error;
  }
};

/**
 * Get account balance
 * @param {string} id
 * @returns {Promise<string>}
 */
export const getAccountBalance = async (id) => {
  try {
    const account = await queryFirst(
      'SELECT balance FROM accounts WHERE id = ?',
      [id]
    );
    return account ? account.balance : '0';
  } catch (error) {
    console.error('Failed to get account balance:', error);
    throw error;
  }
};

/**
 * Check if account exists
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export const accountExists = async (id) => {
  try {
    const result = await queryFirst(
      'SELECT 1 FROM accounts WHERE id = ? LIMIT 1',
      [id]
    );
    return !!result;
  } catch (error) {
    console.error('Failed to check account existence:', error);
    throw error;
  }
};

/**
 * Reorder accounts
 * @param {Array<{id: string, display_order: number}>} orderedAccounts - Array of account IDs with new order
 * @returns {Promise<void>}
 */
export const reorderAccounts = async (orderedAccounts) => {
  try {
    await executeTransaction(async (db) => {
      const now = new Date().toISOString();

      for (const { id, display_order } of orderedAccounts) {
        await db.runAsync(
          'UPDATE accounts SET display_order = ?, updated_at = ? WHERE id = ?',
          [display_order, now, id]
        );
      }
    });
  } catch (error) {
    console.error('Failed to reorder accounts:', error);
    throw error;
  }
};

/**
 * Adjust account balance manually and create/update adjustment operation
 * This function is used when the user manually changes the account balance
 * to match reality (e.g., after counting cash).
 *
 * @param {string} accountId - Account ID
 * @param {string} newBalance - New balance value
 * @param {string} description - Optional description for the adjustment
 * @returns {Promise<void>}
 */
export const adjustAccountBalance = async (accountId, newBalance, description = '') => {
  try {
    console.log('adjustAccountBalance called:', { accountId, newBalance, description });

    // Import necessary modules within the function to avoid circular dependencies
    const OperationsDB = require('./OperationsDB');
    const CategoriesDB = require('./CategoriesDB');
    const uuid = require('react-native-uuid').default || require('react-native-uuid');

    await executeTransaction(async (db) => {
      // Get current balance
      const account = await db.getFirstAsync(
        'SELECT balance FROM accounts WHERE id = ?',
        [accountId]
      );

      if (!account) {
        throw new Error(`Account ${accountId} not found`);
      }

      const currentBalance = parseFloat(account.balance);
      const targetBalance = parseFloat(newBalance);

      // Check if there's already an adjustment operation for today
      const today = new Date().toISOString().split('T')[0];
      const existingOperation = await db.getFirstAsync(
        `SELECT o.*, c.category_type FROM operations o
         JOIN categories c ON o.category_id = c.id
         WHERE o.account_id = ?
           AND o.date = ?
           AND c.is_shadow = 1
         ORDER BY o.created_at DESC
         LIMIT 1`,
        [accountId, today]
      );

      let originalBalance;
      let adjustmentHistory = [];

      if (existingOperation) {
        // Parse the existing description to extract original balance and history
        const descMatch = existingOperation.description?.match(/from\s+([\d.]+)/);
        originalBalance = descMatch ? parseFloat(descMatch[1]) : currentBalance;

        // Extract adjustment history from description
        const historyMatch = existingOperation.description?.match(/→\s*([\d.\s→]+)$/);
        if (historyMatch) {
          adjustmentHistory = historyMatch[1].split('→').map(v => v.trim());
        }
      } else {
        // First adjustment of the day - current balance is the original
        originalBalance = currentBalance;
      }

      // Add current balance to history if it's different from the last entry
      const lastHistoryValue = adjustmentHistory.length > 0
        ? parseFloat(adjustmentHistory[adjustmentHistory.length - 1])
        : originalBalance;

      if (Math.abs(currentBalance - lastHistoryValue) > 0.0001) {
        adjustmentHistory.push(currentBalance.toFixed(2));
      }

      // Add target balance to history
      adjustmentHistory.push(targetBalance.toFixed(2));

      // Calculate total adjustment from original balance
      const totalDelta = targetBalance - originalBalance;
      const absoluteDelta = Math.abs(totalDelta);

      // Determine operation type based on cumulative delta
      const operationType = totalDelta < 0 ? 'expense' : 'income';

      // Get shadow categories
      const shadowCategories = await db.getAllAsync(
        'SELECT * FROM categories WHERE is_shadow = 1'
      );

      const shadowExpenseCategory = shadowCategories.find(
        c => c.category_type === 'expense' && c.is_shadow === 1
      );
      const shadowIncomeCategory = shadowCategories.find(
        c => c.category_type === 'income' && c.is_shadow === 1
      );

      if (!shadowExpenseCategory || !shadowIncomeCategory) {
        throw new Error('Shadow categories not found. Please reinitialize the database.');
      }

      const categoryId = operationType === 'expense'
        ? shadowExpenseCategory.id
        : shadowIncomeCategory.id;

      // Build description with adjustment history
      const historyString = adjustmentHistory.join(' → ');
      const fullDescription = description
        ? `${description}\nBalance adjusted from ${originalBalance.toFixed(2)} → ${historyString}`
        : `Balance adjusted from ${originalBalance.toFixed(2)} → ${historyString}`;

      if (existingOperation) {
        // Check if total delta is 0 - if so, delete the operation
        if (Math.abs(totalDelta) < 0.0001) {
          console.log('Cumulative delta is 0, deleting adjustment operation:', existingOperation.id);

          // Calculate balance adjustment needed - reverse the old operation's effect
          const oldAmount = parseFloat(existingOperation.amount);
          const oldType = existingOperation.type;
          let balanceAdjustment = 0;

          if (oldType === 'expense') {
            balanceAdjustment += oldAmount; // Add back the expense
          } else if (oldType === 'income') {
            balanceAdjustment -= oldAmount; // Remove the income
          }

          // Delete the operation
          await db.runAsync('DELETE FROM operations WHERE id = ?', [existingOperation.id]);
          console.log('Adjustment operation deleted successfully');

          // Update account balance
          const newBalanceValue = Currency.add(currentBalance, balanceAdjustment);
          await db.runAsync(
            'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
            [newBalanceValue, new Date().toISOString(), accountId]
          );
        } else {
          // Update existing operation
          console.log('Updating existing adjustment operation:', existingOperation.id);
          await db.runAsync(
            'UPDATE operations SET type = ?, amount = ?, category_id = ?, description = ? WHERE id = ?',
            [operationType, absoluteDelta.toFixed(2), categoryId, fullDescription, existingOperation.id]
          );
          console.log('Adjustment operation updated successfully');

          // Calculate balance adjustment needed
          // First, reverse the old operation's effect on balance
          const oldAmount = parseFloat(existingOperation.amount);
          const oldType = existingOperation.type;
          let balanceAdjustment = 0;

          if (oldType === 'expense') {
            balanceAdjustment += oldAmount; // Add back the expense
          } else if (oldType === 'income') {
            balanceAdjustment -= oldAmount; // Remove the income
          }

          // Then apply the new operation's effect
          if (operationType === 'expense') {
            balanceAdjustment -= absoluteDelta;
          } else if (operationType === 'income') {
            balanceAdjustment += absoluteDelta;
          }

          // Update account balance
          const newBalanceValue = Currency.add(currentBalance, balanceAdjustment);
          await db.runAsync(
            'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
            [newBalanceValue, new Date().toISOString(), accountId]
          );
        }
      } else {
        // Create new adjustment operation
        const operationId = uuid.v4();
        console.log('Creating new adjustment operation:', {
          id: operationId,
          type: operationType,
          amount: absoluteDelta.toFixed(2),
          categoryId,
          date: today,
        });

        await db.runAsync(
          'INSERT INTO operations (id, type, amount, account_id, category_id, to_account_id, date, created_at, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            operationId,
            operationType,
            absoluteDelta.toFixed(2),
            accountId,
            categoryId,
            null,
            today,
            new Date().toISOString(),
            fullDescription,
          ]
        );
        console.log('Adjustment operation created successfully');

        // Update account balance based on operation type
        const delta = operationType === 'expense' ? -absoluteDelta : absoluteDelta;
        const newBalanceValue = Currency.add(currentBalance, delta);

        await db.runAsync(
          'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
          [newBalanceValue, new Date().toISOString(), accountId]
        );
      }
    });

    console.log('Account balance adjustment completed successfully');
  } catch (error) {
    console.error('Failed to adjust account balance:', error);
    throw error;
  }
};
