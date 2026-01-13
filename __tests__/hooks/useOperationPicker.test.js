import { renderHook, act } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import useOperationPicker from '../../app/hooks/useOperationPicker';

// Mock Keyboard
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return Object.defineProperty(RN, 'Keyboard', {
    value: {
      dismiss: jest.fn(),
      addListener: jest.fn(() => ({ remove: jest.fn() })),
      removeListener: jest.fn(),
      removeAllListeners: jest.fn(),
    },
    writable: false,
  });
});

describe('useOperationPicker', () => {
  const mockT = (key) => key;

  const mockCategories = [
    { id: 'cat-1', name: 'Food', nameKey: 'food', parentId: null, type: 'folder' },
    { id: 'cat-2', name: 'Groceries', parentId: 'cat-1', type: 'entry' },
    { id: 'cat-3', name: 'Dining', parentId: 'cat-1', type: 'entry' },
    { id: 'cat-4', name: 'Transport', nameKey: 'transport', parentId: null, type: 'folder' },
    { id: 'cat-5', name: 'Public', parentId: 'cat-4', type: 'entry' },
    { id: 'cat-6', name: 'Income', parentId: null, type: 'entry' },
  ];

  const mockAccounts = [
    { id: 'acc-1', name: 'Checking', currency: 'USD' },
    { id: 'acc-2', name: 'Savings', currency: 'EUR' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useOperationPicker(mockT));

      expect(result.current.pickerState).toEqual({
        visible: false,
        type: null,
        data: [],
        allCategories: [],
      });
      expect(result.current.categoryNavigation).toEqual({
        currentFolderId: null,
        breadcrumb: [],
      });
    });
  });

  describe('openPicker', () => {
    it('should open picker for non-category type', () => {
      const { result } = renderHook(() => useOperationPicker(mockT));

      act(() => {
        result.current.openPicker('account', mockAccounts);
      });

      expect(Keyboard.dismiss).toHaveBeenCalled();
      expect(result.current.pickerState).toEqual({
        visible: true,
        type: 'account',
        data: mockAccounts,
        allCategories: [],
      });
    });

    it('should open picker for categories with root items only', () => {
      const { result } = renderHook(() => useOperationPicker(mockT));

      act(() => {
        result.current.openPicker('category', mockCategories);
      });

      expect(Keyboard.dismiss).toHaveBeenCalled();
      expect(result.current.pickerState.visible).toBe(true);
      expect(result.current.pickerState.type).toBe('category');
      expect(result.current.pickerState.allCategories).toEqual(mockCategories);

      // Should only show root items (no parentId)
      expect(result.current.pickerState.data).toHaveLength(3);
      expect(result.current.pickerState.data).toContainEqual(mockCategories[0]); // Food
      expect(result.current.pickerState.data).toContainEqual(mockCategories[3]); // Transport
      expect(result.current.pickerState.data).toContainEqual(mockCategories[5]); // Income
    });

    it('should reset category navigation on open', () => {
      const { result } = renderHook(() => useOperationPicker(mockT));

      // First navigate into a folder
      act(() => {
        result.current.openPicker('category', mockCategories);
      });

      act(() => {
        result.current.navigateIntoFolder(mockCategories[0]); // Food folder
      });

      expect(result.current.categoryNavigation.currentFolderId).toBe('cat-1');

      // Open picker again
      act(() => {
        result.current.openPicker('category', mockCategories);
      });

      // Navigation should be reset
      expect(result.current.categoryNavigation).toEqual({
        currentFolderId: null,
        breadcrumb: [],
      });
    });
  });

  describe('closePicker', () => {
    it('should close picker and reset state', () => {
      const { result } = renderHook(() => useOperationPicker(mockT));

      act(() => {
        result.current.openPicker('account', mockAccounts);
      });

      expect(result.current.pickerState.visible).toBe(true);

      act(() => {
        result.current.closePicker();
      });

      expect(result.current.pickerState).toEqual({
        visible: false,
        type: null,
        data: [],
        allCategories: [],
      });
      expect(result.current.categoryNavigation).toEqual({
        currentFolderId: null,
        breadcrumb: [],
      });
    });
  });

  describe('navigateIntoFolder', () => {
    it('should navigate into folder and show children', () => {
      const { result } = renderHook(() => useOperationPicker(mockT));

      act(() => {
        result.current.openPicker('category', mockCategories);
      });

      act(() => {
        result.current.navigateIntoFolder(mockCategories[0]); // Food folder
      });

      expect(result.current.categoryNavigation.currentFolderId).toBe('cat-1');
      expect(result.current.categoryNavigation.breadcrumb).toEqual([
        { id: 'cat-1', name: 'food' }, // nameKey is translated
      ]);

      // Should show children of Food folder
      expect(result.current.pickerState.data).toHaveLength(2);
      expect(result.current.pickerState.data).toContainEqual(mockCategories[1]); // Groceries
      expect(result.current.pickerState.data).toContainEqual(mockCategories[2]); // Dining
    });

    it('should use name if nameKey is not present', () => {
      const categoriesWithoutKeys = [
        { id: 'cat-1', name: 'Food', parentId: null, type: 'folder' },
        { id: 'cat-2', name: 'Groceries', parentId: 'cat-1', type: 'entry' },
      ];

      const { result } = renderHook(() => useOperationPicker(mockT));

      act(() => {
        result.current.openPicker('category', categoriesWithoutKeys);
      });

      act(() => {
        result.current.navigateIntoFolder(categoriesWithoutKeys[0]);
      });

      expect(result.current.categoryNavigation.breadcrumb).toEqual([
        { id: 'cat-1', name: 'Food' },
      ]);
    });

    it('should build breadcrumb trail for nested navigation', () => {
      const deepCategories = [
        ...mockCategories,
        { id: 'cat-7', name: 'Subfolder', parentId: 'cat-1', type: 'folder' },
        { id: 'cat-8', name: 'Subentry', parentId: 'cat-7', type: 'entry' },
      ];

      const { result } = renderHook(() => useOperationPicker(mockT));

      act(() => {
        result.current.openPicker('category', deepCategories);
      });

      // Navigate into Food
      act(() => {
        result.current.navigateIntoFolder(deepCategories[0]);
      });

      // Navigate into Subfolder
      const subfolder = deepCategories.find(c => c.id === 'cat-7');
      act(() => {
        result.current.navigateIntoFolder(subfolder);
      });

      expect(result.current.categoryNavigation.breadcrumb).toHaveLength(2);
      expect(result.current.categoryNavigation.breadcrumb[0].id).toBe('cat-1');
      expect(result.current.categoryNavigation.breadcrumb[1].id).toBe('cat-7');
    });
  });

  describe('navigateBack', () => {
    it('should navigate back to parent folder', () => {
      const { result } = renderHook(() => useOperationPicker(mockT));

      act(() => {
        result.current.openPicker('category', mockCategories);
      });

      // Navigate into Food folder
      act(() => {
        result.current.navigateIntoFolder(mockCategories[0]);
      });

      expect(result.current.categoryNavigation.currentFolderId).toBe('cat-1');

      // Navigate back
      act(() => {
        result.current.navigateBack();
      });

      expect(result.current.categoryNavigation.currentFolderId).toBeNull();
      expect(result.current.categoryNavigation.breadcrumb).toEqual([]);

      // Should show root items again
      expect(result.current.pickerState.data).toHaveLength(3);
    });

    it('should navigate back through multiple levels', () => {
      const deepCategories = [
        ...mockCategories,
        { id: 'cat-7', name: 'Subfolder', parentId: 'cat-1', type: 'folder' },
        { id: 'cat-8', name: 'Subentry', parentId: 'cat-7', type: 'entry' },
      ];

      const { result } = renderHook(() => useOperationPicker(mockT));

      act(() => {
        result.current.openPicker('category', deepCategories);
      });

      // Navigate into Food
      act(() => {
        result.current.navigateIntoFolder(deepCategories[0]);
      });

      // Navigate into Subfolder
      const subfolder = deepCategories.find(c => c.id === 'cat-7');
      act(() => {
        result.current.navigateIntoFolder(subfolder);
      });

      expect(result.current.categoryNavigation.currentFolderId).toBe('cat-7');

      // Navigate back to Food
      act(() => {
        result.current.navigateBack();
      });

      expect(result.current.categoryNavigation.currentFolderId).toBe('cat-1');
      expect(result.current.categoryNavigation.breadcrumb).toHaveLength(1);

      // Navigate back to root
      act(() => {
        result.current.navigateBack();
      });

      expect(result.current.categoryNavigation.currentFolderId).toBeNull();
      expect(result.current.categoryNavigation.breadcrumb).toHaveLength(0);
    });

    it('should handle navigateBack from root gracefully', () => {
      const { result } = renderHook(() => useOperationPicker(mockT));

      act(() => {
        result.current.openPicker('category', mockCategories);
      });

      // Already at root, navigateBack should not crash
      act(() => {
        result.current.navigateBack();
      });

      expect(result.current.categoryNavigation.currentFolderId).toBeNull();
      expect(result.current.categoryNavigation.breadcrumb).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty category list', () => {
      const { result } = renderHook(() => useOperationPicker(mockT));

      act(() => {
        result.current.openPicker('category', []);
      });

      expect(result.current.pickerState.data).toEqual([]);
      expect(result.current.pickerState.allCategories).toEqual([]);
    });

    it('should handle navigating into folder with no children', () => {
      const categoriesWithEmptyFolder = [
        { id: 'cat-1', name: 'Empty Folder', parentId: null, type: 'folder' },
      ];

      const { result } = renderHook(() => useOperationPicker(mockT));

      act(() => {
        result.current.openPicker('category', categoriesWithEmptyFolder);
      });

      act(() => {
        result.current.navigateIntoFolder(categoriesWithEmptyFolder[0]);
      });

      expect(result.current.pickerState.data).toEqual([]);
      expect(result.current.categoryNavigation.currentFolderId).toBe('cat-1');
    });

    it('should handle category without nameKey', () => {
      const categories = [
        { id: 'cat-1', name: 'Custom Category', parentId: null, type: 'folder' },
        { id: 'cat-2', name: 'Child', parentId: 'cat-1', type: 'entry' },
      ];

      const { result } = renderHook(() => useOperationPicker(mockT));

      act(() => {
        result.current.openPicker('category', categories);
      });

      act(() => {
        result.current.navigateIntoFolder(categories[0]);
      });

      expect(result.current.categoryNavigation.breadcrumb[0].name).toBe('Custom Category');
    });
  });

  describe('Regression Tests', () => {
    it('should maintain allCategories throughout navigation', () => {
      const { result } = renderHook(() => useOperationPicker(mockT));

      act(() => {
        result.current.openPicker('category', mockCategories);
      });

      const allCategoriesBefore = result.current.pickerState.allCategories;

      // Navigate into folder
      act(() => {
        result.current.navigateIntoFolder(mockCategories[0]);
      });

      const allCategoriesAfter = result.current.pickerState.allCategories;

      // Should maintain reference to all categories
      expect(allCategoriesAfter).toEqual(allCategoriesBefore);
    });

    it('should filter by parentId correctly', () => {
      const { result } = renderHook(() => useOperationPicker(mockT));

      act(() => {
        result.current.openPicker('category', mockCategories);
      });

      act(() => {
        result.current.navigateIntoFolder(mockCategories[0]); // Food
      });

      // Should only show items with parentId === 'cat-1'
      const data = result.current.pickerState.data;
      data.forEach(item => {
        expect(item.parentId).toBe('cat-1');
      });
    });
  });
});
