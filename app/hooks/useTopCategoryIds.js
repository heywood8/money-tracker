import { useEffect, useMemo, useSyncExternalStore } from 'react';
import * as OperationsDB from '../services/OperationsDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * One shared load of the usage history, however many components ask for it.
 *
 * The Operations screen alone mounted two independent consumers — the quick-add
 * form's category shortcuts and the notification binding card — so every
 * operation change used to issue the same query twice, for identical results.
 * The store lives at module scope, so a second consumer joins the first one's
 * load instead of starting its own. It holds the raw per-account usage rows;
 * each consumer ranks them for its own limit and account (see
 * `rankTopCategoryIds`), which costs no query.
 */
let sharedStore = null;

const createStore = () => {
  const store = {
    rows: [],
    loaded: false,
    inFlight: null,
    restartPending: false,
    listeners: new Set(),
    unsubscribeEvents: null,

    getSnapshot: () => store.rows,

    // The store — not each consumer — listens for the events that invalidate it.
    // Per-consumer subscriptions meant one event produced one refresh PER mounted
    // consumer, which is the duplication this store exists to remove.
    subscribe: (listener) => {
      store.listeners.add(listener);
      if (store.listeners.size === 1) {
        store.unsubscribeEvents = [
          appEvents.on(EVENTS.OPERATION_CHANGED, store.refresh),
          appEvents.on(EVENTS.RELOAD_ALL, store.refresh),
        ];
      }
      return () => {
        store.listeners.delete(listener);
        if (store.listeners.size === 0 && store.unsubscribeEvents) {
          store.unsubscribeEvents.forEach(unsubscribe => unsubscribe());
          store.unsubscribeEvents = null;
        }
      };
    },

    /**
     * Make sure the rows are loaded, joining a load already in flight rather than
     * starting a second one. This is what a mounting consumer calls: several of
     * them arriving in the same commit must cost one query, not one each.
     */
    ensureLoaded: () => {
      if (store.loaded || store.inFlight) return store.inFlight;
      return store.load();
    },

    /**
     * Reload because the underlying data changed. Unlike `ensureLoaded`, a
     * request that lands mid-flight is remembered and starts a fresh load when
     * the current one settles — an operation booked while the query was running
     * has already shifted the frequencies the in-flight result is reporting.
     *
     * Failures degrade to an empty list, so a consumer falls back to its own
     * categories rather than erroring.
     */
    refresh: () => {
      if (store.inFlight) {
        store.restartPending = true;
        return store.inFlight;
      }
      return store.load();
    },

    load: () => {
      store.restartPending = false;
      store.inFlight = OperationsDB.getRecentCategoryUsage()
        .then((rows) => {
          store.rows = (rows || []).filter(row => row && row.categoryId);
        })
        .catch(() => {
          store.rows = [];
        })
        .finally(() => {
          store.inFlight = null;
          store.loaded = true;
          store.listeners.forEach(listener => listener());
          if (store.restartPending) store.load();
        });
      return store.inFlight;
    },
  };
  return store;
};

const getStore = () => {
  if (!sharedStore) sharedStore = createStore();
  return sharedStore;
};

// Exported for tests: a module-level cache outlives a test's render.
export const __resetTopCategoryStores = () => {
  sharedStore?.unsubscribeEvents?.forEach(unsubscribe => unsubscribe());
  sharedStore = null;
};

const TYPES = ['expense', 'income'];

// Most-used first; ties go to the most recently used. Dates are 'YYYY-MM-DD',
// so they compare as strings.
const byUse = (a, b) => (b.count - a.count) || b.lastDate.localeCompare(a.lastDate);

/**
 * Up to `limitPerType` category ids per type, expense ids before income ids,
 * each run ranked by `byUse` (the rows arrive unordered). Rows for the same category from several accounts
 * are summed, so this is the ranking across everything the rows cover.
 */
const rankByType = (rows, limitPerType) => {
  const totals = new Map();
  for (const row of rows) {
    const key = `${row.type}|${row.categoryId}`;
    const total = totals.get(key);
    const lastDate = row.lastDate || '';
    if (total) {
      total.count += Number(row.count) || 0;
      if (lastDate > total.lastDate) total.lastDate = lastDate;
    } else {
      totals.set(key, { categoryId: row.categoryId, type: row.type, count: Number(row.count) || 0, lastDate });
    }
  }
  const ranked = [...totals.values()].sort(byUse);
  return TYPES.flatMap(type => ranked
    .filter(total => total.type === type)
    .slice(0, limitPerType)
    .map(total => total.categoryId));
};

/**
 * Rank the usage rows into the ids a shortcut grid shows.
 *
 * With an account, what was booked from that account comes first and the
 * ranking across all accounts fills in behind it, so a card used only for
 * groceries offers groceries even when rent dominates overall, and an account
 * with little history still gets a full grid. Without one, it is the ranking
 * across all accounts alone.
 *
 * Account ids are compared as strings: the DB hands back integers, while a
 * form may hold the id as a string.
 *
 * @param {Array<{accountId, categoryId, type, count, lastDate}>} rows
 * @param {number} limitPerType
 * @param {string|number|null} [accountId]
 * @returns {string[]} ordered, de-duplicated category ids
 */
export const rankTopCategoryIds = (rows, limitPerType, accountId = null) => {
  const overall = rankByType(rows, limitPerType);
  if (accountId === null || accountId === undefined || accountId === '') return overall;
  const wanted = String(accountId);
  const own = rankByType(rows.filter(row => String(row.accountId) === wanted), limitPerType);
  return [...new Set([...own, ...overall])];
};

/**
 * The ids of the most-frequently-used categories over the last 90 days, ordered
 * most-frequent first, across both expense and income (the consumer filters to
 * the type it needs). With `accountId`, that account's own ranking leads and the
 * overall one follows, so the first id is the account's favourite, not
 * necessarily the most-used category overall. This is the same history signal the quick-add form uses
 * for its category shortcuts, exposed as a hook so other surfaces — e.g. the
 * notification binding card — can offer the same "All categories + top
 * shortcuts" grid instead of a flat all-categories list.
 *
 * Pass `accountId` to put what was booked from that account first (see
 * `rankTopCategoryIds`). Switching it re-ranks the rows already loaded, so the
 * grid follows an account tap at once rather than after a query.
 *
 * Stays fresh by reloading on the app-wide OPERATION_CHANGED and RELOAD_ALL
 * events (a booked/edited operation shifts the frequencies), once per event
 * however many consumers are mounted.
 *
 * @param {number} [limitPerType=10] - how many top ids to rank per type. With an
 *   account this caps the account's ranking and the overall one separately, so up
 *   to twice as many ids per type come back (fewer where the two overlap).
 * @param {string|number|null} [accountId] - the account the operation is booked from.
 * @returns {string[]} ordered category ids (may be empty).
 */
export default function useTopCategoryIds(limitPerType = 10, accountId = null) {
  const store = getStore();

  const rows = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => { store.ensureLoaded(); }, [store]);

  return useMemo(
    () => rankTopCategoryIds(rows, limitPerType, accountId),
    [rows, limitPerType, accountId],
  );
}
