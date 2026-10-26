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
  describeForecastRow,
  formatMonthEnd,
} from '../../app/widgets/BalanceForecastWidget';
import { GRAPHS_DEEP_LINK } from '../../app/widgets/widgetConstants';
import { lightTheme, darkTheme } from '../../app/contexts/ThemeColorsContext';

// The real palettes: the widget reads them directly (it has no provider above
// it), and jest.setup.js mocks this module down to the hook alone.
jest.mock('../../app/contexts/ThemeColorsContext', () => jest.requireActual('../../app/contexts/ThemeColorsContext'));

const CARD = { id: '1', name: 'Everyday card', currency: 'USD', balance: 2480.5, forecast: 1312.4, dailyAverage: 233.62 };
const TRAVEL = { id: '3', name: 'Travel', currency: 'RUB', balance: 18500, forecast: -2300, dailyAverage: 4160 };
const READY = { status: 'ready', language: 'en', hideBalances: false, monthEnd: '2026-10-31', rows: [CARD, TRAVEL] };

const render = (model, { theme = 'light', width = 300, height = 180 } = {}) => buildWidgetTree(
  <BalanceForecastWidget model={{ language: 'en', ...model }} theme={theme} width={width} height={height} />,
);

// Every node of a given type, depth first.
const nodesOf = (tree, type, found = []) => {
  if (tree.type === type) found.push(tree);
  (tree.children || []).forEach((child) => nodesOf(child, type, found));
  return found;
};
const textsOf = (tree) => nodesOf(tree, 'TextWidget').map((node) => node.props.text);
const textNode = (tree, text) => nodesOf(tree, 'TextWidget').find((node) => node.props.text === text);

describe('BalanceForecastWidget', () => {
  describe('ready', () => {
    it('lists each account with its forecast, balance now and daily rate under the month’s end', () => {
      const tree = render(READY);

      expect(textsOf(tree)).toEqual([
        'Forecast to Oct 31',
        'Everyday card', '$1,312.40', 'now $2,480.50 · -$233.62/day',
        'Travel', '-₽2,300', 'now ₽18,500 · -₽4,160/day',
      ]);
    });

    it('puts the accounts in a list the launcher scrolls, below the title', () => {
      const tree = render(READY, { height: 180 });
      const [list] = nodesOf(tree, 'ListWidget');

      expect(list.children).toHaveLength(2);
      // The card's height less its padding and the title row.
      expect(list.props.height).toBe(180 - 2 * 12 - 20);
    });

    it('never makes the list shorter than one row', () => {
      const [list] = nodesOf(render(READY, { height: 40 }), 'ListWidget');
      expect(list.props.height).toBe(48);
    });

    it('opens the Graphs tab from the card and from every row', () => {
      const tree = render(READY);
      expect(tree.props.clickAction).toBe('OPEN_URI');
      expect(tree.props.clickActionData).toEqual({ uri: GRAPHS_DEEP_LINK });
      // List items are drawn apart from the card, so each carries the tap.
      nodesOf(tree, 'ListWidget')[0].children.forEach((item) => {
        expect(item.props.clickAction).toBe('OPEN_URI');
        expect(item.props.clickActionData).toEqual({ uri: GRAPHS_DEEP_LINK });
      });
    });

    it('marks a forecast below zero in the destructive colour', () => {
      const tree = render(READY);
      expect(textNode(tree, '-₽2,300').props.color).toBe(lightTheme.colors.destructive);
      expect(textNode(tree, '$1,312.40').props.color).toBe(lightTheme.colors.text);
    });

    it('draws in the dark palette for the dark theme', () => {
      const tree = render(READY, { theme: 'dark' });
      expect(tree.props.backgroundColor).toBe(darkTheme.colors.surface);
      expect(textNode(tree, 'Everyday card').props.color).toBe(darkTheme.colors.text);
    });

    it('labels each row for screen readers', () => {
      const [list] = nodesOf(render(READY), 'ListWidget');
      expect(list.children[0].props.accessibilityLabel).toBe('Everyday card: $1,312.40, now $2,480.50 · -$233.62/day');
    });

    it('masks every amount while balances are hidden', () => {
      const tree = render({ ...READY, hideBalances: true });
      expect(textsOf(tree)).toEqual(['Forecast to Oct 31', 'Everyday card', '••••', 'Travel', '••••']);
    });

    it('speaks the app’s language', () => {
      const tree = render({ ...READY, language: 'ru', rows: [CARD] });
      const texts = textsOf(tree);
      expect(texts[0]).toMatch(/^Прогноз на 31/);
      expect(texts[3]).toMatch(/^сейчас .+\/день$/);
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
    it('gives an account with no readable spending no forecast, not a flat one', () => {
      const view = describeForecastRow({ ...CARD, forecast: null, dailyAverage: null }, { language: 'en' });
      expect(view).toEqual({
        name: 'Everyday card',
        forecast: '—',
        detail: 'now $2,480.50',
        negative: false,
        label: 'Everyday card: —, now $2,480.50',
      });
    });

    it('prints a rate of no spending without a sign', () => {
      const view = describeForecastRow({ ...CARD, forecast: 2480.5, dailyAverage: 0 }, { language: 'en' });
      expect(view.detail).toBe('now $2,480.50 · $0.00/day');
    });

    it('prints neither a minus nor a warning for amounts that round to zero', () => {
      // 9 RUB over 30 days: 0.3 a day, in a currency without minor units.
      const view = describeForecastRow(
        { ...TRAVEL, balance: 1000, forecast: -0.3, dailyAverage: 0.3 },
        { language: 'en' },
      );
      expect(view.forecast).toBe('₽0');
      expect(view.negative).toBe(false);
      expect(view.detail).toBe('now ₽1,000 · ₽0/day');
    });

    it('rounds to the currency’s own decimals', () => {
      const view = describeForecastRow({ ...TRAVEL, forecast: 1234.56 }, { language: 'en' });
      expect(view.forecast).toBe('₽1,235');
    });
  });

  describe('formatMonthEnd', () => {
    it('prints the day and month in the app’s language', () => {
      expect(formatMonthEnd('2026-10-31', 'en')).toBe('Oct 31');
      expect(formatMonthEnd('2026-02-28', 'de')).toMatch(/28/);
    });
  });
});
