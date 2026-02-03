/**
 * ChartModal Component Tests
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ChartModal from '../../../app/components/graphs/ChartModal';

// Mock MaterialCommunityIcons
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const PropTypes = require('prop-types');
  function MockIcon({ name, testID }) {
    return React.createElement(Text, { testID: testID || `icon-${name}` }, name);
  }
  MockIcon.propTypes = { name: PropTypes.string, size: PropTypes.number, color: PropTypes.string, testID: PropTypes.string };
  return { MaterialCommunityIcons: MockIcon };
});

// Mock layout constants
jest.mock('../../../app/styles/layout', () => ({
  HORIZONTAL_PADDING: 16,
}));

// Mock SimplePicker
jest.mock('../../../app/components/SimplePicker', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const PropTypes = require('prop-types');
  function MockSimplePicker({ value, onValueChange, items }) {
    return React.createElement(View, { testID: 'simple-picker' },
      React.createElement(Text, null, `Picker: ${value}`),
    );
  }
  MockSimplePicker.propTypes = { value: PropTypes.string, onValueChange: PropTypes.func, items: PropTypes.array, colors: PropTypes.object };
  return MockSimplePicker;
});

// Mock ExpensePieChart
jest.mock('../../../app/components/graphs/ExpensePieChart', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const PropTypes = require('prop-types');
  function MockExpensePieChart({ loading, chartData, selectedCategory }) {
    return React.createElement(View, { testID: 'expense-pie-chart' },
      React.createElement(Text, null, loading ? 'Loading...' : `Expense Chart: ${chartData.length} items`),
    );
  }
  MockExpensePieChart.propTypes = { colors: PropTypes.object, t: PropTypes.func, loading: PropTypes.bool, chartData: PropTypes.array, selectedCurrency: PropTypes.string, onLegendItemPress: PropTypes.func, selectedCategory: PropTypes.string };
  return MockExpensePieChart;
});

// Mock IncomePieChart
jest.mock('../../../app/components/graphs/IncomePieChart', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const PropTypes = require('prop-types');
  function MockIncomePieChart({ loadingIncome, incomeChartData, selectedIncomeCategory }) {
    return React.createElement(View, { testID: 'income-pie-chart' },
      React.createElement(Text, null, loadingIncome ? 'Loading...' : `Income Chart: ${incomeChartData.length} items`),
    );
  }
  MockIncomePieChart.propTypes = { colors: PropTypes.object, t: PropTypes.func, loadingIncome: PropTypes.bool, incomeChartData: PropTypes.array, selectedCurrency: PropTypes.string, onLegendItemPress: PropTypes.func, selectedIncomeCategory: PropTypes.string };
  return MockIncomePieChart;
});

describe('ChartModal', () => {
  const defaultColors = {
    surface: '#FFFFFF',
    background: '#F5F5F5',
    text: '#000000',
    primary: '#6200EE',
    border: '#E0E0E0',
  };

  const mockT = (key) => {
    const translations = {
      expenses_by_category: 'Expenses by Category',
      income_by_category: 'Income by Category',
      close: 'Close',
      back: 'Back',
    };
    return translations[key] || key;
  };

  const mockCategories = [
    { id: 'cat-1', name: 'Food', parentId: null },
    { id: 'cat-2', name: 'Restaurant', parentId: 'cat-1' },
    { id: 'cat-3', name: 'Transport', parentId: null },
  ];

  const defaultProps = {
    visible: true,
    modalType: 'expense',
    colors: defaultColors,
    t: mockT,
    onClose: jest.fn(),
    selectedCategory: 'all',
    selectedIncomeCategory: 'all',
    categoryItems: [
      { label: 'All', value: 'all' },
      { label: 'Food', value: 'cat-1' },
    ],
    incomeCategoryItems: [
      { label: 'All', value: 'all' },
      { label: 'Salary', value: 'inc-1' },
    ],
    onCategoryChange: jest.fn(),
    onIncomeCategoryChange: jest.fn(),
    categories: mockCategories,
    loading: false,
    chartData: [{ name: 'Food', value: 100 }],
    selectedCurrency: 'USD',
    onExpenseLegendItemPress: jest.fn(),
    loadingIncome: false,
    incomeChartData: [{ name: 'Salary', value: 500 }],
    onIncomeLegendItemPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders when visible is true', () => {
      const { getByText } = render(<ChartModal {...defaultProps} />);
      expect(getByText('Expenses by Category')).toBeTruthy();
    });

    it('does not render content when visible is false', () => {
      const { queryByText } = render(<ChartModal {...defaultProps} visible={false} />);
      expect(queryByText('Expenses by Category')).toBeNull();
    });

    it('renders close button', () => {
      const { getByText } = render(<ChartModal {...defaultProps} />);
      expect(getByText('Close')).toBeTruthy();
    });

    it('calls onClose when close button is pressed', () => {
      const onClose = jest.fn();
      const { getByText } = render(<ChartModal {...defaultProps} onClose={onClose} />);

      fireEvent.press(getByText('Close'));

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Expense mode', () => {
    it('renders expense chart title', () => {
      const { getByText } = render(<ChartModal {...defaultProps} modalType="expense" />);
      expect(getByText('Expenses by Category')).toBeTruthy();
    });

    it('renders ExpensePieChart component', () => {
      const { getByTestId } = render(<ChartModal {...defaultProps} modalType="expense" />);
      expect(getByTestId('expense-pie-chart')).toBeTruthy();
    });

    it('does not render IncomePieChart in expense mode', () => {
      const { queryByTestId } = render(<ChartModal {...defaultProps} modalType="expense" />);
      expect(queryByTestId('income-pie-chart')).toBeNull();
    });

    it('does not show category picker when viewing "all"', () => {
      const { queryByTestId } = render(
        <ChartModal {...defaultProps} modalType="expense" selectedCategory="all" />,
      );
      expect(queryByTestId('simple-picker')).toBeNull();
    });

    it('shows category picker when viewing specific category', () => {
      const { getByTestId } = render(
        <ChartModal {...defaultProps} modalType="expense" selectedCategory="cat-1" />,
      );
      expect(getByTestId('simple-picker')).toBeTruthy();
    });

    it('does not show back button when viewing "all"', () => {
      const { queryByTestId } = render(
        <ChartModal {...defaultProps} modalType="expense" selectedCategory="all" />,
      );
      expect(queryByTestId('icon-arrow-left')).toBeNull();
    });

    it('shows back button when viewing specific category', () => {
      const { getByTestId } = render(
        <ChartModal {...defaultProps} modalType="expense" selectedCategory="cat-1" />,
      );
      expect(getByTestId('icon-arrow-left')).toBeTruthy();
    });
  });

  describe('Income mode', () => {
    it('renders income chart title', () => {
      const { getByText } = render(<ChartModal {...defaultProps} modalType="income" />);
      expect(getByText('Income by Category')).toBeTruthy();
    });

    it('renders IncomePieChart component', () => {
      const { getByTestId } = render(<ChartModal {...defaultProps} modalType="income" />);
      expect(getByTestId('income-pie-chart')).toBeTruthy();
    });

    it('does not render ExpensePieChart in income mode', () => {
      const { queryByTestId } = render(<ChartModal {...defaultProps} modalType="income" />);
      expect(queryByTestId('expense-pie-chart')).toBeNull();
    });

    it('does not show category picker when viewing "all"', () => {
      const { queryByTestId } = render(
        <ChartModal {...defaultProps} modalType="income" selectedIncomeCategory="all" />,
      );
      expect(queryByTestId('simple-picker')).toBeNull();
    });

    it('shows category picker when viewing specific income category', () => {
      const { getByTestId } = render(
        <ChartModal {...defaultProps} modalType="income" selectedIncomeCategory="inc-1" />,
      );
      expect(getByTestId('simple-picker')).toBeTruthy();
    });

    it('shows back button when viewing specific income category', () => {
      const { getByTestId } = render(
        <ChartModal {...defaultProps} modalType="income" selectedIncomeCategory="inc-1" />,
      );
      expect(getByTestId('icon-arrow-left')).toBeTruthy();
    });
  });

  describe('Category navigation', () => {
    it('navigates to parent category when back button pressed (expense)', () => {
      const onCategoryChange = jest.fn();
      const { getByTestId } = render(
        <ChartModal
          {...defaultProps}
          modalType="expense"
          selectedCategory="cat-2" // Has parent cat-1
          onCategoryChange={onCategoryChange}
        />,
      );

      // Find and press the back button
      const backButton = getByTestId('icon-arrow-left').parent;
      fireEvent.press(backButton);

      expect(onCategoryChange).toHaveBeenCalledWith('cat-1');
    });

    it('navigates to "all" when category has no parent (expense)', () => {
      const onCategoryChange = jest.fn();
      const { getByTestId } = render(
        <ChartModal
          {...defaultProps}
          modalType="expense"
          selectedCategory="cat-1" // Has no parent (parentId: null)
          onCategoryChange={onCategoryChange}
        />,
      );

      const backButton = getByTestId('icon-arrow-left').parent;
      fireEvent.press(backButton);

      expect(onCategoryChange).toHaveBeenCalledWith('all');
    });

    it('navigates to "all" when category not found (expense)', () => {
      const onCategoryChange = jest.fn();
      const { getByTestId } = render(
        <ChartModal
          {...defaultProps}
          modalType="expense"
          selectedCategory="non-existent"
          onCategoryChange={onCategoryChange}
        />,
      );

      const backButton = getByTestId('icon-arrow-left').parent;
      fireEvent.press(backButton);

      expect(onCategoryChange).toHaveBeenCalledWith('all');
    });

    it('navigates to parent category when back button pressed (income)', () => {
      const onIncomeCategoryChange = jest.fn();
      const categoriesWithIncome = [
        ...mockCategories,
        { id: 'inc-1', name: 'Salary', parentId: null },
        { id: 'inc-2', name: 'Bonus', parentId: 'inc-1' },
      ];

      const { getByTestId } = render(
        <ChartModal
          {...defaultProps}
          modalType="income"
          selectedIncomeCategory="inc-2"
          categories={categoriesWithIncome}
          onIncomeCategoryChange={onIncomeCategoryChange}
        />,
      );

      const backButton = getByTestId('icon-arrow-left').parent;
      fireEvent.press(backButton);

      expect(onIncomeCategoryChange).toHaveBeenCalledWith('inc-1');
    });

    it('stays at "all" when getParentCategoryId is called with "all"', () => {
      const onCategoryChange = jest.fn();
      // This tests the edge case where selectedCategory is already 'all'
      // but back button is somehow visible (shouldn't happen in practice)
      const { queryByTestId } = render(
        <ChartModal
          {...defaultProps}
          modalType="expense"
          selectedCategory="all"
          onCategoryChange={onCategoryChange}
        />,
      );

      // Back button should not be visible when viewing "all"
      expect(queryByTestId('icon-arrow-left')).toBeNull();
    });
  });

  describe('Loading states', () => {
    it('shows loading state for expense chart', () => {
      const { getByText } = render(
        <ChartModal {...defaultProps} modalType="expense" loading={true} />,
      );
      expect(getByText('Loading...')).toBeTruthy();
    });

    it('shows loading state for income chart', () => {
      const { getByText } = render(
        <ChartModal {...defaultProps} modalType="income" loadingIncome={true} />,
      );
      expect(getByText('Loading...')).toBeTruthy();
    });
  });

  describe('Chart data display', () => {
    it('displays expense chart data count', () => {
      const { getByText } = render(
        <ChartModal
          {...defaultProps}
          modalType="expense"
          chartData={[{ name: 'A', value: 1 }, { name: 'B', value: 2 }]}
        />,
      );
      expect(getByText('Expense Chart: 2 items')).toBeTruthy();
    });

    it('displays income chart data count', () => {
      const { getByText } = render(
        <ChartModal
          {...defaultProps}
          modalType="income"
          incomeChartData={[{ name: 'A', value: 1 }, { name: 'B', value: 2 }, { name: 'C', value: 3 }]}
        />,
      );
      expect(getByText('Income Chart: 3 items')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('has accessibility role on close button', () => {
      const { getByLabelText } = render(<ChartModal {...defaultProps} />);
      const closeButton = getByLabelText('Close');
      expect(closeButton.props.accessibilityRole).toBe('button');
    });

    it('has accessibility label on back button', () => {
      const { getByLabelText } = render(
        <ChartModal {...defaultProps} modalType="expense" selectedCategory="cat-1" />,
      );
      const backButton = getByLabelText('Back');
      expect(backButton).toBeTruthy();
    });

    it('has accessibility hint on back button', () => {
      const { getByLabelText } = render(
        <ChartModal {...defaultProps} modalType="expense" selectedCategory="cat-1" />,
      );
      const backButton = getByLabelText('Back');
      expect(backButton.props.accessibilityHint).toBe('Returns to parent category level');
    });
  });

  describe('Modal interaction', () => {
    it('closes modal when tapping outside the modal content', () => {
      const onClose = jest.fn();
      const { getByTestId } = render(<ChartModal {...defaultProps} onClose={onClose} />);

      // Find the modal overlay (TouchableWithoutFeedback)
      const overlay = getByTestId('modal-overlay');
      fireEvent.press(overlay);

      expect(onClose).toHaveBeenCalled();
    });

    it('does not close modal when tapping inside the modal content wrapper', () => {
      const onClose = jest.fn();
      const { getByTestId } = render(<ChartModal {...defaultProps} onClose={onClose} />);

      // Find the inner TouchableWithoutFeedback (prevents bubbling)
      const modalContentWrapper = getByTestId('modal-content-wrapper');
      fireEvent.press(modalContentWrapper);

      // Should not close because the inner TouchableWithoutFeedback prevents bubbling
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
