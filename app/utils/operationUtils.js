/**
 * Build a fresh operation payload that repeats an existing one (QoL-7 "Repeat").
 *
 * Every money-bearing field is copied verbatim — amount, source/destination
 * accounts, the multi-currency exchange metadata, and the exclude-from-average
 * flag — so the duplicate reproduces the original's balance impact exactly. Only
 * the date is re-stamped to `dateString`. Volatile per-event context is dropped
 * on purpose: the row id / createdAt (a new row is inserted) and latitude/
 * longitude (a repeat happens here-and-now, so the original's coordinates would
 * be misleading).
 *
 * @param {Object} operation - Source operation (camelCase, as read from OperationsDB)
 * @param {string} dateString - Target date in YYYY-MM-DD (local) form
 * @returns {Object} Operation payload shaped for OperationsDB.createOperation
 */
export const buildRepeatedOperation = (operation, dateString) => ({
  type: operation.type,
  amount: operation.amount,
  accountId: operation.accountId,
  categoryId: operation.categoryId,
  toAccountId: operation.toAccountId,
  date: dateString,
  description: operation.description,
  exchangeRate: operation.exchangeRate,
  destinationAmount: operation.destinationAmount,
  sourceCurrency: operation.sourceCurrency,
  destinationCurrency: operation.destinationCurrency,
  excludeFromAvg: operation.excludeFromAvg,
});
