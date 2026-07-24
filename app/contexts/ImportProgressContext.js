import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { appEvents } from '../services/eventEmitter';
import { IMPORT_PROGRESS_EVENT } from '../services/BackupRestore';

const ImportProgressContext = createContext();

export const useImportProgress = () => {
  const context = useContext(ImportProgressContext);
  if (!context) {
    throw new Error('useImportProgress must be used within ImportProgressProvider');
  }
  return context;
};

export const ImportProgressProvider = ({ children }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [steps, setSteps] = useState([]);
  const [currentStep, setCurrentStep] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const cancelTokenRef = useRef({ cancelled: false });

  const startImport = useCallback(() => {
    cancelTokenRef.current = { cancelled: false };
    setIsCancelling(false);
    setIsImporting(true);
    setSteps([
      { id: 'format', label: 'Detecting format', status: 'pending', data: null },
      { id: 'import', label: 'Importing backup', status: 'pending', data: null },
      { id: 'backup', label: 'Creating safety backup', status: 'pending', data: null },
      { id: 'restore', label: 'Restoring database', status: 'pending', data: null },
      { id: 'clear', label: 'Clearing existing data', status: 'pending', data: null },
      { id: 'accounts', label: 'Restoring accounts', status: 'pending', data: null },
      { id: 'categories', label: 'Restoring categories', status: 'pending', data: null },
      { id: 'operations', label: 'Restoring operations', status: 'pending', data: null },
      { id: 'balance_history', label: 'Restoring balance history', status: 'pending', data: null },
      { id: 'budgets', label: 'Restoring budgets', status: 'pending', data: null },
      { id: 'budget_plans', label: 'Restoring budget plans', status: 'pending', data: null },
      { id: 'metadata', label: 'Restoring metadata', status: 'pending', data: null },
      { id: 'upgrades', label: 'Performing post-restore upgrades', status: 'pending', data: null },
      { id: 'complete', label: 'Database restored successfully', status: 'pending', data: null },
    ]);
    setCurrentStep('format');
  }, []);

  const requestCancel = useCallback(() => {
    cancelTokenRef.current.cancelled = true;
    setIsCancelling(true);
  }, []);

  const getCancelToken = useCallback(() => cancelTokenRef.current, []);

  const updateStep = useCallback((stepId, status, data = null) => {
    setSteps(prevSteps =>
      prevSteps.map(step =>
        step.id === stepId ? { ...step, status, data } : step,
      ),
    );
    if (status === 'in_progress') {
      setCurrentStep(stepId);
    }
  }, []);

  const completeImport = useCallback(() => {
    setCurrentStep('complete');
    updateStep('complete', 'completed');
    // Don't auto-close - wait for user to press OK button
  }, [updateStep]);

  const cancelImport = useCallback(() => {
    setIsImporting(false);
    setSteps([]);
    setCurrentStep(null);
    setIsCancelling(false);
    cancelTokenRef.current = { cancelled: false };
  }, []);

  // Listen for import progress events
  useEffect(() => {
    const unsubscribe = appEvents.on(IMPORT_PROGRESS_EVENT, ({ stepId, status, data }) => {
      updateStep(stepId, status, data);
      if (stepId === 'complete' && status === 'completed') {
        setCurrentStep('complete');
      }
    });

    return unsubscribe;
  }, [updateStep]);

  const finishImport = useCallback(() => {
    setIsImporting(false);
    setSteps([]);
    setCurrentStep(null);
    setIsCancelling(false);
    cancelTokenRef.current = { cancelled: false };
  }, []);

  const value = useMemo(() => ({
    isImporting,
    steps,
    currentStep,
    isCancelling,
    startImport,
    updateStep,
    completeImport,
    cancelImport,
    finishImport,
    requestCancel,
    getCancelToken,
  }), [isImporting, steps, currentStep, isCancelling, startImport, updateStep, completeImport, cancelImport, finishImport, requestCancel, getCancelToken]);

  return (
    <ImportProgressContext.Provider value={value}>
      {children}
    </ImportProgressContext.Provider>
  );
};

ImportProgressProvider.propTypes = {
  children: PropTypes.node,
};
