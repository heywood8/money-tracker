/**
 * Scope decision: manual repeat is the whole feature — there are no recurring
 * operation rules, and there will not be (issue #1714, closed as not planned).
 *
 * The obvious-looking next step from here is a `recurring_operations` table
 * (cadence + next_due), a background materialiser that inserts rent/salary rows
 * on a schedule, and a management panel to pause or delete rules. We are not
 * building that. Scheduled money that has not happened yet is a *plan*, and the
 * app already models plans: recurring `budget_plan_lines` (Budgets v3, migration
 * 0019) carry the cadence, the amount and the category. Auto-inserting
 * operations would put unverified rows in the ledger — rent that silently posts
 * after the standing order was cancelled, salary posted on a payday that slipped
 * — and every one of them would need reconciling against reality anyway. That
 * costs more than the tap it saves.
 *
 * So the split is deliberate: `budget_plan_lines` answer "what is due", the
 * ledger holds only what actually moved, and `buildRepeatedOperation` below is
 * the one-tap bridge the user takes once the money really moved. Anything that
 * reintroduces scheduled auto-insertion belongs in a new discussion, not here.
 */

/**
 * Build a fresh operation payload that repeats an existing one (QoL-7 "Repeat").
 *
 * Every money-bearing field is copied verbatim — amount, source/destination
 * accounts, the multi-currency exchange metadata, and the exclude-from-average /
 * exclude-from-charts flags — so the duplicate reproduces the original's balance
 * impact and its analytic visibility exactly. Only
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
  excludeFromCharts: operation.excludeFromCharts,
});
