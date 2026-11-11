import { useEffect, useState } from 'react';
import { getDistinctLabels } from '../services/OperationsDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * The labels already in use across operations, most-used first, for a label
 * editor's autocomplete strip: picking an existing label keeps the same label
 * spelled the same way across merchants, which is what makes it filterable.
 *
 * Re-read when an operation changes (a save may have introduced a label) and on
 * RELOAD_ALL, which is all a notification booking or a restore emits. A failed
 * read keeps the previous list rather than clearing the strip.
 *
 * @param {string|null} [categoryId] - labels used in this category rank first
 * @param {boolean} [enabled=true] - skip the lookup when no editor is shown
 * @param {number} [limit=30]
 * @returns {string[]}
 */
export default function useLabelSuggestions(categoryId = null, enabled = true, limit = 30) {
  const [labels, setLabels] = useState([]);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const bump = () => setRefreshTick((n) => n + 1);
    const offOperationChanged = appEvents.on(EVENTS.OPERATION_CHANGED, bump);
    const offReloadAll = appEvents.on(EVENTS.RELOAD_ALL, bump);
    return () => {
      offOperationChanged();
      offReloadAll();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => getDistinctLabels(limit, categoryId || null))
      .then((result) => { if (!cancelled && Array.isArray(result)) setLabels(result); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled, categoryId, limit, refreshTick]);

  return labels;
}
