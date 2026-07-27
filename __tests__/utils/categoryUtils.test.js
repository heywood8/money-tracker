import { getCategoryColorSlot, getCategoryDisplayName, getCategoryNames } from '../../app/utils/categoryUtils';

describe('categoryUtils', () => {
  describe('getCategoryDisplayName', () => {
    const mockT = (key) => key; // Simple mock translation function

    const mockCategories = [
      {
        id: 'cat-1',
        name: 'Food',
        nameKey: 'category_food',
        parentId: null,
      },
      {
        id: 'cat-2',
        name: 'Groceries',
        nameKey: 'category_groceries',
        parentId: 'cat-1',
      },
      {
        id: 'cat-3',
        name: 'Restaurants',
        nameKey: 'category_restaurants',
        parentId: 'cat-1',
      },
      {
        id: 'cat-4',
        name: 'Transport',
        nameKey: null,
        parentId: null,
      },
      {
        id: 'cat-5',
        name: 'Public Transport',
        nameKey: null,
        parentId: 'cat-4',
      },
    ];

    it('should return category name for root category with nameKey', async () => {
      const result = getCategoryDisplayName('cat-1', mockCategories, mockT);
      expect(result).toBe('category_food');
    });

    it('should return category name for root category without nameKey', async () => {
      const result = getCategoryDisplayName('cat-4', mockCategories, mockT);
      expect(result).toBe('Transport');
    });

    it('should return category name with parent in brackets for subcategory with nameKey', async () => {
      const result = getCategoryDisplayName('cat-2', mockCategories, mockT);
      expect(result).toBe('category_groceries (category_food)');
    });

    it('should return category name with parent in brackets for subcategory without nameKey', async () => {
      const result = getCategoryDisplayName('cat-5', mockCategories, mockT);
      expect(result).toBe('Public Transport (Transport)');
    });

    it('should handle multiple subcategories under same parent', async () => {
      const result1 = getCategoryDisplayName('cat-2', mockCategories, mockT);
      const result2 = getCategoryDisplayName('cat-3', mockCategories, mockT);

      expect(result1).toBe('category_groceries (category_food)');
      expect(result2).toBe('category_restaurants (category_food)');
    });

    it('should return empty string for null categoryId', async () => {
      const result = getCategoryDisplayName(null, mockCategories, mockT);
      expect(result).toBe('');
    });

    it('should return empty string for undefined categoryId', async () => {
      const result = getCategoryDisplayName(undefined, mockCategories, mockT);
      expect(result).toBe('');
    });

    it('should return empty string for non-existent categoryId', async () => {
      const result = getCategoryDisplayName('non-existent', mockCategories, mockT);
      expect(result).toBe('');
    });

    it('should handle category with missing parent gracefully', async () => {
      const categoriesWithMissingParent = [
        {
          id: 'cat-orphan',
          name: 'Orphan Category',
          nameKey: null,
          parentId: 'non-existent-parent',
        },
      ];

      const result = getCategoryDisplayName('cat-orphan', categoriesWithMissingParent, mockT);
      expect(result).toBe('Orphan Category');
    });

    it('should use translated names when translation function is provided', async () => {
      const mockTranslate = (key) => {
        const translations = {
          'category_food': 'Comida',
          'category_groceries': 'Compras',
        };
        return translations[key] || key;
      };

      const result = getCategoryDisplayName('cat-2', mockCategories, mockTranslate);
      expect(result).toBe('Compras (Comida)');
    });

    it('should handle empty categories array', async () => {
      const result = getCategoryDisplayName('cat-1', [], mockT);
      expect(result).toBe('');
    });

    it('should handle category with null nameKey', async () => {
      const categoriesWithNull = [
        {
          id: 'cat-null',
          name: 'Category with Null NameKey',
          nameKey: null,
          parentId: null,
        },
      ];

      const result = getCategoryDisplayName('cat-null', categoriesWithNull, mockT);
      expect(result).toBe('Category with Null NameKey');
    });

    it('should handle parent category with nameKey and child without', async () => {
      const mixedCategories = [
        {
          id: 'parent',
          name: 'Parent',
          nameKey: 'parent_key',
          parentId: null,
        },
        {
          id: 'child',
          name: 'Child Name',
          nameKey: null,
          parentId: 'parent',
        },
      ];

      const result = getCategoryDisplayName('child', mixedCategories, mockT);
      expect(result).toBe('Child Name (parent_key)');
    });
  });

  describe('getCategoryNames', () => {
    const mockT = (key) => key; // Simple mock translation function

    const mockCategories = [
      {
        id: 'cat-1',
        name: 'Food',
        nameKey: 'category_food',
        parentId: null,
      },
      {
        id: 'cat-2',
        name: 'Groceries',
        nameKey: 'category_groceries',
        parentId: 'cat-1',
      },
      {
        id: 'cat-3',
        name: 'Restaurants',
        nameKey: 'category_restaurants',
        parentId: 'cat-1',
      },
      {
        id: 'cat-4',
        name: 'Transport',
        nameKey: null,
        parentId: null,
      },
      {
        id: 'cat-5',
        name: 'Public Transport',
        nameKey: null,
        parentId: 'cat-4',
      },
    ];

    it('should return empty categoryName and null parentName for null categoryId', async () => {
      const result = getCategoryNames(null, mockCategories, mockT);
      expect(result).toEqual({
        categoryName: '',
        parentName: null,
      });
    });

    it('should return empty categoryName and null parentName for undefined categoryId', async () => {
      const result = getCategoryNames(undefined, mockCategories, mockT);
      expect(result).toEqual({
        categoryName: '',
        parentName: null,
      });
    });

    it('should return unknown_category and null parentName for non-existent categoryId', async () => {
      const result = getCategoryNames('non-existent', mockCategories, mockT);
      expect(result).toEqual({
        categoryName: 'unknown_category',
        parentName: null,
      });
    });

    it('should return category name and null parentName for root category with nameKey', async () => {
      const result = getCategoryNames('cat-1', mockCategories, mockT);
      expect(result).toEqual({
        categoryName: 'category_food',
        parentName: null,
      });
    });

    it('should return category name and null parentName for root category without nameKey', async () => {
      const result = getCategoryNames('cat-4', mockCategories, mockT);
      expect(result).toEqual({
        categoryName: 'Transport',
        parentName: null,
      });
    });

    it('should return category name and parent name for subcategory with nameKey', async () => {
      const result = getCategoryNames('cat-2', mockCategories, mockT);
      expect(result).toEqual({
        categoryName: 'category_groceries',
        parentName: 'category_food',
      });
    });

    it('should return category name and parent name for subcategory without nameKey', async () => {
      const result = getCategoryNames('cat-5', mockCategories, mockT);
      expect(result).toEqual({
        categoryName: 'Public Transport',
        parentName: 'Transport',
      });
    });

    it('should handle multiple subcategories under same parent', async () => {
      const result1 = getCategoryNames('cat-2', mockCategories, mockT);
      const result2 = getCategoryNames('cat-3', mockCategories, mockT);

      expect(result1).toEqual({
        categoryName: 'category_groceries',
        parentName: 'category_food',
      });
      expect(result2).toEqual({
        categoryName: 'category_restaurants',
        parentName: 'category_food',
      });
    });

    it('should return category name and null parentName when parent is missing', async () => {
      const categoriesWithMissingParent = [
        {
          id: 'cat-orphan',
          name: 'Orphan Category',
          nameKey: null,
          parentId: 'non-existent-parent',
        },
      ];

      const result = getCategoryNames('cat-orphan', categoriesWithMissingParent, mockT);
      expect(result).toEqual({
        categoryName: 'Orphan Category',
        parentName: null,
      });
    });

    it('should use translated names when translation function is provided', async () => {
      const mockTranslate = (key) => {
        const translations = {
          'category_food': 'Comida',
          'category_groceries': 'Compras',
        };
        return translations[key] || key;
      };

      const result = getCategoryNames('cat-2', mockCategories, mockTranslate);
      expect(result).toEqual({
        categoryName: 'Compras',
        parentName: 'Comida',
      });
    });

    it('should handle empty categories array', async () => {
      const result = getCategoryNames('cat-1', [], mockT);
      expect(result).toEqual({
        categoryName: 'unknown_category',
        parentName: null,
      });
    });

    it('should handle category with null nameKey', async () => {
      const categoriesWithNull = [
        {
          id: 'cat-null',
          name: 'Category with Null NameKey',
          nameKey: null,
          parentId: null,
        },
      ];

      const result = getCategoryNames('cat-null', categoriesWithNull, mockT);
      expect(result).toEqual({
        categoryName: 'Category with Null NameKey',
        parentName: null,
      });
    });

    it('should handle parent category with nameKey and child without', async () => {
      const mixedCategories = [
        {
          id: 'parent',
          name: 'Parent',
          nameKey: 'parent_key',
          parentId: null,
        },
        {
          id: 'child',
          name: 'Child Name',
          nameKey: null,
          parentId: 'parent',
        },
      ];

      const result = getCategoryNames('child', mixedCategories, mockT);
      expect(result).toEqual({
        categoryName: 'Child Name',
        parentName: 'parent_key',
      });
    });

    it('should handle parent category without nameKey and child with nameKey', async () => {
      const mixedCategories = [
        {
          id: 'parent',
          name: 'Parent Name',
          nameKey: null,
          parentId: null,
        },
        {
          id: 'child',
          name: 'Child',
          nameKey: 'child_key',
          parentId: 'parent',
        },
      ];

      const result = getCategoryNames('child', mixedCategories, mockT);
      expect(result).toEqual({
        categoryName: 'child_key',
        parentName: 'Parent Name',
      });
    });
  });

  describe('getCategoryColorSlot', () => {
    const root = (id, createdAt, extra = {}) => ({
      id,
      name: id,
      parentId: null,
      categoryType: 'expense',
      createdAt,
      ...extra,
    });

    const roots = [
      root('food', '2024-01-01'),
      root('transport', '2024-02-01'),
      root('fun', '2024-03-01'),
    ];

    it('numbers siblings by creation order', () => {
      expect(getCategoryColorSlot(roots[0], roots)).toBe(0);
      expect(getCategoryColorSlot(roots[1], roots)).toBe(1);
      expect(getCategoryColorSlot(roots[2], roots)).toBe(2);
    });

    it('does not depend on the order the array happens to be in', () => {
      const shuffled = [roots[2], roots[0], roots[1]];
      expect(getCategoryColorSlot(roots[1], shuffled)).toBe(1);
    });

    it('keeps a category on its slot when a sibling drops out of the chart', () => {
      // The old index-based colouring repainted every category whenever the set
      // of categories with activity changed (i.e. every month).
      const before = getCategoryColorSlot(roots[2], roots);
      const stillListed = [roots[0], roots[1], roots[2]];
      expect(getCategoryColorSlot(roots[2], stillListed)).toBe(before);
    });

    it('numbers each level separately, so a drill-down starts from slot 0', () => {
      const children = [
        { id: 'cafe', parentId: 'food', categoryType: 'expense', createdAt: '2024-04-01' },
        { id: 'grocery', parentId: 'food', categoryType: 'expense', createdAt: '2024-05-01' },
      ];
      const all = [...roots, ...children];
      expect(getCategoryColorSlot(children[0], all)).toBe(0);
      expect(getCategoryColorSlot(children[1], all)).toBe(1);
    });

    it('keeps expense and income ladders independent', () => {
      const income = [
        { id: 'salary', parentId: null, categoryType: 'income', createdAt: '2024-06-01' },
      ];
      expect(getCategoryColorSlot(income[0], [...roots, ...income])).toBe(0);
    });

    it('skips shadow categories when numbering', () => {
      const withShadow = [
        { id: 'shadow', parentId: null, categoryType: 'expense', createdAt: '2023-01-01', isShadow: 1 },
        ...roots,
      ];
      expect(getCategoryColorSlot(roots[0], withShadow)).toBe(0);
    });

    it('breaks ties on id when createdAt matches', () => {
      const sameDay = [
        root('b', '2024-01-01'),
        root('a', '2024-01-01'),
      ];
      expect(getCategoryColorSlot(sameDay[1], sameDay)).toBe(0);
      expect(getCategoryColorSlot(sameDay[0], sameDay)).toBe(1);
    });

    it('falls back to slot 0 for an unknown or missing category', () => {
      expect(getCategoryColorSlot(null, roots)).toBe(0);
      expect(getCategoryColorSlot(root('ghost', '2024-01-01'), [])).toBe(0);
    });
  });
});
