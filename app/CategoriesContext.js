import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import uuid from 'react-native-uuid';
import defaultCategories from '../assets/defaultCategories.json';
import * as CategoriesDB from './services/CategoriesDB';

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

  // Load categories from SQLite on mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const categoriesData = await CategoriesDB.getAllCategories();

        if (categoriesData.length === 0) {
          // Initialize with default categories
          console.log('Initializing default categories...');
          for (const category of defaultCategories) {
            try {
              await CategoriesDB.createCategory(category);
            } catch (err) {
              console.error('Failed to create default category:', category.id, err);
            }
          }
          setCategories(defaultCategories);
        } else {
          setCategories(categoriesData);
        }
      } catch (error) {
        console.error('Failed to load categories:', error);
        setCategories(defaultCategories);
        Alert.alert(
          'Load Error',
          'Failed to load categories from database.',
          [{ text: 'OK' }]
        );
      } finally {
        setLoading(false);
        setDataLoaded(true);
      }
    };
    loadCategories();
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
    if (!category.type) {
      return 'Category type is required';
    }
    if (category.type !== 'folder' && !category.parentId) {
      return 'Parent folder is required for subfolders and entries';
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
    saveError,
  ]);

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
};
