import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import OperationFormFields from '../../app/components/operations/OperationFormFields';

// Mock dependencies
jest.mock('../../app/components/Calculator', () => 'Calculator');
jest.mock('../../app/components/modals/MultiCurrencyFields', () => 'MultiCurrencyFields');

jest.mock('../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: () => ({
    hideBalances: false,
  }),
}));

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
    it('should detect multi-currency transfer when accounts have different currencies', async () => {
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

      const { container } = await render(<OperationFormFields {...props} />);

      // MultiCurrencyFields should be rendered
      const multiCurrencyFields = container.queryAll(n => n.type === 'MultiCurrencyFields')[0];
      expect(multiCurrencyFields).toBeTruthy();
    });

    it('should not detect multi-currency transfer when accounts have same currency', async () => {
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

      const { container } = await render(<OperationFormFields {...props} />);

      // MultiCurrencyFields should NOT be rendered
      const multiCurrencyFields = container.queryAll(n => n.type === 'MultiCurrencyFields')[0];
      expect(multiCurrencyFields).toBeFalsy();
    });

    it('should not show multi-currency fields for non-transfer operations', async () => {
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

      const { container } = await render(<OperationFormFields {...props} />);

      // MultiCurrencyFields should NOT be rendered for expense
      const multiCurrencyFields = container.queryAll(n => n.type === 'MultiCurrencyFields')[0];
      expect(multiCurrencyFields).toBeFalsy();
    });

    it('should not render MultiCurrencyFields if onExchangeRateChange callback is missing', async () => {
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

      const { container } = await render(<OperationFormFields {...props} />);

      // MultiCurrencyFields should NOT be rendered without callback
      const multiCurrencyFields = container.queryAll(n => n.type === 'MultiCurrencyFields')[0];
      expect(multiCurrencyFields).toBeFalsy();
    });

    it('should not render MultiCurrencyFields if onDestinationAmountChange callback is missing', async () => {
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

      const { container } = await render(<OperationFormFields {...props} />);

      // MultiCurrencyFields should NOT be rendered without callback
      const multiCurrencyFields = container.queryAll(n => n.type === 'MultiCurrencyFields')[0];
      expect(multiCurrencyFields).toBeFalsy();
    });

    it('should not render MultiCurrencyFields if source account is not found', async () => {
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

      const { container } = await render(<OperationFormFields {...props} />);

      // MultiCurrencyFields should NOT be rendered without valid source account
      const multiCurrencyFields = container.queryAll(n => n.type === 'MultiCurrencyFields')[0];
      expect(multiCurrencyFields).toBeFalsy();
    });

    it('should not render MultiCurrencyFields if destination account is not found', async () => {
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

      const { container } = await render(<OperationFormFields {...props} />);

      // MultiCurrencyFields should NOT be rendered without valid destination account
      const multiCurrencyFields = container.queryAll(n => n.type === 'MultiCurrencyFields')[0];
      expect(multiCurrencyFields).toBeFalsy();
    });
  });

  describe('MultiCurrencyFields Props', () => {
    it('should pass correct props to MultiCurrencyFields', async () => {
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

      const { container } = await render(<OperationFormFields {...props} />);

      const multiCurrencyFields = container.queryAll(n => n.type === 'MultiCurrencyFields')[0];

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

    it('should pass empty strings for undefined exchange rate and destination amount', async () => {
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

      const { container } = await render(<OperationFormFields {...props} />);

      const multiCurrencyFields = container.queryAll(n => n.type === 'MultiCurrencyFields')[0];

      // Should default to empty strings
      expect(multiCurrencyFields.props.exchangeRate).toBe('');
      expect(multiCurrencyFields.props.destinationAmount).toBe('');
    });

    it('should pass disabled state to MultiCurrencyFields as isShadowOperation', async () => {
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

      const { container } = await render(<OperationFormFields {...props} />);

      const multiCurrencyFields = container.queryAll(n => n.type === 'MultiCurrencyFields')[0];

      // disabled prop should map to isShadowOperation
      expect(multiCurrencyFields.props.isShadowOperation).toBe(true);
    });
  });

  describe('Conditional Rendering Based on Props', () => {
    it('should render type selector when showTypeSelector is true', async () => {
      const props = {
        ...defaultProps,
        showTypeSelector: true,
      };

      const { getByText } = await render(<OperationFormFields {...props} />);

      // Type selector buttons should be visible
      expect(getByText('Expense')).toBeTruthy();
      expect(getByText('Income')).toBeTruthy();
      expect(getByText('Transfer')).toBeTruthy();
    });

    it('should not render type selector when showTypeSelector is false', async () => {
      const props = {
        ...defaultProps,
        showTypeSelector: false,
      };

      const { queryByText } = await render(<OperationFormFields {...props} />);

      // Type selector buttons should NOT be visible
      expect(queryByText('Expense')).toBeNull();
      expect(queryByText('Income')).toBeNull();
      expect(queryByText('Transfer')).toBeNull();
    });

    it('should render Calculator component', async () => {
      const { container } = await render(<OperationFormFields {...defaultProps} />);

      const calculator = container.queryAll(n => n.type === 'Calculator')[0];
      expect(calculator).toBeTruthy();
      expect(calculator.props.value).toBe('100');
      expect(calculator.props.onValueChange).toBe(defaultProps.onAmountChange);
      expect(calculator.props.placeholder).toBe('amount');
    });
  });

  describe('Category Picker Visibility', () => {
    it('should show category picker for expense type', async () => {
      const props = {
        ...defaultProps,
        values: {
          ...defaultProps.values,
          type: 'expense',
          categoryId: 'cat1',
        },
      };

      const { getByText } = await render(<OperationFormFields {...props} />);

      // Category picker should show category name
      expect(getByText('Food')).toBeTruthy();
    });

    it('should show category picker for income type', async () => {
      const props = {
        ...defaultProps,
        values: {
          ...defaultProps.values,
          type: 'income',
          categoryId: 'cat2',
        },
      };

      const { getByText } = await render(<OperationFormFields {...props} />);

      // Category picker should show category name
      expect(getByText('Salary')).toBeTruthy();
    });

    it('should hide category picker for transfer type', async () => {
      const props = {
        ...defaultProps,
        values: {
          ...defaultProps.values,
          type: 'transfer',
          categoryId: '',
          toAccountId: '2',
        },
      };

      const { queryByText } = await render(<OperationFormFields {...props} />);

      // Category names should not be visible
      expect(queryByText('Food')).toBeNull();
      expect(queryByText('Salary')).toBeNull();
    });
  });

  describe('Transfer Layout', () => {
    it('should use stacked layout by default', async () => {
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

      const { getByText } = await render(<OperationFormFields {...props} />);

      // Should show both account names in stacked layout
      expect(getByText('USD Account')).toBeTruthy();
      expect(getByText(/EUR Account/)).toBeTruthy();
    });

    it('should use side-by-side layout when specified', async () => {
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

      const { getByText } = await render(<OperationFormFields {...props} />);

      // Should show both account names in side-by-side layout
      expect(getByText('USD Account')).toBeTruthy();
      expect(getByText('EUR Account')).toBeTruthy();
    });
  });

  describe('Account Balance Display', () => {
    it('should show account balance when showAccountBalance is true', async () => {
      const props = {
        ...defaultProps,
        showAccountBalance: true,
      };

      const { getByText } = await render(<OperationFormFields {...props} />);

      // Balance should be visible
      expect(getByText('$1000')).toBeTruthy();
    });

    it('should not show account balance when showAccountBalance is false', async () => {
      const props = {
        ...defaultProps,
        showAccountBalance: false,
      };

      const { queryByText } = await render(<OperationFormFields {...props} />);

      // Balance should NOT be visible
      expect(queryByText('$1000')).toBeNull();
    });
  });

  describe('Regression: Multi-Currency Data Consistency', () => {
    it('should correctly identify accounts by ID for multi-currency detection', async () => {
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

      const { container } = await render(<OperationFormFields {...props} />);

      const multiCurrencyFields = container.queryAll(n => n.type === 'MultiCurrencyFields')[0];

      // Verify correct accounts were found
      expect(multiCurrencyFields.props.sourceAccount.id).toBe('1');
      expect(multiCurrencyFields.props.sourceAccount.currency).toBe('USD');
      expect(multiCurrencyFields.props.destinationAccount.id).toBe('2');
      expect(multiCurrencyFields.props.destinationAccount.currency).toBe('EUR');
    });

    it('should handle account switching correctly for multi-currency detection', async () => {
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

      const { container } = await render(<OperationFormFields {...props} />);

      const multiCurrencyFields = container.queryAll(n => n.type === 'MultiCurrencyFields')[0];

      // Verify accounts are correctly identified after switching
      expect(multiCurrencyFields.props.sourceAccount.id).toBe('2');
      expect(multiCurrencyFields.props.sourceAccount.currency).toBe('EUR');
      expect(multiCurrencyFields.props.destinationAccount.id).toBe('1');
      expect(multiCurrencyFields.props.destinationAccount.currency).toBe('USD');
    });
  });

  describe('Category Picker Visibility', () => {
    it('hides category picker when hideCategoryPicker is true', async () => {
      const props = { ...defaultProps, hideCategoryPicker: true };
      await render(<OperationFormFields {...props} />);
    });

    it('hides category picker for transfer type', async () => {
      const props = {
        ...defaultProps,
        values: { ...defaultProps.values, type: 'transfer', toAccountId: '' },
      };
      await render(<OperationFormFields {...props} />);
    });

    it('renders placeholder when onAutoAddWithCategory is provided but no top categories', async () => {
      const props = {
        ...defaultProps,
        topCategoriesForType: [],
        onAutoAddWithCategory: jest.fn(),
        values: { ...defaultProps.values, categoryId: '' },
      };
      await render(<OperationFormFields {...props} />);
    });

    it('renders all-categories button when more than 8 leaf categories exist', async () => {
      const manyCategories = Array.from({ length: 10 }, (_, i) => ({
        id: `cat${i}`,
        name: `Category ${i}`,
        icon: 'tag',
        type: 'entry',
        categoryType: 'expense',
        isShadow: false,
      }));
      const props = {
        ...defaultProps,
        categories: manyCategories,
        topCategoriesForType: manyCategories.slice(0, 8),
        getCategoryInfo: (id) => ({ name: id, icon: 'tag', parentName: null }),
        onAutoAddWithCategory: jest.fn(),
        values: { ...defaultProps.values, categoryId: '' },
      };
      await render(<OperationFormFields {...props} />);
    });
  });

  describe('Inline All-Categories Browser', () => {
    const browseCategories = [
      { id: 'folder-food', name: 'Food', icon: 'food', type: 'folder', categoryType: 'expense' },
      { id: 'cat-groceries', name: 'Groceries', icon: 'cart', type: 'entry', categoryType: 'expense', parentId: 'folder-food' },
      { id: 'cat-restaurant', name: 'Restaurant', icon: 'silverware', type: 'entry', categoryType: 'expense', parentId: 'folder-food' },
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `root-cat-${i}`,
        name: `Root ${i}`,
        icon: 'tag',
        type: 'entry',
        categoryType: 'expense',
      })),
    ];

    const browseProps = (overrides = {}) => ({
      ...defaultProps,
      categories: browseCategories,
      topCategoriesForType: browseCategories.filter(c => c.type !== 'folder').slice(0, 8),
      getCategoryInfo: (id) => {
        const cat = browseCategories.find(c => c.id === id);
        return { name: cat?.name || 'Unknown', icon: cat?.icon || 'tag', parentName: null };
      },
      onAutoAddWithCategory: jest.fn(),
      openPicker: jest.fn(),
      values: { ...defaultProps.values, categoryId: '', amount: '' },
      ...overrides,
    });

    it('opens the inline browser instead of the bottom-sheet picker', async () => {
      const props = browseProps();
      const { getByText, getByTestId, findByTestId } = await render(<OperationFormFields {...props} />);

      // "All categories" button is present (>8 leaf categories)
      fireEvent.press(getByTestId('all-categories-button'));

      // Inline browser renders a back chip (state flushes async under concurrent React)
      expect(await findByTestId('category-browse-back')).toBeTruthy();
      // Should NOT fall back to the modal picker
      expect(props.openPicker).not.toHaveBeenCalled();
      // Root folder is shown as a chip
      expect(getByText('Food')).toBeTruthy();
    });

    it('drills into a folder and shows its children', async () => {
      const props = browseProps();
      const { getByText, queryByText, getByTestId, findByTestId } = await render(<OperationFormFields {...props} />);

      fireEvent.press(getByTestId('all-categories-button'));
      fireEvent.press(await findByTestId('category-browse-folder-food'));

      // Children of the folder are now visible
      expect(await findByTestId('category-browse-cat-groceries')).toBeTruthy();
      expect(getByText('Groceries')).toBeTruthy();
      expect(getByText('Restaurant')).toBeTruthy();
      // Root sibling no longer shown at this level
      expect(queryByText('Root 0')).toBeNull();
    });

    it('returns to the suggestions grid via the back chip', async () => {
      const props = browseProps();
      const { getByTestId, findByTestId, queryByTestId } = await render(<OperationFormFields {...props} />);

      fireEvent.press(getByTestId('all-categories-button'));
      fireEvent.press(await findByTestId('category-browse-back'));

      // Back to suggestions: the all-categories button is shown again
      expect(await findByTestId('all-categories-button')).toBeTruthy();
      await waitFor(() => expect(queryByTestId('category-browse-back')).toBeNull());
    });

    it('auto-adds a leaf category when an amount is present', async () => {
      const onAutoAddWithCategory = jest.fn();
      const props = browseProps({
        onAutoAddWithCategory,
        values: { ...defaultProps.values, categoryId: '', amount: '100' },
      });
      const { getByTestId, findByTestId } = await render(<OperationFormFields {...props} />);

      fireEvent.press(getByTestId('all-categories-button'));
      fireEvent.press(await findByTestId('category-browse-folder-food'));
      fireEvent.press(await findByTestId('category-browse-cat-groceries'));

      await waitFor(() => expect(onAutoAddWithCategory).toHaveBeenCalledWith('cat-groceries'));
    });

    it('selects a leaf category without amount via setValues', async () => {
      const setValues = jest.fn();
      const props = browseProps({
        setValues,
        onAutoAddWithCategory: jest.fn(),
        values: { ...defaultProps.values, categoryId: '', amount: '' },
      });
      const { getByTestId, findByTestId } = await render(<OperationFormFields {...props} />);

      fireEvent.press(getByTestId('all-categories-button'));
      fireEvent.press(await findByTestId('category-browse-folder-food'));
      fireEvent.press(await findByTestId('category-browse-cat-groceries'));

      await waitFor(() => expect(setValues).toHaveBeenCalled());
      expect(props.onAutoAddWithCategory).not.toHaveBeenCalled();
    });

    it('does not open an empty browser when tapped before categories load', async () => {
      const props = browseProps({
        categories: [], // still loading
        topCategoriesForType: [],
        values: { ...defaultProps.values, categoryId: '', amount: '' },
      });
      const { getByTestId, queryByTestId } = await render(<OperationFormFields {...props} />);

      // Placeholder shows the All-categories button during load
      fireEvent.press(getByTestId('all-categories-button'));

      // Browser must not open over an empty category list
      await waitFor(() => expect(queryByTestId('category-browse-back')).toBeNull());
    });

    it('falls back to the single picker when loaded but no leaf suggestions exist', async () => {
      const openPicker = jest.fn();
      const props = browseProps({
        // Loaded categories but only an (empty) folder → no leaf chips
        categories: [{ id: 'folder-empty', name: 'Empty', icon: 'folder', type: 'folder', categoryType: 'expense' }],
        topCategoriesForType: [],
        openPicker,
        getCategoryName: () => 'select_category',
        values: { ...defaultProps.values, categoryId: '', amount: '' },
      });
      const { getByText, queryByTestId } = await render(<OperationFormFields {...props} />);

      // No blurred placeholder loop; a functional single picker is shown instead
      expect(queryByTestId('all-categories-button')).toBeNull();
      fireEvent.press(getByText('select_category'));
      expect(openPicker).toHaveBeenCalledWith('category', props.categories);
    });
  });

  describe('Category Error Flash Animation', () => {
    const mockTopCategories = [
      { id: 'cat1', name: 'Food', icon: 'food', type: 'entry', categoryType: 'expense' },
      { id: 'cat2', name: 'Transport', icon: 'car', type: 'entry', categoryType: 'expense' },
    ];
    const getCategoryInfo = (id) => {
      const cat = mockTopCategories.find(c => c.id === id);
      return { name: cat?.name || 'Unknown', icon: cat?.icon || 'tag', parentName: null };
    };

    it('renders category chips without error when flashCategoryError is 0', async () => {
      const props = {
        ...defaultProps,
        topCategoriesForType: mockTopCategories,
        getCategoryInfo,
        values: { ...defaultProps.values, categoryId: '' },
      };
      await render(<OperationFormFields {...props} />);
    });

    it('triggers flash animation branch when flashCategoryError is non-zero', async () => {
      const props = {
        ...defaultProps,
        topCategoriesForType: mockTopCategories,
        getCategoryInfo,
        values: { ...defaultProps.values, categoryId: '' },
        flashCategoryError: 1,
      };
      await render(<OperationFormFields {...props} />);
    });

    it('re-triggers animation when flashCategoryError increments again', async () => {
      const props = {
        ...defaultProps,
        topCategoriesForType: mockTopCategories,
        getCategoryInfo,
        values: { ...defaultProps.values, categoryId: '' },
        flashCategoryError: 0,
      };
      const { rerender } = await render(<OperationFormFields {...props} />);
      expect(() => rerender(<OperationFormFields {...props} flashCategoryError={1} />)).not.toThrow();
      expect(() => rerender(<OperationFormFields {...props} flashCategoryError={2} />)).not.toThrow();
    });
  });
});
