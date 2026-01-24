import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import useOperationForm from '../../app/hooks/useOperationForm';
import * as BalanceHistoryDB from '../../app/services/BalanceHistoryDB';
import * as LastAccount from '../../app/services/LastAccount';
import * as Currency from '../../app/services/currency';

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

jest.mock('../../app/services/BalanceHistoryDB', () => ({
  formatDate: jest.fn((date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }),
}));

jest.mock('../../app/services/LastAccount', () => ({
  getLastAccessedAccount: jest.fn(),
  setLastAccessedAccount: jest.fn(),
}));

jest.mock('../../app/services/currency', () => ({
  getExchangeRate: jest.fn(),
  convertAmount: jest.fn(),
  formatAmount: jest.fn((amount) => String(amount)),
}));

jest.mock('../../app/utils/categoryUtils', () => ({
  getCategoryDisplayName: jest.fn((categoryId, categories) => {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : null;
  }),
}));

jest.mock('../../app/utils/calculatorUtils', () => ({
  hasOperation: jest.fn((str) => /[+\-*/]/.test(str)),
  evaluateExpression: jest.fn((str) => {
    if (str === '10+5') return '15';
    return null;
  }),
}));

describe('useOperationForm', () => {
  const mockT = (key) => key;

  const mockAccounts = [
    { id: 'acc-1', name: 'Checking', currency: 'USD', balance: '1000' },
    { id: 'acc-2', name: 'Savings', currency: 'EUR', balance: '500' },
  ];

  const mockCategories = [
    { id: 'cat-1', name: 'Food', categoryType: 'expense', isShadow: false },
    { id: 'cat-2', name: 'Salary', categoryType: 'income', isShadow: false },
    { id: 'cat-3', name: 'Shadow', categoryType: 'expense', isShadow: true },
  ];

  const mockAddOperation = jest.fn();
  const mockUpdateOperation = jest.fn();
  const mockValidateOperation = jest.fn();
  const mockShowDialog = jest.fn();
  const mockOnClose = jest.fn();
  const mockOnDelete = jest.fn();

  const defaultProps = {
    visible: true,
    operation: null,
    isNew: true,
    accounts: mockAccounts,
    categories: mockCategories,
    t: mockT,
    addOperation: mockAddOperation,
    updateOperation: mockUpdateOperation,
    validateOperation: mockValidateOperation,
    showDialog: mockShowDialog,
    onClose: mockOnClose,
    onDelete: mockOnDelete,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    LastAccount.getLastAccessedAccount.mockResolvedValue(null);
    Currency.getExchangeRate.mockReturnValue('0.85');
    Currency.convertAmount.mockReturnValue('85.00');
    Currency.formatAmount.mockImplementation((amount) => String(amount));
  });

  describe('Initialization', () => {
    it('should initialize with default values for new operation', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      await waitFor(() => {
        expect(result.current.values.type).toBe('expense');
        expect(result.current.values.amount).toBe('');
        expect(result.current.values.accountId).toBe('acc-1');
      });
    });

    it('should initialize with operation values for edit', async () => {
      const existingOperation = {
        id: 'op-1',
        type: 'income',
        amount: '500',
        accountId: 'acc-2',
        categoryId: 'cat-2',
        description: 'Salary',
        date: '2024-01-15',
      };

      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values).toMatchObject({
          type: 'income',
          amount: '500',
          accountId: 'acc-2',
          categoryId: 'cat-2',
          description: 'Salary',
          date: '2024-01-15',
        });
      });
    });

    it('should use last accessed account for new operation', async () => {
      LastAccount.getLastAccessedAccount.mockResolvedValue('acc-2');

      const { result } = renderHook(() => useOperationForm(defaultProps));

      await waitFor(() => {
        expect(result.current.values.accountId).toBe('acc-2');
      });
    });

    it('should not initialize values when modal is not visible', async () => {
      const props = { ...defaultProps, visible: false };
      const { result } = renderHook(() => useOperationForm(props));

      // Should have initial default state
      expect(result.current.values.type).toBe('expense');
    });
  });

  describe('Shadow Operations', () => {
    it('should detect shadow operations', () => {
      const shadowOperation = {
        id: 'op-1',
        categoryId: 'cat-3',
        date: new Date().toISOString().split('T')[0],
      };

      const props = { ...defaultProps, operation: shadowOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      expect(result.current.isShadowOperation).toBe(true);
    });

    it('should allow deletion of shadow operations made today', () => {
      const shadowOperation = {
        id: 'op-1',
        categoryId: 'cat-3',
        date: new Date().toISOString().split('T')[0],
      };

      const props = { ...defaultProps, operation: shadowOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      expect(result.current.canDeleteShadowOperation).toBe(true);
    });

    it('should not allow deletion of shadow operations from past', () => {
      const shadowOperation = {
        id: 'op-1',
        categoryId: 'cat-3',
        date: '2020-01-01',
      };

      const props = { ...defaultProps, operation: shadowOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      expect(result.current.canDeleteShadowOperation).toBe(false);
    });

    it('should allow deletion of non-shadow operations', () => {
      const regularOperation = {
        id: 'op-1',
        categoryId: 'cat-1',
        date: '2020-01-01',
      };

      const props = { ...defaultProps, operation: regularOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      expect(result.current.canDeleteShadowOperation).toBe(true);
    });
  });

  describe('Multi-Currency Transfers', () => {
    it('should detect multi-currency transfers', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      // Wait for initial setup
      await waitFor(() => {
        expect(result.current.values.accountId).toBeTruthy();
      });

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'transfer',
          accountId: 'acc-1',
          toAccountId: 'acc-2',
        }));
      });

      await waitFor(() => {
        expect(result.current.values.type).toBe('transfer');
        expect(result.current.values.toAccountId).toBe('acc-2');
        expect(result.current.isMultiCurrencyTransfer).toBe(true);
      }, { timeout: 3000 });
    });

    it('should not detect same-currency transfers as multi-currency', async () => {
      const sameAccounts = [
        { id: 'acc-1', name: 'Checking', currency: 'USD' },
        { id: 'acc-2', name: 'Savings', currency: 'USD' },
      ];

      const props = { ...defaultProps, accounts: sameAccounts };
      const { result } = renderHook(() => useOperationForm(props));

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'transfer',
          accountId: 'acc-1',
          toAccountId: 'acc-2',
        }));
      });

      await waitFor(() => {
        expect(result.current.isMultiCurrencyTransfer).toBe(false);
      });
    });

    it('should auto-populate exchange rate for multi-currency transfers', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      // Wait for initial setup
      await waitFor(() => {
        expect(result.current.values.accountId).toBeTruthy();
      });

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'transfer',
          accountId: 'acc-1',
          toAccountId: 'acc-2',
          exchangeRate: '', // Ensure it's empty so auto-populate triggers
        }));
      });

      await waitFor(() => {
        expect(result.current.values.exchangeRate).toBe('0.85');
      }, { timeout: 3000 });
    });

    it('should calculate destination amount when amount changes', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      // Wait for initial setup
      await waitFor(() => {
        expect(result.current.values.accountId).toBeTruthy();
      });

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'transfer',
          accountId: 'acc-1',
          toAccountId: 'acc-2',
          exchangeRate: '0.85',
        }));
        result.current.setLastEditedField('exchangeRate');
      });

      await act(async () => {
        result.current.setValues(prev => ({ ...prev, amount: '100' }));
        result.current.setLastEditedField('amount');
      });

      await waitFor(() => {
        expect(result.current.values.destinationAmount).toBe('85.00');
      }, { timeout: 3000 });
    });

    it('should clear exchange rate fields for same-currency transfers', async () => {
      const sameAccounts = [
        { id: 'acc-1', name: 'Checking', currency: 'USD' },
        { id: 'acc-2', name: 'Savings', currency: 'USD' },
      ];

      const props = { ...defaultProps, accounts: sameAccounts };
      const { result } = renderHook(() => useOperationForm(props));

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'transfer',
          accountId: 'acc-1',
          toAccountId: 'acc-2',
          exchangeRate: '1.0',
          destinationAmount: '100',
        }));
      });

      await waitFor(() => {
        expect(result.current.values.exchangeRate).toBe('');
        expect(result.current.values.destinationAmount).toBe('');
      });
    });
  });

  describe('Category Type Switching', () => {
    it('should clear category when switching from expense to income', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'expense',
          categoryId: 'cat-1',
        }));
      });

      await act(async () => {
        result.current.setValues(prev => ({ ...prev, type: 'income' }));
      });

      await waitFor(() => {
        expect(result.current.values.categoryId).toBe('');
      });
    });

    it('should not clear category if it matches new type', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      // Wait for initial setup
      await waitFor(() => {
        expect(result.current.values.accountId).toBeTruthy();
      });

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'income',
          categoryId: 'cat-2',
        }));
      });

      // Wait for type and category to be set
      await waitFor(() => {
        expect(result.current.values.type).toBe('income');
        expect(result.current.values.categoryId).toBe('cat-2');
      });

      // Now trigger the effect again by setting type to income again
      await act(async () => {
        result.current.setValues(prev => ({ ...prev, type: 'income' }));
      });

      // Category should still be there since it matches the type
      await waitFor(() => {
        expect(result.current.values.categoryId).toBe('cat-2');
      }, { timeout: 3000 });
    });
  });

  describe('Validation', () => {
    it('should validate required fields', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      // Wait for initial setup
      await waitFor(() => {
        expect(result.current.values.accountId).toBeTruthy();
      });

      await act(async () => {
        result.current.validateFields();
      });

      await waitFor(() => {
        expect(result.current.errors).toHaveProperty('amount');
        expect(result.current.errors).toHaveProperty('categoryId');
      });
    });

    it('should validate amount is a positive number', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      // Wait for initial setup
      await waitFor(() => {
        expect(result.current.values.accountId).toBeTruthy();
      });

      await act(async () => {
        result.current.setValues(prev => ({ ...prev, amount: '-50' }));
        result.current.validateFields();
      });

      await waitFor(() => {
        expect(result.current.errors.amount).toBe('valid_amount_required');
      });
    });

    it('should validate transfer has different accounts', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      // Wait for initial setup
      await waitFor(() => {
        expect(result.current.values.accountId).toBeTruthy();
      });

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'transfer',
          amount: '100',
          accountId: 'acc-1',
          toAccountId: 'acc-1',
          date: '2024-01-15',
        }));
      });

      // Wait for values to be set
      await waitFor(() => {
        expect(result.current.values.type).toBe('transfer');
        expect(result.current.values.toAccountId).toBe('acc-1');
      });

      await act(async () => {
        result.current.validateFields();
      });

      await waitFor(() => {
        expect(result.current.errors.toAccountId).toBe('accounts_must_be_different');
      });
    });

    it('should pass validation with valid values', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      // Wait for initial setup
      await waitFor(() => {
        expect(result.current.values.accountId).toBeTruthy();
      });

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'expense',
          amount: '100',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          date: '2024-01-15',
        }));
      });

      let isValid;
      await act(async () => {
        isValid = result.current.validateFields();
      });

      await waitFor(() => {
        expect(isValid).toBe(true);
        expect(result.current.errors).toEqual({});
      });
    });
  });

  describe('handleSave', () => {
    it('should evaluate math expressions before saving', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      // Wait for initial form setup
      await waitFor(() => {
        expect(result.current.values.accountId).toBeTruthy();
      });

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'expense',
          amount: '10+5',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          date: '2024-01-15',
        }));
      });

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockAddOperation).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '15' }),
      );
    });

    it('should add new operation with correct data', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      // Wait for initial form setup
      await waitFor(() => {
        expect(result.current.values.accountId).toBeTruthy();
      });

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'expense',
          amount: '100',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          date: '2024-01-15',
          description: 'Test',
        }));
      });

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockAddOperation).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
      expect(LastAccount.setLastAccessedAccount).toHaveBeenCalledWith('acc-1');
    });

    it('should update existing operation', async () => {
      const existingOperation = {
        id: 'op-1',
        type: 'expense',
        amount: '100',
        accountId: 'acc-1',
        categoryId: 'cat-1',
        date: '2024-01-15',
      };

      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100');
      });

      await act(async () => {
        result.current.setValues(prev => ({ ...prev, amount: '150' }));
      });

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockUpdateOperation).toHaveBeenCalledWith(
        'op-1',
        expect.objectContaining({ amount: '150' }),
      );
    });

    it('should not save if validation fails', async () => {
      mockValidateOperation.mockReturnValue('validation_error');

      const { result } = renderHook(() => useOperationForm(defaultProps));

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'expense',
          amount: '',
          accountId: 'acc-1',
        }));
      });

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockAddOperation).not.toHaveBeenCalled();
      expect(mockShowDialog).toHaveBeenCalled();
    });
  });

  describe('handleClose', () => {
    it('should dismiss keyboard and close modal', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      // Wait for initial setup
      await waitFor(() => {
        expect(result.current.values.accountId).toBeTruthy();
      });

      await act(async () => {
        result.current.handleClose();
      });

      expect(Keyboard.dismiss).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should clear errors on close', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      // Wait for initial setup
      await waitFor(() => {
        expect(result.current.values.accountId).toBeTruthy();
      });

      await act(async () => {
        result.current.setValues(prev => ({ ...prev, amount: '' }));
        result.current.validateFields();
      });

      await waitFor(() => {
        expect(Object.keys(result.current.errors).length).toBeGreaterThan(0);
      });

      await act(async () => {
        result.current.handleClose();
      });

      await waitFor(() => {
        expect(result.current.errors).toEqual({});
      });
    });
  });

  describe('handleDelete', () => {
    it('should delete operation if deletable', async () => {
      const operation = {
        id: 'op-1',
        categoryId: 'cat-1',
        date: '2024-01-15',
      };

      const props = { ...defaultProps, operation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await act(async () => {
        result.current.handleDelete();
      });

      expect(mockOnDelete).toHaveBeenCalledWith(operation);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should not delete shadow operation from past', async () => {
      const shadowOperation = {
        id: 'op-1',
        categoryId: 'cat-3',
        date: '2020-01-01',
      };

      const props = { ...defaultProps, operation: shadowOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await act(async () => {
        result.current.handleDelete();
      });

      expect(mockOnDelete).not.toHaveBeenCalled();
    });
  });

  describe('Helper Functions', () => {
    it('getAccountName should return account name', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      const name = result.current.getAccountName('acc-1');
      expect(name).toBe('Checking');
    });

    it('getCategoryName should return category name', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      const name = result.current.getCategoryName('cat-1');
      expect(name).toBe('Food');
    });

    it('formatDateForDisplay should format date', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      const formatted = result.current.formatDateForDisplay('2024-01-15');
      expect(formatted).toContain('2024');
    });
  });

  describe('filteredCategories', () => {
    it('should exclude shadow categories', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      const filtered = result.current.filteredCategories;
      const shadowCat = filtered.find(cat => cat.isShadow);
      expect(shadowCat).toBeUndefined();
    });

    it('should filter by operation type', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      // Wait for initial setup
      await waitFor(() => {
        expect(result.current.values.accountId).toBeTruthy();
      });

      await act(async () => {
        result.current.setValues(prev => ({ ...prev, type: 'income' }));
      });

      // Wait for type to be set
      await waitFor(() => {
        expect(result.current.values.type).toBe('income');
      });

      // Now check filtered categories
      await waitFor(() => {
        const filtered = result.current.filteredCategories;
        expect(filtered).toHaveLength(1);
        expect(filtered[0].categoryType).toBe('income');
      }, { timeout: 3000 });
    });

    it('should return empty array for transfers', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      // Wait for initial setup
      await waitFor(() => {
        expect(result.current.values.accountId).toBeTruthy();
      });

      await act(async () => {
        result.current.setValues(prev => ({ ...prev, type: 'transfer' }));
      });

      await waitFor(() => {
        const filtered = result.current.filteredCategories;
        expect(filtered).toHaveLength(0);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty accounts array', async () => {
      const props = { ...defaultProps, accounts: [] };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.accountId).toBe('');
      });
    });

    it('should handle operation without date', async () => {
      const operation = {
        id: 'op-1',
        type: 'expense',
        amount: '100',
      };

      const props = { ...defaultProps, operation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.date).toBeTruthy();
      });
    });
  });

  describe('Regression Tests', () => {
    it('should preserve amount when editing operation', async () => {
      const operation = {
        id: 'op-1',
        type: 'expense',
        amount: '123.45',
        accountId: 'acc-1',
        categoryId: 'cat-1',
        date: '2024-01-15',
      };

      const props = { ...defaultProps, operation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('123.45');
      });
    });

    it('should handle string amounts correctly', async () => {
      const { result } = renderHook(() => useOperationForm(defaultProps));

      // Wait for initial form setup
      await waitFor(() => {
        expect(result.current.values.accountId).toBeTruthy();
      });

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'expense',
          amount: '100.50',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          date: '2024-01-15',
        }));
      });

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockAddOperation).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '100.50' }),
      );
    });
  });

  describe('Split Operation', () => {
    const existingOperation = {
      id: 'op-1',
      type: 'expense',
      amount: '100.00',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      date: '2024-01-15',
      description: 'Test expense',
    };

    it('should expose handleSplit function', async () => {
      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(typeof result.current.handleSplit).toBe('function');
      });
    });

    it('should not split new operations', async () => {
      const props = { ...defaultProps, operation: null, isNew: true };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.handleSplit).toBeDefined();
      });

      let splitResult;
      await act(async () => {
        splitResult = await result.current.handleSplit('50.00', 'cat-2');
      });

      expect(splitResult.success).toBe(false);
      expect(mockAddOperation).not.toHaveBeenCalled();
    });

    it('should reject invalid split amount (zero)', async () => {
      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      let splitResult;
      await act(async () => {
        splitResult = await result.current.handleSplit('0', 'cat-2');
      });

      expect(splitResult.success).toBe(false);
      expect(mockAddOperation).not.toHaveBeenCalled();
    });

    it('should reject invalid split amount (negative)', async () => {
      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      let splitResult;
      await act(async () => {
        splitResult = await result.current.handleSplit('-10', 'cat-2');
      });

      expect(splitResult.success).toBe(false);
      expect(mockAddOperation).not.toHaveBeenCalled();
    });

    it('should reject split amount equal to original', async () => {
      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      let splitResult;
      await act(async () => {
        splitResult = await result.current.handleSplit('100.00', 'cat-2');
      });

      expect(splitResult.success).toBe(false);
      expect(mockAddOperation).not.toHaveBeenCalled();
    });

    it('should reject split amount greater than original', async () => {
      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      let splitResult;
      await act(async () => {
        splitResult = await result.current.handleSplit('150.00', 'cat-2');
      });

      expect(splitResult.success).toBe(false);
      expect(mockAddOperation).not.toHaveBeenCalled();
    });

    it('should create new operation with split amount', async () => {
      mockAddOperation.mockResolvedValue();
      mockUpdateOperation.mockResolvedValue();

      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      let splitResult;
      await act(async () => {
        splitResult = await result.current.handleSplit('30.00', 'cat-2');
      });

      expect(splitResult.success).toBe(true);
      expect(mockAddOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'expense',
          amount: '30',
          accountId: 'acc-1',
          categoryId: 'cat-2',
          date: '2024-01-15',
        }),
      );
    });

    it('should update original operation with reduced amount', async () => {
      mockAddOperation.mockResolvedValue();
      mockUpdateOperation.mockResolvedValue();

      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      await act(async () => {
        await result.current.handleSplit('30.00', 'cat-2');
      });

      expect(mockUpdateOperation).toHaveBeenCalledWith(
        'op-1',
        expect.objectContaining({
          amount: '70',
        }),
      );
    });

    it('should update local state with new amount after split', async () => {
      mockAddOperation.mockResolvedValue();
      mockUpdateOperation.mockResolvedValue();

      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      await act(async () => {
        await result.current.handleSplit('30.00', 'cat-2');
      });

      await waitFor(() => {
        expect(result.current.values.amount).toBe('70');
      });
    });

    it('should return new amount in success result', async () => {
      mockAddOperation.mockResolvedValue();
      mockUpdateOperation.mockResolvedValue();

      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      let splitResult;
      await act(async () => {
        splitResult = await result.current.handleSplit('30.00', 'cat-2');
      });

      expect(splitResult.success).toBe(true);
      expect(splitResult.newAmount).toBe('70');
    });

    it('should preserve description in new split operation', async () => {
      mockAddOperation.mockResolvedValue();
      mockUpdateOperation.mockResolvedValue();

      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.description).toBe('Test expense');
      });

      await act(async () => {
        await result.current.handleSplit('30.00', 'cat-2');
      });

      expect(mockAddOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Test expense',
        }),
      );
    });

    it('should handle addOperation failure', async () => {
      mockAddOperation.mockRejectedValue(new Error('Database error'));

      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      let splitResult;
      await act(async () => {
        splitResult = await result.current.handleSplit('30.00', 'cat-2');
      });

      expect(splitResult.success).toBe(false);
      // Original amount should not be changed
      expect(result.current.values.amount).toBe('100.00');
    });
  });
});
