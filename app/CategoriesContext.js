import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import defaultCategories from '../assets/defaultCategories.json';

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

  // Load categories from AsyncStorage on mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const stored = await AsyncStorage.getItem('categories');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setCategories(parsed);
          } catch (parseError) {
            console.error('Failed to parse categories:', parseError);
            // Corrupted data - reset to defaults
            setCategories(defaultCategories);
            await AsyncStorage.setItem('categories', JSON.stringify(defaultCategories));
          }
        } else {
          // Initialize with default categories
          setCategories(defaultCategories);
          try {
            await AsyncStorage.setItem('categories', JSON.stringify(defaultCategories));
          } catch (saveError) {
            console.error('Failed to save default categories:', saveError);
            Alert.alert('Storage Error', 'Unable to save categories. Changes may not persist.');
          }
        }
      } catch (error) {
        console.error('Failed to load categories:', error);
        setCategories(defaultCategories);
      } finally {
        setLoading(false);
        setDataLoaded(true);
      }
    };
    loadCategories();
  }, []);

  // Save categories to AsyncStorage whenever they change
  useEffect(() => {
    // Only save if data has been loaded (prevents race condition on initial load)
    if (dataLoaded && categories.length > 0) {
      AsyncStorage.setItem('categories', JSON.stringify(categories))
        .then(() => {
          setSaveError(null);
        })
        .catch(error => {
          console.error('Failed to save categories:', error);
          setSaveError(error.message);
          Alert.alert(
            'Save Failed',
            'Unable to save your categories. Your changes may be lost.',
            [{ text: 'OK' }]
          );
        });
    }
  }, [categories, dataLoaded]);

  const addCategory = useCallback((category) => {
    const newCategory = {
      ...category,
      id: uuid.v4(),
    };
    setCategories(cats => [...cats, newCategory]);
    return newCategory;
  }, []);

  const updateCategory = useCallback((id, updates) => {
    setCategories(cats =>
      cats.map(cat => (cat.id === id ? { ...cat, ...updates } : cat))
    );
  }, []);

  const deleteCategory = useCallback((id) => {
    // Also delete all children (cascade delete)
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
