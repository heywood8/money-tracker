import { useState, useEffect, useMemo } from 'react';
import { fetchRatesToTarget, convertWithRateMap } from '../services/OperationsDB';

// Module-level so the "nothing to convert" result keeps a stable identity and
// consumers memoizing on it don't rebuild every render.
const EMPTY_SET = new Set();

/**
 * Target amounts for a month's plan lines, every one expressed in a SINGLE
 * currency.
 *
 * The Budgets screen is scoped to one selected currency, so a line that stores
 * its own (e.g. "Rent, 300000 AMD" while the screen shows RUB) must be converted
 * before it is printed — showing the stored figure meant the screen mixed units
 * silently: the amount was AMD, the progress bar beneath it was RUB, and neither
 * said which.
 *
 * `calculatePlanStatus` already converts the same way, but only for a month that
 * HAS a plan row; recurring lines render for plan-less months too, and the
 * screen's own live totals recompute before the async status lands. This hook is
 * the one source of converted target amounts for both cases, so a row, the
 * totals and the summary strip can never disagree.
 *
 * Rates come from the shared offline-first lookup ({@link fetchRatesToTarget}),
 * the same one the status path uses — identical inputs give identical figures.
 *
 * @param {Array<{id: string, amount: string, currency: ?string}>} lines
 * @param {string} targetCurrency - The currency the screen is showing
 * @returns {{
 *   amountById: Map<string, string>,
 *   unconvertibleIds: Set<string>,
 *   converting: boolean,
 * }} `amountById` holds every line whose amount could be expressed in
 *   `targetCurrency`; a line with no available rate is absent from it and
 *   present in `unconvertibleIds` instead, so callers must decide explicitly
 *   what to do rather than silently printing a mislabeled number.
 */
export default function usePlanLineAmounts(lines, targetCurrency) {
  // Lines in the target currency need no rate at all, so they are resolved
  // synchronously on first render — the common case never flashes an empty map.
  const local = useMemo(() => {
    const amountById = new Map();
    const foreign = [];
    for (const line of lines) {
      const lineCurrency = line.currency || targetCurrency;
      if (lineCurrency === targetCurrency) {
        amountById.set(line.id, String(line.amount ?? '0'));
      } else {
        foreign.push({ id: line.id, amount: String(line.amount ?? '0'), currency: lineCurrency });
      }
    }
    return { amountById, foreign };
  }, [lines, targetCurrency]);

  const [converted, setConverted] = useState(null);

  useEffect(() => {
    if (!targetCurrency || local.foreign.length === 0) {
      // Nothing to fetch. Clear any result left from a previous currency so a
      // stale conversion can't leak into the render below.
      setConverted(prev => (prev === null ? prev : null));
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const rateByCurrency = await fetchRatesToTarget(
          local.foreign.map(l => l.currency),
          targetCurrency,
        );
        if (cancelled) return;
        const amountById = new Map();
        const unconvertibleIds = new Set();
        for (const line of local.foreign) {
          const value = convertWithRateMap(line.amount, line.currency, targetCurrency, rateByCurrency);
          if (value === null) {
            unconvertibleIds.add(line.id);
          } else {
            amountById.set(line.id, value);
          }
        }
        setConverted({ amountById, unconvertibleIds });
      } catch (error) {
        console.error('Failed to convert plan line amounts:', error);
        if (!cancelled) {
          // Every foreign line is unconvertible rather than wrong: a failed rate
          // lookup must not fall back to printing the raw amount as if it were
          // already in the target currency.
          setConverted({
            amountById: new Map(),
            unconvertibleIds: new Set(local.foreign.map(l => l.id)),
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [local, targetCurrency]);

  return useMemo(() => {
    if (local.foreign.length === 0) {
      return { amountById: local.amountById, unconvertibleIds: EMPTY_SET, converting: false };
    }
    if (!converted) {
      // Rates still in flight: same-currency lines are already final, foreign
      // ones are withheld (not guessed) until the conversion resolves.
      return { amountById: local.amountById, unconvertibleIds: EMPTY_SET, converting: true };
    }
    const amountById = new Map(local.amountById);
    for (const [id, value] of converted.amountById) {
      amountById.set(id, value);
    }
    return { amountById, unconvertibleIds: converted.unconvertibleIds, converting: false };
  }, [local, converted]);
}
