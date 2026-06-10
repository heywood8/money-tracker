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
  subtract: jest.fn((a, b) => String(parseFloat(a) - parseFloat(b))),
  fetchLiveExchangeRate: jest.fn().mockResolvedValue({ rate: null, source: 'none' }),
  getDecimalPlaces: jest.fn(() => 2),
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
  const mockSplitOperation = jest.fn();
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
    splitOperation: mockSplitOperation,
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
    Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: '0.85', source: 'live' });
  });

  describe('Initialization', () => {
    it('should initialize with default values for new operation', async () => {
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(props));

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

      const { result } = await renderHook(() => useOperationForm(defaultProps));

      await waitFor(() => {
        expect(result.current.values.accountId).toBe('acc-2');
      });
    });

    it('should not initialize values when modal is not visible', async () => {
      const props = { ...defaultProps, visible: false };
      const { result } = await renderHook(() => useOperationForm(props));

      // Should have initial default state
      expect(result.current.values.type).toBe('expense');
    });
  });

  describe('Shadow Operations', () => {
    it('should detect shadow operations', async () => {
      const shadowOperation = {
        id: 'op-1',
        categoryId: 'cat-3',
        date: new Date().toISOString().split('T')[0],
      };

      const props = { ...defaultProps, operation: shadowOperation, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      expect(result.current.isShadowOperation).toBe(true);
    });

    it('should allow deletion of shadow operations made today', async () => {
      const shadowOperation = {
        id: 'op-1',
        categoryId: 'cat-3',
        date: new Date().toISOString().split('T')[0],
      };

      const props = { ...defaultProps, operation: shadowOperation, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      expect(result.current.canDeleteShadowOperation).toBe(true);
    });

    it('should not allow deletion of shadow operations from past', async () => {
      const shadowOperation = {
        id: 'op-1',
        categoryId: 'cat-3',
        date: '2020-01-01',
      };

      const props = { ...defaultProps, operation: shadowOperation, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      expect(result.current.canDeleteShadowOperation).toBe(false);
    });

    it('should allow deletion of non-shadow operations', async () => {
      const regularOperation = {
        id: 'op-1',
        categoryId: 'cat-1',
        date: '2020-01-01',
      };

      const props = { ...defaultProps, operation: regularOperation, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      expect(result.current.canDeleteShadowOperation).toBe(true);
    });
  });

  describe('Multi-Currency Transfers', () => {
    it('should detect multi-currency transfers', async () => {
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(props));

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
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(props));

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
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(props));

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

      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(props));

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
      const { result } = await renderHook(() => useOperationForm(props));

      await act(async () => {
        result.current.handleDelete();
      });

      expect(mockOnDelete).not.toHaveBeenCalled();
    });
  });

  describe('Helper Functions', () => {
    it('getAccountName should return account name', async () => {
      const { result } = await renderHook(() => useOperationForm(defaultProps));

      const name = result.current.getAccountName('acc-1');
      expect(name).toBe('Checking');
    });

    it('getCategoryName should return category name', async () => {
      const { result } = await renderHook(() => useOperationForm(defaultProps));

      const name = result.current.getCategoryName('cat-1');
      expect(name).toBe('Food');
    });

    it('formatDateForDisplay should format date', async () => {
      const { result } = await renderHook(() => useOperationForm(defaultProps));

      const formatted = result.current.formatDateForDisplay('2024-01-15');
      expect(formatted).toContain('2024');
    });
  });

  describe('filteredCategories', () => {
    it('should exclude shadow categories', async () => {
      const { result } = await renderHook(() => useOperationForm(defaultProps));

      const filtered = result.current.filteredCategories;
      const shadowCat = filtered.find(cat => cat.isShadow);
      expect(shadowCat).toBeUndefined();
    });

    it('should filter by operation type', async () => {
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(props));

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
      const { result } = await renderHook(() => useOperationForm(props));

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
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('123.45');
      });
    });

    it('should preserve multicurrency exchange rate when accounts prop gets a new reference', async () => {
      // Regression: accounts getting a new array reference (from a context update) while the
      // user is editing (e.g. typing description) used to re-trigger initialization and wipe
      // the exchange rate that had been auto-populated or manually entered.
      const multicurrencyOperation = {
        id: 'op-mc',
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        exchangeRate: '1.2',
        destinationAmount: '60',
        date: '2024-01-15',
      };

      const { result, rerender } = await renderHook(
        (props) => useOperationForm(props),
        { initialProps: { ...defaultProps, operation: multicurrencyOperation, isNew: false } },
      );

      await waitFor(() => {
        expect(result.current.values.exchangeRate).toBe('1.2');
        expect(result.current.values.destinationAmount).toBe('60');
      });

      // Simulate the accounts context emitting a new array reference with the same data
      const newAccountsRef = [...mockAccounts];
      rerender({ ...defaultProps, operation: multicurrencyOperation, isNew: false, accounts: newAccountsRef });

      // Exchange rate and destination amount must NOT reset
      await waitFor(() => {
        expect(result.current.values.exchangeRate).toBe('1.2');
        expect(result.current.values.destinationAmount).toBe('60');
      });
    });

    it('should preserve exchange rate set by auto-populate when accounts ref changes', async () => {
      // Regression: when operation has no stored exchange rate, auto-populate fetches one.
      // A subsequent accounts reference change must not wipe the auto-populated value.
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: '0.85', source: 'live' });

      const multicurrencyOperation = {
        id: 'op-mc2',
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        exchangeRate: null, // no stored rate — auto-populate will fetch one
        destinationAmount: null,
        date: '2024-01-15',
      };

      const { result, rerender } = await renderHook(
        (props) => useOperationForm(props),
        { initialProps: { ...defaultProps, operation: multicurrencyOperation, isNew: false } },
      );

      // Wait for auto-populate to set the fetched rate
      await waitFor(() => {
        expect(result.current.values.exchangeRate).toBe('0.85');
      }, { timeout: 3000 });

      // Simulate accounts context emitting a new array reference
      const newAccountsRef = [...mockAccounts];
      rerender({ ...defaultProps, operation: multicurrencyOperation, isNew: false, accounts: newAccountsRef });

      // Auto-populated rate must survive the accounts reference change
      await waitFor(() => {
        expect(result.current.values.exchangeRate).toBe('0.85');
      });
    });

    it('should treat stored exchangeRate of 0 as empty so auto-populate can provide a valid rate', async () => {
      // 0 is not a valid exchange rate; if it somehow got persisted (e.g. DB default), we
      // should treat it as "not set" so auto-populate can fetch a real rate.
      const operationWithZeroRate = {
        id: 'op-zero',
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        exchangeRate: 0,    // stored as numeric 0
        destinationAmount: 0,
        date: '2024-01-15',
      };

      const { result } = await renderHook(() =>
        useOperationForm({ ...defaultProps, operation: operationWithZeroRate, isNew: false }),
      );

      await waitFor(() => {
        // Zero is treated as falsy (empty), so auto-populate fires and provides the live rate.
        // The final state has the auto-populated rate, not '0' — verifying the zero→empty conversion happened.
        expect(result.current.values.exchangeRate).toBe('0.85');
        expect(result.current.values.exchangeRate).not.toBe('0');
      });
    });

    it('should handle string amounts correctly', async () => {
      const { result } = await renderHook(() => useOperationForm(defaultProps));

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
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(typeof result.current.handleSplit).toBe('function');
      });
    });

    it('should not split new operations', async () => {
      const props = { ...defaultProps, operation: null, isNew: true };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.handleSplit).toBeDefined();
      });

      let splitResult;
      await act(async () => {
        splitResult = await result.current.handleSplit('50.00', 'cat-2');
      });

      expect(splitResult.success).toBe(false);
      expect(mockSplitOperation).not.toHaveBeenCalled();
    });

    it('should reject invalid split amount (zero)', async () => {
      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      let splitResult;
      await act(async () => {
        splitResult = await result.current.handleSplit('0', 'cat-2');
      });

      expect(splitResult.success).toBe(false);
      expect(mockSplitOperation).not.toHaveBeenCalled();
    });

    it('should reject invalid split amount (negative)', async () => {
      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      let splitResult;
      await act(async () => {
        splitResult = await result.current.handleSplit('-10', 'cat-2');
      });

      expect(splitResult.success).toBe(false);
      expect(mockSplitOperation).not.toHaveBeenCalled();
    });

    it('should reject split amount equal to original', async () => {
      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      let splitResult;
      await act(async () => {
        splitResult = await result.current.handleSplit('100.00', 'cat-2');
      });

      expect(splitResult.success).toBe(false);
      expect(mockSplitOperation).not.toHaveBeenCalled();
    });

    it('should reject split amount greater than original', async () => {
      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      let splitResult;
      await act(async () => {
        splitResult = await result.current.handleSplit('150.00', 'cat-2');
      });

      expect(splitResult.success).toBe(false);
      expect(mockSplitOperation).not.toHaveBeenCalled();
    });

    it('should create new operation with split amount', async () => {
      mockSplitOperation.mockResolvedValue();

      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      let splitResult;
      await act(async () => {
        splitResult = await result.current.handleSplit('30.00', 'cat-2');
      });

      expect(splitResult.success).toBe(true);
      expect(mockSplitOperation).toHaveBeenCalledWith(
        'op-1',
        expect.objectContaining({ amount: '70' }),
        expect.objectContaining({
          type: 'expense',
          amount: '30.00',
          accountId: 'acc-1',
          categoryId: 'cat-2',
          date: '2024-01-15',
        }),
      );
    });

    it('should update original operation with reduced amount', async () => {
      mockSplitOperation.mockResolvedValue();

      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      await act(async () => {
        await result.current.handleSplit('30.00', 'cat-2');
      });

      expect(mockSplitOperation).toHaveBeenCalledWith(
        'op-1',
        expect.objectContaining({ amount: '70' }),
        expect.anything(),
      );
    });

    it('should update local state with new amount after split', async () => {
      mockSplitOperation.mockResolvedValue();

      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

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
      mockSplitOperation.mockResolvedValue();

      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

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
      mockSplitOperation.mockResolvedValue();

      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.description).toBe('Test expense');
      });

      await act(async () => {
        await result.current.handleSplit('30.00', 'cat-2');
      });

      expect(mockSplitOperation).toHaveBeenCalledWith(
        'op-1',
        expect.anything(),
        expect.objectContaining({
          description: 'Test expense',
        }),
      );
    });

    it('should handle splitOperation failure atomically', async () => {
      mockSplitOperation.mockRejectedValue(new Error('Database error'));

      const props = { ...defaultProps, operation: existingOperation, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('100.00');
      });

      let splitResult;
      await act(async () => {
        splitResult = await result.current.handleSplit('30.00', 'cat-2');
      });

      expect(splitResult.success).toBe(false);
      // Local state must not change when the atomic DB operation fails
      expect(result.current.values.amount).toBe('100.00');
    });
  });

  describe('Regression: destinationAmount race condition (issue #587)', () => {
    it('should use user-entered destinationAmount when lastEditedField is destinationAmount (multi-currency transfer)', async () => {
      // Race condition: user edits destinationAmount but saves before the back-calc useEffect
      // runs. prepareOperationData must not overwrite the user-entered value with amount × stale rate.
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: null, source: 'none' });
      mockAddOperation.mockResolvedValue();

      const { result } = await renderHook(() => useOperationForm(defaultProps));

      await waitFor(() => expect(result.current.values.accountId).toBeTruthy());

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'transfer',
          accountId: 'acc-1',
          toAccountId: 'acc-2',
          amount: '100',
          exchangeRate: '0.85',
          destinationAmount: '90', // user overrode the auto-calculated 85
        }));
        result.current.setLastEditedField('destinationAmount');
      });

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockAddOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          destinationAmount: '90',
          // rate should be back-calculated: 90/100 = 0.9
          exchangeRate: '0.900000',
        }),
      );
    });

    it('should still forward-calculate destinationAmount when lastEditedField is amount (multi-currency transfer)', async () => {
      // Existing forward-calc behaviour must not regress.
      Currency.convertAmount.mockReturnValue('170.00');
      mockAddOperation.mockResolvedValue();

      const { result } = await renderHook(() => useOperationForm(defaultProps));

      await waitFor(() => expect(result.current.values.accountId).toBeTruthy());

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'transfer',
          accountId: 'acc-1',
          toAccountId: 'acc-2',
          amount: '200',
          exchangeRate: '0.85',
          destinationAmount: '85', // stale value from previous state
        }));
        result.current.setLastEditedField('amount');
      });

      await act(async () => {
        await result.current.handleSave();
      });

      expect(Currency.convertAmount).toHaveBeenCalledWith('200', 'USD', 'EUR', '0.85');
      expect(mockAddOperation).toHaveBeenCalledWith(
        expect.objectContaining({ destinationAmount: '170.00' }),
      );
    });

    it('should use user-entered destinationAmount when lastEditedField is destinationAmount (foreign currency op)', async () => {
      // Same race condition for foreign currency expense/income.
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: null, source: 'none' });
      mockAddOperation.mockResolvedValue();

      const { result } = await renderHook(() => useOperationForm(defaultProps));

      await waitFor(() => expect(result.current.values.accountId).toBeTruthy());

      // Form model for foreign currency op: amount=foreign, destinationAmount=account currency.
      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'expense',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          date: '2024-01-15',
          operationCurrency: 'EUR',
          amount: '100',       // EUR (foreign)
          exchangeRate: '1.08', // EUR→USD
          destinationAmount: '105', // user overrode the auto-calculated 108
        }));
        result.current.setLastEditedField('destinationAmount');
      });

      await act(async () => {
        await result.current.handleSave();
      });

      // DB model swaps: amount=account(USD), destinationAmount=foreign(EUR).
      // back-calc rate EUR→USD: 105/100 = 1.05; inverted to USD→EUR: 1/1.05 ≈ 0.952381
      expect(mockAddOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: '105',       // account currency (USD) — swapped
          destinationAmount: '100', // foreign currency (EUR) — swapped
          sourceCurrency: 'EUR',
          destinationCurrency: 'USD',
        }),
      );
    });
  });

  describe('Regression: foreign-currency save swaps amounts with invalid rate (issue #687)', () => {
    it('should block save and show validation error when exchange rate is empty for foreign currency op', async () => {
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: null, source: 'none' });
      mockAddOperation.mockResolvedValue();

      const { result } = await renderHook(() => useOperationForm(defaultProps));

      await waitFor(() => expect(result.current.values.accountId).toBeTruthy());

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'expense',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          date: '2024-01-15',
          operationCurrency: 'EUR',
          amount: '100',
          exchangeRate: '',       // rate cleared — simulates fast save before fetch resolves
          destinationAmount: '108',
        }));
      });

      await act(async () => {
        await result.current.handleSave();
      });

      // Save must be blocked: addOperation must not be called
      expect(mockAddOperation).not.toHaveBeenCalled();
      // User must see an error on the exchangeRate field
      expect(result.current.errors.exchangeRate).toBe('exchange_rate_required');
    });

    it('should block save when exchange rate is zero for foreign currency op', async () => {
      mockAddOperation.mockResolvedValue();

      const { result } = await renderHook(() => useOperationForm(defaultProps));

      await waitFor(() => expect(result.current.values.accountId).toBeTruthy());

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'expense',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          date: '2024-01-15',
          operationCurrency: 'EUR',
          amount: '100',
          exchangeRate: '0',
          destinationAmount: '0',
        }));
      });

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockAddOperation).not.toHaveBeenCalled();
      expect(result.current.errors.exchangeRate).toBe('exchange_rate_required');
    });

    it('should not validate exchange rate for same-currency ops', async () => {
      mockAddOperation.mockResolvedValue();

      const { result } = await renderHook(() => useOperationForm(defaultProps));

      await waitFor(() => expect(result.current.values.accountId).toBeTruthy());

      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'expense',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          date: '2024-01-15',
          // operationCurrency matches account currency (USD), so not a foreign op
          operationCurrency: 'USD',
          amount: '100',
          exchangeRate: '',
        }));
      });

      await act(async () => {
        await result.current.handleSave();
      });

      // No exchange rate error for same-currency ops
      expect(result.current.errors.exchangeRate).toBeUndefined();
      expect(mockAddOperation).toHaveBeenCalled();
    });

    it('should not perform amount swap when rate is invalid in prepareOperationData', async () => {
      // Even if validation is somehow bypassed, prepareOperationData must not
      // produce a partially-swapped row (swapped amounts, un-inverted rate).
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: null, source: 'none' });
      mockAddOperation.mockResolvedValue();
      // Bypass validateFields by making the mock pass validation
      // We test the save path by using a valid amount/category but invalid rate;
      // the validation added by this fix will block the save, so we verify that.
      const { result } = await renderHook(() => useOperationForm(defaultProps));

      await waitFor(() => expect(result.current.values.accountId).toBeTruthy());

      // Set up a foreign currency op with a zero rate
      await act(async () => {
        result.current.setValues(prev => ({
          ...prev,
          type: 'expense',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          date: '2024-01-15',
          operationCurrency: 'EUR',
          amount: '100',         // EUR (foreign)
          exchangeRate: '0',     // invalid
          destinationAmount: '0',
        }));
      });

      await act(async () => {
        await result.current.handleSave();
      });

      // Save must be blocked entirely; amounts must NOT be swapped into DB
      expect(mockAddOperation).not.toHaveBeenCalled();
    });
  });

  describe('Foreign Currency Expense/Income', () => {
    const foreignCurrencyExpense = {
      id: 'op-fx',
      type: 'expense',
      amount: '244',
      accountId: 'acc-1',       // account currency is USD
      categoryId: 'cat-1',
      date: '2024-01-15',
      sourceCurrency: 'EUR',    // entered in EUR (foreign)
      destinationCurrency: 'USD',
      exchangeRate: '1.08',
      destinationAmount: '263.52',
    };

    it('should load operationCurrency from sourceCurrency when editing foreign currency expense', async () => {
      const props = { ...defaultProps, operation: foreignCurrencyExpense, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.operationCurrency).toBe('EUR');
      });
    });

    it('should set isForeignCurrencyOp true when operationCurrency differs from account currency', async () => {
      const props = { ...defaultProps, operation: foreignCurrencyExpense, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.isForeignCurrencyOp).toBe(true);
      });
    });

    it('should load foreign currency op with foreign amount as primary and inverted rate', async () => {
      // The form shows the foreign currency amount (what was spent) as the primary calculator
      // value, and the account currency amount (what was deducted) as the destination field.
      // The exchange rate is inverted so it points foreign→account (e.g. EUR→USD).
      // DB has: amount=244(USD), destinationAmount=263.52(EUR), exchangeRate=1.08 (USD→EUR).
      // Form shows: amount=263.52(EUR), destinationAmount=244(USD), exchangeRate=0.925926 (EUR→USD).
      const props = { ...defaultProps, operation: foreignCurrencyExpense, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.amount).toBe('263.52');          // foreign currency (EUR)
        expect(result.current.values.destinationAmount).toBe('244'); // account currency (USD)
        expect(result.current.values.exchangeRate).toBe('0.925926'); // inverted: EUR→USD
      });
    });

    it('should auto-populate exchangeRate via rateSource when no stored rate exists', async () => {
      // For new foreign currency ops (no stored rate), auto-populate fetches and sets
      // values.exchangeRate, and updates rateSource accordingly.
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: '1.09', source: 'live' });

      const noRateOp = { ...foreignCurrencyExpense, exchangeRate: null, destinationAmount: null };
      const props = { ...defaultProps, operation: noRateOp, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.exchangeRate).toBe('1.09');
        expect(result.current.rateSource).toBe('live');
      });
    });

    it('should fall back to offline rate when live fetch fails for foreign op', async () => {
      Currency.fetchLiveExchangeRate.mockRejectedValue(new Error('network'));
      Currency.getExchangeRate.mockReturnValue('1.07');

      const noRateOp = { ...foreignCurrencyExpense, exchangeRate: null, destinationAmount: null };
      const props = { ...defaultProps, operation: noRateOp, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.exchangeRate).toBe('1.07');
        expect(result.current.rateSource).toBe('offline');
      });
    });

    it('should not set isForeignCurrencyOp for transfer operations', async () => {
      const transferOp = {
        id: 'op-tr',
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        sourceCurrency: 'EUR',
        destinationCurrency: 'USD',
        exchangeRate: '1.08',
        date: '2024-01-15',
      };

      const props = { ...defaultProps, operation: transferOp, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.type).toBe('transfer');
        expect(result.current.isForeignCurrencyOp).toBe(false);
        // transfer ops use values.operationCurrency = '' (never loaded from sourceCurrency)
        expect(result.current.values.operationCurrency).toBe('');
      });
    });

    it('should include sourceCurrency and destinationCurrency when saving foreign currency expense', async () => {
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: '1.09', source: 'live' });
      // convertAmount is called synchronously in prepareOperationData to recompute
      // destinationAmount from the form's foreign amount × rate (263.52 EUR × 0.925926 ≈ 244 USD)
      Currency.convertAmount.mockReturnValue('244');
      mockUpdateOperation.mockResolvedValue();

      const props = { ...defaultProps, operation: foreignCurrencyExpense, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        expect(result.current.values.operationCurrency).toBe('EUR');
        expect(result.current.isForeignCurrencyOp).toBe(true);
      });

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockUpdateOperation).toHaveBeenCalledWith(
        'op-fx',
        expect.objectContaining({
          sourceCurrency: 'EUR',
          destinationCurrency: 'USD',
          amount: '244',               // account currency (USD) swapped back for DB
          destinationAmount: '263.52', // foreign currency (EUR) swapped back for DB
        }),
      );
    });

    it('should recalculate destinationAmount when amount changes for foreign currency op', async () => {
      // When the user edits the amount, the destinationAmount should update automatically.
      Currency.convertAmount.mockReturnValue('291.60');

      const props = { ...defaultProps, operation: foreignCurrencyExpense, isNew: false };
      const { result } = await renderHook(() => useOperationForm(props));

      await waitFor(() => {
        // Rate is inverted on load: EUR→USD = 1/1.08 = 0.925926
        expect(result.current.values.exchangeRate).toBe('0.925926');
      });

      await act(async () => {
        result.current.setValues(v => ({ ...v, amount: '270' }));
        result.current.setLastEditedField('amount');
      });

      await waitFor(() => {
        expect(result.current.values.destinationAmount).toBe('291.60');
      });
    });
  });
});
