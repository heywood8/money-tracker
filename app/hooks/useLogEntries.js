import { useState, useEffect, useCallback, useRef } from 'react';
import { logService } from '../services/LogService';

export function useLogEntries(levelFilter = 'all') {
  const [, setTick] = useState(0);
  const filterRef = useRef(levelFilter);
  filterRef.current = levelFilter;

  useEffect(() => {
    const unsubscribe = logService.subscribe(() => {
      // Defer setState to avoid updating during a render phase — LogService intercepts
      // console.*, which React calls internally during rendering (e.g. dev warnings),
      // so a synchronous setTick here causes "Cannot update a component while rendering".
      setTimeout(() => setTick(t => t + 1), 0);
    });
    return unsubscribe;
  }, []);

  const entries = logService.getEntries(levelFilter);

  const clearLogs = useCallback(() => {
    logService.clear();
  }, []);

  const getExportText = useCallback(() => {
    return logService.formatForExport(filterRef.current);
  }, []);

  return { entries, clearLogs, getExportText };
}
