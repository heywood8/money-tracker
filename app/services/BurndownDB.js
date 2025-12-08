/**
 * Burndown Graph Calculations Service
 *
 * Provides functions to calculate daily account balances over time for burndown visualization.
 * Uses on-demand calculation from operations rather than storing daily snapshots.
 * 
 * OPTIMIZED: Uses single query to fetch all operations, then calculates balances in memory.
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
 * Calculate balance at a specific date using pre-fetched operations (in-memory)
 * @param {string} accountId - Account ID
 * @param {string} targetDate - Target date (YYYY-MM-DD)
 * @param {Array} allOperations - Pre-fetched operations (must include all ops from targetDate to today)
 * @param {string} currentBalance - Current account balance
 * @returns {string} Balance at the end of target date
 */
const calculateBalanceAtDateInMemory = (accountId, targetDate, allOperations, currentBalance) => {
  // Filter operations strictly after target date
  const opsAfterTarget = allOperations.filter(op => op.date > targetDate);

  // Reverse-apply all future operations (in reverse order)
  let balance = currentBalance;
  for (let i = opsAfterTarget.length - 1; i >= 0; i--) {
    balance = reverseOperation(balance, opsAfterTarget[i], accountId);
  }

  return balance;
};

/**
 * Calculate daily balances using pre-fetched operations (in-memory)
 * @param {string} accountId - Account ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {Array} allOperations - Pre-fetched operations covering the entire range needed
 * @param {string} currentBalance - Current account balance
 * @returns {Array<{day: number, date: string, balance: string}>}
 */
const calculateDailyBalancesInMemory = (accountId, startDate, endDate, allOperations, currentBalance) => {
  // Get balance at day before startDate
  const dayBefore = new Date(startDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const dayBeforeStr = dayBefore.toISOString().split('T')[0];

  let runningBalance = calculateBalanceAtDateInMemory(accountId, dayBeforeStr, allOperations, currentBalance);

  // Filter operations within the date range
  const rangeOps = allOperations.filter(op => op.date >= startDate && op.date <= endDate);

  // Group operations by date
  const opsByDate = {};
  rangeOps.forEach(op => {
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
      runningBalance = applyOperation(runningBalance, op, accountId);
    }

    dailyBalances.push({
      day: dayNum,
      date: dateStr,
      balance: runningBalance
    });

    dayNum++;
  }

  return dailyBalances;
};

/**
 * Calculate N-month mean for each day position (1-31) - OPTIMIZED
 * Fetches all operations once and calculates balances in memory.
 * 
 * Performance: Single DB query instead of hundreds of queries
 *
 * @param {string} accountId - Account ID
 * @param {number} year - Target year
 * @param {number} month - Target month (0-11)
 * @param {number} numMonths - Number of months to look back (default: 12)
 * @param {Array} allOperations - Pre-fetched operations
 * @param {string} currentBalance - Current account balance
 * @returns {Array<{day: number, meanBalance: string}>}
 */
const calculateMonthMeanInMemory = (accountId, year, month, numMonths = 12, allOperations, currentBalance) => {
  // Calculate days in the target month
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  
  const meanBalances = [];

  // For each day position (1-31)
  for (let dayPos = 1; dayPos <= daysInMonth; dayPos++) {
    const balances = [];

    // Look back N months
    for (let monthOffset = 1; monthOffset <= numMonths; monthOffset++) {
      const targetDate = new Date(Date.UTC(year, month - monthOffset, dayPos));

      // Skip if this day doesn't exist in that month (e.g., Feb 30)
      if (targetDate.getUTCDate() !== dayPos) {
        continue;
      }

      const dateStr = targetDate.toISOString().split('T')[0];

      try {
        const balance = calculateBalanceAtDateInMemory(accountId, dateStr, allOperations, currentBalance);
        balances.push(parseFloat(balance));
      } catch (error) {
        console.warn(`Could not calculate balance for ${dateStr}:`, error.message);
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
};

/**
 * Get complete burndown data for rendering - OPTIMIZED
 * Fetches all operations in a single query, then calculates everything in memory.
 * 
 * Performance: 2-3 DB queries instead of 400+ (~95% reduction in DB calls)
 * 
 * @param {string} accountId - Account ID
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @param {number} numMonthsForMean - Number of months for mean calculation (default: 12)
 * @returns {Promise<Object>} Burndown data object
 */
export const getBurndownData = async (accountId, year, month, numMonthsForMean = 12) => {
  try {
    // Calculate date ranges
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const currentMonthStart = new Date(Date.UTC(year, month, 1)).toISOString().split('T')[0];
    const currentMonthEnd = new Date(Date.UTC(year, month, daysInMonth)).toISOString().split('T')[0];

    const previousMonthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const previousMonthStart = new Date(Date.UTC(year, month - 1, 1)).toISOString().split('T')[0];
    const previousMonthEnd = new Date(Date.UTC(year, month - 1, previousMonthDays)).toISOString().split('T')[0];

    // Calculate the oldest date we need (N+1 months back for N-month mean calculation)
    const oldestDate = new Date(Date.UTC(year, month - (numMonthsForMean + 1), 1));
    const oldestDateStr = oldestDate.toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    // OPTIMIZATION: Fetch ALL operations in a single query
    const [allOperations, currentBalance] = await Promise.all([
      getOperationsForAccount(accountId, oldestDateStr, today),
      getCurrentBalance(accountId)
    ]);

    // Calculate all data in memory (no more DB queries)
    const currentMonthData = calculateDailyBalancesInMemory(
      accountId, currentMonthStart, currentMonthEnd, allOperations, currentBalance
    );

    const previousMonthData = calculateDailyBalancesInMemory(
      accountId, previousMonthStart, previousMonthEnd, allOperations, currentBalance
    );

    const meanData = calculateMonthMeanInMemory(
      accountId, year, month, numMonthsForMean, allOperations, currentBalance
    );

    // Generate planned line (from highest balance in current month to zero)
    const plannedData = [];
    let startingBalance;

    if (currentMonthData.length > 0) {
      const maxBalance = currentMonthData.reduce((max, day) => {
        const dayBalance = parseFloat(day.balance);
        return dayBalance > max ? dayBalance : max;
      }, parseFloat(currentMonthData[0].balance));

      startingBalance = maxBalance.toString();
    } else {
      startingBalance = currentBalance;
    }

    const dailyDecrease = Currency.divide(startingBalance, daysInMonth);

    for (let day = 1; day <= daysInMonth; day++) {
      const remainingBalance = Currency.subtract(
        startingBalance,
        Currency.multiply(dailyDecrease, day)
      );
      plannedData.push(parseFloat(remainingBalance));
    }

    // Format data for chart
    const currentBalances = currentMonthData.map(d => parseFloat(d.balance));

    const previousBalances = [];
    const lastPreviousBalance = previousMonthData.length > 0 
      ? parseFloat(previousMonthData[previousMonthData.length - 1].balance) 
      : 0;

    for (let i = 0; i < daysInMonth; i++) {
      if (i < previousMonthData.length) {
        previousBalances.push(parseFloat(previousMonthData[i].balance));
      } else {
        previousBalances.push(lastPreviousBalance);
      }
    }

    const meanBalances = meanData.map(d => parseFloat(d.meanBalance));

    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    const currentDay = isCurrentMonth ? now.getDate() : daysInMonth;

    return {
      current: currentBalances,
      previous: previousBalances,
      planned: plannedData,
      mean: meanBalances,
      daysInMonth,
      currentDay,
      isCurrentMonth,
      currentMonthData,
      previousMonthData,
      meanData
    };
  } catch (error) {
    console.error('Error getting burndown data:', error);
    throw error;
  }
};
