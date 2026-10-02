import { useEffect, useMemo, useState } from 'react';
import * as OperationsDB from '../services/OperationsDB';
import { normalizeMerchantLabel } from '../utils/labelUtils';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * The categories past operations from the same source (the notification's shop)
 * were booked under, most-used first.
 *
 * A card with "don't bind to category" ticked has no learned category to
 * pre-select, so the global most-used shortcuts are the wrong guess: this
 * source's own history is the better one. The source is matched by the names it
 * is booked under — the raw merchant, its tidied form and the learned label.
 *
 * @param {{ merchant?: string|null, type?: string }} item - queued notification
 * @param {string} [learnedLabel] - the merchant's learned/typed display name
 * @param {boolean} [enabled=true] - skip the lookup when the ranking is not used
 * @returns {string[]} ordered category ids (empty while loading or with no history)
 */
export default function useSourceCategoryIds(item, learnedLabel = '', enabled = true) {
  const [ids, setIds] = useState([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const merchant = item?.merchant || '';
  const type = item?.type;

  const payeesKey = useMemo(
    () => JSON.stringify([merchant, normalizeMerchantLabel(merchant), learnedLabel || '']),
    [merchant, learnedLabel],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    const off = appEvents.on(EVENTS.OPERATION_CHANGED, () => setRefreshTick((n) => n + 1));
    return off;
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !merchant || (type !== 'expense' && type !== 'income')) {
      setIds((prev) => (prev.length === 0 ? prev : []));
      return undefined;
    }
    let cancelled = false;
    OperationsDB.getCategoryIdsForPayees(type, JSON.parse(payeesKey))
      .then((result) => { if (!cancelled) setIds(result || []); })
      .catch(() => { if (!cancelled) setIds([]); });
    return () => { cancelled = true; };
  }, [enabled, merchant, type, payeesKey, refreshTick]);

  return ids;
}
