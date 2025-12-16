/**
 * Tests for CategoriesDB.js - Database operations for categories
 * These tests ensure CRUD operations, hierarchy management, shadow categories,
 * and data integrity are maintained correctly
 */

import * as CategoriesDB from '../../app/services/CategoriesDB';
import * as db from '../../app/services/db';

// Mock the database module
jest.mock('../../app/services/db');

describe('CategoriesDB', () => {
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database functions
    mockDb = {
      queryAll: jest.fn(),
      queryFirst: jest.fn(),
      executeQuery: jest.fn(),
      executeTransaction: jest.fn(),
    };

    jest.spyOn(db, 'queryAll').mockImplementation(mockDb.queryAll);
    jest.spyOn(db, 'queryFirst').mockImplementation(mockDb.queryFirst);
    jest.spyOn(db, 'executeQuery').mockImplementation(mockDb.executeQuery);
    jest.spyOn(db, 'executeTransaction').mockImplementation(mockDb.executeTransaction);
  });

  describe('Field Mapping', () => {
    it('maps database fields to camelCase correctly', async () => {
      const dbCategory = {
        id: 'cat-1',
        name: 'Food',
        type: 'folder',
        category_type: 'expense',
        parent_id: null,
        icon: 'food',
        color: '#FF5722',
        is_shadow: 0,
        exclude_from_forecast: 1,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      mockDb.queryAll.mockResolvedValue([dbCategory]);

      const result = await CategoriesDB.getAllCategories();

      expect(result[0]).toEqual({
        id: 'cat-1',
        name: 'Food',
        type: 'folder',
        categoryType: 'expense',
        parentId: null,
        icon: 'food',
        color: '#FF5722',
        isShadow: false,
        excludeFromForecast: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
    });

    it('handles boolean conversion for is_shadow field (numeric)', async () => {
      const dbCategory = {
        id: 'cat-1',
        name: 'Shadow',
        is_shadow: 1,
        exclude_from_forecast: 0,
      };

      mockDb.queryAll.mockResolvedValue([dbCategory]);
      const result = await CategoriesDB.getAllCategories();

      expect(result[0].isShadow).toBe(true);
    });

    it('handles boolean conversion for is_shadow field (boolean)', async () => {
      const dbCategory = {
        id: 'cat-1',
        name: 'Shadow',
        is_shadow: true,
        exclude_from_forecast: false,
      };

      mockDb.queryAll.mockResolvedValue([dbCategory]);
      const result = await CategoriesDB.getAllCategories();

      expect(result[0].isShadow).toBe(true);
    });
  });

  describe('getAllCategories', () => {
    it('retrieves all non-shadow categories by default', async () => {
      const mockCategories = [
        { id: '1', name: 'Food', is_shadow: 0 },
        { id: '2', name: 'Transport', is_shadow: 0 },
      ];

      mockDb.queryAll.mockResolvedValue(mockCategories);

      const result = await CategoriesDB.getAllCategories();

      expect(db.queryAll).toHaveBeenCalledWith(
        'SELECT * FROM categories WHERE is_shadow = 0 ORDER BY created_at ASC',
      );
      expect(result).toHaveLength(2);
    });

    it('includes shadow categories when includeShadow is true', async () => {
      const mockCategories = [
        { id: '1', name: 'Food', is_shadow: 0 },
        { id: '2', name: 'Shadow', is_shadow: 1 },
      ];

      mockDb.queryAll.mockResolvedValue(mockCategories);

      const result = await CategoriesDB.getAllCategories(true);

      expect(db.queryAll).toHaveBeenCalledWith(
        'SELECT * FROM categories ORDER BY created_at ASC',
      );
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no categories exist', async () => {
      mockDb.queryAll.mockResolvedValue([]);

      const result = await CategoriesDB.getAllCategories();

      expect(result).toEqual([]);
    });

    it('handles null result from database', async () => {
      mockDb.queryAll.mockResolvedValue(null);

      const result = await CategoriesDB.getAllCategories();

      expect(result).toEqual([]);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDb.queryAll.mockRejectedValue(error);

      await expect(CategoriesDB.getAllCategories()).rejects.toThrow('Database error');
    });
  });

  describe('getShadowCategories', () => {
    it('retrieves only shadow categories', async () => {
      const mockCategories = [
        { id: 'shadow-1', name: 'Adjustment Expense', is_shadow: 1 },
        { id: 'shadow-2', name: 'Adjustment Income', is_shadow: 1 },
      ];

      mockDb.queryAll.mockResolvedValue(mockCategories);

      const result = await CategoriesDB.getShadowCategories();

      expect(db.queryAll).toHaveBeenCalledWith(
        'SELECT * FROM categories WHERE is_shadow = 1 ORDER BY created_at ASC',
      );
      expect(result).toHaveLength(2);
      expect(result[0].isShadow).toBe(true);
    });

    it('returns empty array when no shadow categories exist', async () => {
      mockDb.queryAll.mockResolvedValue([]);

      const result = await CategoriesDB.getShadowCategories();

      expect(result).toEqual([]);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDb.queryAll.mockRejectedValue(error);

      await expect(CategoriesDB.getShadowCategories()).rejects.toThrow('Database error');
    });
  });

  describe('getCategoryById', () => {
    it('retrieves category by ID', async () => {
      const mockCategory = {
        id: 'cat-1',
        name: 'Food',
        type: 'folder',
        category_type: 'expense',
      };

      mockDb.queryFirst.mockResolvedValue(mockCategory);

      const result = await CategoriesDB.getCategoryById('cat-1');

      expect(db.queryFirst).toHaveBeenCalledWith(
        'SELECT * FROM categories WHERE id = ?',
        ['cat-1'],
      );
      expect(result.id).toBe('cat-1');
      expect(result.name).toBe('Food');
    });

    it('returns null when category does not exist', async () => {
      mockDb.queryFirst.mockResolvedValue(null);

      const result = await CategoriesDB.getCategoryById('non-existent');

      expect(result).toBeNull();
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDb.queryFirst.mockRejectedValue(error);

      await expect(CategoriesDB.getCategoryById('cat-1')).rejects.toThrow('Database error');
    });
  });

  describe('getCategoriesByCategoryType', () => {
    it('retrieves expense categories', async () => {
      const mockCategories = [
        { id: '1', name: 'Food', category_type: 'expense', is_shadow: 0 },
        { id: '2', name: 'Transport', category_type: 'expense', is_shadow: 0 },
      ];

      mockDb.queryAll.mockResolvedValue(mockCategories);

      const result = await CategoriesDB.getCategoriesByCategoryType('expense');

      expect(db.queryAll).toHaveBeenCalledWith(
        'SELECT * FROM categories WHERE category_type = ? AND is_shadow = 0 ORDER BY created_at ASC',
        ['expense'],
      );
      expect(result).toHaveLength(2);
    });

    it('retrieves income categories', async () => {
      const mockCategories = [
        { id: '1', name: 'Salary', category_type: 'income', is_shadow: 0 },
      ];

      mockDb.queryAll.mockResolvedValue(mockCategories);

      const result = await CategoriesDB.getCategoriesByCategoryType('income');

      expect(db.queryAll).toHaveBeenCalledWith(
        'SELECT * FROM categories WHERE category_type = ? AND is_shadow = 0 ORDER BY created_at ASC',
        ['income'],
      );
      expect(result).toHaveLength(1);
      expect(result[0].categoryType).toBe('income');
    });

    it('includes shadow categories when includeShadow is true', async () => {
      const mockCategories = [
        { id: '1', name: 'Food', category_type: 'expense', is_shadow: 0 },
        { id: '2', name: 'Shadow', category_type: 'expense', is_shadow: 1 },
      ];

      mockDb.queryAll.mockResolvedValue(mockCategories);

      const result = await CategoriesDB.getCategoriesByCategoryType('expense', true);

      expect(db.queryAll).toHaveBeenCalledWith(
        'SELECT * FROM categories WHERE category_type = ? ORDER BY created_at ASC',
        ['expense'],
      );
      expect(result).toHaveLength(2);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDb.queryAll.mockRejectedValue(error);

      await expect(CategoriesDB.getCategoriesByCategoryType('expense')).rejects.toThrow('Database error');
    });
  });

  describe('getChildCategories', () => {
    it('retrieves child categories of a parent', async () => {
      const mockCategories = [
        { id: 'child-1', name: 'Groceries', parent_id: 'parent-1' },
        { id: 'child-2', name: 'Restaurants', parent_id: 'parent-1' },
      ];

      mockDb.queryAll.mockResolvedValue(mockCategories);

      const result = await CategoriesDB.getChildCategories('parent-1');

      expect(db.queryAll).toHaveBeenCalledWith(
        'SELECT * FROM categories WHERE parent_id = ? ORDER BY created_at ASC',
        ['parent-1'],
      );
      expect(result).toHaveLength(2);
    });

    it('retrieves root categories when parentId is null', async () => {
      const mockCategories = [
        { id: 'root-1', name: 'Food', parent_id: null },
        { id: 'root-2', name: 'Transport', parent_id: null },
      ];

      mockDb.queryAll.mockResolvedValue(mockCategories);

      const result = await CategoriesDB.getChildCategories(null);

      expect(db.queryAll).toHaveBeenCalledWith(
        'SELECT * FROM categories WHERE parent_id IS NULL ORDER BY created_at ASC',
      );
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no children exist', async () => {
      mockDb.queryAll.mockResolvedValue([]);

      const result = await CategoriesDB.getChildCategories('parent-1');

      expect(result).toEqual([]);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDb.queryAll.mockRejectedValue(error);

      await expect(CategoriesDB.getChildCategories('parent-1')).rejects.toThrow('Database error');
    });
  });

  describe('createCategory', () => {
    it('creates a new category with all fields', async () => {
      const newCategory = {
        id: 'cat-1',
        name: 'Food',
        type: 'folder',
        category_type: 'expense',
        parentId: null,
        icon: 'food',
        color: '#FF5722',
        isShadow: false,
        excludeFromForecast: false,
      };

      mockDb.executeQuery.mockResolvedValue();

      const result = await CategoriesDB.createCategory(newCategory);

      expect(db.executeQuery).toHaveBeenCalled();
      const [query, params] = mockDb.executeQuery.mock.calls[0];
      expect(query).toContain('INSERT INTO categories');
      expect(params[0]).toBe('cat-1');
      expect(params[1]).toBe('Food');
      expect(params[2]).toBe('folder');
      expect(params[3]).toBe('expense');
      expect(params[4]).toBeNull();
      expect(params[5]).toBe('food');
      expect(params[6]).toBe('#FF5722');
      expect(params[7]).toBe(0); // is_shadow
      expect(params[8]).toBe(0); // exclude_from_forecast
      expect(result.name).toBe('Food');
    });

    it('creates category with default values when optional fields are missing', async () => {
      const newCategory = {
        id: 'cat-1',
        name: 'Food',
      };

      mockDb.executeQuery.mockResolvedValue();

      const result = await CategoriesDB.createCategory(newCategory);

      const [query, params] = mockDb.executeQuery.mock.calls[0];
      expect(params[2]).toBe('folder'); // default type
      expect(params[3]).toBe('expense'); // default category_type
      expect(params[4]).toBeNull(); // default parent_id
      expect(params[5]).toBeNull(); // default icon
      expect(params[6]).toBeNull(); // default color
      expect(params[7]).toBe(0); // default is_shadow
    });

    it('handles both camelCase and snake_case field names', async () => {
      const newCategory = {
        id: 'cat-1',
        name: 'Food',
        categoryType: 'income', // camelCase
        parent_id: 'parent-1', // snake_case
        is_shadow: true, // snake_case
      };

      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.createCategory(newCategory);

      const [query, params] = mockDb.executeQuery.mock.calls[0];
      expect(params[3]).toBe('income'); // should use categoryType
      expect(params[4]).toBe('parent-1'); // should handle parent_id
      expect(params[7]).toBe(1); // should convert is_shadow to 1
    });

    it('converts isShadow boolean to integer', async () => {
      const newCategory = {
        id: 'cat-1',
        name: 'Shadow Category',
        isShadow: true,
      };

      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.createCategory(newCategory);

      const [query, params] = mockDb.executeQuery.mock.calls[0];
      expect(params[7]).toBe(1);
    });

    it('sets created_at and updated_at timestamps', async () => {
      const newCategory = {
        id: 'cat-1',
        name: 'Food',
      };

      mockDb.executeQuery.mockResolvedValue();

      const result = await CategoriesDB.createCategory(newCategory);

      const [query, params] = mockDb.executeQuery.mock.calls[0];
      expect(params[9]).toBeDefined(); // created_at
      expect(params[10]).toBeDefined(); // updated_at
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('throws error when database insert fails', async () => {
      const error = new Error('Database error');
      mockDb.executeQuery.mockRejectedValue(error);

      const newCategory = {
        id: 'cat-1',
        name: 'Food',
      };

      await expect(CategoriesDB.createCategory(newCategory)).rejects.toThrow('Database error');
    });
  });

  describe('updateCategory', () => {
    it('updates category name', async () => {
      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.updateCategory('cat-1', { name: 'Updated Food' });

      expect(db.executeQuery).toHaveBeenCalled();
      const [query, params] = mockDb.executeQuery.mock.calls[0];
      expect(query).toContain('UPDATE categories SET');
      expect(query).toContain('name = ?');
      expect(params).toContain('Updated Food');
      expect(params[params.length - 1]).toBe('cat-1'); // ID at the end
    });

    it('updates multiple fields', async () => {
      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.updateCategory('cat-1', {
        name: 'Updated Food',
        icon: 'new-icon',
        color: '#00FF00',
      });

      const [query, params] = mockDb.executeQuery.mock.calls[0];
      expect(query).toContain('name = ?');
      expect(query).toContain('icon = ?');
      expect(query).toContain('color = ?');
      expect(params).toContain('Updated Food');
      expect(params).toContain('new-icon');
      expect(params).toContain('#00FF00');
    });

    it('handles camelCase field names (categoryType)', async () => {
      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.updateCategory('cat-1', { categoryType: 'income' });

      const [query, params] = mockDb.executeQuery.mock.calls[0];
      expect(query).toContain('category_type = ?');
      expect(params).toContain('income');
    });

    it('handles snake_case field names (category_type)', async () => {
      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.updateCategory('cat-1', { category_type: 'income' });

      const [query, params] = mockDb.executeQuery.mock.calls[0];
      expect(query).toContain('category_type = ?');
      expect(params).toContain('income');
    });

    it('updates parentId to null', async () => {
      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.updateCategory('cat-1', { parentId: null });

      const [query, params] = mockDb.executeQuery.mock.calls[0];
      expect(query).toContain('parent_id = ?');
      expect(params).toContain(null);
    });

    it('converts excludeFromForecast boolean to integer', async () => {
      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.updateCategory('cat-1', { excludeFromForecast: true });

      const [query, params] = mockDb.executeQuery.mock.calls[0];
      expect(query).toContain('exclude_from_forecast = ?');
      expect(params).toContain(1);
    });

    it('always updates updated_at timestamp', async () => {
      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.updateCategory('cat-1', { name: 'New Name' });

      const [query, params] = mockDb.executeQuery.mock.calls[0];
      expect(query).toContain('updated_at = ?');
      expect(params[params.length - 2]).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
    });

    it('does nothing when no fields provided', async () => {
      await CategoriesDB.updateCategory('cat-1', {});

      expect(db.executeQuery).not.toHaveBeenCalled();
    });

    it('throws error when database update fails', async () => {
      const error = new Error('Database error');
      mockDb.executeQuery.mockRejectedValue(error);

      await expect(
        CategoriesDB.updateCategory('cat-1', { name: 'New Name' }),
      ).rejects.toThrow('Database error');
    });
  });

  describe('deleteCategory', () => {
    it('deletes category when no children or operations exist', async () => {
      mockDb.queryFirst
        .mockResolvedValueOnce({ count: 0 }) // No child categories
        .mockResolvedValueOnce({ count: 0 }); // No operations
      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.deleteCategory('cat-1');

      expect(db.executeQuery).toHaveBeenCalledWith(
        'DELETE FROM categories WHERE id = ?',
        ['cat-1'],
      );
    });

    it('throws error when category has child categories', async () => {
      mockDb.queryFirst.mockResolvedValueOnce({ count: 3 }); // Has 3 children

      await expect(CategoriesDB.deleteCategory('cat-1')).rejects.toThrow(
        'Cannot delete category: 3 subcategory(ies) exist',
      );

      expect(db.executeQuery).not.toHaveBeenCalled();
    });

    it('throws error when category has associated operations', async () => {
      mockDb.queryFirst
        .mockResolvedValueOnce({ count: 0 }) // No children
        .mockResolvedValueOnce({ count: 5 }); // Has 5 operations

      await expect(CategoriesDB.deleteCategory('cat-1')).rejects.toThrow(
        'Cannot delete category: 5 transaction(s) use this category',
      );

      expect(db.executeQuery).not.toHaveBeenCalled();
    });

    it('checks children before checking operations', async () => {
      mockDb.queryFirst
        .mockResolvedValueOnce({ count: 2 }) // Has children
        .mockResolvedValueOnce({ count: 0 }); // Has no operations (not reached)

      await expect(CategoriesDB.deleteCategory('cat-1')).rejects.toThrow('subcategory');

      // Should only check children, not operations
      expect(db.queryFirst).toHaveBeenCalledTimes(1);
    });

    it('throws error when database delete fails', async () => {
      mockDb.queryFirst
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });
      const error = new Error('Database error');
      mockDb.executeQuery.mockRejectedValue(error);

      await expect(CategoriesDB.deleteCategory('cat-1')).rejects.toThrow('Database error');
    });
  });

  describe('hasChildCategories', () => {
    it('returns true when category has children', async () => {
      mockDb.queryFirst.mockResolvedValue({ id: 'child-1' });

      const result = await CategoriesDB.hasChildCategories('cat-1');

      expect(db.queryFirst).toHaveBeenCalledWith(
        'SELECT 1 FROM categories WHERE parent_id = ? LIMIT 1',
        ['cat-1'],
      );
      expect(result).toBe(true);
    });

    it('returns false when category has no children', async () => {
      mockDb.queryFirst.mockResolvedValue(null);

      const result = await CategoriesDB.hasChildCategories('cat-1');

      expect(result).toBe(false);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDb.queryFirst.mockRejectedValue(error);

      await expect(CategoriesDB.hasChildCategories('cat-1')).rejects.toThrow('Database error');
    });
  });

  describe('getCategoryPath', () => {
    it('returns path from root to category', async () => {
      // Setup: grandparent -> parent -> child
      mockDb.queryFirst
        .mockResolvedValueOnce({ id: 'child', name: 'Child', parent_id: 'parent' })
        .mockResolvedValueOnce({ id: 'parent', name: 'Parent', parent_id: 'grandparent' })
        .mockResolvedValueOnce({ id: 'grandparent', name: 'Grandparent', parent_id: null });

      const result = await CategoriesDB.getCategoryPath('child');

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('grandparent');
      expect(result[1].id).toBe('parent');
      expect(result[2].id).toBe('child');
    });

    it('returns single item for root category', async () => {
      mockDb.queryFirst.mockResolvedValueOnce({ id: 'root', name: 'Root', parent_id: null });

      const result = await CategoriesDB.getCategoryPath('root');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('root');
    });

    it('returns empty array when category does not exist', async () => {
      mockDb.queryFirst.mockResolvedValue(null);

      const result = await CategoriesDB.getCategoryPath('non-existent');

      expect(result).toEqual([]);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDb.queryFirst.mockRejectedValue(error);

      await expect(CategoriesDB.getCategoryPath('cat-1')).rejects.toThrow('Database error');
    });
  });

  describe('moveCategory', () => {
    it('moves category to new parent', async () => {
      // Mock getCategoryPath to return path without circular reference
      mockDb.queryFirst
        .mockResolvedValueOnce({ id: 'new-parent', parent_id: null }); // Path check

      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.moveCategory('cat-1', 'new-parent');

      expect(db.executeQuery).toHaveBeenCalled();
      const [query, params] = mockDb.executeQuery.mock.calls[0];
      expect(query).toContain('parent_id = ?');
      expect(params).toContain('new-parent');
    });

    it('moves category to root (null parent)', async () => {
      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.moveCategory('cat-1', null);

      expect(db.queryFirst).not.toHaveBeenCalled(); // No path check for null
      expect(db.executeQuery).toHaveBeenCalled();
    });

    it('throws error when creating circular reference', async () => {
      // Mock path showing that new-parent is a descendant of cat-1
      mockDb.queryFirst
        .mockResolvedValueOnce({ id: 'new-parent', parent_id: 'cat-1' })
        .mockResolvedValueOnce({ id: 'cat-1', parent_id: null });

      await expect(
        CategoriesDB.moveCategory('cat-1', 'new-parent'),
      ).rejects.toThrow('Cannot move category to its own descendant');

      expect(db.executeQuery).not.toHaveBeenCalled();
    });

    it('throws error when database update fails', async () => {
      mockDb.queryFirst.mockResolvedValue({ id: 'new-parent', parent_id: null });
      const error = new Error('Database error');
      mockDb.executeQuery.mockRejectedValue(error);

      await expect(
        CategoriesDB.moveCategory('cat-1', 'new-parent'),
      ).rejects.toThrow('Database error');
    });
  });

  describe('getAllDescendants', () => {
    it('returns all descendants recursively', async () => {
      // Setup tree: parent -> [child1, child2], child1 -> [grandchild]
      mockDb.queryAll
        .mockResolvedValueOnce([
          { id: 'child1', parent_id: 'parent' },
          { id: 'child2', parent_id: 'parent' },
        ])
        .mockResolvedValueOnce([
          { id: 'grandchild', parent_id: 'child1' },
        ])
        .mockResolvedValueOnce([]); // child2 has no children
      // .mockResolvedValueOnce([]); // grandchild has no children

      const result = await CategoriesDB.getAllDescendants('parent');

      expect(result).toHaveLength(3);
      expect(result.map(c => c.id)).toContain('child1');
      expect(result.map(c => c.id)).toContain('child2');
      expect(result.map(c => c.id)).toContain('grandchild');
    });

    it('returns empty array when category has no descendants', async () => {
      mockDb.queryAll.mockResolvedValue([]);

      const result = await CategoriesDB.getAllDescendants('cat-1');

      expect(result).toEqual([]);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDb.queryAll.mockRejectedValue(error);

      await expect(CategoriesDB.getAllDescendants('cat-1')).rejects.toThrow('Database error');
    });
  });

  describe('categoryExists', () => {
    it('returns true when category exists', async () => {
      mockDb.queryFirst.mockResolvedValue({ id: 'cat-1' });

      const result = await CategoriesDB.categoryExists('cat-1');

      expect(db.queryFirst).toHaveBeenCalledWith(
        'SELECT 1 FROM categories WHERE id = ? LIMIT 1',
        ['cat-1'],
      );
      expect(result).toBe(true);
    });

    it('returns false when category does not exist', async () => {
      mockDb.queryFirst.mockResolvedValue(null);

      const result = await CategoriesDB.categoryExists('non-existent');

      expect(result).toBe(false);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDb.queryFirst.mockRejectedValue(error);

      await expect(CategoriesDB.categoryExists('cat-1')).rejects.toThrow('Database error');
    });
  });

  describe('countCategoryUsage', () => {
    it('returns count of operations using category', async () => {
      mockDb.queryFirst.mockResolvedValue({ count: 42 });

      const result = await CategoriesDB.countCategoryUsage('cat-1');

      expect(db.queryFirst).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM operations WHERE category_id = ?',
        ['cat-1'],
      );
      expect(result).toBe(42);
    });

    it('returns 0 when no operations use category', async () => {
      mockDb.queryFirst.mockResolvedValue({ count: 0 });

      const result = await CategoriesDB.countCategoryUsage('cat-1');

      expect(result).toBe(0);
    });

    it('returns 0 when query returns null', async () => {
      mockDb.queryFirst.mockResolvedValue(null);

      const result = await CategoriesDB.countCategoryUsage('cat-1');

      expect(result).toBe(0);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDb.queryFirst.mockRejectedValue(error);

      await expect(CategoriesDB.countCategoryUsage('cat-1')).rejects.toThrow('Database error');
    });
  });

  describe('initializeDefaultCategories', () => {
    it('creates default categories with English translations', async () => {
      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.initializeDefaultCategories('en');

      // Should have created multiple categories
      expect(db.executeQuery).toHaveBeenCalled();
      expect(db.executeQuery.mock.calls.length).toBeGreaterThan(0);

      // Check that English translations were used (check first call)
      const [query, params] = mockDb.executeQuery.mock.calls[0];
      expect(query).toContain('INSERT INTO categories');
    });

    it('creates default categories with Russian translations', async () => {
      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.initializeDefaultCategories('ru');

      expect(db.executeQuery).toHaveBeenCalled();
    });

    it('uses English as fallback when language not found', async () => {
      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.initializeDefaultCategories('fr'); // Unsupported language

      expect(db.executeQuery).toHaveBeenCalled();
    });

    it('creates parent categories before children', async () => {
      mockDb.executeQuery.mockResolvedValue();

      await CategoriesDB.initializeDefaultCategories('en');

      // Verify that categories without parentId were created first
      const calls = mockDb.executeQuery.mock.calls;
      const firstCallParentId = calls[0][1][4]; // parent_id parameter
      expect(firstCallParentId).toBeNull(); // First category should be root
    });

    it('continues initialization even if individual category fails', async () => {
      // Fail on first category, succeed on others
      mockDb.executeQuery
        .mockRejectedValueOnce(new Error('Duplicate entry'))
        .mockResolvedValue();

      await CategoriesDB.initializeDefaultCategories('en');

      // Should have attempted to create multiple categories despite one failure
      expect(db.executeQuery.mock.calls.length).toBeGreaterThan(1);
    });

    it('catches individual category errors but continues', async () => {
      const error = new Error('Database error');
      mockDb.executeQuery.mockRejectedValue(error);

      // Implementation catches errors per category and continues, but logs them
      // It doesn't rethrow, so the function completes successfully
      await expect(CategoriesDB.initializeDefaultCategories('en')).resolves.not.toThrow();
    });
  });

  describe('Edge Cases and Regression Tests', () => {
    describe('Null and undefined handling', () => {
      it('handles null parentId correctly in createCategory', async () => {
        mockDb.executeQuery.mockResolvedValue();

        await CategoriesDB.createCategory({
          id: 'cat-1',
          name: 'Root',
          parentId: null,
        });

        const [query, params] = mockDb.executeQuery.mock.calls[0];
        expect(params[4]).toBeNull();
      });

      it('skips undefined values in update', async () => {
        mockDb.executeQuery.mockResolvedValue();

        await CategoriesDB.updateCategory('cat-1', {
          name: 'Updated',
          icon: undefined, // Explicitly undefined - should be skipped
        });

        const [query] = mockDb.executeQuery.mock.calls[0];
        expect(query).toContain('name = ?');
        // undefined values are skipped by the !== undefined check
        expect(query).not.toContain('icon = ?');
      });
    });

    describe('Empty string handling', () => {
      it('converts empty string to null for optional fields', async () => {
        mockDb.executeQuery.mockResolvedValue();

        await CategoriesDB.createCategory({
          id: 'cat-1',
          name: 'Test',
          icon: '',
          color: '',
        });

        const [query, params] = mockDb.executeQuery.mock.calls[0];
        // Empty strings are converted to null via the || null pattern
        expect(params[5]).toBeNull();
        expect(params[6]).toBeNull();
      });
    });

    describe('Type coercion edge cases', () => {
      it('handles numeric string for is_shadow', async () => {
        const dbCategory = {
          id: 'cat-1',
          name: 'Test',
          is_shadow: '1', // String instead of number
        };

        mockDb.queryAll.mockResolvedValue([dbCategory]);
        const result = await CategoriesDB.getAllCategories();

        // Should not be treated as true (only 1 or true should be)
        expect(result[0].isShadow).toBe(false);
      });
    });

    describe('Large dataset handling', () => {
      it('handles retrieving many categories', async () => {
        const manyCategories = Array.from({ length: 1000 }, (_, i) => ({
          id: `cat-${i}`,
          name: `Category ${i}`,
          is_shadow: 0,
        }));

        mockDb.queryAll.mockResolvedValue(manyCategories);

        const result = await CategoriesDB.getAllCategories();

        expect(result).toHaveLength(1000);
      });

      it('handles deep category hierarchy', async () => {
        // Create a chain of 10 nested categories
        const setupMocks = (depth) => {
          for (let i = depth; i >= 0; i--) {
            const parentId = i > 0 ? `cat-${i - 1}` : null;
            mockDb.queryFirst.mockResolvedValueOnce({
              id: `cat-${i}`,
              name: `Level ${i}`,
              parent_id: parentId,
            });
          }
        };

        setupMocks(10);

        const result = await CategoriesDB.getCategoryPath('cat-10');

        expect(result).toHaveLength(11); // 0 to 10 inclusive
      });
    });

    describe('Concurrent operation simulation', () => {
      it('handles multiple simultaneous reads', async () => {
        mockDb.queryAll.mockResolvedValue([{ id: 'cat-1', name: 'Test', is_shadow: 0 }]);

        const promises = Array.from({ length: 10 }, () =>
          CategoriesDB.getAllCategories(),
        );

        const results = await Promise.all(promises);

        expect(results).toHaveLength(10);
        results.forEach(result => {
          expect(result).toHaveLength(1);
        });
      });
    });

    describe('Special characters in names', () => {
      it('handles special characters in category names', async () => {
        mockDb.executeQuery.mockResolvedValue();

        await CategoriesDB.createCategory({
          id: 'cat-1',
          name: "Food & Drinks (Mom's)",
        });

        const [query, params] = mockDb.executeQuery.mock.calls[0];
        expect(params[1]).toBe("Food & Drinks (Mom's)");
      });

      it('handles unicode characters in category names', async () => {
        mockDb.executeQuery.mockResolvedValue();

        await CategoriesDB.createCategory({
          id: 'cat-1',
          name: 'Еда 🍕',
        });

        const [query, params] = mockDb.executeQuery.mock.calls[0];
        expect(params[1]).toBe('Еда 🍕');
      });
    });
  });
});
