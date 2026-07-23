import { useState, useEffect, useCallback, useRef } from 'react';
import { logService } from '../services/LogService';

export function useLogEntries(levelFilter = 'all') {
  const [, setTick] = useState(0);
  const filterRef = useRef(levelFilter);
  filterRef.current = levelFilter;

  useEffect(() => {
    const pendingTimers = new Set();
    const unsubscribe = logService.subscribe(() => {
      // Defer setState to avoid updating during a render phase — LogService intercepts
      // console.*, which React calls internally during rendering (e.g. dev warnings),
      // so a synchronous setTick here causes "Cannot update a component while rendering".
      const id = setTimeout(() => {
        pendingTimers.delete(id);
        setTick(t => t + 1);
      }, 0);
      pendingTimers.add(id);
    });
    return () => {
      unsubscribe();
      // Cancel any deferred setTick so a log line arriving in the same tick as
      // unmount doesn't fire setState on an unmounted component.
      pendingTimers.forEach(clearTimeout);
      pendingTimers.clear();
    };
  }, []);

  const entries = logService.getEntries(levelFilter);
  const counts = logService.getCounts();

  const clearLogs = useCallback(() => {
    logService.clear();
  }, []);

  const getExportText = useCallback(() => {
    return logService.formatForExport(filterRef.current);
  }, []);

  return { entries, counts, clearLogs, getExportText };
}
