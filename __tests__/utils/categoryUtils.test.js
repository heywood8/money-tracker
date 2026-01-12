import { getCategoryDisplayName, getCategoryNames } from '../../app/utils/categoryUtils';

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

    it('should return category name for root category with nameKey', () => {
      const result = getCategoryDisplayName('cat-1', mockCategories, mockT);
      expect(result).toBe('category_food');
    });

    it('should return category name for root category without nameKey', () => {
      const result = getCategoryDisplayName('cat-4', mockCategories, mockT);
      expect(result).toBe('Transport');
    });

    it('should return category name with parent in brackets for subcategory with nameKey', () => {
      const result = getCategoryDisplayName('cat-2', mockCategories, mockT);
      expect(result).toBe('category_groceries (category_food)');
    });

    it('should return category name with parent in brackets for subcategory without nameKey', () => {
      const result = getCategoryDisplayName('cat-5', mockCategories, mockT);
      expect(result).toBe('Public Transport (Transport)');
    });

    it('should handle multiple subcategories under same parent', () => {
      const result1 = getCategoryDisplayName('cat-2', mockCategories, mockT);
      const result2 = getCategoryDisplayName('cat-3', mockCategories, mockT);

      expect(result1).toBe('category_groceries (category_food)');
      expect(result2).toBe('category_restaurants (category_food)');
    });

    it('should return empty string for null categoryId', () => {
      const result = getCategoryDisplayName(null, mockCategories, mockT);
      expect(result).toBe('');
    });

    it('should return empty string for undefined categoryId', () => {
      const result = getCategoryDisplayName(undefined, mockCategories, mockT);
      expect(result).toBe('');
    });

    it('should return empty string for non-existent categoryId', () => {
      const result = getCategoryDisplayName('non-existent', mockCategories, mockT);
      expect(result).toBe('');
    });

    it('should handle category with missing parent gracefully', () => {
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

    it('should use translated names when translation function is provided', () => {
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

    it('should handle empty categories array', () => {
      const result = getCategoryDisplayName('cat-1', [], mockT);
      expect(result).toBe('');
    });

    it('should handle category with null nameKey', () => {
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

    it('should handle parent category with nameKey and child without', () => {
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

    it('should return empty categoryName and null parentName for null categoryId', () => {
      const result = getCategoryNames(null, mockCategories, mockT);
      expect(result).toEqual({
        categoryName: '',
        parentName: null,
      });
    });

    it('should return empty categoryName and null parentName for undefined categoryId', () => {
      const result = getCategoryNames(undefined, mockCategories, mockT);
      expect(result).toEqual({
        categoryName: '',
        parentName: null,
      });
    });

    it('should return unknown_category and null parentName for non-existent categoryId', () => {
      const result = getCategoryNames('non-existent', mockCategories, mockT);
      expect(result).toEqual({
        categoryName: 'unknown_category',
        parentName: null,
      });
    });

    it('should return category name and null parentName for root category with nameKey', () => {
      const result = getCategoryNames('cat-1', mockCategories, mockT);
      expect(result).toEqual({
        categoryName: 'category_food',
        parentName: null,
      });
    });

    it('should return category name and null parentName for root category without nameKey', () => {
      const result = getCategoryNames('cat-4', mockCategories, mockT);
      expect(result).toEqual({
        categoryName: 'Transport',
        parentName: null,
      });
    });

    it('should return category name and parent name for subcategory with nameKey', () => {
      const result = getCategoryNames('cat-2', mockCategories, mockT);
      expect(result).toEqual({
        categoryName: 'category_groceries',
        parentName: 'category_food',
      });
    });

    it('should return category name and parent name for subcategory without nameKey', () => {
      const result = getCategoryNames('cat-5', mockCategories, mockT);
      expect(result).toEqual({
        categoryName: 'Public Transport',
        parentName: 'Transport',
      });
    });

    it('should handle multiple subcategories under same parent', () => {
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

    it('should return category name and null parentName when parent is missing', () => {
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

    it('should use translated names when translation function is provided', () => {
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

    it('should handle empty categories array', () => {
      const result = getCategoryNames('cat-1', [], mockT);
      expect(result).toEqual({
        categoryName: 'unknown_category',
        parentName: null,
      });
    });

    it('should handle category with null nameKey', () => {
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

    it('should handle parent category with nameKey and child without', () => {
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

    it('should handle parent category without nameKey and child with nameKey', () => {
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
});
