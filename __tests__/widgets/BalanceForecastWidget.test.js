/**
 * The balance-forecast home-screen widget's layout. Built with the widget
 * library's own tree builder, the same call the launcher path makes, so a
 * component it cannot turn into RemoteViews (a hook, an unsupported style, a
 * ListWidget where one is not allowed) fails here rather than on a phone.
 */

import React from 'react';
import { buildWidgetTree } from 'react-native-android-widget/lib/commonjs/api/build-widget-tree';
import {
  BalanceForecastWidget,
  columnHeaders,
  columnWidths,
  describeForecastRow,
  estimateTextWidth,
  formatMonthEnd,
  layoutTable,
} from '../../app/widgets/BalanceForecastWidget';
import { GRAPHS_DEEP_LINK } from '../../app/widgets/widgetConstants';
import { lightTheme, darkTheme } from '../../app/contexts/ThemeColorsContext';

// The real palettes: the widget reads them directly (it has no provider above
// it), and jest.setup.js mocks this module down to the hook alone.
jest.mock('../../app/contexts/ThemeColorsContext', () => jest.requireActual('../../app/contexts/ThemeColorsContext'));

const CARD = { id: '1', name: 'Everyday card', currency: 'USD', balance: 2480.5, forecast: 1312.4, dailyAverage: 233.62 };
const TRAVEL = { id: '3', name: 'Travel', currency: 'RUB', balance: 18500, forecast: -2300, dailyAverage: 4160 };
const READY = {
  status: 'ready',
  language: 'en',
  hideBalances: false,
  monthEnd: '2026-10-31',
  columns: ['balance', 'daily', 'forecast'],
  rows: [CARD, TRAVEL],
};

const render = (model, { theme = 'light', width = 300, height = 110, fontScale } = {}) => buildWidgetTree(
  <BalanceForecastWidget
    model={{ language: 'en', ...model }}
    theme={theme}
    width={width}
    height={height}
    fontScale={fontScale}
  />,
);

// Every node of a given type, depth first.
const nodesOf = (tree, type, found = []) => {
  if (tree.type === type) found.push(tree);
  (tree.children || []).forEach((child) => nodesOf(child, type, found));
  return found;
};
const textsOf = (tree) => nodesOf(tree, 'TextWidget').map((node) => node.props.text);
const textNode = (tree, text) => nodesOf(tree, 'TextWidget').find((node) => node.props.text === text);
const listOf = (tree) => nodesOf(tree, 'ListWidget')[0];

describe('BalanceForecastWidget', () => {
  describe('ready', () => {
    it('draws a table: column headers, then one line per account', () => {
      const tree = render(READY);

      expect(textsOf(tree)).toEqual([
        'Now', 'Per day', 'Oct 31',
        'Everyday card', '$2,480.50', '-$233.62', '$1,312.40',
        'Travel', '₽18,500', '-₽4,160', '-₽2,300',
      ]);
    });

    it('fits two accounts with every column in a widget two cells tall, without scrolling', () => {
      // About 110 dp is what a launcher shows two cells as; the table sits at
      // the top, so the bottom the launcher may clip holds nothing.
      const tree = render(READY, { height: 110 });
      const [header] = tree.children;
      const rows = listOf(tree).children;

      const used = 12 + header.props.height + header.props.margin.bottom
        + rows.reduce((sum, row) => sum + row.props.height, 0);
      expect(rows).toHaveLength(2);
      expect(used).toBeLessThanOrEqual(110 - 12);
      expect(listOf(tree).props.height).toBeGreaterThanOrEqual(2 * rows[0].props.height);
    });

    it('lines each column up under its header', () => {
      const tree = render(READY);
      const widthsOf = (row) => nodesOf(row, 'TextWidget').slice(-3).map((node) => node.props.width);
      const [header] = tree.children;
      const rows = listOf(tree).children;

      expect(widthsOf(rows[0])).toEqual(widthsOf(header));
      expect(widthsOf(rows[1])).toEqual(widthsOf(header));
      nodesOf(header, 'TextWidget').forEach((node) => {
        expect(node.props.textAlign).toBe('right');
        expect(node.props.adjustsFontSizeToFit).toBe(true);
      });
    });

    it('draws only the columns picked, in the table’s own order', () => {
      const tree = render({ ...READY, columns: ['forecast', 'balance'] });
      expect(textsOf(tree)).toEqual([
        'Now', 'Oct 31',
        'Everyday card', '$2,480.50', '$1,312.40',
        'Travel', '₽18,500', '-₽2,300',
      ]);
    });

    it.each([
      ['none were saved', undefined],
      ['an empty list was', []],
    ])('draws every column when %s', (_label, columns) => {
      expect(textsOf(render({ ...READY, columns }))).toHaveLength(11);
    });

    it('drops the rate, then the balance now, on a widget too narrow for every column', () => {
      expect(textsOf(render(READY, { width: 230 })).slice(0, 2)).toEqual(['Now', 'Oct 31']);
      expect(textsOf(render(READY, { width: 160 }))[0]).toBe('Oct 31');
    });

    it('takes a launcher that has not reported a width for four cells', () => {
      const tree = render(READY, { width: 0 });
      const [header] = tree.children;
      expect(nodesOf(header, 'TextWidget').every((node) => node.props.width > 30)).toBe(true);
    });

    it('grows its lines with the system font scale', () => {
      const tree = render(READY, { fontScale: 1.5, height: 200 });
      const [header] = tree.children;
      const [row] = listOf(tree).children;
      expect(header.props.height).toBe(27);
      expect(row.props.height).toBe(36);
      expect(nodesOf(row, 'TextWidget').every((node) => node.props.height === 36)).toBe(true);
    });

    it('ends the list on a whole line, short of the reported bottom', () => {
      // 140 dp reported: 140 - 24 padding - 18 header - 4 gap = 94, three lines of 24.
      expect(listOf(render(READY, { height: 140 })).props.height).toBe(72);
    });

    it('never makes the list shorter than one line', () => {
      const tree = render(READY, { height: 30 });
      expect(listOf(tree).props.height).toBe(listOf(tree).children[0].props.height);
    });

    it('opens the Graphs tab from the card and from every line', () => {
      const tree = render(READY);
      expect(tree.props.clickAction).toBe('OPEN_URI');
      expect(tree.props.clickActionData).toEqual({ uri: GRAPHS_DEEP_LINK });
      // List items are drawn apart from the card, so each carries the tap.
      listOf(tree).children.forEach((item) => {
        expect(item.props.clickAction).toBe('OPEN_URI');
        expect(item.props.clickActionData).toEqual({ uri: GRAPHS_DEEP_LINK });
      });
    });

    it('marks a forecast below zero in the destructive colour, the rate in muted text', () => {
      const tree = render(READY);
      expect(textNode(tree, '-₽2,300').props.color).toBe(lightTheme.colors.destructive);
      expect(textNode(tree, '$1,312.40').props.color).toBe(lightTheme.colors.text);
      expect(textNode(tree, '-$233.62').props.color).toBe(lightTheme.colors.mutedText);
    });

    it('draws in the dark palette for the dark theme', () => {
      const tree = render(READY, { theme: 'dark' });
      expect(tree.props.backgroundColor).toBe(darkTheme.colors.surface);
      expect(textNode(tree, 'Everyday card').props.color).toBe(darkTheme.colors.text);
    });

    it('labels each line for screen readers with its headers', () => {
      const tree = render(READY);
      expect(listOf(tree).children[0].props.accessibilityLabel)
        .toBe('Everyday card, Now $2,480.50, Per day -$233.62, Oct 31 $1,312.40');
      expect(tree.props.accessibilityLabel).toBe('Forecast to Oct 31');
    });

    it('masks every amount while balances are hidden, and reads out the name alone', () => {
      const tree = render({ ...READY, hideBalances: true, rows: [CARD] });
      expect(textsOf(tree)).toEqual(['Now', 'Per day', 'Oct 31', 'Everyday card', '••••', '••••', '••••']);
      expect(listOf(tree).children[0].props.accessibilityLabel).toBe('Everyday card');
    });

    it('speaks the app’s language', () => {
      const texts = textsOf(render({ ...READY, language: 'ru', rows: [CARD] }));
      expect(texts[0]).toBe('Сейчас');
      expect(texts[1]).toBe('В день');
      expect(texts[2]).toMatch(/^31/);
    });
  });

  describe('not ready', () => {
    it('says there is nothing to forecast', () => {
      const tree = render({ status: 'empty' });
      expect(textsOf(tree)).toEqual(['No accounts to show: add one in Penny, or reconfigure the widget']);
      expect(nodesOf(tree, 'ListWidget')).toHaveLength(0);
      expect(tree.props.clickActionData).toEqual({ uri: GRAPHS_DEEP_LINK });
    });

    it('says the accounts could not be read', () => {
      expect(textsOf(render({ status: 'error' }))).toEqual(['Could not load your accounts']);
    });
  });

  describe('describeForecastRow', () => {
    it('gives an account with no readable spending no rate or forecast, not flat ones', () => {
      expect(describeForecastRow({ ...CARD, forecast: null, dailyAverage: null }, { language: 'en' })).toEqual({
        name: 'Everyday card',
        balance: '$2,480.50',
        daily: '—',
        forecast: '—',
        negative: false,
      });
    });

    it('prints a rate of no spending without a sign', () => {
      expect(describeForecastRow({ ...CARD, forecast: 2480.5, dailyAverage: 0 }, { language: 'en' }).daily)
        .toBe('$0.00');
    });

    it('prints neither a minus nor a warning for amounts that round to zero', () => {
      // 9 RUB over 30 days: 0.3 a day, in a currency without minor units.
      const view = describeForecastRow(
        { ...TRAVEL, balance: 1000, forecast: -0.3, dailyAverage: 0.3 },
        { language: 'en' },
      );
      expect(view.forecast).toBe('₽0');
      expect(view.daily).toBe('₽0');
      expect(view.negative).toBe(false);
    });

    it('rounds to the currency’s own decimals', () => {
      expect(describeForecastRow({ ...TRAVEL, forecast: 1234.56 }, { language: 'en' }).forecast).toBe('₽1,235');
    });
  });

  describe('columnWidths', () => {
    const views = [CARD, TRAVEL].map((row) => describeForecastRow(row, { language: 'en' }));
    const columns = ['balance', 'daily', 'forecast'];
    const headers = columnHeaders(columns, 'en', '2026-10-31');

    it('makes each column as wide as its widest text', () => {
      const widths = columnWidths(columns, headers, views, 400);
      expect(widths[0]).toBe(Math.ceil(estimateTextWidth('$2,480.50', 14)));
      expect(widths[2]).toBe(Math.ceil(estimateTextWidth('$1,312.40', 14, true)));
    });

    it('narrows the columns in proportion to leave the names their room', () => {
      const natural = columnWidths(columns, headers, views, 1000);
      const narrow = columnWidths(columns, headers, views, 250);
      const total = narrow.reduce((sum, width) => sum + width, 0);
      // 56 dp for the names and 8 dp before each column.
      expect(total).toBeLessThanOrEqual(250 - 56 - 3 * 8);
      expect(narrow[0] / natural[0]).toBeCloseTo(narrow[2] / natural[2], 1);
    });

    it('never narrows them past three quarters, so the figures stay legible', () => {
      const natural = columnWidths(columns, headers, views, 1000);
      columnWidths(columns, headers, views, 100).forEach((width, i) => {
        expect(width).toBe(Math.floor(natural[i] * 0.75));
      });
    });

    it('widens them with the font scale', () => {
      const natural = columnWidths(columns, headers, views, 1000);
      const scaled = columnWidths(columns, headers, views, 1000, 1.3);
      expect(scaled[0]).toBe(Math.ceil(1.3 * estimateTextWidth('$2,480.50', 14)));
      expect(scaled[0]).toBeGreaterThan(natural[0]);
    });

    it('leaves the user’s two-account case room for the names on four cells', () => {
      // The figures from the widget this was built for: AMD, a whole-unit
      // currency, on a widget about 300 dp wide.
      const amd = [
        { name: 'Ameria общий', currency: 'AMD', balance: 91600, forecast: 11733, dailyAverage: 15973 },
        { name: 'Ameria personal', currency: 'AMD', balance: 75900, forecast: 75900, dailyAverage: 0 },
      ].map((row) => describeForecastRow(row, { language: 'ru' }));
      const widths = columnWidths(columns, columnHeaders(columns, 'ru', '2026-10-31'), amd, 300 - 24);
      const nameRoom = 276 - widths.reduce((sum, width) => sum + width, 0) - 3 * 8;
      expect(nameRoom).toBeGreaterThanOrEqual(56);
    });
  });

  describe('layoutTable', () => {
    const views = [CARD, TRAVEL].map((row) => describeForecastRow(row, { language: 'en' }));
    const where = { language: 'en', monthEnd: '2026-10-31' };

    it('keeps every column given when there is room', () => {
      expect(layoutTable(['balance', 'daily', 'forecast'], views, { ...where, available: 276 }).columns)
        .toEqual(['balance', 'daily', 'forecast']);
    });

    it('drops what does not fit, the rate first and the forecast never', () => {
      expect(layoutTable(['balance', 'daily', 'forecast'], views, { ...where, available: 206 }).columns)
        .toEqual(['balance', 'forecast']);
      expect(layoutTable(['balance', 'daily', 'forecast'], views, { ...where, available: 40 }).columns)
        .toEqual(['forecast']);
      expect(layoutTable(['daily', 'balance'], views, { ...where, available: 40 }).columns).toEqual(['balance']);
    });

    it('gives the headers of the columns it keeps', () => {
      expect(layoutTable(['forecast'], views, { ...where, available: 276 }).headers).toEqual(['Oct 31']);
    });
  });

  describe('estimateTextWidth', () => {
    it('counts digits narrower than letters, and bold wider', () => {
      expect(estimateTextWidth('0000', 10)).toBeLessThan(estimateTextWidth('MMMM', 10));
      expect(estimateTextWidth('123', 14, true)).toBeGreaterThan(estimateTextWidth('123', 14));
    });

    it('counts CJK and Hangul a full em wide', () => {
      expect(estimateTextWidth('10月31日', 10)).toBeCloseTo(4 * 0.57 * 10 + 2 * 10);
      expect(estimateTextWidth('하루당', 10)).toBe(30);
    });
  });

  describe('formatMonthEnd', () => {
    it('prints the day and month in the app’s language', () => {
      expect(formatMonthEnd('2026-10-31', 'en')).toBe('Oct 31');
      expect(formatMonthEnd('2026-02-28', 'de')).toMatch(/28/);
    });
  });
});
