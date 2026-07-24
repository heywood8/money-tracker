import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CategorySpendingCard from '../../../app/components/graphs/CategorySpendingCard';
import useCategoryMonthlySpending from '../../../app/hooks/useCategoryMonthlySpending';

// Mock the hook
jest.mock('../../../app/hooks/useCategoryMonthlySpending');

// Mock DisplaySettingsContext
jest.mock('../../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: jest.fn(() => ({
    hideBalances: false,
  })),
}));

// Mock vector icons (barrel + per-family subpath used by the component)
jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'Icon',
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

// Mock currencies
jest.mock('../../../assets/currencies.json', () => ({
  USD: { symbol: '$', decimal_digits: 2 },
  EUR: { symbol: '€', decimal_digits: 2 },
  JPY: { symbol: '¥', decimal_digits: 0 },
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
      loadData: jest.fn(),
    });
  });

  describe('Rendering', () => {
    it('renders category picker button with selected category name', async () => {
      const { getByText } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Should show the selected category name in the picker button
      expect(getByText('Food')).toBeTruthy();
    });

    it('renders the Victory Native bar chart with bars', async () => {
      const { getByTestId, getAllByTestId } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      expect(getByTestId('cartesian-chart')).toBeTruthy();
      expect(getAllByTestId('vn-bar').length).toBeGreaterThan(0);
    });

    it('shows loading indicator when loading', async () => {
      useCategoryMonthlySpending.mockReturnValue({
        monthlyData: [],
        loading: true,
        loadData: jest.fn(),
      });

      const { container } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      const activityIndicator = container.queryAll(n => n.type === 'ActivityIndicator')[0];
      expect(activityIndicator).toBeTruthy();
    });

    it('shows empty state when no data', async () => {
      const emptyData = generateMonthlyData().map(item => ({ ...item, total: 0 }));

      useCategoryMonthlySpending.mockReturnValue({
        monthlyData: emptyData,
        loading: false,
        loadData: jest.fn(),
      });

      const { getByText, queryByTestId } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      expect(getByText('no_spending_data')).toBeTruthy();
      expect(queryByTestId('cartesian-chart')).toBeFalsy();
    });

    it('renders null when no parent expense categories', async () => {
      const { toJSON } = await render(
        <CategorySpendingCard
          {...defaultProps}
          categories={[
            { id: 'cat-income', name: 'Salary', parentId: null, categoryType: 'income', isShadow: false },
          ]}
        />,
      );

      expect(toJSON()).toBeNull();
    });

    it('renders vs selector button with plus icon and "vs" label', async () => {
      const { getByText } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      expect(getByText('vs')).toBeTruthy();
    });
  });

  describe('Category Selection', () => {
    it('opens picker modal when button is pressed', async () => {
      const { getByText, queryByText } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Initially modal content should not be visible (parent categories in modal)
      // The selected category "Food" is visible in the button, but not the full list
      const pickerButton = getByText('Food');
      await fireEvent.press(pickerButton);

      // After pressing, modal should show parent categories
      // Transport should appear in the modal list
      expect(queryByText('Transport')).toBeTruthy();
    });

    it('calls onCategoryChange when category is selected', async () => {
      const onCategoryChange = jest.fn();

      const { getByText, getAllByText } = await render(
        <CategorySpendingCard
          {...defaultProps}
          onCategoryChange={onCategoryChange}
        />,
      );

      // Open the picker
      await fireEvent.press(getByText('Food'));

      // Select Transport
      const transportItems = getAllByText('Transport');
      await fireEvent.press(transportItems[transportItems.length - 1]); // Press the one in the modal

      expect(onCategoryChange).toHaveBeenCalledWith('cat-transport');
    });

    it('defaults to first parent category if none selected', async () => {
      const { getByText } = await render(
        <CategorySpendingCard
          {...defaultProps}
          selectedCategory={null}
        />,
      );

      // Should show Food as the default selection (first parent expense category)
      expect(getByText('Food')).toBeTruthy();
    });

    it('shows expand icon for categories with children', async () => {
      const { getByText, container } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Open the picker
      await fireEvent.press(getByText('Food'));

      // Food has children, so there should be chevron icons
      const icons = container.queryAll(n => n.type === 'Icon');
      const chevronIcons = icons.filter(icon =>
        icon.props.name === 'chevron-right' || icon.props.name === 'chevron-down',
      );
      expect(chevronIcons.length).toBeGreaterThan(0);
    });

    it('collapses previous parent when expanding another one', async () => {
      // Categories with two parents that have children
      const categoriesWithTwoParents = [
        { id: 'cat-food', name: 'Food', parentId: null, categoryType: 'expense', isShadow: false },
        { id: 'cat-groceries', name: 'Groceries', parentId: 'cat-food', categoryType: 'expense', isShadow: false },
        { id: 'cat-transport', name: 'Transport', parentId: null, categoryType: 'expense', isShadow: false },
        { id: 'cat-gas', name: 'Gas', parentId: 'cat-transport', categoryType: 'expense', isShadow: false },
      ];

      const { getByText, queryByText, container } = await render(
        <CategorySpendingCard
          {...defaultProps}
          categories={categoriesWithTwoParents}
        />,
      );

      // Open the picker
      await fireEvent.press(getByText('Food'));

      // Find and click the expand chevron for Food
      const icons = container.queryAll(n => n.type === 'Icon');

      // Click the first chevron-right to expand Food
      const chevronButtons = icons.filter(icon => icon.props.name === 'chevron-right');
      if (chevronButtons.length > 0) {
        // Find the touchable parent of the first chevron
        await fireEvent.press(chevronButtons[0].parent);
      }

      // Groceries should now be visible (Food is expanded)
      expect(queryByText('Groceries')).toBeTruthy();
      // Gas should not be visible (Transport is collapsed)
      expect(queryByText('Gas')).toBeFalsy();

      // Now expand Transport by clicking its chevron
      const updatedIcons = container.queryAll(n => n.type === 'Icon');
      const transportChevrons = updatedIcons.filter(icon => icon.props.name === 'chevron-right');
      if (transportChevrons.length > 0) {
        await fireEvent.press(transportChevrons[0].parent);
      }

      // Gas should now be visible (Transport is expanded)
      expect(queryByText('Gas')).toBeTruthy();
      // Groceries should no longer be visible (Food collapsed automatically)
      expect(queryByText('Groceries')).toBeFalsy();
    });
  });

  describe('Currency Formatting', () => {
    it('formats current month amount with currency symbol for USD', async () => {
      const { getByText } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Last month total is 200, USD symbol is $
      expect(getByText('$200.00')).toBeTruthy();
    });

    it('formats current month amount with currency symbol for JPY (0 decimals)', async () => {
      const jpyData = generateMonthlyData().map((item, i) =>
        i === 11 ? { ...item, total: 5000 } : item,
      );
      useCategoryMonthlySpending.mockReturnValue({
        monthlyData: jpyData,
        loading: false,
        loadData: jest.fn(),
      });

      const { getByText } = await render(
        <CategorySpendingCard
          {...defaultProps}
          selectedCurrency="JPY"
        />,
      );

      expect(getByText('¥5000')).toBeTruthy();
    });
  });

  describe('Theming', () => {
    it('applies theme colors to card', async () => {
      const customColors = {
        ...defaultColors,
        altRow: '#EEEEEE',
        border: '#AAAAAA',
      };

      const { container } = await render(
        <CategorySpendingCard
          {...defaultProps}
          colors={customColors}
        />,
      );

      const views = container.queryAll(n => n.type === 'View');
      const cardView = views[0];

      expect(cardView.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ backgroundColor: '#EEEEEE' }),
        ]),
      );
    });
  });

  describe('Title and Labels', () => {
    it('displays spending trend title uppercased', async () => {
      const { getByText } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      expect(getByText('CATEGORY_SPENDING_TREND')).toBeTruthy();
    });

    it('displays this_month label for current month', async () => {
      const { getByText } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      expect(getByText('this_month')).toBeTruthy();
    });
  });

  describe('when hideBalances is true', () => {
    const { useDisplaySettings } = require('../../../app/contexts/DisplaySettingsContext');

    beforeEach(() => {
      useDisplaySettings.mockReturnValue({ hideBalances: true });
    });

    afterEach(() => {
      useDisplaySettings.mockReturnValue({ hideBalances: false });
    });

    it('does not render the amount', async () => {
      const { queryByText } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      expect(queryByText('$200.00')).toBeFalsy();
    });

    it('still renders the bar chart', async () => {
      const { getByTestId } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      expect(getByTestId('cartesian-chart')).toBeTruthy();
    });
  });

  describe('Hook Integration', () => {
    it('passes correct parameters to hook', async () => {
      await render(
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
        false,
      );
    });

    it('uses first category when selectedCategory is invalid', async () => {
      await render(
        <CategorySpendingCard
          {...defaultProps}
          selectedCategory="non-existent"
        />,
      );

      expect(useCategoryMonthlySpending).toHaveBeenCalledWith(
        'USD',
        'cat-food', // Falls back to first parent expense category
        defaultCategories,
        false,
      );
    });

    it('calls hook twice: once for primary and once for vs category', async () => {
      await render(<CategorySpendingCard {...defaultProps} />);

      // Called twice per render: primary + vs (null by default)
      expect(useCategoryMonthlySpending).toHaveBeenCalledWith(
        'USD',
        'cat-food',
        defaultCategories,
        false,
      );
      expect(useCategoryMonthlySpending).toHaveBeenCalledWith(
        'USD',
        null, // No vs category selected
        defaultCategories,
        false,
      );
    });
  });

  describe('VS Category Comparison', () => {
    it('shows vs selector button by default', async () => {
      const { getByText, container } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      expect(getByText('vs')).toBeTruthy();
      const icons = container.queryAll(n => n.type === 'Icon');
      const plusIcon = icons.find(icon => icon.props.name === 'plus-circle-outline');
      expect(plusIcon).toBeTruthy();
    });

    it('opens picker in vs mode when vs selector is pressed', async () => {
      const { getByText, getAllByText } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Press the "vs" button
      await fireEvent.press(getByText('vs'));

      // Modal should open showing category list (Transport should appear)
      expect(getAllByText('Transport').length).toBeGreaterThan(0);
    });

    it('shows vs category name and amount after selection', async () => {
      const { getByText, getAllByText, queryAllByText } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Initially only one amount shown
      expect(queryAllByText('$200.00').length).toBe(1);

      // Open vs picker and select Transport
      await fireEvent.press(getByText('vs'));
      const transportItems = getAllByText('Transport');
      await fireEvent.press(transportItems[transportItems.length - 1]);

      // Now both primary and vs amounts shown (both return same mock data: $200.00)
      expect(queryAllByText('$200.00').length).toBe(2);

      // Transport name should appear in vs row
      expect(getByText('Transport')).toBeTruthy();
    });

    it('shows X button to clear vs category after selection', async () => {
      const { getByText, getAllByText, container } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Before selection: no close icon
      const initialIcons = container.queryAll(n => n.type === 'Icon');
      expect(initialIcons.find(i => i.props.name === 'close')).toBeFalsy();

      // Select a vs category
      await fireEvent.press(getByText('vs'));
      const transportItems = getAllByText('Transport');
      await fireEvent.press(transportItems[transportItems.length - 1]);

      // After selection: close icon should appear
      const updatedIcons = container.queryAll(n => n.type === 'Icon');
      expect(updatedIcons.find(i => i.props.name === 'close')).toBeTruthy();
    });

    it('clears vs category when X button is pressed', async () => {
      const { getByText, getAllByText, queryAllByText, container } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Select Transport as vs category
      await fireEvent.press(getByText('vs'));
      const transportItems = getAllByText('Transport');
      await fireEvent.press(transportItems[transportItems.length - 1]);

      // Verify two amounts are shown
      expect(queryAllByText('$200.00').length).toBe(2);

      // Press the X button to clear vs category
      const icons = container.queryAll(n => n.type === 'Icon');
      const closeIcon = icons.find(i => i.props.name === 'close');
      await fireEvent.press(closeIcon.parent);

      // Only primary amount should remain
      expect(queryAllByText('$200.00').length).toBe(1);
    });

    it('passes vs category to hook after selection', async () => {
      const { getByText, getAllByText } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Select Transport as vs category
      await fireEvent.press(getByText('vs'));
      const transportItems = getAllByText('Transport');
      await fireEvent.press(transportItems[transportItems.length - 1]);

      // Hook should now be called with Transport for vs
      expect(useCategoryMonthlySpending).toHaveBeenCalledWith(
        'USD',
        'cat-transport',
        defaultCategories,
        false,
      );
    });

    it('does not show vs amounts when hideBalances is true', async () => {
      const { useDisplaySettings } = require('../../../app/contexts/DisplaySettingsContext');
      useDisplaySettings.mockReturnValue({ hideBalances: true });

      const { getByText, getAllByText, queryAllByText } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Select a vs category
      await fireEvent.press(getByText('vs'));
      const transportItems = getAllByText('Transport');
      await fireEvent.press(transportItems[transportItems.length - 1]);

      // No amounts shown when hideBalances is true
      expect(queryAllByText('$200.00').length).toBe(0);

      useDisplaySettings.mockReturnValue({ hideBalances: false });
    });

    it('resets expanded state when opening vs picker', async () => {
      const categoriesWithChildren = [
        { id: 'cat-food', name: 'Food', parentId: null, categoryType: 'expense', isShadow: false },
        { id: 'cat-groceries', name: 'Groceries', parentId: 'cat-food', categoryType: 'expense', isShadow: false },
        { id: 'cat-transport', name: 'Transport', parentId: null, categoryType: 'expense', isShadow: false },
      ];

      const { getByText, getAllByText, queryByText, container } = await render(
        <CategorySpendingCard {...defaultProps} categories={categoriesWithChildren} />,
      );

      // Open primary picker and expand Food
      await fireEvent.press(getByText('Food'));
      const icons = container.queryAll(n => n.type === 'Icon');
      const chevrons = icons.filter(i => i.props.name === 'chevron-right');
      if (chevrons.length > 0) {
        await fireEvent.press(chevrons[0].parent);
      }
      // Close primary picker by selecting a category
      const transportItems = getAllByText('Transport');
      await fireEvent.press(transportItems[transportItems.length - 1]);

      // Open vs picker - expansion should be reset
      await fireEvent.press(getByText('vs'));
      // Groceries should NOT be visible (expansion was reset when openPicker was called)
      expect(queryByText('Groceries')).toBeFalsy();
    });
  });

  describe('Stacked Bar Toggle', () => {
    const selectVsCategory = async ({ getByText, getAllByText }) => {
      await fireEvent.press(getByText('vs'));
      const transportItems = getAllByText('Transport');
      await fireEvent.press(transportItems[transportItems.length - 1]);
    };

    it('does not show stacked toggle button when no vs category is selected', async () => {
      const { queryByTestId } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      expect(queryByTestId('stacked-bar-toggle-btn')).toBeFalsy();
    });

    it('shows stacked toggle button when vs category is active', async () => {
      const { getByText, getAllByText, getByTestId } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      await selectVsCategory({ getByText, getAllByText });

      expect(getByTestId('stacked-bar-toggle-btn')).toBeTruthy();
    });

    it('toggle button uses chart-bar-stacked icon when in side-by-side mode', async () => {
      const { getByText, getAllByText, getByTestId, container } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      await selectVsCategory({ getByText, getAllByText });

      const btn = getByTestId('stacked-bar-toggle-btn');
      expect(btn).toBeTruthy();

      const icons = container.queryAll(n => n.type === 'Icon');
      const stackedIcon = icons.find(i => i.props.name === 'chart-bar-stacked');
      expect(stackedIcon).toBeTruthy();
    });

    it('switches to chart-bar icon after toggling to stacked mode', async () => {
      const { getByText, getAllByText, getByTestId, container } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      await selectVsCategory({ getByText, getAllByText });
      await fireEvent.press(getByTestId('stacked-bar-toggle-btn'));

      const icons = container.queryAll(n => n.type === 'Icon');
      expect(icons.find(i => i.props.name === 'chart-bar')).toBeTruthy();
      expect(icons.find(i => i.props.name === 'chart-bar-stacked')).toBeFalsy();
    });

    it('pressing toggle again returns to side-by-side mode', async () => {
      const { getByText, getAllByText, getByTestId, container } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      await selectVsCategory({ getByText, getAllByText });
      await fireEvent.press(getByTestId('stacked-bar-toggle-btn'));
      await fireEvent.press(getByTestId('stacked-bar-toggle-btn'));

      const icons = container.queryAll(n => n.type === 'Icon');
      expect(icons.find(i => i.props.name === 'chart-bar-stacked')).toBeTruthy();
    });

    it('clearing vs category hides the toggle button', async () => {
      const { getByText, getAllByText, container, queryByTestId } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      await selectVsCategory({ getByText, getAllByText });
      expect(queryByTestId('stacked-bar-toggle-btn')).toBeTruthy();

      const icons = container.queryAll(n => n.type === 'Icon');
      const closeIcon = icons.find(i => i.props.name === 'close');
      await fireEvent.press(closeIcon.parent);

      expect(queryByTestId('stacked-bar-toggle-btn')).toBeFalsy();
    });

    it('clearing vs category resets stacked mode so toggle shows chart-bar-stacked next time', async () => {
      const { getByText, getAllByText, getByTestId, queryByTestId, container } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Select vs, toggle to stacked, then clear vs
      await selectVsCategory({ getByText, getAllByText });
      await fireEvent.press(getByTestId('stacked-bar-toggle-btn'));
      const icons = container.queryAll(n => n.type === 'Icon');
      const closeIcon = icons.find(i => i.props.name === 'close');
      await fireEvent.press(closeIcon.parent);

      // Re-select vs category
      await fireEvent.press(getByText('vs'));
      const transportItems = getAllByText('Transport');
      await fireEvent.press(transportItems[transportItems.length - 1]);

      // Toggle should show chart-bar-stacked (stacked mode was reset on clear)
      const updatedIcons = container.queryAll(n => n.type === 'Icon');
      expect(updatedIcons.find(i => i.props.name === 'chart-bar-stacked')).toBeTruthy();
    });

    it('renders percentage y-axis labels (0%, 25%, 50%, 75%, 100%) in stacked mode', async () => {
      const { getByText, getAllByText, getByTestId, queryByText } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      await selectVsCategory({ getByText, getAllByText });
      await fireEvent.press(getByTestId('stacked-bar-toggle-btn'));

      expect(queryByText('0%')).toBeTruthy();
      expect(queryByText('50%')).toBeTruthy();
      expect(queryByText('100%')).toBeTruthy();
    });
  });
});
