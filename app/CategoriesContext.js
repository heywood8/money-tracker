import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import uuid from 'react-native-uuid';
import defaultCategories from '../assets/defaultCategories.json';
import * as CategoriesDB from './services/CategoriesDB';
import { appEvents, EVENTS } from './services/eventEmitter';

const CategoriesContext = createContext();

export const useCategories = () => {
  const context = useContext(CategoriesContext);
  if (!context) {
    throw new Error('useCategories must be used within a CategoriesProvider');
  }
  return context;
};

export const CategoriesProvider = ({ children }) => {
  const [categories, setCategories] = useState([]);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Reload categories from database
  const reloadCategories = useCallback(async (language = 'en') => {
    try {
      setLoading(true);
      const categoriesData = await CategoriesDB.getAllCategories();

      if (categoriesData.length === 0) {
        // Initialize with default categories in the specified language
        console.log(`Initializing default categories in ${language}...`);
        await CategoriesDB.initializeDefaultCategories(language);

        // Reload to get the newly created categories
        const newCategories = await CategoriesDB.getAllCategories();
        setCategories(newCategories);
      } else {
        setCategories(categoriesData);
      }
      setDataLoaded(true);
    } catch (error) {
      console.error('Failed to reload categories:', error);
      setCategories(defaultCategories);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load categories from SQLite on mount
  useEffect(() => {
    reloadCategories();
  }, [reloadCategories]);

  // Listen for reload events
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.RELOAD_ALL, () => {
      console.log('Reloading categories due to RELOAD_ALL event');
      reloadCategories();
    });

    return unsubscribe;
  }, [reloadCategories]);

  // Listen for DATABASE_RESET event to clear categories
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.DATABASE_RESET, () => {
      console.log('CategoriesContext: Database reset detected, clearing categories');
      // Clear categories so they can be re-initialized with the selected language
      setCategories([]);
      setDataLoaded(false);
    });

    return unsubscribe;
  }, []);

  const addCategory = useCallback(async (category) => {
    try {
      const newCategory = {
        ...category,
        id: uuid.v4(),
      };

      await CategoriesDB.createCategory(newCategory);
      setCategories(cats => [...cats, newCategory]);
      setSaveError(null);
      return newCategory;
    } catch (error) {
      console.error('Failed to add category:', error);
      setSaveError(error.message);
      Alert.alert(
        'Error',
        'Failed to create category. Please try again.',
        [{ text: 'OK' }]
      );
      throw error;
    }
  }, []);

  const updateCategory = useCallback(async (id, updates) => {
    try {
      await CategoriesDB.updateCategory(id, updates);
      setCategories(cats =>
        cats.map(cat => (cat.id === id ? { ...cat, ...updates } : cat))
      );
      setSaveError(null);
    } catch (error) {
      console.error('Failed to update category:', error);
      setSaveError(error.message);
      Alert.alert(
        'Error',
        'Failed to update category. Please try again.',
        [{ text: 'OK' }]
      );
      throw error;
    }
  }, []);

  const deleteCategory = useCallback(async (id) => {
    try {
      // SQLite will handle cascade deletion of children via foreign keys
      await CategoriesDB.deleteCategory(id);

      // Update local state to remove deleted category and its children
      setCategories(cats => {
        const toDelete = new Set([id]);

        // Find all descendants recursively
        const findDescendants = (parentId) => {
          cats.forEach(cat => {
            if (cat.parentId === parentId) {
              toDelete.add(cat.id);
              findDescendants(cat.id);
            }
          });
        };

        findDescendants(id);

        return cats.filter(cat => !toDelete.has(cat.id));
      });
      setSaveError(null);
    } catch (error) {
      console.error('Failed to delete category:', error);
      setSaveError(error.message);
      Alert.alert(
        'Error',
        'Failed to delete category. Please try again.',
        [{ text: 'OK' }]
      );
      throw error;
    }
  }, []);

  const toggleExpanded = useCallback((id) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const getChildren = useCallback((parentId) => {
    return categories.filter(cat => cat.parentId === parentId);
  }, [categories]);

  const getCategoryPath = useCallback((categoryId) => {
    const path = [];
    let current = categories.find(cat => cat.id === categoryId);

    while (current) {
      path.unshift(current);
      current = categories.find(cat => cat.id === current.parentId);
    }

    return path;
  }, [categories]);

  const validateCategory = useCallback((category) => {
    if (!category.name || category.name.trim() === '') {
      return 'Category name is required';
    }
    if (!category.category_type && !category.categoryType) {
      return 'Category type (expense/income) is required';
    }
    if (!category.icon) {
      return 'Icon is required';
    }
    return null;
  }, []);

  const value = useMemo(() => ({
    categories,
    loading,
    expandedIds,
    addCategory,
    updateCategory,
    deleteCategory,
    toggleExpanded,
    getChildren,
    getCategoryPath,
    validateCategory,
    reloadCategories,
    saveError,
  }), [
    categories,
    loading,
    expandedIds,
    addCategory,
    updateCategory,
    deleteCategory,
    toggleExpanded,
    getChildren,
    getCategoryPath,
    validateCategory,
    reloadCategories,
    saveError,
  ]);

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
};
