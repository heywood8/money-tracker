import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import TrendsCard, { formatPctTick, formatYTick, resolveScrollTarget, resolveTapIndex } from '../../../app/components/graphs/TrendsCard';
import useMonthlyTrendSeries from '../../../app/hooks/useMonthlyTrendSeries';

// Mock the hook
jest.mock('../../../app/hooks/useMonthlyTrendSeries');

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

describe('TrendsCard', () => {
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

  // `type` is the folder/entry marker the shared grid drills on, so the fixtures
  // carry it exactly as the categories table does.
  const defaultCategories = [
    { id: 'cat-food', name: 'Food', type: 'folder', parentId: null, categoryType: 'expense', isShadow: false },
    { id: 'cat-groceries', name: 'Groceries', type: 'entry', parentId: 'cat-food', categoryType: 'expense', isShadow: false },
    { id: 'cat-transport', name: 'Transport', type: 'entry', parentId: null, categoryType: 'expense', isShadow: false },
    { id: 'cat-salary', name: 'Salary', type: 'entry', parentId: null, categoryType: 'income', isShadow: false },
    { id: 'cat-shadow', name: 'Shadow', type: 'entry', parentId: null, categoryType: 'expense', isShadow: true },
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
    selectedSeries: null,
    onSeriesChange: jest.fn(),
    categories: defaultCategories,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useMonthlyTrendSeries.mockReturnValue({
      monthlyData: defaultMonthlyData,
      loading: false,
      loadData: jest.fn(),
    });
  });

  describe('Rendering', () => {
    it('opens on income against expenses without a pick being made', async () => {
      const { getByText } = await render(
        <TrendsCard {...defaultProps} />,
      );

      // The card's whole point: the two sides of the ledger, side by side, with
      // no drill-down asked of the user first.
      expect(getByText('all_income')).toBeTruthy();
      expect(getByText('all_expenses')).toBeTruthy();
      expect(getByText('vs')).toBeTruthy();
    });

    it('renders the Victory Native bar chart with bars', async () => {
      const { getByTestId, getAllByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      expect(getByTestId('trend-chart-canvas')).toBeTruthy();
      expect(getAllByTestId('vn-bar-group').length).toBeGreaterThan(0);
    });

    it('shows loading indicator when loading', async () => {
      useMonthlyTrendSeries.mockReturnValue({
        monthlyData: [],
        loading: true,
        loadData: jest.fn(),
      });

      const { container } = await render(
        <TrendsCard {...defaultProps} />,
      );

      const activityIndicator = container.queryAll(n => n.type === 'ActivityIndicator')[0];
      expect(activityIndicator).toBeTruthy();
    });

    it('shows empty state when neither series has data', async () => {
      const emptyData = generateMonthlyData().map(item => ({ ...item, total: 0 }));

      useMonthlyTrendSeries.mockReturnValue({
        monthlyData: emptyData,
        loading: false,
        loadData: jest.fn(),
      });

      const { getByText, queryByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      expect(getByText('no_trend_data')).toBeTruthy();
      expect(queryByTestId('trend-chart-canvas')).toBeFalsy();
    });

    it('waits for both series before deciding the card is empty', async () => {
      // Regression: an expense-only ledger resolved the primary (all income) to
      // zeros first, so the empty state flashed up until the vs query landed.
      const emptyData = generateMonthlyData().map(item => ({ ...item, total: 0 }));
      useMonthlyTrendSeries
        .mockReturnValueOnce({ monthlyData: emptyData, loading: false, loadData: jest.fn() })
        .mockReturnValueOnce({ monthlyData: [], loading: true, loadData: jest.fn() });

      const { container, queryByText } = await render(
        <TrendsCard {...defaultProps} />,
      );

      expect(queryByText('no_trend_data')).toBeFalsy();
      expect(container.queryAll(n => n.type === 'ActivityIndicator')[0]).toBeTruthy();
    });

    it('still draws the chart when only the comparison series has data', async () => {
      // An empty income series next to a full expense one is still worth
      // drawing — the empty half is the answer, not a reason to hide the chart.
      const emptyData = generateMonthlyData().map(item => ({ ...item, total: 0 }));
      useMonthlyTrendSeries
        .mockReturnValueOnce({ monthlyData: emptyData, loading: false, loadData: jest.fn() })
        .mockReturnValueOnce({ monthlyData: defaultMonthlyData, loading: false, loadData: jest.fn() });

      const { getByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      expect(getByTestId('trend-chart-canvas')).toBeTruthy();
    });

    it('renders null when there are no categories on either side', async () => {
      const { toJSON } = await render(
        <TrendsCard {...defaultProps} categories={[]} />,
      );

      expect(toJSON()).toBeNull();
    });

    it('renders with only income categories', async () => {
      const { getByText } = await render(
        <TrendsCard
          {...defaultProps}
          categories={[{ id: 'cat-salary', name: 'Salary', type: 'entry', parentId: null, categoryType: 'income', isShadow: false }]}
        />,
      );

      expect(getByText('TRENDS')).toBeTruthy();
    });
  });

  describe('Series Selection', () => {
    it('opens the picker on the side of the ledger the series is already on', async () => {
      const { getByTestId, queryByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      // Primary defaults to income, so the picker opens showing income.
      await fireEvent.press(getByTestId('trend-primary-selector'));

      expect(getByTestId('trend-category-option-cat-salary')).toBeTruthy();
      expect(queryByTestId('trend-category-option-cat-food')).toBeFalsy();
    });

    it('switches the picker between expenses and income', async () => {
      const { getByTestId, queryByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      await fireEvent.press(getByTestId('trend-primary-selector'));
      expect(queryByTestId('trend-category-option-cat-transport')).toBeFalsy();

      await fireEvent.press(getByTestId('trend-type-expense'));

      expect(getByTestId('trend-category-option-cat-transport')).toBeTruthy();
      expect(queryByTestId('trend-category-option-cat-salary')).toBeFalsy();
    });

    it('reports a category pick together with the side it came from', async () => {
      const onSeriesChange = jest.fn();

      const { getByTestId } = await render(
        <TrendsCard {...defaultProps} onSeriesChange={onSeriesChange} />,
      );

      await fireEvent.press(getByTestId('trend-primary-selector'));
      await fireEvent.press(getByTestId('trend-type-expense'));
      await fireEvent.press(getByTestId('trend-category-option-cat-transport'));

      expect(onSeriesChange).toHaveBeenCalledWith({ type: 'expense', categoryId: 'cat-transport' });
    });

    it('offers the whole side of the ledger as its own row', async () => {
      const onSeriesChange = jest.fn();

      const { getByTestId } = await render(
        <TrendsCard {...defaultProps} onSeriesChange={onSeriesChange} />,
      );

      await fireEvent.press(getByTestId('trend-primary-selector'));
      await fireEvent.press(getByTestId('trend-type-expense'));
      await fireEvent.press(getByTestId('trend-all-categories'));

      expect(onSeriesChange).toHaveBeenCalledWith({ type: 'expense', categoryId: 'all' });
    });

    it('shows the picked category name on the selector', async () => {
      const { getByText } = await render(
        <TrendsCard
          {...defaultProps}
          selectedSeries={{ type: 'expense', categoryId: 'cat-food' }}
        />,
      );

      expect(getByText('Food')).toBeTruthy();
    });

    it('falls back to the whole side when the picked category no longer exists', async () => {
      const { getAllByText, queryByText } = await render(
        <TrendsCard
          {...defaultProps}
          selectedSeries={{ type: 'expense', categoryId: 'deleted-category' }}
        />,
      );

      // Primary and vs are both "all expenses" now — a stale id must not leave
      // the card asking for a category that no longer exists.
      expect(getAllByText('all_expenses').length).toBe(2);
      expect(queryByText('all_income')).toBeNull();
    });

    it('leaves a folder behind when the picker switches sides', async () => {
      // Regression: the grid keeps its own breadcrumb, so a picker left standing
      // inside an expense folder listed none of the income categories it had
      // just been handed — and its stale chips still committed a pick.
      const { getByTestId, queryByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      await fireEvent.press(getByTestId('trend-primary-selector'));
      await fireEvent.press(getByTestId('trend-type-expense'));
      // Drill into Food, which holds Groceries
      await fireEvent.press(getByTestId('trend-category-option-cat-food'));
      expect(getByTestId('trend-category-option-cat-groceries')).toBeTruthy();

      await fireEvent.press(getByTestId('trend-type-income'));

      expect(getByTestId('trend-category-option-cat-salary')).toBeTruthy();
      expect(queryByTestId('trend-category-option-cat-groceries')).toBeFalsy();
      expect(queryByTestId('trend-category-option-whole-cat-food')).toBeFalsy();
    });

    it('never offers a shadow category', async () => {
      const { getByTestId, queryByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      await fireEvent.press(getByTestId('trend-primary-selector'));
      await fireEvent.press(getByTestId('trend-type-expense'));

      expect(queryByTestId('trend-category-option-cat-shadow')).toBeFalsy();
    });
  });

  describe('Hook Integration', () => {
    it('asks for each series by category and by side of the ledger', async () => {
      await render(
        <TrendsCard {...defaultProps} selectedCurrency="EUR" />,
      );

      expect(useMonthlyTrendSeries).toHaveBeenCalledWith('EUR', 'all', false, 'income');
      expect(useMonthlyTrendSeries).toHaveBeenCalledWith('EUR', 'all', false, 'expense');
    });

    it('passes a picked category through to the primary series', async () => {
      await render(
        <TrendsCard
          {...defaultProps}
          selectedSeries={{ type: 'expense', categoryId: 'cat-transport' }}
        />,
      );

      expect(useMonthlyTrendSeries).toHaveBeenCalledWith('USD', 'cat-transport', false, 'expense');
    });

    it('asks for no comparison series once the vs is cleared', async () => {
      const { getByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      await fireEvent.press(getByTestId('trend-vs-clear'));

      expect(useMonthlyTrendSeries).toHaveBeenCalledWith('USD', null, false, 'expense');
    });

    it('forwards the convert-currencies setting', async () => {
      await render(
        <TrendsCard {...defaultProps} convertAllCurrencies />,
      );

      expect(useMonthlyTrendSeries).toHaveBeenCalledWith('USD', 'all', true, 'income');
    });
  });

  describe('VS Series Comparison', () => {
    it('shows both totals, one per series', async () => {
      const { queryAllByText } = await render(
        <TrendsCard {...defaultProps} />,
      );

      // Both series return the same mock data, so both read $200.00.
      expect(queryAllByText('$200.00').length).toBe(2);
    });

    it('keeps both figures in text ink and lets the dots carry the series', async () => {
      // Regression: the two totals used to be painted in their series colours,
      // which made the number itself the colour-only cue.
      const { queryAllByText } = await render(
        <TrendsCard {...defaultProps} />,
      );

      const amounts = queryAllByText('$200.00');
      expect(amounts.length).toBe(2);
      amounts.forEach((node) => {
        const style = Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style) : node.props.style;
        expect(style.color).toBe(defaultColors.text);
      });
    });

    it('drops back to a single series when the vs is cleared', async () => {
      const { getByTestId, queryAllByText, queryByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      await fireEvent.press(getByTestId('trend-vs-clear'));

      expect(queryAllByText('$200.00').length).toBe(1);
      expect(queryByTestId('trend-vs-clear')).toBeFalsy();
    });

    it('picks a new comparison series without touching the primary one', async () => {
      const onSeriesChange = jest.fn();

      const { getByTestId, getByText } = await render(
        <TrendsCard {...defaultProps} onSeriesChange={onSeriesChange} />,
      );

      await fireEvent.press(getByTestId('trend-vs-selector'));
      await fireEvent.press(getByTestId('trend-category-option-cat-transport'));

      expect(onSeriesChange).not.toHaveBeenCalled();
      expect(getByText('Transport')).toBeTruthy();
      expect(useMonthlyTrendSeries).toHaveBeenCalledWith('USD', 'cat-transport', false, 'expense');
    });

    it('does not show the totals when hideBalances is true', async () => {
      const { useDisplaySettings } = require('../../../app/contexts/DisplaySettingsContext');
      useDisplaySettings.mockReturnValue({ hideBalances: true });

      const { queryAllByText } = await render(
        <TrendsCard {...defaultProps} />,
      );

      expect(queryAllByText('$200.00').length).toBe(0);

      useDisplaySettings.mockReturnValue({ hideBalances: false });
    });
  });

  describe('Series colours', () => {
    const LEDGER_GREEN = '#4a8a4a';
    const LEDGER_RED = '#d93025';

    const barGroupColors = (getAllByTestId) =>
      getAllByTestId('vn-bar-group-bar').map((node) => node.props.color);

    it('paints income green and expenses red when the two sides are compared', async () => {
      const { getAllByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      // Default pair is All income (primary) vs All expenses (vs).
      const [primaryColor, vsSeriesColor] = barGroupColors(getAllByTestId);
      expect(primaryColor).toBe(LEDGER_GREEN);
      expect(vsSeriesColor).toBe(LEDGER_RED);
    });

    it('follows the sides round when the primary is the expense series', async () => {
      const { getByTestId, getAllByTestId } = await render(
        <TrendsCard
          {...defaultProps}
          selectedSeries={{ type: 'expense', categoryId: 'all' }}
        />,
      );

      // Primary is expenses now; make the comparison an income category.
      await fireEvent.press(getByTestId('trend-vs-selector'));
      await fireEvent.press(getByTestId('trend-type-income'));
      await fireEvent.press(getByTestId('trend-category-option-cat-salary'));

      const [primaryColor, vsSeriesColor] = barGroupColors(getAllByTestId);
      expect(primaryColor).toBe(LEDGER_RED);
      expect(vsSeriesColor).toBe(LEDGER_GREEN);
    });

    it('keeps the neutral pair when both series are on the same side', async () => {
      const { getByTestId, getAllByTestId } = await render(
        <TrendsCard
          {...defaultProps}
          selectedSeries={{ type: 'expense', categoryId: 'all' }}
        />,
      );

      // Two expense series: red/green would assert a meaning the chart does not
      // carry, so the categorical pair stays.
      await fireEvent.press(getByTestId('trend-vs-selector'));
      await fireEvent.press(getByTestId('trend-category-option-cat-transport'));

      const colours = barGroupColors(getAllByTestId);
      expect(colours).not.toContain(LEDGER_GREEN);
      expect(colours).not.toContain(LEDGER_RED);
      expect(colours[0]).toBe(defaultColors.primary);
    });

    it('carries the ledger pair into stacked mode', async () => {
      const { getByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      await fireEvent.press(getByTestId('stacked-bar-toggle-btn'));

      expect(getByTestId('vn-stacked-bar').props.colors).toEqual([LEDGER_GREEN, LEDGER_RED]);
    });

    it('gives the header dots the same colours as the bars', async () => {
      const { container } = await render(
        <TrendsCard {...defaultProps} />,
      );

      const dotColours = container
        .queryAll(n => n.type === 'View')
        .map(n => (Array.isArray(n.props.style) ? Object.assign({}, ...n.props.style) : n.props.style))
        .filter(style => style && style.width === 8 && style.height === 8)
        .map(style => style.backgroundColor);

      expect(dotColours).toContain(LEDGER_GREEN);
      expect(dotColours).toContain(LEDGER_RED);
    });
  });

  describe('Stacked Bar Toggle', () => {
    it('is offered as soon as there are two series', async () => {
      const { getByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      expect(getByTestId('stacked-bar-toggle-btn')).toBeTruthy();
    });

    it('is not offered for a single series', async () => {
      const { getByTestId, queryByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      await fireEvent.press(getByTestId('trend-vs-clear'));

      expect(queryByTestId('stacked-bar-toggle-btn')).toBeFalsy();
    });

    it('switches to chart-bar icon after toggling to stacked mode', async () => {
      const { getByTestId, container } = await render(
        <TrendsCard {...defaultProps} />,
      );

      await fireEvent.press(getByTestId('stacked-bar-toggle-btn'));

      const icons = container.queryAll(n => n.type === 'Icon');
      expect(icons.find(i => i.props.name === 'chart-bar')).toBeTruthy();
      expect(icons.find(i => i.props.name === 'chart-bar-stacked')).toBeFalsy();
    });

    it('pressing toggle again returns to side-by-side mode', async () => {
      const { getByTestId, container } = await render(
        <TrendsCard {...defaultProps} />,
      );

      await fireEvent.press(getByTestId('stacked-bar-toggle-btn'));
      await fireEvent.press(getByTestId('stacked-bar-toggle-btn'));

      const icons = container.queryAll(n => n.type === 'Icon');
      expect(icons.find(i => i.props.name === 'chart-bar-stacked')).toBeTruthy();
    });

    it('clearing the vs series resets stacked mode', async () => {
      const { getByTestId, container } = await render(
        <TrendsCard {...defaultProps} />,
      );

      await fireEvent.press(getByTestId('stacked-bar-toggle-btn'));
      await fireEvent.press(getByTestId('trend-vs-clear'));

      // Re-pick a comparison series
      await fireEvent.press(getByTestId('trend-vs-selector'));
      await fireEvent.press(getByTestId('trend-category-option-cat-transport'));

      const icons = container.queryAll(n => n.type === 'Icon');
      expect(icons.find(i => i.props.name === 'chart-bar-stacked')).toBeTruthy();
    });

    it('swaps the grouped series for a stacked one in stacked mode', async () => {
      const { getByTestId, queryByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

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

  describe('Currency Formatting', () => {
    it('formats current month amount with currency symbol for USD', async () => {
      const { getAllByText } = await render(
        <TrendsCard {...defaultProps} />,
      );

      // Last month total is 200, USD symbol is $
      expect(getAllByText('$200.00').length).toBeGreaterThan(0);
    });

    it('formats current month amount with currency symbol for JPY (0 decimals)', async () => {
      const jpyData = generateMonthlyData().map((item, i) =>
        i === 11 ? { ...item, total: 5000 } : item,
      );
      useMonthlyTrendSeries.mockReturnValue({
        monthlyData: jpyData,
        loading: false,
        loadData: jest.fn(),
      });

      const { getAllByText } = await render(
        <TrendsCard {...defaultProps} selectedCurrency="JPY" />,
      );

      expect(getAllByText('¥5000').length).toBeGreaterThan(0);
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
        <TrendsCard {...defaultProps} colors={customColors} />,
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
    it('displays the trends title uppercased', async () => {
      const { getByText } = await render(
        <TrendsCard {...defaultProps} />,
      );

      expect(getByText('TRENDS')).toBeTruthy();
    });

    it('displays this_month label for current month', async () => {
      const { getByText } = await render(
        <TrendsCard {...defaultProps} />,
      );

      expect(getByText('this_month')).toBeTruthy();
    });
  });

  describe('Horizontal scrolling', () => {
    it('scrolls the months and pins the scale beside them', async () => {
      const { getByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      // The scale lives on its own canvas outside the scroller, so it stays
      // readable however far back the months are scrolled.
      expect(getByTestId('trend-chart-axis')).toBeTruthy();
      expect(getByTestId('trend-chart-scroll').props.horizontal).toBe(true);
    });

    it('replays the opening scroll on both content size and layout', async () => {
      // Whichever of the two lands last is the one that can actually move the
      // scroller, so both have to be wired up.
      const { getByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      const scroller = getByTestId('trend-chart-scroll');
      expect(scroller.props.onContentSizeChange).toEqual(expect.any(Function));
      expect(scroller.props.onLayout).toEqual(expect.any(Function));

      await fireEvent(scroller, 'layout', { nativeEvent: { layout: { width: 300, height: 116 } } });
      await fireEvent(scroller, 'contentSizeChange', 900, 116);
    });

    it('lays the months out wider than the card so the newest one fits', async () => {
      const { getByTestId } = await render(
        <TrendsCard {...defaultProps} />,
      );

      const canvas = getByTestId('trend-chart-canvas');
      const style = Array.isArray(canvas.props.style)
        ? Object.assign({}, ...canvas.props.style)
        : canvas.props.style;

      // 12 months at the default 36px pitch, or the viewport when that is wider
      // — a phone gets the scrolling layout, a tablet-width card still fills.
      const { width: screenWidth } = require('react-native').Dimensions.get('window');
      const viewport = screenWidth - 64 - 34;
      expect(style.width).toBeCloseTo(Math.max(12 * 36, viewport), 5);
    });
  });

  describe('Regression Tests', () => {
    // Guards the resting default only — the reaction that used to override it at
    // mount is stubbed out here, and is covered by `resolveTapIndex` above.
    it('defaults the selection to the current month, not the oldest of the 12', async () => {
      const { getAllByText, queryByText } = await render(
        <TrendsCard {...defaultProps} />,
      );

      // Last entry of the 12-month window is the current month; its total is 200.
      expect(getAllByText('$200.00').length).toBeGreaterThan(0);
      expect(queryByText('this_month')).toBeTruthy();
      // The oldest month's total (100) must not be what the card is showing.
      expect(queryByText('$100.00')).toBeNull();
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

  // The tap gesture's callback is a worklet under the gesture-handler mock, so
  // the hit test is only reachable through its exported helper.
  describe('resolveTapIndex', () => {
    const PITCH = 48;
    const COUNT = 12;

    it('maps a tap to the month whose slot it landed in', () => {
      expect(resolveTapIndex(0, PITCH, COUNT)).toBe(0);
      expect(resolveTapIndex(47, PITCH, COUNT)).toBe(0);
      expect(resolveTapIndex(48, PITCH, COUNT)).toBe(1);
      expect(resolveTapIndex(263, PITCH, COUNT)).toBe(5);
    });

    it('reaches the newest month at the far edge of the content', () => {
      // Regression: the newest month used to sit half a bar off the canvas, so
      // the right-hand end of the content had to be reachable.
      expect(resolveTapIndex(PITCH * COUNT - 1, PITCH, COUNT)).toBe(COUNT - 1);
    });

    it('drops taps that fall outside the plotted months', () => {
      expect(resolveTapIndex(-1, PITCH, COUNT)).toBe(-1);
      expect(resolveTapIndex(PITCH * COUNT, PITCH, COUNT)).toBe(-1);
    });

    it('drops taps when there is nothing laid out yet', () => {
      expect(resolveTapIndex(10, 0, COUNT)).toBe(-1);
      expect(resolveTapIndex(10, PITCH, 0)).toBe(-1);
    });
  });

  describe('resolveScrollTarget', () => {
    it('opens on the current month by parking at the far right', () => {
      // Regression: the card used to squeeze twelve months into one screen; now
      // that they scroll, opening at offset 0 would show the oldest month.
      expect(resolveScrollTarget({ mode: 'end' }, 576, 296)).toBe(280);
    });

    it('has nowhere to go when the months already fit', () => {
      expect(resolveScrollTarget({ mode: 'end' }, 296, 296)).toBe(0);
    });

    it('keeps a zoom anchor inside the scrollable range', () => {
      expect(resolveScrollTarget({ mode: 'x', x: 120 }, 576, 296)).toBe(120);
      expect(resolveScrollTarget({ mode: 'x', x: -40 }, 576, 296)).toBe(0);
      expect(resolveScrollTarget({ mode: 'x', x: 9999 }, 576, 296)).toBe(280);
    });

    it('waits for the content to be measured', () => {
      expect(resolveScrollTarget({ mode: 'end' }, 0, 296)).toBeNull();
      expect(resolveScrollTarget(null, 576, 296)).toBeNull();
    });
  });
});
