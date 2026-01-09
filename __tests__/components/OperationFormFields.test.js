import React from 'react';
import { render } from '@testing-library/react-native';
import OperationFormFields from '../../app/components/operations/OperationFormFields';

// Mock dependencies
jest.mock('../../app/components/Calculator', () => 'Calculator');
jest.mock('../../app/components/modals/MultiCurrencyFields', () => 'MultiCurrencyFields');

describe('OperationFormFields', () => {
  const mockColors = {
    text: '#000',
    primary: '#007AFF',
    border: '#ccc',
    background: '#fff',
    altRow: '#f5f5f5',
    inputBackground: '#fff',
    inputBorder: '#ddd',
    mutedText: '#666',
  };

  const mockT = (key) => key;

  const mockAccounts = [
    { id: '1', name: 'USD Account', currency: 'USD', balance: '1000' },
    { id: '2', name: 'EUR Account', currency: 'EUR', balance: '500' },
    { id: '3', name: 'USD Account 2', currency: 'USD', balance: '750' },
  ];

  const mockCategories = [
    { id: 'cat1', name: 'Food', type: 'entry', categoryType: 'expense' },
    { id: 'cat2', name: 'Salary', type: 'entry', categoryType: 'income' },
  ];

  const mockTYPES = [
    { key: 'expense', label: 'Expense', icon: 'minus-circle' },
    { key: 'income', label: 'Income', icon: 'plus-circle' },
    { key: 'transfer', label: 'Transfer', icon: 'swap-horizontal' },
  ];

  const defaultProps = {
    colors: mockColors,
    t: mockT,
    values: {
      type: 'expense',
      amount: '100',
      accountId: '1',
      categoryId: 'cat1',
      toAccountId: '',
      exchangeRate: '',
      destinationAmount: '',
    },
    setValues: jest.fn(),
    accounts: mockAccounts,
    categories: mockCategories,
    getAccountName: (id) => mockAccounts.find(a => a.id === id)?.name || 'Unknown',
    getAccountBalance: (id) => {
      const acc = mockAccounts.find(a => a.id === id);
      return acc ? `$${acc.balance}` : '';
    },
    getCategoryName: (id) => mockCategories.find(c => c.id === id)?.name || 'select_category',
    openPicker: jest.fn(),
    onAmountChange: jest.fn(),
    onAdd: jest.fn(),
    TYPES: mockTYPES,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Multi-Currency Transfer Detection', () => {
    it('should detect multi-currency transfer when accounts have different currencies', () => {
      const props = {
        ...defaultProps,
        values: {
          type: 'transfer',
          amount: '100',
          accountId: '1', // USD
          toAccountId: '2', // EUR
          categoryId: '',
          exchangeRate: '1.2',
          destinationAmount: '120',
        },
        onExchangeRateChange: jest.fn(),
        onDestinationAmountChange: jest.fn(),
      };

      const { UNSAFE_getByType } = render(<OperationFormFields {...props} />);

      // MultiCurrencyFields should be rendered
      const multiCurrencyFields = UNSAFE_getByType('MultiCurrencyFields');
      expect(multiCurrencyFields).toBeTruthy();
    });

    it('should not detect multi-currency transfer when accounts have same currency', () => {
      const props = {
        ...defaultProps,
        values: {
          type: 'transfer',
          amount: '100',
          accountId: '1', // USD
          toAccountId: '3', // USD
          categoryId: '',
          exchangeRate: '',
          destinationAmount: '',
        },
        onExchangeRateChange: jest.fn(),
        onDestinationAmountChange: jest.fn(),
      };

      const { UNSAFE_queryByType } = render(<OperationFormFields {...props} />);

      // MultiCurrencyFields should NOT be rendered
      const multiCurrencyFields = UNSAFE_queryByType('MultiCurrencyFields');
      expect(multiCurrencyFields).toBeNull();
    });

    it('should not show multi-currency fields for non-transfer operations', () => {
      const props = {
        ...defaultProps,
        values: {
          type: 'expense',
          amount: '100',
          accountId: '1', // USD
          categoryId: 'cat1',
          toAccountId: '2', // EUR (shouldn't matter)
          exchangeRate: '',
          destinationAmount: '',
        },
        onExchangeRateChange: jest.fn(),
        onDestinationAmountChange: jest.fn(),
      };

      const { UNSAFE_queryByType } = render(<OperationFormFields {...props} />);

      // MultiCurrencyFields should NOT be rendered for expense
      const multiCurrencyFields = UNSAFE_queryByType('MultiCurrencyFields');
      expect(multiCurrencyFields).toBeNull();
    });

    it('should not render MultiCurrencyFields if onExchangeRateChange callback is missing', () => {
      const props = {
        ...defaultProps,
        values: {
          type: 'transfer',
          amount: '100',
          accountId: '1', // USD
          toAccountId: '2', // EUR
          categoryId: '',
          exchangeRate: '1.2',
          destinationAmount: '120',
        },
        // Missing onExchangeRateChange
        onDestinationAmountChange: jest.fn(),
      };

      const { UNSAFE_queryByType } = render(<OperationFormFields {...props} />);

      // MultiCurrencyFields should NOT be rendered without callback
      const multiCurrencyFields = UNSAFE_queryByType('MultiCurrencyFields');
      expect(multiCurrencyFields).toBeNull();
    });

    it('should not render MultiCurrencyFields if onDestinationAmountChange callback is missing', () => {
      const props = {
        ...defaultProps,
        values: {
          type: 'transfer',
          amount: '100',
          accountId: '1', // USD
          toAccountId: '2', // EUR
          categoryId: '',
          exchangeRate: '1.2',
          destinationAmount: '120',
        },
        onExchangeRateChange: jest.fn(),
        // Missing onDestinationAmountChange
      };

      const { UNSAFE_queryByType } = render(<OperationFormFields {...props} />);

      // MultiCurrencyFields should NOT be rendered without callback
      const multiCurrencyFields = UNSAFE_queryByType('MultiCurrencyFields');
      expect(multiCurrencyFields).toBeNull();
    });

    it('should not render MultiCurrencyFields if source account is not found', () => {
      const props = {
        ...defaultProps,
        values: {
          type: 'transfer',
          amount: '100',
          accountId: 'nonexistent', // Invalid account
          toAccountId: '2',
          categoryId: '',
          exchangeRate: '1.2',
          destinationAmount: '120',
        },
        onExchangeRateChange: jest.fn(),
        onDestinationAmountChange: jest.fn(),
      };

      const { UNSAFE_queryByType } = render(<OperationFormFields {...props} />);

      // MultiCurrencyFields should NOT be rendered without valid source account
      const multiCurrencyFields = UNSAFE_queryByType('MultiCurrencyFields');
      expect(multiCurrencyFields).toBeNull();
    });

    it('should not render MultiCurrencyFields if destination account is not found', () => {
      const props = {
        ...defaultProps,
        values: {
          type: 'transfer',
          amount: '100',
          accountId: '1',
          toAccountId: 'nonexistent', // Invalid account
          categoryId: '',
          exchangeRate: '1.2',
          destinationAmount: '120',
        },
        onExchangeRateChange: jest.fn(),
        onDestinationAmountChange: jest.fn(),
      };

      const { UNSAFE_queryByType } = render(<OperationFormFields {...props} />);

      // MultiCurrencyFields should NOT be rendered without valid destination account
      const multiCurrencyFields = UNSAFE_queryByType('MultiCurrencyFields');
      expect(multiCurrencyFields).toBeNull();
    });
  });

  describe('MultiCurrencyFields Props', () => {
    it('should pass correct props to MultiCurrencyFields', () => {
      const mockOnExchangeRateChange = jest.fn();
      const mockOnDestinationAmountChange = jest.fn();

      const props = {
        ...defaultProps,
        values: {
          type: 'transfer',
          amount: '100',
          accountId: '1', // USD
          toAccountId: '2', // EUR
          categoryId: '',
          exchangeRate: '1.2',
          destinationAmount: '120',
        },
        onExchangeRateChange: mockOnExchangeRateChange,
        onDestinationAmountChange: mockOnDestinationAmountChange,
      };

      const { UNSAFE_getByType } = render(<OperationFormFields {...props} />);

      const multiCurrencyFields = UNSAFE_getByType('MultiCurrencyFields');

      // Verify props
      expect(multiCurrencyFields.props.colors).toBe(mockColors);
      expect(multiCurrencyFields.props.t).toBe(mockT);
      expect(multiCurrencyFields.props.sourceAccount).toEqual(mockAccounts[0]);
      expect(multiCurrencyFields.props.destinationAccount).toEqual(mockAccounts[1]);
      expect(multiCurrencyFields.props.exchangeRate).toBe('1.2');
      expect(multiCurrencyFields.props.destinationAmount).toBe('120');
      expect(multiCurrencyFields.props.isShadowOperation).toBe(false);
      expect(multiCurrencyFields.props.onExchangeRateChange).toBe(mockOnExchangeRateChange);
      expect(multiCurrencyFields.props.onDestinationAmountChange).toBe(mockOnDestinationAmountChange);
    });

    it('should pass empty strings for undefined exchange rate and destination amount', () => {
      const props = {
        ...defaultProps,
        values: {
          type: 'transfer',
          amount: '100',
          accountId: '1', // USD
          toAccountId: '2', // EUR
          categoryId: '',
          exchangeRate: undefined,
          destinationAmount: undefined,
        },
        onExchangeRateChange: jest.fn(),
        onDestinationAmountChange: jest.fn(),
      };

      const { UNSAFE_getByType } = render(<OperationFormFields {...props} />);

      const multiCurrencyFields = UNSAFE_getByType('MultiCurrencyFields');

      // Should default to empty strings
      expect(multiCurrencyFields.props.exchangeRate).toBe('');
      expect(multiCurrencyFields.props.destinationAmount).toBe('');
    });

    it('should pass disabled state to MultiCurrencyFields as isShadowOperation', () => {
      const props = {
        ...defaultProps,
        values: {
          type: 'transfer',
          amount: '100',
          accountId: '1',
          toAccountId: '2',
          categoryId: '',
          exchangeRate: '1.2',
          destinationAmount: '120',
        },
        disabled: true,
        onExchangeRateChange: jest.fn(),
        onDestinationAmountChange: jest.fn(),
      };

      const { UNSAFE_getByType } = render(<OperationFormFields {...props} />);

      const multiCurrencyFields = UNSAFE_getByType('MultiCurrencyFields');

      // disabled prop should map to isShadowOperation
      expect(multiCurrencyFields.props.isShadowOperation).toBe(true);
    });
  });

  describe('Conditional Rendering Based on Props', () => {
    it('should render type selector when showTypeSelector is true', () => {
      const props = {
        ...defaultProps,
        showTypeSelector: true,
      };

      const { getByText } = render(<OperationFormFields {...props} />);

      // Type selector buttons should be visible
      expect(getByText('Expense')).toBeTruthy();
      expect(getByText('Income')).toBeTruthy();
      expect(getByText('Transfer')).toBeTruthy();
    });

    it('should not render type selector when showTypeSelector is false', () => {
      const props = {
        ...defaultProps,
        showTypeSelector: false,
      };

      const { queryByText } = render(<OperationFormFields {...props} />);

      // Type selector buttons should NOT be visible
      expect(queryByText('Expense')).toBeNull();
      expect(queryByText('Income')).toBeNull();
      expect(queryByText('Transfer')).toBeNull();
    });

    it('should render Calculator component', () => {
      const { UNSAFE_getByType } = render(<OperationFormFields {...defaultProps} />);

      const calculator = UNSAFE_getByType('Calculator');
      expect(calculator).toBeTruthy();
      expect(calculator.props.value).toBe('100');
      expect(calculator.props.onValueChange).toBe(defaultProps.onAmountChange);
      expect(calculator.props.placeholder).toBe('amount');
    });
  });

  describe('Category Picker Visibility', () => {
    it('should show category picker for expense type', () => {
      const props = {
        ...defaultProps,
        values: {
          ...defaultProps.values,
          type: 'expense',
          categoryId: 'cat1',
        },
      };

      const { getByText } = render(<OperationFormFields {...props} />);

      // Category picker should show category name
      expect(getByText('Food')).toBeTruthy();
    });

    it('should show category picker for income type', () => {
      const props = {
        ...defaultProps,
        values: {
          ...defaultProps.values,
          type: 'income',
          categoryId: 'cat2',
        },
      };

      const { getByText } = render(<OperationFormFields {...props} />);

      // Category picker should show category name
      expect(getByText('Salary')).toBeTruthy();
    });

    it('should hide category picker for transfer type', () => {
      const props = {
        ...defaultProps,
        values: {
          ...defaultProps.values,
          type: 'transfer',
          categoryId: '',
          toAccountId: '2',
        },
      };

      const { queryByText } = render(<OperationFormFields {...props} />);

      // Category names should not be visible
      expect(queryByText('Food')).toBeNull();
      expect(queryByText('Salary')).toBeNull();
    });
  });

  describe('Transfer Layout', () => {
    it('should use stacked layout by default', () => {
      const props = {
        ...defaultProps,
        values: {
          type: 'transfer',
          amount: '100',
          accountId: '1',
          toAccountId: '2',
          categoryId: '',
        },
        transferLayout: 'stacked',
      };

      const { getByText } = render(<OperationFormFields {...props} />);

      // Should show both account names in stacked layout
      expect(getByText('USD Account')).toBeTruthy();
      expect(getByText(/EUR Account/)).toBeTruthy();
    });

    it('should use side-by-side layout when specified', () => {
      const props = {
        ...defaultProps,
        values: {
          type: 'transfer',
          amount: '100',
          accountId: '1',
          toAccountId: '2',
          categoryId: '',
        },
        transferLayout: 'sideBySide',
      };

      const { getByText } = render(<OperationFormFields {...props} />);

      // Should show both account names in side-by-side layout
      expect(getByText('USD Account')).toBeTruthy();
      expect(getByText('EUR Account')).toBeTruthy();
    });
  });

  describe('Account Balance Display', () => {
    it('should show account balance when showAccountBalance is true', () => {
      const props = {
        ...defaultProps,
        showAccountBalance: true,
      };

      const { getByText } = render(<OperationFormFields {...props} />);

      // Balance should be visible
      expect(getByText('$1000')).toBeTruthy();
    });

    it('should not show account balance when showAccountBalance is false', () => {
      const props = {
        ...defaultProps,
        showAccountBalance: false,
      };

      const { queryByText } = render(<OperationFormFields {...props} />);

      // Balance should NOT be visible
      expect(queryByText('$1000')).toBeNull();
    });
  });

  describe('Regression: Multi-Currency Data Consistency', () => {
    it('should correctly identify accounts by ID for multi-currency detection', () => {
      const props = {
        ...defaultProps,
        values: {
          type: 'transfer',
          amount: '100',
          accountId: '1', // USD Account
          toAccountId: '2', // EUR Account
          categoryId: '',
          exchangeRate: '1.2',
          destinationAmount: '120',
        },
        onExchangeRateChange: jest.fn(),
        onDestinationAmountChange: jest.fn(),
      };

      const { UNSAFE_getByType } = render(<OperationFormFields {...props} />);

      const multiCurrencyFields = UNSAFE_getByType('MultiCurrencyFields');

      // Verify correct accounts were found
      expect(multiCurrencyFields.props.sourceAccount.id).toBe('1');
      expect(multiCurrencyFields.props.sourceAccount.currency).toBe('USD');
      expect(multiCurrencyFields.props.destinationAccount.id).toBe('2');
      expect(multiCurrencyFields.props.destinationAccount.currency).toBe('EUR');
    });

    it('should handle account switching correctly for multi-currency detection', () => {
      const props = {
        ...defaultProps,
        values: {
          type: 'transfer',
          amount: '100',
          accountId: '2', // EUR Account (switched)
          toAccountId: '1', // USD Account (switched)
          categoryId: '',
          exchangeRate: '0.83',
          destinationAmount: '83',
        },
        onExchangeRateChange: jest.fn(),
        onDestinationAmountChange: jest.fn(),
      };

      const { UNSAFE_getByType } = render(<OperationFormFields {...props} />);

      const multiCurrencyFields = UNSAFE_getByType('MultiCurrencyFields');

      // Verify accounts are correctly identified after switching
      expect(multiCurrencyFields.props.sourceAccount.id).toBe('2');
      expect(multiCurrencyFields.props.sourceAccount.currency).toBe('EUR');
      expect(multiCurrencyFields.props.destinationAccount.id).toBe('1');
      expect(multiCurrencyFields.props.destinationAccount.currency).toBe('USD');
    });
  });
});
