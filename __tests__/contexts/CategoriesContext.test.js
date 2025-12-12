/**
 * Tests for CategoriesContext - Category management (hierarchical structure)
 * These tests ensure category CRUD, hierarchy, validation, and default initialization work correctly
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { CategoriesProvider, useCategories } from '../../app/contexts/CategoriesContext';
import * as CategoriesDB from '../../app/services/CategoriesDB';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';
import defaultCategories from '../../app/defaults/defaultCategories.json';

// Mock dependencies
jest.mock('../../app/services/CategoriesDB');
jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: {
    on: jest.fn((event, listener) => jest.fn()), // Return unsubscribe function
    emit: jest.fn(),
  },
  EVENTS: {
    RELOAD_ALL: 'reload:all',
    DATABASE_RESET: 'database:reset',
  },
}));

// Mock LocalizationContext
const mockIsFirstLaunch = jest.fn(() => false);
const mockLanguage = jest.fn(() => 'en');
jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    isFirstLaunch: mockIsFirstLaunch(),
    language: mockLanguage(),
  }),
}));

// Mock DialogContext
const mockShowDialog = jest.fn();
jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({
    showDialog: mockShowDialog,
    hideDialog: jest.fn(),
  }),
}));

describe('CategoriesContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShowDialog.mockClear();
    mockIsFirstLaunch.mockReturnValue(false);
    mockLanguage.mockReturnValue('en');

    // Default mocks
    CategoriesDB.getAllCategories.mockResolvedValue([]);
    CategoriesDB.initializeDefaultCategories.mockResolvedValue(undefined);
    // Return realistic created category object for createCategory
    CategoriesDB.createCategory.mockImplementation(async (category) => {
      return {
        ...category,
        id: Date.now() + Math.floor(Math.random() * 1000),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
    CategoriesDB.updateCategory.mockResolvedValue(undefined);
    CategoriesDB.deleteCategory.mockResolvedValue(undefined);
  });

  const wrapper = ({ children }) => <CategoriesProvider>{children}</CategoriesProvider>;

  describe('Initialization', () => {
    it('provides categories context with default values', async () => {
      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.categories).toEqual([]);
      expect(result.current.expandedIds).toBeInstanceOf(Set);
      expect(result.current.addCategory).toBeDefined();
      expect(result.current.updateCategory).toBeDefined();
      expect(result.current.deleteCategory).toBeDefined();
      expect(result.current.validateCategory).toBeDefined();
    });

    it('loads categories from database on mount', async () => {
      const mockCategories = [
        { id: 'cat1', name: 'Food', type: 'folder', categoryType: 'expense' },
        { id: 'cat2', name: 'Transport', type: 'folder', categoryType: 'expense' },
      ];
      CategoriesDB.getAllCategories.mockResolvedValue(mockCategories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(CategoriesDB.getAllCategories).toHaveBeenCalledWith(true);
      expect(result.current.categories).toEqual(mockCategories);
    });

    it('initializes default categories when database is empty', async () => {
      CategoriesDB.getAllCategories
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(defaultCategories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(CategoriesDB.initializeDefaultCategories).toHaveBeenCalledWith('en');
      expect(CategoriesDB.getAllCategories).toHaveBeenCalledTimes(2);
      expect(result.current.categories).toEqual(defaultCategories);
    });

    it('initializes with correct language', async () => {
      mockLanguage.mockReturnValue('ru');
      CategoriesDB.getAllCategories
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(CategoriesDB.initializeDefaultCategories).toHaveBeenCalledWith('ru');
      });
    });

    it('skips loading on first launch', async () => {
      mockIsFirstLaunch.mockReturnValue(true);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(CategoriesDB.getAllCategories).not.toHaveBeenCalled();
      expect(result.current.categories).toEqual([]);
    });

    it('falls back to default categories on error', async () => {
      CategoriesDB.getAllCategories.mockRejectedValue(new Error('Load failed'));

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.categories).toEqual(defaultCategories);
    });
  });

  describe('CRUD Operations', () => {
    it('adds a new category', async () => {
      CategoriesDB.getAllCategories.mockResolvedValue([]);
      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newCategory = {
        name: 'Groceries',
        type: 'entry',
        categoryType: 'expense',
        icon: 'cart',
        color: '#FF0000',
      };

      await act(async () => {
        await result.current.addCategory(newCategory);
      });

      expect(CategoriesDB.createCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          ...newCategory,
        })
      );

      expect(result.current.categories).toHaveLength(1);
      expect(result.current.categories[0].name).toBe('Groceries');
    });

    it('updates an existing category', async () => {
      const existingCategories = [
        { id: 'cat1', name: 'Food', type: 'folder', categoryType: 'expense', icon: 'food' },
      ];
      CategoriesDB.getAllCategories.mockResolvedValue(existingCategories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateCategory('cat1', { name: 'Food & Drinks', icon: 'beer' });
      });

      expect(CategoriesDB.updateCategory).toHaveBeenCalledWith('cat1', {
        name: 'Food & Drinks',
        icon: 'beer',
      });

      expect(result.current.categories[0].name).toBe('Food & Drinks');
      expect(result.current.categories[0].icon).toBe('beer');
    });

    it('deletes a category', async () => {
      const existingCategories = [
        { id: 'cat1', name: 'Food', type: 'folder', categoryType: 'expense' },
        { id: 'cat2', name: 'Transport', type: 'folder', categoryType: 'expense' },
      ];
      CategoriesDB.getAllCategories.mockResolvedValue(existingCategories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.categories).toHaveLength(2);

      await act(async () => {
        await result.current.deleteCategory('cat1');
      });

      expect(CategoriesDB.deleteCategory).toHaveBeenCalledWith('cat1');
      expect(result.current.categories).toHaveLength(1);
      expect(result.current.categories[0].id).toBe('cat2');
    });

    it('deletes category with children recursively', async () => {
      const existingCategories = [
        { id: 'cat1', name: 'Food', type: 'folder', categoryType: 'expense', parentId: null },
        { id: 'cat2', name: 'Groceries', type: 'entry', categoryType: 'expense', parentId: 'cat1' },
        { id: 'cat3', name: 'Restaurants', type: 'entry', categoryType: 'expense', parentId: 'cat1' },
        { id: 'cat4', name: 'Transport', type: 'folder', categoryType: 'expense', parentId: null },
      ];
      CategoriesDB.getAllCategories.mockResolvedValue(existingCategories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteCategory('cat1');
      });

      // Should remove cat1 and its children (cat2, cat3)
      expect(result.current.categories).toHaveLength(1);
      expect(result.current.categories[0].id).toBe('cat4');
    });

    it('handles add category error and shows dialog', async () => {
      CategoriesDB.getAllCategories.mockResolvedValue([]);
      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      CategoriesDB.createCategory.mockRejectedValue(new Error('Create failed'));

      let error;
      try {
        await act(async () => {
          await result.current.addCategory({
            name: 'Test',
            type: 'entry',
            categoryType: 'expense',
            icon: 'test',
          });
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.message).toBe('Create failed');
      expect(mockShowDialog).toHaveBeenCalledWith(
        'Error',
        'Failed to create category. Please try again.',
        [{ text: 'OK' }]
      );
    });

    it('handles update category error and shows dialog', async () => {
      const existingCategories = [
        { id: 'cat1', name: 'Food', type: 'folder', categoryType: 'expense' },
      ];
      CategoriesDB.getAllCategories.mockResolvedValue(existingCategories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      CategoriesDB.updateCategory.mockRejectedValue(new Error('Update failed'));

      let error;
      try {
        await act(async () => {
          await result.current.updateCategory('cat1', { name: 'Updated' });
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(mockShowDialog).toHaveBeenCalled();
    });

    it('handles delete category error and shows dialog', async () => {
      const existingCategories = [
        { id: 'cat1', name: 'Food', type: 'folder', categoryType: 'expense' },
      ];
      CategoriesDB.getAllCategories.mockResolvedValue(existingCategories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      CategoriesDB.deleteCategory.mockRejectedValue(new Error('Delete failed'));

      let error;
      try {
        await act(async () => {
          await result.current.deleteCategory('cat1');
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(mockShowDialog).toHaveBeenCalled();
    });
  });

  describe('Validation', () => {
    it('validates category with all required fields', async () => {
      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const validCategory = {
        name: 'Food',
        categoryType: 'expense',
        icon: 'food',
      };

      const error = result.current.validateCategory(validCategory);
      expect(error).toBeNull();
    });

    it('rejects category without name', async () => {
      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const invalidCategory = {
        categoryType: 'expense',
        icon: 'food',
      };

      const error = result.current.validateCategory(invalidCategory);
      expect(error).toBeTruthy();
      expect(error).toContain('name');
    });

    it('rejects category with empty name', async () => {
      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const invalidCategory = {
        name: '   ',
        categoryType: 'expense',
        icon: 'food',
      };

      const error = result.current.validateCategory(invalidCategory);
      expect(error).toBeTruthy();
    });

    it('rejects category without categoryType', async () => {
      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const invalidCategory = {
        name: 'Food',
        icon: 'food',
      };

      const error = result.current.validateCategory(invalidCategory);
      expect(error).toBeTruthy();
      expect(error).toContain('type');
    });

    it('accepts category with category_type (snake_case)', async () => {
      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const validCategory = {
        name: 'Food',
        category_type: 'expense', // snake_case version
        icon: 'food',
      };

      const error = result.current.validateCategory(validCategory);
      expect(error).toBeNull();
    });

    it('rejects category without icon', async () => {
      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const invalidCategory = {
        name: 'Food',
        categoryType: 'expense',
      };

      const error = result.current.validateCategory(invalidCategory);
      expect(error).toBeTruthy();
      expect(error).toContain('icon');
    });

    it('uses translation function for validation messages', async () => {
      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const mockT = jest.fn((key) => `translated_${key}`);
      const invalidCategory = { name: 'Food', categoryType: 'expense' };

      const error = result.current.validateCategory(invalidCategory, mockT);
      expect(error).toBe('translated_icon_required');
      expect(mockT).toHaveBeenCalledWith('icon_required');
    });
  });

  describe('Hierarchy Functions', () => {
    it('toggles expanded state for category', async () => {
      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.expandedIds.has('cat1')).toBe(false);

      act(() => {
        result.current.toggleExpanded('cat1');
      });

      expect(result.current.expandedIds.has('cat1')).toBe(true);

      act(() => {
        result.current.toggleExpanded('cat1');
      });

      expect(result.current.expandedIds.has('cat1')).toBe(false);
    });

    it('gets children of a parent category', async () => {
      const existingCategories = [
        { id: 'cat1', name: 'Food', parentId: null },
        { id: 'cat2', name: 'Groceries', parentId: 'cat1' },
        { id: 'cat3', name: 'Restaurants', parentId: 'cat1' },
        { id: 'cat4', name: 'Transport', parentId: null },
      ];
      CategoriesDB.getAllCategories.mockResolvedValue(existingCategories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const children = result.current.getChildren('cat1');

      expect(children).toHaveLength(2);
      expect(children.map(c => c.id)).toEqual(['cat2', 'cat3']);
    });

    it('returns empty array for category with no children', async () => {
      const existingCategories = [
        { id: 'cat1', name: 'Food', parentId: null },
      ];
      CategoriesDB.getAllCategories.mockResolvedValue(existingCategories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const children = result.current.getChildren('cat1');

      expect(children).toEqual([]);
    });

    it('gets category path from leaf to root', async () => {
      const existingCategories = [
        { id: 'cat1', name: 'Food', parentId: null },
        { id: 'cat2', name: 'Groceries', parentId: 'cat1' },
        { id: 'cat3', name: 'Dairy', parentId: 'cat2' },
      ];
      CategoriesDB.getAllCategories.mockResolvedValue(existingCategories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const path = result.current.getCategoryPath('cat3');

      expect(path).toHaveLength(3);
      expect(path.map(c => c.id)).toEqual(['cat1', 'cat2', 'cat3']);
      expect(path.map(c => c.name)).toEqual(['Food', 'Groceries', 'Dairy']);
    });

    it('returns single element path for root category', async () => {
      const existingCategories = [
        { id: 'cat1', name: 'Food', parentId: null },
      ];
      CategoriesDB.getAllCategories.mockResolvedValue(existingCategories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const path = result.current.getCategoryPath('cat1');

      expect(path).toHaveLength(1);
      expect(path[0].id).toBe('cat1');
    });

    it('returns empty path for non-existent category', async () => {
      const existingCategories = [
        { id: 'cat1', name: 'Food', parentId: null },
      ];
      CategoriesDB.getAllCategories.mockResolvedValue(existingCategories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const path = result.current.getCategoryPath('non-existent');

      expect(path).toEqual([]);
    });
  });

  describe('Reload Functionality', () => {
    it('reloads categories from database', async () => {
      const initialCategories = [
        { id: 'cat1', name: 'Food', type: 'folder', categoryType: 'expense' },
      ];
      const reloadedCategories = [
        { id: 'cat1', name: 'Food', type: 'folder', categoryType: 'expense' },
        { id: 'cat2', name: 'Transport', type: 'folder', categoryType: 'expense' },
      ];

      CategoriesDB.getAllCategories
        .mockResolvedValueOnce(initialCategories)
        .mockResolvedValueOnce(reloadedCategories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.categories).toHaveLength(1);

      await act(async () => {
        await result.current.reloadCategories('en');
      });

      expect(result.current.categories).toHaveLength(2);
    });

    it('listens to RELOAD_ALL event', async () => {
      let reloadListener;
      appEvents.on.mockImplementation((event, listener) => {
        if (event === EVENTS.RELOAD_ALL) {
          reloadListener = listener;
        }
        return jest.fn(); // Unsubscribe function
      });

      CategoriesDB.getAllCategories
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'cat1', name: 'Food', type: 'folder', categoryType: 'expense' },
        ]);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(appEvents.on).toHaveBeenCalledWith(EVENTS.RELOAD_ALL, expect.any(Function));

      // Trigger the reload event
      await act(async () => {
        reloadListener();
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      await waitFor(() => {
        expect(result.current.categories).toHaveLength(1);
      });
    });

    it('listens to DATABASE_RESET event and clears categories', async () => {
      let resetListener;
      appEvents.on.mockImplementation((event, listener) => {
        if (event === EVENTS.DATABASE_RESET) {
          resetListener = listener;
        }
        return jest.fn();
      });

      CategoriesDB.getAllCategories.mockResolvedValue([
        { id: 'cat1', name: 'Food', type: 'folder', categoryType: 'expense' },
      ]);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.categories).toHaveLength(1);

      // Trigger the reset event
      act(() => {
        resetListener();
      });

      expect(result.current.categories).toEqual([]);
    });
  });

  describe('Regression Tests', () => {
    it('maintains category order after updates', async () => {
      const categories = [
        { id: 'cat1', name: 'Food', type: 'folder', categoryType: 'expense' },
        { id: 'cat2', name: 'Transport', type: 'folder', categoryType: 'expense' },
        { id: 'cat3', name: 'Entertainment', type: 'folder', categoryType: 'expense' },
      ];
      CategoriesDB.getAllCategories.mockResolvedValue(categories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateCategory('cat2', { name: 'Updated Transport' });
      });

      expect(result.current.categories[1].id).toBe('cat2');
      expect(result.current.categories[1].name).toBe('Updated Transport');
    });

    it('clears save error after successful operation', async () => {
      CategoriesDB.getAllCategories.mockResolvedValue([]);
      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Fail first
      CategoriesDB.createCategory.mockRejectedValue(new Error('Create failed'));
      try {
        await act(async () => {
          await result.current.addCategory({
            name: 'Test',
            type: 'entry',
            categoryType: 'expense',
            icon: 'test',
          });
        });
      } catch (err) {
        // Expected
      }

      // Succeed second time
      CategoriesDB.createCategory.mockResolvedValue(undefined);

      await act(async () => {
        await result.current.addCategory({
          name: 'Success',
          type: 'entry',
          categoryType: 'expense',
          icon: 'check',
        });
      });

      // Save error should be cleared
      expect(result.current.categories).toHaveLength(1);
    });

    it('handles concurrent category additions', async () => {
      CategoriesDB.getAllCategories.mockResolvedValue([]);
      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await Promise.all([
          result.current.addCategory({
            name: 'Food',
            type: 'folder',
            categoryType: 'expense',
            icon: 'food',
          }),
          result.current.addCategory({
            name: 'Transport',
            type: 'folder',
            categoryType: 'expense',
            icon: 'car',
          }),
        ]);
      });

      expect(CategoriesDB.createCategory).toHaveBeenCalledTimes(2);
      expect(result.current.categories).toHaveLength(2);
    });

    it('preserves category IDs across operations', async () => {
      const categories = [
        { id: 'cat-original', name: 'Food', type: 'folder', categoryType: 'expense' },
      ];
      CategoriesDB.getAllCategories.mockResolvedValue(categories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const originalId = result.current.categories[0].id;

      await act(async () => {
        await result.current.updateCategory(originalId, { name: 'Updated Food' });
      });

      expect(result.current.categories[0].id).toBe(originalId);
    });

    it('handles deeply nested category deletion', async () => {
      const categories = [
        { id: 'cat1', name: 'Level 1', parentId: null },
        { id: 'cat2', name: 'Level 2', parentId: 'cat1' },
        { id: 'cat3', name: 'Level 3', parentId: 'cat2' },
        { id: 'cat4', name: 'Level 4', parentId: 'cat3' },
        { id: 'cat5', name: 'Other', parentId: null },
      ];
      CategoriesDB.getAllCategories.mockResolvedValue(categories);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteCategory('cat1');
      });

      // Should remove cat1 and all its descendants (cat2, cat3, cat4)
      expect(result.current.categories).toHaveLength(1);
      expect(result.current.categories[0].id).toBe('cat5');
    });

    it('handles multiple expanded categories', async () => {
      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.toggleExpanded('cat1');
        result.current.toggleExpanded('cat2');
        result.current.toggleExpanded('cat3');
      });

      expect(result.current.expandedIds.size).toBe(3);
      expect(result.current.expandedIds.has('cat1')).toBe(true);
      expect(result.current.expandedIds.has('cat2')).toBe(true);
      expect(result.current.expandedIds.has('cat3')).toBe(true);
    });

    it('initializes with correct language when changed', async () => {
      mockLanguage.mockReturnValue('ru');
      CategoriesDB.getAllCategories
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'cat1', name: 'Еда', type: 'folder', categoryType: 'expense' },
        ]);

      const { result } = renderHook(() => useCategories(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(CategoriesDB.initializeDefaultCategories).toHaveBeenCalledWith('ru');
      expect(result.current.categories[0].name).toBe('Еда');
    });
  });
});
