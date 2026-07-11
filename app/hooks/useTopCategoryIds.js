import { useState, useEffect, useCallback } from 'react';
import * as OperationsDB from '../services/OperationsDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * The ids of the most-frequently-used categories over the last 90 days, ordered
 * most-frequent first, across both expense and income (the consumer filters to
 * the type it needs). This is the same history signal the quick-add form uses
 * for its category shortcuts, exposed as a standalone hook so other surfaces —
 * e.g. the notification binding card — can offer the same "All categories + top
 * shortcuts" grid instead of a flat all-categories list.
 *
 * Stays fresh by reloading on the app-wide OPERATION_CHANGED and RELOAD_ALL
 * events (a booked/edited operation shifts the frequencies). Any load failure
 * degrades to an empty list, so a consumer simply falls back to showing its own
 * categories rather than erroring.
 *
 * @param {number} [limitPerType=10] - how many top ids to fetch per type.
 * @returns {string[]} ordered category ids (may be empty).
 */
export default function useTopCategoryIds(limitPerType = 10) {
  const [ids, setIds] = useState([]);

  const load = useCallback(async () => {
    try {
      const rows = await OperationsDB.getTopCategoriesFromLastMonth(limitPerType);
      setIds((rows || []).map((r) => r.categoryId).filter(Boolean));
    } catch (error) {
      setIds([]);
    }
  }, [limitPerType]);

  useEffect(() => {
    load();
  }, [load]);

  // appEvents.on returns its own unsubscribe, so returning it cleans up.
  useEffect(() => appEvents.on(EVENTS.OPERATION_CHANGED, load), [load]);
  useEffect(() => appEvents.on(EVENTS.RELOAD_ALL, load), [load]);

  return ids;
}
