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
  LineChart: 'LineChart',
}));

describe('CategorySpendingCard', () => {
  const defaultColors = {
    text: '#000000',
    mutedText: '#888888',
    primary: '#4CAF50',
    border: '#CCCCCC',
    altRow: '#F5F5F5',
    surface: '#FFFFFF',
    selected: '#E0E0E0',
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
    it('renders category picker button with selected category name', () => {
      const { getByText } = render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Should show the selected category name in the picker button
      expect(getByText('Food')).toBeTruthy();
    });

    it('renders LineChart with 12 months', () => {
      const { UNSAFE_getByType } = render(
        <CategorySpendingCard {...defaultProps} />,
      );

      const barChart = UNSAFE_getByType('LineChart');
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
      // Should not render LineChart
      expect(UNSAFE_queryByType('LineChart')).toBeFalsy();
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
    it('opens picker modal when button is pressed', () => {
      const { getByText, queryByText } = render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Initially modal content should not be visible (parent categories in modal)
      // The selected category "Food" is visible in the button, but not the full list
      const pickerButton = getByText('Food');
      fireEvent.press(pickerButton);

      // After pressing, modal should show parent categories
      // Transport should appear in the modal list
      expect(queryByText('Transport')).toBeTruthy();
    });

    it('calls onCategoryChange when category is selected', () => {
      const onCategoryChange = jest.fn();

      const { getByText, getAllByText } = render(
        <CategorySpendingCard
          {...defaultProps}
          onCategoryChange={onCategoryChange}
        />,
      );

      // Open the picker
      fireEvent.press(getByText('Food'));

      // Select Transport
      const transportItems = getAllByText('Transport');
      fireEvent.press(transportItems[transportItems.length - 1]); // Press the one in the modal

      expect(onCategoryChange).toHaveBeenCalledWith('cat-transport');
    });

    it('defaults to first parent category if none selected', () => {
      const { getByText } = render(
        <CategorySpendingCard
          {...defaultProps}
          selectedCategory={null}
        />,
      );

      // Should show Food as the default selection (first parent expense category)
      expect(getByText('Food')).toBeTruthy();
    });

    it('shows expand icon for categories with children', () => {
      const { getByText, UNSAFE_getAllByType } = render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Open the picker
      fireEvent.press(getByText('Food'));

      // Food has children, so there should be chevron icons
      const icons = UNSAFE_getAllByType('Icon');
      const chevronIcons = icons.filter(icon =>
        icon.props.name === 'chevron-right' || icon.props.name === 'chevron-down',
      );
      expect(chevronIcons.length).toBeGreaterThan(0);
    });

    it('collapses previous parent when expanding another one', () => {
      // Categories with two parents that have children
      const categoriesWithTwoParents = [
        { id: 'cat-food', name: 'Food', parentId: null, categoryType: 'expense', isShadow: false },
        { id: 'cat-groceries', name: 'Groceries', parentId: 'cat-food', categoryType: 'expense', isShadow: false },
        { id: 'cat-transport', name: 'Transport', parentId: null, categoryType: 'expense', isShadow: false },
        { id: 'cat-gas', name: 'Gas', parentId: 'cat-transport', categoryType: 'expense', isShadow: false },
      ];

      const { getByText, queryByText, UNSAFE_getAllByType } = render(
        <CategorySpendingCard
          {...defaultProps}
          categories={categoriesWithTwoParents}
        />,
      );

      // Open the picker
      fireEvent.press(getByText('Food'));

      // Find and click the expand chevron for Food
      const icons = UNSAFE_getAllByType('Icon');
      const foodChevron = icons.find(icon =>
        icon.props.name === 'chevron-right' &&
        icon.parent?.parent?.props?.style?.[0]?.flexDirection === 'row',
      );

      // Click the first chevron-right to expand Food
      const chevronButtons = icons.filter(icon => icon.props.name === 'chevron-right');
      if (chevronButtons.length > 0) {
        // Find the touchable parent of the first chevron
        fireEvent.press(chevronButtons[0].parent);
      }

      // Groceries should now be visible (Food is expanded)
      expect(queryByText('Groceries')).toBeTruthy();
      // Gas should not be visible (Transport is collapsed)
      expect(queryByText('Gas')).toBeFalsy();

      // Now expand Transport by clicking its chevron
      const updatedIcons = UNSAFE_getAllByType('Icon');
      const transportChevrons = updatedIcons.filter(icon => icon.props.name === 'chevron-right');
      if (transportChevrons.length > 0) {
        fireEvent.press(transportChevrons[0].parent);
      }

      // Gas should now be visible (Transport is expanded)
      expect(queryByText('Gas')).toBeTruthy();
      // Groceries should no longer be visible (Food collapsed automatically)
      expect(queryByText('Groceries')).toBeFalsy();
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
        ...defaultColors,
        expense: undefined,
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
    it('passes correct data to LineChart', () => {
      const { UNSAFE_getByType } = render(
        <CategorySpendingCard {...defaultProps} />,
      );

      const barChart = UNSAFE_getByType('LineChart');

      expect(barChart.props.data.datasets[0].data).toEqual(
        defaultMonthlyData.map(item => item.total),
      );
    });

    it('uses correct chart dimensions', () => {
      const { UNSAFE_getByType } = render(
        <CategorySpendingCard {...defaultProps} />,
      );

      const barChart = UNSAFE_getByType('LineChart');

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
        'cat-transport',
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
