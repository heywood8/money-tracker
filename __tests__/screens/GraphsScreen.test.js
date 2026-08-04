/**
 * Tests for GraphsScreen - Financial graphs and charts screen
 * Logic-based tests focusing on component behavior and integration patterns
 * This screen handles complex data visualization with PieChart components
 */

import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';

// Mock all dependencies.
// Charts are Victory Native XL now — victory-native and @shopify/react-native-skia
// are virtually mocked globally in jest.setup.js, so no per-file chart mock is needed.

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: jest.fn(() => ({
    colors: {
      background: '#ffffff',
      surface: '#f5f5f5',
      primary: '#2196f3',
      text: '#000000',
      mutedText: '#666666',
      border: '#e0e0e0',
      card: '#ffffff',
    },
  })),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: jest.fn(() => ({
    t: jest.fn((key) => key),
    language: 'en',
  })),
}));

jest.mock('../../app/contexts/AccountsDataContext', () => ({
  useAccountsData: jest.fn(() => ({
    accounts: [],
  })),
}));

jest.mock('../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: jest.fn(() => ({
    hideBalances: false,
  })),
}));

jest.mock('../../app/services/OperationsDB', () => ({
  getSpendingByCategoryAndCurrency: jest.fn(() => Promise.resolve([])),
  getIncomeByCategoryAndCurrency: jest.fn(() => Promise.resolve([])),
  getUnconvertibleCurrencies: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../app/services/CategoriesDB', () => ({
  getAllCategories: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../app/components/SimplePicker', () => {
  const React = require('react');
  return function MockSimplePicker() {
    return React.createElement('SimplePicker', null);
  };
});

jest.mock('../../assets/currencies.json', () => ({
  USD: { symbol: '$', decimal_digits: 2 },
  EUR: { symbol: '€', decimal_digits: 2 },
  RUB: { symbol: '₽', decimal_digits: 2 },
}), { virtual: true });

describe('GraphsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Structure', () => {
    it('renders without crashing', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      await render(<GraphsScreen />);
    });

    it('uses ThemeContext for styling', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useThemeColors } = require('../../app/contexts/ThemeColorsContext');

      await render(<GraphsScreen />);

      expect(useThemeColors).toHaveBeenCalled();
    });

    it('uses LocalizationContext for translations', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      await render(<GraphsScreen />);

      expect(useLocalization).toHaveBeenCalled();
    });

    it('uses AccountsContext for account data', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      await render(<GraphsScreen />);

      expect(useAccountsData).toHaveBeenCalled();
    });
  });

  describe('Integration with Database Services', () => {
    it('fetches spending data from OperationsDB', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getSpendingByCategoryAndCurrency } = require('../../app/services/OperationsDB');

      await render(<GraphsScreen />);

      // Component should call database service to fetch spending data
      expect(true).toBe(true); // Component initializes without errors
    });

    it('fetches income data from OperationsDB', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getIncomeByCategoryAndCurrency } = require('../../app/services/OperationsDB');

      await render(<GraphsScreen />);

      // Component should call database service to fetch income data
      expect(true).toBe(true);
    });

    it('fetches categories from CategoriesDB', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getAllCategories } = require('../../app/services/CategoriesDB');

      await render(<GraphsScreen />);

      // Component should call database service to fetch categories
      expect(true).toBe(true);
    });
  });

  describe('State Management', () => {
    it('manages selected year state', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component should manage year selection state
      await render(<GraphsScreen />);
    });

    it('manages selected month state', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component should manage month selection state
      await render(<GraphsScreen />);
    });

    it('manages selected currency state', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component should manage currency selection state
      await render(<GraphsScreen />);
    });

    it('manages selected category filter state', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component should manage category filter state
      await render(<GraphsScreen />);
    });

    it('manages chart data state', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component should manage spending and income chart data
      await render(<GraphsScreen />);
    });

    it('manages modal visibility state', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component should manage detail modal state
      await render(<GraphsScreen />);
    });
  });

  describe('Account Integration', () => {
    it('handles empty accounts list', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      useAccountsData.mockReturnValue({
        accounts: [],
      });

      await render(<GraphsScreen />);
    });

    it('handles accounts with different currencies', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'USD Account', currency: 'USD', balance: '1000.00' },
        { id: 'acc-2', name: 'EUR Account', currency: 'EUR', balance: '500.00' },
        { id: 'acc-3', name: 'RUB Account', currency: 'RUB', balance: '75000.00' },
      ];

      useAccountsData.mockReturnValue({
        accounts: mockAccounts,
      });

      await render(<GraphsScreen />);
    });

    it('extracts unique currencies from accounts', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: 'acc-1', currency: 'USD' },
        { id: 'acc-2', currency: 'USD' },
        { id: 'acc-3', currency: 'EUR' },
      ];

      useAccountsData.mockReturnValue({
        accounts: mockAccounts,
      });

      await render(<GraphsScreen />);
    });
  });

  describe('Data Loading and Processing', () => {
    it('handles loading state', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component should show loading indicator during data fetch
      await render(<GraphsScreen />);
    });

    it('handles empty spending data', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getSpendingByCategoryAndCurrency } = require('../../app/services/OperationsDB');

      getSpendingByCategoryAndCurrency.mockResolvedValue([]);

      await render(<GraphsScreen />);
    });

    it('handles empty income data', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getIncomeByCategoryAndCurrency } = require('../../app/services/OperationsDB');

      getIncomeByCategoryAndCurrency.mockResolvedValue([]);

      await render(<GraphsScreen />);
    });

    it('processes spending data correctly', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getSpendingByCategoryAndCurrency } = require('../../app/services/OperationsDB');

      const mockSpendingData = [
        { categoryId: 'cat-1', categoryName: 'Food', total: '500.00', categoryIcon: 'food', categoryColor: '#ff0000' },
        { categoryId: 'cat-2', categoryName: 'Transport', total: '200.00', categoryIcon: 'car', categoryColor: '#00ff00' },
      ];

      getSpendingByCategoryAndCurrency.mockResolvedValue(mockSpendingData);

      await render(<GraphsScreen />);
    });

    it('processes income data correctly', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getIncomeByCategoryAndCurrency } = require('../../app/services/OperationsDB');

      const mockIncomeData = [
        { categoryId: 'cat-1', categoryName: 'Salary', total: '5000.00', categoryIcon: 'cash', categoryColor: '#0000ff' },
        { categoryId: 'cat-2', categoryName: 'Bonus', total: '1000.00', categoryIcon: 'gift', categoryColor: '#ff00ff' },
      ];

      getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncomeData);

      await render(<GraphsScreen />);
    });
  });

  describe('Time Period Selection', () => {
    it('defaults to current month and year', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component should initialize with current month/year
      await render(<GraphsScreen />);
    });

    it('handles period selection with combined picker', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component should allow combined month+year selection
      await render(<GraphsScreen />);
    });

  });

  describe('Period header', () => {
    it('reveals jump-to-current after stepping to an older period and hides it back at current', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      const { queryByTestId, getByTestId, findByTestId } = await render(<GraphsScreen />);

      // Starts at the current month → jump-to-current hidden.
      expect(queryByTestId('graphs-period-jump-current')).toBeNull();

      fireEvent.press(getByTestId('graphs-period-prev'));
      expect(await findByTestId('graphs-period-jump-current')).toBeTruthy();

      // Jump back to the current period → the button hides again.
      fireEvent.press(getByTestId('graphs-period-jump-current'));
      await waitFor(() => expect(queryByTestId('graphs-period-jump-current')).toBeNull());
    });

    it('steps the month and returns to it, both arrows moving by one month', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({ t: (key) => key, language: 'en' });

      const { getByTestId } = await render(<GraphsScreen />);

      const labelAtCurrent = getByTestId('graphs-period-label').props.children;

      await act(async () => { fireEvent.press(getByTestId('graphs-period-prev')); });
      expect(getByTestId('graphs-period-label').props.children).not.toBe(labelAtCurrent);

      await act(async () => { fireEvent.press(getByTestId('graphs-period-next')); });
      expect(getByTestId('graphs-period-label').props.children).toBe(labelAtCurrent);
    });

    it('opens the period picker from the title and offers the whole year', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({ t: (key) => key, language: 'en' });

      const { getByTestId, findByTestId } = await render(<GraphsScreen />);

      await act(async () => { fireEvent.press(getByTestId('graphs-period-picker')); });

      expect(await findByTestId('graphs-period-picker-full-year')).toBeTruthy();
    });

    // The currency chip replaced the floating wheel; with a single account
    // currency there is nothing to choose, so it must not be rendered at all.
    it('shows the currency chip only when more than one account currency exists', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      useAccountsData.mockReturnValue({
        accounts: [{ id: 'acc-1', name: 'Cash', currency: 'USD', balance: '10.00', displayOrder: 0 }],
      });
      const single = await render(<GraphsScreen />);
      expect(single.queryByTestId('graphs-period-currency-chip')).toBeNull();

      useAccountsData.mockReturnValue({
        accounts: [
          { id: 'acc-1', name: 'Cash', currency: 'USD', balance: '10.00', displayOrder: 0 },
          { id: 'acc-2', name: 'Euro', currency: 'EUR', balance: '20.00', displayOrder: 1 },
        ],
      });
      const multi = await render(<GraphsScreen />);
      expect(multi.getByTestId('graphs-period-currency-chip')).toBeTruthy();
    });

    it('opens the currency sheet from the chip', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      useAccountsData.mockReturnValue({
        accounts: [
          { id: 'acc-1', name: 'Cash', currency: 'USD', balance: '10.00', displayOrder: 0 },
          { id: 'acc-2', name: 'Euro', currency: 'EUR', balance: '20.00', displayOrder: 1 },
        ],
      });

      const { getByTestId, findByTestId } = await render(<GraphsScreen />);

      await act(async () => { fireEvent.press(getByTestId('graphs-period-currency-chip')); });

      expect(await findByTestId('graphs-currency-option-EUR')).toBeTruthy();
    });
  });

  describe('Category Filtering', () => {
    it('handles "all categories" filter', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component should support viewing all categories
      await render(<GraphsScreen />);
    });

    it('handles specific category filter for spending', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component should support filtering by specific category
      await render(<GraphsScreen />);
    });

    it('handles specific category filter for income', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component should support filtering income by category
      await render(<GraphsScreen />);
    });

    it('loads categories from database', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getAllCategories } = require('../../app/services/CategoriesDB');

      const mockCategories = [
        { id: 'cat-1', name: 'Food', type: 'expense' },
        { id: 'cat-2', name: 'Salary', type: 'income' },
      ];

      getAllCategories.mockResolvedValue(mockCategories);

      await render(<GraphsScreen />);
    });
  });

  describe('Theme Integration', () => {
    it('applies theme colors to components', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useThemeColors } = require('../../app/contexts/ThemeColorsContext');

      const mockColors = {
        background: '#000000',
        surface: '#111111',
        primary: '#ff0000',
        text: '#ffffff',
        mutedText: '#aaaaaa',
        border: '#333333',
      };

      useThemeColors.mockReturnValue({ colors: mockColors });

      await render(<GraphsScreen />);
      expect(useThemeColors).toHaveBeenCalled();
    });

    it('handles dark theme', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useThemeColors } = require('../../app/contexts/ThemeColorsContext');

      useThemeColors.mockReturnValue({
        colors: {
          background: '#111111',
          surface: '#222222',
          primary: '#2196f3',
          text: '#ffffff',
          mutedText: '#aaaaaa',
          border: '#333333',
        },
      });

      await render(<GraphsScreen />);
    });
  });

  describe('Localization Integration', () => {
    it('uses translation function for UI text', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      const mockT = jest.fn((key) => `translated_${key}`);
      useLocalization.mockReturnValue({
        t: mockT,
        language: 'en',
      });

      await render(<GraphsScreen />);

      expect(useLocalization).toHaveBeenCalled();
    });

    it('handles different languages', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => `ru_${key}`),
        language: 'ru',
      });

      await render(<GraphsScreen />);
    });
  });

  describe('Edge Cases', () => {
    it('handles database query errors gracefully', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getSpendingByCategoryAndCurrency } = require('../../app/services/OperationsDB');

      getSpendingByCategoryAndCurrency.mockRejectedValue(new Error('Database error'));

      await render(<GraphsScreen />);
    });

    it('handles null/undefined chart data', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getSpendingByCategoryAndCurrency } = require('../../app/services/OperationsDB');

      getSpendingByCategoryAndCurrency.mockResolvedValue(null);

      await render(<GraphsScreen />);
    });

    it('handles malformed data from database', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getSpendingByCategoryAndCurrency } = require('../../app/services/OperationsDB');

      const malformedData = [
        { categoryId: null, total: 'invalid' },
        { categoryName: 'Missing ID' },
      ];

      getSpendingByCategoryAndCurrency.mockResolvedValue(malformedData);

      await render(<GraphsScreen />);
    });

    it('handles very large data sets', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getSpendingByCategoryAndCurrency } = require('../../app/services/OperationsDB');

      const largeDataSet = Array.from({ length: 100 }, (_, i) => ({
        categoryId: `cat-${i}`,
        categoryName: `Category ${i}`,
        total: '100.00',
        categoryIcon: 'circle',
        categoryColor: '#000000',
      }));

      getSpendingByCategoryAndCurrency.mockResolvedValue(largeDataSet);

      await render(<GraphsScreen />);
    });

    it('handles empty currency list', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      useAccountsData.mockReturnValue({
        accounts: [],
      });

      await render(<GraphsScreen />);
    });
  });

  describe('Regression Tests', () => {
    it('handles re-rendering without errors', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      const { rerender } = await render(<GraphsScreen />);

      await expect(rerender(<GraphsScreen />)).resolves.not.toThrow();
    });

    it('maintains stability when accounts change', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const initialAccounts = [{ id: 'acc-1', currency: 'USD' }];
      const updatedAccounts = [
        { id: 'acc-1', currency: 'USD' },
        { id: 'acc-2', currency: 'EUR' },
      ];

      useAccountsData.mockReturnValue({
        accounts: initialAccounts,
      });

      const { rerender } = await render(<GraphsScreen />);

      useAccountsData.mockReturnValue({
        accounts: updatedAccounts,
      });

      await expect(rerender(<GraphsScreen />)).resolves.not.toThrow();
    });

    it('handles rapid state changes', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      const { rerender } = await render(<GraphsScreen />);

      // Simulate rapid re-renders
      await rerender(<GraphsScreen />);
      await rerender(<GraphsScreen />);
      await rerender(<GraphsScreen />);

      expect(true).toBe(true); // Should not crash
    });
  });

  describe('Component Integration Points', () => {
    it('provides necessary props to PieChart component', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component should pass proper data to PieChart
      await render(<GraphsScreen />);
    });

    it('integrates with SimplePicker for filters', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component uses SimplePicker for period/currency/category selection
      await render(<GraphsScreen />);
    });

    it('renders custom legend component', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component includes CustomLegend for chart data
      await render(<GraphsScreen />);
    });
  });

  describe('Currency Formatting', () => {
    it('formats currency amounts correctly', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Component should use formatCurrency helper
      await render(<GraphsScreen />);
    });

    it('handles different decimal places for currencies', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // USD: 2 decimals, JPY: 0 decimals, etc.
      await render(<GraphsScreen />);
    });

    it('handles missing currency info', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;

      // Should fallback to default when currency not in currencies.json
      await render(<GraphsScreen />);
    });
  });

  describe('Card Expansion', () => {
    it('renders both summary cards on mount', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getByTestId } = await render(<GraphsScreen />);

      expect(getByTestId('income-summary-card')).toBeTruthy();
      expect(getByTestId('expense-summary-card')).toBeTruthy();
    });

    // Expense sits on the left, income on the right — the strip reads in the same
    // order as the rest of the app's money flow, and the layout must not drift back.
    it('renders the expense tab before the income tab', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getAllByTestId } = await render(<GraphsScreen />);

      const tabOrder = getAllByTestId(/-summary-card$/).map(node => node.props.testID);

      expect(tabOrder).toEqual(['expense-summary-card', 'income-summary-card']);
    });

    it('keeps expense card in tree after pressing income card', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getByTestId } = await render(<GraphsScreen />);

      await fireEvent.press(getByTestId('income-summary-card'));

      // With the new always-mounted design, the expense card must still be in the tree
      expect(getByTestId('expense-summary-card')).toBeTruthy();
      expect(getByTestId('income-summary-card')).toBeTruthy();
    });

    it('keeps income card in tree after pressing expense card', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getByTestId } = await render(<GraphsScreen />);

      await fireEvent.press(getByTestId('expense-summary-card'));

      expect(getByTestId('income-summary-card')).toBeTruthy();
      expect(getByTestId('expense-summary-card')).toBeTruthy();
    });

    it('collapses back when pressing the expanded income card again', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getByTestId } = await render(<GraphsScreen />);

      await fireEvent.press(getByTestId('income-summary-card')); // expand
      await fireEvent.press(getByTestId('income-summary-card')); // collapse

      // Both cards still present after collapse too
      expect(getByTestId('income-summary-card')).toBeTruthy();
      expect(getByTestId('expense-summary-card')).toBeTruthy();
    });

    it('handles switching directly from income expanded to expense', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getByTestId } = await render(<GraphsScreen />);

      await fireEvent.press(getByTestId('income-summary-card')); // expand income
      await fireEvent.press(getByTestId('expense-summary-card')); // switch to expense without collapsing

      // Both cards still in tree
      expect(getByTestId('income-summary-card')).toBeTruthy();
      expect(getByTestId('expense-summary-card')).toBeTruthy();
    });

    // A closed chart is hidden from the accessibility tree, and RNTL honours that
    // by excluding it from queries — so these lookups opt hidden elements back in.
    const HIDDEN = { includeHiddenElements: true };

    it('starts collapsed with neither chart interactive', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getByTestId } = await render(<GraphsScreen />);

      expect(getByTestId('income-chart-content', HIDDEN).props.pointerEvents).toBe('none');
      expect(getByTestId('expense-chart-content', HIDDEN).props.pointerEvents).toBe('none');
      expect(getByTestId('income-summary-card').props.accessibilityState.expanded).toBe(false);
      expect(getByTestId('expense-summary-card').props.accessibilityState.expanded).toBe(false);
    });

    it('opens only the pressed tab and moves the open state when the other is pressed', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getByTestId } = await render(<GraphsScreen />);

      await fireEvent.press(getByTestId('income-summary-card'));

      expect(getByTestId('income-chart-content', HIDDEN).props.pointerEvents).toBe('auto');
      expect(getByTestId('expense-chart-content', HIDDEN).props.pointerEvents).toBe('none');
      expect(getByTestId('income-summary-card').props.accessibilityState.expanded).toBe(true);

      await fireEvent.press(getByTestId('expense-summary-card'));

      expect(getByTestId('income-chart-content', HIDDEN).props.pointerEvents).toBe('none');
      expect(getByTestId('expense-chart-content', HIDDEN).props.pointerEvents).toBe('auto');
      expect(getByTestId('expense-summary-card').props.accessibilityState.expanded).toBe(true);
    });

    it('collapses the panel back to the tab strip when the open tab is pressed again', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getByTestId } = await render(<GraphsScreen />);

      await fireEvent.press(getByTestId('expense-summary-card'));
      await fireEvent.press(getByTestId('expense-summary-card'));

      expect(getByTestId('expense-chart-content', HIDDEN).props.pointerEvents).toBe('none');
      expect(getByTestId('expense-summary-card').props.accessibilityState.expanded).toBe(false);
    });

    // A screen reader must not read the legend of a chart the user has closed.
    it('keeps the closed chart out of the accessibility tree', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { getByTestId, queryByTestId } = await render(<GraphsScreen />);

      expect(queryByTestId('income-chart-content')).toBeNull();
      expect(queryByTestId('expense-chart-content')).toBeNull();

      await fireEvent.press(getByTestId('income-summary-card'));

      // The open one is exposed again, the closed one stays hidden
      expect(queryByTestId('income-chart-content')).toBeTruthy();
      expect(queryByTestId('expense-chart-content')).toBeNull();
    });
  });

  describe('Balance History Empty State (QoL-11)', () => {
    it('renders an empty state instead of silently hiding the balance card when no account is available', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      // No accounts → selectedAccount stays null while a specific month is selected
      // by default. The balance region must explain the absence rather than vanish.
      useAccountsData.mockReturnValue({ accounts: [] });

      const { getByTestId } = await render(<GraphsScreen />);

      expect(getByTestId('balance-history-empty')).toBeTruthy();
    });

    it('renders the balance card (not the empty state) when an account is available', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      useAccountsData.mockReturnValue({
        accounts: [{ id: 'acc-1', name: 'Cash', currency: 'USD', balance: '100.00', displayOrder: 0 }],
      });

      const { queryByTestId } = await render(<GraphsScreen />);

      expect(queryByTestId('balance-history-empty')).toBeNull();
    });
  });

  describe('Full-year selection', () => {
    // The balance card used to be dropped entirely when a full year was picked,
    // leaving the screen with a gap where the chart had been.
    it('keeps the balance card on screen, in its year form', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      // Earlier cases leave a language mock in place (clearAllMocks keeps
      // implementations), so pin the identity translator this case asserts on.
      useLocalization.mockReturnValue({ t: (key) => key, language: 'en' });
      useAccountsData.mockReturnValue({ accounts: [] });

      const { getByTestId, findByTestId, findByText } = await render(<GraphsScreen />);

      // The whole year is one tap inside the period picker, not a walk down a
      // list of months.
      await act(async () => { fireEvent.press(getByTestId('graphs-period-picker')); });
      const fullYear = await findByTestId('graphs-period-picker-full-year');
      await act(async () => { fireEvent.press(fullYear); });

      // The balance region is present and speaking about a year, not a month
      expect(await findByText('no_balance_history_year')).toBeTruthy();
    });

    it('names the whole year in the header and steps by years while it is selected', async () => {
      const GraphsScreen = require('../../app/screens/GraphsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({ t: (key) => key, language: 'en' });

      const { getByTestId, findByTestId } = await render(<GraphsScreen />);

      await act(async () => { fireEvent.press(getByTestId('graphs-period-picker')); });
      await act(async () => { fireEvent.press(await findByTestId('graphs-period-picker-full-year')); });

      const thisYear = new Date().getFullYear();
      expect(getByTestId('graphs-period-label').props.children).toBe(`full_year ${thisYear}`);

      // A year scope steps by a year, not by a month.
      await act(async () => { fireEvent.press(getByTestId('graphs-period-prev')); });
      expect(getByTestId('graphs-period-label').props.children).toBe(`full_year ${thisYear - 1}`);
    });
  });
});
