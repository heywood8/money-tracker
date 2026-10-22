/**
 * The month-end spending forecast on the Graphs screen.
 *
 * The forecast carries a daily spending rate across the days left in the month.
 * That rate is averaged over the last 30 days, not over the month so far:
 * spending is lumpy (rent on the 1st, a big purchase on the 3rd), and averaged
 * over only the few days elapsed, one such day dominates the rate and the
 * projection swings wildly until the month is well underway. Thirty trailing
 * days hold a whole cycle of those lumps, so the rate means the same thing on
 * the 2nd as on the 28th.
 */
import { parseLocalDay } from './dateUtils';

export const SPENDING_WINDOW_DAYS = 30;

const DAY_MS = 86400000;

// Whole calendar days from one local day to another. Measured on UTC dates so a
// DST switch inside the span can't round it a day short or long.
const daysBetween = (from, to) => Math.round(
  (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
    - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / DAY_MS,
);

/**
 * First day of the trailing window that ends today, today included.
 *
 * @param {Date} now
 * @returns {Date} local midnight
 */
export const spendingWindowStart = (now) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() - (SPENDING_WINDOW_DAYS - 1));

/**
 * How many days the window's spending is spread over.
 *
 * Normally the full 30. An account younger than that was not tracked before its
 * first operation, and counting those days would dilute the average — a week of
 * spending divided by 30 forecasts a quarter of the real rate. The window's
 * total needs no matching change: there is nothing to sum before the first
 * operation, so the full window and the shortened one hold the same spending.
 *
 * @param {Date} now
 * @param {string|null} firstActivityDate - 'YYYY-MM-DD' of the first operation; null when unknown
 * @returns {number} 1…SPENDING_WINDOW_DAYS
 */
export const spendingWindowDays = (now, firstActivityDate) => {
  const start = spendingWindowStart(now);
  if (!firstActivityDate) return SPENDING_WINDOW_DAYS;
  const first = parseLocalDay(firstActivityDate);
  if (Number.isNaN(first.getTime()) || first <= start) return SPENDING_WINDOW_DAYS;
  // A first operation dated after today still leaves today itself to divide by.
  return Math.max(1, Math.min(SPENDING_WINDOW_DAYS, daysBetween(first, now) + 1));
};

/**
 * The forecast for the selected period, or null when it has none: only the
 * running month has days left to forecast, nothing spent means nothing to carry
 * forward, and without the window's figures there is no rate to carry.
 *
 * @param {object} params
 * @param {number} params.monthToDateExpenses - spent from the 1st through today
 * @param {number|null} [params.recentExpenses] - spent over the trailing window
 * @param {number|null} [params.recentDays] - the window's length (spendingWindowDays)
 * @param {number} params.selectedYear
 * @param {number|null} params.selectedMonth - 0-based; null for the whole-year view
 * @param {Date} [params.now]
 * @returns {{
 *   currentSpending: number, predictedTotal: number, predictedRemaining: number,
 *   dailyAverage: number, daysElapsed: number, daysInMonth: number, percentElapsed: number,
 * }|null}
 */
export const computeSpendingPrediction = ({
  monthToDateExpenses,
  recentExpenses = null,
  recentDays = null,
  selectedYear,
  selectedMonth,
  now = new Date(),
}) => {
  if (selectedMonth === null || selectedMonth === undefined) return null;
  if (selectedYear !== now.getFullYear() || selectedMonth !== now.getMonth()) return null;

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  // Days elapsed includes today: the month-to-date total covers the 1st through
  // today, so the days left to forecast start tomorrow.
  const daysElapsed = now.getDate();

  // The window's figures arrive with the running month's load. Until they do,
  // the totals on hand still belong to the period the user just left, and a
  // forecast built from them would be another month's spending.
  if (!Number.isFinite(recentExpenses) || !(recentDays > 0)) return null;
  const dailyAverage = recentExpenses / recentDays;

  if (monthToDateExpenses === 0 && dailyAverage === 0) return null;

  const predictedTotal = monthToDateExpenses + dailyAverage * (daysInMonth - daysElapsed);

  return {
    currentSpending: monthToDateExpenses,
    predictedTotal,
    predictedRemaining: predictedTotal - monthToDateExpenses,
    dailyAverage,
    daysElapsed,
    daysInMonth,
    percentElapsed: (daysElapsed / daysInMonth) * 100,
  };
};
