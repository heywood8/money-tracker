import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as CardBindingsDB from '../services/CardBindingsDB';
import { useDialog } from './DialogContext';

const CardBindingsContext = createContext();

export const CardBindingsProvider = ({ children }) => {
  const { showDialog } = useDialog();
  const [bindings, setBindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load bindings from database
  const loadBindings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await CardBindingsDB.getAll();
      setBindings(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load card bindings:', err);
      setError(err.message);
      showDialog(
        'Load Error',
        'Failed to load card bindings from database.',
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

  // Add a new card binding
  const addBinding = useCallback(async (cardMask, accountId, bankName = null) => {
    try {
      const newBinding = await CardBindingsDB.create(cardMask, accountId, bankName);
      setBindings(prev => [...prev, newBinding]);
      return newBinding;
    } catch (err) {
      console.error('Failed to add card binding:', err);
      showDialog(
        'Error',
        'Failed to create card binding. Please try again.',
        [{ text: 'OK' }],
      );
      throw err;
    }
  }, [showDialog]);

  // Update an existing card binding
  const updateBinding = useCallback(async (id, accountId) => {
    try {
      await CardBindingsDB.update(id, accountId);
      await loadBindings(); // Reload to get updated data
    } catch (err) {
      console.error('Failed to update card binding:', err);
      showDialog(
        'Error',
        'Failed to update card binding. Please try again.',
        [{ text: 'OK' }],
      );
      throw err;
    }
  }, [showDialog, loadBindings]);

  // Delete a card binding
  const removeBinding = useCallback(async (id) => {
    try {
      await CardBindingsDB.deleteBinding(id);
      setBindings(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      console.error('Failed to delete card binding:', err);
      showDialog(
        'Error',
        'Failed to delete card binding. Please try again.',
        [{ text: 'OK' }],
      );
      throw err;
    }
  }, [showDialog]);

  // Find binding by card mask
  const findByCardMask = useCallback(async (cardMask) => {
    try {
      return await CardBindingsDB.getByCardMask(cardMask);
    } catch (err) {
      console.error('Failed to find card binding:', err);
      return null;
    }
  }, []);

  // Update last used timestamp
  const updateLastUsed = useCallback(async (id) => {
    try {
      await CardBindingsDB.updateLastUsed(id);
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
    findByCardMask,
    updateLastUsed,
  };

  return (
    <CardBindingsContext.Provider value={value}>
      {children}
    </CardBindingsContext.Provider>
  );
};

export const useCardBindings = () => {
  const context = useContext(CardBindingsContext);
  if (!context) {
    throw new Error('useCardBindings must be used within a CardBindingsProvider');
  }
  return context;
};
