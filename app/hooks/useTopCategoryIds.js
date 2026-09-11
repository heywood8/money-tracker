import { useEffect, useSyncExternalStore } from 'react';
import * as OperationsDB from '../services/OperationsDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * One shared load per limit, however many components ask for it.
 *
 * The Operations screen alone mounted two independent consumers — the quick-add
 * form's category shortcuts and this hook — so every operation change issued
 * `getTopCategoriesFromLastMonth(10)` twice, for identical results. The stores
 * live at module scope, keyed by limit, so a second consumer joins the first
 * one's load instead of starting its own.
 */
const stores = new Map();

const getStore = (limitPerType) => {
  let store = stores.get(limitPerType);
  if (store) return store;

  store = {
    ids: [],
    loaded: false,
    inFlight: null,
    restartPending: false,
    listeners: new Set(),
    unsubscribeEvents: null,

    getSnapshot: () => store.ids,

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
     * Make sure the ids are loaded, joining a load already in flight rather than
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
      store.inFlight = OperationsDB.getTopCategoriesFromLastMonth(limitPerType)
        .then((rows) => {
          store.ids = (rows || []).map(row => row.categoryId).filter(Boolean);
        })
        .catch(() => {
          store.ids = [];
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

  stores.set(limitPerType, store);
  return store;
};

// Exported for tests: a module-level cache outlives a test's render.
export const __resetTopCategoryStores = () => {
  for (const store of stores.values()) {
    store.unsubscribeEvents?.forEach(unsubscribe => unsubscribe());
  }
  stores.clear();
};

/**
 * The ids of the most-frequently-used categories over the last 90 days, ordered
 * most-frequent first, across both expense and income (the consumer filters to
 * the type it needs). This is the same history signal the quick-add form uses
 * for its category shortcuts, exposed as a hook so other surfaces — e.g. the
 * notification binding card — can offer the same "All categories + top
 * shortcuts" grid instead of a flat all-categories list.
 *
 * Stays fresh by reloading on the app-wide OPERATION_CHANGED and RELOAD_ALL
 * events (a booked/edited operation shifts the frequencies), once per event
 * however many consumers are mounted.
 *
 * @param {number} [limitPerType=10] - how many top ids to fetch per type.
 * @returns {string[]} ordered category ids (may be empty).
 */
export default function useTopCategoryIds(limitPerType = 10) {
  const store = getStore(limitPerType);

  const ids = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => { store.ensureLoaded(); }, [store]);

  return ids;
}
