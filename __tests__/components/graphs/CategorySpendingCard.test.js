import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CategorySpendingCard, { formatPctTick, formatYTick, resolveScrubIndex } from '../../../app/components/graphs/CategorySpendingCard';
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

    it('defaults to all categories if none selected', async () => {
      const { getByText } = await render(
        <CategorySpendingCard
          {...defaultProps}
          selectedCategory={null}
        />,
      );

      // No pick means the whole expense trend, not the first parent category
      expect(getByText('all_categories')).toBeTruthy();
    });

    it('offers an "all categories" row in the primary picker', async () => {
      const onCategoryChange = jest.fn();

      const { getByText, getAllByText } = await render(
        <CategorySpendingCard
          {...defaultProps}
          onCategoryChange={onCategoryChange}
        />,
      );

      await fireEvent.press(getByText('Food'));

      const allRows = getAllByText('all_categories');
      await fireEvent.press(allRows[allRows.length - 1]);

      expect(onCategoryChange).toHaveBeenCalledWith('all');
    });

    it('does not offer "all categories" in the vs picker', async () => {
      const { getByText, queryByText } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      await fireEvent.press(getByText('vs'));

      expect(queryByText('all_categories')).toBeFalsy();
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

    it('falls back to all categories when selectedCategory is invalid', async () => {
      await render(
        <CategorySpendingCard
          {...defaultProps}
          selectedCategory="non-existent"
        />,
      );

      expect(useCategoryMonthlySpending).toHaveBeenCalledWith(
        'USD',
        'all', // Falls back to the whole expense trend
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

    it('keeps both figures in text ink and lets the dots carry the series', async () => {
      // Regression: the two totals used to be painted in their series colours,
      // which made the number itself the colour-only cue.
      const { getByText, getAllByText, queryAllByText } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      await fireEvent.press(getByText('vs'));
      const transportItems = getAllByText('Transport');
      await fireEvent.press(transportItems[transportItems.length - 1]);

      const amounts = queryAllByText('$200.00');
      expect(amounts.length).toBe(2);
      amounts.forEach((node) => {
        const style = Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style) : node.props.style;
        expect(style.color).toBe(defaultColors.text);
      });
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

    it('swaps the grouped series for a stacked one in stacked mode', async () => {
      const { getByText, getAllByText, getByTestId, queryByTestId } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      await selectVsCategory({ getByText, getAllByText });

      // Side-by-side mode draws the two series through <BarGroup>...
      expect(queryByTestId('vn-bar-group')).toBeTruthy();
      expect(queryByTestId('vn-stacked-bar')).toBeFalsy();

      await fireEvent.press(getByTestId('stacked-bar-toggle-btn'));

      // ...and the toggle replaces them with a single <StackedBar>. The 0%/50%/100%
      // ticks it is scaled against are painted on the Skia canvas by Victory's
      // yAxis, so they are covered via formatPctTick below instead of by query.
      expect(getByTestId('vn-stacked-bar')).toBeTruthy();
      expect(queryByTestId('vn-bar-group')).toBeFalsy();
    });
  });

  // Victory calls these through xAxis/yAxis and renders the result on the Skia
  // canvas, where it is not reachable from the test tree — so they are exported
  // and asserted directly.
  describe('Axis formatters', () => {
    describe('formatYTick', () => {
      it('formats sub-thousand amounts as whole numbers', () => {
        expect(formatYTick(0)).toBe('0');
        expect(formatYTick(42.4)).toBe('42');
        expect(formatYTick(999)).toBe('999');
      });

      it('abbreviates thousands and millions', () => {
        expect(formatYTick(1000)).toBe('1K');
        expect(formatYTick(15400)).toBe('15K');
        expect(formatYTick(1000000)).toBe('1.0M');
        expect(formatYTick(2500000)).toBe('2.5M');
      });

      it('accepts the string values Victory may hand back', () => {
        expect(formatYTick('2000')).toBe('2K');
      });
    });

    describe('formatPctTick', () => {
      it('renders whole-percent ticks for the 100%-normalized stack', () => {
        expect(formatPctTick(0)).toBe('0%');
        expect(formatPctTick(50)).toBe('50%');
        expect(formatPctTick(100)).toBe('100%');
      });

      it('rounds fractional ticks', () => {
        expect(formatPctTick(33.333)).toBe('33%');
        expect(formatPctTick('66.7')).toBe('67%');
      });
    });
  });

  // `useAnimatedReaction` is a no-op under the Jest reanimated mock, so the
  // scrub reaction is only reachable through its exported worklet.
  describe('resolveScrubIndex', () => {
    const COUNT = 12;

    it('ignores the mount-time run, so the current month keeps the selection', () => {
      // useAnimatedReaction fires once on creation with previous === null and
      // the press state still at its x=0 initial value.
      expect(resolveScrubIndex({ active: false, x: 0 }, null, COUNT)).toBe(-1);
    });

    it('ignores every reading taken with the finger up', () => {
      expect(resolveScrubIndex({ active: false, x: 7 }, { active: true, x: 3 }, COUNT)).toBe(-1);
    });

    it('reports the pressed month once the finger goes down', () => {
      expect(resolveScrubIndex({ active: true, x: 5 }, { active: false, x: 0 }, COUNT)).toBe(5);
    });

    it('reports the leftmost month even though x never left its initial 0', () => {
      expect(resolveScrubIndex({ active: true, x: 0 }, { active: false, x: 0 }, COUNT)).toBe(0);
    });

    it('re-reports nothing while a drag stays inside one month', () => {
      expect(resolveScrubIndex({ active: true, x: 5 }, { active: true, x: 5 }, COUNT)).toBe(-1);
    });

    it('follows a drag across months', () => {
      expect(resolveScrubIndex({ active: true, x: 6 }, { active: true, x: 5 }, COUNT)).toBe(6);
    });

    it('snaps a fractional press position to the nearest month', () => {
      expect(resolveScrubIndex({ active: true, x: 4.4 }, { active: true, x: 3 }, COUNT)).toBe(4);
      expect(resolveScrubIndex({ active: true, x: 4.6 }, { active: true, x: 3 }, COUNT)).toBe(5);
    });

    it('drops positions dragged off either end of the chart', () => {
      expect(resolveScrubIndex({ active: true, x: -1 }, { active: true, x: 0 }, COUNT)).toBe(-1);
      expect(resolveScrubIndex({ active: true, x: 12 }, { active: true, x: 11 }, COUNT)).toBe(-1);
    });
  });

  describe('Regression Tests', () => {
    // Guards the resting default only — the reaction that used to override it at
    // mount is stubbed out here, and is covered by `resolveScrubIndex` above.
    it('defaults the selection to the current month, not the oldest of the 12', async () => {
      const { getByText, queryByText } = await render(
        <CategorySpendingCard {...defaultProps} />,
      );

      // Last entry of the 12-month window is the current month; its total is 200.
      expect(getByText('$200.00')).toBeTruthy();
      expect(getByText('this_month')).toBeTruthy();
      // The oldest month's total (100) must not be what the card is showing.
      expect(queryByText('$100.00')).toBeNull();
    });
  });
});
