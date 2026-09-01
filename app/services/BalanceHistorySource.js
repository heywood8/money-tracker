/**
 * Balance History Source
 *
 * The balance chart reads seven things about "the thing being charted": its daily
 * snapshots, its balance carried in from before a window, its expenses, its
 * income, its transfers, its expenses bucketed by month, and the ordered balance
 * moves of a single day. For a single account each is one query. For the *net
 * worth* selection — every account at once — each is the same query per account,
 * with every foreign-currency figure converted to one display currency and summed.
 *
 * Both shapes are exposed as the same seven-method object so the hook that drives
 * the chart asks the same questions either way and never branches on which one
 * it is holding.
 */

import {
  getBalanceHistory,
  getAccountBalanceOnOrBeforeDate,
  getBalanceHistoryForAccounts,
  getAccountBalancesOnOrBeforeDate,
} from './BalanceHistoryDB';
import {
  getTotalExpenses,
  getTotalIncome,
  getTransferTotals,
  getMonthlyExpenseTotals,
  getAccountDayDeltas,
  fetchRatesToTarget,
  convertWithRateMap,
} from './OperationsDB';
import * as Currency from './currency';

// Sentinel account id standing for "all accounts, as one net-worth line". It is
// not a real account id, so anything that resolves ids against the account list
// must check it first (see isNetWorthSelection).
export const NET_WORTH_ACCOUNT_ID = '__net_worth__';

export const isNetWorthSelection = (accountId) => accountId === NET_WORTH_ACCOUNT_ID;

// History rows come back with the `date` column as stored. Most are 'YYYY-MM-DD',
// but CSV/SQLite imports can leave a timestamp on the end (#773); the chart parses
// dates by string position, so trim to the calendar day before anything else.
export const normalizeHistoryDate = (value) => (
  typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null
);

/**
 * Merge several accounts' snapshot histories into one series.
 *
 * Net worth on a day is the sum of what every account held *as of* that day, so
 * each account is forward-filled independently: an account that last moved on the
 * 3rd still contributes that balance on the 12th. `anchor` is the balance carried
 * in from before the window, so an account with no row inside it still counts.
 *
 * A day only becomes a point in the result if some account recorded a snapshot on
 * it — days nobody touched carry no new information, and the chart forward-fills
 * them itself. An account with no known balance yet (its first snapshot is later
 * than this day) contributes nothing rather than a zero-that-means-unknown.
 *
 * Balances must already be expressed in the display currency.
 *
 * @param {Array<{anchor: string|number|null, rows: Array<{date: string, balance: string|number}>}>} perAccount
 * @returns {Array<{date: string, balance: string}>} ascending by date
 */
export const combineBalanceHistories = (perAccount) => {
  const lists = (perAccount || []).map((entry) => {
    const rows = (entry?.rows || [])
      .map(row => ({
        date: normalizeHistoryDate(row?.date),
        balance: String(row?.balance ?? ''),
      }))
      .filter(row => row.date !== null && Number.isFinite(parseFloat(row.balance)))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const anchor = String(entry?.anchor ?? '');
    return {
      rows,
      cursor: 0,
      last: Number.isFinite(parseFloat(anchor)) ? anchor : undefined,
    };
  });

  const dates = [...new Set(lists.flatMap(list => list.rows.map(row => row.date)))].sort();

  const combined = [];
  dates.forEach((date) => {
    let total = '0';
    let known = false;
    lists.forEach((list) => {
      // The cursor only ever moves forward: `dates` is ascending, so each row is
      // consumed once across the whole walk rather than re-scanned per day.
      while (list.cursor < list.rows.length && list.rows[list.cursor].date <= date) {
        list.last = list.rows[list.cursor].balance;
        list.cursor++;
      }
      if (list.last === undefined) return;
      total = Currency.add(total, list.last);
      known = true;
    });
    if (known) combined.push({ date, balance: total });
  });
  return combined;
};

// The single-account source: every method is the plain query it always was.
export const createSingleAccountSource = (accountId) => ({
  isNetWorth: false,
  getHistory: (startDate, endDate) => getBalanceHistory(accountId, startDate, endDate),
  getAnchorBalance: (date) => getAccountBalanceOnOrBeforeDate(accountId, date),
  getTotalExpenses: (startDate, endDate) => getTotalExpenses(accountId, startDate, endDate),
  getTotalIncome: (startDate, endDate) => getTotalIncome(accountId, startDate, endDate),
  getTransferTotals: (startDate, endDate) => getTransferTotals(accountId, startDate, endDate),
  getMonthlyExpenseTotals: (startDate, endDate) => getMonthlyExpenseTotals(accountId, startDate, endDate),
  getDayDeltas: async (date) => (await getAccountDayDeltas(accountId, date)).map(row => row.delta),
});

/**
 * The net-worth source: the same seven questions asked of every account and summed
 * in `targetCurrency`.
 *
 * The rate map is fetched once and shared by every method of a given source, so a
 * chart load pays for at most one lookup per foreign currency (offline table
 * first, live fetch only for what it doesn't cover). An account whose currency has
 * no rate at all is left out of the totals entirely rather than counted at par;
 * the Graphs screen warns about exactly those currency codes on its own.
 *
 * Hidden accounts are included: hiding an account takes it off the accounts list,
 * it does not stop it being part of what the user owns — the same reading the
 * Accounts screen's net-worth summary takes.
 *
 * @param {Array<{id: string, currency: string}>} accounts
 * @param {string} targetCurrency
 */
export const createNetWorthSource = (accounts, targetCurrency) => {
  const list = (accounts || []).filter(acc => acc && acc.id !== undefined && acc.id !== null);

  let ratesPromise = null;
  const rates = () => {
    if (!ratesPromise) {
      ratesPromise = fetchRatesToTarget(list.map(acc => acc.currency), targetCurrency);
    }
    return ratesPromise;
  };

  // null (not 0) when the account's currency cannot be expressed in the target —
  // callers skip those accounts instead of folding an unconverted figure in.
  const convert = (amount, currency, rateMap) => convertWithRateMap(
    String(amount ?? '0'),
    currency || targetCurrency,
    targetCurrency,
    rateMap,
  );

  // Sum one per-account scalar query across every account.
  const sumAcross = async (query) => {
    const rateMap = await rates();
    const values = await Promise.all(list.map(async (acc) => {
      const raw = await query(acc);
      return convert(raw ?? '0', acc.currency, rateMap);
    }));
    return values.reduce((sum, value) => (value === null ? sum : Currency.add(sum, value)), '0');
  };

  return {
    isNetWorth: true,

    getHistory: async (startDate, endDate) => {
      const ids = list.map(acc => acc.id);
      const [rateMap, rowsByAccount, anchorByAccount] = await Promise.all([
        rates(),
        getBalanceHistoryForAccounts(ids, startDate, endDate),
        // Seeds the forward-fill: on a day where only account A moved, account
        // B still has to contribute the balance it was already sitting on.
        getAccountBalancesOnOrBeforeDate(ids, startDate),
      ]);
      const perAccount = list.map((acc) => {
        const key = String(acc.id);
        const convertedRows = [];
        (rowsByAccount.get(key) || []).forEach((row) => {
          const balance = convert(row?.balance, acc.currency, rateMap);
          if (balance !== null) convertedRows.push({ date: row.date, balance });
        });
        const anchor = anchorByAccount.get(key);
        const convertedAnchor = anchor === null || anchor === undefined
          ? null
          : convert(anchor, acc.currency, rateMap);
        return { anchor: convertedAnchor, rows: convertedRows };
      });
      return combineBalanceHistories(perAccount);
    },

    // The portfolio's balance as of a date, for the burndown ceiling. Accounts
    // with no snapshot yet on that date contribute nothing — the same reading the
    // charted line takes for them, so ceiling and line describe one portfolio.
    // Null only when *no* account has a balance on or before the date, matching
    // the single-account contract: the caller reads null as "unknown", not "zero".
    getAnchorBalance: async (date) => {
      const [rateMap, anchorByAccount] = await Promise.all([
        rates(),
        getAccountBalancesOnOrBeforeDate(list.map(acc => acc.id), date),
      ]);
      const known = list
        .map((acc) => {
          const raw = anchorByAccount.get(String(acc.id));
          if (raw === null || raw === undefined) return null;
          return convert(raw, acc.currency, rateMap);
        })
        .filter(value => value !== null);
      if (known.length === 0) return null;
      return known.reduce((sum, value) => Currency.add(sum, value), '0');
    },

    getTotalExpenses: (startDate, endDate) =>
      sumAcross(acc => getTotalExpenses(acc.id, startDate, endDate)),

    getTotalIncome: (startDate, endDate) =>
      sumAcross(acc => getTotalIncome(acc.id, startDate, endDate)),

    // Transfers between two of the user's own accounts land in both buckets, and
    // the one consumer of these totals nets them (+in − out), so internal moves
    // cancel exactly as they should for a whole-portfolio view.
    getTransferTotals: async (startDate, endDate) => {
      const rateMap = await rates();
      const totals = await Promise.all(list.map(async (acc) => {
        const { incoming, outgoing } = await getTransferTotals(acc.id, startDate, endDate);
        return {
          incoming: convert(incoming, acc.currency, rateMap),
          outgoing: convert(outgoing, acc.currency, rateMap),
        };
      }));
      return totals.reduce((sum, entry) => ({
        incoming: entry.incoming === null ? sum.incoming : Currency.add(sum.incoming, entry.incoming),
        outgoing: entry.outgoing === null ? sum.outgoing : Currency.add(sum.outgoing, entry.outgoing),
      }), { incoming: '0', outgoing: '0' });
    },

    // Every balance move of the portfolio on one day, in the order they happened.
    // An operation between two charted accounts shows up in both accounts' lists,
    // and net worth moves by the *sum* of the two sides (zero for a same-currency
    // transfer), so the deltas are folded by operation id before the day is
    // ordered — otherwise an internal transfer would read as a dip and a spike
    // that the portfolio never actually took.
    getDayDeltas: async (date) => {
      const rateMap = await rates();
      const perAccount = await Promise.all(list.map(async (acc) => {
        const rows = await getAccountDayDeltas(acc.id, date);
        return rows.map(row => ({ ...row, delta: convert(row.delta, acc.currency, rateMap) }));
      }));

      const byOperation = new Map();
      perAccount.forEach((rows) => rows.forEach(({ id, createdAt, delta }) => {
        if (delta === null) return; // currency with no rate: left out entirely
        const key = String(id);
        const entry = byOperation.get(key);
        if (entry) entry.delta = Currency.add(entry.delta, delta);
        else byOperation.set(key, { key, createdAt, delta });
      }));

      return [...byOperation.values()]
        .sort((a, b) => (a.createdAt < b.createdAt ? -1
          : a.createdAt > b.createdAt ? 1
            : (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)))
        .map(entry => entry.delta);
    },

    getMonthlyExpenseTotals: async (startDate, endDate) => {
      const rateMap = await rates();
      const perAccount = await Promise.all(list.map(async (acc) => {
        const totals = await getMonthlyExpenseTotals(acc.id, startDate, endDate);
        return { currency: acc.currency, totals: totals || {} };
      }));
      const merged = {};
      perAccount.forEach(({ currency, totals }) => {
        Object.entries(totals).forEach(([month, total]) => {
          const converted = convert(total, currency, rateMap);
          if (converted === null) return;
          merged[month] = Currency.add(merged[month] || '0', converted);
        });
      });
      return merged;
    },

  };
};

/**
 * Resolve a chart selection to the source that answers for it.
 *
 * @param {string} selectedAccount - an account id, or NET_WORTH_ACCOUNT_ID
 * @param {{accounts: Array, targetCurrency: string}} options
 */
export const createBalanceHistorySource = (selectedAccount, { accounts, targetCurrency } = {}) => {
  if (isNetWorthSelection(selectedAccount)) {
    return createNetWorthSource(accounts, targetCurrency);
  }
  return createSingleAccountSource(selectedAccount);
};
