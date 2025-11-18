import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
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
  const { updateAccount, accounts } = useAccounts();

  // Load operations from AsyncStorage on mount
  useEffect(() => {
    const loadOperations = async () => {
      try {
        const stored = await AsyncStorage.getItem('operations');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setOperations(parsed);
          } catch (parseError) {
            console.error('Failed to parse operations:', parseError);
            setOperations([]);
          }
        }
      } catch (error) {
        console.error('Failed to load operations:', error);
        Alert.alert('Load Error', 'Unable to load operations data.');
      } finally {
        setLoading(false);
        setDataLoaded(true);
      }
    };
    loadOperations();
  }, []);

  // Save operations to AsyncStorage with retry logic
  const saveOperations = useCallback(async (data, retryCount = 0) => {
    const MAX_RETRIES = 3;
    try {
      await AsyncStorage.setItem('operations', JSON.stringify(data));
      setSaveError(null);
      return true;
    } catch (error) {
      console.error(`Failed to save operations (attempt ${retryCount + 1}):`, error);

      if (retryCount < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, retryCount) * 1000;
        return new Promise((resolve) => {
          setTimeout(async () => {
            const result = await saveOperations(data, retryCount + 1);
            resolve(result);
          }, delay);
        });
      } else {
        // Max retries reached
        setSaveError(error);
        Alert.alert(
          'Save Failed',
          'Unable to save your operations after multiple attempts. Your changes may be lost.',
          [
            {
              text: 'Retry',
              onPress: () => saveOperations(data, 0)
            },
            { text: 'OK', style: 'cancel' }
          ]
        );
        return false;
      }
    }
  }, []);

  // Save operations whenever they change
  useEffect(() => {
    if (dataLoaded) {
      saveOperations(operations);
    }
  }, [operations, dataLoaded, saveOperations]);

  // Helper function to apply balance changes in batch
  const applyBalanceChanges = useCallback((balanceChanges) => {
    balanceChanges.forEach((change, accountId) => {
      if (change !== 0) {
        const account = accounts.find(acc => acc.id === accountId);
        if (account) {
          const currentBalance = parseFloat(account.balance) || 0;
          const newBalance = currentBalance + change;
          updateAccount(accountId, { balance: newBalance.toString() });
        }
      }
    });
  }, [accounts, updateAccount]);

  const addOperation = useCallback((operation) => {
    const newOperation = {
      ...operation,
      id: uuid.v4(),
      createdAt: new Date().toISOString(),
    };

    // Calculate balance changes
    const balanceChanges = new Map();
    const amount = parseFloat(operation.amount) || 0;

    if (operation.type === 'expense') {
      balanceChanges.set(operation.accountId, -amount);
    } else if (operation.type === 'income') {
      balanceChanges.set(operation.accountId, amount);
    } else if (operation.type === 'transfer') {
      balanceChanges.set(operation.accountId, -amount);
      if (operation.toAccountId) {
        const toChange = balanceChanges.get(operation.toAccountId) || 0;
        balanceChanges.set(operation.toAccountId, toChange + amount);
      }
    }

    // Apply all balance changes in batch
    applyBalanceChanges(balanceChanges);

    setOperations(ops => [newOperation, ...ops]);
    return newOperation;
  }, [applyBalanceChanges]);

  const updateOperation = useCallback((id, updates) => {
    const balanceChanges = new Map();

    setOperations(ops => {
      const oldOperation = ops.find(op => op.id === id);
      if (!oldOperation) return ops;

      // Helper to add balance change
      const addBalanceChange = (accountId, amount) => {
        const current = balanceChanges.get(accountId) || 0;
        balanceChanges.set(accountId, current + amount);
      };

      // Reverse old operation's effect
      const oldAmount = parseFloat(oldOperation.amount) || 0;
      if (oldOperation.type === 'expense') {
        addBalanceChange(oldOperation.accountId, oldAmount);
      } else if (oldOperation.type === 'income') {
        addBalanceChange(oldOperation.accountId, -oldAmount);
      } else if (oldOperation.type === 'transfer') {
        addBalanceChange(oldOperation.accountId, oldAmount);
        if (oldOperation.toAccountId) {
          addBalanceChange(oldOperation.toAccountId, -oldAmount);
        }
      }

      // Apply new operation's effect
      const newOperation = { ...oldOperation, ...updates };
      const newAmount = parseFloat(newOperation.amount) || 0;
      if (newOperation.type === 'expense') {
        addBalanceChange(newOperation.accountId, -newAmount);
      } else if (newOperation.type === 'income') {
        addBalanceChange(newOperation.accountId, newAmount);
      } else if (newOperation.type === 'transfer') {
        addBalanceChange(newOperation.accountId, -newAmount);
        if (newOperation.toAccountId) {
          addBalanceChange(newOperation.toAccountId, newAmount);
        }
      }

      return ops.map(op => (op.id === id ? newOperation : op));
    });

    // Apply all balance changes in batch after state update
    applyBalanceChanges(balanceChanges);
  }, [applyBalanceChanges]);

  const deleteOperation = useCallback((id) => {
    const balanceChanges = new Map();

    setOperations(ops => {
      const operation = ops.find(op => op.id === id);
      if (!operation) return ops;

      // Reverse the operation's effect
      const amount = parseFloat(operation.amount) || 0;
      if (operation.type === 'expense') {
        balanceChanges.set(operation.accountId, amount);
      } else if (operation.type === 'income') {
        balanceChanges.set(operation.accountId, -amount);
      } else if (operation.type === 'transfer') {
        balanceChanges.set(operation.accountId, amount);
        if (operation.toAccountId) {
          const toChange = balanceChanges.get(operation.toAccountId) || 0;
          balanceChanges.set(operation.toAccountId, toChange - amount);
        }
      }

      return ops.filter(op => op.id !== id);
    });

    // Apply balance changes in batch
    applyBalanceChanges(balanceChanges);
  }, [applyBalanceChanges]);

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
