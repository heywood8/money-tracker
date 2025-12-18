import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as MerchantBindingsDB from '../services/MerchantBindingsDB';
import { useDialog } from './DialogContext';

const MerchantBindingsContext = createContext();

export const MerchantBindingsProvider = ({ children }) => {
  const { showDialog } = useDialog();
  const [bindings, setBindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load bindings from database
  const loadBindings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await MerchantBindingsDB.getAll();
      setBindings(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load merchant bindings:', err);
      setError(err.message);
      showDialog(
        'Load Error',
        'Failed to load merchant bindings from database.',
        [{ text: 'OK' }],
      );
    } finally {
      setLoading(false);
    }
  }, [showDialog]);

  // Load bindings on mount
  useEffect(() => {
    loadBindings();
  }, [loadBindings]);

  // Add a new merchant binding
  const addBinding = useCallback(async (merchantName, categoryId) => {
    try {
      const newBinding = await MerchantBindingsDB.create(merchantName, categoryId);
      setBindings(prev => [...prev, newBinding]);
      return newBinding;
    } catch (err) {
      console.error('Failed to add merchant binding:', err);
      showDialog(
        'Error',
        'Failed to create merchant binding. Please try again.',
        [{ text: 'OK' }],
      );
      throw err;
    }
  }, [showDialog]);

  // Update an existing merchant binding
  const updateBinding = useCallback(async (id, categoryId) => {
    try {
      await MerchantBindingsDB.update(id, categoryId);
      await loadBindings(); // Reload to get updated data
    } catch (err) {
      console.error('Failed to update merchant binding:', err);
      showDialog(
        'Error',
        'Failed to update merchant binding. Please try again.',
        [{ text: 'OK' }],
      );
      throw err;
    }
  }, [showDialog, loadBindings]);

  // Delete a merchant binding
  const removeBinding = useCallback(async (id) => {
    try {
      await MerchantBindingsDB.deleteBinding(id);
      setBindings(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      console.error('Failed to delete merchant binding:', err);
      showDialog(
        'Error',
        'Failed to delete merchant binding. Please try again.',
        [{ text: 'OK' }],
      );
      throw err;
    }
  }, [showDialog]);

  // Find binding by merchant name
  const findByMerchantName = useCallback(async (merchantName) => {
    try {
      return await MerchantBindingsDB.getByMerchantName(merchantName);
    } catch (err) {
      console.error('Failed to find merchant binding:', err);
      return null;
    }
  }, []);

  // Update last used timestamp
  const updateLastUsed = useCallback(async (id) => {
    try {
      await MerchantBindingsDB.updateLastUsed(id);
      await loadBindings(); // Reload to get updated timestamp
    } catch (err) {
      console.error('Failed to update last used:', err);
      // Don't show dialog for this - it's not critical
    }
  }, [loadBindings]);

  const value = {
    bindings,
    loading,
    error,
    loadBindings,
    addBinding,
    updateBinding,
    removeBinding,
    findByMerchantName,
    updateLastUsed,
  };

  return (
    <MerchantBindingsContext.Provider value={value}>
      {children}
    </MerchantBindingsContext.Provider>
  );
};

export const useMerchantBindings = () => {
  const context = useContext(MerchantBindingsContext);
  if (!context) {
    throw new Error('useMerchantBindings must be used within a MerchantBindingsProvider');
  }
  return context;
};
