import { executeQuery, queryAll, queryFirst, executeTransaction, getDrizzle } from './db';
import * as Currency from './currency';
import { eq, sql, desc, asc } from 'drizzle-orm';
import { accounts } from '../db/schema';
import * as BalanceHistoryDB from './BalanceHistoryDB';

/**
 * Get all accounts using Drizzle
 * @returns {Promise<Array>}
 */
export const getAllAccounts = async () => {
  try {
    const db = await getDrizzle();
    const results = await db.select()
      .from(accounts)
      .orderBy(asc(accounts.displayOrder), desc(accounts.createdAt));
    return results || [];
  } catch (error) {
    console.error('Failed to get accounts:', error);
    throw error;
  }
};

/**
 * Get account by ID using Drizzle
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export const getAccountById = async (id) => {
  try {
    const db = await getDrizzle();
    const results = await db.select()
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1);
    return results[0] || null;
  } catch (error) {
    console.error('Failed to get account:', error);
    throw error;
  }
};

/**
 * Create a new account using Drizzle
 * @param {Object} account - Account data
 * @returns {Promise<Object>}
 */
export const createAccount = async (account) => {
  try {
    const db = await getDrizzle();
    const now = new Date().toISOString();

    // Get max order value and add 1 for new account
    const maxOrderResult = await db.select({
      maxOrder: sql`MAX(${accounts.displayOrder})`,
    }).from(accounts);

    const newOrder = (maxOrderResult[0]?.maxOrder ?? -1) + 1;

    const accountData = {
      name: account.name,
      balance: account.balance || '0',
      currency: account.currency || 'USD',
      displayOrder: account.display_order ?? account.displayOrder ?? newOrder,
      hidden: account.hidden ?? 0,
      monthlyTarget: account.monthly_target ?? account.monthlyTarget ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.insert(accounts).values(accountData).returning();

    return result[0];
  } catch (error) {
    console.error('Failed to create account:', error);
    throw error;
  }
};

/**
 * Update an existing account using Drizzle
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateAccount = async (id, updates) => {
  try {
    const db = await getDrizzle();
    const updatedAt = new Date().toISOString();
    const updateData = { updatedAt };

    // Build update object based on provided fields
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.balance !== undefined) updateData.balance = updates.balance;
    if (updates.currency !== undefined) updateData.currency = updates.currency;
    if (updates.hidden !== undefined) updateData.hidden = updates.hidden ? 1 : 0;
    if (updates.monthly_target !== undefined || updates.monthlyTarget !== undefined) {
      updateData.monthlyTarget = updates.monthly_target ?? updates.monthlyTarget;
    }

    if (Object.keys(updateData).length === 1) {
      return; // Nothing to update besides updatedAt
    }

    await db.update(accounts)
      .set(updateData)
      .where(eq(accounts.id, id));

    // Update today's balance history if balance changed
    if (updates.balance !== undefined) {
      await BalanceHistoryDB.updateTodayBalance(id, updates.balance);
    }
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
 * @throws {Error} If accounts have different currencies
 */
export const transferOperations = async (fromAccountId, toAccountId) => {
  try {
    return await executeTransaction(async (db) => {
      // Verify both accounts exist and have the same currency
      const fromAccount = await db.getFirstAsync(
        'SELECT id, currency FROM accounts WHERE id = ?',
        [fromAccountId],
      );
      const toAccount = await db.getFirstAsync(
        'SELECT id, currency FROM accounts WHERE id = ?',
        [toAccountId],
      );

      if (!fromAccount) {
        throw new Error(`Source account ${fromAccountId} not found`);
      }
      if (!toAccount) {
        throw new Error(`Destination account ${toAccountId} not found`);
      }
      if (fromAccount.currency !== toAccount.currency) {
        throw new Error(
          `Cannot transfer operations: accounts have different currencies (${fromAccount.currency} → ${toAccount.currency})`,
        );
      }

      // Update operations where the account is the source (account_id)
      const sourceResult = await db.runAsync(
        'UPDATE operations SET account_id = ? WHERE account_id = ?',
        [toAccountId, fromAccountId],
      );

      // Update operations where the account is the destination (to_account_id) for transfers
      const destResult = await db.runAsync(
        'UPDATE operations SET to_account_id = ? WHERE to_account_id = ?',
        [toAccountId, fromAccountId],
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
      [id, id],
    );
    return result ? result.count : 0;
  } catch (error) {
    console.error('Failed to get operation count:', error);
    throw error;
  }
};

/**
 * Delete an account (with optional operation transfer) using Drizzle
 * @param {string} id - Account ID to delete
 * @param {string|null} transferToAccountId - Optional account ID to transfer operations to
 * @returns {Promise<void>}
 * @throws {Error} If account has associated operations and no transfer account is specified
 */
export const deleteAccount = async (id, transferToAccountId = null) => {
  try {
    await executeTransaction(async (db) => {
      const result = await db.getFirstAsync(
        'SELECT COUNT(*) as count FROM operations WHERE account_id = ? OR to_account_id = ?',
        [id, id],
      );
      const operationCount = result ? result.count : 0;

      if (operationCount > 0) {
        if (!transferToAccountId) {
          throw new Error(
            `Cannot delete account: ${operationCount} transaction(s) are associated with this account. Please delete or reassign the transactions first.`,
          );
        }

        const fromAccount = await db.getFirstAsync(
          'SELECT id, currency FROM accounts WHERE id = ?',
          [id],
        );
        const toAccount = await db.getFirstAsync(
          'SELECT id, currency FROM accounts WHERE id = ?',
          [transferToAccountId],
        );

        if (!fromAccount) {
          throw new Error(`Source account ${id} not found`);
        }
        if (!toAccount) {
          throw new Error(`Destination account ${transferToAccountId} not found`);
        }
        if (fromAccount.currency !== toAccount.currency) {
          throw new Error(
            `Cannot transfer operations: accounts have different currencies (${fromAccount.currency} → ${toAccount.currency})`,
          );
        }

        await db.runAsync(
          'UPDATE operations SET account_id = ? WHERE account_id = ?',
          [transferToAccountId, id],
        );
        await db.runAsync(
          'UPDATE operations SET to_account_id = ? WHERE to_account_id = ?',
          [transferToAccountId, id],
        );
      }

      await db.runAsync('DELETE FROM accounts WHERE id = ?', [id]);
    });
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
        [id],
      );

      if (!account) {
        throw new Error(`Account ${id} not found`);
      }

      // Use Currency utilities for precise arithmetic
      const newBalance = Currency.add(account.balance, delta);

      // Update balance
      await db.runAsync(
        'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
        [newBalance, new Date().toISOString(), id],
      );

      // Update today's balance history
      await BalanceHistoryDB.updateTodayBalance(id, newBalance, db);
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
          [newBalance, now, accountId],
        );

        // Update today's balance history
        await BalanceHistoryDB.updateTodayBalance(accountId, newBalance, db);
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
    const db = await getDrizzle();
    const results = await db.select({ balance: accounts.balance })
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1);
    return results[0]?.balance || '0';
  } catch (error) {
    console.error('Failed to get account balance:', error);
    throw error;
  }
};

/**
 * Check if account exists using Drizzle
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export const accountExists = async (id) => {
  try {
    const db = await getDrizzle();
    const results = await db.select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1);
    return results.length > 0;
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
    // Validate input to prevent duplicate IDs or invalid data
    const seenIds = new Set();
    for (const item of orderedAccounts) {
      if (!item.id) {
        throw new Error('Invalid account data: missing id');
      }
      if (seenIds.has(item.id)) {
        throw new Error(`Duplicate account ID in reorder: ${item.id}`);
      }
      seenIds.add(item.id);
    }

    const now = new Date().toISOString();

    await executeTransaction(async (db) => {
      for (const { id, display_order } of orderedAccounts) {
        await db.update(accounts)
          .set({
            displayOrder: display_order,
            updatedAt: now,
          })
          .where(eq(accounts.id, id));
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

    await executeTransaction(async (db) => {
      // Get current balance
      const account = await db.getFirstAsync(
        'SELECT balance FROM accounts WHERE id = ?',
        [accountId],
      );

      if (!account) {
        throw new Error(`Account ${accountId} not found`);
      }

      const currentBalanceStr = account.balance || '0';
      const targetBalanceStr = String(newBalance) || '0';

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
        [accountId, today],
      );

      let originalBalanceStr;
      let adjustmentHistory = [];

      if (existingOperation) {
        // Prefer the stored original_balance column; fall back to parsing description
        // (negative numbers included via [-\d.] group for older records)
        if (existingOperation.original_balance != null) {
          originalBalanceStr = existingOperation.original_balance;
        } else {
          const descMatch = existingOperation.description?.match(/from\s+(-?[\d.]+)/);
          originalBalanceStr = descMatch ? descMatch[1] : currentBalanceStr;
        }

        // Extract adjustment history from description
        const historyMatch = existingOperation.description?.match(/→\s*([-\d.\s→]+)$/);
        if (historyMatch) {
          adjustmentHistory = historyMatch[1].split('→').map(v => v.trim()).filter(Boolean);
        }
      } else {
        // First adjustment of the day - current balance is the original
        originalBalanceStr = currentBalanceStr;
      }

      // Add current balance to history if it differs from the last recorded entry
      const lastHistoryValue = adjustmentHistory.length > 0
        ? adjustmentHistory[adjustmentHistory.length - 1]
        : originalBalanceStr;

      if (Currency.compare(currentBalanceStr, lastHistoryValue) !== 0) {
        adjustmentHistory.push(Currency.formatAmount(currentBalanceStr));
      }

      // Add target balance to history
      adjustmentHistory.push(Currency.formatAmount(targetBalanceStr));

      // Calculate total cumulative adjustment from original balance (precise)
      const totalDeltaStr = Currency.subtract(targetBalanceStr, originalBalanceStr);
      const absoluteDeltaStr = Currency.abs(totalDeltaStr);

      // Determine operation type based on cumulative delta
      const operationType = Currency.isNegative(totalDeltaStr) ? 'expense' : 'income';

      // Get shadow categories
      const shadowCategories = await db.getAllAsync(
        'SELECT * FROM categories WHERE is_shadow = 1',
      );

      const shadowExpenseCategory = shadowCategories.find(
        c => c.category_type === 'expense' && c.is_shadow === 1,
      );
      const shadowIncomeCategory = shadowCategories.find(
        c => c.category_type === 'income' && c.is_shadow === 1,
      );

      if (!shadowExpenseCategory || !shadowIncomeCategory) {
        throw new Error('Shadow categories not found. Please reinitialize the database.');
      }

      const categoryId = operationType === 'expense'
        ? shadowExpenseCategory.id
        : shadowIncomeCategory.id;

      // Build description with adjustment history
      const historyString = adjustmentHistory.join(' → ');
      const originalFormatted = Currency.formatAmount(originalBalanceStr);
      const fullDescription = description
        ? `${description}\nBalance adjusted from ${originalFormatted} → ${historyString}`
        : `Balance adjusted from ${originalFormatted} → ${historyString}`;

      if (existingOperation) {
        // Check if total delta is 0 - if so, delete the operation
        if (Currency.isZero(totalDeltaStr)) {
          console.log('Cumulative delta is 0, deleting adjustment operation:', existingOperation.id);

          // Reverse the old operation's effect on balance
          const oldAmountStr = existingOperation.amount || '0';
          const oldType = existingOperation.type;
          let balanceAdjustmentStr = '0';

          if (oldType === 'expense') {
            balanceAdjustmentStr = oldAmountStr; // add back the expense
          } else if (oldType === 'income') {
            balanceAdjustmentStr = Currency.subtract('0', oldAmountStr); // remove the income
          }

          // Delete the operation
          await db.runAsync('DELETE FROM operations WHERE id = ?', [existingOperation.id]);
          console.log('Adjustment operation deleted successfully');

          // Update account balance
          const newBalanceValue = Currency.add(currentBalanceStr, balanceAdjustmentStr);
          await db.runAsync(
            'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
            [newBalanceValue, new Date().toISOString(), accountId],
          );

          // Update today's balance history
          await BalanceHistoryDB.updateTodayBalance(accountId, newBalanceValue, db);
        } else {
          // Update existing operation (preserve original_balance from first creation)
          console.log('Updating existing adjustment operation:', existingOperation.id);
          await db.runAsync(
            'UPDATE operations SET type = ?, amount = ?, category_id = ?, description = ? WHERE id = ?',
            [operationType, absoluteDeltaStr, categoryId, fullDescription, existingOperation.id],
          );
          console.log('Adjustment operation updated successfully');

          // Reverse old operation's effect, then apply new effect
          const oldAmountStr = existingOperation.amount || '0';
          const oldType = existingOperation.type;
          let balanceAdjustmentStr = '0';

          if (oldType === 'expense') {
            balanceAdjustmentStr = oldAmountStr; // add back the expense
          } else if (oldType === 'income') {
            balanceAdjustmentStr = Currency.subtract('0', oldAmountStr); // remove the income
          }

          if (operationType === 'expense') {
            balanceAdjustmentStr = Currency.subtract(balanceAdjustmentStr, absoluteDeltaStr);
          } else if (operationType === 'income') {
            balanceAdjustmentStr = Currency.add(balanceAdjustmentStr, absoluteDeltaStr);
          }

          // Update account balance
          const newBalanceValue = Currency.add(currentBalanceStr, balanceAdjustmentStr);
          await db.runAsync(
            'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
            [newBalanceValue, new Date().toISOString(), accountId],
          );

          // Update today's balance history
          await BalanceHistoryDB.updateTodayBalance(accountId, newBalanceValue, db);
        }
      } else {
        // No existing adjustment for today — if delta is zero there is nothing to do.
        // This guards against calling adjustAccountBalance when the balance hasn't
        // actually changed (e.g. only a non-balance field like 'hidden' was edited)
        // which would otherwise try to INSERT a zero-amount operation and crash.
        if (Currency.isZero(totalDeltaStr)) {
          return;
        }

        // Create new adjustment operation, recording original_balance in its own column
        console.log('Creating new adjustment operation:', {
          type: operationType,
          amount: absoluteDeltaStr,
          categoryId,
          date: today,
        });

        const result = await db.runAsync(
          'INSERT INTO operations (type, amount, account_id, category_id, to_account_id, date, created_at, description, original_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            operationType,
            absoluteDeltaStr,
            accountId,
            categoryId,
            null,
            today,
            new Date().toISOString(),
            fullDescription,
            originalBalanceStr,
          ],
        );
        const newOperationId = result.lastInsertRowId;
        console.log('Adjustment operation created successfully with ID:', newOperationId);

        // Apply delta to account balance
        const deltaStr = operationType === 'expense'
          ? Currency.subtract('0', absoluteDeltaStr)
          : absoluteDeltaStr;
        const newBalanceValue = Currency.add(currentBalanceStr, deltaStr);

        await db.runAsync(
          'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
          [newBalanceValue, new Date().toISOString(), accountId],
        );

        // Update today's balance history
        await BalanceHistoryDB.updateTodayBalance(accountId, newBalanceValue, db);
      }
    });

    console.log('Account balance adjustment completed successfully');
  } catch (error) {
    console.error('Failed to adjust account balance:', error);
    throw error;
  }
};
