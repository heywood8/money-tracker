import * as Currency from '../services/currency';

/**
 * The numbers the operations list shows above a search's results: how many
 * operations matched, what they add up to, and (for a search by one label or
 * one category) the last few months of that spending as a bar chart.
 *
 * Computed from the result rows themselves, never from a separate query: every
 * filtered load fetches all matching operations at once (see
 * OperationsActionsContext.loadInitialOperations), and the label match is made
 * in JS, so the list IS the result set. Summing what is on screen means the
 * figures cannot disagree with the rows under them.
 */

// How many calendar months the chart covers, ending with the current one.
export const INSIGHT_MONTHS = 6;

const MONEY_TYPES = ['expense', 'income'];

const isAmount = (value) => !isNaN(parseFloat(value));

/**
 * The last `count` calendar months ending with `now`'s, oldest first.
 * @param {Date} now
 * @param {number} count
 * @returns {{ key: string, year: number, month: number }[]} month is 0-11, key 'YYYY-MM'
 */
export const lastMonths = (now, count = INSIGHT_MONTHS) => {
  const months = [];
  for (let back = count - 1; back >= 0; back--) {
    const first = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const year = first.getFullYear();
    const month = first.getMonth();
    months.push({ key: `${year}-${String(month + 1).padStart(2, '0')}`, year, month });
  }
  return months;
};

// The key in `counts` with the highest count; the first one seen wins a tie, so
// the answer is stable for a given row order.
const mostFrequent = (counts) => {
  let best = null;
  for (const [key, count] of counts) {
    if (best === null || count > best[1]) best = [key, count];
  }
  return best ? best[0] : null;
};

/**
 * @param {Object[]} operations - the rows the list shows (camelCase fields)
 * @param {Map<*, string>} currencyByAccountId - each account's currency
 * @param {Object} [options]
 * @param {'expense'|'income'|'auto'|null} [options.chartType=null] - which
 *   money the chart draws. `null` draws none; 'auto' picks whichever of expense
 *   and income the results hold more of (a label can be on either side).
 * @param {Date} [options.now=new Date()]
 * @param {number} [options.months=INSIGHT_MONTHS]
 * @returns {{
 *   count: number,
 *   totals: { expense: Object<string, string>, income: Object<string, string> },
 *   chart: null | {
 *     type: 'expense'|'income',
 *     currency: string,
 *     months: { key: string, year: number, month: number, amount: string }[],
 *   },
 * }}
 *   Totals are decimal strings per currency code. Transfers are counted but not
 *   summed: they move money between the user's own accounts rather than spend
 *   or earn it, which is also why the day headers leave them out.
 */
export const buildSearchInsight = (operations, currencyByAccountId, options = {}) => {
  const { chartType = null, now = new Date(), months: monthCount = INSIGHT_MONTHS } = options;
  const totals = { expense: {}, income: {} };
  // Per type, over the rows the chart may draw (not hidden from charts): how
  // many there are, to pick the side, and how many each currency carries, to
  // pick the currency. Counting hidden rows here would pick a side or currency
  // whose bars then come out empty.
  const currencyCounts = { expense: new Map(), income: new Map() };
  const typeCounts = { expense: 0, income: 0 };

  for (const operation of operations) {
    if (!MONEY_TYPES.includes(operation.type)) continue;
    const currency = currencyByAccountId.get(operation.accountId);
    if (!currency || !isAmount(operation.amount)) continue;
    // Accumulated exact and rounded once at display, as the day headers do: a
    // whole-unit currency can still carry fractions restored from a CSV.
    totals[operation.type][currency] = Currency.add(totals[operation.type][currency] || '0', operation.amount);
    if (operation.excludeFromCharts) continue;
    typeCounts[operation.type] += 1;
    const perCurrency = currencyCounts[operation.type];
    perCurrency.set(currency, (perCurrency.get(currency) || 0) + 1);
  }

  return {
    count: operations.length,
    totals,
    chart: chartType
      ? buildChart(operations, currencyByAccountId, { chartType, now, monthCount, typeCounts, currencyCounts })
      : null,
  };
};

function buildChart(operations, currencyByAccountId, { chartType, now, monthCount, typeCounts, currencyCounts }) {
  const type = chartType === 'auto'
    ? (typeCounts.income > typeCounts.expense ? 'income' : 'expense')
    : chartType;
  if (!MONEY_TYPES.includes(type) || typeCounts[type] === 0) return null;

  // One currency per chart: bars in two currencies on one scale would compare
  // roubles with dollars. The one most of the results are in is the one the
  // user is asking about; the summary line above still lists every currency.
  const currency = mostFrequent(currencyCounts[type]);
  const months = lastMonths(now, monthCount).map((month) => ({ ...month, amount: '0' }));
  const byKey = new Map(months.map((month) => [month.key, month]));

  for (const operation of operations) {
    if (operation.type !== type) continue;
    // A chart, so it honours "hide from charts" as every other chart does; the
    // summary line above counts these rows, since it describes the list.
    if (operation.excludeFromCharts) continue;
    if (currencyByAccountId.get(operation.accountId) !== currency) continue;
    if (!isAmount(operation.amount) || typeof operation.date !== 'string') continue;
    const month = byKey.get(operation.date.slice(0, 7));
    if (month) month.amount = Currency.add(month.amount, operation.amount);
  }

  return { type, currency, months };
}
