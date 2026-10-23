import { useEffect, useRef, useState } from 'react';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { loadRateCharts, removeRateChart, upsertRateChart } from '../services/ExchangeRateCharts';

/**
 * The configured exchange-rate charts, kept current across screens.
 *
 * The Graphs tab and the Settings panel both hold the list; a save from either
 * one is broadcast, so the Graphs tab — mounted the whole time Settings is
 * open — redraws the moment a chart is added or edited. A restored backup or a
 * wiped database rereads the stored list.
 *
 * Edits go through upsertChart / removeChart, which change the stored list
 * rather than this hook's copy of it, so a holder that read before a restore
 * cannot write its old list back over the restored one.
 *
 * @returns {{charts: Array<Object>, loaded: boolean, upsertChart: function, removeChart: function}}
 */
export default function useExchangeRateCharts() {
  const [charts, setCharts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // Bumped by every broadcast. A read that started before one must not land
  // after it and put the older list back.
  const versionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      const version = versionRef.current;
      loadRateCharts()
        .then((list) => {
          if (!cancelled && versionRef.current === version) setCharts(list);
        })
        .catch((error) => {
          console.error('[useExchangeRateCharts] Failed to read exchange-rate charts:', error);
        })
        .finally(() => { if (!cancelled) setLoaded(true); });
    };
    reload();
    const offChanged = appEvents.on(EVENTS.EXCHANGE_RATE_CHARTS_CHANGED, (list) => {
      versionRef.current += 1;
      if (!cancelled && Array.isArray(list)) setCharts(list);
    });
    const offReload = appEvents.on(EVENTS.RELOAD_ALL, reload);
    const offReset = appEvents.on(EVENTS.DATABASE_RESET, reload);
    return () => {
      cancelled = true;
      offChanged();
      offReload();
      offReset();
    };
  }, []);

  // The broadcast updates every holder, this one included, so neither needs
  // to set anything itself.
  return { charts, loaded, upsertChart: upsertRateChart, removeChart: removeRateChart };
}
