import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import uuid from 'react-native-uuid';
import * as OperationsDB from './services/OperationsDB';
import { useAccounts } from './AccountsContext';

const OperationsContext = createContext();

export const useOperations = () => {
  const context = useContext(OperationsContext);
  if (!context) {
    throw new Error('useOperations must be used within an OperationsProvider');
  }
  return context;
};

export const OperationsProvider = ({ children }) => {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const { reloadAccounts } = useAccounts();

  // Load operations from SQLite on mount
  useEffect(() => {
    const loadOperations = async () => {
      try {
        const operationsData = await OperationsDB.getAllOperations();
        setOperations(operationsData);
      } catch (error) {
        console.error('Failed to load operations:', error);
        Alert.alert(
          'Load Error',
          'Failed to load operations from database.',
          [{ text: 'OK' }]
        );
      } finally {
        setLoading(false);
        setDataLoaded(true);
      }
    };
    loadOperations();
  }, []);

  const addOperation = useCallback(async (operation) => {
    try {
      const newOperation = {
        ...operation,
        id: uuid.v4(),
        createdAt: new Date().toISOString(),
      };

      // Create operation in DB (handles balance updates automatically)
      await OperationsDB.createOperation(newOperation);

      setOperations(ops => [newOperation, ...ops]);
      setSaveError(null);

      // Reload accounts to reflect balance changes
      await reloadAccounts();

      return newOperation;
    } catch (error) {
      console.error('Failed to add operation:', error);
      setSaveError(error.message);
      Alert.alert(
        'Error',
        'Failed to create operation. Please try again.',
        [{ text: 'OK' }]
      );
      throw error;
    }
  }, [reloadAccounts]);

  const updateOperation = useCallback(async (id, updates) => {
    try {
      // Update operation in DB (handles balance updates automatically)
      await OperationsDB.updateOperation(id, updates);

      setOperations(ops => {
        return ops.map(op => {
          if (op.id === id) {
            return { ...op, ...updates };
          }
          return op;
        });
      });
      setSaveError(null);

      // Reload accounts to reflect balance changes
      await reloadAccounts();
    } catch (error) {
      console.error('Failed to update operation:', error);
      setSaveError(error.message);
      Alert.alert(
        'Error',
        'Failed to update operation. Please try again.',
        [{ text: 'OK' }]
      );
      throw error;
    }
  }, [reloadAccounts]);

  const deleteOperation = useCallback(async (id) => {
    try {
      // Delete operation from DB (handles balance updates automatically)
      await OperationsDB.deleteOperation(id);

      setOperations(ops => ops.filter(op => op.id !== id));
      setSaveError(null);

      // Reload accounts to reflect balance changes
      await reloadAccounts();
    } catch (error) {
      console.error('Failed to delete operation:', error);
      setSaveError(error.message);
      Alert.alert(
        'Error',
        'Failed to delete operation. Please try again.',
        [{ text: 'OK' }]
      );
      throw error;
    }
  }, [reloadAccounts]);

  const validateOperation = useCallback((operation) => {
    if (!operation.type) {
      return 'Operation type is required';
    }
    if (!operation.amount || isNaN(Number(operation.amount)) || Number(operation.amount) <= 0) {
      return 'Valid amount is required';
    }
    if (!operation.accountId) {
      return 'Account is required';
    }
    if (operation.type === 'transfer') {
      if (!operation.toAccountId) {
        return 'Destination account is required for transfers';
      }
      if (operation.accountId === operation.toAccountId) {
        return 'Source and destination accounts must be different';
      }
    } else {
      if (!operation.categoryId) {
        return 'Category is required';
      }
    }
    if (!operation.date) {
      return 'Date is required';
    }
    return null;
  }, []);

  // Get operations filtered by various criteria
  const getOperationsByAccount = useCallback((accountId) => {
    return operations.filter(op => op.accountId === accountId);
  }, [operations]);

  const getOperationsByCategory = useCallback((categoryId) => {
    return operations.filter(op => op.categoryId === categoryId);
  }, [operations]);

  const getOperationsByDateRange = useCallback((startDate, endDate) => {
    return operations.filter(op => {
      const opDate = new Date(op.date);
      return opDate >= startDate && opDate <= endDate;
    });
  }, [operations]);

  const value = useMemo(() => ({
    operations,
    loading,
    addOperation,
    updateOperation,
    deleteOperation,
    validateOperation,
    getOperationsByAccount,
    getOperationsByCategory,
    getOperationsByDateRange,
  }), [
    operations,
    loading,
    addOperation,
    updateOperation,
    deleteOperation,
    validateOperation,
    getOperationsByAccount,
    getOperationsByCategory,
    getOperationsByDateRange,
  ]);

  return (
    <OperationsContext.Provider value={value}>
      {children}
    </OperationsContext.Provider>
  );
};
