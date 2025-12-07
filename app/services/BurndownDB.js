/**
 * Burndown Graph Calculations Service
 *
 * Provides functions to calculate daily account balances over time for burndown visualization.
 * Uses on-demand calculation from operations rather than storing daily snapshots.
 */

import * as Currency from './currency';
import { queryAll, getDatabase } from './db';

/**
 * Get all operations affecting an account within a date range
 * @param {string} accountId - Account ID
 * @param {string} startDate - Start date (YYYY-MM-DD), inclusive
 * @param {string} endDate - End date (YYYY-MM-DD), inclusive
 * @returns {Promise<Array>} Array of operations
 */
const getOperationsForAccount = async (accountId, startDate, endDate) => {
  const query = `
    SELECT
      id,
      type,
      amount,
      account_id,
      to_account_id,
      date,
      destination_amount,
      source_currency,
      destination_currency
    FROM operations
    WHERE (account_id = ? OR to_account_id = ?)
      AND date >= ?
      AND date <= ?
    ORDER BY date ASC, created_at ASC
  `;

  return await queryAll(query, [accountId, accountId, startDate, endDate]);
};

/**
 * Get current balance of an account
 * @param {string} accountId - Account ID
 * @returns {Promise<string>} Current balance as string
 */
const getCurrentBalance = async (accountId) => {
  const { raw: db } = await getDatabase();
  const result = await db.getFirstAsync(
    'SELECT balance FROM accounts WHERE id = ?',
    [accountId]
  );
  return result ? result.balance : '0';
};

/**
 * Apply an operation to a balance (forward calculation)
 * @param {string} currentBalance - Current balance
 * @param {Object} operation - Operation object
 * @param {string} accountId - Account ID being calculated
 * @returns {string} New balance after operation
 */
const applyOperation = (currentBalance, operation, accountId) => {
  let newBalance = currentBalance;

  if (operation.type === 'expense' && operation.account_id === accountId) {
    // Subtract expense from balance
    newBalance = Currency.subtract(newBalance, operation.amount);
  } else if (operation.type === 'income' && operation.account_id === accountId) {
    // Add income to balance
    newBalance = Currency.add(newBalance, operation.amount);
  } else if (operation.type === 'transfer') {
    if (operation.account_id === accountId) {
      // Account is source of transfer - subtract amount
      newBalance = Currency.subtract(newBalance, operation.amount);
    } else if (operation.to_account_id === accountId) {
      // Account is destination of transfer - add destination amount (or amount if same currency)
      const amountToAdd = operation.destination_amount || operation.amount;
      newBalance = Currency.add(newBalance, amountToAdd);
    }
  }

  return newBalance;
};

/**
 * Reverse an operation from a balance (backward calculation)
 * @param {string} currentBalance - Current balance
 * @param {Object} operation - Operation object
 * @param {string} accountId - Account ID being calculated
 * @returns {string} Balance before the operation
 */
const reverseOperation = (currentBalance, operation, accountId) => {
  let previousBalance = currentBalance;

  if (operation.type === 'expense' && operation.account_id === accountId) {
    // Add back expense (reverse subtraction)
    previousBalance = Currency.add(previousBalance, operation.amount);
  } else if (operation.type === 'income' && operation.account_id === accountId) {
    // Subtract income (reverse addition)
    previousBalance = Currency.subtract(previousBalance, operation.amount);
  } else if (operation.type === 'transfer') {
    if (operation.account_id === accountId) {
      // Account was source - add back the amount
      previousBalance = Currency.add(previousBalance, operation.amount);
    } else if (operation.to_account_id === accountId) {
      // Account was destination - subtract the received amount
      const amountToSubtract = operation.destination_amount || operation.amount;
      previousBalance = Currency.subtract(previousBalance, amountToSubtract);
    }
  }

  return previousBalance;
};

/**
 * Calculate account balance at a specific date
 * Uses backward calculation: current balance minus all future operations
 * @param {string} accountId - Account ID
 * @param {string} targetDate - Target date (YYYY-MM-DD)
 * @returns {Promise<string>} Balance at the end of target date
 */
export const getBalanceAtDate = async (accountId, targetDate) => {
  try {
    // Get current balance
    const currentBalance = await getCurrentBalance(accountId);

    // Get all operations after target date
    const today = new Date().toISOString().split('T')[0];
    const futureOps = await getOperationsForAccount(
      accountId,
      targetDate,
      today
    );

    // Filter to only operations strictly after target date
    const opsAfterTarget = futureOps.filter(op => op.date > targetDate);

    // Reverse-apply all future operations
    let balance = currentBalance;
    for (const op of opsAfterTarget.reverse()) {
      balance = reverseOperation(balance, op, accountId);
    }

    return balance;
  } catch (error) {
    console.error('Error calculating balance at date:', error);
    throw error;
  }
};

/**
 * Calculate daily balances for a date range
 * @param {string} accountId - Account ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array<{day: number, date: string, balance: string}>>}
 */
export const getDailyBalances = async (accountId, startDate, endDate) => {
  try {
    // Get balance at start date (end of day before startDate)
    const dayBefore = new Date(startDate);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayBeforeStr = dayBefore.toISOString().split('T')[0];

    let currentBalance = await getBalanceAtDate(accountId, dayBeforeStr);

    // Get all operations in the range
    const operations = await getOperationsForAccount(accountId, startDate, endDate);

    // Group operations by date
    const opsByDate = {};
    operations.forEach(op => {
      if (!opsByDate[op.date]) {
        opsByDate[op.date] = [];
      }
      opsByDate[op.date].push(op);
    });

    // Generate daily balances
    const dailyBalances = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    let dayNum = 1;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];

      // Apply all operations for this date
      const dayOps = opsByDate[dateStr] || [];
      for (const op of dayOps) {
        currentBalance = applyOperation(currentBalance, op, accountId);
      }

      dailyBalances.push({
        day: dayNum,
        date: dateStr,
        balance: currentBalance
      });

      dayNum++;
    }

    return dailyBalances;
  } catch (error) {
    console.error('Error calculating daily balances:', error);
    throw error;
  }
};

/**
 * Calculate 12-month mean for each day position (1-31)
 * Day 1 shows average of all day-1s from previous 12 months, etc.
 *
 * PERFORMANCE NOTE: This function uses an N+1 query pattern.
 * For a 31-day month, it makes up to 372 database queries (31 days × 12 months).
 * Expected load time: 2-5 seconds on mid-range Android devices.
 *
 * Future optimization: Fetch all operations for 12-month period once,
 * then calculate balances in memory. Estimated 80% performance improvement.
 *
 * @param {string} accountId - Account ID
 * @param {number} year - Target year
 * @param {number} month - Target month (0-11)
 * @returns {Promise<Array<{day: number, meanBalance: string}>>}
 */
export const get12MonthMean = async (accountId, year, month) => {
  try {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const meanBalances = [];

    // For each day position (1-31)
    for (let dayPos = 1; dayPos <= daysInMonth; dayPos++) {
      const balances = [];

      // Look back 12 months
      for (let monthOffset = 1; monthOffset <= 12; monthOffset++) {
        // NOTE: Date constructor with (year, month, day) interprets dates in local timezone
        // but we immediately convert to ISO date string (YYYY-MM-DD), which is timezone-independent
        const targetDate = new Date(year, month - monthOffset, dayPos);

        // Skip if this day doesn't exist in that month (e.g., Feb 30)
        if (targetDate.getDate() !== dayPos) {
          continue;
        }

        const dateStr = targetDate.toISOString().split('T')[0];

        try {
          const balance = await getBalanceAtDate(accountId, dateStr);
          balances.push(parseFloat(balance));
        } catch (error) {
          // If we can't get balance for this date, skip it
          console.warn(`Could not get balance for ${dateStr}:`, error.message);
        }
      }

      // Calculate mean
      let meanBalance = '0';
      if (balances.length > 0) {
        const sum = balances.reduce((acc, val) => acc + val, 0);
        const mean = sum / balances.length;
        meanBalance = Currency.formatAmount(mean.toString());
      }

      meanBalances.push({
        day: dayPos,
        meanBalance
      });
    }

    return meanBalances;
  } catch (error) {
    console.error('Error calculating 12-month mean:', error);
    throw error;
  }
};

/**
 * Get complete burndown data for rendering
 * Returns all 4 lines: current month, previous month, planned, and 12-month mean
 * @param {string} accountId - Account ID
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @returns {Promise<Object>} Burndown data object
 */
export const getBurndownData = async (accountId, year, month) => {
  try {
    // Calculate date ranges
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const currentMonthStart = new Date(year, month, 1).toISOString().split('T')[0];
    const currentMonthEnd = new Date(year, month, daysInMonth).toISOString().split('T')[0];

    const previousMonthDays = new Date(year, month, 0).getDate();
    const previousMonthStart = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const previousMonthEnd = new Date(year, month - 1, previousMonthDays).toISOString().split('T')[0];

    // Get current month daily balances
    const currentMonthData = await getDailyBalances(accountId, currentMonthStart, currentMonthEnd);

    // Get previous month daily balances
    const previousMonthData = await getDailyBalances(accountId, previousMonthStart, previousMonthEnd);

    // Get 12-month mean
    const meanData = await get12MonthMean(accountId, year, month);

    // Generate planned line (from highest balance in current month to zero)
    const plannedData = [];
    let startingBalance;

    if (currentMonthData.length > 0) {
      // Find the highest balance in the current month
      const maxBalance = currentMonthData.reduce((max, day) => {
        const dayBalance = parseFloat(day.balance);
        return dayBalance > max ? dayBalance : max;
      }, parseFloat(currentMonthData[0].balance));

      startingBalance = maxBalance.toString();
    } else {
      // Fallback to current balance if no data yet
      startingBalance = await getCurrentBalance(accountId);
    }

    const dailyDecrease = Currency.divide(startingBalance, daysInMonth);

    for (let day = 1; day <= daysInMonth; day++) {
      const remainingBalance = Currency.subtract(
        startingBalance,
        Currency.multiply(dailyDecrease, day)
      );
      plannedData.push(parseFloat(remainingBalance));
    }

    // Format data for chart (extract balance values as numbers)
    const currentBalances = currentMonthData.map(d => parseFloat(d.balance));

    // Pad previous month data to match current month length (for proper chart display)
    const previousBalances = [];
    for (let i = 0; i < daysInMonth; i++) {
      if (i < previousMonthData.length) {
        previousBalances.push(parseFloat(previousMonthData[i].balance));
      } else {
        // If previous month has fewer days, pad with last value
        previousBalances.push(previousMonthData.length > 0 ? parseFloat(previousMonthData[previousMonthData.length - 1].balance) : 0);
      }
    }

    const meanBalances = meanData.map(d => parseFloat(d.meanBalance));

    // Check if we're viewing the current month
    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    const currentDay = isCurrentMonth ? now.getDate() : daysInMonth;

    return {
      current: currentBalances,
      previous: previousBalances,
      planned: plannedData,
      mean: meanBalances,
      daysInMonth,
      currentDay, // Add current day for truncating current month line
      isCurrentMonth,
      currentMonthData,  // Include full data for debugging
      previousMonthData,
      meanData
    };
  } catch (error) {
    console.error('Error getting burndown data:', error);
    throw error;
  }
};
