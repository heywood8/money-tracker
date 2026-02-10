import { renderHook, act, waitFor } from '@testing-library/react-native';
import useQuickAddForm from '../../app/hooks/useQuickAddForm';
import * as LastAccount from '../../app/services/LastAccount';
import * as Currency from '../../app/services/currency';

// Mock OperationsDB
const mockGetTopCategories = jest.fn().mockResolvedValue([]);
const mockGetTopTransferTargets = jest.fn().mockResolvedValue([]);
jest.mock('../../app/services/OperationsDB', () => ({
  getTopCategoriesFromLastMonth: (...args) => mockGetTopCategories(...args),
  getTopTransferTargetAccounts: (...args) => mockGetTopTransferTargets(...args),
}));

// Mock dependencies
jest.mock('../../app/services/LastAccount', () => ({
  getLastAccessedAccount: jest.fn(),
}));

jest.mock('../../app/services/currency', () => ({
  formatAmount: jest.fn((amount) => String(amount)),
}));

jest.mock('../../assets/currencies.json', () => ({
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
}));

// Mock category utils
jest.mock('../../app/utils/categoryUtils', () => ({
  getCategoryDisplayName: jest.fn((categoryId, categories, t) => {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : null;
  }),
  getCategoryNames: jest.fn((categoryId, categories, t) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return { categoryName: t('unknown_category'), parentName: null };
    return { categoryName: category.name, parentName: null };
  }),
}));

describe('useQuickAddForm', () => {
  const mockT = (key) => key;

  const mockAccounts = [
    { id: 'acc-1', name: 'Checking', currency: 'USD', balance: '1000' },
    { id: 'acc-2', name: 'Savings', currency: 'EUR', balance: '500' },
    { id: 'acc-3', name: 'Cash', currency: 'USD', balance: '200' },
  ];

  const mockCategories = [
    { id: 'cat-1', name: 'Food', categoryType: 'expense', isShadow: false },
    { id: 'cat-2', name: 'Salary', categoryType: 'income', isShadow: false },
    { id: 'cat-3', name: 'Transport', categoryType: 'expense', isShadow: false },
    { id: 'cat-4', name: 'Shadow Cat', categoryType: 'expense', isShadow: true },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    Currency.formatAmount.mockImplementation((amount) => String(amount));
  });

  describe('Initialization', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      expect(result.current.quickAddValues).toMatchObject({
        type: 'expense',
        amount: '',
        categoryId: '',
        description: '',
        toAccountId: '',
        exchangeRate: '',
        destinationAmount: '',
      });
    });

    it('should set default account if only one account exists', async () => {
      const singleAccount = [mockAccounts[0]];

      const { result } = renderHook(() =>
        useQuickAddForm(singleAccount, singleAccount, mockCategories, mockT),
      );

      await waitFor(() => {
        expect(result.current.quickAddValues.accountId).toBe('acc-1');
      });
    });

    it('should use last accessed account if available', async () => {
      LastAccount.getLastAccessedAccount.mockResolvedValue('acc-2');

      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      await waitFor(() => {
        expect(result.current.quickAddValues.accountId).toBe('acc-2');
      });
    });

    it('should use first account alphabetically if no last accessed', async () => {
      LastAccount.getLastAccessedAccount.mockResolvedValue(null);

      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      await waitFor(() => {
        expect(result.current.quickAddValues.accountId).toBe('acc-1');
      });
    });

    it('should fallback to first account if last accessed not in visible accounts', async () => {
      LastAccount.getLastAccessedAccount.mockResolvedValue('non-existent');

      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      await waitFor(() => {
        expect(result.current.quickAddValues.accountId).toBe('acc-1');
      });
    });
  });

  describe('getAccountName', () => {
    it('should return account name for valid account ID', () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      const name = result.current.getAccountName('acc-1');
      expect(name).toBe('Checking');
    });

    it('should return "Unknown" for invalid account ID', () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      const name = result.current.getAccountName('non-existent');
      expect(name).toBe('Unknown');
    });
  });

  describe('getAccountBalance', () => {
    it('should return formatted balance with currency symbol', () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      const balance = result.current.getAccountBalance('acc-1');
      expect(balance).toBe('$1000');
    });

    it('should return empty string for invalid account ID', () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      const balance = result.current.getAccountBalance('non-existent');
      expect(balance).toBe('');
    });

    it('should use EUR symbol for EUR account', () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      const balance = result.current.getAccountBalance('acc-2');
      expect(balance).toBe('€500');
    });
  });

  describe('getCategoryInfo', () => {
    it('should return category name and icon for valid category', () => {
      const categoriesWithIcon = [
        { id: 'cat-1', name: 'Food', icon: 'food-icon', categoryType: 'expense', isShadow: false },
      ];

      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, categoriesWithIcon, mockT),
      );

      const info = result.current.getCategoryInfo('cat-1');
      expect(info).toEqual({
        name: 'Food',
        icon: 'food-icon',
        parentName: null,
      });
    });

    it('should return unknown category for invalid category ID', () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      const info = result.current.getCategoryInfo('non-existent');
      expect(info).toEqual({
        name: 'unknown_category',
        icon: 'help-circle',
        parentName: null,
      });
    });

    it('should use default icon if category has no icon', () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      const info = result.current.getCategoryInfo('cat-1');
      expect(info.icon).toBe('help-circle');
    });
  });

  describe('getCategoryName', () => {
    it('should return category display name for valid category', () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      const name = result.current.getCategoryName('cat-1');
      expect(name).toBe('Food');
    });

    it('should return "select_category" for empty category ID', () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      const name = result.current.getCategoryName('');
      expect(name).toBe('select_category');
    });

    it('should return "select_category" for null category ID', () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      const name = result.current.getCategoryName(null);
      expect(name).toBe('select_category');
    });
  });

  describe('filteredCategories', () => {
    it('should filter categories by expense type', () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      const filtered = result.current.filteredCategories;
      expect(filtered).toHaveLength(2);
      expect(filtered).toContainEqual(mockCategories[0]); // Food
      expect(filtered).toContainEqual(mockCategories[2]); // Transport
    });

    it('should filter categories by income type', async () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      await act(async () => {
        result.current.setQuickAddValues(prev => ({ ...prev, type: 'income' }));
      });

      const filtered = result.current.filteredCategories;
      expect(filtered).toHaveLength(1);
      expect(filtered).toContainEqual(mockCategories[1]); // Salary
    });

    it('should exclude shadow categories from filtered list', () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      const filtered = result.current.filteredCategories;
      const shadowCat = filtered.find(cat => cat.isShadow);
      expect(shadowCat).toBeUndefined();
    });

    it('should return empty array for transfer type', async () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      await act(async () => {
        result.current.setQuickAddValues(prev => ({ ...prev, type: 'transfer' }));
      });

      const filtered = result.current.filteredCategories;
      expect(filtered).toHaveLength(0);
    });
  });

  describe('topCategoriesForType', () => {
    const categoriesWithLeaves = [
      { id: 'cat-e1', name: 'Food', categoryType: 'expense', isShadow: false, isFolder: false },
      { id: 'cat-e2', name: 'Transport', categoryType: 'expense', isShadow: false, isFolder: false },
      { id: 'cat-e3', name: 'Entertainment', categoryType: 'expense', isShadow: false, isFolder: false },
      { id: 'cat-e4', name: 'Shopping', categoryType: 'expense', isShadow: false, isFolder: false },
      { id: 'cat-i1', name: 'Salary', categoryType: 'income', isShadow: false, isFolder: false },
      { id: 'cat-i2', name: 'Freelance', categoryType: 'income', isShadow: false, isFolder: false },
      { id: 'cat-i3', name: 'Dividends', categoryType: 'income', isShadow: false, isFolder: false },
      { id: 'cat-i4', name: 'Gifts', categoryType: 'income', isShadow: false, isFolder: false },
      { id: 'cat-shadow', name: 'Shadow', categoryType: 'income', isShadow: true, isFolder: false },
      { id: 'cat-folder', name: 'Folder', categoryType: 'income', isShadow: false, isFolder: true },
    ];

    it('should use history-based categories when available', async () => {
      mockGetTopCategories.mockResolvedValue([
        { categoryId: 'cat-e2', count: 10 },
        { categoryId: 'cat-e4', count: 5 },
      ]);

      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, categoriesWithLeaves, mockT),
      );

      await waitFor(() => {
        expect(result.current.topCategoriesForType).toHaveLength(2);
        expect(result.current.topCategoriesForType[0].id).toBe('cat-e2');
        expect(result.current.topCategoriesForType[1].id).toBe('cat-e4');
      });
    });

    it('should fall back to first 3 leaf categories when no history for expense', async () => {
      mockGetTopCategories.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, categoriesWithLeaves, mockT),
      );

      await waitFor(() => {
        expect(result.current.topCategoriesForType).toHaveLength(3);
        expect(result.current.topCategoriesForType[0].id).toBe('cat-e1');
        expect(result.current.topCategoriesForType[1].id).toBe('cat-e2');
        expect(result.current.topCategoriesForType[2].id).toBe('cat-e3');
      });
    });

    it('should fall back to first 3 leaf categories when no history for income', async () => {
      mockGetTopCategories.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, categoriesWithLeaves, mockT),
      );

      await act(async () => {
        result.current.setQuickAddValues(prev => ({ ...prev, type: 'income' }));
      });

      expect(result.current.topCategoriesForType).toHaveLength(3);
      expect(result.current.topCategoriesForType[0].id).toBe('cat-i1');
      expect(result.current.topCategoriesForType[1].id).toBe('cat-i2');
      expect(result.current.topCategoriesForType[2].id).toBe('cat-i3');
    });

    it('should exclude shadow and folder categories from fallback', async () => {
      mockGetTopCategories.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, categoriesWithLeaves, mockT),
      );

      await act(async () => {
        result.current.setQuickAddValues(prev => ({ ...prev, type: 'income' }));
      });

      const ids = result.current.topCategoriesForType.map(c => c.id);
      expect(ids).not.toContain('cat-shadow');
      expect(ids).not.toContain('cat-folder');
    });

    it('should return empty array for transfer type even with fallback categories available', async () => {
      mockGetTopCategories.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, categoriesWithLeaves, mockT),
      );

      await act(async () => {
        result.current.setQuickAddValues(prev => ({ ...prev, type: 'transfer' }));
      });

      expect(result.current.topCategoriesForType).toEqual([]);
    });

    it('should prefer history over fallback when history has entries for current type', async () => {
      // History has income categories but not expense
      mockGetTopCategories.mockResolvedValue([
        { categoryId: 'cat-i3', count: 8 },
        { categoryId: 'cat-i1', count: 3 },
      ]);

      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, categoriesWithLeaves, mockT),
      );

      // Expense should use fallback (no expense history)
      await waitFor(() => {
        expect(result.current.topCategoriesForType[0].id).toBe('cat-e1');
      });

      // Switch to income — should use history
      await act(async () => {
        result.current.setQuickAddValues(prev => ({ ...prev, type: 'income' }));
      });

      expect(result.current.topCategoriesForType).toHaveLength(2);
      expect(result.current.topCategoriesForType[0].id).toBe('cat-i3');
      expect(result.current.topCategoriesForType[1].id).toBe('cat-i1');
    });
  });

  describe('resetForm', () => {
    it('should reset form values but keep type and account', async () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      // Wait for default account to be set
      await waitFor(() => {
        expect(result.current.quickAddValues.accountId).toBeTruthy();
      });

      const initialAccountId = result.current.quickAddValues.accountId;

      // Set some values
      await act(async () => {
        result.current.setQuickAddValues({
          type: 'income',
          amount: '100',
          accountId: 'acc-2',
          categoryId: 'cat-2',
          description: 'Test',
          toAccountId: 'acc-3',
          exchangeRate: '1.2',
          destinationAmount: '120',
        });
      });

      // Reset form
      await act(async () => {
        result.current.resetForm();
      });

      expect(result.current.quickAddValues).toMatchObject({
        type: 'income',
        amount: '',
        accountId: 'acc-2',
        categoryId: '',
        description: '',
        toAccountId: '',
        exchangeRate: '',
        destinationAmount: '',
      });
    });
  });

  describe('setQuickAddValues', () => {
    it('should update quick add values', async () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      await act(async () => {
        result.current.setQuickAddValues(prev => ({
          ...prev,
          amount: '50',
          categoryId: 'cat-1',
        }));
      });

      expect(result.current.quickAddValues.amount).toBe('50');
      expect(result.current.quickAddValues.categoryId).toBe('cat-1');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty accounts array', () => {
      const { result } = renderHook(() =>
        useQuickAddForm([], [], mockCategories, mockT),
      );

      expect(result.current.quickAddValues.accountId).toBe('');
    });

    it('should handle empty categories array', () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, [], mockT),
      );

      expect(result.current.filteredCategories).toEqual([]);
    });

    it('should handle account with unknown currency', () => {
      const accountsWithUnknown = [
        { id: 'acc-1', name: 'Unknown', currency: 'XYZ', balance: '100' },
      ];

      const { result } = renderHook(() =>
        useQuickAddForm(accountsWithUnknown, accountsWithUnknown, mockCategories, mockT),
      );

      const balance = result.current.getAccountBalance('acc-1');
      // Should use currency code if symbol not found
      expect(balance).toContain('100');
    });
  });

  describe('topTransferAccountsForForm', () => {
    it('should return empty array when type is not transfer', () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      // Default type is expense
      expect(result.current.topTransferAccountsForForm).toEqual([]);
    });

    it('should use history-based accounts when available', async () => {
      mockGetTopTransferTargets.mockResolvedValue([
        { accountId: 'acc-2', count: 5 },
        { accountId: 'acc-3', count: 3 },
      ]);

      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      // Wait for async load
      await waitFor(() => {
        expect(mockGetTopTransferTargets).toHaveBeenCalled();
      });

      await act(async () => {
        result.current.setQuickAddValues(prev => ({ ...prev, type: 'transfer', accountId: 'acc-1' }));
      });

      expect(result.current.topTransferAccountsForForm).toHaveLength(2);
      expect(result.current.topTransferAccountsForForm[0].id).toBe('acc-2');
      expect(result.current.topTransferAccountsForForm[1].id).toBe('acc-3');
    });

    it('should exclude current source account from results', async () => {
      mockGetTopTransferTargets.mockResolvedValue([
        { accountId: 'acc-1', count: 10 },
        { accountId: 'acc-2', count: 5 },
        { accountId: 'acc-3', count: 3 },
      ]);

      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      await waitFor(() => {
        expect(mockGetTopTransferTargets).toHaveBeenCalled();
      });

      await act(async () => {
        result.current.setQuickAddValues(prev => ({ ...prev, type: 'transfer', accountId: 'acc-1' }));
      });

      const ids = result.current.topTransferAccountsForForm.map(a => a.id);
      expect(ids).not.toContain('acc-1');
      expect(ids).toContain('acc-2');
      expect(ids).toContain('acc-3');
    });

    it('should fall back to visible accounts when no history', async () => {
      mockGetTopTransferTargets.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      await act(async () => {
        result.current.setQuickAddValues(prev => ({ ...prev, type: 'transfer', accountId: 'acc-1' }));
      });

      // Should get first 3 accounts minus source
      expect(result.current.topTransferAccountsForForm.length).toBeGreaterThan(0);
      const ids = result.current.topTransferAccountsForForm.map(a => a.id);
      expect(ids).not.toContain('acc-1');
    });

    it('should filter out accounts that no longer exist', async () => {
      mockGetTopTransferTargets.mockResolvedValue([
        { accountId: 'deleted-acc', count: 10 },
        { accountId: 'acc-2', count: 5 },
      ]);

      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      await waitFor(() => {
        expect(mockGetTopTransferTargets).toHaveBeenCalled();
      });

      await act(async () => {
        result.current.setQuickAddValues(prev => ({ ...prev, type: 'transfer', accountId: 'acc-1' }));
      });

      const ids = result.current.topTransferAccountsForForm.map(a => a.id);
      expect(ids).not.toContain('deleted-acc');
      expect(ids).toContain('acc-2');
    });

    it('should limit to 3 accounts', async () => {
      const manyAccounts = [
        { id: 'acc-1', name: 'A1', currency: 'USD', balance: '100' },
        { id: 'acc-2', name: 'A2', currency: 'USD', balance: '200' },
        { id: 'acc-3', name: 'A3', currency: 'USD', balance: '300' },
        { id: 'acc-4', name: 'A4', currency: 'USD', balance: '400' },
        { id: 'acc-5', name: 'A5', currency: 'USD', balance: '500' },
      ];

      mockGetTopTransferTargets.mockResolvedValue([
        { accountId: 'acc-2', count: 10 },
        { accountId: 'acc-3', count: 8 },
        { accountId: 'acc-4', count: 5 },
        { accountId: 'acc-5', count: 3 },
      ]);

      const { result } = renderHook(() =>
        useQuickAddForm(manyAccounts, manyAccounts, mockCategories, mockT),
      );

      await waitFor(() => {
        expect(mockGetTopTransferTargets).toHaveBeenCalled();
      });

      await act(async () => {
        result.current.setQuickAddValues(prev => ({ ...prev, type: 'transfer', accountId: 'acc-1' }));
      });

      expect(result.current.topTransferAccountsForForm).toHaveLength(3);
    });
  });

  describe('Regression Tests', () => {
    it('should properly sort accounts alphabetically by ID', async () => {
      LastAccount.getLastAccessedAccount.mockResolvedValue(null);

      const unsortedAccounts = [
        { id: 'acc-3', name: 'Third', currency: 'USD', balance: '300' },
        { id: 'acc-1', name: 'First', currency: 'USD', balance: '100' },
        { id: 'acc-2', name: 'Second', currency: 'USD', balance: '200' },
      ];

      const { result } = renderHook(() =>
        useQuickAddForm(unsortedAccounts, unsortedAccounts, mockCategories, mockT),
      );

      await waitFor(() => {
        expect(result.current.quickAddValues.accountId).toBe('acc-1');
      });
    });

    it('should handle category type changes correctly', async () => {
      const { result } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      // Initially expense type
      expect(result.current.filteredCategories).toHaveLength(2);

      // Change to income
      await act(async () => {
        result.current.setQuickAddValues(prev => ({ ...prev, type: 'income' }));
      });

      expect(result.current.filteredCategories).toHaveLength(1);
      expect(result.current.filteredCategories[0].categoryType).toBe('income');
    });

    it('should maintain form values during re-renders', async () => {
      const { result, rerender } = renderHook(() =>
        useQuickAddForm(mockAccounts, mockAccounts, mockCategories, mockT),
      );

      await act(async () => {
        result.current.setQuickAddValues(prev => ({
          ...prev,
          amount: '100',
          description: 'Test',
        }));
      });

      rerender();

      expect(result.current.quickAddValues.amount).toBe('100');
      expect(result.current.quickAddValues.description).toBe('Test');
    });
  });
});
