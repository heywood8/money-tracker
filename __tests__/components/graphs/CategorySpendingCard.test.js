import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CategorySpendingCard from '../../../app/components/graphs/CategorySpendingCard';
import useCategoryMonthlySpending from '../../../app/hooks/useCategoryMonthlySpending';

// Mock the hook
jest.mock('../../../app/hooks/useCategoryMonthlySpending');

// Mock vector icons
jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'Icon',
}));

// Mock currencies
jest.mock('../../../assets/currencies.json', () => ({
  USD: { symbol: '$', decimal_digits: 2 },
  EUR: { symbol: '€', decimal_digits: 2 },
  JPY: { symbol: '¥', decimal_digits: 0 },
}));

// Mock react-native-chart-kit
jest.mock('react-native-chart-kit', () => ({
  BarChart: 'BarChart',
}));

// Mock SimplePicker
/* eslint-disable react/prop-types */
jest.mock('../../../app/components/SimplePicker', () => {
  const { View, Text, TouchableOpacity } = require('react-native');
  return function MockSimplePicker(props) {
    const { value, onValueChange, items } = props;
    return (
      <View testID="simple-picker">
        <Text testID="picker-value">{items.find(i => i.value === value)?.label || value}</Text>
        {items.map((item, index) => (
          <TouchableOpacity
            key={item.value || index}
            onPress={() => onValueChange(item.value)}
            testID={`picker-item-${item.value}`}
          >
            <Text>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };
});
/* eslint-enable react/prop-types */

describe('CategorySpendingCard', () => {
  const defaultColors = {
    text: '#000000',
    mutedText: '#888888',
    primary: '#4CAF50',
    border: '#CCCCCC',
    altRow: '#F5F5F5',
    expense: '#FF4444',
  };

  const defaultT = (key) => key;

  const defaultCategories = [
    { id: 'cat-food', name: 'Food', parentId: null, categoryType: 'expense', isShadow: false },
    { id: 'cat-groceries', name: 'Groceries', parentId: 'cat-food', categoryType: 'expense', isShadow: false },
    { id: 'cat-transport', name: 'Transport', parentId: null, categoryType: 'expense', isShadow: false },
    { id: 'cat-income', name: 'Salary', parentId: null, categoryType: 'income', isShadow: false },
    { id: 'cat-shadow', name: 'Shadow', parentId: null, categoryType: 'expense', isShadow: true },
  ];

  // Generate 12 months of mock data with yearMonth, year, month, total
  const generateMonthlyData = () => {
    const now = new Date();
    const data = [];
    const totals = [100, 150, 200, 50, 0, 300, 250, 0, 100, 75, 125, 200];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      data.push({
        yearMonth: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        year: date.getFullYear(),
        month: date.getMonth(),
        total: totals[11 - i],
      });
    }
    return data;
  };

  const defaultMonthlyData = generateMonthlyData();

  const defaultProps = {
    colors: defaultColors,
    t: defaultT,
    selectedCurrency: 'USD',
    selectedCategory: 'cat-food',
    onCategoryChange: jest.fn(),
    categories: defaultCategories,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useCategoryMonthlySpending.mockReturnValue({
      monthlyData: defaultMonthlyData,
      loading: false,
      totalYearlySpending: 1550,
      loadData: jest.fn(),
    });
  });

  describe('Rendering', () => {
    it('renders category picker with parent expense categories', () => {
      const { getAllByText, queryByText } = render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Should show parent expense categories (may appear multiple times in picker)
      expect(getAllByText('Food').length).toBeGreaterThan(0);
      expect(getAllByText('Transport').length).toBeGreaterThan(0);

      // Should not show child categories
      expect(queryByText('Groceries')).toBeFalsy();

      // Should not show income categories
      expect(queryByText('Salary')).toBeFalsy();

      // Should not show shadow categories
      expect(queryByText('Shadow')).toBeFalsy();
    });

    it('renders BarChart with 12 months', () => {
      const { UNSAFE_getByType } = render(
        <CategorySpendingCard {...defaultProps} />,
      );

      const barChart = UNSAFE_getByType('BarChart');
      expect(barChart).toBeTruthy();
      expect(barChart.props.data.labels).toHaveLength(12);
    });

    it('shows loading indicator when loading', () => {
      useCategoryMonthlySpending.mockReturnValue({
        monthlyData: [],
        loading: true,
        totalYearlySpending: 0,
        loadData: jest.fn(),
      });

      const { UNSAFE_getByType } = render(
        <CategorySpendingCard {...defaultProps} />,
      );

      const activityIndicator = UNSAFE_getByType('ActivityIndicator');
      expect(activityIndicator).toBeTruthy();
    });

    it('shows empty state when no data', () => {
      const emptyData = generateMonthlyData().map(item => ({ ...item, total: 0 }));

      useCategoryMonthlySpending.mockReturnValue({
        monthlyData: emptyData,
        loading: false,
        totalYearlySpending: 0,
        loadData: jest.fn(),
      });

      const { getByText, UNSAFE_queryByType } = render(
        <CategorySpendingCard {...defaultProps} />,
      );

      expect(getByText('no_spending_data')).toBeTruthy();
      // Should not render BarChart
      expect(UNSAFE_queryByType('BarChart')).toBeFalsy();
    });

    it('renders null when no parent expense categories', () => {
      const { toJSON } = render(
        <CategorySpendingCard
          {...defaultProps}
          categories={[
            { id: 'cat-income', name: 'Salary', parentId: null, categoryType: 'income', isShadow: false },
          ]}
        />,
      );

      expect(toJSON()).toBeNull();
    });
  });

  describe('Category Selection', () => {
    it('calls onCategoryChange when picker changes', () => {
      const onCategoryChange = jest.fn();

      const { getByTestId } = render(
        <CategorySpendingCard
          {...defaultProps}
          onCategoryChange={onCategoryChange}
        />,
      );

      fireEvent.press(getByTestId('picker-item-cat-transport'));

      expect(onCategoryChange).toHaveBeenCalledWith('cat-transport');
    });

    it('defaults to first parent category if none selected', () => {
      const { getByTestId } = render(
        <CategorySpendingCard
          {...defaultProps}
          selectedCategory={null}
        />,
      );

      // Should show Food as the default selection (first parent expense category)
      expect(getByTestId('picker-value').props.children).toBe('Food');
    });

    it('defaults to first parent category if selected category not found', () => {
      const { getByTestId } = render(
        <CategorySpendingCard
          {...defaultProps}
          selectedCategory="non-existent"
        />,
      );

      // Should fall back to first parent expense category
      expect(getByTestId('picker-value').props.children).toBe('Food');
    });
  });

  describe('Currency Formatting', () => {
    it('formats currency correctly for USD', () => {
      const { getByText } = render(
        <CategorySpendingCard {...defaultProps} />,
      );

      expect(getByText('1550.00 USD')).toBeTruthy();
    });

    it('formats currency correctly for JPY (0 decimals)', () => {
      useCategoryMonthlySpending.mockReturnValue({
        monthlyData: defaultMonthlyData,
        loading: false,
        totalYearlySpending: 5000,
        loadData: jest.fn(),
      });

      const { getByText } = render(
        <CategorySpendingCard
          {...defaultProps}
          selectedCurrency="JPY"
        />,
      );

      expect(getByText('5000 JPY')).toBeTruthy();
    });
  });

  describe('Theming', () => {
    it('applies theme colors to card', () => {
      const customColors = {
        ...defaultColors,
        altRow: '#EEEEEE',
        border: '#AAAAAA',
      };

      const { UNSAFE_getAllByType } = render(
        <CategorySpendingCard
          {...defaultProps}
          colors={customColors}
        />,
      );

      const views = UNSAFE_getAllByType('View');
      const cardView = views[0];

      expect(cardView.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ backgroundColor: '#EEEEEE' }),
        ]),
      );
    });

    it('uses default expense color when not provided', () => {
      const colorsWithoutExpense = {
        text: '#000000',
        mutedText: '#888888',
        primary: '#4CAF50',
        border: '#CCCCCC',
        altRow: '#F5F5F5',
      };

      const { getByText } = render(
        <CategorySpendingCard
          {...defaultProps}
          colors={colorsWithoutExpense}
        />,
      );

      const totalValue = getByText('1550.00 USD');
      expect(totalValue.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ color: '#ff4444' }),
        ]),
      );
    });
  });

  describe('Chart Configuration', () => {
    it('passes correct data to BarChart', () => {
      const { UNSAFE_getByType } = render(
        <CategorySpendingCard {...defaultProps} />,
      );

      const barChart = UNSAFE_getByType('BarChart');

      expect(barChart.props.data.datasets[0].data).toEqual(
        defaultMonthlyData.map(item => item.total),
      );
    });

    it('uses correct chart dimensions', () => {
      const { UNSAFE_getByType } = render(
        <CategorySpendingCard {...defaultProps} />,
      );

      const barChart = UNSAFE_getByType('BarChart');

      expect(barChart.props.height).toBe(220);
      expect(barChart.props.fromZero).toBe(true);
    });
  });

  describe('Title and Labels', () => {
    it('displays spending trend title', () => {
      const { getByText } = render(
        <CategorySpendingCard {...defaultProps} />,
      );

      expect(getByText('category_spending_trend')).toBeTruthy();
    });

    it('displays last 12 months total label', () => {
      const { getByText } = render(
        <CategorySpendingCard {...defaultProps} />,
      );

      expect(getByText('last_12_months_total')).toBeTruthy();
    });
  });

  describe('Hook Integration', () => {
    it('passes correct parameters to hook', () => {
      render(
        <CategorySpendingCard
          {...defaultProps}
          selectedCurrency="EUR"
          selectedCategory="cat-transport"
        />,
      );

      expect(useCategoryMonthlySpending).toHaveBeenCalledWith(
        'EUR',
        'cat-transport', // effectiveCategory matches selectedCategory when valid
        defaultCategories,
      );
    });

    it('uses first category when selectedCategory is invalid', () => {
      render(
        <CategorySpendingCard
          {...defaultProps}
          selectedCategory="non-existent"
        />,
      );

      expect(useCategoryMonthlySpending).toHaveBeenCalledWith(
        'USD',
        'cat-food', // Falls back to first parent expense category
        defaultCategories,
      );
    });
  });
});
