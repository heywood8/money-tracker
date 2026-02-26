import { useState, useEffect, useCallback, useRef } from 'react';
import { logService } from '../services/LogService';

export function useLogEntries(levelFilter = 'all') {
  const [, setTick] = useState(0);
  const filterRef = useRef(levelFilter);
  filterRef.current = levelFilter;

  useEffect(() => {
    const unsubscribe = logService.subscribe(() => {
      setTick(t => t + 1);
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
